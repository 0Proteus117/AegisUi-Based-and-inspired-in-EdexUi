#!/usr/bin/env node
"use strict";

// Opt-in, read-only acceptance. Reads only the explicitly selected canonical
// case and its managed PDFs. Never initializes/migrates the original store,
// reads a vault, invokes a provider, approves work or prints source text/paths.
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const {DatabaseSync}=require("node:sqlite");
const {StudStoragePaths}=require("../src/classes/workspaces/studStoragePaths.class.js");
const LIMITS=Object.freeze({documents:32,pdfBytes:40*1024*1024,chunksPerDocument:2000});
const hash=value=>crypto.createHash("sha256").update(value).digest("hex");
function fail(code){throw Object.assign(new Error(code),{code});}
function inspectCase({sourceDb,courseCode,assignmentMatch}){
    if(typeof sourceDb!=="string"||!path.isAbsolute(sourceDb)||typeof courseCode!=="string"||!courseCode.trim()||courseCode.length>120||typeof assignmentMatch!=="string"||!assignmentMatch.trim()||assignmentMatch.length>160)fail("INVALID_ACCEPTANCE_INPUT");
    const db=new DatabaseSync(sourceDb,{readOnly:true});
    try{
        // Keep canonical rows in one read transaction while files are inspected.
        // External file mutation is checked separately; SQLite cannot snapshot it.
        db.exec("PRAGMA query_only=ON; BEGIN");
        const cases=db.prepare(`SELECT a.id FROM stud_assignments a JOIN stud_courses c ON c.id=a.course_id
            WHERE (c.code=? OR instr(lower(c.title),lower(?))>0)
            AND (instr(lower(a.title),lower(?))>0 OR instr(lower(a.description),lower(?))>0)
            AND a.archived_at IS NULL AND EXISTS(SELECT 1 FROM stud_academic_documents d WHERE d.assignment_id=a.id AND d.archived_at IS NULL) LIMIT 2`).all(courseCode,courseCode,assignmentMatch,assignmentMatch);
        if(cases.length!==1)fail("CASE_SELECTION_AMBIGUOUS_OR_MISSING");
        const documents=db.prepare("SELECT * FROM stud_academic_documents WHERE assignment_id=? AND archived_at IS NULL ORDER BY id LIMIT ?").all(cases[0].id,LIMITS.documents+1);
        if(documents.length>LIMITS.documents)fail("CASE_DOCUMENT_BOUND_REACHED");
        const paths=new StudStoragePaths({localRoot:path.dirname(sourceDb)}),results=[];
        for(const doc of documents){
            const result={ordinal:results.length+1,available:false,bytesMatch:false,hashMatch:false,pdfHeader:false,managedProvenance:false,extractionStatus:doc.extraction_status,chunkCount:0,chunkHashesValid:false,chunkLocationsValid:false};
            try{
                const asset=db.prepare("SELECT * FROM stud_storage_assets WHERE reference=?").get(doc.managed_reference);
                let profile={kind:"LOCAL"};
                if(asset){
                    const raw=db.prepare("SELECT * FROM stud_storage_profiles WHERE id=?").get(asset.active_profile_id);
                    if(!raw)fail("STORAGE_PROFILE_MISSING");
                    profile={id:raw.id,kind:raw.kind,mountHint:raw.mount_hint,relativeRoot:raw.relative_root,volumeUuid:raw.volume_uuid,identityNonce:raw.identity_nonce};
                    if(asset.sha256!==doc.checksum||asset.byte_size!==doc.byte_size)fail("STORAGE_METADATA_MISMATCH");
                }
                const file=paths.file(profile,doc.managed_reference);
                // Recheck through a non-following descriptor; paths.file also
                // enforces managed namespaces, safe directories and volume ID.
                const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
                try{
                    const stat=fs.fstatSync(fd);
                    if(!stat.isFile()||stat.nlink!==1||stat.size<5||stat.size>LIMITS.pdfBytes)fail("INVALID_MANAGED_PDF");
                    const digest=crypto.createHash("sha256"),buffer=Buffer.alloc(64*1024);
                    let size=0,header="";
                    for(;;){
                        const read=fs.readSync(fd,buffer,0,Math.min(buffer.length,LIMITS.pdfBytes-size+1),null);
                        if(!read)break;
                        if(size===0)header=buffer.subarray(0,Math.min(read,5)).toString("ascii");
                        size+=read;if(size>LIMITS.pdfBytes)fail("INVALID_MANAGED_PDF");
                        digest.update(buffer.subarray(0,read));
                    }
                    const after=fs.fstatSync(fd);
                    if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs)fail("MANAGED_FILE_CHANGED_DURING_INSPECTION");
                    result.available=true;result.bytesMatch=size===doc.byte_size;
                    result.hashMatch=digest.digest("hex")===doc.checksum;result.pdfHeader=header==="%PDF-";
                }finally{fs.closeSync(fd);}
                result.managedProvenance=!!db.prepare("SELECT 1 FROM stud_provenance_records WHERE entity_type='ACADEMIC_DOCUMENT' AND entity_id=? AND field='managedReference' AND observed_value=? LIMIT 1").get(doc.id,doc.checksum);
                const extraction=db.prepare("SELECT * FROM stud_document_extractions WHERE document_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(doc.id);
                if(extraction){
                    const chunks=db.prepare("SELECT * FROM stud_document_chunks WHERE extraction_id=? ORDER BY ordinal LIMIT ?").all(extraction.id,LIMITS.chunksPerDocument+1);
                    if(chunks.length>LIMITS.chunksPerDocument)fail("CHUNK_BOUND_REACHED");
                    result.chunkCount=chunks.length;
                    result.chunkHashesValid=chunks.length>0&&chunks.every(chunk=>hash(chunk.content)===chunk.content_hash);
                    result.chunkLocationsValid=chunks.length>0&&chunks.every(chunk=>Number.isInteger(chunk.page_start)&&Number.isInteger(chunk.page_end)&&chunk.page_start>=1&&chunk.page_end>=chunk.page_start&&chunk.page_end<=extraction.page_count);
                }
            }catch(error){result.errorCode=/^[A-Z_0-9]{1,80}$/.test(error.code||"")?error.code:"MANAGED_INSPECTION_FAILED";}
            result.passed=["available","bytesMatch","hashMatch","pdfHeader","managedProvenance","chunkHashesValid","chunkLocationsValid"].every(key=>result[key]===true)&&!result.errorCode;
            results.push(result);
        }
        const integrity=db.prepare("PRAGMA quick_check").get().quick_check==="ok",foreignKeys=db.prepare("PRAGMA foreign_key_check").all().length===0;
        return {status:integrity&&foreignKeys&&results.every(row=>row.passed)?"PASS":"PARTIAL",readOnly:true,integrity,foreignKeys,documents:results,limits:LIMITS,providersInvoked:false,modelsInvoked:false,academicReviewClaimed:false,scope:"Managed file integrity and stored extraction identity only; not fresh PDF extraction or human academic review"};
    }finally{db.close();}
}
if(require.main===module){
    try{
        const args={};for(const arg of process.argv.slice(2)){const split=arg.indexOf("="),key=arg.slice(0,split);if(split<0||!["--source-db","--course-code","--assignment-match"].includes(key)||key in args)fail("INVALID_ACCEPTANCE_INPUT");args[key]=arg.slice(split+1);}
        const report=inspectCase({sourceDb:args["--source-db"],courseCode:args["--course-code"],assignmentMatch:args["--assignment-match"]});console.log(JSON.stringify(report,null,2));if(report.status!=="PASS")process.exitCode=1;
    }catch(error){console.error(/^[A-Z_0-9]{1,80}$/.test(error.code||"")?error.code:"MANAGED_CASE_VALIDATION_FAILED");process.exitCode=1;}
}
module.exports={inspectCase,LIMITS};

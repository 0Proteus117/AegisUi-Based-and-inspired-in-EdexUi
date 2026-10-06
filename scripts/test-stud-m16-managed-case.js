#!/usr/bin/env node
"use strict";
// Controlled bytes and extraction rows: this tests read-only integrity checking,
// not PDF parsing. Never reads the user's database or managed material.
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {DatabaseSync}=require("node:sqlite");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {inspectCase,LIMITS}=require("./validate-stud-m16-managed-case.js");
const sha=value=>crypto.createHash("sha256").update(value).digest("hex");
let passed=0;
function fixture(test){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"stud-managed-acceptance-"));
    const store=new StudAcademicStore({root}).initialize();
    try{
        const course=store.createEntity("COURSE",{title:"Synthetic course",code:"SYN101"});
        const assignment=store.createEntity("ASSIGNMENT",{title:"Synthetic acceptance",courseId:course.id});
        const bytes=Buffer.from("%PDF-1.7\nSynthetic bounded bytes, not a parser fixture.\n"),checksum=sha(bytes);
        const reference=`documents/synthetic_${checksum.slice(0,16)}.pdf`,file=path.join(root,reference);
        fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
        const {document}=store.saveAcademicDocument({reference,displayName:"Synthetic.pdf",mimeType:"application/pdf",size:bytes.length,sha256:checksum},{assignmentId:assignment.id});
        const content="Synthetic source statement.";
        store.persistDocumentExtraction(document.id,{status:"READY",engine:"PDFJS_BUILT_IN",pageCount:1,pages:[{pageNumber:1,text:content,textHash:sha(content)}],chunks:[{pageStart:1,pageEnd:1,chunkType:"TEXT",content,contentHash:sha(content)}],references:[],warnings:[]});
        const args={sourceDb:path.join(root,"academic.sqlite"),courseCode:"SYN101",assignmentMatch:"acceptance"};
        test({root,store,course,assignment,document,bytes,file,reference,args,inspect:()=>inspectCase(args)});
    }finally{store.close();fs.rmSync(root,{recursive:true,force:true});}
}
function check(label,fn){fixture(fn);passed++;console.log(`PASS ${label}`);}
check("valid canonical bytes and exact chunk hashes pass",({inspect})=>{
    const report=inspect();assert.equal(report.status,"PASS");assert.equal(report.documents[0].chunkCount,1);
    assert.equal(report.academicReviewClaimed,false);assert.equal(report.providersInvoked,false);assert.equal(report.modelsInvoked,false);
});
check("inspection preserves database, files and restart state",({store,args,file,inspect})=>{
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");const before=sha(fs.readFileSync(args.sourceDb)),pdf=sha(fs.readFileSync(file));
    const first=inspect();assert.deepEqual(inspect(),first);
    assert.equal(sha(fs.readFileSync(args.sourceDb)),before);assert.equal(sha(fs.readFileSync(file)),pdf);
    const reopened=new DatabaseSync(args.sourceDb,{readOnly:true});try{assert.equal(reopened.prepare("SELECT count(*) n FROM stud_requirement_contracts").get().n,0);}finally{reopened.close();}
});
check("same-size tampering fails hash integrity",({file,bytes,inspect})=>{
    const changed=Buffer.from(bytes);changed[12]^=1;fs.writeFileSync(file,changed);
    const report=inspect();assert.equal(report.status,"PARTIAL");assert.equal(report.documents[0].bytesMatch,true);assert.equal(report.documents[0].hashMatch,false);
});
check("missing managed file fails closed",({file,inspect})=>{fs.unlinkSync(file);assert.equal(inspect().status,"PARTIAL");});
check("oversized file is rejected before hashing",({file,inspect})=>{
    fs.truncateSync(file,LIMITS.pdfBytes+1);const row=inspect().documents[0];assert.equal(row.errorCode,"INVALID_MANAGED_PDF");assert.equal(row.available,false);
});
check("registered local assets resolve through canonical storage metadata",({store,reference,bytes,inspect})=>{
    store.db.prepare("INSERT INTO stud_storage_assets(reference,active_profile_id,sha256,byte_size,created_at,updated_at) VALUES(?,'stud_storage_local',?,?,datetime('now'),datetime('now'))").run(reference,sha(bytes),bytes.length);
    assert.equal(inspect().status,"PASS");
    store.db.prepare("UPDATE stud_storage_assets SET sha256=? WHERE reference=?").run("0".repeat(64),reference);
    assert.equal(inspect().documents[0].errorCode,"STORAGE_METADATA_MISMATCH");
});
check("missing active storage profile never falls back to local file",({store,reference,bytes,inspect})=>{
    store.db.exec("PRAGMA foreign_keys=OFF");
    store.db.prepare("INSERT INTO stud_storage_assets(reference,active_profile_id,sha256,byte_size,created_at,updated_at) VALUES(?,'missing',?,?,datetime('now'),datetime('now'))").run(reference,sha(bytes),bytes.length);
    const report=inspect();assert.equal(report.documents[0].errorCode,"STORAGE_PROFILE_MISSING");assert.equal(report.foreignKeys,false);
});
check("symlink and hardlink managed files are rejected",({root,file,inspect})=>{
    const target=path.join(root,"synthetic-target.pdf");fs.renameSync(file,target);fs.symlinkSync(target,file);assert.equal(inspect().status,"PARTIAL");
    fs.unlinkSync(file);fs.linkSync(target,file);assert.equal(inspect().status,"PARTIAL");
});
check("traversal is not a managed document reference",({store,document,inspect})=>{
    store.db.prepare("UPDATE stud_academic_documents SET managed_reference='../synthetic.pdf' WHERE id=?").run(document.id);assert.equal(inspect().status,"PARTIAL");
});
check("missing canonical provenance fails integrity",({store,document,inspect})=>{
    store.db.prepare("DELETE FROM stud_provenance_records WHERE entity_id=?").run(document.id);assert.equal(inspect().documents[0].managedProvenance,false);
});
check("corrupt chunk text and impossible page ranges are detected",({store,inspect})=>{
    store.db.exec("UPDATE stud_document_chunks SET content='Changed',page_end=2");const row=inspect().documents[0];
    assert.equal(row.chunkHashesValid,false);assert.equal(row.chunkLocationsValid,false);assert.equal(row.passed,false);
});
check("OCR/no extraction cannot be reported as verified chunks",({store,inspect})=>{
    store.db.exec("DELETE FROM stud_document_chunks; UPDATE stud_academic_documents SET extraction_status='OCR_REQUIRED'");
    const report=inspect();assert.equal(report.status,"PARTIAL");assert.equal(report.documents[0].chunkCount,0);
});
check("ambiguous or missing case is rejected without selecting arbitrarily",({store,course,args,inspect})=>{
    assert.throws(()=>inspectCase({...args,assignmentMatch:"not present"}),{code:"CASE_SELECTION_AMBIGUOUS_OR_MISSING"});
    const other=store.createEntity("ASSIGNMENT",{title:"Another acceptance",courseId:course.id});
    store.createEntity("ACADEMIC_DOCUMENT",{title:"Other synthetic",assignmentId:other.id});
    assert.throws(inspect,{code:"CASE_SELECTION_AMBIGUOUS_OR_MISSING"});
});
check("input and document bounds reject excessive scope",({store,assignment,args,inspect})=>{
    assert.throws(()=>inspectCase({...args,sourceDb:"relative.sqlite"}),{code:"INVALID_ACCEPTANCE_INPUT"});
    assert.throws(()=>inspectCase({...args,courseCode:"x".repeat(121)}),{code:"INVALID_ACCEPTANCE_INPUT"});
    for(let i=0;i<LIMITS.documents;i++)store.createEntity("ACADEMIC_DOCUMENT",{title:`Synthetic ${i}`,assignmentId:assignment.id});
    assert.throws(inspect,{code:"CASE_DOCUMENT_BOUND_REACHED"});
});
check("report excludes canonical IDs, text, file paths and file hashes",({root,document,reference,bytes,inspect})=>{
    const serialized=JSON.stringify(inspect());for(const privateValue of [root,document.id,reference,sha(bytes),"Synthetic source statement."])assert.ok(!serialized.includes(privateValue));
});
console.log(`RESULT ${passed} passed / 0 failed / 0 skipped`);

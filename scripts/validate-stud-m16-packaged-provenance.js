#!/usr/bin/env node
"use strict";

// Run with the mounted app's executable and ELECTRON_RUN_AS_NODE=1. This tests
// the actual packaged modules/native SQLite/PDF.js, not development imports.
const assert=require("assert"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const asar=process.argv[2],pdf=process.argv[3],root=process.argv[4];
assert(asar&&/^\/Volumes\/AegisUi[^/]*\/AegisUi\.app\/Contents\/Resources\/app\.asar$/.test(asar));
assert(process.versions.electron&&process.execPath.startsWith(path.dirname(path.dirname(asar))+path.sep));
assert(root&&path.basename(root).startsWith("m16-packaged-provenance-")&&!fs.existsSync(root));
assert(pdf&&path.isAbsolute(pdf));
const load=name=>require(path.join(asar,"classes/workspaces",name+".class.js"));
const {StudAcademicStore}=load("studAcademicStore");
const {StudDocumentRuntime}=load("studDocumentRuntime");
const {StudClaimEvidenceService}=load("studClaimEvidenceService");
const {StudWorkingContextService}=load("studWorkingContextService");

function evidenceService(store){
    return new StudClaimEvidenceService({store,workingContextService:new StudWorkingContextService({store})});
}

async function main(){
    fs.mkdirSync(root,{recursive:false,mode:0o700});
    let store=new StudAcademicStore({root}).initialize(),runtime;
    const warnings=[],log=console.log,warn=console.warn;
    try{
        const bytes=fs.readFileSync(pdf),hash=crypto.createHash("sha256").update(bytes).digest("hex");
        const assignment=store.createEntity("ASSIGNMENT",{title:"Synthetic packaged exact provenance"});
        const document=store.saveAcademicDocument({reference:"documents/synthetic.pdf",displayName:"synthetic.pdf",mimeType:"application/pdf",size:bytes.length,sha256:hash},{title:"Synthetic packaged PDF",documentType:"COURSE_MATERIAL",assignmentId:assignment.id}).document;
        runtime=new StudDocumentRuntime({readManagedPdf:reference=>{assert.equal(reference,"documents/synthetic.pdf");return {bytesBase64:bytes.toString("base64")};}});
        console.log=(...args)=>{warnings.push(args.join(" "));log(...args);};
        console.warn=(...args)=>{warnings.push(args.join(" "));warn(...args);};
        const extracted=await runtime.analyze({document:{managedReference:"documents/synthetic.pdf"},requestId:"m16-packaged-pdf"});
        console.log=log;console.warn=warn;
        assert.equal(extracted.status,"READY");assert.equal(extracted.networkUsed,false);
        assert(extracted.chunks.some(chunk=>chunk.content.includes("Synthetic academic PDF")));
        assert(!warnings.some(line=>/Unable to load font data/.test(line)));
        const saved=store.persistDocumentExtraction(document.id,extracted);
        const chunk=store.db.prepare("SELECT id FROM stud_document_chunks WHERE extraction_id=? LIMIT 1").get(saved.extractionId);
        // Use the production ownership boundary. Omitting Working Context makes
        // every source fail closed; never bypass that check for acceptance.
        let claims=evidenceService(store);
        const unrelated=store.createEntity("ASSIGNMENT",{title:"Unrelated synthetic assignment"});
        assert.throws(()=>claims.createEvidence({assignmentId:unrelated.id,sourceObjectType:"ACADEMIC_DOCUMENT",sourceObjectId:document.id,locator:{chunkId:chunk.id}}),e=>e.code==="CONTEXT_RELATION_REQUIRED");
        const evidence=claims.createEvidence({assignmentId:assignment.id,sourceObjectType:"ACADEMIC_DOCUMENT",sourceObjectId:document.id,locator:{chunkId:chunk.id}});
        assert.throws(()=>claims.updateEvidence({assignmentId:assignment.id,evidenceId:evidence.id,expectedVersion:evidence.rowVersion,locator:{extractionId:saved.extractionId,pageStart:1,pageEnd:10}}),e=>e.code==="INVALID_PROVENANCE");
        const updated=claims.updateEvidence({assignmentId:assignment.id,evidenceId:evidence.id,expectedVersion:evidence.rowVersion,locator:{extractionId:saved.extractionId,pageStart:1}});
        assert.equal(updated.chunkId,null);assert.equal(updated.locationType,"DOCUMENT_PAGE");
        assert.equal(updated.extractionId,saved.extractionId);assert.notEqual(updated.sourceSnapshotHash,evidence.sourceSnapshotHash);
        const reviewed=claims.reviewEvidence({assignmentId:assignment.id,evidenceId:evidence.id,expectedVersion:updated.rowVersion});
        assert.throws(()=>claims.updateEvidence({assignmentId:assignment.id,evidenceId:evidence.id,expectedVersion:reviewed.rowVersion,locator:{chunkId:chunk.id}}),e=>e.code==="REVIEWED_EVIDENCE_IMMUTABLE");
        store.close();store=new StudAcademicStore({root}).initialize();claims=evidenceService(store);
        const restored=claims.evidence({assignmentId:assignment.id,evidenceId:evidence.id});
        assert.equal(restored.evidenceHash,reviewed.evidenceHash);assert.equal(restored.freshness.state,"CURRENT");
        assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(),[]);
        console.log(JSON.stringify({status:"PASS",packagedModules:true,packagedElectron:process.versions.electron,schema:store.schemaInfo().version,realPdfJs:true,bundledStandardFonts:true,crossAssignmentRejected:true,locatorMutation:true,invalidRangeRejected:true,reviewImmutable:true,exactProvenanceAfterRestart:true,networkUsed:false,scope:"Packaged main-process modules; fixture bytes supplied explicitly, not a native file-picker test"}));
    }finally{console.log=log;console.warn=warn;runtime?.dispose();store.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

#!/usr/bin/env node
"use strict";
// Synthetic regression for the opt-in private acceptance harness. No private
// database, managed files, credentials, provider or model are consulted.
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService}=require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkingContextService}=require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudWorkflowService}=require("../src/classes/workspaces/studWorkflowService.class.js");
const {StudExecutionRepository}=require("../src/classes/workspaces/studExecutionRepository.class.js");
const {exerciseBranches}=require("./validate-stud-m16-private-intake.js");
const sha=value=>crypto.createHash("sha256").update(value).digest("hex");
function open(root){
    const store=new StudAcademicStore({root}).initialize(),requirements=new StudRequirementsContractService({store});
    const context=new StudWorkingContextService({store,requirementsService:requirements});
    return {store,requirements,workflow:new StudWorkflowService({store,requirementsService:requirements,workingContextService:context})};
}
async function main(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"stud-m16-branches-"));let env=open(root),passed=0;
    const check=(label,fn)=>{fn();passed++;console.log(`PASS ${label}`);};
    try{
        const assignment=env.store.createEntity("ASSIGNMENT",{title:"Synthetic independent branch acceptance"});
        const document=env.store.createEntity("ACADEMIC_DOCUMENT",{title:"Synthetic brief",documentType:"COURSE_MATERIAL",assignmentId:assignment.id});
        const content="Confirm the actual project inputs with the team. Example geometry is illustrative, not a supplied measurement.";
        const extraction=()=>({status:"READY",engine:"PDFJS_BUILT_IN",pageCount:1,pages:[{pageNumber:1,text:content,textHash:sha(content)}],chunks:[{pageStart:1,pageEnd:1,chunkType:"TEXT",content,contentHash:sha(content)}],references:[],warnings:[]});
        // Controlled extraction fixture, not a claim of parsing a PDF in this test.
        env.store.persistDocumentExtraction(document.id,extraction());
        env.store.persistDocumentExtraction(document.id,extraction());
        const draft=env.requirements.createDraft(assignment.id);
        const flow=env.workflow.create({assignmentId:assignment.id,templateKey:"GENERIC_MANUAL",allowNoContract:true,noContractReason:"Synthetic test: unreviewed requirements remain unapproved."});
        const nodesBefore=flow.graph.nodes.length;
        for(const term of ["tiny","unmatched inspected phrase", "x".repeat(161)])await assert.rejects(()=>exerciseBranches(env.store,env.requirements,assignment.id,env.workflow,flow,term));
        check("invalid or unmatched evidence never mutates the workflow",()=>assert.equal(env.workflow.read({workflowId:flow.id}).graph.nodes.length,nodesBefore));
        const result=await exerciseBranches(env.store,env.requirements,assignment.id,env.workflow,flow,"Confirm the actual project inputs");
        check("only current extraction is used despite historical duplicate text",()=>{
            const chunk=env.store.db.prepare("SELECT c.extraction_id FROM stud_document_chunks c WHERE c.id=?").get(result.identity.chunkId);
            const latest=env.store.db.prepare("SELECT id FROM stud_document_extractions WHERE document_id=? ORDER BY created_at DESC,id DESC LIMIT 1").get(document.id);
            assert.equal(chunk.extraction_id,latest.id);
        });
        check("independent check completes without fabricating academic analysis",()=>{assert.equal(result.status.independentDeterministicCheck,"COMPLETED");assert.equal(result.status.academicCalculationPerformed,false);assert.equal(result.status.modelInvoked,false);});
        check("human and data-dependent stages do not execute",()=>{assert.equal(result.status.humanCheckpoint,"WAITING_HUMAN");assert.equal(result.status.inputDependentBranch,"PENDING");assert.equal(result.status.dependentAttempts,0);});
        env.store.close();env=open(root);
        const restored=new StudExecutionRepository(env.store).hydrate(result.identity.planId);
        check("restart preserves exact stage outcomes",()=>assert.deepEqual(result.identity.nodeIds.map(id=>restored.steps.find(step=>step.workflowNodeId===id).state),["COMPLETED","WAITING_HUMAN","PENDING"]));
        check("restart preserves blocker and no dependent attempts",()=>{
            assert.equal(env.workflow.read({workflowId:flow.id}).graph.nodes.find(node=>node.id===result.identity.nodeIds[2]).availability,"DIRECT_BLOCKER");
            assert.equal(restored.steps.find(step=>step.workflowNodeId===result.identity.nodeIds[2]).attemptCount,0);
        });
        check("exact note provenance and unapproved draft survive restart",()=>{
            assert.equal(env.store.listProvenance("NOTE",result.identity.noteId,"document.quote")[0].metadata.chunkId,result.identity.chunkId);
            assert.equal(env.store.db.prepare("SELECT lifecycle FROM stud_requirement_contracts WHERE id=?").get(draft.id).lifecycle,"DRAFT");
            assert.equal(env.store.db.prepare("SELECT count(*) n FROM stud_requirement_contracts WHERE lifecycle='APPROVED'").get().n,0);
        });
        check("SQLite integrity and foreign keys remain valid",()=>{assert.equal(env.store.db.prepare("PRAGMA quick_check").get().quick_check,"ok");assert.deepEqual(env.store.db.prepare("PRAGMA foreign_key_check").all(),[]);});
        console.log(`RESULT ${passed} passed / 0 failed / 0 skipped`);
    }finally{env.store.close();fs.rmSync(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

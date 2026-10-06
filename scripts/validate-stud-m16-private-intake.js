#!/usr/bin/env node
"use strict";

// Opt-in local acceptance only. The original database is opened read-only and
// all mutations occur in a new private snapshot OUTSIDE the repository. Never
// copy credentials, provider configuration, managed PDFs or browser sessions.
const assert=require("assert"),fs=require("fs"),path=require("path");
const {DatabaseSync,backup}=require("node:sqlite");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService}=require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkflowService}=require("../src/classes/workspaces/studWorkflowService.class.js");
const {StudWorkingContextService}=require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudArtifactOperationsService}=require("../src/classes/workspaces/studArtifactOperationsService.class.js");
const {StudRunCoordinator}=require("../src/classes/workspaces/studRunCoordinator.class.js");

async function exerciseBranches(store,requirements,assignmentId,workflow,flow,term){
    // The operator supplies a phrase from previously inspected private material.
    // This locates evidence, not a heuristic declaration that team data is absent.
    assert(term&&term.length>=8&&term.length<=160,"An inspected evidence phrase is required");
    const matches=store.db.prepare(`SELECT d.id document_id,c.* FROM stud_academic_documents d
        JOIN stud_document_extractions x ON x.document_id=d.id JOIN stud_document_chunks c ON c.extraction_id=x.id
        WHERE d.assignment_id=? AND d.archived_at IS NULL AND instr(lower(c.content),lower(?))>0
        AND x.id=(SELECT id FROM stud_document_extractions WHERE document_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1)
        LIMIT 2`).all(assignmentId,term);
    assert.equal(matches.length,1,"Evidence phrase must resolve to exactly one current chunk");
    const chunk=matches[0],note=store.createDocumentNote({documentId:chunk.document_id,chunkId:chunk.id,title:"Acceptance source excerpt — input confirmation"});
    const provenance=store.listProvenance("NOTE",note.id,"document.quote")[0];
    assert.equal(provenance.metadata.chunkId,chunk.id);
    const nodes=[];
    for(const [title,semanticType] of [["Check saved academic context","REVIEW"],["Confirm project and team inputs","HUMAN_TASK"],["Review parameter-dependent calculations","REVIEW"]]){
        flow=workflow.addNode({workflowId:flow.id,expectedWorkflowVersion:flow.rowVersion,node:{title,semanticType}});
        nodes.push(flow.graph.nodes.find(node=>node.title===title));
    }
    flow=workflow.addEdge({workflowId:flow.id,fromNodeId:nodes[1].id,toNodeId:nodes[2].id,expectedWorkflowVersion:flow.rowVersion});
    flow=workflow.createCheckpoint({workflowId:flow.id,nodeId:nodes[1].id,title:"Confirm actual project inputs",instructions:"Private acceptance has not confirmed project scenario, team allocation or parameter values. Do not infer them from examples in the brief.",requiredDecision:"Confirm project selection and identify the real input dataset",relatedEntityType:"NOTE",relatedEntityId:note.id,provenanceId:provenance.id,expectedWorkflowVersion:flow.rowVersion});
    flow=workflow.createBlocker({workflowId:flow.id,nodeId:nodes[2].id,blockerType:"WAITING_DATA",title:"Project geometry and calculation inputs require confirmation",reason:"These inputs have not been confirmed for this acceptance run. This is not a claim that they do not exist elsewhere.",requiredInput:"Confirmed project geometry, team allocation and calculation inputs; no generated substitute",relatedEntityType:"NOTE",relatedEntityId:note.id,provenanceId:provenance.id,expectedWorkflowVersion:flow.rowVersion});
    const artifacts=new StudArtifactOperationsService({store,workflowService:workflow});
    const coordinator=new StudRunCoordinator({store,workflowService:workflow,artifactOperationsService:artifacts,requirementsService:requirements,assistantRuntime:{client(){throw Error("Private acceptance must not invoke a model/provider");}}});
    try{
        const profile=coordinator.saveProfile({name:"Private bounded deterministic acceptance",maxLightTasks:1,maxNetworkTasks:0,maxModelTasks:1,minAvailableMemoryBytes:268435456,maxModelContext:8192,pauseOnBattery:false,pauseOnMemoryPressure:false,keepAwake:false,timeoutMs:60000,maxRetries:0});
        const plan=coordinator.createPlan({assignmentId,workflowId:flow.id,scope:"SELECTED_STAGES",selectedNodeIds:nodes.map(n=>n.id),resourceProfileId:profile.id}).plan;
        await coordinator.launch({assignmentId,planId:plan.id,expectedVersion:plan.rowVersion,confirmLaunch:true});
        const final=await coordinator.waitForIdle(plan.id);
        assert.equal(final.steps.find(step=>step.workflowNodeId===nodes[0].id).state,"COMPLETED");
        assert.equal(final.steps.find(step=>step.workflowNodeId===nodes[1].id).state,"WAITING_HUMAN");
        const dependent=final.steps.find(step=>step.workflowNodeId===nodes[2].id);
        assert.equal(dependent.state,"PENDING");
        assert.equal(dependent.attemptCount,0);
        assert.equal(workflow.read({workflowId:flow.id}).graph.nodes.find(node=>node.id===nodes[2].id).availability,"DIRECT_BLOCKER");
        assert(store.getAcademicContextPackage(store.createAcademicContextPackage("ASSIGNMENT",assignmentId,{}).id));
        return {identity:{planId:plan.id,nodeIds:nodes.map(node=>node.id),noteId:note.id,chunkId:chunk.id},status:{independentDeterministicCheck:"COMPLETED",humanCheckpoint:"WAITING_HUMAN",inputDependentBranch:"PENDING",inputDependentAvailability:"DIRECT_BLOCKER",dependentAttempts:0,exactChunkProvenance:true,contractApproved:false,academicCalculationPerformed:false,modelInvoked:false}};
    }finally{coordinator.dispose();}
}

async function main(){
    const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
        const at=arg.indexOf("=");if(at<0)throw Error("Explicit named parameters required");
        return [arg.slice(0,at),arg.slice(at+1)];
    }));
    const source=args["--source-db"],courseCode=args["--course-code"],match=args["--assignment-match"],root=args["--output-root"];
    if(!source||!courseCode||!match||!root||!path.isAbsolute(source)||!path.isAbsolute(root)||!path.basename(root).startsWith("m16-private-"))throw Error("Explicit source, course, assignment match and new private output directory required");
    if(fs.existsSync(root))throw Error("Private snapshot destination must not exist");
    const parent=fs.realpathSync(path.dirname(root)),repo=fs.realpathSync(path.join(__dirname,".."));
    if(parent===repo||parent.startsWith(repo+path.sep))throw Error("Private evidence must remain outside Git");
    let original,store;
    try{
        original=new DatabaseSync(source,{readOnly:true});
        const candidates=original.prepare(`SELECT a.id, count(d.id) documents
            FROM stud_assignments a JOIN stud_courses c ON c.id=a.course_id
            JOIN stud_academic_documents d ON d.assignment_id=a.id AND d.archived_at IS NULL
            WHERE (c.code=? OR c.title LIKE ?) AND (a.title LIKE ? OR a.description LIKE ?)
            AND a.archived_at IS NULL GROUP BY a.id`).all(courseCode,`%${courseCode}%`,`%${match}%`,`%${match}%`);
        assert.equal(candidates.length,1,"The selected private assignment must be unambiguous and have linked documents");
        const assignmentId=candidates[0].id;
        fs.mkdirSync(root,{mode:0o700});
        await backup(original,path.join(root,"academic.sqlite"));
        fs.chmodSync(path.join(root,"academic.sqlite"),0o600);
        original.close();original=null;
        store=new StudAcademicStore({root}).initialize();
        assert.equal(store.schemaInfo().version,28);
        const documents=store.db.prepare("SELECT extraction_status, count(*) n FROM stud_academic_documents WHERE assignment_id=? AND archived_at IS NULL GROUP BY extraction_status").all(assignmentId);
        const requirements=new StudRequirementsContractService({store});
        const draft=requirements.createDraft(assignmentId);
        assert.equal(draft.lifecycle,"DRAFT");
        assert.equal(store.db.prepare("SELECT count(*) n FROM stud_requirement_contracts WHERE assignment_id=? AND lifecycle='APPROVED'").get(assignmentId).n,0);
        const pkg=store.createAcademicContextPackage("ASSIGNMENT",assignmentId,{});
        assert(pkg.snapshot.chunks.length>0,"Private context must contain actual stored document chunks");
        const context=new StudWorkingContextService({store,requirementsService:requirements});
        const workflow=new StudWorkflowService({store,requirementsService:requirements,workingContextService:context});
        const flow=workflow.create({assignmentId,templateKey:"GENERIC_MANUAL",allowNoContract:true,noContractReason:"Private local acceptance snapshot only: the actual Requirements Contract remains an unreviewed draft. No institutional or academic approval is implied."});
        assert.equal(flow.contractId,null);
        const branches=args["--evidence-term"]?await exerciseBranches(store,requirements,assignmentId,workflow,flow,args["--evidence-term"]):null;
        const report={status:"PARTIAL_PRIVATE_INTAKE",schema:28,originalReadOnly:true,isolatedSnapshot:true,branches:branches?.status||null,
            linkedDocuments:candidates[0].documents,documentStates:documents,
            requirementDraft:{lifecycle:draft.lifecycle,candidates:draft.candidates.length,approved:false,
                coverage:draft.coverage?{linkedDocuments:draft.coverage.linkedDocuments,inspectedDocuments:draft.coverage.inspectedDocuments,chunksInspected:draft.coverage.chunksInspected,ocrRequiredDocuments:draft.coverage.ocrRequiredDocuments,truncationReached:draft.coverage.truncationReached}:null},
            context:{chunks:pkg.snapshot.chunks.length,candidates:pkg.snapshot.candidates.length},
            workflow:{created:true,contractApproved:false},
            providersInvoked:false,modelsInvoked:false,managedFilesCopied:false,
            limitations:["No human review or contract approval claimed","Managed file bytes are not validated by this database-only snapshot",branches?"Actual project/team inputs remain unconfirmed; independent execution and explicit gates were verified":"Private input gates and independent execution branches have not been exercised","Not final academic acceptance or submission"]};
        assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(),[]);
        store.close();store=new StudAcademicStore({root}).initialize();
        assert(store.getAcademicContextPackage(pkg.id));
        assert.equal(store.db.prepare("SELECT lifecycle FROM stud_requirement_contracts WHERE id=?").get(draft.id).lifecycle,"DRAFT");
        if(branches){
            const {StudExecutionRepository}=require("../src/classes/workspaces/studExecutionRepository.class.js");
            const persisted=new StudExecutionRepository(store).hydrate(branches.identity.planId);
            for(const [index,state] of ["COMPLETED","WAITING_HUMAN","PENDING"].entries())
                assert.equal(persisted.steps.find(step=>step.workflowNodeId===branches.identity.nodeIds[index]).state,state);
            assert.equal(persisted.steps.find(step=>step.workflowNodeId===branches.identity.nodeIds[2]).attemptCount,0);
            const reopenedWorkflow=new StudWorkflowService({store,requirementsService:new StudRequirementsContractService({store})});
            assert.equal(reopenedWorkflow.read({workflowId:flow.id}).graph.nodes.find(node=>node.id===branches.identity.nodeIds[2]).availability,"DIRECT_BLOCKER");
            assert.equal(store.listProvenance("NOTE",branches.identity.noteId,"document.quote")[0].metadata.chunkId,branches.identity.chunkId);
            report.branches.restartPersistence=true;
        }
        report.restartPersistence=true;
        fs.writeFileSync(path.join(root,"private-intake-status.json"),JSON.stringify(report,null,2),{flag:"wx",mode:0o600});
        console.log(JSON.stringify(report,null,2));
    }finally{original?.close();store?.close();}
}
if(require.main===module)main().catch(error=>{
    // Only a code and our own script line are emitted; never error.message or
    // assertion actual/expected, which could contain private academic material.
    const code=/^[A-Z_0-9]{1,80}$/.test(error.code||"")?error.code:"VALIDATION_FAILED";
    const line=String(error.stack||"").match(/validate-stud-m16-private-intake\.js:(\d+):/);
    console.error(`PRIVATE_INTAKE_FAILED ${code} at script line ${line?.[1]||"unknown"}; no private source content logged.`);
    process.exitCode=1;
});
module.exports={exerciseBranches};

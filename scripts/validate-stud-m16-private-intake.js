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
        const workflow=new StudWorkflowService({store,requirementsService:requirements});
        const flow=workflow.create({assignmentId,templateKey:"GENERIC_MANUAL",allowNoContract:true,noContractReason:"Private local acceptance snapshot only: the actual Requirements Contract remains an unreviewed draft. No institutional or academic approval is implied."});
        assert.equal(flow.contractId,null);
        const report={status:"PARTIAL_PRIVATE_INTAKE",schema:28,originalReadOnly:true,isolatedSnapshot:true,
            linkedDocuments:candidates[0].documents,documentStates:documents,
            requirementDraft:{lifecycle:draft.lifecycle,candidates:draft.candidates.length,approved:false,
                coverage:draft.coverage?{linkedDocuments:draft.coverage.linkedDocuments,inspectedDocuments:draft.coverage.inspectedDocuments,chunksInspected:draft.coverage.chunksInspected,ocrRequiredDocuments:draft.coverage.ocrRequiredDocuments,truncationReached:draft.coverage.truncationReached}:null},
            context:{chunks:pkg.snapshot.chunks.length,candidates:pkg.snapshot.candidates.length},
            workflow:{created:true,contractApproved:false},
            providersInvoked:false,modelsInvoked:false,managedFilesCopied:false,
            limitations:["No human review or contract approval claimed","Managed file bytes are not validated by this database-only snapshot","Genuine missing team inputs and independent execution branches still require private acceptance","Not final academic acceptance or submission"]};
        assert.deepEqual(store.db.prepare("PRAGMA foreign_key_check").all(),[]);
        store.close();store=new StudAcademicStore({root}).initialize();
        assert(store.getAcademicContextPackage(pkg.id));
        assert.equal(store.db.prepare("SELECT lifecycle FROM stud_requirement_contracts WHERE id=?").get(draft.id).lifecycle,"DRAFT");
        report.restartPersistence=true;
        fs.writeFileSync(path.join(root,"private-intake-status.json"),JSON.stringify(report,null,2),{flag:"wx",mode:0o600});
        console.log(JSON.stringify(report,null,2));
    }finally{original?.close();store?.close();}
}
main().catch(()=>{console.error("PRIVATE_INTAKE_FAILED: inspect locally; no source content or paths were logged.");process.exitCode=1;});

#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService}=require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudCompositionService}=require("../src/classes/workspaces/studCompositionService.class.js");
const {StudWorkingContextService}=require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudArtifactOperationsService}=require("../src/classes/workspaces/studArtifactOperationsService.class.js");
const {StudClaimEvidenceService}=require("../src/classes/workspaces/studClaimEvidenceService.class.js");
const {StudFinalPackageService}=require("../src/classes/workspaces/studFinalPackageService.class.js");
const D=require("../src/classes/workspaces/studFinalPackageModel.class.js");
let passed=0;
function check(name,fn){fn();passed++;console.log(`PASS ${name}`);}
function error(code,fn){assert.throws(fn,e=>e.code===code,code);}
function open(root,dialog){
    const store=new StudAcademicStore({root}).initialize(),requirements=new StudRequirementsContractService({store});
    const context=new StudWorkingContextService({store,requirementsService:requirements});
    const artifacts=new StudArtifactOperationsService({store,workingContextService:context});
    const claims=new StudClaimEvidenceService({store,artifactOperationsService:artifacts,workingContextService:context});
    const composition=new StudCompositionService({store,claimEvidenceService:claims});
    const packages=new StudFinalPackageService({store,composition,claims,requirements,artifacts,dialog,managedStorage:{read(){throw new Error("Unexpected managed file read");}}});
    return {store,requirements,composition,packages,artifacts,claims};
}
function fixture(e,title="Synthetic manual coursework",withEvidence=false){
    const assignment=e.store.createEntity("ASSIGNMENT",{title});
    let contract=e.requirements.createDraft(assignment.id);
    for(const c of contract.candidates)contract=e.requirements.reviewCandidate({contractId:contract.id,candidateId:c.id,disposition:"EXCLUDED",expectedVersion:contract.rowVersion});
    contract=e.requirements.addManualRequirement({contractId:contract.id,expectedVersion:contract.rowVersion,requirement:{type:"DELIVERABLE",label:"Reflection",displayValue:"A written reflection",resolutionState:"RESOLVED"}});
    contract=e.requirements.approve({contractId:contract.id,expectedVersion:contract.rowVersion});
    let plan=e.composition.createPlan({assignmentId:assignment.id,seedProposals:false});
    plan=e.composition.addSection({planId:plan.id,expectedVersion:plan.rowVersion,section:{title:"Discussion",purpose:"Reflect on explicit observations",order:0,lengthUnit:"WORDS",plannedLength:100,origin:"USER",originReason:"Explicit synthetic fixture"}});
    plan=e.composition.setRequirementCoverage({planId:plan.id,expectedVersion:plan.rowVersion,requirementItemId:contract.items[0].id,sectionId:plan.sections[0].id,disposition:"ASSIGNED"});
    let paper=null,evidence=null;
    if(withEvidence){
        paper=e.store.createEntity("RESEARCH_PAPER",{title:"Synthetic source for software acceptance only",authors:"Example, Ada",year:2026});
        e.store.createRelationship({fromType:"ASSIGNMENT",fromId:assignment.id,relationType:"REFERENCES",toType:"RESEARCH_PAPER",toId:paper.id,source:"USER"});
        let claim=e.claims.createClaim({assignmentId:assignment.id,claim:{text:"The synthetic observation illustrates a bounded claim.",type:"ANALYTICAL"}});
        claim=e.claims.reviewClaim({assignmentId:assignment.id,claimId:claim.id,expectedVersion:claim.rowVersion});
        evidence=e.claims.createEvidence({assignmentId:assignment.id,sourceObjectType:"RESEARCH_PAPER",sourceObjectId:paper.id,excerpt:"Synthetic acceptance evidence."});
        evidence=e.claims.reviewEvidence({assignmentId:assignment.id,evidenceId:evidence.id,expectedVersion:evidence.rowVersion});
        const link=e.claims.linkEvidence({assignmentId:assignment.id,claimId:claim.id,evidenceId:evidence.id,relationshipType:"SUPPORTS",rationale:"Explicit test assessment"});
        e.claims.reviewLink({assignmentId:assignment.id,linkId:link.id,expectedVersion:link.rowVersion});
        plan=e.composition.linkClaim({planId:plan.id,expectedVersion:plan.rowVersion,sectionId:plan.sections[0].id,claimId:claim.id,order:0});
        plan=e.composition.linkEvidence({planId:plan.id,expectedVersion:plan.rowVersion,sectionId:plan.sections[0].id,evidenceId:evidence.id,intendedUse:"Synthetic test"});
    }
    plan=e.composition.reviewPlan({planId:plan.id,expectedVersion:plan.rowVersion});
    const draft=e.composition.createDraft({assignmentId:assignment.id,planId:plan.id,title});
    const version=e.composition.saveDraftVersion({assignmentId:assignment.id,draftId:draft.id,expectedVersion:draft.rowVersion,sections:[{sectionId:plan.sections[0].id,content:"This is a synthetic user-authored reflection. <script>unsafe()</script>"}],origin:"USER"});
    return {assignment,contract,plan,draft,version,paper,evidence};
}
async function main(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"stud-m15-")),exportRoot=fs.mkdtempSync(path.join(os.tmpdir(),"stud-m15-export-"));let e;
    try{
        e=open(root,{showOpenDialog:async()=>({canceled:false,filePaths:[exportRoot]})});
        check("schema v28 no fabricated packages",()=>{assert.equal(e.store.schemaInfo().version,28);assert.equal(e.store.db.prepare("SELECT count(*) n FROM stud_final_packages").get().n,0);});
        const f=fixture(e);let p=e.packages.create({assignmentId:f.assignment.id,draftVersionId:f.version.id,artifactIds:[],citationStyle:"harvard1"});
        check("immutable candidate with verified inventory",()=>{assert.equal(p.integrity,"VERIFIED");assert.equal(p.freshness,"CURRENT");assert.equal(p.state,"AWAITING_HUMAN_REVIEW");assert.equal(p.files.length,9);assert.equal(p.snapshot.draft.hash,f.version.contentHash);});
        check("truthful limitations without fabricated run",()=>{assert(p.snapshot.issues.some(i=>i.code==="NO_BIBLIOGRAPHY"));assert(p.snapshot.issues.some(i=>i.code==="COMMITTEE_INCOMPLETE"));assert.equal(e.store.db.prepare("SELECT count(*) n FROM stud_operation_runs").get().n,0);});
        check("HTML escaped and no executable candidate content",()=>{const html=e.packages.files.readFile(p.id,p.files.find(f=>f.name==="candidate.html")).toString();assert(html.includes("&lt;script&gt;"));assert(!html.includes("<script>"));});
        const approval={assignmentId:f.assignment.id,packageId:p.id,expectedManifestHash:p.manifestHash,confirmReviewed:true,acknowledgeIssues:true};
        check("approval needs exact human inspection",()=>{error("HUMAN_REVIEW_REQUIRED",()=>e.packages.approve({...approval,confirmReviewed:false}));error("ISSUE_ACKNOWLEDGEMENT_REQUIRED",()=>e.packages.approve({...approval,acknowledgeIssues:false}));error("STALE_PACKAGE_VERSION",()=>e.packages.approve({...approval,expectedManifestHash:"stale"}));});
        p=e.packages.approve(approval);
        check("explicit human approval bound to immutable snapshot",()=>{assert.equal(p.state,"APPROVED_FOR_MANUAL_SUBMISSION");assert.equal(p.approval.manifestHash,p.manifestHash);assert.equal(p.approval.actor,"USER");assert.throws(()=>e.store.db.prepare("UPDATE stud_final_packages SET title='rewrite' WHERE id=?").run(p.id),/IMMUTABLE/);});
        const exported=await e.packages.export({assignmentId:f.assignment.id,packageId:p.id,expectedManifestHash:p.manifestHash});
        check("native selected export verified with approval receipt",()=>{assert.equal(exported.verified,true);assert.equal(exported.approved,true);assert(!JSON.stringify(exported).includes(exportRoot));const receipt=JSON.parse(fs.readFileSync(path.join(exportRoot,exported.folderName,"approval-receipt.json")));assert.equal(receipt.approval.manifestHash,p.manifestHash);});
        check("cross assignment and forged fields rejected",()=>{const other=e.store.createEntity("ASSIGNMENT",{title:"Other"});error("CROSS_ASSIGNMENT_PACKAGE",()=>e.packages.create({assignmentId:other.id,draftVersionId:f.version.id,citationStyle:"harvard1"}));error("NOT_FOUND",()=>e.packages.read({assignmentId:other.id,packageId:p.id}));assert.throws(()=>e.packages.create({assignmentId:f.assignment.id,draftVersionId:f.version.id,citationStyle:"harvard1",approval:true}));});
        const newDraft=e.composition.draft({assignmentId:f.assignment.id,draftId:f.draft.id});e.composition.saveDraftVersion({assignmentId:f.assignment.id,draftId:f.draft.id,expectedVersion:newDraft.rowVersion,sections:[{sectionId:f.plan.sections[0].id,content:"Changed intellectual content."}],origin:"USER"});
        check("source drift never rewrites approval",()=>{const historical=e.packages.read({assignmentId:f.assignment.id,packageId:p.id});assert.equal(historical.freshness,"SOURCE_CHANGED");assert.equal(historical.preview,p.preview);assert.equal(historical.approval.approvedAt,p.approval.approvedAt);});
        await assert.rejects(()=>e.packages.export({assignmentId:f.assignment.id,packageId:p.id,expectedManifestHash:p.manifestHash}),err=>err.code==="PACKAGE_SOURCE_CHANGED");passed++;
        e.store.close();e=open(root);
        check("restart retains exact package files and approval",()=>{const restored=e.packages.read({assignmentId:f.assignment.id,packageId:p.id});assert.equal(restored.integrity,"VERIFIED");assert.equal(restored.approval.manifestHash,p.manifestHash);assert.equal(restored.preview,p.preview);});
        check("tampering fails closed",()=>{fs.appendFileSync(path.join(root,"final-packages",p.id,"candidate.md"),"tamper");assert.equal(e.packages.read({assignmentId:f.assignment.id,packageId:p.id}).integrity,"PACKAGE_INTEGRITY_FAILED");});
        for(const title of ["Engineering report","Humanities essay","Law case analysis","Social science study","Group project"]){const base=fixture(e,title),pkg=e.packages.create({assignmentId:base.assignment.id,draftVersionId:base.version.id,citationStyle:"apa"});check(`discipline ${title}`,()=>assert.equal(pkg.freshness,"CURRENT"));}
        const cited=fixture(e,"Synthetic cited reflection",true),citedPackage=e.packages.create({assignmentId:cited.assignment.id,draftVersionId:cited.version.id,citationStyle:"harvard1"});
        check("Citation.js bibliography uses exact placed Evidence identity",()=>{assert.equal(citedPackage.snapshot.citations[0].citationPaperId,cited.paper.id);assert.equal(citedPackage.snapshot.citations[0].citationState,"READY");assert(citedPackage.preview.includes("Example"));});
        e.store.updateEntity("RESEARCH_PAPER",cited.paper.id,{title:"Updated synthetic bibliographic identity"});
        check("bibliographic source drift requires a new package",()=>assert.equal(e.packages.read({assignmentId:cited.assignment.id,packageId:citedPackage.id}).freshness,"SOURCE_CHANGED"));
        check("bounded choices and paths",()=>{error("PACKAGE_LIMIT",()=>D.ids(Array(21).fill("stud_fake"),20));error("INVALID_PACKAGE_FILE",()=>e.packages.files.name("../credentials.txt"));});
        console.log(`RESULT ${passed} passed / 0 failed / 0 skipped`);
    }finally{e?.store.close();fs.rmSync(root,{recursive:true,force:true});fs.rmSync(exportRoot,{recursive:true,force:true});}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={open,fixture};

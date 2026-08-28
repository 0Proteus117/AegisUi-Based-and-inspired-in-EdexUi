#!/usr/bin/env node
"use strict";

const assert=require("assert"),crypto=require("crypto"),fs=require("fs"),os=require("os"),path=require("path");
const {DatabaseSync}=require("node:sqlite");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudRequirementsContractService}=require("../src/classes/workspaces/studRequirementsContractService.class.js");
const {StudWorkingContextService}=require("../src/classes/workspaces/studWorkingContextService.class.js");
const {StudArtifactOperationsService}=require("../src/classes/workspaces/studArtifactOperationsService.class.js");
const {StudResearchPlanService}=require("../src/classes/workspaces/studResearchPlanService.class.js");
const {StudClaimEvidenceService}=require("../src/classes/workspaces/studClaimEvidenceService.class.js");
const {StudCompositionService}=require("../src/classes/workspaces/studCompositionService.class.js");

let passed=0;
function check(name,work){work();passed+=1;console.log(`${name}: PASS`);}
function expect(code,work){assert.throws(work,error=>error&&error.code===code,code);}
function sha(value){return crypto.createHash("sha256").update(String(value)).digest("hex");}
function open(root){
    const store=new StudAcademicStore({root,applicationVersion:"m10-test"}).initialize();
    const requirements=new StudRequirementsContractService({store});
    const context=new StudWorkingContextService({store,requirementsService:requirements});
    const artifacts=new StudArtifactOperationsService({store,workingContextService:context});
    const research=new StudResearchPlanService({store,workingContextService:context,artifactOperationsService:artifacts});
    const claims=new StudClaimEvidenceService({store,workingContextService:context,artifactOperationsService:artifacts,researchPlanService:research});
    const composition=new StudCompositionService({store,workingContextService:context,claimEvidenceService:claims});
    return {store,requirements,context,artifacts,research,claims,composition};
}
function assignment(env,title="Synthetic engineering report"){
    const course=env.store.createEntity("COURSE",{title:`${title} course`,code:"SYN100"});
    return {course,assignment:env.store.createEntity("ASSIGNMENT",{courseId:course.id,title,status:"NOT_STARTED",submissionStatus:"UNKNOWN"})};
}
function reviewedContract(env,assignmentId){
    let contract=env.requirements.createDraft(assignmentId);
    for(const candidate of contract.candidates.filter(item=>item.disposition==="PENDING"))contract=env.requirements.reviewCandidate({contractId:contract.id,candidateId:candidate.id,disposition:"EXCLUDED",expectedVersion:contract.rowVersion});
    contract=env.requirements.addManualRequirement({contractId:contract.id,expectedVersion:contract.rowVersion,requirement:{type:"STRUCTURE",label:"Critical discussion",displayValue:"Include a critical discussion section",resolutionState:"RESOLVED"}});
    contract=env.requirements.addManualRequirement({contractId:contract.id,expectedVersion:contract.rowVersion,requirement:{type:"LENGTH",label:"Word limit",displayValue:"3000 words",normalizedValue:"3000 words",unit:"WORDS",resolutionState:"RESOLVED"}});
    contract=env.requirements.addManualRequirement({contractId:contract.id,expectedVersion:contract.rowVersion,requirement:{type:"CITATION",label:"Citation style",displayValue:"Harvard",resolutionState:"RESOLVED"}});
    return env.requirements.approve({contractId:contract.id,expectedVersion:contract.rowVersion});
}
function evidenceFixture(env,base){
    const paper=env.store.createEntity("RESEARCH_PAPER",{title:"Synthetic reviewed source",authors:"Example, Ada",year:2026,doi:"10.5555/m10.synthetic"});
    env.store.createRelationship({fromType:"ASSIGNMENT",fromId:base.assignment.id,relationType:"REFERENCES",toType:"RESEARCH_PAPER",toId:paper.id,source:"USER"});
    let claim=env.claims.createClaim({assignmentId:base.assignment.id,claim:{text:"The evidence supports the bounded central argument.",type:"ANALYTICAL"}});
    claim=env.claims.reviewClaim({assignmentId:base.assignment.id,claimId:claim.id,expectedVersion:claim.rowVersion});
    let evidence=env.claims.createEvidence({assignmentId:base.assignment.id,sourceObjectType:"RESEARCH_PAPER",sourceObjectId:paper.id,excerpt:"A bounded synthetic evidential statement."});
    evidence=env.claims.reviewEvidence({assignmentId:base.assignment.id,evidenceId:evidence.id,expectedVersion:evidence.rowVersion});
    let link=env.claims.linkEvidence({assignmentId:base.assignment.id,claimId:claim.id,evidenceId:evidence.id,relationshipType:"SUPPORTS",rationale:"Explicit synthetic assessment."});
    link=env.claims.reviewLink({assignmentId:base.assignment.id,linkId:link.id,expectedVersion:link.rowVersion});
    return {paper,claim,evidence,link};
}
function stripV23(dbPath){
    const db=new DatabaseSync(dbPath);
    db.exec(`PRAGMA foreign_keys=OFF;
        ALTER TABLE stud_working_context DROP COLUMN active_draft_version_id;
        ALTER TABLE stud_working_context DROP COLUMN active_draft_document_id;
        ALTER TABLE stud_working_context DROP COLUMN active_composition_section_id;
        ALTER TABLE stud_working_context DROP COLUMN active_composition_plan_id;
        DROP TABLE stud_draft_section_versions; DROP TABLE stud_draft_versions; DROP TABLE stud_draft_documents;
        DROP TABLE stud_composition_section_evidence; DROP TABLE stud_composition_section_claims; DROP TABLE stud_composition_requirement_coverage;
        DROP TABLE stud_composition_sections; DROP TABLE stud_assignment_composition_plans; DROP TABLE stud_composition_plans;
        DELETE FROM stud_schema_migrations WHERE version=23; PRAGMA foreign_keys=ON;`);
    db.close();
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),"aegis-stud-m10-"));
try{
    let env=open(path.join(root,"domain"));
    check("SCHEMA_V23_FRESH_WITH_NO_FABRICATED_COMPOSITION",()=>{assert.strictEqual(env.store.schemaInfo().version,23);["stud_composition_plans","stud_composition_sections","stud_draft_documents","stud_draft_versions"].forEach(table=>assert.strictEqual(env.store.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count,0));});
    const base=assignment(env),contract=reviewedContract(env,base.assignment.id),intel=evidenceFixture(env,base);
    let plan=env.composition.createPlan({assignmentId:base.assignment.id,contractId:contract.id,seedProposals:true});
    check("REVIEWED_CONTRACT_SEEDS_ONLY_EXPLICIT_STRUCTURE_PROPOSALS",()=>{assert.strictEqual(plan.lifecycle,"DRAFT");assert.strictEqual(plan.sections.length,1);assert.strictEqual(plan.sections[0].origin,"REQUIREMENT_PROPOSAL");assert.strictEqual(plan.authoritativeTotal,3000);assert.strictEqual(plan.totalSource,"REQUIREMENTS_CONTRACT");});
    const originalVersion=plan.rowVersion;
    plan=env.composition.updatePlan({planId:plan.id,expectedVersion:plan.rowVersion,title:"Evidence-led critical report",lengthUnit:"WORDS",userPlannedTotal:2800,userNotes:"User plan is visible but does not overwrite the authoritative limit."});
    check("AUTHORITATIVE_AND_USER_LENGTHS_REMAIN_DISTINCT",()=>{assert.strictEqual(plan.authoritativeTotal,3000);assert.strictEqual(plan.userPlannedTotal,2800);assert.strictEqual(plan.totalSource,"REQUIREMENTS_CONTRACT");});
    check("STALE_PLAN_MUTATION_REJECTED",()=>expect("STALE_COMPOSITION_VERSION",()=>env.composition.updatePlan({planId:plan.id,expectedVersion:originalVersion,title:"Stale"})));
    plan=env.composition.updateSection({planId:plan.id,sectionId:plan.sections[0].id,expectedPlanVersion:plan.rowVersion,expectedSectionVersion:plan.sections[0].rowVersion,section:{title:"Critical discussion",purpose:"Evaluate the claim with explicit reviewed evidence.",order:0,plannedLength:2400,lengthUnit:"WORDS",originReason:"Reviewed Requirement proposal accepted by the user."}});
    plan=env.composition.addSection({planId:plan.id,expectedVersion:plan.rowVersion,section:{title:"Conclusion",purpose:"Synthesize only the reviewed argument.",order:1,plannedLength:600,lengthUnit:"WORDS",originReason:"User-defined composition structure."}});
    check("SECTION_HIERARCHY_AND_ORDER_ARE_EXPLICIT",()=>{assert.strictEqual(plan.sections.length,2);assert.deepStrictEqual(plan.sections.map(item=>item.sectionOrder),[0,1]);});
    const first=plan.sections[0],second=plan.sections[1];
    check("SECTION_CYCLE_REJECTED",()=>expect("SECTION_HIERARCHY_CYCLE",()=>env.composition.updateSection({planId:plan.id,sectionId:first.id,expectedPlanVersion:plan.rowVersion,expectedSectionVersion:first.rowVersion,section:{title:first.title,purpose:first.purpose,parentSectionId:first.id,order:0,plannedLength:2400,lengthUnit:"WORDS",originReason:first.originReason}})));
    const citationRequirement=contract.items.find(item=>item.type==="CITATION");
    plan=env.composition.setRequirementCoverage({planId:plan.id,expectedVersion:plan.rowVersion,requirementItemId:citationRequirement.id,sectionId:first.id,disposition:"ASSIGNED"});
    const lengthRequirement=contract.items.find(item=>item.type==="LENGTH");
    plan=env.composition.setRequirementCoverage({planId:plan.id,expectedVersion:plan.rowVersion,requirementItemId:lengthRequirement.id,disposition:"EXCLUDED",reason:"The length is represented at plan level and not assigned to one semantic section."});
    check("REQUIREMENT_ASSIGNMENT_AND_REASONED_EXCLUSION_PERSIST",()=>{assert.ok(plan.requirementCoverage.some(item=>item.requirementItemId===citationRequirement.id&&item.disposition==="ASSIGNED"));assert.ok(plan.requirementCoverage.some(item=>item.requirementItemId===lengthRequirement.id&&item.disposition==="EXCLUDED"&&item.reason));});
    plan=env.composition.linkClaim({planId:plan.id,expectedVersion:plan.rowVersion,sectionId:first.id,claimId:intel.claim.id,order:0,rationale:"Central analytical Claim."});
    plan=env.composition.linkEvidence({planId:plan.id,expectedVersion:plan.rowVersion,sectionId:first.id,evidenceId:intel.evidence.id,intendedUse:"Use only for the placed Claim."});
    check("M8_CLAIM_AND_REVIEWED_EVIDENCE_ARE_REFERENCED_NOT_DUPLICATED",()=>{assert.strictEqual(plan.sections[0].claims[0].claimId,intel.claim.id);assert.strictEqual(plan.sections[0].evidence[0].evidenceId,intel.evidence.id);assert.strictEqual(env.store.db.prepare("SELECT COUNT(*) count FROM stud_evidence_records WHERE id=?").get(intel.evidence.id).count,1);});
    const readiness=env.composition.readiness({assignmentId:base.assignment.id,planId:plan.id});
    check("READINESS_IS_EXPLAINABLE_WITHOUT_FAKE_PERCENTAGE",()=>{assert.strictEqual(readiness.noPercentage,true);assert.strictEqual(readiness.length.planned,3000);assert.ok(Array.isArray(readiness.reasons));assert.ok(!Object.hasOwn(readiness,"percentage"));});
    plan=env.composition.reviewPlan({planId:plan.id,expectedVersion:plan.rowVersion});
    const reviewedHash=plan.planHash;
    check("REVIEWED_PLAN_IS_HASHED_AND_IMMUTABLE",()=>{assert.strictEqual(plan.lifecycle,"REVIEWED");assert.match(plan.planHash,/^[a-f0-9]{64}$/);expect("REVIEWED_COMPOSITION_IMMUTABLE",()=>env.composition.updatePlan({planId:plan.id,expectedVersion:plan.rowVersion,title:"Illegal rewrite"}));});
    let draft=env.composition.createDraft({assignmentId:base.assignment.id,planId:plan.id,title:"Synthetic report draft"});
    const v1=env.composition.saveDraftVersion({assignmentId:base.assignment.id,draftId:draft.id,expectedVersion:draft.rowVersion,sections:[{sectionId:first.id,content:"The first bounded statement."},{sectionId:second.id,content:"A concise conclusion."}],changeReason:"Initial manual version",origin:"USER"});
    draft=env.composition.draft({assignmentId:base.assignment.id,draftId:draft.id,versionLimit:20});
    const v2=env.composition.saveDraftVersion({assignmentId:base.assignment.id,draftId:draft.id,expectedVersion:draft.rowVersion,sections:[{sectionId:first.id,content:"The revised bounded statement cites (Example, 2026)."}],changeReason:"Added reviewed citation",origin:"USER"});
    check("DRAFT_VERSIONS_ARE_IMMUTABLE_COMPLETE_SECTION_SNAPSHOTS",()=>{assert.strictEqual(v1.versionNumber,1);assert.strictEqual(v2.versionNumber,2);assert.strictEqual(v2.sections.length,2);assert.strictEqual(env.composition.draftVersion({assignmentId:base.assignment.id,draftId:draft.id,versionId:v1.id}).sections[0].content,"The first bounded statement.");});
    check("DRAFT_DIFF_REPORTS_REAL_CHANGES_ONLY",()=>{const diff=env.composition.diff({assignmentId:base.assignment.id,draftId:draft.id,fromVersionId:v1.id,toVersionId:v2.id});assert.strictEqual(diff.changedSections,1);assert.ok(diff.sections.find(item=>item.sectionId===first.id).diff.lines.some(line=>line.type==="ADDED"));});
    check("STALE_DRAFT_SAVE_REJECTED",()=>expect("STALE_DRAFT_VERSION",()=>env.composition.saveDraftVersion({assignmentId:base.assignment.id,draftId:draft.id,expectedVersion:1,sections:[{sectionId:first.id,content:"Stale overwrite"}],origin:"USER"})));
    const working=env.context.update({courseId:base.course.id,assignmentId:base.assignment.id,compositionPlanId:plan.id,compositionSectionId:first.id,draftDocumentId:draft.id,draftVersionId:v1.id,originSurface:"COMPOSITION_WORKSPACE"});
    check("WORKING_CONTEXT_PERSISTS_EXACT_PLAN_SECTION_DRAFT_VERSION",()=>{assert.strictEqual(working.activeCompositionPlan.id,plan.id);assert.strictEqual(working.activeCompositionSection.id,first.id);assert.strictEqual(working.activeDraftVersion.id,v1.id);});
    check("CROSS_ASSIGNMENT_AND_CROSS_DRAFT_REFERENCES_REJECTED",()=>{const other=assignment(env,"Other Assignment");expect("CROSS_ASSIGNMENT_DRAFT",()=>env.composition.draft({assignmentId:other.assignment.id,draftId:draft.id}));expect("CROSS_ASSIGNMENT_COMPOSITION",()=>env.composition.createDraft({assignmentId:other.assignment.id,planId:plan.id}));});
    check("ORDINARY_COMPOSITION_CREATES_NO_MISSION_CONTROL_RUN",()=>assert.strictEqual(env.store.db.prepare("SELECT COUNT(*) count FROM stud_operation_runs").get().count,0));
    env.store.close();env=open(path.join(root,"domain"));
    check("RESTART_PRESERVES_REVIEWED_HASH_HISTORY_AND_CONTEXT",()=>{const state=env.composition.state({assignmentId:base.assignment.id,draftLimit:10});assert.strictEqual(state.current.planHash,reviewedHash);assert.strictEqual(state.drafts[0].id,draft.id);const context=env.context.read();assert.strictEqual(context.activeDraftVersion.id,v1.id);assert.strictEqual(env.composition.draftVersion({assignmentId:base.assignment.id,draftId:draft.id,versionId:v1.id}).contentHash,v1.contentHash);});
    let revised=env.composition.createRevision({planId:plan.id,expectedVersion:plan.rowVersion});
    check("REVIEWED_PLAN_EDIT_CREATES_NEW_DRAFT_REVISION",()=>{assert.strictEqual(revised.lifecycle,"DRAFT");assert.strictEqual(revised.parentPlanId,plan.id);assert.strictEqual(revised.revision,2);assert.strictEqual(env.composition.state({assignmentId:base.assignment.id}).current.id,plan.id);});
    env.store.close();

    let migration=open(path.join(root,"migration"));const legacy=migration.store.createEntity("ASSIGNMENT",{title:"Existing v22 Assignment"});migration.store.close();stripV23(path.join(root,"migration","academic.sqlite"));migration=open(path.join(root,"migration"));
    check("V22_TO_V23_MIGRATION_PRESERVES_ASSIGNMENT_WITHOUT_BACKFILL",()=>{assert.strictEqual(migration.store.schemaInfo().version,23);assert.ok(migration.store.getEntity("ASSIGNMENT",legacy.id));assert.strictEqual(migration.store.db.prepare("SELECT COUNT(*) count FROM stud_composition_plans").get().count,0);});migration.store.close();
    const rollbackRoot=path.join(root,"rollback");let rollback=open(rollbackRoot),preserved=rollback.store.createEntity("ASSIGNMENT",{title:"Rollback preserved Assignment"});rollback.store.close();stripV23(path.join(rollbackRoot,"academic.sqlite"));const broken=new DatabaseSync(path.join(rollbackRoot,"academic.sqlite"));broken.exec("CREATE TABLE stud_composition_plans (id TEXT PRIMARY KEY);");broken.close();
    check("V23_MIGRATION_FAILURE_ROLLS_BACK_ATOMICALLY",()=>{assert.throws(()=>open(rollbackRoot),error=>error&&error.code==="DATABASE_OPEN_FAILED"&&/migration 23/i.test(error.details&&error.details.cause||""));const inspect=new DatabaseSync(path.join(rollbackRoot,"academic.sqlite"));assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM stud_schema_migrations WHERE version=23").get().count,0);assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM stud_assignments WHERE id=?").get(preserved.id).count,1);assert.strictEqual(inspect.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='stud_assignment_composition_plans'").get().count,0);inspect.close();});
    const neutral=open(path.join(root,"neutral")),disciplines=[["Engineering report","WORDS"],["Humanities essay","WORDS"],["Law authority analysis","PAGES"],["Social Science project","WORDS"],["Group presentation","SLIDES"],["Generic manual coursework","ITEMS"]];
    check("DISCIPLINE_NEUTRAL_MANUAL_PLANS_AND_LENGTH_UNITS",()=>disciplines.forEach(([title,unit])=>{const value=assignment(neutral,title),approved=reviewedContract(neutral,value.assignment.id);let item=neutral.composition.createPlan({assignmentId:value.assignment.id,contractId:approved.id,lengthUnit:unit,userPlannedTotal:10,seedProposals:false});item=neutral.composition.addSection({planId:item.id,expectedVersion:item.rowVersion,section:{title:"Primary section",purpose:`Explicit plan for ${title}`,order:0,plannedLength:10,lengthUnit:unit,originReason:"Synthetic discipline-neutral validation."}});assert.strictEqual(item.sections[0].lengthUnit,unit);}));neutral.store.close();
    console.log(`STUD M10 COMPOSITION / DRAFT VERSIONS: ${passed} PASSED`);
}finally{fs.rmSync(root,{recursive:true,force:true});}

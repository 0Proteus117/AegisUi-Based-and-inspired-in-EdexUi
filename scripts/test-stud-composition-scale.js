#!/usr/bin/env node
"use strict";

const assert=require("assert"),crypto=require("crypto"),fs=require("fs"),os=require("os"),path=require("path"),{performance}=require("perf_hooks");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudCompositionRepository}=require("../src/classes/workspaces/studCompositionRepository.class.js");

const root=fs.mkdtempSync(path.join(os.tmpdir(),"aegis-stud-m10-scale-"));
function hash(value){return crypto.createHash("sha256").update(String(value)).digest("hex");}
function ms(work){const start=performance.now(),value=work();return {value,elapsed:Number((performance.now()-start).toFixed(3))};}
try{
    const store=new StudAcademicStore({root,applicationVersion:"m10-scale"}).initialize(),db=store.db,now=new Date().toISOString(),courses=[];
    for(let index=0;index<100;index+=1)courses.push(store.createEntity("COURSE",{title:`Synthetic discipline-neutral course ${index}`,code:`SYN${index}`}));
    const assignments=[];
    for(let index=0;index<1000;index+=1)assignments.push(store.createEntity("ASSIGNMENT",{courseId:courses[index%courses.length].id,title:`Synthetic composition assignment ${index}`,status:"NOT_STARTED",submissionStatus:"UNKNOWN"}));
    const insertContract=db.prepare("INSERT INTO stud_requirement_contracts (id,assignment_id,revision,lifecycle,completeness,approved_as_incomplete,approved_at,approved_by,contract_hash,row_version,created_at,updated_at) VALUES (?,?,1,'APPROVED','COMPLETE',0,?,'USER',?,1,?,?)");
    const insertPlan=db.prepare("INSERT INTO stud_composition_plans (id,plan_key,assignment_id,course_id,requirements_contract_id,requirements_contract_revision,requirements_contract_hash,lifecycle,revision,parent_plan_id,title,length_unit,authoritative_total,user_planned_total,total_source,origin,plan_hash,row_version,created_at,updated_at,reviewed_at) VALUES (?,?,?,?,?,1,?,?,?,?,?,?,3000,NULL,'REQUIREMENTS_CONTRACT','USER',?,1,?,?,?)");
    const insertPointer=db.prepare("INSERT INTO stud_assignment_composition_plans (assignment_id,current_reviewed_plan_id,current_draft_plan_id,updated_at) VALUES (?,?,NULL,?)");
    const insertSection=db.prepare("INSERT INTO stud_composition_sections (id,plan_id,assignment_id,parent_section_id,title,purpose,section_order,depth,planned_length,length_unit,origin,origin_reason,row_version,created_at,updated_at) VALUES (?,?,?,NULL,?,?,?,0,1500,'WORDS','USER','Synthetic scale fixture',1,?,?)");
    const insertDraft=db.prepare("INSERT INTO stud_draft_documents (id,assignment_id,course_id,composition_plan_id,composition_plan_revision,composition_plan_hash,requirements_contract_id,requirements_contract_revision,requirements_contract_hash,title,lifecycle,current_version_id,row_version,created_at,updated_at) VALUES (?,?,?,?,2,?,?,1,?,?,'ACTIVE',NULL,4,?,?)");
    const insertVersion=db.prepare("INSERT INTO stud_draft_versions (id,draft_id,assignment_id,version_number,parent_version_id,origin,change_reason,content_hash,total_length,length_unit,created_at) VALUES (?,?,?,?,?,'USER','Synthetic immutable version',?,?,'WORDS',?)");
    const insertSnapshot=db.prepare("INSERT INTO stud_draft_section_versions (id,draft_version_id,draft_id,section_id,content,content_hash,measured_length,created_at) VALUES (?,?,?,?,?,?,?,?)");
    store.transaction(()=>assignments.forEach((assignment,index)=>{
        const contract=`stud_requirement_contract_scale_${index}`,contractHash=hash(contract);insertContract.run(contract,assignment.id,now,contractHash,now,now);
        let parent=null,currentPlan=null,currentHash=null,currentSections=[];
        for(let revision=1;revision<=2;revision+=1){
            const plan=`stud_composition_plan_scale_${index}_${revision}`,planHash=hash(plan),lifecycle=revision===1?"SUPERSEDED":"REVIEWED";insertPlan.run(plan,`stud_composition_lineage_scale_${index}`,assignment.id,assignment.courseId,contract,contractHash,lifecycle,revision,parent,`Composition ${index} revision ${revision}`,"WORDS",planHash,now,now,now);
            const sections=[];for(let sectionIndex=0;sectionIndex<2;sectionIndex+=1){const section=`stud_composition_section_scale_${index}_${revision}_${sectionIndex}`;insertSection.run(section,plan,assignment.id,`Section ${sectionIndex+1}`,"Bounded synthetic purpose",sectionIndex,now,now);sections.push(section);}parent=plan;if(revision===2){currentPlan=plan;currentHash=planHash;currentSections=sections;}
        }
        insertPointer.run(assignment.id,currentPlan,now);
        const draft=`stud_draft_document_scale_${index}`,versions=[];for(let version=1;version<=3;version+=1)versions.push(`stud_draft_version_scale_${index}_${version}`);insertDraft.run(draft,assignment.id,assignment.courseId,currentPlan,currentHash,contract,contractHash,`Synthetic draft ${index}`,now,now);
        versions.forEach((versionId,position)=>{const number=position+1,parentVersion=position?versions[position-1]:null,content=`Synthetic version ${number} for assignment ${index}.`;insertVersion.run(versionId,draft,assignment.id,number,parentVersion,hash(content),content.split(/\s+/).length*2,now);currentSections.forEach((section,sectionIndex)=>insertSnapshot.run(`stud_draft_snapshot_scale_${index}_${number}_${sectionIndex}`,versionId,draft,section,content,hash(`${content}:${section}`),content.split(/\s+/).length,now));});db.prepare("UPDATE stud_draft_documents SET current_version_id=? WHERE id=?").run(versions[2],draft);
    }));
    const repository=new StudCompositionRepository(store),sample=assignments[777],stateTiming=ms(()=>repository.assignmentState(sample.id)),draftTiming=ms(()=>repository.hydrateDraft("stud_draft_document_scale_777",{versionLimit:25})),versionTiming=ms(()=>repository.hydrateVersion("stud_draft_version_scale_777_1"));
    const counts={courses:db.prepare("SELECT COUNT(*) count FROM stud_courses").get().count,assignments:db.prepare("SELECT COUNT(*) count FROM stud_assignments").get().count,plans:db.prepare("SELECT COUNT(*) count FROM stud_composition_plans").get().count,sections:db.prepare("SELECT COUNT(*) count FROM stud_composition_sections").get().count,drafts:db.prepare("SELECT COUNT(*) count FROM stud_draft_documents").get().count,versions:db.prepare("SELECT COUNT(*) count FROM stud_draft_versions").get().count,snapshots:db.prepare("SELECT COUNT(*) count FROM stud_draft_section_versions").get().count};
    assert.deepStrictEqual(counts,{courses:100,assignments:1000,plans:2000,sections:4000,drafts:1000,versions:3000,snapshots:6000});
    assert.strictEqual(stateTiming.value.current.sections.length,2);assert.strictEqual(stateTiming.value.history.length,2);assert.strictEqual(draftTiming.value.history.length,3);assert.strictEqual(versionTiming.value.sections.length,2);
    console.log(JSON.stringify({status:"PASS",counts,timingsMs:{assignmentPlanHydration:stateTiming.elapsed,draftHistoryHydration:draftTiming.elapsed,historicalVersionHydration:versionTiming.elapsed},bounded:{historyLimit:100,sectionsPerPlanLimit:200,draftHistoryLimit:100}},null,2));
    store.close();
}finally{fs.rmSync(root,{recursive:true,force:true});}

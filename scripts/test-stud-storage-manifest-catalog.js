#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudStorageManifestCatalog}=require("../src/classes/workspaces/studStorageManifestCatalog.class.js");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"aegis-manifest-catalog-"));
let store,passed=0;
function check(name,work){work();passed++;console.log(`${name}: PASS`);}
try{
 store=new StudAcademicStore({root}).initialize();const catalog=new StudStorageManifestCatalog({store});
 const course=store.createEntity("COURSE",{title:"Synthetic interdisciplinary module"}),assignment=store.createEntity("ASSIGNMENT",{title:"Synthetic report",courseId:course.id}),other=store.createEntity("ASSIGNMENT",{title:"Other synthetic work",courseId:course.id});
 const ref="documents/paper_0123456789abcdef.pdf";
 const resource=store.createEntity("RESOURCE",{title:"Assessment brief",assignmentId:assignment.id,courseId:course.id,localReference:ref,type:"PDF"});
 const shared=store.createEntity("RESOURCE",{title:"Shared course text",courseId:course.id,localReference:"documents/course_abcdef0123456789.pdf",type:"PDF"});
 const foreign=store.createEntity("RESOURCE",{title:"Other assignment only",courseId:course.id,assignmentId:other.id,localReference:ref,type:"PDF"});
 check("ASSIGNMENT_SCOPE_EXCLUDES_OTHER_ASSIGNMENT_AND_OPT_IN_COURSE",()=>{const view=catalog.inspect({assignmentId:assignment.id});assert.strictEqual(view.files.length,1);assert.deepStrictEqual(view.files[0].sources.map(s=>s.id),[resource.id]);assert.strictEqual(view.files[0].sharedCanonicalReference,true);assert.strictEqual(view.files[0].canonicalOwnerCount,2);assert.strictEqual(view.files[0].assetVersion,null);assert.strictEqual(view.portableReady,false);assert.strictEqual(view.filesystemInspected,false);});
 check("EXPLICIT_COURSE_MATERIAL_DISCLOSES_SHARING",()=>{const view=catalog.inspect({assignmentId:assignment.id,includeCourseMaterial:true});assert.strictEqual(view.files.length,2);assert.ok(view.files.some(file=>file.sources.some(s=>s.id===shared.id)&&file.sharedCourseMaterial));assert.ok(!view.objects.some(o=>o.id===foreign.id));});
 check("INVALID_INPUT_AND_ID_REJECTED",()=>{assert.throws(()=>catalog.inspect({assignmentId:assignment.id,path:"/not-allowed"}),e=>e.code==="INVALID_INPUT");assert.throws(()=>catalog.inspect({assignmentId:"../wrong"}));assert.throws(()=>catalog.inspect({assignmentId:"stud_missing"}),e=>e.code==="NOT_FOUND");assert.throws(()=>catalog.inspect({assignmentId:assignment.id,includeCourseMaterial:"yes"}),e=>e.code==="INVALID_INPUT");});
 const paper=store.createEntity("RESEARCH_PAPER",{title:"Synthetic literature",localDocumentReference:ref}),note=store.createEntity("NOTE",{title:"Local reasoning",assignmentId:assignment.id,content:"Private-shaped content must not enter the inventory."});
 store.createRelationship({fromType:"NOTE",fromId:note.id,toType:"RESEARCH_PAPER",toId:paper.id,relationType:"CITES",source:"USER"});
 check("NOTE_CITATION_TRAVERSED_WITHOUT_DUPLICATING_BYTES_OR_CONTENT",()=>{const view=catalog.inspect({assignmentId:assignment.id});assert.strictEqual(view.files.length,1);assert.ok(view.files[0].sources.some(s=>s.id===paper.id));assert.ok(!JSON.stringify(view).includes("Private-shaped"));});
 check("SCOPE_HASH_IS_DETERMINISTIC_AND_CHANGES_WITH_CANONICAL_RECORD",()=>{const a=catalog.inspect({assignmentId:assignment.id}),b=catalog.inspect({assignmentId:assignment.id});assert.strictEqual(a.scopeHash,b.scopeHash);store.updateEntity("NOTE",note.id,{title:"Reviewed local reasoning"});assert.notStrictEqual(catalog.inspect({assignmentId:assignment.id}).scopeHash,a.scopeHash);});
 const remote=store.createEntity("RESOURCE",{title:"Remote source",assignmentId:assignment.id,url:"https://example.org/public",type:"REFERENCE"});
 const malformed=store.createEntity("RESOURCE",{title:"Unsupported legacy reference",assignmentId:assignment.id,localReference:"https://example.org/download?token=synthetic-never-output",type:"REFERENCE"});
 check("REMOTE_AND_UNSUPPORTED_REFERENCES_REPORTED_WITHOUT_URLS",()=>{const view=catalog.inspect({assignmentId:assignment.id});assert.ok(view.issues.some(i=>i.id===remote.id&&i.code==="NO_MANAGED_BYTES"));assert.ok(view.issues.some(i=>i.id===malformed.id&&i.code==="UNSUPPORTED_MANAGED_REFERENCE"));assert.ok(!JSON.stringify(view).includes("synthetic-never-output"));assert.ok(!JSON.stringify(view).includes("https://"));assert.strictEqual(view.requiresReview,true);});
 store.createRelationship({fromType:"NOTE",fromId:note.id,toType:"RESOURCE",toId:foreign.id,relationType:"REFERENCES",source:"USER"});
 check("EXPLICIT_FOREIGN_ASSIGNMENT_REFERENCE_IS_A_GAP_NOT_FALSE_OWNERSHIP",()=>{const view=catalog.inspect({assignmentId:assignment.id});assert.ok(view.issues.some(i=>i.code==="FOREIGN_ASSIGNMENT_SOURCE"&&i.id===foreign.id));assert.ok(!view.objects.some(o=>o.id===foreign.id));});
 check("NO_PERSISTENCE_NO_RUNS_NO_PROVIDER_ACTION",()=>{for(const table of ["stud_storage_assets","stud_storage_manifests","stud_operation_runs","stud_operation_events"])assert.strictEqual(store.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count,0);assert.ok(!fs.existsSync(path.join(root,"documents")));});
 check("DISCIPLINE_NEUTRAL_MANUAL_ASSIGNMENTS",()=>{for(const title of ["Engineering design","Humanities interpretation","Law authority","Social science dataset","Group project","Generic coursework"]){const a=store.createEntity("ASSIGNMENT",{title});const view=catalog.inspect({assignmentId:a.id});assert.strictEqual(view.files.length,0);assert.strictEqual(view.truncated,false);assert.strictEqual(view.portableReady,false);}});
 const crowded=store.createEntity("ASSIGNMENT",{title:"Bounded inventory"}),now=new Date().toISOString();
 store.transaction(()=>{const insert=store.db.prepare("INSERT INTO stud_resources (id,assignment_id,type,title,local_reference,created_at,updated_at) VALUES (?,?,'PDF','Synthetic bounded source',?,?,?)");for(let i=0;i<620;i++)insert.run(`catalog_scale_${i}`,crowded.id,`documents/item_${i.toString(16).padStart(16,"0")}.pdf`,now,now);});
 check("BOUNDED_CATALOG_REPORTS_OMITTED_OBJECTS_NOT_FAKE_COMPLETENESS",()=>{const start=performance.now(),view=catalog.inspect({assignmentId:crowded.id});assert.strictEqual(view.truncated,true);assert.strictEqual(view.objects.length,500);assert.ok(view.issues.some(i=>i.code==="OBJECT_LIMIT"));assert.ok(view.issues.length<=100);assert.ok(view.issueCount>view.issues.length);assert.strictEqual(view.portableReady,false);console.log(`CATALOG_620_RECORDS_MS=${(performance.now()-start).toFixed(2)}`);});
 const before=catalog.inspect({assignmentId:assignment.id}).scopeHash;store.close();store=new StudAcademicStore({root}).initialize();
 check("RESTART_INVENTORY_SAME_CANONICAL_IDENTITY",()=>assert.strictEqual(new StudStorageManifestCatalog({store}).inspect({assignmentId:assignment.id}).scopeHash,before));
 console.log(`STUD STORAGE MANIFEST CATALOG: ${passed} PASSED`);
}finally{if(store)store.close();fs.rmSync(root,{recursive:true,force:true});}

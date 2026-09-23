#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto");
const {StudAcademicStore}=require("../src/classes/workspaces/studAcademicStore.class.js");
const {StudStoragePaths}=require("../src/classes/workspaces/studStoragePaths.class.js");
const {StudStorageProfileService}=require("../src/classes/workspaces/studStorageProfileService.class.js");
const {StudStorageTransferService}=require("../src/classes/workspaces/studStorageTransferService.class.js");
const Domain=require("../src/classes/workspaces/studStorageModel.class.js");
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"aegis-storage-lifecycle-")));let passed=0;
const rejection=(code,work)=>assert.rejects(work,error=>error.code===code);
function fixture(){
 const folder=fs.mkdtempSync(path.join(root,"case-")),local=path.join(folder,"local"),mount=path.join(folder,"external");fs.mkdirSync(local);fs.mkdirSync(mount);
 let store=new StudAcademicStore({root:local}).initialize();
 const paths=new StudStoragePaths({localRoot:local,volumeInfo:()=>({uuid:"11111111-1111-1111-1111-111111111111",mountPoint:mount})});
 let storage=new StudStorageProfileService({store,paths}),service=new StudStorageTransferService({store,storage});
 const external=storage.registerSelectedDirectory(mount,"Synthetic archive"),assignment=store.createEntity("ASSIGNMENT",{title:"Synthetic multidisciplinary transfer"});
 fs.mkdirSync(path.join(local,"documents"));const references=[],resources=[];
 for(let i=0;i<2;i++){
    const bytes=Buffer.alloc(800000,i+41),sha256=crypto.createHash("sha256").update(bytes).digest("hex"),reference=`documents/source_${sha256.slice(0,16)}.pdf`;
    fs.writeFileSync(path.join(local,reference),bytes);references.push(reference);
    resources.push(store.createEntity("RESOURCE",{title:`Synthetic source ${i}`,assignmentId:assignment.id,type:"PDF",localReference:reference,checksum:sha256}));
 }
 const f={local,mount,paths,external,assignment,references,resources,get store(){return store;},get storage(){return storage;},get service(){return service;},
    prepare:async(extra={})=>service.prepare({assignmentId:assignment.id,targetProfileId:external.id,expectedTargetVersion:1,purpose:"RELOCATE",
        expectedScopeHash:service.catalog.inspect({assignmentId:assignment.id}).scopeHash,references,...extra}),
    input:m=>({assignmentId:assignment.id,manifestId:m.id,expectedVersion:m.rowVersion}),
    execute:m=>service.execute({...f.input(m),confirmLimitedScope:true,confirmSharedReferences:true}),
    mappings:()=>references.map(ref=>storage.repository.asset(ref)?.activeProfileId||Domain.LOCAL_PROFILE_ID),
    restart:()=>{store.close();store=new StudAcademicStore({root:local}).initialize();storage=new StudStorageProfileService({store,paths});service=new StudStorageTransferService({store,storage});},
    close:()=>store.close()};return f;
}
async function check(name,work){const f=fixture();try{await work(f);passed++;console.log(`${name}: PASS`);}finally{f.close();}}
(async()=>{try{
 await check("PREPARE_PERSISTS_SELECTION_WITHOUT_APPROVAL_RUN_OR_MOVEMENT",async f=>{
    const m=await f.prepare();assert.strictEqual(m.state,"PREPARED");assert.strictEqual(m.approvedAt,null);assert.strictEqual(m.items.length,2);
    assert.strictEqual(f.store.db.prepare("SELECT COUNT(*) count FROM stud_operation_runs").get().count,0);
    assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));assert.strictEqual(f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id}).portableReady,false);
    assert.ok(!JSON.stringify(m).includes(f.local));assert.deepStrictEqual(f.store.db.prepare("PRAGMA foreign_key_check").all(),[]);
 });
 await check("LIMITED_SCOPE_REQUIRES_EXPLICIT_CONFIRMATION",async f=>{const m=await f.prepare();await rejection("STORAGE_APPROVAL_REQUIRED",()=>f.service.execute(f.input(m)));assert.strictEqual(f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id}).state,"PREPARED");});
 await check("SHARED_REFERENCE_CONSEQUENCES_REQUIRE_ACKNOWLEDGEMENT",async f=>{
    f.store.createEntity("RESOURCE",{title:"Other context uses same managed bytes",type:"PDF",localReference:f.references[0],checksum:f.resources[0].checksum});
    const m=await f.prepare();assert.strictEqual(m.sharedReferenceCount,1);
    await rejection("STORAGE_APPROVAL_REQUIRED",()=>f.service.execute({...f.input(m),confirmLimitedScope:true}));
 });
 await check("HASH_VERIFIED_ATOMIC_SWITCH_AND_RETAINED_ORIGINALS",async f=>{
    const m=await f.execute(await f.prepare());assert.strictEqual(m.state,"APPLIED");assert.ok(m.approvedAt);assert.ok(f.mappings().every(id=>id===f.external.id));
    for(const ref of f.references){assert.deepStrictEqual(fs.readFileSync(f.storage.resolveManaged(ref)),fs.readFileSync(path.join(f.local,ref)));}
    const run=f.service.artifacts.run({assignmentId:f.assignment.id,runId:m.runId});assert.strictEqual(run.state,"COMPLETED");assert.strictEqual(run.progressCurrent,2);assert.strictEqual(run.progressTotal,2);assert.strictEqual(run.progressUnit,"verified files");assert.strictEqual(run.canPause,false);
    assert.strictEqual(f.store.db.prepare("SELECT COUNT(*) count FROM stud_storage_copies").get().count,4);
 });
 await check("ROLLBACK_VERIFIES_ORIGINALS_AND_PRESERVES_BOTH_COPIES",async f=>{
    let m=await f.execute(await f.prepare());m=await f.service.rollback(f.input(m));assert.strictEqual(m.state,"ROLLED_BACK");assert.ok(m.rollbackRunId);assert.notStrictEqual(m.runId,m.rollbackRunId);
    assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));for(const ref of f.references)assert.ok(fs.existsSync(f.paths.file(f.external,ref)));
 });
 await check("FAILED_ROLLBACK_LEAVES_EXTERNAL_MAPPING_AND_HISTORY",async f=>{
    const m=await f.execute(await f.prepare());fs.writeFileSync(path.join(f.local,f.references[0]),"tamper");
    await rejection("STORAGE_HASH_MISMATCH",()=>f.service.rollback(f.input(m)));assert.ok(f.mappings().every(id=>id===f.external.id));
    const current=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id});assert.strictEqual(current.state,"APPLIED");assert.strictEqual(current.errorCode,"STORAGE_HASH_MISMATCH");
    assert.strictEqual(f.service.artifacts.run({assignmentId:f.assignment.id,runId:current.rollbackRunId}).state,"FAILED");
 });
 await check("STALE_VERSION_AND_NONPREPARED_REPLAY_REJECTED",async f=>{
    const m=await f.prepare();await rejection("STALE_STORAGE_VERSION",()=>f.service.execute({...f.input(m),expectedVersion:99,confirmLimitedScope:true}));
    const applied=await f.execute(m);await rejection("INVALID_STORAGE_TRANSITION",()=>f.execute(applied));
 });
 await check("CROSS_ASSIGNMENT_AND_GENERIC_PAYLOAD_REJECTED",async f=>{
    const m=await f.prepare(),other=f.store.createEntity("ASSIGNMENT",{title:"Other synthetic assignment"});
    await rejection("STORAGE_MANIFEST_NOT_FOUND",()=>f.service.execute({...f.input(m),assignmentId:other.id,confirmLimitedScope:true}));
    await rejection("INVALID_INPUT",()=>f.service.execute({...f.input(m),path:"/private/not-allowed"}));
    await rejection("INVALID_MANAGED_REFERENCE",()=>f.prepare({references:["../private"]}));
 });
 await check("SCOPE_DRIFT_REQUIRES_NEW_REVIEW_WITHOUT_RUN",async f=>{
    const m=await f.prepare();f.store.updateEntity("RESOURCE",f.resources[0].id,{title:"Changed source metadata"});
    await rejection("STORAGE_SCOPE_CHANGED",()=>f.execute(m));assert.strictEqual(f.store.db.prepare("SELECT COUNT(*) count FROM stud_operation_runs").get().count,0);
 });
 await check("EXPLICIT_PARTIAL_SELECTION_RECORDS_OMISSIONS",async f=>{
    const m=await f.prepare({references:[f.references[0]]});assert.strictEqual(m.omittedFileCount,1);assert.strictEqual(m.items.length,1);
    await f.execute(m);assert.deepStrictEqual(f.mappings(),[f.external.id,Domain.LOCAL_PROFILE_ID]);
 });
 await check("COPY_FAILURE_AFTER_FIRST_FILE_NEVER_PARTIALLY_SWITCHES",async f=>{
    const m=await f.prepare(),original=f.service.transfer.copy.bind(f.service.transfer);let count=0;
    f.service.transfer.copy=async input=>{if(++count===2)throw new Error(`Sensitive path ${f.local}`);return original(input);};
    await rejection("STORAGE_TRANSFER_FAILED",()=>f.execute(m));assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));
    const result=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id});assert.strictEqual(result.state,"FAILED");assert.ok(!JSON.stringify(result).includes(f.local));
 });
 await check("SQL_SWITCH_FAILURE_ROLLS_BACK_ALL_MAPPINGS_AND_RUN_COMPLETION",async f=>{
    const m=await f.prepare(),original=f.service.repository.switchAsset.bind(f.service.repository);let count=0;
    f.service.repository.switchAsset=(...args)=>{original(...args);if(++count===2)throw new Error("Injected transactional failure");};
    await rejection("STORAGE_TRANSFER_FAILED",()=>f.execute(m));assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));
    const result=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id});assert.strictEqual(result.state,"FAILED");assert.strictEqual(f.service.artifacts.run({assignmentId:f.assignment.id,runId:result.runId}).state,"FAILED");
 });
 await check("CANCELLATION_IS_REAL_AND_DOES_NOT_SWITCH_LOCATIONS",async f=>{
    const m=await f.prepare();setImmediate(()=>{const current=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id});f.service.cancel(f.input(current));});
    await rejection("STORAGE_CANCELLED",()=>f.execute(m));assert.strictEqual(f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id}).state,"CANCELLED");assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));
 });
 await check("PREPARED_CANCELLATION_DOES_NOT_INVENT_RUN",async f=>{
    const m=await f.prepare();assert.strictEqual(f.service.cancel(f.input(m)).state,"CANCELLED");assert.strictEqual(f.store.db.prepare("SELECT COUNT(*) count FROM stud_operation_runs").get().count,0);
 });
 await check("COMPETING_MANIFEST_CANNOT_OVERWRITE_NEWER_MAPPING",async f=>{
    const first=await f.prepare(),second=await f.prepare();await f.execute(first);await rejection("STALE_STORAGE_VERSION",()=>f.execute(second));assert.ok(f.mappings().every(id=>id===f.external.id));
 });
 await check("SOURCE_CHANGED_DURING_COPY_PREVENTS_FINAL_APPLY",async f=>{
    const m=await f.prepare(),original=f.service.transfer.copy.bind(f.service.transfer);let once=false;
    f.service.transfer.copy=async input=>{const result=await original(input);if(!once){once=true;f.store.updateEntity("RESOURCE",f.resources[0].id,{title:"Changed during copy"});}return result;};
    await rejection("STORAGE_SCOPE_CHANGED",()=>f.execute(m));assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));
 });
 await check("RESTART_PRESERVES_APPLIED_MANIFEST_AND_ROLLBACK_IDENTITY",async f=>{
    const m=await f.execute(await f.prepare());f.restart();const current=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id});assert.strictEqual(current.state,"APPLIED");
    assert.ok(f.mappings().every(id=>id===f.external.id));await f.service.rollback(f.input(current));assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));
 });
 await check("RESTART_INTERRUPTION_IS_RECORDED_WITHOUT_COPY_REPLAY",async f=>{
    const m=await f.prepare();f.service.repository.transaction(()=>{const run=f.service.run(m,false);f.service.repository.change(m,"COPYING",{runId:run.id,approve:true});});
    f.restart();assert.strictEqual(f.service.recoverInterrupted(f.assignment.id).inspected,1);
    const current=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id});assert.strictEqual(current.state,"INTERRUPTED");assert.strictEqual(current.errorCode,"STORAGE_INTERRUPTED");assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));
    assert.strictEqual(f.service.artifacts.run({assignmentId:f.assignment.id,runId:current.runId}).state,"FAILED");
 });
 await check("PORTABLE_TO_LOCAL_AND_EXPLICIT_RETURN_USE_REAL_HASHES",async f=>{
    await f.execute(await f.prepare());const portable=await f.prepare({targetProfileId:Domain.LOCAL_PROFILE_ID,purpose:"PORTABLE"});
    const applied=await f.execute(portable);assert.strictEqual(applied.portableReady,false);assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));
    await f.execute(await f.prepare({purpose:"RETURN"}));assert.ok(f.mappings().every(id=>id===f.external.id));
 });
 await check("NO_WRITE_TRANSACTION_IS_HELD_DURING_FILE_IO",async f=>{
    const m=await f.prepare(),copy=f.service.transfer.copy.bind(f.service.transfer),verify=f.service.transfer.verify.bind(f.service.transfer);let calls=0;
    f.service.transfer.copy=async input=>{assert.strictEqual(f.store.transactionDepth,0);calls++;return copy(input);};
    f.service.transfer.verify=async(...args)=>{assert.strictEqual(f.store.transactionDepth,0);calls++;return verify(...args);};
    await f.execute(m);assert.ok(calls>=6);
 });
 await check("VERIFIED_FILE_TAMPER_AT_FINAL_SWITCH_REJECTED",async f=>{
    const m=await f.prepare(),assertVerified=f.service.transfer.assertVerified.bind(f.service.transfer);let tampered=false;
    f.service.transfer.assertVerified=(...args)=>{
        if(!tampered){tampered=true;fs.writeFileSync(f.paths.file(f.external,m.items[0].reference),"late tamper");}
        return assertVerified(...args);
    };
    await rejection("STORAGE_SOURCE_CHANGED",()=>f.execute(m));assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));
 });
 await check("SHARED_OWNER_CHECKSUM_DRIFT_CANNOT_BYPASS_SCOPE_REVIEW",async f=>{
    const owner=f.store.createEntity("RESOURCE",{title:"Shared other-owner source",type:"PDF",localReference:f.references[0],checksum:f.resources[0].checksum});
    const m=await f.prepare();f.store.updateEntity("RESOURCE",owner.id,{checksum:"0".repeat(64)});
    await rejection("STORAGE_SCOPE_CHANGED",()=>f.execute(m));assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));
 });
 await check("ROLLBACK_CANCEL_REMAINS_APPLIED_AND_CAN_BE_REVIEWED_AGAIN",async f=>{
    const m=await f.execute(await f.prepare());setImmediate(()=>{const current=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id});f.service.cancel(f.input(current));});
    await rejection("STORAGE_CANCELLED",()=>f.service.rollback(f.input(m)));
    const current=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id});assert.strictEqual(current.state,"APPLIED");assert.ok(f.mappings().every(id=>id===f.external.id));
    const retry=await f.service.rollback(f.input(current));assert.strictEqual(retry.state,"ROLLED_BACK");
    const prior=f.service.artifacts.run({assignmentId:f.assignment.id,runId:current.rollbackRunId});assert.strictEqual(prior.state,"CANCELLED");assert.strictEqual(prior.parentRunId,m.runId);
 });
 await check("RESTART_DURING_ROLLBACK_LEAVES_PRIOR_APPLIED_LOCATIONS",async f=>{
    const m=await f.execute(await f.prepare());f.service.repository.transaction(()=>{const run=f.service.run(m,true);f.service.repository.change(m,"ROLLING_BACK",{rollbackRunId:run.id});});
    f.restart();f.service.recoverInterrupted(f.assignment.id);const current=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id});assert.strictEqual(current.state,"APPLIED");assert.strictEqual(current.errorCode,"STORAGE_INTERRUPTED");assert.ok(f.mappings().every(id=>id===f.external.id));
 });
 await check("CONCURRENT_EXECUTE_HAS_ONE_OWNER_AND_NO_DUPLICATE_RUN",async f=>{
    const m=await f.prepare(),first=f.execute(m);await rejection("STALE_STORAGE_VERSION",()=>f.execute(m));await first;
    assert.strictEqual(f.store.db.prepare("SELECT COUNT(*) count FROM stud_operation_runs").get().count,1);
 });
 await check("REVIEW_SOURCE_IDENTITIES_AND_LIMITATIONS_SURVIVE_RESTART",async f=>{
    const remote=f.store.createEntity("RESOURCE",{title:"Synthetic remote-only source",assignmentId:f.assignment.id,type:"WEBPAGE",url:"https://example.org/public"});
    const m=await f.prepare();assert.strictEqual(m.sources.length,2);assert.ok(m.reviewIssues.some(issue=>issue.code==="NO_MANAGED_BYTES"&&issue.objectId===remote.id));
    const originalSources=m.sources;f.store.updateEntity("RESOURCE",f.resources[0].id,{title:"Changed after reviewed snapshot"});f.restart();
    const current=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id});assert.deepStrictEqual(current.sources,originalSources);assert.deepStrictEqual(current.reviewIssues,m.reviewIssues);
 });
 await check("RUN_CANCELLED_DURING_FINAL_VERIFICATION_CANNOT_APPLY",async f=>{
    const m=await f.prepare(),verify=f.service.transfer.verify.bind(f.service.transfer);let count=0;
    f.service.transfer.verify=async(...args)=>{const result=await verify(...args);if(++count===6){
        const current=f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id}),run=f.service.artifacts.run({assignmentId:f.assignment.id,runId:current.runId});
        f.service.artifacts.transitionRun({runId:run.id,expectedVersion:run.rowVersion,action:"CANCEL"});
    }return result;};
    await rejection("STORAGE_CANCELLED",()=>f.execute(m));assert.ok(f.mappings().every(id=>id===Domain.LOCAL_PROFILE_ID));
    assert.strictEqual(f.service.inspect({assignmentId:f.assignment.id,manifestId:m.id}).state,"CANCELLED");
 });
 await check("MISSING_PURPOSE_AND_CONCURRENT_STORAGE_WORK_ARE_BOUNDED",async f=>{
    await rejection("INVALID_INPUT",()=>f.prepare({purpose:undefined}));
    const preparation=f.prepare();await rejection("STORAGE_BUSY",()=>f.prepare());const first=await preparation,second=await f.prepare();
    const running=f.execute(first);await rejection("STORAGE_BUSY",()=>f.execute(second));await running;
 });
 console.log(`STUD STORAGE TRANSFERS: ${passed} PASSED`);
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});

#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto");
const {StudStoragePaths,MARKER}=require("../src/classes/workspaces/studStoragePaths.class.js");
const {StudStorageFileTransfer}=require("../src/classes/workspaces/studStorageFileTransfer.class.js");
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"aegis-storage-copy-")));
let passed=0;
async function check(name,work){await work();passed++;console.log(`${name}: PASS`);}
async function reject(code,work){await assert.rejects(work,error=>error.code===code);}
(async()=>{try{
    const local=path.join(root,"local"),mount=path.join(root,"External synthetic"),external=path.join(mount,"academic");
    fs.mkdirSync(path.join(local,"documents"),{recursive:true});fs.mkdirSync(external,{recursive:true});
    let uuid="11111111-1111-1111-1111-111111111111";
    const targetProfile={id:"stud_external_test",kind:"EXTERNAL",volumeUuid:uuid,mountHint:mount,relativeRoot:"academic",identityNonce:"test-only-nonce"};
    fs.writeFileSync(path.join(external,MARKER),JSON.stringify({version:1,profileId:targetProfile.id,nonce:targetProfile.identityNonce}));
    const paths=new StudStoragePaths({localRoot:local,volumeInfo:()=>({uuid,mountPoint:mount})}),transfer=new StudStorageFileTransfer(paths),sourceProfile={id:"stud_storage_local",kind:"LOCAL"};
    const bytes=Buffer.alloc(800000,42),sha256=crypto.createHash("sha256").update(bytes).digest("hex"),reference=`documents/synthetic_${sha256.slice(0,16)}.pdf`;
    const source=path.join(local,reference),destination=path.join(external,reference);fs.writeFileSync(source,bytes);
    const input={sourceProfile,targetProfile,reference,sha256,byteSize:bytes.length};
    await check("STREAMED_COPY_READBACK_HASH_AND_SOURCE_RETAINED",async()=>{
        const progress=[];const result=await transfer.copy({...input,onProgress:p=>progress.push(p)});
        assert.strictEqual(result.reused,false);assert.deepStrictEqual(fs.readFileSync(source),bytes);assert.deepStrictEqual(fs.readFileSync(destination),bytes);
        assert.strictEqual(progress.at(-1).current,bytes.length);assert.ok(progress.every(p=>p.current<=p.total&&p.total===bytes.length&&p.unit==="bytes"));
    });
    await check("VERIFIED_EXISTING_COPY_REUSED_WITHOUT_OVERWRITE",async()=>{const before=fs.statSync(destination);assert.strictEqual((await transfer.copy(input)).reused,true);assert.strictEqual(fs.statSync(destination).ino,before.ino);});
    await check("MISMATCHED_DESTINATION_NEVER_OVERWRITTEN",async()=>{fs.writeFileSync(destination,"existing different data");await reject("STORAGE_HASH_MISMATCH",()=>transfer.copy(input));assert.strictEqual(fs.readFileSync(destination,"utf8"),"existing different data");fs.unlinkSync(destination);});
    await check("CANCELLATION_REMOVES_ONLY_OWNED_STAGE_AND_RETAINS_SOURCE",async()=>{
        const controller=new AbortController();await reject("STORAGE_CANCELLED",()=>transfer.copy({...input,signal:controller.signal,onProgress:()=>controller.abort()}));
        assert.ok(!fs.existsSync(destination));assert.deepStrictEqual(fs.readdirSync(path.dirname(destination)),[]);assert.deepStrictEqual(fs.readFileSync(source),bytes);
    });
    await check("SOURCE_TAMPER_REJECTED_WITHOUT_PUBLISHED_COPY",async()=>{let changed=false;await reject("STORAGE_SOURCE_CHANGED",()=>transfer.copy({...input,onProgress:()=>{if(!changed){changed=true;fs.writeFileSync(source,Buffer.alloc(bytes.length,43));}}}));assert.ok(!fs.existsSync(destination));fs.writeFileSync(source,bytes);});
    await check("SOURCE_TAMPER_AFTER_LAST_CHUNK_REJECTED",async()=>{
        await reject("STORAGE_SOURCE_CHANGED",()=>transfer.copy({...input,onProgress:progress=>{if(progress.current===bytes.length)fs.writeFileSync(source,Buffer.alloc(bytes.length,44));}}));
        assert.ok(!fs.existsSync(destination));fs.writeFileSync(source,bytes);
    });
    await check("INCORRECT_MANIFEST_HASH_REJECTED",async()=>{await reject("STORAGE_HASH_MISMATCH",()=>transfer.copy({...input,sha256:"0".repeat(64)}));assert.ok(!fs.existsSync(destination));});
    await check("TARGET_VOLUME_CHANGE_DURING_COPY_FAILS_CLOSED",async()=>{
        await reject("WRONG_STORAGE_VOLUME",()=>transfer.copy({...input,onProgress:()=>{uuid="22222222-2222-2222-2222-222222222222";}}));assert.ok(!fs.existsSync(destination));
        uuid=targetProfile.volumeUuid;
        // Test harness only: inspect and remove synthetic stages left deliberately
        // untouched while the target identity was invalid.
        for(const name of fs.readdirSync(path.dirname(destination))){assert.ok(name.startsWith(".aegis-copy-"));fs.unlinkSync(path.join(path.dirname(destination),name));}
    });
    await check("PUBLISH_RACE_CANNOT_OVERWRITE_AN_EXISTING_FILE",async()=>{
        let inserted=false;await reject("STORAGE_COPY_FAILED",()=>transfer.copy({...input,onProgress:()=>{if(!inserted){inserted=true;fs.writeFileSync(destination,"racing file",{flag:"wx"});}}}));assert.strictEqual(fs.readFileSync(destination,"utf8"),"racing file");fs.unlinkSync(destination);
    });
    await check("SYMLINK_DESTINATION_CANNOT_WRITE_OUTSIDE_MANAGED_ROOT",async()=>{const outside=path.join(root,"outside");fs.writeFileSync(outside,"safe");fs.symlinkSync(outside,destination);await reject("UNSAFE_STORAGE_PATH",()=>transfer.copy(input));assert.strictEqual(fs.readFileSync(outside,"utf8"),"safe");fs.unlinkSync(destination);});
    await check("INSUFFICIENT_SPACE_REJECTED_BEFORE_COPY",async()=>{
        const original=fs.statfsSync;fs.statfsSync=()=>({bavail:0,bsize:4096});try{await reject("STORAGE_SPACE_REQUIRED",()=>transfer.copy(input));assert.ok(!fs.existsSync(destination));}finally{fs.statfsSync=original;}
    });
    await check("RESTART_VERIFIES_PERSISTED_BYTES_WITHOUT_REPLAY",async()=>{await transfer.copy(input);const restarted=new StudStorageFileTransfer(paths);assert.strictEqual((await restarted.verify(targetProfile,reference,input)).sha256,sha256);});
    await check("SAME_PROFILE_AND_OVERSIZED_INPUT_REJECTED",async()=>{await reject("SAME_STORAGE_PROFILE",()=>transfer.copy({...input,targetProfile:sourceProfile}));await reject("STORAGE_FILE_LIMIT",()=>transfer.copy({...input,byteSize:Number.MAX_SAFE_INTEGER}));});
    console.log(`STUD STORAGE FILE TRANSFER: ${passed} PASSED (synthetic files; no mappings or Runs mutated)`);
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});

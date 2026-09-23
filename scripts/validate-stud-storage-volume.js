#!/usr/bin/env node
"use strict";

// Explicit macOS-only validation. Only this script's disposable disk image is
// attached/detached. It never ejects a user's existing disk or reads STUD data.
const assert=require("assert"),fs=require("fs"),path=require("path"),os=require("os"),crypto=require("crypto");
const {execFileSync}=require("child_process");
const {StudStoragePaths,MARKER}=require("../src/classes/workspaces/studStoragePaths.class.js");
const {StudStorageFileTransfer}=require("../src/classes/workspaces/studStorageFileTransfer.class.js");
if(process.platform!=="darwin"){console.log("STUD STORAGE VOLUME: SKIPPED (requires macOS)");process.exit(0);}
const root=fs.realpathSync(fs.mkdtempSync(path.join(process.env.AEGIS_TEST_ARTIFACT_ROOT||os.tmpdir(),"aegis-m14-volume-")));
const image=path.join(root,"synthetic-storage.dmg"),local=path.join(root,"metadata");
fs.mkdirSync(local);
let mounted=null,stage="create";
const native=args=>{stage=args[0];return execFileSync("/usr/bin/hdiutil",args,{timeout:45000,maxBuffer:128*1024,stdio:["ignore","pipe","pipe"]});};
function attach(){
    const plist=native(["attach","-nobrowse","-plist",image]);
    const result=JSON.parse(execFileSync("/usr/bin/plutil",["-convert","json","-o","-","-"],{input:plist,encoding:"utf8",timeout:5000,maxBuffer:128*1024}));
    const entries=(result["system-entities"]||[]).filter(item=>item["mount-point"]);
    assert.strictEqual(entries.length,1);mounted=entries[0]["mount-point"];return mounted;
}
(async()=>{try{
    native(["create","-size","32m","-fs","HFS+","-volname","STUD-SYNTHETIC",image]);
    const mountA=attach();
    const paths=new StudStoragePaths({localRoot:local}),selected=paths.externalSelection(mountA);
    const profile={id:"stud_storage_live_test",kind:"EXTERNAL",volumeUuid:selected.volumeUuid,mountHint:selected.mountPoint,relativeRoot:"academic",identityNonce:"synthetic-validation-marker"};
    const folder=path.join(mountA,"academic");fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,MARKER),JSON.stringify({version:1,profileId:profile.id,nonce:profile.identityNonce}));
    const bytes=Buffer.from("%PDF-synthetic-volume-check"),sha256=crypto.createHash("sha256").update(bytes).digest("hex");
    const reference=`documents/paper_${sha256.slice(0,16)}.pdf`,sourceProfile={id:"stud_storage_local",kind:"LOCAL"};
    fs.writeFileSync(paths.file(sourceProfile,reference,{createDirectory:true}),bytes);
    const transfer=new StudStorageFileTransfer(paths);
    await transfer.copy({sourceProfile,targetProfile:profile,reference,sha256,byteSize:bytes.length});
    assert.strictEqual(paths.profileRoot(profile),folder);
    native(["detach",mountA]);mounted=null;
    assert.throws(()=>paths.file(profile,reference),error=>error.code==="STORAGE_OFFLINE");
    assert.ok(fs.existsSync(local));
    const mountB=attach();
    const reselected=paths.externalSelection(mountB);
    assert.strictEqual(reselected.volumeUuid,profile.volumeUuid);
    const reconnected={...profile,mountHint:reselected.mountPoint};
    assert.strictEqual(fs.readFileSync(paths.file(reconnected,reference),"utf8"),"%PDF-synthetic-volume-check");
    await transfer.verify(reconnected,reference,{sha256,byteSize:bytes.length});
    assert.throws(()=>paths.profileRoot({...reconnected,volumeUuid:"00000000-0000-0000-0000-000000000000"}),error=>error.code==="WRONG_STORAGE_VOLUME");
    console.log(JSON.stringify({status:"PASS",realDisposableVolume:true,volumeUuidStableAcrossRemount:true,offlineReadRejected:true,remountVerified:true,mountLocationChanged:mountA!==mountB,markerVerified:true,metadataRetained:true,wrongVolumeRejected:true,exclusiveCopyVerified:true,readbackHashAfterRemount:true,realAcademicDataTouched:false}));
}catch(error){console.error(JSON.stringify({status:"FAIL",stage,code:error.code||"VOLUME_VALIDATION_FAILED",detail:String(error.stderr||error.message||"").replaceAll(root,"[synthetic fixture]").slice(0,1200)}));process.exitCode=1;}
finally{
    if(mounted){try{native(["detach",mounted]);mounted=null;}catch(_error){console.error("Disposable validation volume could not be detached; no files were removed.");process.exitCode=1;}}
    if(!mounted)fs.rmSync(root,{recursive:true,force:true});
}})();

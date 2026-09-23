#!/usr/bin/env node
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path");
const {StudStoragePaths,managedReference,MARKER}=require("../src/classes/workspaces/studStoragePaths.class.js");
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"aegis-storage-paths-")));
let passed=0;
function check(name,work){work();passed++;console.log(`${name}: PASS`);}
function expect(code,work){assert.throws(work,error=>error.code===code);}
try {
    const local=path.join(root,"local"),mount=path.join(root,"Synthetic volume"),external=path.join(mount,"academic");
    fs.mkdirSync(local);fs.mkdirSync(external,{recursive:true});
    let uuid="11111111-1111-1111-1111-111111111111";
    const paths=new StudStoragePaths({localRoot:local,volumeInfo:()=>({uuid,mountPoint:mount})});
    const profile={id:"stud_storage_test",kind:"EXTERNAL",volumeUuid:uuid,mountHint:mount,relativeRoot:"academic",identityNonce:"synthetic-profile-identity"};
    fs.writeFileSync(path.join(external,MARKER),JSON.stringify({version:1,profileId:profile.id,nonce:profile.identityNonce}));
    const pdf="documents/paper_0123456789abcdef.pdf";
    check("EXISTING_MANAGED_NAMESPACES_ONLY",()=>{
        for(const ref of [pdf,"datasets/lab_data_0123456789abcdef.csv","datasets/a..b_0123456789abcdef.csv","moodle-files/moodle_file_0123456789abcdef.docx"])assert.strictEqual(managedReference(ref),ref);
        for(const ref of ["../academic.sqlite","documents/../academic.sqlite","/etc/passwd","documents/%2fsecret.pdf","documents/a%5cb.pdf","documents/a?token=secret","documents/a#fragment","documents/a%252f.pdf","datasets/../a_0123456789abcdef.csv","moodle-files/.env",null,{}])expect("INVALID_MANAGED_REFERENCE",()=>managedReference(ref));
    });
    check("EXPLICIT_SELECTION_PRESERVES_VOLUME_IDENTITY",()=>{assert.strictEqual(paths.externalSelection(external).volumeUuid,uuid);assert.strictEqual(paths.profileRoot(profile),external);});
    check("LOCAL_METADATA_ROOT_NEVER_FOLLOWS_EXTERNAL_PROFILE",()=>assert.strictEqual(paths.profileRoot({kind:"LOCAL"}),local));
    check("DISCONNECTED_PROFILE_IS_NOT_RECREATED",()=>{
        fs.renameSync(mount,`${mount}-absent`);expect("STORAGE_OFFLINE",()=>paths.file(profile,pdf,{createDirectory:true}));assert.ok(!fs.existsSync(mount));fs.renameSync(`${mount}-absent`,mount);
    });
    check("WRONG_VOLUME_WITH_COPIED_MARKER_REJECTED",()=>{uuid="22222222-2222-2222-2222-222222222222";expect("WRONG_STORAGE_VOLUME",()=>paths.profileRoot(profile));uuid=profile.volumeUuid;});
    check("WRONG_MARKER_REJECTED",()=>expect("WRONG_STORAGE_VOLUME",()=>paths.profileRoot({...profile,identityNonce:"other"})));
    check("ROOT_TRAVERSAL_REJECTED",()=>expect("INVALID_STORAGE_PROFILE",()=>paths.profileRoot({...profile,relativeRoot:"../local"})));
    check("VALID_MANAGED_FILE_WITH_SPACED_VOLUME_NAME",()=>{const file=paths.file(profile,pdf,{createDirectory:true});fs.writeFileSync(file,"%PDF-synthetic");assert.strictEqual(paths.file(profile,pdf),file);});
    check("FILE_SYMLINK_AND_DANGLING_SYMLINK_REJECTED",()=>{
        const file=path.join(external,pdf);fs.unlinkSync(file);fs.symlinkSync(path.join(root,"missing"),file);expect("UNSAFE_STORAGE_PATH",()=>paths.file(profile,pdf));fs.unlinkSync(file);fs.writeFileSync(file,"%PDF-synthetic");
    });
    check("PARENT_DIRECTORY_SYMLINK_REJECTED",()=>{
        fs.symlinkSync(local,path.join(external,"datasets"));expect("UNSAFE_STORAGE_PATH",()=>paths.file(profile,"datasets/data_0123456789abcdef.csv"));fs.unlinkSync(path.join(external,"datasets"));
    });
    check("HARD_LINKED_FILE_REJECTED",()=>{const file=path.join(external,pdf),alias=path.join(root,"alias");fs.linkSync(file,alias);expect("UNSAFE_STORAGE_PATH",()=>paths.file(profile,pdf));fs.unlinkSync(alias);});
    check("PROFILE_RESTART_RESOLUTION",()=>{const restarted=new StudStoragePaths({localRoot:local,volumeInfo:()=>({uuid,mountPoint:mount})});assert.strictEqual(restarted.file(profile,pdf),path.join(external,pdf));});
    console.log(`STUD STORAGE PATHS: ${passed} PASSED (synthetic volume provider; not a real remount test)`);
} finally {fs.rmSync(root,{recursive:true,force:true});}

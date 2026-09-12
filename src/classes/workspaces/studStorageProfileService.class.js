"use strict";

const fs=require("fs"),path=require("path"),crypto=require("crypto");
const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studStorageModel.class.js");
const {StudStorageRepository}=require("./studStorageRepository.class.js");
const {StudStoragePaths,MARKER,assertDirectory}=require("./studStoragePaths.class.js");
const {StudStorageFileTransfer}=require("./studStorageFileTransfer.class.js");

class StudStorageProfileService {
    constructor({store,repository,paths,dialog}) {
        this.repository=repository||new StudStorageRepository(store);
        this.paths=paths||new StudStoragePaths({localRoot:store.root});
        this.dialog=dialog;
    }
    publicProfile(profile) {
        // Paths and marker identities are implementation details, never renderer data.
        let availability="AVAILABLE",availableBytes=null;
        try { const root=this.paths.profileRoot(profile),space=fs.statfsSync(root); availableBytes=space.bavail*space.bsize; }
        catch(error) { availability=["STORAGE_OFFLINE","WRONG_STORAGE_VOLUME","UNSAFE_STORAGE_PATH","VOLUME_IDENTITY_UNAVAILABLE"].includes(error.code)?error.code:"STORAGE_UNAVAILABLE"; }
        return Object.freeze({id:profile.id,kind:profile.kind,label:profile.label,rowVersion:profile.rowVersion,availability,availableBytes});
    }
    profiles() { return this.repository.profiles().map(value=>this.publicProfile(value)); }
    async selectDirectory(title) {
        if(!this.dialog?.showOpenDialog) Domain.fail("FILE_DIALOG_UNAVAILABLE","The native storage selector is unavailable.");
        try {
            return await this.dialog.showOpenDialog({title,properties:["openDirectory"]});
        } catch(_error) {
            Domain.fail("FILE_DIALOG_UNAVAILABLE","The native storage selector could not be opened.");
        }
    }
    async chooseExternal(input={}) {
        Academic.assertAllowedKeys(input,["label"],"Storage profile selection");
        const label=Academic.requiredText(input.label,"Storage label",120);
        const selection=await this.selectDirectory("Choose a folder for academic files");
        if(selection.canceled||!selection.filePaths?.length) return Object.freeze({cancelled:true});
        return Object.freeze({cancelled:false,profile:this.publicProfile(this.registerSelectedDirectory(selection.filePaths[0],label))});
    }
    registerSelectedDirectory(directory,label) {
        // Internal main-only entry point. Only the native selector supplies paths.
        label=Academic.requiredText(label,"Storage label",120);
        const selected=this.paths.externalSelection(directory);
        if(this.repository.profiles().length>=Domain.LIMITS.profiles) Domain.fail("STORAGE_PROFILE_LIMIT","The storage profile limit has been reached.");
        const id=Academic.createId("storage_profile"),identityNonce=crypto.randomBytes(32).toString("hex");
        const child=`aegis-academic-${id}`,root=path.join(selected.selected,child);
        const profile={id,kind:"EXTERNAL",label,volumeUuid:selected.volumeUuid,mountHint:selected.mountPoint,relativeRoot:path.relative(selected.mountPoint,root),identityNonce};
        // An exclusive app-owned child avoids claiming or deleting pre-existing data.
        try {
            fs.mkdirSync(root,{mode:0o700});
            assertDirectory(root);
            fs.writeFileSync(path.join(root,MARKER),JSON.stringify({version:1,profileId:id,nonce:identityNonce}),{flag:"wx",mode:0o600});
            this.paths.profileRoot(profile);
            return this.repository.transaction(()=>this.repository.insertProfile(profile));
        } catch(error) {
            // Never recursively remove a directory after an identity/race failure.
            // A failed setup may leave only its own marker for explicit inspection.
            if(error instanceof Academic.StudError) throw error;
            Domain.fail("STORAGE_SETUP_FAILED","The storage profile could not be registered. No academic files were moved.");
        }
    }
    async reconnect(input={}) {
        Academic.assertAllowedKeys(input,["profileId","expectedVersion"],"Reconnect storage");
        const current=this.repository.profile(input.profileId);
        this.repository.assertVersion(current,input.expectedVersion);
        if(current.kind!=="EXTERNAL") Domain.fail("INVALID_STORAGE_PROFILE","Local storage does not need reconnection.");
        const selection=await this.selectDirectory("Locate the same academic storage folder");
        if(selection.canceled||!selection.filePaths?.length)return Object.freeze({cancelled:true});
        const selected=this.paths.externalSelection(selection.filePaths[0]);
        if(selected.relative!==current.relativeRoot||selected.volumeUuid!==current.volumeUuid) Domain.fail("WRONG_STORAGE_VOLUME","Select the original academic folder on its original volume.");
        const candidate={...current,mountHint:selected.mountPoint};
        this.paths.profileRoot(candidate);
        const saved=this.repository.transaction(()=>this.repository.reconnect(current,selected.mountPoint,input.expectedVersion));
        return Object.freeze({cancelled:false,profile:this.publicProfile(saved)});
    }
    resolveManaged(reference) {
        Domain.managedReference(reference);
        const asset=this.repository.asset(reference);
        return this.paths.file(this.repository.profile(asset?.activeProfileId||Domain.LOCAL_PROFILE_ID),reference);
    }
    inspectCanonicalFile(reference) {
        const owners=this.repository.canonicalOwners(reference);
        if(!owners.length) Domain.fail("UNOWNED_MANAGED_REFERENCE","The file has no canonical academic owner.");
        if(owners.length>Domain.LIMITS.manifestItems) Domain.fail("STORAGE_OWNER_LIMIT","Too many canonical owners to inspect safely in one operation.");
        let fd;
        try {
            const absolute=this.resolveManaged(reference);
            fd=fs.openSync(absolute,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
            const before=fs.fstatSync(fd);
            if(!before.isFile()||before.nlink!==1||before.size>Domain.LIMITS.fileBytes) Domain.fail("UNSAFE_STORAGE_FILE","The managed file is not a supported regular bounded file.");
            const hash=crypto.createHash("sha256"),buffer=Buffer.alloc(256*1024);
            let count=0,bytes;
            while((bytes=fs.readSync(fd,buffer,0,Math.min(buffer.length,Domain.LIMITS.fileBytes-count+1),null))>0) {
                count+=bytes;
                if(count>Domain.LIMITS.fileBytes)Domain.fail("STORAGE_FILE_LIMIT","The file changed beyond the supported size during verification.");
                hash.update(buffer.subarray(0,bytes));
            }
            const after=fs.fstatSync(fd),named=fs.lstatSync(this.resolveManaged(reference));
            if(before.dev!==named.dev||before.ino!==named.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||after.nlink!==1) Domain.fail("STORAGE_SOURCE_CHANGED","The managed file changed during verification.");
            const sha256=hash.digest("hex");
            if(owners.some(owner=>owner.checksum!==null&&(typeof owner.checksum!=="string"||!/^[a-f0-9]{64}$/i.test(owner.checksum)))) Domain.fail("STORAGE_SOURCE_METADATA_INVALID","A canonical owner contains invalid checksum metadata. Review the source before transferring it.");
            if(owners.some(owner=>owner.checksum&&owner.checksum.toLowerCase()!==sha256)) Domain.fail("STORAGE_HASH_MISMATCH","The file no longer matches its canonical checksum.");
            if(!reference.toLowerCase().includes(`_${sha256.slice(0,16)}.`)) Domain.fail("STORAGE_HASH_MISMATCH","The file no longer matches its original managed reference identity.");
            const existing=this.repository.asset(reference);
            if(existing&&(existing.sha256!==sha256||existing.byteSize!==count)) Domain.fail("STORAGE_HASH_MISMATCH","The file no longer matches the stored asset identity.");
            return Object.freeze({reference,sha256,byteSize:count,ownerCount:owners.length,asset:existing});
        } catch(error) {
            if(error instanceof Academic.StudError)throw error;
            Domain.fail("STORAGE_FILE_UNAVAILABLE","The managed academic file cannot be verified.");
        } finally { if(fd!==undefined)fs.closeSync(fd); }
    }
    registerCanonicalFile(reference) {
        const inspected=this.inspectCanonicalFile(reference);
        if(inspected.asset)return inspected.asset;
        return this.repository.transaction(()=>this.repository.registerLocal(reference,inspected.sha256,inspected.byteSize));
    }
    async inspectCanonicalFileAsync(reference,{signal}={}) {
        const owners=this.repository.canonicalOwners(reference),asset=this.repository.asset(reference);
        if(!owners.length)Domain.fail("UNOWNED_MANAGED_REFERENCE","The file has no canonical academic owner.");
        if(owners.length>Domain.LIMITS.manifestItems)Domain.fail("STORAGE_OWNER_LIMIT","Too many canonical owners to verify in one operation.");
        try{
            const profile=this.repository.profile(asset?.activeProfileId||Domain.LOCAL_PROFILE_ID);
            const verified=await new StudStorageFileTransfer(this.paths).verify(profile,reference,asset?{sha256:asset.sha256,byteSize:asset.byteSize}:null,signal);
            if(JSON.stringify(owners)!==JSON.stringify(this.repository.canonicalOwners(reference))||JSON.stringify(asset)!==JSON.stringify(this.repository.asset(reference)))Domain.fail("STORAGE_SOURCE_CHANGED","Canonical source or storage mapping changed during verification.");
            if(owners.some(owner=>owner.checksum!==null&&(typeof owner.checksum!=="string"||!/^[a-f0-9]{64}$/i.test(owner.checksum))))Domain.fail("STORAGE_SOURCE_METADATA_INVALID","A canonical owner contains invalid checksum metadata.");
            if(owners.some(owner=>owner.checksum&&owner.checksum.toLowerCase()!==verified.sha256)||!reference.toLowerCase().includes(`_${verified.sha256.slice(0,16)}.`))Domain.fail("STORAGE_HASH_MISMATCH","The file differs from its canonical source identity.");
            return Object.freeze({...verified,ownerCount:owners.length,asset});
        }catch(error){if(error instanceof Academic.StudError)throw error;Domain.fail("STORAGE_FILE_UNAVAILABLE","The managed academic file cannot be verified.");}
    }
}
module.exports=Object.freeze({StudStorageProfileService});

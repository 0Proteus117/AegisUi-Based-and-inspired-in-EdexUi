"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studStorageModel.class.js");

// Injected into fixed main-process import/read runtimes; never exposed directly
// to preload. Canonical SQLite, vault and provider sessions are not file assets.
class StudManagedStorageRuntime {
    constructor(storage){this.storage=storage;this.assets=storage.repository;this.paths=storage.paths;}
    selection(reference){
        Domain.managedReference(reference);const asset=this.assets.asset(reference);
        return {asset,profile:this.assets.profile(asset?.activeProfileId||Domain.LOCAL_PROFILE_ID)};
    }
    read(reference,maxBytes=Domain.LIMITS.fileBytes){
        if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>Domain.LIMITS.fileBytes)Domain.fail("STORAGE_FILE_LIMIT","Invalid managed read bound.");
        let fd;
        try{
            const {asset,profile}=this.selection(reference),file=this.paths.file(profile,reference);
            fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const before=fs.fstatSync(fd);
            if(!before.isFile()||before.nlink!==1||before.size>maxBytes)Domain.fail("STORAGE_FILE_LIMIT","The managed file is not a supported bounded regular file.");
            const bytes=Buffer.alloc(before.size);let count=0;
            while(count<bytes.length){const read=fs.readSync(fd,bytes,count,bytes.length-count,null);if(!read)break;count+=read;}
            const after=fs.fstatSync(fd),named=fs.lstatSync(this.paths.file(profile,reference));
            if(count!==before.size||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||after.nlink!==1||named.dev!==before.dev||named.ino!==before.ino)
                Domain.fail("STORAGE_SOURCE_CHANGED","The managed file changed while it was read.");
            const sha256=crypto.createHash("sha256").update(bytes).digest("hex");
            this.assertIdentity(reference,bytes,sha256,asset);return bytes;
        }catch(error){if(error instanceof Academic.StudError)throw error;Domain.fail("STORAGE_FILE_UNAVAILABLE","The managed academic file is unavailable.");}
        finally{if(fd!==undefined)fs.closeSync(fd);}
    }
    assertIdentity(reference,bytes,sha256,asset){
        if(!reference.toLowerCase().includes(`_${sha256.slice(0,16)}.`)||(asset&&(asset.sha256!==sha256||asset.byteSize!==bytes.length)))
            Domain.fail("STORAGE_HASH_MISMATCH","The bytes differ from their managed reference identity.");
        const owners=this.assets.canonicalOwners(reference);
        if(owners.length>Domain.LIMITS.manifestItems)Domain.fail("STORAGE_OWNER_LIMIT","Too many canonical owners to verify safely.");
        if(owners.some(owner=>owner.checksum!==null&&(typeof owner.checksum!=="string"||!/^[a-f0-9]{64}$/i.test(owner.checksum))))
            Domain.fail("STORAGE_SOURCE_METADATA_INVALID","A canonical owner has invalid checksum metadata.");
        if(owners.some(owner=>owner.checksum&&owner.checksum.toLowerCase()!==sha256))Domain.fail("STORAGE_HASH_MISMATCH","Canonical source checksums disagree with the managed bytes.");
    }
    exists(reference){
        try{
            const {profile}=this.selection(reference);
            // A missing/offline mapped profile is not a request to download a
            // replacement to the local profile. Never silently change location.
            this.paths.profileRoot(profile);
            try{return fs.existsSync(this.paths.file(profile,reference));}
            catch(error){if(error.code==="ENOENT")return false;throw error;}
        }catch(error){if(error instanceof Academic.StudError)throw error;Domain.fail("STORAGE_FILE_UNAVAILABLE","The managed academic file cannot be inspected.");}
    }
    put(reference,bytes){
        if(!Buffer.isBuffer(bytes)||bytes.length>Domain.LIMITS.fileBytes)Domain.fail("STORAGE_FILE_LIMIT","Only bounded managed bytes can be imported.");
        const {asset,profile}=this.selection(reference),sha256=crypto.createHash("sha256").update(bytes).digest("hex");
        this.assertIdentity(reference,bytes,sha256,asset);
        let stage,stageIdentity,fd;
        try{
            const destination=this.paths.file(profile,reference,{createDirectory:true});
            if(fs.existsSync(destination)){
                if(!this.read(reference).equals(bytes))Domain.fail("STORAGE_HASH_MISMATCH","Existing managed bytes do not match this import.");
                return {reference,sha256,size:bytes.length,reused:true};
            }
            stage=path.join(path.dirname(destination),`.aegis-import-${crypto.randomBytes(16).toString("hex")}.part`);
            fd=fs.openSync(stage,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);stageIdentity=fs.fstatSync(fd);
            fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
            this.paths.file(profile,reference);const named=fs.lstatSync(stage);
            if(named.dev!==stageIdentity.dev||named.ino!==stageIdentity.ino||named.nlink!==1)Domain.fail("STORAGE_SOURCE_CHANGED","The staged import changed identity.");
            fs.linkSync(stage,destination);fs.unlinkSync(stage);stage=null;this.read(reference);
            return {reference,sha256,size:bytes.length,reused:false};
        }catch(error){if(error instanceof Academic.StudError)throw error;Domain.fail(error.code==="ENOSPC"?"STORAGE_SPACE_REQUIRED":"STORAGE_IMPORT_FAILED","Managed import failed without changing active storage locations.");}
        finally{
            if(fd!==undefined)fs.closeSync(fd);
            if(stage&&stageIdentity)try{
                this.paths.profileRoot(profile);const named=fs.lstatSync(stage);
                if(named.isFile()&&named.nlink===1&&named.dev===stageIdentity.dev&&named.ino===stageIdentity.ino)fs.unlinkSync(stage);
            }catch(_error){/* Do not clean an unverified/disconnected location. */}
        }
    }
}
module.exports=Object.freeze({StudManagedStorageRuntime});

"use strict";

const fs=require("fs"),path=require("path"),crypto=require("crypto");
const Domain=require("./studStorageModel.class.js");
const {setImmediate:yieldTurn}=require("timers/promises");
const CHUNK_BYTES=256*1024;
function cancelled(signal){if(signal?.aborted)Domain.fail("STORAGE_CANCELLED","The transfer was cancelled; active references were not changed.");}
function sameFile(a,b){return a.dev===b.dev&&a.ino===b.ino;}
function unchanged(a,b){return sameFile(a,b)&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&b.nlink===1;}
function receipt(stat){return {dev:stat.dev,ino:stat.ino,size:stat.size,mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs};}
function expected(input){
    Domain.digest(input.sha256);
    if(!Number.isSafeInteger(input.byteSize)||input.byteSize<0||input.byteSize>Domain.LIMITS.fileBytes)Domain.fail("STORAGE_FILE_LIMIT","The planned file is outside storage transfer bounds.");
}
function openRegular(file){
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.nlink!==1||stat.size>Domain.LIMITS.fileBytes){fs.closeSync(fd);Domain.fail("UNSAFE_STORAGE_FILE","Only bounded regular managed files can be transferred.");}
    return {fd,stat};
}

// Byte transfer only. Main-owned manifests select inputs. This class cannot
// change mappings, canonical records or Run state and is never exposed by IPC.
class StudStorageFileTransfer {
    constructor(paths){this.paths=paths;}
    async verify(profile,reference,input,signal){
        if(input)expected(input);cancelled(signal);
        let opened;
        try{
            const file=this.paths.file(profile,reference);opened=openRegular(file);
            const hash=crypto.createHash("sha256"),buffer=Buffer.alloc(CHUNK_BYTES);let count=0,size;
            while((size=fs.readSync(opened.fd,buffer,0,buffer.length,null))>0){
                count+=size;if(count>(input?.byteSize??Domain.LIMITS.fileBytes))Domain.fail("STORAGE_HASH_MISMATCH","The file size differs from the approved manifest or storage bounds.");
                hash.update(buffer.subarray(0,size));await yieldTurn();cancelled(signal);
            }
            const final=fs.fstatSync(opened.fd),named=fs.lstatSync(this.paths.file(profile,reference));
            if(!unchanged(opened.stat,final)||!sameFile(final,named))Domain.fail("STORAGE_SOURCE_CHANGED","The managed file changed during verification.");
            const sha256=hash.digest("hex");
            if(input&&(count!==input.byteSize||sha256!==input.sha256))Domain.fail("STORAGE_HASH_MISMATCH","The file differs from the approved manifest hash.");
            return {reference,sha256,byteSize:count,verificationReceipt:receipt(final)};
        }finally{if(opened)fs.closeSync(opened.fd);}
    }
    assertVerified(profile,reference,verified){
        // Main-only, synchronous last check before a multi-file mapping commit.
        // A subsequent verification must not hide an earlier file replacement.
        const named=fs.lstatSync(this.paths.file(profile,reference));
        if(!verified?.verificationReceipt||!named.isFile()||!unchanged(verified.verificationReceipt,named))
            Domain.fail("STORAGE_SOURCE_CHANGED","A verified file changed before the location switch.");
    }
    async copy({sourceProfile,targetProfile,reference,sha256,byteSize,signal,onProgress=()=>{}}){
        const identity={sha256,byteSize};expected(identity);Domain.managedReference(reference);cancelled(signal);
        if(sourceProfile.id===targetProfile.id)Domain.fail("SAME_STORAGE_PROFILE","Source and target storage must differ.");
        let source,tempFd,temp,tempIdentity,published=false;
        try{
            const sourceFile=this.paths.file(sourceProfile,reference),destination=this.paths.file(targetProfile,reference,{createDirectory:true});
            const targetRoot=this.paths.profileRoot(targetProfile),capacity=fs.statfsSync(targetRoot);
            if(fs.existsSync(destination)){
                await this.verify(sourceProfile,reference,identity,signal);
                await this.verify(targetProfile,reference,identity,signal);
                return Object.freeze({...identity,reference,reused:true});
            }
            if(capacity.bavail*capacity.bsize<byteSize+1024*1024)Domain.fail("STORAGE_SPACE_REQUIRED","Target storage lacks room for the verified copy and safety margin.");
            source=openRegular(sourceFile);
            if(source.stat.size!==byteSize)Domain.fail("STORAGE_SOURCE_CHANGED","Source size changed after the transfer was prepared.");
            temp=path.join(path.dirname(destination),`.aegis-copy-${crypto.randomBytes(16).toString("hex")}.part`);
            tempFd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
            tempIdentity=fs.fstatSync(tempFd);
            const hash=crypto.createHash("sha256"),buffer=Buffer.alloc(CHUNK_BYTES);let count=0,size;
            while((size=fs.readSync(source.fd,buffer,0,buffer.length,null))>0){
                cancelled(signal);count+=size;
                if(count>byteSize)Domain.fail("STORAGE_SOURCE_CHANGED","Source grew during transfer.");
                hash.update(buffer.subarray(0,size));
                let written=0;while(written<size){const amount=fs.writeSync(tempFd,buffer,written,size-written);if(amount<=0)Domain.fail("STORAGE_COPY_FAILED","The target did not accept the staged bytes.");written+=amount;}
                onProgress(Object.freeze({current:count,total:byteSize,unit:"bytes"}));await yieldTurn();
            }
            cancelled(signal);
            const finalSource=fs.fstatSync(source.fd),namedSource=fs.lstatSync(this.paths.file(sourceProfile,reference));
            if(!unchanged(source.stat,finalSource)||!sameFile(finalSource,namedSource))Domain.fail("STORAGE_SOURCE_CHANGED","Source changed while it was copied.");
            if(count!==byteSize||hash.digest("hex")!==sha256)Domain.fail("STORAGE_HASH_MISMATCH","Copied bytes differ from the approved source hash.");
            this.paths.file(targetProfile,reference); // recheck volume, marker and path before publication
            const staged=fs.lstatSync(temp),descriptor=fs.fstatSync(tempFd);
            if(!sameFile(staged,tempIdentity)||!sameFile(descriptor,tempIdentity)||staged.nlink!==1)Domain.fail("UNSAFE_STORAGE_FILE","The staged copy changed identity.");
            fs.fsyncSync(tempFd);fs.closeSync(tempFd);tempFd=undefined;
            // link+unlink publishes exclusively without overwriting an existing
            // destination (rename would overwrite on macOS/POSIX).
            fs.linkSync(temp,destination);published=true;fs.unlinkSync(temp);temp=null;
            const verified=await this.verify(targetProfile,reference,identity,signal);
            return Object.freeze({...verified,reused:false});
        }catch(error){
            if(error?.code&&["STORAGE_","UNSAFE_","INVALID_","WRONG_","SAME_","VOLUME_"].some(prefix=>error.code.startsWith(prefix)))throw error;
            Domain.fail(error.code==="ENOSPC"?"STORAGE_SPACE_REQUIRED":"STORAGE_COPY_FAILED",published?"Copy verification failed; active references are unchanged. Inspect the retained copy before retrying.":"The file could not be copied safely. Active references are unchanged.");
        }finally{
            if(source)fs.closeSync(source.fd);if(tempFd!==undefined)fs.closeSync(tempFd);
            if(temp&&tempIdentity){
                try{
                    this.paths.profileRoot(targetProfile);
                    const named=fs.lstatSync(temp);
                    if(sameFile(named,tempIdentity)&&named.isFile()&&named.nlink===1)fs.unlinkSync(temp);
                }catch(_error){/* disconnected or changed target: never delete an unverified path */}
            }
        }
    }
}
module.exports=Object.freeze({StudStorageFileTransfer});

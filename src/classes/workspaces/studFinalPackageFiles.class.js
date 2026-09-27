"use strict";
const fs=require("fs"),path=require("path");
const Academic=require("./studAcademicModel.class.js");
const D=require("./studFinalPackageModel.class.js");
const {assertDirectory}=require("./studStoragePaths.class.js");

// No renderer-selected paths. Packages are immutable files under the main-owned
// academic root; export obtains a destination exclusively from the native picker.
class StudFinalPackageFiles {
    constructor({root,dialog,shell}) { this.root=fs.realpathSync(root);this.dialog=dialog;this.shell=shell; }
    directory(id,create=false) {
        Academic.safeId(id,"Package ID");
        const parent=path.join(this.root,"final-packages");
        if(create)fs.mkdirSync(parent,{recursive:true,mode:0o700});
        assertDirectory(parent);
        const directory=path.join(parent,id);
        if(create)fs.mkdirSync(directory,{mode:0o700});
        return assertDirectory(directory);
    }
    name(value) {
        if(typeof value!=="string"||!/^[-a-z0-9_]{1,120}\.(html|md|txt|json|bib|pdf|csv|tsv|png|jpg|jpeg|webp|docx|xlsx|pptx|zip|ipynb)$/i.test(value))D.fail("INVALID_PACKAGE_FILE","Unsupported package filename.");
        return value;
    }
    write(id,files) {
        if(files.length>60)D.fail("PACKAGE_LIMIT","Too many package files.");
        try {
        const directory=this.directory(id,true);
        // Exclusive creation: a failed write cannot replace an older package.
        return files.map(file=>{
            const name=this.name(file.name),bytes=Buffer.isBuffer(file.bytes)?file.bytes:Buffer.from(file.bytes);
            if(bytes.length>D.LIMITS.fileBytes)D.fail("PACKAGE_LIMIT","A package file exceeds its supported size.");
            fs.writeFileSync(path.join(directory,name),bytes,{flag:"wx",mode:0o600});
            return {name,byteSize:bytes.length,sha256:D.sha(bytes)};
        });
        }catch(error){if(error instanceof Academic.StudError)throw error;D.fail("PACKAGE_WRITE_FAILED","Package files could not be saved. No existing package was overwritten.");}
    }
    readFile(id,file) {
        let fd;
        try {
            const full=path.join(this.directory(id),this.name(file.name));
            fd=fs.openSync(full,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
            const stat=fs.fstatSync(fd);
            if(!stat.isFile()||stat.nlink!==1||stat.size!==file.byteSize||stat.size>D.LIMITS.fileBytes)D.fail("PACKAGE_INTEGRITY_FAILED","Package file integrity could not be verified.");
            // Allocate only the verified size; a concurrently growing file must
            // not turn a bounded package read into an unbounded allocation.
            const bytes=Buffer.alloc(stat.size);let offset=0;
            while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!count)D.fail("PACKAGE_INTEGRITY_FAILED","Package file was truncated.");offset+=count;}
            const after=fs.fstatSync(fd),named=fs.lstatSync(full);
            if(after.size!==stat.size)D.fail("PACKAGE_INTEGRITY_FAILED","Package file size changed.");
            if(D.sha(bytes)!==file.sha256||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs||named.ino!==stat.ino||named.dev!==stat.dev)D.fail("PACKAGE_INTEGRITY_FAILED","Package files changed after creation.");
            return bytes;
        }catch(error){if(error instanceof Academic.StudError)throw error;D.fail("PACKAGE_FILE_UNAVAILABLE","A saved package file is unavailable.");}
        finally{if(fd!==undefined)fs.closeSync(fd);}
    }
    verify(p) {
        p.files.forEach(file=>this.readFile(p.id,file));
        const manifest=p.files.find(file=>file.name==="manifest.json");
        if(!manifest||manifest.sha256!==p.manifestHash)D.fail("PACKAGE_INTEGRITY_FAILED","Package manifest does not match its canonical identity.");
        const value=JSON.parse(this.readFile(p.id,manifest).toString("utf8"));
        const expected=p.files.filter(file=>file.name!=="manifest.json").sort((a,b)=>a.name.localeCompare(b.name));
        if(value.packageId!==p.id||value.basisHash!==p.basisHash||D.json(value.files)!==D.json(expected))D.fail("PACKAGE_INTEGRITY_FAILED","Package inventory differs from its saved manifest.");
        return true;
    }
    async export(p,validateCurrent) {
        if(!this.dialog)D.fail("DIALOG_UNAVAILABLE","Native export selection is unavailable.");
        let selection;
        try{selection=await this.dialog.showOpenDialog({title:"Choose where to export this academic package",properties:["openDirectory","createDirectory"]});}
        catch(error){D.fail("DIALOG_UNAVAILABLE","The native export dialog is unavailable.");}
        if(selection.canceled||!selection.filePaths?.[0])return {cancelled:true};
        validateCurrent();this.verify(p);
        // Resolve the native picker result once, then reject symlink descendants.
        try {
            const parent=assertDirectory(fs.realpathSync(selection.filePaths[0]));
            const directory=fs.mkdtempSync(path.join(parent,`Aegis-package-${p.revision}-`));
            fs.chmodSync(directory,0o700);
            for(const file of p.files){assertDirectory(directory);fs.writeFileSync(path.join(directory,this.name(file.name)),this.readFile(p.id,file),{flag:"wx",mode:0o600});}
            const receipt={packageId:p.id,manifestHash:p.manifestHash,approval:p.approval||null,exportedAt:Academic.now(),submission:"MANUAL_OUTSIDE_AEGIS"};
            fs.writeFileSync(path.join(directory,"approval-receipt.json"),D.json(receipt),{flag:"wx",mode:0o600});
            for(const file of p.files){if(D.sha(fs.readFileSync(path.join(directory,file.name)))!==file.sha256)D.fail("PACKAGE_INTEGRITY_FAILED","Export verification failed.");}
            if(this.shell?.showItemInFolder)this.shell.showItemInFolder(path.join(directory,"candidate.html"));
            return {cancelled:false,verified:true,fileCount:p.files.length+1,folderName:path.basename(directory),approved:!!p.approval};
        }catch(error){if(error instanceof Academic.StudError)throw error;D.fail("PACKAGE_EXPORT_FAILED","The export did not complete. A partial export folder may remain at the chosen destination.");}
    }
}
module.exports={StudFinalPackageFiles};

"use strict";
const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studStorageModel.class.js");
const {StudStorageManifestCatalog}=require("./studStorageManifestCatalog.class.js");

// Explicit bounded inspection, not a transfer approval or durable manifest.
class StudStorageManifestPreview {
    constructor({store,storage,catalog}){this.storage=storage;this.catalog=catalog||new StudStorageManifestCatalog({store});}
    async inspect(input={}, {signal}={}){
        const initial=this.catalog.inspect(input),files=[];
        let verifiedBytes=0,stoppedAtByteBound=false;
        for(const file of initial.files){
            if(signal?.aborted)Domain.fail("STORAGE_CANCELLED","Storage inspection was cancelled. No files were moved.");
            if(stoppedAtByteBound){files.push({...file,status:"NOT_INSPECTED_BYTE_BOUND"});continue;}
            try{
                const result=await this.storage.inspectCanonicalFileAsync(file.reference,{signal});
                if(verifiedBytes+result.byteSize>Domain.LIMITS.totalBytes){stoppedAtByteBound=true;files.push({...file,status:"NOT_INCLUDED_BYTE_BOUND",byteSize:result.byteSize});continue;}
                verifiedBytes+=result.byteSize;files.push({...file,status:"VERIFIED",sha256:result.sha256,byteSize:result.byteSize});
            }catch(error){
                if(error.code==="STORAGE_CANCELLED")throw error;
                if(!(error instanceof Academic.StudError))Domain.fail("STORAGE_INSPECTION_FAILED","Storage inspection failed safely.");
                files.push({...file,status:error.code}); // no raw error text or private paths
            }
        }
        const current=this.catalog.inspect(input);
        if(current.scopeHash!==initial.scopeHash)Domain.fail("STORAGE_SCOPE_CHANGED","Assignment sources changed while the inventory was being checked. Inspect them again.");
        return Object.freeze({...initial,files,verifiedBytes,filesystemInspected:true,
            checkedAt:new Date().toISOString(),
            allSelectedFilesVerified:!initial.truncated&&!stoppedAtByteBound&&files.every(file=>file.status==="VERIFIED"),
            byteBoundReached:stoppedAtByteBound,portableReady:false});
    }
}
module.exports=Object.freeze({StudStorageManifestPreview});

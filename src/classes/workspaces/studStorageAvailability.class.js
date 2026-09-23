"use strict";
const fs=require("fs"),path=require("path");
const Academic=require("./studAcademicModel.class.js"),Domain=require("./studStorageModel.class.js");
const {assertDirectory}=require("./studStoragePaths.class.js");
// Observational metadata only. Never grants a file capability or replaces the
// resolver's full volume/path/hash checks at actual read or mutation time.
class StudStorageAvailability {
    constructor({store,storage}){this.db=store.db;this.storage=storage;}
    reference(artifact){
        const id=Academic.safeId(artifact.canonicalObjectId,"Canonical object ID");
        switch(artifact.canonicalObjectType){
        case "ACADEMIC_DOCUMENT":return this.db.prepare("SELECT managed_reference reference FROM stud_academic_documents WHERE id=?").get(id);
        case "RESEARCH_PAPER":return this.db.prepare("SELECT local_document_reference reference FROM stud_research_papers WHERE id=?").get(id);
        case "RESOURCE":return this.db.prepare("SELECT local_reference reference FROM stud_resources WHERE id=?").get(id);
        case "DATASET":return this.db.prepare("SELECT managed_reference reference FROM stud_datasets WHERE id=?").get(id);
        default:return null;
        }
    }
    page(artifacts){
        if(!Array.isArray(artifacts)||artifacts.length>100)Domain.fail("INVALID_INPUT","Artifact availability requires a bounded page.");
        const profiles=new Map();
        return artifacts.map(artifact=>{
            if(!["ACADEMIC_DOCUMENT","RESEARCH_PAPER","RESOURCE","DATASET"].includes(artifact.canonicalObjectType))return artifact;
            let state="UNAVAILABLE",reason="STORAGE_UNAVAILABLE";
            try{
                const source=this.reference(artifact);
                if(!source){state="MISSING";reason="CANONICAL_SOURCE_MISSING";}
                else if(!source.reference){state="NOT_IMPORTED";reason="NO_MANAGED_FILE";}
                else {
                    const reference=Domain.managedReference(source.reference),asset=this.storage.repository.asset(reference),profileId=asset?.activeProfileId||Domain.LOCAL_PROFILE_ID;
                    if(!profiles.has(profileId)){
                        try{profiles.set(profileId,{root:this.storage.paths.profileRoot(this.storage.repository.profile(profileId))});}
                        catch(error){profiles.set(profileId,{error});}
                    }
                    const profile=profiles.get(profileId);if(profile.error)throw profile.error;
                    assertDirectory(path.join(profile.root,reference.split("/")[0]));
                    const stat=fs.lstatSync(path.join(profile.root,reference));
                    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)Domain.fail("UNSAFE_STORAGE_PATH","Managed bytes are not a regular file.");
                    state="AVAILABLE";reason="PRESENT_NOT_HASH_RECHECKED";
                }
            }catch(error){
                if(error.code==="STORAGE_OFFLINE"){state="OFFLINE";reason="STORAGE_OFFLINE";}
                else if(error.code==="ENOENT"){state="MISSING";reason="MANAGED_FILE_MISSING";}
                else if(["WRONG_STORAGE_VOLUME","UNSAFE_STORAGE_PATH","INVALID_MANAGED_REFERENCE","VOLUME_IDENTITY_UNAVAILABLE"].includes(error.code))reason=error.code;
            }
            return {...artifact,managedFileAvailability:{state,reason,integrity:"NOT_RECHECKED",scope:"MANAGED_FILE_ONLY"}};
        });
    }
}
module.exports=Object.freeze({StudStorageAvailability});

"use strict";

const crypto=require("crypto");
const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studStorageModel.class.js");
const {StudStorageRepository}=require("./studStorageRepository.class.js");

const BOUNDS=Object.freeze({objects:500,edges:2000,depth:4,issues:100});
// Fixed selectors deliberately omit document/note bodies, provider URLs,
// notebooks' source code and credential-bearing payloads.
const TYPES=Object.freeze({
    ACADEMIC_DOCUMENT:{table:"stud_academic_documents",fields:"title,assignment_id,course_id,managed_reference reference,checksum,byte_size,source_paper_id,extraction_status,archived_at",context:true},
    RESOURCE:{table:"stud_resources",fields:"title,assignment_id,course_id,local_reference reference,checksum,archived_at",context:true},
    DATASET:{table:"stud_datasets",fields:"title,assignment_id,course_id,managed_reference reference,checksum,byte_size,archived_at",context:true},
    RESEARCH_PAPER:{table:"stud_research_papers",fields:"title,local_document_reference reference,archived_at"},
    NOTE:{table:"stud_notes",fields:"title,assignment_id,course_id,archived_at",context:true},
    NOTEBOOK:{table:"stud_notebooks",fields:"title,assignment_id,course_id,note_id,archived_at",context:true},
    COMPUTE_RESULT:{table:"stud_compute_results",fields:"title,assignment_id,course_id",context:true},
    REVISION_ITEM:{table:"stud_revision_items",fields:"title,course_id"},
    REPOSITORY_REFERENCE:{table:"stud_repository_references",fields:"title,assignment_id,course_id,archived_at",context:true}
});

// Read-only dependency inventory. It neither registers assets nor prepares a
// durable transfer. No filesystem scan, network, provider, AI or Run is involved.
class StudStorageManifestCatalog {
    constructor({store,repository}){this.store=store;store.initialize();this.db=store.db;this.repository=repository||new StudStorageRepository(store);}
    inspect(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","includeCourseMaterial"],"Assignment storage inventory");
        const assignmentId=Academic.safeId(input.assignmentId,"Assignment ID");
        const assignment=this.db.prepare("SELECT id,course_id,updated_at FROM stud_assignments WHERE id=?").get(assignmentId);
        if(!assignment)Domain.fail("NOT_FOUND","The Assignment does not exist.");
        if(input.includeCourseMaterial!==undefined&&typeof input.includeCourseMaterial!=="boolean")Domain.fail("INVALID_INPUT","Course material selection must be boolean.");
        const includeCourseMaterial=input.includeCourseMaterial===true,courseId=assignment.course_id;
        const queue=[],queued=new Map(),objects=[],files=new Map(),issues=[],edges=[],provenanceLinks=[];
        let issueCount=0,truncated=false;
        const issue=(code,type=null,id=null)=>{
            if(type&&!/^[A-Z_]{1,64}$/.test(type))type=null;
            if(id){try{Academic.safeId(id,"Source ID");}catch(_error){id=null;}}
            issueCount++;if(issues.length<BOUNDS.issues)issues.push({code,type,id});
        };
        const add=(type,id,reason,depth=0)=>{
            if(!type||!id)return;
            if(type==="ASSIGNMENT"||type==="COURSE"){
                if(id!==(type==="ASSIGNMENT"?assignmentId:courseId))issue("FOREIGN_CONTEXT_REFERENCE",type,id);
                return;
            }
            const key=`${type}:${id}`;
            if(queued.has(key)){const entry=queued.get(key);if(!entry.reasons.includes(reason))entry.reasons.push(reason);return;}
            if(depth>BOUNDS.depth){truncated=true;issue("RELATIONSHIP_DEPTH_LIMIT",type,id);return;}
            if(queued.size>=BOUNDS.objects){truncated=true;issue("OBJECT_LIMIT",type,id);return;}
            const entry={type,id,reason,reasons:[reason],depth};queued.set(key,entry);queue.push(entry);
        };
        const rows=(sql,args)=>{
            const remaining=Math.max(0,BOUNDS.edges-edges.length),values=this.db.prepare(`${sql} LIMIT ?`).all(...args,remaining+1);
            if(values.length>remaining){truncated=true;issue("RELATIONSHIP_LIMIT");}
            const bounded=values.slice(0,remaining);edges.push(...bounded);return bounded;
        };
        const links=(type,id,depth)=>{
            const selected=rows(`SELECT id,from_type,from_id,to_type,to_id FROM stud_relationships
                WHERE (from_type=? AND from_id=?) OR (to_type=? AND to_id=?) ORDER BY id`,[type,id,type,id]);
            for(const link of selected){
                const outward=link.from_type===type&&link.from_id===id;
                const targetType=outward?link.to_type:link.from_type,targetId=outward?link.to_id:link.from_id;
                if(targetType==="COURSE"||targetType==="ASSIGNMENT")continue; // never traverse into another context
                add(targetType,targetId,"CANONICAL_RELATIONSHIP",depth+1);
            }
        };
        for(const [type,spec] of Object.entries(TYPES)){
            if(!spec.context)continue;
            const selected=rows(`SELECT id,assignment_id,course_id FROM ${spec.table}
                WHERE assignment_id=?${includeCourseMaterial&&courseId?" OR (assignment_id IS NULL AND course_id=?)":""} ORDER BY id`,includeCourseMaterial&&courseId?[assignmentId,courseId]:[assignmentId]);
            for(const object of selected)add(type,object.id,object.assignment_id===assignmentId?"ASSIGNMENT_OWNER":"SHARED_COURSE_MATERIAL");
        }
        links("ASSIGNMENT",assignmentId,-1);if(includeCourseMaterial&&courseId)links("COURSE",courseId,-1);
        for(const artifact of rows("SELECT id,canonical_object_type,canonical_object_id FROM stud_assignment_artifacts WHERE assignment_id=? ORDER BY id",[assignmentId]))add(artifact.canonical_object_type,artifact.canonical_object_id,"ARTIFACT_REGISTRY");
        for(const dossier of rows("SELECT id,canonical_object_type,canonical_object_id FROM stud_topic_dossier_items WHERE assignment_id=? AND disposition='ACCEPTED' ORDER BY id",[assignmentId]))add(dossier.canonical_object_type,dossier.canonical_object_id,"ACCEPTED_DOSSIER");
        for(const evidence of rows("SELECT id,source_object_type,source_object_id,document_id,citation_paper_id,extraction_id,chunk_id,page_start,page_end FROM stud_evidence_records WHERE assignment_id=? ORDER BY id",[assignmentId])){
            add(evidence.source_object_type,evidence.source_object_id,"EVIDENCE_SOURCE");add("ACADEMIC_DOCUMENT",evidence.document_id,"EXACT_EVIDENCE_DOCUMENT");add("RESEARCH_PAPER",evidence.citation_paper_id,"EVIDENCE_CITATION");
            provenanceLinks.push({authority:"EVIDENCE",id:evidence.id,documentId:evidence.document_id,extractionId:evidence.extraction_id,chunkId:evidence.chunk_id,pageStart:evidence.page_start,pageEnd:evidence.page_end});
            if(evidence.extraction_id)issue("HISTORICAL_FILE_IDENTITY_REQUIRES_REVIEW","ACADEMIC_DOCUMENT",evidence.document_id);
        }
        for(const source of rows(`SELECT s.id,s.source_entity_type,s.source_entity_id,s.document_id,s.extraction_id,s.chunk_id,s.page_start,s.page_end FROM stud_requirement_sources s
            JOIN stud_requirement_contracts c ON c.id=s.contract_id WHERE c.assignment_id=? ORDER BY s.id`,[assignmentId])){
            add(source.source_entity_type,source.source_entity_id,"REQUIREMENT_SOURCE");add("ACADEMIC_DOCUMENT",source.document_id,"EXACT_REQUIREMENT_DOCUMENT");
            provenanceLinks.push({authority:"REQUIREMENT_SOURCE",id:source.id,documentId:source.document_id,extractionId:source.extraction_id,chunkId:source.chunk_id,pageStart:source.page_start,pageEnd:source.page_end});
            if(source.extraction_id)issue("HISTORICAL_FILE_IDENTITY_REQUIRES_REVIEW","ACADEMIC_DOCUMENT",source.document_id);
        }
        for(let index=0;index<queue.length;index++){
            const selected=queue[index],spec=TYPES[selected.type];
            // Metadata remains in SQLite, but unsupported canonical types may
            // hide file dependencies. Report them, never declare full coverage.
            if(!spec){issue("UNSUPPORTED_CANONICAL_TYPE",selected.type,selected.id);continue;}
            let object;
            try{Academic.safeId(selected.id,"Source ID");object=this.db.prepare(`SELECT id,updated_at,${spec.fields} FROM ${spec.table} WHERE id=?`).get(selected.id);}
            catch(error){if(error instanceof Academic.StudError){issue("INVALID_SOURCE_ID",selected.type,selected.id);continue;}throw error;}
            if(!object){issue("MISSING_CANONICAL_SOURCE",selected.type,selected.id);continue;}
            if(object.assignment_id&&object.assignment_id!==assignmentId){issue("FOREIGN_ASSIGNMENT_SOURCE",selected.type,selected.id);continue;}
            const publicObject={type:selected.type,id:object.id,title:String(object.title||"Academic object").slice(0,240),reason:selected.reason,reasons:selected.reasons,updatedAt:object.updated_at,historical:Boolean(object.archived_at),storage:"LOCAL_DATABASE"};
            objects.push(publicObject);
            if(object.reference){
                try{
                    const reference=Domain.managedReference(object.reference);publicObject.storage="MANAGED_FILE";
                    let file=files.get(reference);
                    if(!file){const asset=this.repository.asset(reference);file={reference,profileId:asset?.activeProfileId||Domain.LOCAL_PROFILE_ID,assetVersion:asset?.rowVersion||null,expectedHash:asset?.sha256||null,declaredBytes:asset?.byteSize??object.byte_size??null,sources:[]};files.set(reference,file);}
                    file.sources.push({type:selected.type,id:object.id,reason:selected.reason,reasons:selected.reasons,historical:Boolean(object.archived_at)});
                }catch(error){if(error instanceof Academic.StudError){publicObject.storage="UNSUPPORTED_REFERENCE";issue("UNSUPPORTED_MANAGED_REFERENCE",selected.type,selected.id);}else throw error;}
            }else if(["ACADEMIC_DOCUMENT","RESOURCE","RESEARCH_PAPER","DATASET","REPOSITORY_REFERENCE"].includes(selected.type)){
                publicObject.storage="NO_MANAGED_BYTES";issue("NO_MANAGED_BYTES",selected.type,selected.id);
            }
            if(object.extraction_status==="OCR_REQUIRED")issue("OCR_REQUIRED",selected.type,selected.id);
            add("RESEARCH_PAPER",object.source_paper_id,"DOCUMENT_SOURCE_PAPER",selected.depth+1);
            add("NOTE",object.note_id,"NOTEBOOK_NOTE",selected.depth+1);
            if(selected.type==="RESEARCH_PAPER"){
                for(const document of rows("SELECT id FROM stud_academic_documents WHERE source_paper_id=? ORDER BY id",[object.id]))add("ACADEMIC_DOCUMENT",document.id,"PAPER_DOCUMENT",selected.depth+1);
            }
            if(selected.type==="NOTEBOOK"){
                const outputs=rows(`SELECT o.id,o.artifact_reference FROM stud_notebook_outputs o JOIN stud_notebook_cells c ON c.id=o.cell_id
                    WHERE c.notebook_id=? AND o.artifact_reference IS NOT NULL ORDER BY o.id`,[object.id]);
                for(const output of outputs)issue("NOTEBOOK_OUTPUT_REFERENCE_REQUIRES_REVIEW","NOTEBOOK",object.id);
            }
            links(selected.type,object.id,selected.depth);
        }
        for(const file of files.values()){
            const owners=this.repository.canonicalOwners(file.reference);
            file.canonicalOwnerCount=owners.length;file.ownerCountTruncated=owners.length>Domain.LIMITS.manifestItems;
            file.ownerIdentityHash=crypto.createHash("sha256").update(JSON.stringify(owners.map(owner=>[owner.objectType,owner.id,owner.checksum]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest("hex");
            file.sharedCanonicalReference=owners.some(owner=>!file.sources.some(source=>source.type===owner.objectType&&source.id===owner.id));
            file.sharedCourseMaterial=file.sources.some(source=>source.reason==="SHARED_COURSE_MATERIAL");
            if(file.ownerCountTruncated){truncated=true;issue("SHARED_OWNER_LIMIT");}
        }
        const orderedFiles=[...files.values()].sort((a,b)=>a.reference.localeCompare(b.reference));
        const fingerprint=crypto.createHash("sha256").update(JSON.stringify({assignmentId,courseId,assignmentVersion:assignment.updated_at,includeCourseMaterial,objects,files:orderedFiles,edges,issues,truncated})).digest("hex");
        return Object.freeze({assignmentId,includeCourseMaterial,scopeHash:fingerprint,objects,files:orderedFiles,provenanceLinks,issues,issueCount,truncated,
            catalogWithinBounds:!truncated,requiresReview:issueCount>0,portableReady:false,
            scope:"CANONICAL_MANAGED_FILES_ONLY",filesystemInspected:false,
            exclusions:["LOCAL_DATABASE_REMAINS_ON_THIS_MAC","OLLAMA_MODELS_EXTERNALLY_MANAGED","NO_REMOTE_SOURCE_ACQUISITION"],bounds:BOUNDS});
    }
}
module.exports=Object.freeze({StudStorageManifestCatalog,BOUNDS});

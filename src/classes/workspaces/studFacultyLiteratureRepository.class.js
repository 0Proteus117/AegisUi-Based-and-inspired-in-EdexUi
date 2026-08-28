"use strict";

const Academic=require("./studAcademicModel.class.js");
const Domain=require("./studFacultyLiteratureModel.class.js");

function camel(row){if(!row)return null;const out={};Object.entries(row).forEach(([key,value])=>out[key.replace(/_([a-z])/g,(_m,c)=>c.toUpperCase())]=value);return out;}
function json(value,fallback=[]){try{return JSON.parse(value);}catch(_error){return fallback;}}
function hydrate(row){if(!row)return null;const value=camel(row);["institutionsJson","departmentsJson","topicsJson","reasonsJson","matchedTermsJson","authorsJson","normalizedWorkJson"].forEach(key=>{if(Object.hasOwn(value,key)){value[key.replace(/Json$/,"")]=json(value[key],key==="normalizedWorkJson"?{}:[]);delete value[key];}});return Object.freeze(value);}

class StudFacultyLiteratureRepository {
    constructor(store){if(!store)throw new Error("StudAcademicStore is required.");this.store=store;this.store.initialize();this.db=store.db;}
    transaction(work){return this.store.transaction(work);}
    assignment(id){const row=this.store.getEntity("ASSIGNMENT",Academic.safeId(id,"Assignment ID"));if(!row)throw new Academic.StudError("NOT_FOUND","Assignment does not exist.");return row;}
    course(id){const row=this.store.getEntity("COURSE",Academic.safeId(id,"Course ID"));if(!row)throw new Academic.StudError("NOT_FOUND","Course does not exist.");return row;}
    identity(id){const row=hydrate(this.db.prepare("SELECT * FROM stud_faculty_identities WHERE id=?").get(Academic.safeId(id,"Faculty identity ID")));if(!row)throw new Academic.StudError("NOT_FOUND","Faculty identity does not exist.");return row;}
    candidate(id){const row=hydrate(this.db.prepare("SELECT * FROM stud_faculty_identity_candidates WHERE id=?").get(Academic.safeId(id,"Faculty candidate ID")));if(!row)throw new Academic.StudError("NOT_FOUND","Faculty identity candidate does not exist.");return row;}
    publication(id){const row=hydrate(this.db.prepare("SELECT * FROM stud_faculty_publication_candidates WHERE id=?").get(Academic.safeId(id,"Publication candidate ID")));if(!row)throw new Academic.StudError("NOT_FOUND","Publication candidate does not exist.");return row;}
    assertVersion(row,expected){const version=Domain.expectedVersion(expected);if(row.rowVersion!==version)throw new Academic.StudError("STALE_FACULTY_VERSION","Faculty Scout data changed in another operation. Reload before saving.",{expected:version,actual:row.rowVersion});}
    plan(id){const row=camel(this.db.prepare("SELECT * FROM stud_research_plans WHERE id=?").get(Academic.safeId(id,"Research Plan ID")));if(!row)throw new Academic.StudError("NOT_FOUND","Research Plan does not exist.");return row;}
    topic(id){const row=camel(this.db.prepare("SELECT * FROM stud_research_topics WHERE id=?").get(Academic.safeId(id,"Research Topic ID")));if(!row)throw new Academic.StudError("NOT_FOUND","Research Topic does not exist.");return row;}

    state(assignmentId,topicId=null,limit=50){
        const assignment=this.assignment(assignmentId);const identities=this.db.prepare("SELECT * FROM stud_faculty_identities WHERE assignment_id=? ORDER BY updated_at DESC,id DESC LIMIT ?").all(assignment.id,Math.min(limit,100)).map(hydrate);
        const observations=new Map(),candidates=new Map();
        identities.forEach(identity=>{
            observations.set(identity.id,Object.freeze(this.db.prepare("SELECT * FROM stud_faculty_observations WHERE faculty_id=? ORDER BY observed_at DESC,id DESC LIMIT 50").all(identity.id).map(hydrate)));
            candidates.set(identity.id,Object.freeze(this.db.prepare("SELECT * FROM stud_faculty_identity_candidates WHERE faculty_id=? ORDER BY CASE disposition WHEN 'CONFIRMED' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,updated_at DESC,id DESC LIMIT 50").all(identity.id).map(hydrate)));
        });
        let publications=[];if(topicId){const topic=this.topic(topicId);if(topic.assignmentId!==assignment.id)throw new Academic.StudError("INVALID_INPUT","Topic does not belong to this Assignment.");publications=this.db.prepare("SELECT * FROM stud_faculty_publication_candidates WHERE topic_id=? ORDER BY CASE relevance_state WHEN 'RELEVANT' THEN 0 WHEN 'UNRESOLVED' THEN 1 ELSE 2 END,updated_at DESC,id DESC LIMIT 100").all(topic.id).map(hydrate);}
        return Object.freeze({assignment,identities:Object.freeze(identities.map(identity=>Object.freeze({...identity,observations:observations.get(identity.id),candidates:candidates.get(identity.id)}))),publications:Object.freeze(publications)});
    }

    insertIdentity(value,observation){return this.transaction(()=>{
        const duplicate=this.db.prepare("SELECT id FROM stud_faculty_identities WHERE assignment_id=? AND lower(display_name)=lower(?) AND COALESCE(lower(institution),'')=COALESCE(lower(?),'') LIMIT 1").get(value.assignmentId,value.displayName,value.institution);
        if(duplicate)throw new Academic.StudError("DUPLICATE_FACULTY_IDENTITY","This faculty observation already exists for the Assignment.");
        const id=Academic.createId("faculty"),timestamp=Academic.now();
        this.db.prepare("INSERT INTO stud_faculty_identities (id,assignment_id,course_id,display_name,institution,department,observed_orcid,resolution_state,row_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'UNRESOLVED',1,?,?)").run(id,value.assignmentId,value.courseId,value.displayName,value.institution,value.department,value.observedOrcid,timestamp,timestamp);
        this.insertObservation(id,value,observation,timestamp);return this.identity(id);
    });}

    insertObservation(facultyId,value,source,timestamp=Academic.now()){
        const id=Academic.createId("faculty_observation");
        this.db.prepare(`INSERT INTO stud_faculty_observations (id,faculty_id,assignment_id,course_id,role,observed_name,observed_institution,observed_department,source_type,source_object_type,source_object_id,document_id,extraction_id,chunk_id,page_start,page_end,excerpt,source_snapshot_hash,observed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,facultyId,value.assignmentId,value.courseId,value.role,value.displayName,value.institution,value.department,source.sourceType,source.sourceObjectType,source.sourceObjectId,source.documentId||null,source.extractionId||null,source.chunkId||null,source.pageStart||null,source.pageEnd||null,source.excerpt||null,source.sourceSnapshotHash,source.observedAt||timestamp,timestamp);
        return hydrate(this.db.prepare("SELECT * FROM stud_faculty_observations WHERE id=?").get(id));
    }

    upsertCandidates(faculty,candidates){return this.transaction(()=>candidates.map(candidate=>{
        const existing=this.db.prepare("SELECT id,disposition,row_version FROM stud_faculty_identity_candidates WHERE faculty_id=? AND provider='OPENALEX' AND provider_author_id=?").get(faculty.id,candidate.providerAuthorId),timestamp=Academic.now(),snapshot=Domain.canonicalHash(candidate);
        if(existing){this.db.prepare("UPDATE stud_faculty_identity_candidates SET display_name=?,orcid=?,institutions_json=?,departments_json=?,topics_json=?,works_count=?,assessment=?,reasons_json=?,provider_snapshot_hash=?,row_version=row_version+1,observed_at=?,updated_at=? WHERE id=?").run(candidate.displayName,candidate.orcid,JSON.stringify(candidate.institutions),JSON.stringify(candidate.departments),JSON.stringify(candidate.topics),candidate.worksCount,candidate.assessment,JSON.stringify(candidate.reasons),snapshot,candidate.observedAt,timestamp,existing.id);return this.candidate(existing.id);}
        const id=Academic.createId("faculty_candidate");this.db.prepare(`INSERT INTO stud_faculty_identity_candidates (id,faculty_id,provider,provider_author_id,display_name,orcid,institutions_json,departments_json,topics_json,works_count,assessment,disposition,reasons_json,provider_snapshot_hash,row_version,observed_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,faculty.id,"OPENALEX",candidate.providerAuthorId,candidate.displayName,candidate.orcid,JSON.stringify(candidate.institutions),JSON.stringify(candidate.departments),JSON.stringify(candidate.topics),candidate.worksCount,candidate.assessment,"PENDING",JSON.stringify(candidate.reasons),snapshot,1,candidate.observedAt,timestamp);return this.candidate(id);
    }));}

    confirmCandidate(faculty,candidate,expectedVersion,note){return this.transaction(()=>{
        this.assertVersion(faculty,expectedVersion);if(candidate.facultyId!==faculty.id)throw new Academic.StudError("INVALID_INPUT","Candidate does not belong to this Faculty identity.");const timestamp=Academic.now();
        this.db.prepare("UPDATE stud_faculty_identity_candidates SET disposition=CASE WHEN id=? THEN 'CONFIRMED' WHEN disposition='PENDING' THEN 'REJECTED' ELSE disposition END,row_version=row_version+1,updated_at=? WHERE faculty_id=?").run(candidate.id,timestamp,faculty.id);
        const changed=this.db.prepare("UPDATE stud_faculty_identities SET resolution_state='CONFIRMED',confirmed_provider='OPENALEX',confirmed_provider_author_id=?,confirmed_orcid=?,confirmed_candidate_id=?,confirmation_note=?,confirmed_at=?,updated_at=?,row_version=row_version+1 WHERE id=? AND row_version=?").run(candidate.providerAuthorId,candidate.orcid,candidate.id,note,timestamp,timestamp,faculty.id,faculty.rowVersion);
        if(!changed.changes)throw new Academic.StudError("STALE_FACULTY_VERSION","Faculty identity changed before confirmation completed.");return this.identity(faculty.id);
    });}

    setCandidateDisposition(faculty,candidate,disposition,expectedVersion){return this.transaction(()=>{this.assertVersion(candidate,expectedVersion);if(candidate.facultyId!==faculty.id)throw new Academic.StudError("INVALID_INPUT","Candidate does not belong to this Faculty identity.");const changed=this.db.prepare("UPDATE stud_faculty_identity_candidates SET disposition=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?").run(disposition,Academic.now(),candidate.id,candidate.rowVersion);if(!changed.changes)throw new Academic.StudError("STALE_FACULTY_VERSION","Candidate changed before update completed.");return this.candidate(candidate.id);});}

    upsertPublications(context,faculty,candidate,items){return this.transaction(()=>items.map(item=>{
        if(Academic.bytesOf(item.normalized)>Domain.LIMITS.metadataBytes)throw new Academic.StudError("PAYLOAD_TOO_LARGE","Normalized publication metadata exceeds the Faculty Scout bound.");
        const existing=this.db.prepare("SELECT id,disposition FROM stud_faculty_publication_candidates WHERE topic_id=? AND faculty_id=? AND provider='OPENALEX' AND provider_work_id=?").get(context.topic.id,faculty.id,item.providerWorkId),timestamp=Academic.now();
        const values=[item.doi,item.title,JSON.stringify(item.authors),item.year,item.venue,item.sourceUrl,JSON.stringify(item.normalized),item.relevanceState,JSON.stringify(item.matchedTerms),JSON.stringify(item.reasons),item.snapshotHash,item.observedAt,timestamp];
        if(existing){this.db.prepare("UPDATE stud_faculty_publication_candidates SET doi=?,title=?,authors_json=?,publication_year=?,venue=?,source_url=?,normalized_work_json=?,relevance_state=?,matched_terms_json=?,reasons_json=?,provider_snapshot_hash=?,row_version=row_version+1,observed_at=?,updated_at=? WHERE id=?").run(...values,existing.id);return this.publication(existing.id);}
        const id=Academic.createId("faculty_publication");this.db.prepare(`INSERT INTO stud_faculty_publication_candidates (id,assignment_id,plan_id,topic_id,faculty_id,identity_candidate_id,provider,provider_work_id,doi,title,authors_json,publication_year,venue,source_url,normalized_work_json,relevance_state,disposition,matched_terms_json,reasons_json,provider_snapshot_hash,row_version,observed_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,context.assignment.id,context.plan.id,context.topic.id,faculty.id,candidate.id,"OPENALEX",item.providerWorkId,item.doi,item.title,JSON.stringify(item.authors),item.year,item.venue,item.sourceUrl,JSON.stringify(item.normalized),item.relevanceState,"SUGGESTED",JSON.stringify(item.matchedTerms),JSON.stringify(item.reasons),item.snapshotHash,1,item.observedAt,timestamp);return this.publication(id);
    }));}

    markPublicationImported(publication,expectedVersion,paperId,dossierItemId){this.assertVersion(publication,expectedVersion);const changed=this.db.prepare("UPDATE stud_faculty_publication_candidates SET disposition='IMPORTED',canonical_paper_id=?,dossier_item_id=?,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?").run(paperId,dossierItemId,Academic.now(),publication.id,publication.rowVersion);if(!changed.changes)throw new Academic.StudError("STALE_FACULTY_VERSION","Publication candidate changed before import completed.");return this.publication(publication.id);}
}

module.exports=Object.freeze({StudFacultyLiteratureRepository,camel,hydrate});

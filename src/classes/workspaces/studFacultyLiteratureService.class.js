"use strict";

const Academic=require("./studAcademicModel.class.js");
const Research=require("./studResearchModel.class.js");
const Domain=require("./studFacultyLiteratureModel.class.js");
const {StudFacultyLiteratureRepository}=require("./studFacultyLiteratureRepository.class.js");

class StudFacultyLiteratureService {
    constructor(options={}){if(!options.store)throw new Error("StudAcademicStore is required.");if(!options.researchRuntime)throw new Error("StudResearchRuntime is required.");if(!options.researchPlanService)throw new Error("StudResearchPlanService is required.");this.store=options.store;this.runtime=options.researchRuntime;this.researchPlans=options.researchPlanService;this.repository=options.repository||new StudFacultyLiteratureRepository(this.store);}
    state(input={}){Academic.assertAllowedKeys(input,["assignmentId","topicId","limit"],"Faculty Scout state");return this.repository.state(input.assignmentId,input.topicId||null,Math.max(1,Math.min(Number(input.limit)||50,100)));}

    source(input,assignment,course){
        const sourceType=Academic.enumValue(input.sourceType||"USER",Domain.SOURCE_TYPES,"Faculty source","USER");
        if(sourceType==="USER") return {sourceType,sourceObjectType:"ASSIGNMENT",sourceObjectId:assignment.id,sourceSnapshotHash:Domain.canonicalHash({sourceType,assignmentId:assignment.id,name:input.displayName,role:input.role}),observedAt:Academic.now()};
        if(sourceType==="COURSE_METADATA") {
            if(!course||!course.id) throw new Academic.StudError("INVALID_PROVENANCE","Course metadata cannot be used when the Assignment has no Course.");
            return {sourceType,sourceObjectType:"COURSE",sourceObjectId:course.id,sourceSnapshotHash:Domain.canonicalHash({id:course.id,title:course.title,updatedAt:course.updatedAt,name:input.displayName,role:input.role}),observedAt:Academic.now()};
        }
        if(sourceType==="ASSIGNMENT_METADATA") return {sourceType,sourceObjectType:"ASSIGNMENT",sourceObjectId:assignment.id,sourceSnapshotHash:Domain.canonicalHash({id:assignment.id,title:assignment.title,updatedAt:assignment.updatedAt,name:input.displayName,role:input.role}),observedAt:Academic.now()};
        if(sourceType==="MOODLE_PROVENANCE") {
            const id=Academic.safeId(input.sourceId,"Moodle provenance ID"),row=this.repository.db.prepare("SELECT * FROM stud_provenance_records WHERE id=?").get(id);
            if(!row||!(["ASSIGNMENT","COURSE"].includes(row.entity_type))||![assignment.id,course.id].includes(row.entity_id))throw new Academic.StudError("INVALID_PROVENANCE","Moodle provenance must resolve to this Assignment or Course.");
            if(!/^MOODLE/i.test(String(row.source_type||"")))throw new Academic.StudError("INVALID_PROVENANCE","The selected provenance is not a Moodle observation.");
            return {sourceType,sourceObjectType:row.entity_type,sourceObjectId:row.entity_id,sourceSnapshotHash:Domain.canonicalHash(row),observedAt:row.observed_at};
        }
        const documentId=Academic.safeId(input.documentId,"Academic Document ID"),extractionId=Academic.safeId(input.extractionId,"Extraction ID"),chunkId=Academic.safeId(input.chunkId,"Document chunk ID");
        const row=this.repository.db.prepare(`SELECT d.id document_id,d.assignment_id,d.course_id,d.checksum,e.id extraction_id,c.id chunk_id,c.page_start,c.page_end,c.content,c.content_hash FROM stud_academic_documents d JOIN stud_document_extractions e ON e.document_id=d.id JOIN stud_document_chunks c ON c.extraction_id=e.id WHERE d.id=? AND e.id=? AND c.id=? AND d.archived_at IS NULL`).get(documentId,extractionId,chunkId);
        if(!row||(row.assignment_id!==assignment.id&&row.course_id!==course.id))throw new Academic.StudError("INVALID_PROVENANCE","Document evidence is not related to this Assignment or Course.");
        if(!Domain.normalizedComparable(row.content).includes(Domain.normalizedComparable(input.displayName)))throw new Academic.StudError("INVALID_PROVENANCE","The observed faculty name is not present in the selected document chunk.");
        return {sourceType,sourceObjectType:"ACADEMIC_DOCUMENT",sourceObjectId:documentId,documentId,extractionId,chunkId,pageStart:row.page_start,pageEnd:row.page_end,excerpt:String(row.content||"").slice(0,Domain.LIMITS.excerpt),sourceSnapshotHash:row.content_hash,observedAt:Academic.now()};
    }

    createIdentity(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","displayName","institution","department","orcid","role","sourceType","sourceId","documentId","extractionId","chunkId"],"Faculty identity creation");
        const assignment=this.repository.assignment(input.assignmentId),course=assignment.courseId?this.repository.course(assignment.courseId):null;
        const observedOrcid=input.orcid?Domain.normalizeOrcid(input.orcid):null;if(input.orcid&&!observedOrcid)throw new Academic.StudError("INVALID_INPUT","Observed ORCID is invalid.");
        const value={assignmentId:assignment.id,courseId:course&&course.id||null,displayName:Domain.normalizeName(input.displayName),institution:Academic.optionalText(input.institution,"Institution",Domain.LIMITS.institution),department:Academic.optionalText(input.department,"Department",Domain.LIMITS.department),observedOrcid,role:Academic.enumValue(input.role||"UNKNOWN",Domain.ROLES,"Faculty role","UNKNOWN")};
        const source=this.source({...input,...value},assignment,course);
        try{return this.repository.insertIdentity(value,source);}catch(error){if(error&&error.code==="DUPLICATE_FACULTY_IDENTITY")throw error;if(/UNIQUE constraint failed/.test(error.message||""))throw new Academic.StudError("DUPLICATE_FACULTY_IDENTITY","This faculty observation already exists for the Assignment.");throw error;}
    }

    async discoverIdentity(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","facultyId","requestId","limit"],"Faculty identity discovery");
        const assignment=this.repository.assignment(input.assignmentId),faculty=this.repository.identity(input.facultyId);if(faculty.assignmentId!==assignment.id)throw new Academic.StudError("INVALID_INPUT","Faculty identity does not belong to this Assignment.");
        const raw=await this.runtime.searchOpenAlexAuthors({name:faculty.displayName,limit:Math.max(1,Math.min(Number(input.limit)||10,20)),requestId:input.requestId});
        const candidates=raw.map(value=>{const normalized=Domain.parseOpenAlexAuthor(value),assessment=Domain.assessIdentity(faculty,normalized);if(!normalized.providerAuthorId)return null;return {...normalized,...assessment};}).filter(Boolean);
        const persisted=this.repository.upsertCandidates(faculty,candidates);
        return Object.freeze({faculty:this.repository.identity(faculty.id),candidates:Object.freeze(persisted),provider:"OPENALEX",query:faculty.displayName,noResults:persisted.length===0});
    }

    confirmIdentity(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","facultyId","candidateId","expectedVersion","note"],"Faculty identity confirmation");
        const assignment=this.repository.assignment(input.assignmentId),faculty=this.repository.identity(input.facultyId),candidate=this.repository.candidate(input.candidateId);if(faculty.assignmentId!==assignment.id||candidate.facultyId!==faculty.id)throw new Academic.StudError("INVALID_INPUT","Faculty identity candidate ownership is invalid.");
        return this.repository.confirmCandidate(faculty,candidate,input.expectedVersion,Academic.optionalText(input.note,"Confirmation note",Domain.LIMITS.note));
    }

    rejectCandidate(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","facultyId","candidateId","expectedVersion"],"Faculty candidate rejection");const assignment=this.repository.assignment(input.assignmentId),faculty=this.repository.identity(input.facultyId),candidate=this.repository.candidate(input.candidateId);if(faculty.assignmentId!==assignment.id||candidate.facultyId!==faculty.id)throw new Academic.StudError("INVALID_INPUT","Faculty identity candidate ownership is invalid.");return this.repository.setCandidateDisposition(faculty,candidate,"REJECTED",input.expectedVersion);
    }

    context(input){
        const assignment=this.repository.assignment(input.assignmentId),plan=this.repository.plan(input.planId),topic=this.repository.topic(input.topicId);if(plan.assignmentId!==assignment.id||topic.planId!==plan.id||topic.assignmentId!==assignment.id)throw new Academic.StudError("INVALID_INPUT","Research Topic context ownership is invalid.");
        let question=null,claim=null;if(input.questionId){question=this.repository.db.prepare("SELECT id,plan_id,topic_id,question_text FROM stud_research_questions WHERE id=?").get(Academic.safeId(input.questionId,"Research Question ID"));if(!question||question.plan_id!==plan.id||question.topic_id!==topic.id)throw new Academic.StudError("INVALID_INPUT","Research Question does not belong to the selected Topic.");}
        if(input.claimId){claim=this.repository.db.prepare("SELECT id,assignment_id,plan_id,topic_id,claim_text FROM stud_claims WHERE id=?").get(Academic.safeId(input.claimId,"Claim ID"));if(!claim||claim.assignment_id!==assignment.id||(claim.plan_id&&claim.plan_id!==plan.id)||(claim.topic_id&&claim.topic_id!==topic.id))throw new Academic.StudError("INVALID_INPUT","Claim does not belong to the selected Topic context.");}
        return {assignment,plan,topic,question,claim};
    }

    async discoverPublications(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","planId","topicId","facultyId","questionId","claimId","requestId","limit"],"Faculty publication discovery");
        const context=this.context(input),faculty=this.repository.identity(input.facultyId);if(faculty.assignmentId!==context.assignment.id||faculty.resolutionState!=="CONFIRMED"||!faculty.confirmedProviderAuthorId)throw new Academic.StudError("IDENTITY_NOT_CONFIRMED","Confirm the scholarly identity before discovering publications.");
        const candidate=this.repository.candidate(faculty.confirmedCandidateId);if(candidate.disposition!=="CONFIRMED")throw new Academic.StudError("IDENTITY_NOT_CONFIRMED","The confirmed scholarly identity is unavailable.");
        const raw=await this.runtime.worksByOpenAlexAuthor({authorId:faculty.confirmedProviderAuthorId,limit:Math.max(1,Math.min(Number(input.limit)||25,Research.MAX_RESULTS)),requestId:input.requestId});
        const relevanceContext={assignmentTitle:context.assignment.title,topicTitle:context.topic.title,topicDescription:context.topic.description,questionText:context.question&&context.question.question_text,claimText:context.claim&&context.claim.claim_text};
        const publications=raw.map(value=>{const normalized=Research.normalizeOpenAlexWork(value),verified=normalized.authors.some(author=>author.openAlexId===faculty.confirmedProviderAuthorId);if(!verified)return null;const assessed=Domain.assessPublication(relevanceContext,normalized);return {providerWorkId:normalized.openAlexId,doi:normalized.doi,title:normalized.title,authors:normalized.authors,year:normalized.year,venue:normalized.venue,sourceUrl:normalized.sourceUrl,normalized,relevanceState:assessed.relevanceState,matchedTerms:assessed.matchedTerms,reasons:assessed.reasons,snapshotHash:Domain.canonicalHash(normalized),observedAt:normalized.observedAt};}).filter(item=>item&&item.providerWorkId);
        const persisted=this.repository.upsertPublications(context,faculty,candidate,publications);
        return Object.freeze({faculty,topic:context.topic,publications:Object.freeze(persisted),noResults:persisted.length===0});
    }

    importToDossier(input={}){
        Academic.assertAllowedKeys(input,["assignmentId","publicationId","expectedVersion"],"Faculty publication import");
        const assignment=this.repository.assignment(input.assignmentId),publication=this.repository.publication(input.publicationId);if(publication.assignmentId!==assignment.id)throw new Academic.StudError("INVALID_INPUT","Publication candidate does not belong to this Assignment.");if(publication.relevanceState!=="RELEVANT")throw new Academic.StudError("RELEVANCE_REQUIRED","Only publications with explainable Topic relevance can be promoted as Faculty Gems.");if(publication.disposition==="DISMISSED")throw new Academic.StudError("INVALID_STATE","Dismissed publication candidates cannot be imported.");
        this.repository.assertVersion(publication,input.expectedVersion);const saved=this.store.saveResearchObservation(publication.normalizedWork,{courseId:assignment.courseId||null,assignmentId:assignment.id,source:"OPENALEX"});
        let dossier;try{dossier=this.researchPlans.addDossierItem({planId:publication.planId,topicId:publication.topicId,canonicalObjectType:"RESEARCH_PAPER",canonicalObjectId:saved.paper.id,membershipOrigin:"RESEARCH_ACQUIRED",disposition:"ACCEPTED",reviewState:"UNREVIEWED",sourceSuitability:"UNKNOWN",stance:"NOT_ASSESSED",rationale:`Explicitly added after confirmed faculty identity and deterministic Topic relevance: ${publication.reasons.join("; ")}`});}catch(error){if(error.code!=="DUPLICATE_DOSSIER_ITEM")throw error;dossier=this.repository.db.prepare("SELECT * FROM stud_topic_dossier_items WHERE topic_id=? AND canonical_object_type='RESEARCH_PAPER' AND canonical_object_id=?").get(publication.topicId,saved.paper.id);}
        return Object.freeze({publication:this.repository.markPublicationImported(publication,input.expectedVersion,saved.paper.id,dossier.id),paper:saved.paper,dossierItem:dossier,facultyGem:true,evidenceCreated:false,citationSupportClaimed:false});
    }

    dismissPublication(input={}){Academic.assertAllowedKeys(input,["assignmentId","publicationId","expectedVersion"],"Publication dismissal");const assignment=this.repository.assignment(input.assignmentId),publication=this.repository.publication(input.publicationId);if(publication.assignmentId!==assignment.id)throw new Academic.StudError("INVALID_INPUT","Publication candidate does not belong to this Assignment.");this.repository.assertVersion(publication,input.expectedVersion);const changed=this.repository.db.prepare("UPDATE stud_faculty_publication_candidates SET disposition='DISMISSED',row_version=row_version+1,updated_at=? WHERE id=? AND row_version=? AND disposition='SUGGESTED'").run(Academic.now(),publication.id,publication.rowVersion);if(!changed.changes)throw new Academic.StudError("INVALID_STATE","Only suggested publication candidates can be dismissed.");return this.repository.publication(publication.id);}
}

module.exports=Object.freeze({StudFacultyLiteratureService});

"use strict";

const crypto = require("crypto");
const Academic = require("./studAcademicModel.class.js");

const ROLES = Object.freeze(["COURSE_LECTURER","MODULE_LEADER","ASSIGNMENT_AUTHOR","SUPERVISOR","TUTOR","TEACHING_TEAM","OTHER","UNKNOWN"]);
const SOURCE_TYPES = Object.freeze(["USER","COURSE_METADATA","ASSIGNMENT_METADATA","ACADEMIC_DOCUMENT","MOODLE_PROVENANCE"]);
const RESOLUTION_STATES = Object.freeze(["CONFIRMED","PROBABLE","AMBIGUOUS","UNRESOLVED"]);
const CANDIDATE_ASSESSMENTS = Object.freeze(["PROBABLE","AMBIGUOUS","UNRESOLVED"]);
const CANDIDATE_DISPOSITIONS = Object.freeze(["PENDING","CONFIRMED","REJECTED","NO_MATCH"]);
const RELEVANCE_STATES = Object.freeze(["RELEVANT","IRRELEVANT","UNRESOLVED"]);
const PUBLICATION_DISPOSITIONS = Object.freeze(["SUGGESTED","IMPORTED","DISMISSED"]);
const LIMITS = Object.freeze({name:300,institution:500,department:500,note:4000,excerpt:8000,list:50,publicationPage:100,metadataBytes:64000,terms:80});

function canonicalHash(value) {
    const sort = item => Array.isArray(item) ? item.map(sort) : (!item || typeof item !== "object" ? item : Object.keys(item).sort().reduce((out,key)=>{out[key]=sort(item[key]);return out;},{}));
    return crypto.createHash("sha256").update(JSON.stringify(sort(value))).digest("hex");
}

function expectedVersion(value) {
    const result=Number(value); if(!Number.isInteger(result)||result<1) throw new Academic.StudError("INVALID_INPUT","Expected version is required."); return result;
}

function normalizeName(value) {
    return Academic.requiredText(value,"Faculty name",LIMITS.name).normalize("NFKC").replace(/[\s\u00a0]+/g," ").trim();
}

function normalizedComparable(value) {
    return String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g," ").trim();
}

function normalizeOpenAlexAuthorId(value) {
    const match=String(value||"").trim().match(/(?:openalex\.org\/)?(A\d+)$/i); return match?match[1].toUpperCase():null;
}

function normalizeOrcid(value) {
    const match=String(value||"").trim().match(/(?:orcid\.org\/)?(\d{4}-\d{4}-\d{4}-[\dX]{4})$/i); return match?match[1].toUpperCase():null;
}

function terms(value) {
    const stop=new Set(["about","after","also","among","and","are","based","between","course","from","have","into","module","other","report","research","that","the","their","these","this","using","with"]);
    return Object.freeze([...new Set(normalizedComparable(value).split(" ").filter(term=>term.length>=4&&!stop.has(term)))].slice(0,LIMITS.terms));
}

function parseOpenAlexAuthor(raw={}) {
    const institutions=[];
    (raw.affiliations||[]).slice(0,20).forEach(item=>{const name=item&&item.institution&&item.institution.display_name;if(name&&!institutions.includes(name))institutions.push(String(name).slice(0,LIMITS.institution));});
    if(raw.last_known_institutions) (raw.last_known_institutions||[]).slice(0,10).forEach(item=>{if(item&&item.display_name&&!institutions.includes(item.display_name))institutions.push(String(item.display_name).slice(0,LIMITS.institution));});
    const topics=(raw.topics||raw.x_concepts||[]).slice(0,20).map(item=>String(item&&item.display_name||"").slice(0,240)).filter(Boolean);
    return Object.freeze({
        provider:"OPENALEX", providerAuthorId:normalizeOpenAlexAuthorId(raw.id), displayName:normalizeName(raw.display_name||"Unknown author"),
        orcid:normalizeOrcid(raw.orcid), institutions:Object.freeze(institutions), departments:Object.freeze([]), topics:Object.freeze(topics),
        worksCount:Math.max(0,Number(raw.works_count)||0), observedAt:new Date().toISOString()
    });
}

function assessIdentity(faculty,candidate) {
    const reasons=[]; const nameMatch=normalizedComparable(faculty.displayName)===normalizedComparable(candidate.displayName);
    const observedInstitutions=[faculty.institution,faculty.department].filter(Boolean).map(normalizedComparable);
    const candidateInstitutions=[...(candidate.institutions||[]),...(candidate.departments||[])].filter(Boolean).map(normalizedComparable);
    const institutionMatch=observedInstitutions.some(expected=>candidateInstitutions.some(actual=>actual.includes(expected)||expected.includes(actual)));
    if(nameMatch) reasons.push("Exact normalized name");
    if(institutionMatch) reasons.push("Observed institution or department matches public affiliation metadata");
    if(faculty.observedOrcid&&candidate.orcid&&faculty.observedOrcid===candidate.orcid) reasons.push("Exact ORCID");
    let assessment="UNRESOLVED";
    if((nameMatch&&institutionMatch)||(faculty.observedOrcid&&faculty.observedOrcid===candidate.orcid)) assessment="PROBABLE";
    else if(nameMatch) {assessment="AMBIGUOUS";reasons.push("Name alone is insufficient for identity confirmation");}
    else reasons.push("Public record does not match the observed name");
    return Object.freeze({assessment,reasons:Object.freeze(reasons)});
}

function assessPublication(context,work) {
    const contextTerms=terms([context.assignmentTitle,context.topicTitle,context.topicDescription,context.questionText,context.claimText].filter(Boolean).join(" "));
    const workTerms=new Set(terms([work.title,work.abstract,work.venue].filter(Boolean).join(" ")));
    const matched=contextTerms.filter(term=>workTerms.has(term)).slice(0,30);
    let relevanceState="UNRESOLVED",reasons=[];
    if(!contextTerms.length) reasons.push("The selected Topic has insufficient local terminology for deterministic relevance assessment");
    else if(matched.length>=2) {relevanceState="RELEVANT";reasons.push(`${matched.length} explicit Topic/Assignment terms occur in the publication metadata`);}
    else if(matched.length===1&&matched[0].length>=8) {relevanceState="RELEVANT";reasons.push(`Distinctive matching term: ${matched[0]}`);}
    else {relevanceState="IRRELEVANT";reasons.push("No sufficient deterministic overlap with the selected Topic context");}
    return Object.freeze({relevanceState,matchedTerms:Object.freeze(matched),reasons:Object.freeze(reasons)});
}

module.exports=Object.freeze({ROLES,SOURCE_TYPES,RESOLUTION_STATES,CANDIDATE_ASSESSMENTS,CANDIDATE_DISPOSITIONS,RELEVANCE_STATES,PUBLICATION_DISPOSITIONS,LIMITS,canonicalHash,expectedVersion,normalizeName,normalizedComparable,normalizeOpenAlexAuthorId,normalizeOrcid,terms,parseOpenAlexAuthor,assessIdentity,assessPublication});

"use strict";

const crypto = require("crypto");
const Academic = require("./studAcademicModel.class.js");

const REVIEWER_ROLES = Object.freeze(["REQUIREMENTS","ARGUMENT_STRUCTURE","EVIDENCE_CITATION","METHODS_TECHNICAL","ACADEMIC_COMMUNICATION"]);
const APPLICABILITY = Object.freeze(["APPLICABLE","NOT_APPLICABLE"]);
const SESSION_STATES = Object.freeze(["CREATED","RUNNING","COMPLETE","PARTIAL","FAILED","CANCELLED"]);
const PASS_STATES = Object.freeze(["PENDING","RUNNING","COMPLETE","FAILED","CANCELLED","NOT_APPLICABLE"]);
const FINDING_CATEGORIES = Object.freeze(["REQUIREMENT_COVERAGE","ARGUMENT_STRUCTURE","EVIDENCE_SUPPORT","CITATION_INTEGRITY","METHODS_TECHNICAL","ACADEMIC_COMMUNICATION","WORD_BUDGET","RESEARCH_GAP","WORKFLOW_CONDITION","OTHER"]);
const FINDING_SEVERITIES = Object.freeze(["BLOCKING","MAJOR","MINOR","INFORMATIONAL"]);
const FINDING_STATUSES = Object.freeze(["OPEN","ACKNOWLEDGED","PLANNED","ADDRESSED","DISMISSED","SUPERSEDED"]);
const FINDING_PROVENANCE = Object.freeze(["DETERMINISTIC","LOCAL_MODEL","USER"]);
const BASIS_TYPES = Object.freeze(["REQUIREMENT_ITEM","COMPOSITION_SECTION","CLAIM","EVIDENCE","CITATION","RESEARCH_GAP","WORKFLOW_BLOCKER","DRAFT_SECTION","OTHER"]);
const SYNTHESIS_KINDS = Object.freeze(["AGREEMENT","COMPLEMENTARY","DISAGREEMENT","UNIQUE"]);
const CORRECTION_PLAN_STATES = Object.freeze(["DRAFT","ACTIVE","COMPLETE","ARCHIVED"]);
const CORRECTION_ITEM_STATES = Object.freeze(["PENDING","IN_PROGRESS","CANDIDATE_READY","ACCEPTED","REJECTED","DEFERRED"]);
const CORRECTION_ACTIONS = Object.freeze(["MANUAL_EDIT","LOCAL_AI_CANDIDATE"]);
const CORRECTION_SESSION_STATES = Object.freeze(["CREATED","RUNNING","CANDIDATE_READY","NEEDS_REVIEW","ACCEPTED","REJECTED","FAILED","CANCELLED"]);
const INTEGRITY_STATES = Object.freeze(["PENDING","PASS","CONFLICT","REVIEW_REQUIRED"]);
const ESTIMATE_STATES = Object.freeze(["NOT_REQUESTED","UNAVAILABLE","READY","FAILED"]);
const READINESS_LABELS = Object.freeze(["NOT_READY","DEVELOPING","SUBMISSION_READY_WITH_REVISIONS","READY_FOR_FINAL_HUMAN_REVIEW"]);
const LIMITS = Object.freeze({
    committee: 5, findings: 500, findingsPerPass: 100, correctionItems: 200,
    sections: 100, title: 240, summary: 4000, explanation: 12000,
    rationale: 8000, action: 8000, note: 12000, excerpt: 12000,
    payloadBytes: 128000, list: 200, sectionCharacters: 120000,
    totalCharacters: 500000, protectedOverrides: 100
});

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((result, key) => { result[key] = canonical(value[key]); return result; }, {});
}
function hash(value) { return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(canonical(value))).digest("hex"); }
function parseJson(value, fallback) { try { const parsed = JSON.parse(value); return parsed === null ? fallback : parsed; } catch (_error) { return fallback; } }
function expectedVersion(value) { const result = Number(value); if (!Number.isInteger(result) || result < 1) throw new Academic.StudError("INVALID_INPUT", "Expected row version is required."); return result; }
function boundedList(values, label, maximum, normalizer = value => value) {
    if (values === undefined || values === null) return Object.freeze([]);
    if (!Array.isArray(values) || values.length > maximum) throw new Academic.StudError("PAYLOAD_TOO_LARGE", `${label} exceeds its bound.`);
    return Object.freeze(values.map(normalizer));
}
function committee(values) {
    const supplied = Array.isArray(values) && values.length ? values : REVIEWER_ROLES.map(role => ({role, applicability:"APPLICABLE", focus:null}));
    if (supplied.length > LIMITS.committee) throw new Academic.StudError("PAYLOAD_TOO_LARGE", "Committee exceeds its fixed role bound.");
    const seen = new Set();
    const result = supplied.map(item => {
        if (!item || typeof item !== "object") throw new Academic.StudError("INVALID_INPUT", "Committee role is invalid.");
        Academic.assertAllowedKeys(item,["role","applicability","focus"],"Committee role");
        const role = Academic.enumValue(item.role, REVIEWER_ROLES, "Reviewer role");
        if (seen.has(role)) throw new Academic.StudError("INVALID_INPUT", "Reviewer roles must be unique.");
        seen.add(role);
        return Object.freeze({role, applicability:Academic.enumValue(item.applicability || "APPLICABLE",APPLICABILITY,"Reviewer applicability","APPLICABLE"), focus:Academic.optionalText(item.focus,"Reviewer focus",LIMITS.summary)});
    });
    return Object.freeze(result);
}
function finding(input = {}, defaults = {}) {
    Academic.assertAllowedKeys(input,["category","severity","title","explanation","basisType","basisId","requirementItemId","claimId","evidenceId","citationPaperId","draftSectionId","excerpt","locator","recommendedAction","rationale"],"Review Finding");
    return Object.freeze({
        category:Academic.enumValue(input.category || defaults.category || "OTHER",FINDING_CATEGORIES,"Finding category","OTHER"),
        severity:Academic.enumValue(input.severity || defaults.severity || "MINOR",FINDING_SEVERITIES,"Finding severity","MINOR"),
        title:Academic.requiredText(input.title,"Finding title",LIMITS.title),
        explanation:Academic.requiredText(input.explanation,"Finding explanation",LIMITS.explanation),
        basisType:Academic.enumValue(input.basisType || defaults.basisType || "OTHER",BASIS_TYPES,"Finding basis","OTHER"),
        basisId:input.basisId ? Academic.safeId(input.basisId,"Finding basis ID") : null,
        requirementItemId:input.requirementItemId ? Academic.safeId(input.requirementItemId,"Requirement Item ID") : null,
        claimId:input.claimId ? Academic.safeId(input.claimId,"Claim ID") : null,
        evidenceId:input.evidenceId ? Academic.safeId(input.evidenceId,"Evidence ID") : null,
        citationPaperId:input.citationPaperId ? Academic.safeId(input.citationPaperId,"Citation Paper ID") : null,
        draftSectionId:input.draftSectionId ? Academic.safeId(input.draftSectionId,"Draft Section ID") : null,
        excerpt:Academic.optionalText(input.excerpt,"Finding excerpt",LIMITS.excerpt),
        locator:Academic.optionalText(input.locator,"Finding locator",LIMITS.summary),
        recommendedAction:Academic.optionalText(input.recommendedAction,"Recommended action",LIMITS.action),
        rationale:Academic.optionalText(input.rationale,"Finding rationale",LIMITS.rationale)
    });
}
function semanticFingerprint(value) { return hash({category:value.category,severity:value.severity,title:value.title,explanation:value.explanation,basisType:value.basisType,basisId:value.basisId,requirementItemId:value.requirementItemId,claimId:value.claimId,evidenceId:value.evidenceId,citationPaperId:value.citationPaperId,draftSectionId:value.draftSectionId}); }
function protectedOverride(value = {}) {
    Academic.assertAllowedKeys(value,["sectionId","checkTypes","reason"],"Protected content override");
    return Object.freeze({sectionId:Academic.safeId(value.sectionId,"Draft Section ID"),checkTypes:boundedList(value.checkTypes,"Protected check types",10,item=>Academic.enumValue(item,["CITATIONS","NUMBERS_UNITS","QUOTATIONS","EQUATIONS","URL_IDENTIFIERS","PROTECTED_TERMS","CLAIMS","EVIDENCE_LINKS"],"Protected check type")),reason:Academic.requiredText(value.reason,"Protected override reason",LIMITS.rationale)});
}

module.exports = Object.freeze({REVIEWER_ROLES,APPLICABILITY,SESSION_STATES,PASS_STATES,FINDING_CATEGORIES,FINDING_SEVERITIES,FINDING_STATUSES,FINDING_PROVENANCE,BASIS_TYPES,SYNTHESIS_KINDS,CORRECTION_PLAN_STATES,CORRECTION_ITEM_STATES,CORRECTION_ACTIONS,CORRECTION_SESSION_STATES,INTEGRITY_STATES,ESTIMATE_STATES,READINESS_LABELS,LIMITS,hash,parseJson,expectedVersion,boundedList,committee,finding,semanticFingerprint,protectedOverride});

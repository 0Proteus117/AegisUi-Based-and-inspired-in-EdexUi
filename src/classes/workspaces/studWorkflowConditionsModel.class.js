"use strict";

const Academic = require("./studAcademicModel.class.js");
const Workflow = require("./studWorkflowModel.class.js");

const BLOCKER_TYPES = Object.freeze([
    "WAITING_LAB", "WAITING_TEAM_MEMBER", "WAITING_DATA", "WAITING_FEEDBACK",
    "WAITING_SUPERVISOR", "WAITING_APPROVAL", "WAITING_RESOURCE", "WAITING_EVENT",
    "WAITING_INTERVIEW", "WAITING_SURVEY", "WAITING_FIELDWORK", "WAITING_EQUIPMENT",
    "WAITING_EXTERNAL_RESULT", "CUSTOM"
]);
const BLOCKER_STATUSES = Object.freeze(["OPEN", "RESOLVED", "CANCELLED"]);
const CHECKPOINT_STATUSES = Object.freeze(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
const CHECKPOINT_DECISIONS = Object.freeze(["APPROVE", "REJECT", "CANCEL"]);
const ORIGINS = Object.freeze(["USER", "REQUIREMENT", "TEMPLATE", "CANONICAL", "EXTERNAL"]);
const AVAILABILITY = Object.freeze(["AVAILABLE", "DIRECT_BLOCKER", "HUMAN_INPUT_REQUIRED", "DEPENDENCY_WAIT"]);
const LIMITS = Object.freeze({perWorkflow: 200, title: 240, description: 4000, note: 2000, owner: 240, requiredInput: 2000});

function normalizeReference(input = {}) {
    const requirementItemId = input.requirementItemId ? Academic.safeId(input.requirementItemId, "Requirement item ID") : null;
    const relatedEntityType = input.relatedEntityType ? Academic.enumValue(input.relatedEntityType, Academic.ENTITY_TYPES, "Related academic object type") : null;
    const relatedEntityId = input.relatedEntityId ? Academic.safeId(input.relatedEntityId, "Related academic object ID") : null;
    if (Boolean(relatedEntityType) !== Boolean(relatedEntityId)) throw new Academic.StudError("INVALID_INPUT", "A related academic object requires both its type and ID.");
    const provenanceId = input.provenanceId ? Academic.safeId(input.provenanceId, "Provenance ID") : null;
    return Object.freeze({requirementItemId, relatedEntityType, relatedEntityId, provenanceId});
}

function normalizeBlocker(input = {}, options = {}) {
    const allowed = ["workflowId", "nodeId", "blockerType", "title", "description", "reason", "expectedResolutionAt", "owner", "requiredInput", "requirementItemId", "relatedEntityType", "relatedEntityId", "provenanceId", "expectedWorkflowVersion"];
    Academic.assertAllowedKeys(input, allowed, options.update ? "Workflow blocker update" : "Workflow blocker");
    return Object.freeze({
        workflowId: Academic.safeId(input.workflowId, "Workflow ID"),
        nodeId: Academic.safeId(input.nodeId, "Workflow node ID"),
        blockerType: Academic.enumValue(input.blockerType, BLOCKER_TYPES, "Workflow blocker type"),
        title: Academic.requiredText(input.title, "Workflow blocker title", LIMITS.title),
        description: Academic.optionalText(input.description, "Workflow blocker description", LIMITS.description),
        reason: Academic.optionalText(input.reason, "Workflow blocker reason", LIMITS.description),
        expectedResolutionAt: Academic.optionalDate(input.expectedResolutionAt, "Expected resolution date"),
        owner: Academic.optionalText(input.owner, "Workflow blocker owner", LIMITS.owner),
        requiredInput: Academic.optionalText(input.requiredInput, "Required input or artifact", LIMITS.requiredInput),
        ...normalizeReference(input),
        expectedWorkflowVersion: Workflow.expectedVersion(input.expectedWorkflowVersion)
    });
}

function normalizeCheckpoint(input = {}) {
    Academic.assertAllowedKeys(input, ["workflowId", "nodeId", "title", "instructions", "requiredDecision", "requirementItemId", "relatedEntityType", "relatedEntityId", "provenanceId", "replacesCheckpointId", "expectedWorkflowVersion"], "Human checkpoint");
    return Object.freeze({
        workflowId: Academic.safeId(input.workflowId, "Workflow ID"),
        nodeId: Academic.safeId(input.nodeId, "Workflow node ID"),
        title: Academic.requiredText(input.title, "Human checkpoint title", LIMITS.title),
        instructions: Academic.optionalText(input.instructions, "Human checkpoint instructions", LIMITS.description),
        requiredDecision: Academic.optionalText(input.requiredDecision, "Required human decision", LIMITS.requiredInput),
        ...normalizeReference(input),
        replacesCheckpointId: input.replacesCheckpointId ? Academic.safeId(input.replacesCheckpointId, "Replaced checkpoint ID") : null,
        expectedWorkflowVersion: Workflow.expectedVersion(input.expectedWorkflowVersion)
    });
}

function expectedConditionVersion(value, label) { return Workflow.expectedVersion(value, label); }

module.exports = Object.freeze({
    BLOCKER_TYPES, BLOCKER_STATUSES, CHECKPOINT_STATUSES, CHECKPOINT_DECISIONS,
    ORIGINS, AVAILABILITY, LIMITS, normalizeReference, normalizeBlocker,
    normalizeCheckpoint, expectedConditionVersion
});

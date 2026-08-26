"use strict";

const Academic = require("./studAcademicModel.class.js");
const Workflow = require("./studWorkflowModel.class.js");
const Conditions = require("./studWorkflowConditionsModel.class.js");
const {StudWorkflowConditionsRepository} = require("./studWorkflowConditionsRepository.class.js");

class StudWorkflowConditionsService {
    constructor(options = {}) {
        if (!options.store || !options.workflowRepository) throw new Error("STUD store and workflow repository are required.");
        this.store = options.store;
        this.workflow = options.workflowRepository;
        this.requirements = options.requirementsService || null;
        this.workingContext = options.workingContextService || null;
        this.repository = options.repository || new StudWorkflowConditionsRepository(this.store, this.workflow);
    }

    sourceSnapshot(workflow, input) {
        let sourceContractId = null;
        let sourceContractRevision = null;
        let sourceContractHash = null;
        let sourceSnapshotHash = null;
        let origin = "USER";
        if (input.requirementItemId) {
            const row = this.store.db.prepare(`SELECT i.*,c.assignment_id,c.revision,c.contract_hash,c.lifecycle
                FROM stud_requirement_items i JOIN stud_requirement_contracts c ON c.id=i.contract_id WHERE i.id=?`).get(input.requirementItemId);
            if (!row) throw new Academic.StudError("NOT_FOUND", "Linked Requirement Item does not exist.");
            if (!workflow.contractId || row.contract_id !== workflow.contractId || row.assignment_id !== workflow.assignmentId) throw new Academic.StudError("INVALID_WORKFLOW_CONDITION_SOURCE", "A workflow condition may link only to a Requirement Item from the exact Contract revision recorded by this workflow.");
            const sources = this.store.db.prepare("SELECT id,snapshot_hash,source_kind,source_entity_type,source_entity_id,document_id,extraction_id,chunk_id,page_start,page_end,content_hash FROM stud_requirement_sources WHERE requirement_item_id=? ORDER BY id").all(row.id);
            sourceContractId = row.contract_id;
            sourceContractRevision = row.revision;
            sourceContractHash = row.contract_hash;
            sourceSnapshotHash = Workflow.sha256({item: {id: row.id, type: row.requirement_type, subtype: row.subtype, label: row.label, normalizedValue: row.normalized_value, resolutionState: row.resolution_state}, sources});
            origin = "REQUIREMENT";
        }
        if (input.provenanceId) {
            const provenance = this.store.db.prepare("SELECT id,entity_type,entity_id FROM stud_provenance_records WHERE id=?").get(input.provenanceId);
            if (!provenance) throw new Academic.StudError("NOT_FOUND", "Linked provenance observation does not exist.");
            origin = input.requirementItemId ? origin : "CANONICAL";
        }
        if (input.relatedEntityType) {
            const object = this.store.getEntity(input.relatedEntityType, input.relatedEntityId);
            if (!object) throw new Academic.StudError("NOT_FOUND", "Related academic object does not exist.");
            const assignment = this.workflow.requireAssignment(workflow.assignmentId);
            const scope = this.workingContext && this.workingContext.relationshipScope(input.relatedEntityType, object, assignment.courseId || null, assignment.id);
            if (!scope) throw new Academic.StudError("CONTEXT_RELATION_REQUIRED", "The related academic object must already belong to this Assignment or Course.");
            origin = input.requirementItemId ? origin : "CANONICAL";
        }
        return Object.freeze({sourceContractId, sourceContractRevision, sourceContractHash, sourceSnapshotHash, origin});
    }

    createBlocker(input = {}) {
        const value = Conditions.normalizeBlocker(input);
        const workflow = this.workflow.workflowRow(value.workflowId);
        return this.repository.createBlocker({...value, ...this.sourceSnapshot(workflow, value)});
    }

    updateBlocker(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId", "blockerId", "blockerType", "title", "description", "reason", "expectedResolutionAt", "owner", "requiredInput", "expectedWorkflowVersion", "expectedBlockerVersion"], "Workflow blocker update");
        const current = this.repository.blockerRow(input.workflowId, input.blockerId);
        const value = Conditions.normalizeBlocker({
            workflowId: input.workflowId,
            nodeId: current.nodeId,
            blockerType: input.blockerType === undefined ? current.blockerType : input.blockerType,
            title: input.title === undefined ? current.title : input.title,
            description: input.description === undefined ? current.description : input.description,
            reason: input.reason === undefined ? current.reason : input.reason,
            expectedResolutionAt: input.expectedResolutionAt === undefined ? current.expectedResolutionAt : input.expectedResolutionAt,
            owner: input.owner === undefined ? current.owner : input.owner,
            requiredInput: input.requiredInput === undefined ? current.requiredInput : input.requiredInput,
            expectedWorkflowVersion: input.expectedWorkflowVersion
        }, {update: true});
        return this.repository.updateBlocker({...value, blockerId: current.id, expectedBlockerVersion: Conditions.expectedConditionVersion(input.expectedBlockerVersion, "Expected blocker version")});
    }

    closeBlocker(input = {}, status) {
        Academic.assertAllowedKeys(input, ["workflowId", "blockerId", "note", "expectedWorkflowVersion", "expectedBlockerVersion"], `Workflow blocker ${status.toLowerCase()}`);
        return this.repository.closeBlocker({
            workflowId: Academic.safeId(input.workflowId, "Workflow ID"),
            blockerId: Academic.safeId(input.blockerId, "Workflow blocker ID"),
            note: Academic.optionalText(input.note, "Blocker resolution note", Conditions.LIMITS.note),
            expectedWorkflowVersion: Workflow.expectedVersion(input.expectedWorkflowVersion),
            expectedBlockerVersion: Conditions.expectedConditionVersion(input.expectedBlockerVersion, "Expected blocker version")
        }, status);
    }

    resolveBlocker(input = {}) { return this.closeBlocker(input, "RESOLVED"); }
    cancelBlocker(input = {}) { return this.closeBlocker(input, "CANCELLED"); }

    createCheckpoint(input = {}) {
        const value = Conditions.normalizeCheckpoint(input);
        const workflow = this.workflow.workflowRow(value.workflowId);
        return this.repository.createCheckpoint({...value, ...this.sourceSnapshot(workflow, value)});
    }

    decideCheckpoint(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId", "checkpointId", "decision", "note", "expectedWorkflowVersion", "expectedCheckpointVersion"], "Human checkpoint decision");
        return this.repository.decideCheckpoint({
            workflowId: Academic.safeId(input.workflowId, "Workflow ID"),
            checkpointId: Academic.safeId(input.checkpointId, "Human checkpoint ID"),
            decision: Academic.enumValue(input.decision, Conditions.CHECKPOINT_DECISIONS, "Human checkpoint decision"),
            note: Academic.optionalText(input.note, "Human checkpoint decision note", Conditions.LIMITS.note),
            expectedWorkflowVersion: Workflow.expectedVersion(input.expectedWorkflowVersion),
            expectedCheckpointVersion: Conditions.expectedConditionVersion(input.expectedCheckpointVersion, "Expected checkpoint version")
        });
    }

    state(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId"], "Workflow conditions request");
        const workflow = this.workflow.hydrate(Academic.safeId(input.workflowId, "Workflow ID"));
        return Object.freeze({workflowId: workflow.id, conditions: workflow.conditions, graph: workflow.graph});
    }

    impact(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId", "blockerId"], "Workflow blocker impact request");
        const workflow = this.workflow.hydrate(Academic.safeId(input.workflowId, "Workflow ID"));
        const blocker = workflow.conditions.blockers.find(item => item.id === Academic.safeId(input.blockerId, "Workflow blocker ID"));
        if (!blocker) throw new Academic.StudError("NOT_FOUND", "Workflow blocker does not exist in this workflow.");
        const directNode = workflow.graph.nodes.find(node => node.id === blocker.nodeId);
        const affected = workflow.graph.nodes.filter(node => node.impactSources.some(source => source.kind === "BLOCKER" && source.id === blocker.id));
        return Object.freeze({blocker, directNode, affected: Object.freeze(affected.map(node => Object.freeze({id: node.id, title: node.title, workState: node.state, availability: node.availability})))});
    }
}

module.exports = Object.freeze({StudWorkflowConditionsService});

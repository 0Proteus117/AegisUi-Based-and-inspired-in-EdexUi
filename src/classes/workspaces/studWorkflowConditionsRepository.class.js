"use strict";

const Academic = require("./studAcademicModel.class.js");
const Conditions = require("./studWorkflowConditionsModel.class.js");

function rowToCamel(row) {
    if (!row) return null;
    return Object.freeze(Object.entries(row).reduce((result, [key, value]) => {
        result[key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
        return result;
    }, {}));
}

class StudWorkflowConditionsRepository {
    constructor(store, workflowRepository) {
        if (!store || !workflowRepository) throw new Error("STUD store and workflow repository are required.");
        this.store = store;
        this.store.initialize();
        this.db = store.db;
        this.workflow = workflowRepository;
    }

    transaction(work) { return this.store.transaction(work); }

    assertMutableWorkflow(workflowId, expectedVersion) {
        const workflow = this.workflow.workflowRow(workflowId);
        this.workflow.assertExpectedWorkflow(workflow, expectedVersion);
        if (workflow.lifecycle !== "ACTIVE" || !workflow.isCurrent) throw new Academic.StudError("INVALID_TRANSITION", "Historical or archived workflows cannot be changed.");
        return workflow;
    }

    assertNode(workflowId, nodeId) { return this.workflow.nodeRow(workflowId, nodeId); }

    assertConditionableNode(workflowId, nodeId) {
        const node = this.assertNode(workflowId, nodeId);
        if (["COMPLETE", "SKIPPED"].includes(node.state)) throw new Academic.StudError("INVALID_TRANSITION", "A blocker or human checkpoint cannot be added to terminal work. Reopen the stage explicitly first.");
        return node;
    }

    blockerRow(workflowId, blockerId) {
        const workflow = this.workflow.workflowRow(workflowId);
        const id = Academic.safeId(blockerId, "Workflow blocker ID");
        const row = this.db.prepare("SELECT * FROM stud_workflow_blockers WHERE id=? AND workflow_id=?").get(id, workflow.id);
        if (!row) throw new Academic.StudError("NOT_FOUND", "Workflow blocker does not exist in this workflow.");
        return rowToCamel(row);
    }

    checkpointRow(workflowId, checkpointId) {
        const workflow = this.workflow.workflowRow(workflowId);
        const id = Academic.safeId(checkpointId, "Human checkpoint ID");
        const row = this.db.prepare("SELECT * FROM stud_workflow_checkpoints WHERE id=? AND workflow_id=?").get(id, workflow.id);
        if (!row) throw new Academic.StudError("NOT_FOUND", "Human checkpoint does not exist in this workflow.");
        return rowToCamel(row);
    }

    assertExpected(row, expected, kind) {
        const version = Conditions.expectedConditionVersion(expected, `Expected ${kind} version`);
        if (row.rowVersion !== version) throw new Academic.StudError(`STALE_${kind.toUpperCase()}_VERSION`, `The ${kind} changed in another operation. Reload before saving.`, {expected: version, actual: row.rowVersion});
    }

    listForWorkflow(workflowId) {
        const workflow = this.workflow.workflowRow(workflowId);
        const blockers = this.db.prepare("SELECT * FROM stud_workflow_blockers WHERE workflow_id=? ORDER BY created_at,id LIMIT ?").all(workflow.id, Conditions.LIMITS.perWorkflow).map(rowToCamel);
        const checkpoints = this.db.prepare("SELECT * FROM stud_workflow_checkpoints WHERE workflow_id=? ORDER BY created_at,id LIMIT ?").all(workflow.id, Conditions.LIMITS.perWorkflow).map(rowToCamel);
        return Object.freeze({blockers: Object.freeze(blockers), checkpoints: Object.freeze(checkpoints)});
    }

    assertCapacity(workflowId, table, label) {
        const count = Number(this.db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE workflow_id=?`).get(workflowId).count);
        if (count >= Conditions.LIMITS.perWorkflow) throw new Academic.StudError("WORKFLOW_LIMIT_REACHED", `${label} limit reached for this workflow.`);
    }

    createBlocker(input) {
        return this.transaction(() => {
            const workflow = this.assertMutableWorkflow(input.workflowId, input.expectedWorkflowVersion);
            const node = this.assertConditionableNode(workflow.id, input.nodeId);
            this.assertCapacity(workflow.id, "stud_workflow_blockers", "Workflow blocker");
            const id = Academic.createId("workflow_blocker");
            const timestamp = Academic.now();
            this.db.prepare(`INSERT INTO stud_workflow_blockers
                (id,workflow_id,node_id,blocker_type,status,title,description,reason,expected_resolution_at,owner,required_input,requirement_item_id,source_contract_id,source_contract_revision,source_contract_hash,source_snapshot_hash,related_entity_type,related_entity_id,provenance_id,origin,row_version,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .run(id, workflow.id, node.id, input.blockerType, "OPEN", input.title, input.description, input.reason, input.expectedResolutionAt, input.owner, input.requiredInput, input.requirementItemId, input.sourceContractId, input.sourceContractRevision, input.sourceContractHash, input.sourceSnapshotHash, input.relatedEntityType, input.relatedEntityId, input.provenanceId, input.origin, 1, timestamp, timestamp);
            this.workflow.bumpWorkflow(workflow, workflow.rowVersion);
            this.workflow.appendEvent(workflow.id, "BLOCKER_CREATED", node.id, {blockerId: id, blockerType: input.blockerType, origin: input.origin, requirementItemId: input.requirementItemId || null});
            return this.workflow.hydrate(workflow.id);
        });
    }

    updateBlocker(input) {
        return this.transaction(() => {
            const workflow = this.assertMutableWorkflow(input.workflowId, input.expectedWorkflowVersion);
            const blocker = this.blockerRow(workflow.id, input.blockerId);
            this.assertExpected(blocker, input.expectedBlockerVersion, "blocker");
            if (blocker.status !== "OPEN") throw new Academic.StudError("INVALID_TRANSITION", "Only an open blocker can be edited.");
            const result = this.db.prepare(`UPDATE stud_workflow_blockers SET blocker_type=?,title=?,description=?,reason=?,expected_resolution_at=?,owner=?,required_input=?,row_version=row_version+1,updated_at=?
                WHERE id=? AND workflow_id=? AND row_version=? AND status='OPEN'`)
                .run(input.blockerType, input.title, input.description, input.reason, input.expectedResolutionAt, input.owner, input.requiredInput, Academic.now(), blocker.id, workflow.id, blocker.rowVersion);
            if (Number(result.changes || 0) !== 1) throw new Academic.StudError("STALE_BLOCKER_VERSION", "The blocker changed in another operation. Reload before saving.");
            this.workflow.bumpWorkflow(workflow, workflow.rowVersion);
            this.workflow.appendEvent(workflow.id, "BLOCKER_UPDATED", blocker.nodeId, {blockerId: blocker.id});
            return this.workflow.hydrate(workflow.id);
        });
    }

    closeBlocker(input, status) {
        return this.transaction(() => {
            const workflow = this.assertMutableWorkflow(input.workflowId, input.expectedWorkflowVersion);
            const blocker = this.blockerRow(workflow.id, input.blockerId);
            this.assertExpected(blocker, input.expectedBlockerVersion, "blocker");
            if (blocker.status !== "OPEN") throw new Academic.StudError("INVALID_TRANSITION", "Only an open blocker can be resolved or cancelled.");
            const timestamp = Academic.now();
            const resolvedAt = status === "RESOLVED" ? timestamp : null;
            const cancelledAt = status === "CANCELLED" ? timestamp : null;
            const result = this.db.prepare(`UPDATE stud_workflow_blockers SET status=?,resolved_at=?,cancelled_at=?,resolution_note=?,row_version=row_version+1,updated_at=?
                WHERE id=? AND workflow_id=? AND row_version=? AND status='OPEN'`)
                .run(status, resolvedAt, cancelledAt, input.note, timestamp, blocker.id, workflow.id, blocker.rowVersion);
            if (Number(result.changes || 0) !== 1) throw new Academic.StudError("STALE_BLOCKER_VERSION", "The blocker changed in another operation. Reload before saving.");
            this.workflow.bumpWorkflow(workflow, workflow.rowVersion);
            this.workflow.appendEvent(workflow.id, status === "RESOLVED" ? "BLOCKER_RESOLVED" : "BLOCKER_CANCELLED", blocker.nodeId, {blockerId: blocker.id, note: input.note});
            return this.workflow.hydrate(workflow.id);
        });
    }

    createCheckpoint(input) {
        return this.transaction(() => {
            const workflow = this.assertMutableWorkflow(input.workflowId, input.expectedWorkflowVersion);
            const node = this.assertConditionableNode(workflow.id, input.nodeId);
            this.assertCapacity(workflow.id, "stud_workflow_checkpoints", "Human checkpoint");
            if (input.replacesCheckpointId) {
                const prior = this.checkpointRow(workflow.id, input.replacesCheckpointId);
                if (prior.nodeId !== node.id || !["REJECTED", "CANCELLED"].includes(prior.status)) throw new Academic.StudError("INVALID_TRANSITION", "A follow-up checkpoint may replace only a rejected or cancelled checkpoint on the same node.");
            }
            const id = Academic.createId("workflow_checkpoint");
            const timestamp = Academic.now();
            this.db.prepare(`INSERT INTO stud_workflow_checkpoints
                (id,workflow_id,node_id,title,instructions,required_decision,status,requirement_item_id,source_contract_id,source_contract_revision,source_contract_hash,source_snapshot_hash,related_entity_type,related_entity_id,provenance_id,origin,replaces_checkpoint_id,row_version,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .run(id, workflow.id, node.id, input.title, input.instructions, input.requiredDecision, "PENDING", input.requirementItemId, input.sourceContractId, input.sourceContractRevision, input.sourceContractHash, input.sourceSnapshotHash, input.relatedEntityType, input.relatedEntityId, input.provenanceId, input.origin, input.replacesCheckpointId, 1, timestamp, timestamp);
            this.workflow.bumpWorkflow(workflow, workflow.rowVersion);
            this.workflow.appendEvent(workflow.id, "CHECKPOINT_CREATED", node.id, {checkpointId: id, origin: input.origin, replacesCheckpointId: input.replacesCheckpointId || null, requirementItemId: input.requirementItemId || null});
            return this.workflow.hydrate(workflow.id);
        });
    }

    decideCheckpoint(input) {
        return this.transaction(() => {
            const workflow = this.assertMutableWorkflow(input.workflowId, input.expectedWorkflowVersion);
            const checkpoint = this.checkpointRow(workflow.id, input.checkpointId);
            this.assertExpected(checkpoint, input.expectedCheckpointVersion, "checkpoint");
            if (checkpoint.status !== "PENDING") throw new Academic.StudError("INVALID_TRANSITION", "Only a pending human checkpoint can receive a decision.");
            const status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "REJECT" ? "REJECTED" : "CANCELLED";
            const timestamp = Academic.now();
            const result = this.db.prepare(`UPDATE stud_workflow_checkpoints SET status=?,decision=?,decision_note=?,decided_at=?,cancelled_at=?,row_version=row_version+1,updated_at=?
                WHERE id=? AND workflow_id=? AND row_version=? AND status='PENDING'`)
                .run(status, input.decision, input.note, status === "CANCELLED" ? null : timestamp, status === "CANCELLED" ? timestamp : null, timestamp, checkpoint.id, workflow.id, checkpoint.rowVersion);
            if (Number(result.changes || 0) !== 1) throw new Academic.StudError("STALE_CHECKPOINT_VERSION", "The checkpoint changed in another operation. Reload before saving.");
            this.workflow.bumpWorkflow(workflow, workflow.rowVersion);
            this.workflow.appendEvent(workflow.id, `CHECKPOINT_${status}`, checkpoint.nodeId, {checkpointId: checkpoint.id, decision: input.decision, note: input.note});
            return this.workflow.hydrate(workflow.id);
        });
    }
}

module.exports = Object.freeze({StudWorkflowConditionsRepository, rowToCamel});

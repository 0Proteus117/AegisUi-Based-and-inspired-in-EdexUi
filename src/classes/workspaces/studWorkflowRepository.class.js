"use strict";

const Academic = require("./studAcademicModel.class.js");
const Workflow = require("./studWorkflowModel.class.js");

function parseJson(value, fallback = {}) {
    try { return value ? JSON.parse(value) : fallback; } catch (error) { return fallback; }
}

function rowToCamel(row) {
    if (!row) return null;
    const result = {};
    Object.entries(row).forEach(([key, value]) => {
        const name = key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
        result[name] = key === "is_current" ? Boolean(value) : value;
    });
    return result;
}

class StudWorkflowRepository {
    constructor(store) {
        if (!store) throw new Error("StudAcademicStore is required.");
        this.store = store;
        this.store.initialize();
        this.db = store.db;
        this.conditionsRepository = null;
    }

    setConditionsRepository(repository) { this.conditionsRepository = repository || null; return this; }

    transaction(work) { return this.store.transaction(work); }

    requireAssignment(assignmentId) {
        const assignment = this.store.getEntity("ASSIGNMENT", Academic.safeId(assignmentId, "Assignment ID"));
        if (!assignment) throw new Academic.StudError("NOT_FOUND", "Assignment does not exist.");
        return assignment;
    }

    seedTemplate(template) {
        return this.transaction(() => {
            const id = Workflow.stableId("workflow_template", template.key);
            const versionId = Workflow.stableId("workflow_template_version", template.key, template.version);
            const timestamp = Academic.now();
            const current = this.db.prepare("SELECT id FROM stud_workflow_templates WHERE template_key=?").get(template.key);
            if (!current) this.db.prepare("INSERT INTO stud_workflow_templates (id,template_key,title,description,created_at,updated_at) VALUES (?,?,?,?,?,?)")
                .run(id, template.key, template.title, template.description, timestamp, timestamp);
            else this.db.prepare("UPDATE stud_workflow_templates SET title=?,description=?,updated_at=? WHERE id=?")
                .run(template.title, template.description, timestamp, current.id);
            const existing = this.db.prepare("SELECT * FROM stud_workflow_template_versions WHERE template_id=? AND version=?").get(current && current.id || id, template.version);
            if (existing) {
                if (existing.fingerprint !== template.fingerprint || existing.canonical_json !== Workflow.canonicalJson({key: template.key, version: template.version, title: template.title, description: template.description, nodes: template.nodes, edges: template.edges})) {
                    throw new Academic.StudError("TEMPLATE_REGISTRY_DRIFT", "A published workflow template version changed without a new version number.", {templateKey: template.key, version: template.version});
                }
                return rowToCamel(existing);
            }
            const templateId = current && current.id || id;
            const canonical = Workflow.canonicalJson({key: template.key, version: template.version, title: template.title, description: template.description, nodes: template.nodes, edges: template.edges});
            this.db.prepare("INSERT INTO stud_workflow_template_versions (id,template_id,version,fingerprint,canonical_json,created_at) VALUES (?,?,?,?,?,?)")
                .run(versionId, templateId, template.version, template.fingerprint, canonical, timestamp);
            const nodeInsert = this.db.prepare("INSERT INTO stud_workflow_template_nodes (id,template_version_id,node_key,semantic_type,title,description,node_order) VALUES (?,?,?,?,?,?,?)");
            template.nodes.forEach(node => nodeInsert.run(Workflow.stableId("workflow_template_node", template.key, template.version, node.key), versionId, node.key, node.semanticType, node.title, node.description, node.order));
            const edgeInsert = this.db.prepare("INSERT INTO stud_workflow_template_edges (id,template_version_id,from_node_key,to_node_key) VALUES (?,?,?,?)");
            template.edges.forEach(edge => edgeInsert.run(Workflow.stableId("workflow_template_edge", template.key, template.version, edge.from, edge.to), versionId, edge.from, edge.to));
            return rowToCamel(this.db.prepare("SELECT * FROM stud_workflow_template_versions WHERE id=?").get(versionId));
        });
    }

    hydrateTemplateVersion(versionId) {
        const id = Academic.safeId(versionId, "Workflow template version ID");
        const row = this.db.prepare(`SELECT v.*,t.template_key,t.title,t.description
            FROM stud_workflow_template_versions v JOIN stud_workflow_templates t ON t.id=v.template_id WHERE v.id=?`).get(id);
        if (!row) throw new Academic.StudError("NOT_FOUND", "Workflow template version does not exist.");
        const canonical = Object.freeze(parseJson(row.canonical_json, {}));
        const nodes = this.db.prepare("SELECT * FROM stud_workflow_template_nodes WHERE template_version_id=? ORDER BY node_order,node_key").all(id).map(item => Object.freeze(rowToCamel(item)));
        const edges = this.db.prepare("SELECT * FROM stud_workflow_template_edges WHERE template_version_id=? ORDER BY from_node_key,to_node_key").all(id).map(item => Object.freeze(rowToCamel(item)));
        return Object.freeze({...rowToCamel(row), templateKey: canonical.key || row.template_key, title: canonical.title || row.title, description: canonical.description || row.description, canonical, nodes: Object.freeze(nodes), edges: Object.freeze(edges)});
    }

    listTemplates() {
        const rows = this.db.prepare(`SELECT v.id FROM stud_workflow_template_versions v
            JOIN (SELECT template_id,MAX(version) version FROM stud_workflow_template_versions GROUP BY template_id) latest
            ON latest.template_id=v.template_id AND latest.version=v.version
            JOIN stud_workflow_templates t ON t.id=v.template_id ORDER BY t.title`).all();
        return Object.freeze(rows.slice(0, Workflow.LIMITS.templates).map(row => this.hydrateTemplateVersion(row.id)));
    }

    templateVersionByKey(key, version = null) {
        const templateKey = Academic.enumValue(key, Workflow.TEMPLATE_KEYS, "Workflow template key");
        const row = version === null
            ? this.db.prepare(`SELECT v.id FROM stud_workflow_template_versions v JOIN stud_workflow_templates t ON t.id=v.template_id
                WHERE t.template_key=? ORDER BY v.version DESC LIMIT 1`).get(templateKey)
            : this.db.prepare(`SELECT v.id FROM stud_workflow_template_versions v JOIN stud_workflow_templates t ON t.id=v.template_id
                WHERE t.template_key=? AND v.version=?`).get(templateKey, Workflow.expectedVersion(version, "Template version"));
        if (!row) throw new Academic.StudError("NOT_FOUND", "Workflow template version does not exist.");
        return this.hydrateTemplateVersion(row.id);
    }

    workflowRow(workflowId) {
        const id = Academic.safeId(workflowId, "Workflow ID");
        const row = this.db.prepare("SELECT * FROM stud_workflow_instances WHERE id=?").get(id);
        if (!row) throw new Academic.StudError("NOT_FOUND", "Workflow does not exist.");
        return rowToCamel(row);
    }

    assertExpectedWorkflow(row, expected) {
        const version = Workflow.expectedVersion(expected);
        if (row.rowVersion !== version) throw new Academic.StudError("STALE_WORKFLOW_VERSION", "The workflow changed in another operation. Reload before saving.", {expected: version, actual: row.rowVersion});
    }

    assertExpectedNode(row, expected) {
        const version = Workflow.expectedVersion(expected, "Expected workflow node version");
        if (row.rowVersion !== version) throw new Academic.StudError("STALE_WORKFLOW_NODE_VERSION", "The workflow node changed in another operation. Reload before saving.", {expected: version, actual: row.rowVersion});
    }

    nodeRow(workflowId, nodeId) {
        const workflow = this.workflowRow(workflowId);
        const id = Academic.safeId(nodeId, "Workflow node ID");
        const row = this.db.prepare("SELECT * FROM stud_workflow_nodes WHERE id=? AND workflow_id=?").get(id, workflow.id);
        if (!row) throw new Academic.StudError("WORKFLOW_NODE_MISSING", "Workflow node does not exist in this workflow.");
        return rowToCamel(row);
    }

    rowsFor(workflowId) {
        const workflow = this.workflowRow(workflowId);
        const nodes = this.db.prepare("SELECT * FROM stud_workflow_nodes WHERE workflow_id=? ORDER BY node_order,id").all(workflow.id).map(rowToCamel);
        const edges = this.db.prepare("SELECT * FROM stud_workflow_edges WHERE workflow_id=? ORDER BY from_node_id,to_node_id").all(workflow.id).map(rowToCamel);
        const conditions = this.conditionsRepository ? this.conditionsRepository.listForWorkflow(workflow.id) : Object.freeze({blockers: Object.freeze([]), checkpoints: Object.freeze([])});
        const graph = Workflow.deriveGraph(nodes, edges, conditions);
        return {workflow, graph, conditions};
    }

    events(workflowId, limit = Workflow.LIMITS.history) {
        const workflow = this.workflowRow(workflowId);
        const safeLimit = Math.max(1, Math.min(Number(limit) || 100, Workflow.LIMITS.history));
        return Object.freeze(this.db.prepare("SELECT * FROM stud_workflow_events WHERE workflow_id=? ORDER BY event_sequence DESC LIMIT ?").all(workflow.id, safeLimit).map(row => {
            const value = rowToCamel(row); value.details = Object.freeze(parseJson(row.details_json, {})); delete value.detailsJson;
            return Object.freeze(value);
        }));
    }

    hydrate(workflowId, historyLimit = 100) {
        const {workflow, graph, conditions} = this.rowsFor(workflowId);
        const template = this.hydrateTemplateVersion(workflow.templateVersionId);
        let contract = null;
        if (workflow.contractId) contract = rowToCamel(this.db.prepare("SELECT id,assignment_id,revision,lifecycle,completeness,approved_as_incomplete,contract_hash FROM stud_requirement_contracts WHERE id=?").get(workflow.contractId));
        return Object.freeze({...workflow, template, contract: contract && Object.freeze(contract), graph, conditions, history: this.events(workflow.id, historyLimit)});
    }

    currentForAssignment(assignmentId) {
        const assignment = this.requireAssignment(assignmentId);
        const row = this.db.prepare("SELECT id FROM stud_workflow_instances WHERE assignment_id=? AND is_current=1").get(assignment.id);
        return row ? this.hydrate(row.id) : null;
    }

    listForAssignment(assignmentId, limit = 25) {
        const assignment = this.requireAssignment(assignmentId);
        const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
        return Object.freeze(this.db.prepare("SELECT id FROM stud_workflow_instances WHERE assignment_id=? ORDER BY is_current DESC,created_at DESC LIMIT ?").all(assignment.id, safeLimit).map(row => this.hydrate(row.id, 20)));
    }

    appendEvent(workflowId, type, nodeId, details = {}, actor = "USER") {
        const eventType = Academic.enumValue(type, Workflow.EVENT_TYPES, "Workflow event type");
        const serialized = Workflow.validateEventDetails(details);
        const sequence = Number(this.db.prepare("SELECT COALESCE(MAX(event_sequence),0)+1 sequence FROM stud_workflow_events WHERE workflow_id=?").get(workflowId).sequence);
        const id = Academic.createId("workflow_event");
        this.db.prepare("INSERT INTO stud_workflow_events (id,workflow_id,event_sequence,event_type,node_id,actor,details_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
            .run(id, workflowId, sequence, eventType, nodeId || null, Academic.requiredText(actor, "Workflow actor", 80), serialized, Academic.now());
        return id;
    }

    createInstance(input) {
        return this.transaction(() => {
            const assignment = this.requireAssignment(input.assignmentId);
            const existingRow = this.db.prepare("SELECT * FROM stud_workflow_instances WHERE assignment_id=? AND is_current=1").get(assignment.id);
            const existing = rowToCamel(existingRow);
            if (existing && !input.replaceCurrent) throw new Academic.StudError("WORKFLOW_ALREADY_EXISTS", "This Assignment already has a current workflow.");
            if (input.replaceCurrent) {
                if (!existing || existing.id !== Academic.safeId(input.replaceWorkflowId, "Workflow replacement ID")) throw new Academic.StudError("WORKFLOW_REPLACEMENT_MISMATCH", "The selected current workflow is no longer available for replacement.");
                this.assertExpectedWorkflow(existing, input.expectedWorkflowVersion);
            }
            const template = this.hydrateTemplateVersion(input.templateVersionId);
            const id = Academic.createId("workflow");
            const timestamp = Academic.now();
            if (existing) {
                const result = this.db.prepare("UPDATE stud_workflow_instances SET lifecycle='HISTORICAL',is_current=0,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=? AND is_current=1")
                    .run(timestamp, existing.id, existing.rowVersion);
                if (Number(result.changes || 0) !== 1) throw new Academic.StudError("STALE_WORKFLOW_VERSION", "The workflow changed in another operation. Reload before replacing it.");
                this.appendEvent(existing.id, "WORKFLOW_REPLACED", null, {replacementWorkflowId: id, reason: input.replacementReason});
            }
            this.db.prepare(`INSERT INTO stud_workflow_instances
                (id,assignment_id,template_version_id,template_fingerprint,contract_id,contract_revision,contract_hash,no_contract_reason,lifecycle,is_current,row_version,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .run(id, assignment.id, template.id, template.fingerprint, input.contractId || null, input.contractRevision || null, input.contractHash || null, input.noContractReason || null, "ACTIVE", 1, 1, timestamp, timestamp);
            const nodeInsert = this.db.prepare(`INSERT INTO stud_workflow_nodes
                (id,workflow_id,template_node_key,semantic_type,title,description,node_order,state,origin,row_version,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
            const nodeIds = new Map();
            template.nodes.forEach(node => {
                const nodeId = Workflow.stableId("workflow_node", id, node.nodeKey);
                nodeIds.set(node.nodeKey, nodeId);
                nodeInsert.run(nodeId, id, node.nodeKey, node.semanticType, node.title, node.description, node.nodeOrder, "NOT_STARTED", "TEMPLATE", 1, timestamp, timestamp);
            });
            const edgeInsert = this.db.prepare("INSERT INTO stud_workflow_edges (id,workflow_id,from_node_id,to_node_id,created_at) VALUES (?,?,?,?,?)");
            template.edges.forEach(edge => {
                const from = nodeIds.get(edge.fromNodeKey); const to = nodeIds.get(edge.toNodeKey);
                edgeInsert.run(Workflow.stableId("workflow_edge", id, from, to), id, from, to, timestamp);
            });
            this.appendEvent(id, "TEMPLATE_SELECTED", null, {templateKey: template.templateKey, templateVersion: template.version, templateFingerprint: template.fingerprint});
            this.appendEvent(id, "WORKFLOW_CREATED", null, {assignmentId: assignment.id, contractId: input.contractId || null, contractRevision: input.contractRevision || null, contractHash: input.contractHash || null, explicitNoContract: Boolean(input.noContractReason), replacedWorkflowId: existing && existing.id || null});
            return this.hydrate(id);
        });
    }

    bumpWorkflow(workflow, expectedVersion) {
        const result = this.db.prepare("UPDATE stud_workflow_instances SET row_version=row_version+1,updated_at=? WHERE id=? AND row_version=?")
            .run(Academic.now(), workflow.id, expectedVersion);
        if (Number(result.changes || 0) !== 1) throw new Academic.StudError("STALE_WORKFLOW_VERSION", "The workflow changed in another operation. Reload before saving.");
    }

    descendants(graph, nodeId) {
        const byId = new Map(graph.nodes.map(node => [node.id, node]));
        const seen = new Set(); const queue = [...(byId.get(nodeId) && byId.get(nodeId).successorIds || [])];
        while (queue.length) {
            const id = queue.shift(); if (seen.has(id)) continue; seen.add(id);
            queue.push(...(byId.get(id) && byId.get(id).successorIds || []));
        }
        return [...seen].map(id => byId.get(id));
    }

    transitionNode(input) {
        return this.transaction(() => {
            const workflow = this.workflowRow(input.workflowId);
            this.assertExpectedWorkflow(workflow, input.expectedWorkflowVersion);
            if (workflow.lifecycle !== "ACTIVE" || !workflow.isCurrent) throw new Academic.StudError("INVALID_TRANSITION", "Historical or archived workflows cannot be changed.");
            const {graph} = this.rowsFor(workflow.id);
            const graphNode = graph.nodes.find(node => node.id === Academic.safeId(input.nodeId, "Workflow node ID"));
            if (!graphNode) throw new Academic.StudError("WORKFLOW_NODE_MISSING", "Workflow node does not exist in this workflow.");
            this.assertExpectedNode(graphNode, input.expectedNodeVersion);
            const action = Academic.enumValue(input.action, Workflow.ACTIONS, "Workflow node action");
            const timestamp = Academic.now();
            let nextState; let eventType;
            if (action === "START" && graphNode.displayState === "READY") { nextState = "IN_PROGRESS"; eventType = "NODE_STARTED"; }
            else if (action === "COMPLETE" && graphNode.state === "IN_PROGRESS" && graphNode.availability === "AVAILABLE") { nextState = "COMPLETE"; eventType = "NODE_COMPLETED"; }
            else if (action === "SKIP" && ["READY", "IN_PROGRESS"].includes(graphNode.displayState) && graphNode.availability === "AVAILABLE") { nextState = "SKIPPED"; eventType = "NODE_SKIPPED"; }
            else if (action === "REOPEN" && ["COMPLETE", "SKIPPED"].includes(graphNode.state)) {
                const progressed = this.descendants(graph, graphNode.id).filter(node => node.state !== "NOT_STARTED");
                if (progressed.length) throw new Academic.StudError("DOWNSTREAM_PROGRESS_EXISTS", "Reopen downstream completed or active work first.", {nodeIds: progressed.map(node => node.id)});
                nextState = "NOT_STARTED"; eventType = "NODE_REOPENED";
            } else throw new Academic.StudError("INVALID_TRANSITION", "This workflow node transition is not currently allowed.", {state: graphNode.state, readiness: graphNode.readiness, action});
            const startedAt = nextState === "IN_PROGRESS" ? timestamp : action === "REOPEN" ? null : graphNode.startedAt;
            const completedAt = nextState === "COMPLETE" ? timestamp : action === "REOPEN" ? null : graphNode.completedAt;
            const skippedAt = nextState === "SKIPPED" ? timestamp : action === "REOPEN" ? null : graphNode.skippedAt;
            const result = this.db.prepare(`UPDATE stud_workflow_nodes SET state=?,started_at=?,completed_at=?,skipped_at=?,row_version=row_version+1,updated_at=?
                WHERE id=? AND workflow_id=? AND row_version=?`).run(nextState, startedAt, completedAt, skippedAt, timestamp, graphNode.id, workflow.id, graphNode.rowVersion);
            if (Number(result.changes || 0) !== 1) throw new Academic.StudError("STALE_WORKFLOW_NODE_VERSION", "The workflow node changed in another operation. Reload before saving.");
            this.bumpWorkflow(workflow, workflow.rowVersion);
            this.appendEvent(workflow.id, eventType, graphNode.id, {from: graphNode.state, to: nextState, reason: Academic.optionalText(input.reason, "Workflow transition reason", Workflow.LIMITS.reason)});
            return this.hydrate(workflow.id);
        });
    }

    assertTopologyEditable(workflowId) {
        const {graph} = this.rowsFor(workflowId);
        if (graph.nodes.some(node => node.state !== "NOT_STARTED")) throw new Academic.StudError("WORKFLOW_TOPOLOGY_LOCKED", "Workflow structure can be changed only before work has started.");
        return graph;
    }

    renameNode(input) {
        return this.transaction(() => {
            const workflow = this.workflowRow(input.workflowId); this.assertExpectedWorkflow(workflow, input.expectedWorkflowVersion);
            const node = this.nodeRow(workflow.id, input.nodeId); this.assertExpectedNode(node, input.expectedNodeVersion);
            const title = Academic.requiredText(input.title, "Workflow node title", Workflow.LIMITS.title);
            const result = this.db.prepare("UPDATE stud_workflow_nodes SET title=?,row_version=row_version+1,updated_at=? WHERE id=? AND workflow_id=? AND row_version=?")
                .run(title, Academic.now(), node.id, workflow.id, node.rowVersion);
            if (Number(result.changes || 0) !== 1) throw new Academic.StudError("STALE_WORKFLOW_NODE_VERSION", "The workflow node changed in another operation. Reload before saving.");
            this.bumpWorkflow(workflow, workflow.rowVersion);
            this.appendEvent(workflow.id, "NODE_RENAMED", node.id, {from: node.title, to: title});
            return this.hydrate(workflow.id);
        });
    }

    addNode(input) {
        return this.transaction(() => {
            const workflow = this.workflowRow(input.workflowId); this.assertExpectedWorkflow(workflow, input.expectedWorkflowVersion);
            const graph = this.assertTopologyEditable(workflow.id);
            if (graph.nodes.length >= Workflow.LIMITS.nodes) throw new Academic.StudError("WORKFLOW_LIMIT_REACHED", "Workflow node limit reached.");
            const node = Workflow.normalizeNodeMutation(input.node);
            const id = Academic.createId("workflow_node"); const timestamp = Academic.now();
            this.db.prepare(`INSERT INTO stud_workflow_nodes
                (id,workflow_id,template_node_key,semantic_type,title,description,node_order,state,origin,row_version,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, workflow.id, null, node.semanticType, node.title, node.description, node.order, "NOT_STARTED", "USER", 1, timestamp, timestamp);
            this.bumpWorkflow(workflow, workflow.rowVersion);
            this.appendEvent(workflow.id, "NODE_ADDED", id, {title: node.title, semanticType: node.semanticType});
            return this.hydrate(workflow.id);
        });
    }

    addEdge(input) {
        return this.transaction(() => {
            const workflow = this.workflowRow(input.workflowId); this.assertExpectedWorkflow(workflow, input.expectedWorkflowVersion);
            const graph = this.assertTopologyEditable(workflow.id);
            if (graph.edges.length >= Workflow.LIMITS.edges) throw new Academic.StudError("WORKFLOW_LIMIT_REACHED", "Workflow dependency limit reached.");
            const from = this.nodeRow(workflow.id, input.fromNodeId); const to = this.nodeRow(workflow.id, input.toNodeId);
            Workflow.assertAcyclic(graph.nodes.map(node => node.id), [...graph.edges, {fromNodeId: from.id, toNodeId: to.id}]);
            const id = Academic.createId("workflow_edge");
            this.db.prepare("INSERT INTO stud_workflow_edges (id,workflow_id,from_node_id,to_node_id,created_at) VALUES (?,?,?,?,?)")
                .run(id, workflow.id, from.id, to.id, Academic.now());
            this.bumpWorkflow(workflow, workflow.rowVersion);
            this.appendEvent(workflow.id, "EDGE_ADDED", null, {edgeId: id, fromNodeId: from.id, toNodeId: to.id});
            return this.hydrate(workflow.id);
        });
    }

    removeEdge(input) {
        return this.transaction(() => {
            const workflow = this.workflowRow(input.workflowId); this.assertExpectedWorkflow(workflow, input.expectedWorkflowVersion);
            this.assertTopologyEditable(workflow.id);
            const id = Academic.safeId(input.edgeId, "Workflow edge ID");
            const edge = this.db.prepare("SELECT * FROM stud_workflow_edges WHERE id=? AND workflow_id=?").get(id, workflow.id);
            if (!edge) throw new Academic.StudError("NOT_FOUND", "Workflow dependency does not exist.");
            this.db.prepare("DELETE FROM stud_workflow_edges WHERE id=? AND workflow_id=?").run(id, workflow.id);
            this.bumpWorkflow(workflow, workflow.rowVersion);
            this.appendEvent(workflow.id, "EDGE_REMOVED", null, {edgeId: id, fromNodeId: edge.from_node_id, toNodeId: edge.to_node_id});
            return this.hydrate(workflow.id);
        });
    }
}

module.exports = Object.freeze({StudWorkflowRepository});

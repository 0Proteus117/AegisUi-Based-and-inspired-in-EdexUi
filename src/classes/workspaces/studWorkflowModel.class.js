"use strict";

const crypto = require("crypto");
const Academic = require("./studAcademicModel.class.js");

const TEMPLATE_KEYS = Object.freeze([
    "STANDARD_WRITTEN_COURSEWORK",
    "TECHNICAL_ENGINEERING",
    "EXAM_PREPARATION",
    "GROUP_PROJECT",
    "GENERIC_MANUAL"
]);
const NODE_TYPES = Object.freeze(["RESEARCH", "WRITING", "TECHNICAL", "HUMAN_TASK", "EXTERNAL_TASK", "REVIEW", "FINALISATION", "OTHER"]);
const NODE_STATES = Object.freeze(["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "SKIPPED"]);
const DISPLAY_STATES = Object.freeze(["NOT_STARTED", "READY", "IN_PROGRESS", "COMPLETE", "SKIPPED"]);
const WORKFLOW_LIFECYCLES = Object.freeze(["ACTIVE", "HISTORICAL", "ARCHIVED"]);
const EVENT_TYPES = Object.freeze([
    "TEMPLATE_SELECTED", "WORKFLOW_CREATED", "NODE_STARTED", "NODE_COMPLETED",
    "NODE_SKIPPED", "NODE_REOPENED", "NODE_RENAMED", "NODE_ADDED",
    "EDGE_ADDED", "EDGE_REMOVED", "WORKFLOW_REPLACED"
]);
const ACTIONS = Object.freeze(["START", "COMPLETE", "SKIP", "REOPEN"]);
const LIMITS = Object.freeze({templates: 20, nodes: 40, edges: 160, history: 500, title: 240, description: 4000, reason: 1000, eventBytes: 8192});

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((result, key) => {
        if (value[key] !== undefined) result[key] = canonicalize(value[key]);
        return result;
    }, {});
}

function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function sha256(value) { return crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value), "utf8").digest("hex"); }

function expectedVersion(value, label = "Expected workflow version") {
    const version = Number(value);
    if (!Number.isSafeInteger(version) || version < 1) throw new Academic.StudError("INVALID_INPUT", `${label} is invalid.`);
    return version;
}

function safeKey(value, label = "Workflow key") {
    const key = Academic.requiredText(value, label, 80).toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(key)) throw new Academic.StudError("INVALID_INPUT", `${label} is invalid.`);
    return key;
}

function stableId(kind, ...parts) {
    const prefix = String(kind || "workflow").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 28);
    const readable = parts.join("_").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 42);
    return `stud_${prefix}_${readable}_${sha256(parts).slice(0, 12)}`.slice(0, 95).replace(/_+$/g, "");
}

function normalizeTemplateNode(input = {}) {
    Academic.assertAllowedKeys(input, ["key", "title", "description", "semanticType", "order"], "Workflow template node");
    return Object.freeze({
        key: safeKey(input.key, "Template node key"),
        title: Academic.requiredText(input.title, "Template node title", LIMITS.title),
        description: Academic.optionalText(input.description, "Template node description", LIMITS.description),
        semanticType: Academic.enumValue(input.semanticType || "OTHER", NODE_TYPES, "Workflow node semantic type"),
        order: Academic.optionalNonNegativeInteger(input.order, "Template node order", 10000) || 0
    });
}

function assertAcyclic(nodeIds, edges) {
    const nodes = [...new Set(nodeIds)];
    if (nodes.length !== nodeIds.length) throw new Academic.StudError("DUPLICATE_WORKFLOW_NODE", "Workflow node identities must be unique.");
    const incoming = new Map(nodes.map(id => [id, 0]));
    const outgoing = new Map(nodes.map(id => [id, []]));
    const seenEdges = new Set();
    edges.forEach(edge => {
        const from = edge.from || edge.fromNodeId;
        const to = edge.to || edge.toNodeId;
        if (!nodes.includes(from) || !nodes.includes(to)) throw new Academic.StudError("WORKFLOW_NODE_MISSING", "Workflow edge references a missing node.");
        if (from === to) throw new Academic.StudError("WORKFLOW_SELF_EDGE", "A workflow node cannot depend on itself.");
        const key = `${from}->${to}`;
        if (seenEdges.has(key)) throw new Academic.StudError("DUPLICATE_WORKFLOW_EDGE", "Workflow edge already exists.");
        seenEdges.add(key);
        incoming.set(to, incoming.get(to) + 1);
        outgoing.get(from).push(to);
    });
    const queue = nodes.filter(id => incoming.get(id) === 0).sort();
    const order = [];
    while (queue.length) {
        const current = queue.shift();
        order.push(current);
        outgoing.get(current).sort().forEach(next => {
            incoming.set(next, incoming.get(next) - 1);
            if (incoming.get(next) === 0) {
                queue.push(next);
                queue.sort();
            }
        });
    }
    if (order.length !== nodes.length) throw new Academic.StudError("WORKFLOW_CYCLE", "Workflow dependencies must remain acyclic.");
    return Object.freeze(order);
}

function normalizeTemplate(input = {}) {
    Academic.assertAllowedKeys(input, ["key", "version", "title", "description", "nodes", "edges"], "Workflow template");
    const key = Academic.enumValue(input.key, TEMPLATE_KEYS, "Workflow template key");
    const version = Number(input.version);
    if (!Number.isSafeInteger(version) || version < 1 || version > 10000) throw new Academic.StudError("INVALID_INPUT", "Workflow template version is invalid.");
    if (!Array.isArray(input.nodes) || !input.nodes.length || input.nodes.length > LIMITS.nodes) throw new Academic.StudError("INVALID_INPUT", `Workflow template requires 1-${LIMITS.nodes} nodes.`);
    if (!Array.isArray(input.edges) || input.edges.length > LIMITS.edges) throw new Academic.StudError("INVALID_INPUT", "Workflow template edges are invalid or exceed the bound.");
    const nodes = input.nodes.map(normalizeTemplateNode);
    const keys = nodes.map(node => node.key);
    const edges = input.edges.map(edge => {
        Academic.assertAllowedKeys(edge, ["from", "to"], "Workflow template edge");
        return Object.freeze({from: safeKey(edge.from, "Workflow edge source"), to: safeKey(edge.to, "Workflow edge destination")});
    });
    assertAcyclic(keys, edges);
    const normalized = {
        key,
        version,
        title: Academic.requiredText(input.title, "Workflow template title", LIMITS.title),
        description: Academic.optionalText(input.description, "Workflow template description", LIMITS.description),
        nodes: Object.freeze(nodes.sort((left, right) => left.order - right.order || left.key.localeCompare(right.key))),
        edges: Object.freeze(edges.sort((left, right) => `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`)))
    };
    return Object.freeze({...normalized, fingerprint: sha256(normalized)});
}

function normalizeNodeMutation(input = {}) {
    Academic.assertAllowedKeys(input, ["title", "description", "semanticType", "order"], "Workflow node");
    return Object.freeze({
        title: Academic.requiredText(input.title, "Workflow node title", LIMITS.title),
        description: Academic.optionalText(input.description, "Workflow node description", LIMITS.description),
        semanticType: Academic.enumValue(input.semanticType || "OTHER", NODE_TYPES, "Workflow node semantic type"),
        order: Academic.optionalNonNegativeInteger(input.order, "Workflow node order", 10000) || 0
    });
}

function deriveGraph(nodes, edges) {
    if (!Array.isArray(nodes) || nodes.length > LIMITS.nodes) throw new Academic.StudError("INVALID_INPUT", "Workflow node collection is invalid.");
    if (!Array.isArray(edges) || edges.length > LIMITS.edges) throw new Academic.StudError("INVALID_INPUT", "Workflow edge collection is invalid.");
    assertAcyclic(nodes.map(node => node.id), edges);
    const incoming = new Map(nodes.map(node => [node.id, []]));
    const outgoing = new Map(nodes.map(node => [node.id, []]));
    edges.forEach(edge => { incoming.get(edge.toNodeId).push(edge.fromNodeId); outgoing.get(edge.fromNodeId).push(edge.toNodeId); });
    const byId = new Map(nodes.map(node => [node.id, node]));
    const terminal = node => ["COMPLETE", "SKIPPED"].includes(node.state);
    const hasProgressedDescendant = nodeId => {
        const seen = new Set(); const queue = [...outgoing.get(nodeId)];
        while (queue.length) {
            const id = queue.shift();
            if (seen.has(id)) continue;
            seen.add(id);
            if (byId.get(id).state !== "NOT_STARTED") return true;
            queue.push(...outgoing.get(id));
        }
        return false;
    };
    const hydrated = nodes.map(node => {
        const predecessorIds = incoming.get(node.id).slice().sort();
        const predecessorStates = predecessorIds.map(id => byId.get(id));
        const ready = node.state === "NOT_STARTED" && predecessorStates.every(terminal);
        const displayState = ready ? "READY" : node.state;
        const availableActions = [];
        if (ready) availableActions.push("START", "SKIP");
        if (node.state === "IN_PROGRESS") availableActions.push("COMPLETE", "SKIP");
        if (["COMPLETE", "SKIPPED"].includes(node.state) && !hasProgressedDescendant(node.id)) availableActions.push("REOPEN");
        return Object.freeze({...node, readiness: ready ? "READY" : node.state === "NOT_STARTED" ? "DEPENDENCIES_PENDING" : "NOT_APPLICABLE", displayState, predecessorIds: Object.freeze(predecessorIds), successorIds: Object.freeze(outgoing.get(node.id).slice().sort()), availableActions: Object.freeze(availableActions)});
    });
    const complete = hydrated.filter(node => node.state === "COMPLETE").length;
    const skipped = hydrated.filter(node => node.state === "SKIPPED").length;
    const terminalCount = complete + skipped;
    return Object.freeze({
        nodes: Object.freeze(hydrated),
        edges: Object.freeze(edges),
        summary: Object.freeze({total: hydrated.length, complete, skipped, terminal: terminalCount, inProgress: hydrated.filter(node => node.state === "IN_PROGRESS").length, ready: hydrated.filter(node => node.displayState === "READY").length, workflowComplete: hydrated.length > 0 && terminalCount === hydrated.length})
    });
}

function validateEventDetails(value = {}) {
    Academic.assertPlainObject(value, "Workflow event details");
    if (Academic.bytesOf(value) > LIMITS.eventBytes) throw new Academic.StudError("PAYLOAD_TOO_LARGE", "Workflow event details exceed the permitted size.");
    return canonicalJson(value);
}

module.exports = Object.freeze({
    TEMPLATE_KEYS, NODE_TYPES, NODE_STATES, DISPLAY_STATES, WORKFLOW_LIFECYCLES,
    EVENT_TYPES, ACTIONS, LIMITS, canonicalize, canonicalJson, sha256,
    expectedVersion, safeKey, stableId, normalizeTemplateNode, normalizeTemplate,
    normalizeNodeMutation, assertAcyclic, deriveGraph, validateEventDetails
});

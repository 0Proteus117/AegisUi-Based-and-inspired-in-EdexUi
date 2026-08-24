"use strict";

class StudWorkflowWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent;
        this.state = {assignment: null, workflowState: null, selectedNodeId: null, busy: false};
    }

    setState(assignment, workflowState) {
        const priorWorkflow = this.state.workflowState && this.state.workflowState.current;
        this.state.assignment = assignment || null;
        this.state.workflowState = workflowState || null;
        const current = workflowState && workflowState.current;
        if (!current || !priorWorkflow || priorWorkflow.id !== current.id || !current.graph.nodes.some(node => node.id === this.state.selectedNodeId)) {
            const contextNode = this.parent.state.workingContext && this.parent.state.workingContext.activeWorkflowNode;
            this.state.selectedNodeId = contextNode && current && contextNode.workflowId === current.id ? contextNode.id : current && (current.graph.nodes.find(node => node.state === "IN_PROGRESS") || current.graph.nodes.find(node => node.displayState === "READY") || current.graph.nodes[0] || {}).id || null;
        }
    }

    current() { return this.state.workflowState && this.state.workflowState.current || null; }

    nodeMark(node) {
        if (node.state === "COMPLETE") return "✓";
        if (node.state === "SKIPPED") return "–";
        if (node.state === "IN_PROGRESS") return "▶";
        if (node.displayState === "READY") return "●";
        return "○";
    }

    approvedContracts() {
        const state = this.state.workflowState && this.state.workflowState.contractState;
        if (!state) return [];
        const values = [state.current, ...(state.history || [])].filter(item => item && ["APPROVED", "SUPERSEDED"].includes(item.lifecycle) && item.contractHash);
        return [...new Map(values.map(item => [item.id, item])).values()].sort((left, right) => Number(right.revision) - Number(left.revision));
    }

    renderContractChoice() {
        const contracts = this.approvedContracts();
        if (!contracts.length) return `<strong>NO APPROVED CONTRACT</strong><p>You may proceed only by recording an explicit reason. This does not invent requirements.</p><label class="stud-workflow-no-contract"><input type="checkbox" name="allowNoContract"> CONTINUE WITHOUT A REVIEWED CONTRACT</label><label>REASON<textarea name="noContractReason" maxlength="1000" placeholder="Why is a workflow needed before requirements review?"></textarea></label>`;
        return `<label>APPROVED CONTRACT REVISION<select name="contractId">${contracts.map(contract => `<option value="${this.escape(contract.id)}">REV ${contract.revision} · ${this.escape(contract.lifecycle)} · ${this.escape(contract.completeness)}${contract.approvedAsIncomplete ? " · INCOMPLETE APPROVAL" : ""}</option>`).join("")}</select></label><small>The exact immutable revision and fingerprint will be recorded with the workflow.</small>`;
    }

    renderTemplateChoices(selectedKey = null) {
        const setup = this.state.workflowState && this.state.workflowState.setup;
        if (!setup) return "";
        const suggestionByKey = new Map((setup.suggestions || []).map(item => [item.key, item]));
        const preferred = selectedKey || setup.suggestions[0] && setup.suggestions[0].key || "GENERIC_MANUAL";
        return setup.templates.map(template => { const suggestion = suggestionByKey.get(template.templateKey); return `<label class="stud-workflow-template${suggestion ? " is-suggested" : ""}"><input type="radio" name="templateKey" value="${this.escape(template.templateKey)}" data-template-version="${template.version}"${template.templateKey === preferred ? " checked" : ""}><span><strong>${this.escape(template.title)}</strong><small>${this.escape(template.description || "")}</small>${suggestion ? `<em>${this.escape(suggestion.strength)} · ${this.escape(suggestion.reason)}</em>` : ""}</span></label>`; }).join("");
    }

    renderSetup() {
        const state = this.state.workflowState;
        const setup = state && state.setup;
        if (!setup) return `<section class="stud-workflow is-empty"><p>WORKFLOW SETUP UNAVAILABLE.</p></section>`;
        return `<section class="stud-workflow is-setup">
            <header class="stud-workflow-heading"><div><small>WORKFLOW</small><h3>Plan this Assignment</h3><p>Choose a bounded starting structure. Nothing starts, completes or calls an external service automatically.</p></div><span>NOT CREATED</span></header>
            <form class="stud-workflow-setup" data-stud-workflow-form="CREATE">
                <fieldset><legend>STARTING STRUCTURE</legend>${this.renderTemplateChoices()}</fieldset>
                <aside class="stud-workflow-contract-link"><small>REQUIREMENTS BASIS</small>${this.renderContractChoice()}</aside>
                <button type="submit">CREATE WORKFLOW</button>
            </form>
        </section>`;
    }

    renderNodeDetail(workflow, node) {
        if (!node) return `<aside class="stud-workflow-inspector"><p>SELECT A WORKFLOW STAGE.</p></aside>`;
        const predecessors = node.predecessorIds.map(id => workflow.graph.nodes.find(item => item.id === id)).filter(Boolean);
        const successors = node.successorIds.map(id => workflow.graph.nodes.find(item => item.id === id)).filter(Boolean);
        const history = workflow.history.filter(event => event.nodeId === node.id).slice(0, 12);
        return `<aside class="stud-workflow-inspector">
            <header><small>${this.escape(node.semanticType.replace(/_/g, " "))}</small><span>${this.escape(node.displayState.replace(/_/g, " "))}</span></header>
            <h4>${this.escape(node.title)}</h4><p>${this.escape(node.description || "No additional description was supplied by the selected template.")}</p>
            <div class="stud-workflow-actions">${node.availableActions.map(action => `<button type="button" data-stud-workflow-action="${action}" data-workflow-id="${this.escape(workflow.id)}" data-node-id="${this.escape(node.id)}" data-workflow-version="${workflow.rowVersion}" data-node-version="${node.rowVersion}">${action}</button>`).join("") || `<span>NO STATE ACTION AVAILABLE</span>`}</div>
            <dl><div><dt>DEPENDS ON</dt><dd>${predecessors.length ? predecessors.map(item => this.escape(item.title)).join(" · ") : "NONE"}</dd></div><div><dt>UNLOCKS</dt><dd>${successors.length ? successors.map(item => this.escape(item.title)).join(" · ") : "NONE"}</dd></div></dl>
            <details><summary>HISTORY &amp; ORIGIN</summary><p>Origin: ${this.escape(node.origin)}${node.templateNodeKey ? ` · ${this.escape(node.templateNodeKey)}` : ""}</p>${history.length ? `<ol>${history.map(event => `<li><strong>${this.escape(event.eventType.replace(/_/g, " "))}</strong><small>${this.escape(event.createdAt)}</small></li>`).join("")}</ol>` : `<p>No explicit work event has been recorded for this stage.</p>`}<small>Canonical node ${this.escape(node.id)}</small></details>
        </aside>`;
    }

    renderWorkflow() {
        const workflow = this.current();
        if (!workflow) return this.renderSetup();
        const selected = workflow.graph.nodes.find(node => node.id === this.state.selectedNodeId) || workflow.graph.nodes[0];
        const summary = workflow.graph.summary;
        const integrity = workflow.integrity || {};
        const hasProgress = workflow.graph.nodes.some(node => node.state !== "NOT_STARTED");
        const nodeOptions = workflow.graph.nodes.map(node => `<option value="${this.escape(node.id)}">${this.escape(node.title)}</option>`).join("");
        const history = (this.state.workflowState.history || []).filter(item => item.id !== workflow.id);
        const historical = history.length ? `<details class="stud-workflow-history"><summary>PREVIOUS WORKFLOWS · ${history.length}</summary>${history.map(item => `<article><div><strong>${this.escape(item.template.title)}</strong><span>${this.escape(item.lifecycle)} · ${item.graph.summary.terminal} OF ${item.graph.summary.total} TERMINAL</span></div><small>${item.contractRevision ? `CONTRACT REV ${item.contractRevision}` : "NO-CONTRACT PATH"} · ${this.escape(item.createdAt)}</small><details><summary>INSPECT STAGES &amp; EVENTS</summary><ol>${item.graph.nodes.map(node => `<li>${this.escape(node.title)} <small>${this.escape(node.displayState.replace(/_/g, " "))}</small></li>`).join("")}</ol><p>${item.history.length} RECORDED EVENTS SHOWN</p></details></article>`).join("")}</details>` : "";
        const topology = !hasProgress ? `<div class="stud-workflow-topology">
            <form data-stud-workflow-form="RENAME"><input type="hidden" name="workflowId" value="${this.escape(workflow.id)}"><input type="hidden" name="nodeId" value="${this.escape(selected.id)}"><input type="hidden" name="expectedWorkflowVersion" value="${workflow.rowVersion}"><input type="hidden" name="expectedNodeVersion" value="${selected.rowVersion}"><label>RENAME SELECTED STAGE<input name="title" required maxlength="240" value="${this.escape(selected.title)}"></label><button type="submit">RENAME</button></form>
            <form data-stud-workflow-form="ADD_NODE"><input type="hidden" name="workflowId" value="${this.escape(workflow.id)}"><input type="hidden" name="expectedWorkflowVersion" value="${workflow.rowVersion}"><label>ADD STAGE<input name="title" required maxlength="240"></label><label>TYPE<select name="semanticType">${["RESEARCH","WRITING","TECHNICAL","HUMAN_TASK","EXTERNAL_TASK","REVIEW","FINALISATION","OTHER"].map(type => `<option>${type}</option>`).join("")}</select></label><button type="submit">ADD</button></form>
            <form data-stud-workflow-form="ADD_EDGE"><input type="hidden" name="workflowId" value="${this.escape(workflow.id)}"><input type="hidden" name="expectedWorkflowVersion" value="${workflow.rowVersion}"><label>PREDECESSOR<select name="fromNodeId">${nodeOptions}</select></label><label>DEPENDENT STAGE<select name="toNodeId">${nodeOptions}</select></label><button type="submit">ADD DEPENDENCY</button></form>
            <section class="stud-workflow-edge-list"><small>DEPENDENCIES · ${workflow.graph.edges.length}</small>${workflow.graph.edges.map(edge => { const from = workflow.graph.nodes.find(node => node.id === edge.fromNodeId); const to = workflow.graph.nodes.find(node => node.id === edge.toNodeId); return `<p><span>${this.escape(from && from.title || edge.fromNodeId)} → ${this.escape(to && to.title || edge.toNodeId)}</span><button type="button" data-stud-workflow-edge-remove="${this.escape(edge.id)}" data-workflow-id="${this.escape(workflow.id)}" data-workflow-version="${workflow.rowVersion}">REMOVE</button></p>`; }).join("")}</section>
        </div>` : `<p>Topology editing is locked after explicit work begins. State history remains intact.</p>`;
        return `<section class="stud-workflow is-active">
            <header class="stud-workflow-heading"><div><small>WORKFLOW · ${this.escape(workflow.template.title)}</small><h3>${summary.workflowComplete ? "Workflow terminal state reached" : "Assignment work plan"}</h3><p>${summary.terminal} OF ${summary.total} TERMINAL${summary.skipped ? ` · ${summary.skipped} SKIPPED` : ""}${summary.inProgress ? ` · ${summary.inProgress} IN PROGRESS` : ""}</p></div><div><strong>${this.escape(integrity.contractRelation && integrity.contractRelation.replace(/_/g, " ") || "CONTRACT STATE UNKNOWN")}</strong><span>${workflow.contractRevision ? `CONTRACT REV ${workflow.contractRevision}` : "EXPLICIT NO-CONTRACT PATH"}</span></div></header>
            ${integrity.contractSnapshotMatches === false ? `<div class="stud-workflow-integrity" role="status"><strong>CONTRACT SNAPSHOT MISMATCH</strong><span>The workflow remains unchanged and requires technical review.</span></div>` : ""}
            ${integrity.sourceReviewCondition && integrity.sourceReviewCondition !== "CURRENT" ? `<div class="stud-workflow-attention" role="status"><strong>${this.escape(integrity.sourceReviewCondition.replace(/_/g, " "))}</strong><span>The approved Contract and this workflow remain immutable; review source drift separately.</span></div>` : ""}
            <div class="stud-workflow-workspace"><ol class="stud-workflow-rail">${workflow.graph.nodes.map((node, index) => `<li class="is-${node.displayState.toLowerCase().replace(/_/g, "-")}${node.id === selected.id ? " is-selected" : ""}" style="--workflow-order:${index}"><button type="button" data-stud-workflow-node="${this.escape(node.id)}" data-workflow-id="${this.escape(workflow.id)}"><span class="stud-workflow-node-mark">${this.nodeMark(node)}</span><span><strong>${this.escape(node.title)}</strong><small>${this.escape(node.displayState.replace(/_/g, " "))}${node.predecessorIds.length > 1 ? ` · ${node.predecessorIds.length} PREDECESSORS` : ""}</small></span></button></li>`).join("")}</ol>${this.renderNodeDetail(workflow, selected)}</div>
            ${historical}
            <details class="stud-workflow-advanced"><summary>ADVANCED WORKFLOW DETAILS</summary><dl><div><dt>TEMPLATE VERSION</dt><dd>${workflow.template.version} · ${this.escape(workflow.template.fingerprint)}</dd></div><div><dt>WORKFLOW VERSION</dt><dd>${workflow.rowVersion}</dd></div><div><dt>CREATED</dt><dd>${this.escape(workflow.createdAt)}</dd></div></dl>${topology}<details class="stud-workflow-replacement"><summary>CREATE AN EXPLICIT REPLACEMENT</summary><p>The current workflow will remain read-only and inspectable as historical work. No state or activity is copied.</p><form data-stud-workflow-form="REPLACE"><input type="hidden" name="replaceWorkflowId" value="${this.escape(workflow.id)}"><input type="hidden" name="expectedWorkflowVersion" value="${workflow.rowVersion}"><fieldset><legend>REPLACEMENT STRUCTURE</legend>${this.renderTemplateChoices(workflow.template.templateKey)}</fieldset><aside class="stud-workflow-contract-link"><small>REQUIREMENTS BASIS</small>${this.renderContractChoice()}</aside><label>REASON<textarea name="replacementReason" required maxlength="1000" placeholder="Why is a new workflow required?"></textarea></label><button type="submit">CREATE REPLACEMENT</button></form></details></details>
        </section>`;
    }

    render() { return this.state.workflowState ? this.renderWorkflow() : `<section class="stud-workflow"><p>WORKFLOW STATE UNAVAILABLE.</p></section>`; }

    async refresh() {
        if (!this.state.assignment) return;
        const state = await this.request("stud-workflow-assignment-state", {assignmentId: this.state.assignment.id, historyLimit: 100});
        this.setState(this.state.assignment, state);
        this.parent.state.assignmentContext.workflowState = state;
        this.parent.render();
    }

    async run(action, success, onResult = null) {
        if (this.state.busy) return;
        this.state.busy = true;
        try { const result = await action(); if (onResult) await onResult(result); await this.refresh(); this.showToast(this.parent.view, success); }
        catch (error) { this.showToast(this.parent.view, error.message || "WORKFLOW OPERATION FAILED"); }
        finally { this.state.busy = false; }
    }

    async selectNode(button) {
        const workflow = this.current();
        if (!workflow || workflow.id !== button.dataset.workflowId) return;
        const node = workflow.graph.nodes.find(item => item.id === button.dataset.studWorkflowNode);
        if (!node) return;
        this.state.selectedNodeId = node.id;
        const context = this.parent.state.workingContext;
        const object = context && context.activeObject;
        this.parent.state.workingContext = await this.parent.workingContext.update({
            courseId: workflow.assignmentId && this.state.assignment.courseId || undefined,
            assignmentId: workflow.assignmentId,
            objectType: object && object.entityType || undefined,
            objectId: object && object.id || undefined,
            workflowId: workflow.id,
            workflowNodeId: node.id,
            originSurface: "WORKFLOW",
            userPinned: context && context.userPinned === true
        });
        this.parent.render();
    }

    async handleClick(event) {
        const node = event.target.closest("[data-stud-workflow-node]");
        const action = event.target.closest("[data-stud-workflow-action]");
        const removeEdge = event.target.closest("[data-stud-workflow-edge-remove]");
        if (!node && !action && !removeEdge) return false;
        if (node) await this.selectNode(node);
        else if (action) await this.run(() => this.request("stud-workflow-node-transition", {workflowId: action.dataset.workflowId, nodeId: action.dataset.nodeId, action: action.dataset.studWorkflowAction, expectedWorkflowVersion: Number(action.dataset.workflowVersion), expectedNodeVersion: Number(action.dataset.nodeVersion)}), `WORKFLOW STAGE ${action.dataset.studWorkflowAction}`);
        else await this.run(() => this.request("stud-workflow-edge-remove", {workflowId: removeEdge.dataset.workflowId, edgeId: removeEdge.dataset.studWorkflowEdgeRemove, expectedWorkflowVersion: Number(removeEdge.dataset.workflowVersion)}), "WORKFLOW DEPENDENCY REMOVED");
        return true;
    }

    async handleSubmit(event) {
        const form = event.target.closest("form[data-stud-workflow-form]");
        if (!form) return false;
        event.preventDefault();
        const value = Object.fromEntries(new FormData(form).entries());
        const kind = form.dataset.studWorkflowForm;
        if (kind === "CREATE" || kind === "REPLACE") {
            const checked = form.querySelector("input[name=templateKey]:checked");
            const payload = {assignmentId: this.state.assignment.id, templateKey: value.templateKey, templateVersion: Number(checked && checked.dataset.templateVersion || 1)};
            if (value.contractId) payload.contractId = value.contractId;
            if (value.allowNoContract === "on") { payload.allowNoContract = true; payload.noContractReason = value.noContractReason; }
            if (kind === "REPLACE") Object.assign(payload, {replaceCurrent: true, replaceWorkflowId: value.replaceWorkflowId, expectedWorkflowVersion: Number(value.expectedWorkflowVersion), replacementReason: value.replacementReason});
            await this.run(() => this.request("stud-workflow-create", payload), kind === "REPLACE" ? "REPLACEMENT CREATED · PRIOR WORKFLOW PRESERVED" : "WORKFLOW CREATED · NO WORK EXECUTED", async created => {
                this.parent.state.workingContext = await this.parent.workingContext.update({courseId: this.state.assignment.courseId || undefined, assignmentId: this.state.assignment.id, workflowId: created.id, originSurface: "WORKFLOW", userPinned: true});
            });
        } else if (kind === "RENAME") {
            await this.run(() => this.request("stud-workflow-node-rename", {workflowId: value.workflowId, nodeId: value.nodeId, title: value.title, expectedWorkflowVersion: Number(value.expectedWorkflowVersion), expectedNodeVersion: Number(value.expectedNodeVersion)}), "WORKFLOW STAGE RENAMED");
        } else if (kind === "ADD_NODE") {
            const workflow = this.current();
            await this.run(() => this.request("stud-workflow-node-add", {workflowId: value.workflowId, expectedWorkflowVersion: Number(value.expectedWorkflowVersion), node: {title: value.title, semanticType: value.semanticType, order: workflow.graph.nodes.length}}), "WORKFLOW STAGE ADDED");
        } else if (kind === "ADD_EDGE") {
            await this.run(() => this.request("stud-workflow-edge-add", {workflowId: value.workflowId, fromNodeId: value.fromNodeId, toNodeId: value.toNodeId, expectedWorkflowVersion: Number(value.expectedWorkflowVersion)}), "WORKFLOW DEPENDENCY ADDED");
        }
        return true;
    }
}

module.exports = {StudWorkflowWorkspace};

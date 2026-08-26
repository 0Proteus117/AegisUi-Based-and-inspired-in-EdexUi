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
        if (node.availability === "DIRECT_BLOCKER") return "!";
        if (node.availability === "HUMAN_INPUT_REQUIRED") return "?";
        if (node.availability === "DEPENDENCY_WAIT") return "↳";
        if (node.state === "COMPLETE") return "✓";
        if (node.state === "SKIPPED") return "–";
        if (node.state === "IN_PROGRESS") return "▶";
        if (node.displayState === "READY") return "●";
        return "○";
    }

    nodeStatus(node) {
        if (node.availability === "DIRECT_BLOCKER") return `BLOCKED · ${node.directBlockers.length} ACTIVE`;
        if (node.availability === "HUMAN_INPUT_REQUIRED") return "YOUR REVIEW REQUIRED";
        if (node.availability === "DEPENDENCY_WAIT") {
            const first = node.impactSources[0];
            return first ? `DEPENDS ON · ${first.title}` : "DEPENDENCY WAIT";
        }
        return node.displayState.replace(/_/g, " ");
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

    requirementOptions(workflow) {
        const state = this.state.workflowState && this.state.workflowState.contractState;
        const contract = state && [state.current, ...(state.history || [])].filter(Boolean).find(item => item.id === workflow.contractId);
        return contract && contract.items || [];
    }

    blockerImpact(workflow, blocker) {
        return workflow.graph.nodes.filter(node => node.impactSources.some(source => source.kind === "BLOCKER" && source.id === blocker.id));
    }

    checkpointImpact(workflow, checkpoint) {
        return workflow.graph.nodes.filter(node => node.impactSources.some(source => source.kind === "CHECKPOINT" && source.id === checkpoint.id));
    }

    renderBlockers(workflow, node) {
        const blockers = (workflow.conditions && workflow.conditions.blockers || []).filter(item => item.nodeId === node.id);
        const requirementOptions = this.requirementOptions(workflow);
        const blockerTypes = ["WAITING_LAB","WAITING_TEAM_MEMBER","WAITING_DATA","WAITING_FEEDBACK","WAITING_SUPERVISOR","WAITING_APPROVAL","WAITING_RESOURCE","WAITING_EVENT","WAITING_INTERVIEW","WAITING_SURVEY","WAITING_FIELDWORK","WAITING_EQUIPMENT","WAITING_EXTERNAL_RESULT","CUSTOM"];
        const blockerTypeOptions = selected => blockerTypes.map(type => `<option value="${type}"${type === selected ? " selected" : ""}>${type.replace(/_/g, " ")}</option>`).join("");
        const create = workflow.lifecycle === "ACTIVE" ? `<details class="stud-workflow-condition-create"><summary>ADD BLOCKER</summary><form data-stud-workflow-form="CREATE_BLOCKER"><input type="hidden" name="workflowId" value="${this.escape(workflow.id)}"><input type="hidden" name="nodeId" value="${this.escape(node.id)}"><input type="hidden" name="expectedWorkflowVersion" value="${workflow.rowVersion}"><label>TYPE<select name="blockerType">${blockerTypeOptions("WAITING_LAB")}</select></label><label>TITLE<input name="title" required maxlength="240" placeholder="What prevents this stage from proceeding?"></label><label>REQUIRED INPUT<textarea name="requiredInput" maxlength="2000" placeholder="Dataset, feedback, approval, interview, equipment…"></textarea></label><div><label>OWNER<input name="owner" maxlength="240" placeholder="Unknown is valid"></label><label>EXPECTED DATE<input type="datetime-local" name="expectedResolutionAt"></label></div>${requirementOptions.length ? `<label>REQUIREMENT SOURCE<select name="requirementItemId"><option value="">NO REQUIREMENT LINK</option>${requirementOptions.map(item => `<option value="${this.escape(item.id)}">${this.escape(item.label)}</option>`).join("")}</select></label>` : ""}<label>NOTE<textarea name="description" maxlength="4000"></textarea></label><button type="submit">CREATE BLOCKER</button></form></details>` : "";
        const rows = blockers.map(blocker => {
            const impact = this.blockerImpact(workflow, blocker);
            const expected = blocker.expectedResolutionAt || "UNKNOWN";
            const source = blocker.requirementItemId ? `REQUIREMENT · CONTRACT REV ${blocker.sourceContractRevision}` : blocker.origin;
            const actions = blocker.status === "OPEN" ? `<div class="stud-workflow-condition-actions"><details><summary>RESOLVE</summary><form data-stud-workflow-form="RESOLVE_BLOCKER"><input type="hidden" name="workflowId" value="${this.escape(workflow.id)}"><input type="hidden" name="blockerId" value="${this.escape(blocker.id)}"><input type="hidden" name="expectedWorkflowVersion" value="${workflow.rowVersion}"><input type="hidden" name="expectedBlockerVersion" value="${blocker.rowVersion}"><label>RESOLUTION NOTE<textarea name="note" maxlength="2000"></textarea></label><button type="submit">CONFIRM RESOLVED</button></form></details><details><summary>EDIT</summary><form data-stud-workflow-form="UPDATE_BLOCKER"><input type="hidden" name="workflowId" value="${this.escape(workflow.id)}"><input type="hidden" name="blockerId" value="${this.escape(blocker.id)}"><input type="hidden" name="expectedWorkflowVersion" value="${workflow.rowVersion}"><input type="hidden" name="expectedBlockerVersion" value="${blocker.rowVersion}"><label>TYPE<select name="blockerType">${blockerTypeOptions(blocker.blockerType)}</select></label><label>TITLE<input name="title" required maxlength="240" value="${this.escape(blocker.title)}"></label><label>REQUIRED INPUT<textarea name="requiredInput" maxlength="2000">${this.escape(blocker.requiredInput || "")}</textarea></label><label>OWNER<input name="owner" maxlength="240" value="${this.escape(blocker.owner || "")}"></label><label>NOTE<textarea name="description" maxlength="4000">${this.escape(blocker.description || "")}</textarea></label><button type="submit">SAVE</button></form></details><button type="button" data-stud-workflow-blocker-cancel="${this.escape(blocker.id)}" data-workflow-id="${this.escape(workflow.id)}" data-workflow-version="${workflow.rowVersion}" data-blocker-version="${blocker.rowVersion}">CANCEL</button></div>` : "";
            return `<article class="stud-workflow-condition is-blocker is-${blocker.status.toLowerCase()}"><header><strong>${this.escape(blocker.title)}</strong><span>${this.escape(blocker.status)}</span></header><p>${this.escape(blocker.requiredInput || blocker.description || blocker.reason || "No additional input description supplied.")}</p><dl><div><dt>TYPE</dt><dd>${this.escape(blocker.blockerType.replace(/_/g, " "))}</dd></div><div><dt>OWNER</dt><dd>${this.escape(blocker.owner || "UNKNOWN")}</dd></div><div><dt>EXPECTED</dt><dd>${this.escape(expected)}</dd></div><div><dt>SOURCE</dt><dd>${this.escape(source)}</dd></div></dl>${impact.length ? `<p class="stud-workflow-impact"><strong>AFFECTS</strong> ${impact.map(item => this.escape(item.title)).join(" · ")}</p>` : `<p class="stud-workflow-impact">NO DOWNSTREAM STAGE IS CURRENTLY WAITING ON THIS BLOCKER.</p>`}${blocker.resolutionNote ? `<p><strong>RESOLUTION</strong> ${this.escape(blocker.resolutionNote)}</p>` : ""}${actions}</article>`;
        }).join("");
        return `<section class="stud-workflow-condition-group"><header><small>BLOCKERS</small><span>${blockers.filter(item => item.status === "OPEN").length} OPEN</span></header>${rows || `<p>Nothing is explicitly blocking this stage.</p>`}${create}</section>`;
    }

    renderCheckpoints(workflow, node) {
        const checkpoints = (workflow.conditions && workflow.conditions.checkpoints || []).filter(item => item.nodeId === node.id);
        const requirementOptions = this.requirementOptions(workflow);
        const create = workflow.lifecycle === "ACTIVE" ? `<details class="stud-workflow-condition-create"><summary>ADD HUMAN CHECKPOINT</summary><form data-stud-workflow-form="CREATE_CHECKPOINT"><input type="hidden" name="workflowId" value="${this.escape(workflow.id)}"><input type="hidden" name="nodeId" value="${this.escape(node.id)}"><input type="hidden" name="expectedWorkflowVersion" value="${workflow.rowVersion}"><label>TITLE<input name="title" required maxlength="240" placeholder="What must the student review?"></label><label>INSTRUCTIONS<textarea name="instructions" maxlength="4000"></textarea></label><label>DECISION REQUIRED<textarea name="requiredDecision" maxlength="2000"></textarea></label>${requirementOptions.length ? `<label>REQUIREMENT SOURCE<select name="requirementItemId"><option value="">NO REQUIREMENT LINK</option>${requirementOptions.map(item => `<option value="${this.escape(item.id)}">${this.escape(item.label)}</option>`).join("")}</select></label>` : ""}<button type="submit">CREATE CHECKPOINT</button></form></details>` : "";
        const rows = checkpoints.map(checkpoint => {
            const impact = this.checkpointImpact(workflow, checkpoint);
            const decision = checkpoint.status === "PENDING" ? `<details class="stud-workflow-checkpoint-decision"><summary>REVIEW &amp; DECIDE</summary><form data-stud-workflow-form="DECIDE_CHECKPOINT"><input type="hidden" name="workflowId" value="${this.escape(workflow.id)}"><input type="hidden" name="checkpointId" value="${this.escape(checkpoint.id)}"><input type="hidden" name="expectedWorkflowVersion" value="${workflow.rowVersion}"><input type="hidden" name="expectedCheckpointVersion" value="${checkpoint.rowVersion}"><label>NOTE<textarea name="note" maxlength="2000"></textarea></label><div><button name="decision" value="APPROVE">APPROVE</button><button name="decision" value="REJECT">REJECT</button><button name="decision" value="CANCEL">CANCEL</button></div></form></details>` : ["REJECTED", "CANCELLED"].includes(checkpoint.status) ? `<details class="stud-workflow-condition-create"><summary>CREATE FOLLOW-UP</summary><form data-stud-workflow-form="CREATE_CHECKPOINT"><input type="hidden" name="workflowId" value="${this.escape(workflow.id)}"><input type="hidden" name="nodeId" value="${this.escape(node.id)}"><input type="hidden" name="replacesCheckpointId" value="${this.escape(checkpoint.id)}"><input type="hidden" name="expectedWorkflowVersion" value="${workflow.rowVersion}"><label>TITLE<input name="title" required maxlength="240" value="${this.escape(checkpoint.title)}"></label><label>INSTRUCTIONS<textarea name="instructions" maxlength="4000">${this.escape(checkpoint.instructions || "")}</textarea></label><label>DECISION REQUIRED<textarea name="requiredDecision" maxlength="2000">${this.escape(checkpoint.requiredDecision || "")}</textarea></label><button type="submit">CREATE FOLLOW-UP</button></form></details>` : "";
            return `<article class="stud-workflow-condition is-checkpoint is-${checkpoint.status.toLowerCase()}"><header><strong>${this.escape(checkpoint.title)}</strong><span>${this.escape(checkpoint.status)}</span></header><p>${this.escape(checkpoint.instructions || checkpoint.requiredDecision || "Explicit student review is required.")}</p>${impact.length ? `<p class="stud-workflow-impact"><strong>BEFORE</strong> ${impact.map(item => this.escape(item.title)).join(" · ")}</p>` : ""}${checkpoint.decisionNote ? `<p><strong>DECISION NOTE</strong> ${this.escape(checkpoint.decisionNote)}</p>` : ""}${decision}</article>`;
        }).join("");
        return `<section class="stud-workflow-condition-group"><header><small>HUMAN CHECKPOINTS</small><span>${node.gateCheckpoints.length} ACTION REQUIRED</span></header>${rows || `<p>No explicit human gate is attached to this stage.</p>`}${create}</section>`;
    }

    renderNodeDetail(workflow, node) {
        if (!node) return `<aside class="stud-workflow-inspector"><p>SELECT A WORKFLOW STAGE.</p></aside>`;
        const predecessors = node.predecessorIds.map(id => workflow.graph.nodes.find(item => item.id === id)).filter(Boolean);
        const successors = node.successorIds.map(id => workflow.graph.nodes.find(item => item.id === id)).filter(Boolean);
        const history = workflow.history.filter(event => event.nodeId === node.id).slice(0, 12);
        return `<aside class="stud-workflow-inspector is-${node.availability.toLowerCase().replace(/_/g, "-")}">
            <header><small>${this.escape(node.semanticType.replace(/_/g, " "))} · WORK ${this.escape(node.state.replace(/_/g, " "))}</small><span>${this.escape(this.nodeStatus(node))}</span></header>
            <h4>${this.escape(node.title)}</h4><p>${this.escape(node.description || "No additional description was supplied by the selected template.")}</p>
            <div class="stud-workflow-actions">${node.availableActions.map(action => `<button type="button" data-stud-workflow-action="${action}" data-workflow-id="${this.escape(workflow.id)}" data-node-id="${this.escape(node.id)}" data-workflow-version="${workflow.rowVersion}" data-node-version="${node.rowVersion}">${action}</button>`).join("") || `<span>NO STATE ACTION AVAILABLE</span>`}</div>
            <dl><div><dt>DEPENDS ON</dt><dd>${predecessors.length ? predecessors.map(item => this.escape(item.title)).join(" · ") : "NONE"}</dd></div><div><dt>UNLOCKS</dt><dd>${successors.length ? successors.map(item => this.escape(item.title)).join(" · ") : "NONE"}</dd></div></dl>
            ${node.availability === "DEPENDENCY_WAIT" ? `<section class="stud-workflow-dependency-explanation"><strong>DEPENDENCY WAIT</strong><p>${node.impactSources.map(source => `${this.escape(source.title)} (${this.escape(source.kind)})`).join(" · ") || "A predecessor has not satisfied its dependency."}</p></section>` : ""}
            ${this.renderBlockers(workflow, node)}
            ${this.renderCheckpoints(workflow, node)}
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
            <header class="stud-workflow-heading"><div><small>WORKFLOW · ${this.escape(workflow.template.title)}</small><h3>${summary.workflowComplete ? "Workflow terminal state reached" : "Assignment work plan"}</h3><p>${summary.terminal} OF ${summary.total} TERMINAL${summary.skipped ? ` · ${summary.skipped} SKIPPED` : ""}${summary.inProgress ? ` · ${summary.inProgress} IN PROGRESS` : ""}${summary.openBlockers ? ` · ${summary.openBlockers} BLOCKER${summary.openBlockers === 1 ? "" : "S"}` : ""}${summary.pendingCheckpoints ? ` · ${summary.pendingCheckpoints} REVIEW GATE${summary.pendingCheckpoints === 1 ? "" : "S"}` : ""}</p></div><div><strong>${this.escape(integrity.contractRelation && integrity.contractRelation.replace(/_/g, " ") || "CONTRACT STATE UNKNOWN")}</strong><span>${workflow.contractRevision ? `CONTRACT REV ${workflow.contractRevision}` : "EXPLICIT NO-CONTRACT PATH"}</span></div></header>
            ${integrity.contractSnapshotMatches === false ? `<div class="stud-workflow-integrity" role="status"><strong>CONTRACT SNAPSHOT MISMATCH</strong><span>The workflow remains unchanged and requires technical review.</span></div>` : ""}
            ${integrity.sourceReviewCondition && integrity.sourceReviewCondition !== "CURRENT" ? `<div class="stud-workflow-attention" role="status"><strong>${this.escape(integrity.sourceReviewCondition.replace(/_/g, " "))}</strong><span>The approved Contract and this workflow remain immutable; review source drift separately.</span></div>` : ""}
            <div class="stud-workflow-workspace"><ol class="stud-workflow-rail">${workflow.graph.nodes.map((node, index) => `<li class="is-${node.displayState.toLowerCase().replace(/_/g, "-")} is-${node.availability.toLowerCase().replace(/_/g, "-")}${node.id === selected.id ? " is-selected" : ""}" style="--workflow-order:${index}"><button type="button" data-stud-workflow-node="${this.escape(node.id)}" data-workflow-id="${this.escape(workflow.id)}"><span class="stud-workflow-node-mark">${this.nodeMark(node)}</span><span><strong>${this.escape(node.title)}</strong><small>${this.escape(this.nodeStatus(node))}${node.predecessorIds.length > 1 ? ` · ${node.predecessorIds.length} PREDECESSORS` : ""}</small></span></button></li>`).join("")}</ol>${this.renderNodeDetail(workflow, selected)}</div>
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
        const cancelBlocker = event.target.closest("[data-stud-workflow-blocker-cancel]");
        if (!node && !action && !removeEdge && !cancelBlocker) return false;
        if (node) await this.selectNode(node);
        else if (action) await this.run(() => this.request("stud-workflow-node-transition", {workflowId: action.dataset.workflowId, nodeId: action.dataset.nodeId, action: action.dataset.studWorkflowAction, expectedWorkflowVersion: Number(action.dataset.workflowVersion), expectedNodeVersion: Number(action.dataset.nodeVersion)}), `WORKFLOW STAGE ${action.dataset.studWorkflowAction}`);
        else if (removeEdge) await this.run(() => this.request("stud-workflow-edge-remove", {workflowId: removeEdge.dataset.workflowId, edgeId: removeEdge.dataset.studWorkflowEdgeRemove, expectedWorkflowVersion: Number(removeEdge.dataset.workflowVersion)}), "WORKFLOW DEPENDENCY REMOVED");
        else await this.run(() => this.request("stud-workflow-blocker-cancel", {workflowId: cancelBlocker.dataset.workflowId, blockerId: cancelBlocker.dataset.studWorkflowBlockerCancel, expectedWorkflowVersion: Number(cancelBlocker.dataset.workflowVersion), expectedBlockerVersion: Number(cancelBlocker.dataset.blockerVersion), note: "Cancelled explicitly from the Assignment workflow."}), "BLOCKER CANCELLED · HISTORY PRESERVED");
        return true;
    }

    async handleSubmit(event) {
        const form = event.target.closest("form[data-stud-workflow-form]");
        if (!form) return false;
        event.preventDefault();
        const value = Object.fromEntries(new FormData(form).entries());
        if (event.submitter && event.submitter.name) value[event.submitter.name] = event.submitter.value;
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
        } else if (kind === "CREATE_BLOCKER") {
            const payload = {workflowId: value.workflowId, nodeId: value.nodeId, blockerType: value.blockerType, title: value.title, description: value.description, reason: value.reason, expectedResolutionAt: value.expectedResolutionAt, owner: value.owner, requiredInput: value.requiredInput, expectedWorkflowVersion: Number(value.expectedWorkflowVersion)};
            if (value.requirementItemId) payload.requirementItemId = value.requirementItemId;
            await this.run(() => this.request("stud-workflow-blocker-create", payload), "BLOCKER RECORDED · INDEPENDENT BRANCHES REMAIN AVAILABLE");
        } else if (kind === "UPDATE_BLOCKER") {
            await this.run(() => this.request("stud-workflow-blocker-update", {workflowId: value.workflowId, blockerId: value.blockerId, blockerType: value.blockerType, title: value.title, description: value.description, owner: value.owner, requiredInput: value.requiredInput, expectedWorkflowVersion: Number(value.expectedWorkflowVersion), expectedBlockerVersion: Number(value.expectedBlockerVersion)}), "BLOCKER UPDATED");
        } else if (kind === "RESOLVE_BLOCKER") {
            await this.run(() => this.request("stud-workflow-blocker-resolve", {workflowId: value.workflowId, blockerId: value.blockerId, note: value.note, expectedWorkflowVersion: Number(value.expectedWorkflowVersion), expectedBlockerVersion: Number(value.expectedBlockerVersion)}), "BLOCKER RESOLVED · AVAILABILITY RECOMPUTED");
        } else if (kind === "CREATE_CHECKPOINT") {
            const payload = {workflowId: value.workflowId, nodeId: value.nodeId, title: value.title, instructions: value.instructions, requiredDecision: value.requiredDecision, expectedWorkflowVersion: Number(value.expectedWorkflowVersion)};
            if (value.requirementItemId) payload.requirementItemId = value.requirementItemId;
            if (value.replacesCheckpointId) payload.replacesCheckpointId = value.replacesCheckpointId;
            await this.run(() => this.request("stud-workflow-checkpoint-create", payload), value.replacesCheckpointId ? "FOLLOW-UP CHECKPOINT CREATED · PRIOR DECISION PRESERVED" : "HUMAN CHECKPOINT CREATED");
        } else if (kind === "DECIDE_CHECKPOINT") {
            await this.run(() => this.request("stud-workflow-checkpoint-decide", {workflowId: value.workflowId, checkpointId: value.checkpointId, decision: value.decision, note: value.note, expectedWorkflowVersion: Number(value.expectedWorkflowVersion), expectedCheckpointVersion: Number(value.expectedCheckpointVersion)}), `CHECKPOINT ${value.decision} · WORK STATE UNCHANGED`);
        }
        return true;
    }
}

module.exports = {StudWorkflowWorkspace};

"use strict";

const RESEARCH_MATERIAL_TYPES = Object.freeze([
    "ACADEMIC_DOCUMENT", "RESEARCH_PAPER", "RESOURCE", "NOTE", "DATASET",
    "NOTEBOOK", "REPOSITORY_REFERENCE", "COMPUTE_RESULT", "REVISION_ITEM"
]);

function researchText(value) { return String(value || "").replace(/_/g, " "); }
function researchObjectTitle(item = {}) { return String(item.title || item.displayName || item.prompt || item.id || "Untitled academic object"); }

class StudResearchPlanWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent;
        this.state = {assignmentId: "", planState: null, selectedTopicId: "", dossier: [], coverage: null, loading: false, error: ""};
    }

    reset() { this.state = {assignmentId: "", planState: null, selectedTopicId: "", dossier: [], coverage: null, loading: false, error: ""}; }
    assignment() { return this.parent.assignment(); }
    plan() { return this.state.planState && (this.state.planState.draft || this.state.planState.current) || null; }
    selectedTopic() { const plan = this.plan(); return plan && plan.topics.find(item => item.id === this.state.selectedTopicId) || null; }
    isDraft() { const plan = this.plan(); return Boolean(plan && plan.lifecycle === "DRAFT"); }

    async open() {
        const assignment = this.assignment();
        if (!assignment) return;
        if (this.state.assignmentId !== assignment.id) this.reset();
        this.state.assignmentId = assignment.id;
        this.state.loading = true; this.state.error = "";
        try {
            this.state.planState = await this.request("stud-research-plan-state", {assignmentId: assignment.id});
            const plan = this.plan();
            const active = this.parent.state.workingContext && this.parent.state.workingContext.activeResearchTopic;
            if (plan && active && plan.topics.some(item => item.id === active.id)) this.state.selectedTopicId = active.id;
            if (plan && !plan.topics.some(item => item.id === this.state.selectedTopicId)) this.state.selectedTopicId = (plan.topics.find(item => item.disposition !== "REJECTED") || plan.topics[0] || {}).id || "";
            await this.loadTopic();
        } catch (error) { this.state.error = error.message || "Research Plan unavailable."; }
        this.state.loading = false;
    }

    async loadTopic() {
        const assignment = this.assignment(); const topic = this.selectedTopic();
        if (!assignment || !topic) { this.state.dossier = []; this.state.coverage = null; return; }
        const [dossier, coverage] = await Promise.all([
            this.request("stud-topic-dossier-list", {assignmentId: assignment.id, topicId: topic.id, limit: 100}),
            this.request("stud-research-coverage", {assignmentId: assignment.id, topicId: topic.id})
        ]);
        this.state.dossier = dossier.items || [];
        this.state.coverage = coverage;
    }

    async refresh() { await this.open(); this.parent.parent.render(); }

    async selectTopic(id) {
        const plan = this.plan(); const topic = plan && plan.topics.find(item => item.id === id);
        if (!plan || !topic) return;
        this.state.selectedTopicId = topic.id;
        const assignment = this.assignment(); const active = this.parent.activeObject(); const workflow = this.parent.workflow(); const node = this.parent.selectedNode();
        this.parent.parent.state.workingContext = await this.parent.parent.workingContext.update({
            courseId: assignment.courseId || undefined, assignmentId: assignment.id,
            objectType: active && active.entityType || undefined, objectId: active && active.id || undefined,
            workflowId: workflow && workflow.id || undefined, workflowNodeId: node && node.id || undefined,
            researchPlanId: plan.id, researchTopicId: topic.id,
            originSurface: "ASSIGNMENT_RESEARCH_PLAN", userPinned: this.parent.parent.state.workingContext && this.parent.parent.state.workingContext.userPinned === true
        });
        this.parent.state.workingContext = this.parent.parent.state.workingContext;
        await this.loadTopic(); this.parent.parent.applyWorkingContext(); this.parent.parent.render();
    }

    materialCandidates() {
        const seen = new Set(); const context = this.parent.objectsContext();
        const sources = [
            [context.documents, "ACADEMIC_DOCUMENT"], [context.papers, "RESEARCH_PAPER"], [context.resources, "RESOURCE"],
            [context.notes, "NOTE"], [context.datasets, "DATASET"], [context.notebooks, "NOTEBOOK"],
            [context.repositories, "REPOSITORY_REFERENCE"], [context.computeResults, "COMPUTE_RESULT"], [context.revisions, "REVISION_ITEM"]
        ];
        return sources.flatMap(([items, type]) => (items || []).flatMap(item => {
            const key = `${type}:${item.id}`; if (!item || !item.id || seen.has(key)) return [];
            seen.add(key); return [{type, id: item.id, item}];
        })).slice(0, 100);
    }

    materialFor(item) { return this.materialCandidates().find(value => value.type === item.canonicalObjectType && value.id === item.canonicalObjectId) || null; }
    contractRequirements() { const contract=this.parent.state.context&&this.parent.state.context.requirementsContract; const value=contract&&(contract.current||contract.draft); return value&&value.items||[]; }
    requirementChecks(selected = []) { const ids=new Set(selected); return this.contractRequirements().map(item=>`<label><input type="checkbox" name="requirementItemIds" value="${this.escape(item.id)}"${ids.has(item.id)?" checked":""}>${this.escape(item.label)}</label>`).join(""); }

    renderEmpty() {
        const contract = this.parent.state.context && this.parent.state.context.requirementsContract;
        const approved = contract && contract.current;
        return `<section class="stud-research-plan-empty"><small>ASSIGNMENT RESEARCH</small><h2>No Research Plan yet</h2><p>A reviewed plan starts from one exact approved Requirements Contract revision. Creating it does not search providers, call a model or acquire material.</p>${approved ? `<button type="button" data-stud-research-create>CREATE DRAFT FROM CONTRACT REV ${this.escape(approved.revision)}</button>` : `<div role="status"><strong>REVIEWED REQUIREMENTS REQUIRED</strong><span>Approve the Assignment Requirements Contract before planning research.</span></div>`}</section>`;
    }

    renderPlanHeader(plan) {
        const proposed = plan.topics.filter(item => item.disposition === "PROPOSED").length;
        const retained = plan.topics.filter(item => ["INCLUDED", "UNRESOLVED"].includes(item.disposition)).length;
        const history=this.state.planState&&this.state.planState.history||[];
        return `<header class="stud-research-plan-heading"><div><small>RESEARCH PLAN · REV ${this.escape(plan.revision)}</small><h2>${plan.lifecycle === "DRAFT" ? "Shape the research before acquisition" : "Reviewed research structure"}</h2><p>Contract rev ${this.escape(plan.requirementsContractRevision)} · ${this.escape(plan.contractCondition || "CURRENT")}${plan.planHash ? ` · ${this.escape(plan.planHash.slice(0, 12))}…` : ""}</p></div><div><span>${this.escape(plan.lifecycle)}</span>${history.length>1?`<details class="stud-research-plan-history"><summary>HISTORY · ${history.length}</summary><ol>${history.map(item=>`<li><strong>REV ${this.escape(item.revision)}</strong><span>${this.escape(item.lifecycle)} · CONTRACT ${this.escape(item.requirementsContractRevision)}</span></li>`).join("")}</ol></details>`:""}<button type="button" data-stud-research-refresh>REFRESH</button>${plan.lifecycle === "DRAFT" ? `<button type="button" data-stud-research-review${proposed || !retained ? " disabled" : ""}>MARK REVIEWED</button>` : `<button type="button" data-stud-research-revise>CREATE NEW REVISION</button>`}</div></header>${proposed ? `<p class="stud-research-plan-notice" role="status">${proposed} proposed topic${proposed === 1 ? " requires" : "s require"} an explicit decision before review.</p>` : !retained && plan.lifecycle === "DRAFT" ? `<p class="stud-research-plan-notice" role="status">Include or mark at least one Topic unresolved before reviewing this Plan.</p>` : ""}`;
    }

    renderTopicRow(topic) {
        const count = (this.plan().dossierCounts || []).find(item => item.topicId === topic.id) || {};
        const linked=(topic.requirements||[]).map(item=>item.requirementItemId);
        const why=`<details class="stud-research-topic-why"><summary>WHY</summary><p>${this.escape(topic.rationale||topic.description||"No additional rationale recorded.")}</p>${topic.requirements&&topic.requirements.length?`<ul>${topic.requirements.map(item=>`<li><strong>${this.escape(item.label)}</strong><span>${this.escape(researchText(item.relationshipBasis))}</span></li>`).join("")}</ul>`:`<p>No exact Requirement Item is linked. This is a user/research-planning Topic, not an institutional requirement.</p>`}</details>`;
        return `<article class="stud-research-topic-row${topic.id === this.state.selectedTopicId ? " is-current" : ""}${topic.disposition === "REJECTED" ? " is-rejected" : ""}"><button type="button" data-stud-research-topic="${this.escape(topic.id)}"><span>${this.escape(researchText(topic.disposition))}</span><strong>${this.escape(topic.title)}</strong><small>${this.escape(researchText(topic.basis))} · ${Number(count.accepted || 0)} accepted · ${Number(count.reviewed || 0)} reviewed</small></button><div>${why}${this.isDraft() ? `${topic.disposition === "PROPOSED" ? `<button type="button" data-stud-research-topic-decision="INCLUDED" data-topic-id="${this.escape(topic.id)}">INCLUDE</button><button type="button" data-stud-research-topic-decision="UNRESOLVED" data-topic-id="${this.escape(topic.id)}">UNRESOLVED</button><button type="button" data-stud-research-topic-decision="REJECTED" data-topic-id="${this.escape(topic.id)}">EXCLUDE</button>` : ""}<details><summary>EDIT</summary><form data-stud-research-topic-update="${this.escape(topic.id)}"><input type="hidden" name="topicVersion" value="${this.escape(topic.rowVersion)}"><label>TOPIC<input name="title" maxlength="240" value="${this.escape(topic.title)}" required></label><label>SCOPE<textarea name="description" maxlength="12000" rows="3">${this.escape(topic.description||"")}</textarea></label><label>ORDER<input name="order" type="number" min="0" max="100000" value="${this.escape(topic.topicOrder)}"></label><label>BASIS<select name="basis">${["USER_DEFINED","PROPOSED_BY_RESEARCH_PLANNING","REQUIRED_BY_ASSIGNMENT"].map(value=>`<option${topic.basis===value?" selected":""}>${value}</option>`).join("")}</select></label><label>REVIEW STATE<select name="disposition">${["PROPOSED","INCLUDED","UNRESOLVED","REJECTED"].map(value=>`<option${topic.disposition===value?" selected":""}>${value}</option>`).join("")}</select></label>${this.contractRequirements().length?`<fieldset><legend>EXACT REQUIREMENT LINKS</legend>${this.requirementChecks(linked)}</fieldset>`:""}<button type="submit">SAVE TOPIC</button></form></details>` : ""}</div></article>`;
    }

    renderTopics(plan) {
        const items = this.contractRequirements();
        return `<aside class="stud-research-topics"><header><div><small>TOPICS</small><strong>${plan.topics.length}</strong></div>${this.isDraft() ? `<details><summary>ADD</summary><form data-stud-research-topic-form><label>TOPIC<input name="title" maxlength="240" required></label><label>SCOPE<textarea name="description" maxlength="12000" rows="3"></textarea></label><label>BASIS<select name="basis"><option value="USER_DEFINED">USER DEFINED</option><option value="PROPOSED_BY_RESEARCH_PLANNING">RESEARCH PLANNING</option><option value="REQUIRED_BY_ASSIGNMENT">REQUIRED BY ASSIGNMENT</option></select></label>${items.length ? `<fieldset><legend>EXACT REQUIREMENT LINKS</legend>${this.requirementChecks()}</fieldset>` : ""}<button type="submit">ADD TOPIC</button></form></details>` : ""}</header><div>${plan.topics.length ? plan.topics.map(topic => this.renderTopicRow(topic)).join("") : `<p>No Topics have been defined. A blank plan is honest but cannot organise a Dossier.</p>`}</div></aside>`;
    }

    renderCoverage(topic) {
        const coverage = this.state.coverage;
        if (!topic || !coverage) return "";
        const c = coverage.counts || {};
        return `<section class="stud-research-coverage"><header><small>EXPLAINABLE COVERAGE</small><strong>${this.escape(researchText(coverage.state))}</strong></header><dl><div><dt>REQUIREMENTS</dt><dd>${Number(c.requirements || 0)}</dd></div><div><dt>ACCEPTED MATERIAL</dt><dd>${Number(c.acceptedMaterial || 0)}</dd></div><div><dt>REVIEWED MATERIAL</dt><dd>${Number(c.reviewedMaterial || 0)}</dd></div><div><dt>OPEN GAPS</dt><dd>${Number(c.openGaps || 0)}</dd></div></dl>${coverage.reasons.length ? `<ul>${coverage.reasons.map(reason => `<li>${this.escape(reason)}</li>`).join("")}</ul>` : `<p>No unresolved coverage condition is recorded.</p>`}<small>NO PERCENTAGE IS INFERRED.</small></section>`;
    }

    renderDossierItem(item) {
        const material = this.materialFor(item); const available=material&&(!item.availabilityState||item.availabilityState==="AVAILABLE"); const title = material ? researchObjectTitle(material.item) : "Unavailable local material";
        return `<article class="stud-dossier-item${item.disposition === "REJECTED" ? " is-rejected" : ""}"><button type="button" data-stud-dossier-open="${this.escape(item.id)}"${available ? "" : " disabled"}><span>${this.escape(researchText(item.canonicalObjectType || "ARTIFACT"))}</span><strong>${this.escape(title)}</strong><small>${this.escape(researchText(item.membershipOrigin))} · ${this.escape(researchText(item.disposition))} · ${this.escape(researchText(item.reviewState))}${available?"":` · ${this.escape(researchText(item.availabilityState||"UNAVAILABLE"))}`}</small></button><details><summary>ASSESSMENT</summary><form data-stud-dossier-update="${this.escape(item.id)}"><input type="hidden" name="version" value="${this.escape(item.rowVersion)}"><label>MEMBERSHIP<select name="disposition"><option${item.disposition === "SUGGESTED" ? " selected" : ""}>SUGGESTED</option><option${item.disposition === "ACCEPTED" ? " selected" : ""}>ACCEPTED</option><option${item.disposition === "REJECTED" ? " selected" : ""}>REJECTED</option></select></label><label>REVIEW<select name="reviewState"><option${item.reviewState === "UNREVIEWED" ? " selected" : ""}>UNREVIEWED</option><option${item.reviewState === "PARTIALLY_REVIEWED" ? " selected" : ""}>PARTIALLY_REVIEWED</option><option${item.reviewState === "REVIEWED" ? " selected" : ""}>REVIEWED</option><option${item.reviewState === "NOT_RELEVANT" ? " selected" : ""}>NOT_RELEVANT</option></select></label><label>SUITABILITY<select name="sourceSuitability">${["UNKNOWN","PEER_REVIEWED","INSTITUTIONAL","STANDARD_REGULATION","TEXTBOOK","COURSE_MATERIAL","MANUFACTURER_TECHNICAL","GOVERNMENT","NEWS","GENERAL_WEB"].map(value => `<option${item.sourceSuitability === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>POSITION<select name="stance">${["NOT_ASSESSED","AGREES","CONFLICTS","ALTERNATIVE","UNCERTAIN"].map(value => `<option${item.stance === value ? " selected" : ""}>${value}</option>`).join("")}</select></label><label>WHY IT BELONGS<textarea name="rationale" maxlength="4000" rows="2">${this.escape(item.rationale || "")}</textarea></label><button type="submit">SAVE ASSESSMENT</button></form></details></article>`;
    }

    renderDossier(topic) {
        if (!topic) return `<main class="stud-topic-dossier is-empty"><h3>Select a Topic</h3><p>The Dossier indexes canonical Assignment material without copying it.</p></main>`;
        const candidates = this.materialCandidates().filter(candidate => !this.state.dossier.some(item => item.canonicalObjectType === candidate.type && item.canonicalObjectId === candidate.id));
        return `<main class="stud-topic-dossier"><header><div><small>TOPIC DOSSIER</small><h3>${this.escape(topic.title)}</h3><p>${this.escape(topic.description || topic.rationale || "No scope note has been recorded.")}</p></div><details><summary>ADD RELATED MATERIAL</summary>${candidates.length ? `<div class="stud-dossier-candidates">${candidates.map(candidate => `<button type="button" data-stud-dossier-add-type="${this.escape(candidate.type)}" data-stud-dossier-add-id="${this.escape(candidate.id)}"><strong>${this.escape(researchObjectTitle(candidate.item))}</strong><small>${this.escape(researchText(candidate.type))}</small></button>`).join("")}</div>` : `<p>No additional canonically related material is available. Use existing STUD surfaces to link/import material explicitly.</p>`}</details></header><div class="stud-dossier-list">${this.state.dossier.length ? this.state.dossier.map(item => this.renderDossierItem(item)).join("") : `<section class="stud-topic-dossier-empty"><strong>NO MATERIAL IN THIS DOSSIER</strong><p>Availability, membership and review are separate. Nothing is accepted merely because it exists elsewhere in STUD.</p></section>`}</div></main>`;
    }

    renderQuestions(plan, topic) {
        if (!topic) return "";
        const questions = plan.questions.filter(item => item.topicId === topic.id);
        return `<section class="stud-research-questions"><header><small>RESEARCH QUESTIONS</small><strong>${questions.length}</strong></header>${questions.length ? `<ol>${questions.map(item => `<li><span>${this.escape(researchText(item.state))}</span><p>${this.escape(item.text)}</p>${this.isDraft()?`<details><summary>EDIT</summary><form data-stud-research-question-update="${this.escape(item.id)}"><input type="hidden" name="questionVersion" value="${this.escape(item.rowVersion)}"><label>QUESTION<textarea name="text" maxlength="2000" rows="2" required>${this.escape(item.text)}</textarea></label><label>PRIORITY<select name="priority">${["URGENT","HIGH","NORMAL","LOW"].map(value=>`<option${item.priority===value?" selected":""}>${value}</option>`).join("")}</select></label><label>STATE<select name="state">${["OPEN","ANSWERED","UNRESOLVED","DEFERRED"].map(value=>`<option${item.state===value?" selected":""}>${value}</option>`).join("")}</select></label>${this.contractRequirements().length?`<fieldset><legend>EXACT REQUIREMENT LINKS</legend>${this.requirementChecks((item.requirements||[]).map(link=>link.requirementItemId))}</fieldset>`:""}<button type="submit">SAVE QUESTION</button></form></details>`:""}</li>`).join("")}</ol>` : `<p>No question has been recorded. STUD does not invent one.</p>`}${this.isDraft() ? `<form data-stud-research-question-form><label>NEW QUESTION<textarea name="text" maxlength="2000" rows="2" required></textarea></label><button type="submit">ADD QUESTION</button></form>` : ""}</section>`;
    }

    renderGaps(plan, topic) {
        if (!topic) return "";
        const gaps = plan.gaps.filter(item => item.topicId === topic.id);
        return `<section class="stud-research-gaps"><header><small>RESEARCH GAPS</small><strong>${gaps.filter(item => item.state === "OPEN").length} OPEN</strong></header>${gaps.length ? `<ul>${gaps.map(item => `<li class="is-${item.state.toLowerCase()}"><span>${this.escape(researchText(item.gapType))}</span><strong>${this.escape(item.title)}</strong>${item.description ? `<p>${this.escape(item.description)}</p>` : ""}${item.state === "OPEN" ? `<button type="button" data-stud-gap-resolve="${this.escape(item.id)}" data-gap-version="${this.escape(item.rowVersion)}">MARK RESOLVED</button>` : `<small>${this.escape(researchText(item.state))}</small>`}</li>`).join("")}</ul>` : `<p>No explicit research gaps are recorded.</p>`}<details><summary>RECORD GAP</summary><form data-stud-research-gap-form><label>TYPE<select name="gapType">${["MISSING_SOURCE","UNANSWERED_QUESTION","INSUFFICIENT_PRIMARY_EVIDENCE","MISSING_DATASET","MISSING_STANDARD","CONTRADICTORY_EVIDENCE","INACCESSIBLE_SOURCE","OCR_REQUIRED","HUMAN_CLARIFICATION","TEAM_DEPENDENCY","LABORATORY_DEPENDENCY","CUSTOM"].map(value => `<option>${value}</option>`).join("")}</select></label><label>TITLE<input name="title" maxlength="240" required></label><label>DETAIL<textarea name="description" maxlength="12000" rows="2"></textarea></label><button type="submit">RECORD GAP</button></form></details></section>`;
    }

    render() {
        if (this.state.loading && !this.state.planState) return `<section class="stud-research-plan-empty"><strong>LOADING LOCAL RESEARCH STRUCTURE…</strong></section>`;
        if (this.state.error) return `<section class="stud-research-plan-empty is-error"><strong>RESEARCH PLAN UNAVAILABLE</strong><p>${this.escape(this.state.error)}</p><button type="button" data-stud-research-refresh>RETRY</button></section>`;
        const plan = this.plan(); if (!plan) return this.renderEmpty();
        const topic = this.selectedTopic();
        return `<section class="stud-research-plan-workspace">${this.renderPlanHeader(plan)}<div class="stud-research-plan-body">${this.renderTopics(plan)}${this.renderDossier(topic)}<aside class="stud-research-inspection">${this.renderCoverage(topic)}${this.renderQuestions(plan, topic)}${this.renderGaps(plan, topic)}</aside></div></section>`;
    }

    topicPayload(form) { const data = new FormData(form); return {title:data.get("title"),description:data.get("description") || null,basis:data.get("basis") || "USER_DEFINED",disposition:"INCLUDED",requirementItemIds:data.getAll("requirementItemIds")}; }

    async handleClick(event) {
        const create=event.target.closest("[data-stud-research-create]"), refresh=event.target.closest("[data-stud-research-refresh]"), select=event.target.closest("[data-stud-research-topic]"), decision=event.target.closest("[data-stud-research-topic-decision]"), review=event.target.closest("[data-stud-research-review]"), revise=event.target.closest("[data-stud-research-revise]"), add=event.target.closest("[data-stud-dossier-add-id]"), open=event.target.closest("[data-stud-dossier-open]"), resolve=event.target.closest("[data-stud-gap-resolve]");
        if(!create&&!refresh&&!select&&!decision&&!review&&!revise&&!add&&!open&&!resolve) return false;
        try {
            const plan=this.plan(); const assignment=this.assignment();
            if(create) await this.request("stud-research-plan-create-draft",{assignmentId:assignment.id,workflowId:this.parent.workflow() && this.parent.workflow().id || undefined,seedProposals:true});
            else if(refresh) {}
            else if(select) { await this.selectTopic(select.dataset.studResearchTopic); return true; }
            else if(decision) { const topic=plan.topics.find(item=>item.id===decision.dataset.topicId); await this.request("stud-research-plan-update-topic",{planId:plan.id,topicId:topic.id,expectedPlanVersion:plan.rowVersion,expectedTopicVersion:topic.rowVersion,topic:{disposition:decision.dataset.studResearchTopicDecision}}); }
            else if(review) await this.request("stud-research-plan-review",{planId:plan.id,expectedVersion:plan.rowVersion});
            else if(revise) await this.request("stud-research-plan-create-revision",{planId:plan.id,expectedVersion:plan.rowVersion});
            else if(add) await this.request("stud-topic-dossier-add",{planId:plan.id,topicId:this.selectedTopic().id,canonicalObjectType:add.dataset.studDossierAddType,canonicalObjectId:add.dataset.studDossierAddId,disposition:"ACCEPTED"});
            else if(open) { const item=this.state.dossier.find(value=>value.id===open.dataset.studDossierOpen), material=item&&this.materialFor(item); if(material) await this.parent.openObject(material.type,material.id,{originSurface:"TOPIC_DOSSIER"}); return true; }
            else if(resolve) await this.request("stud-research-gap-resolve",{assignmentId:assignment.id,gapId:resolve.dataset.studGapResolve,expectedVersion:Number(resolve.dataset.gapVersion),action:"RESOLVED"});
            await this.refresh();
        } catch(error){this.showToast(this.parent.parent.view,error.message||"RESEARCH PLAN ACTION UNAVAILABLE");}
        return true;
    }

    async handleSubmit(event) {
        const topicForm=event.target.closest("[data-stud-research-topic-form]"), topicUpdate=event.target.closest("[data-stud-research-topic-update]"), questionForm=event.target.closest("[data-stud-research-question-form]"), questionUpdate=event.target.closest("[data-stud-research-question-update]"), gapForm=event.target.closest("[data-stud-research-gap-form]"), dossierForm=event.target.closest("[data-stud-dossier-update]");
        if(!topicForm&&!topicUpdate&&!questionForm&&!questionUpdate&&!gapForm&&!dossierForm) return false;
        event.preventDefault();
        try {
            const plan=this.plan(), topic=this.selectedTopic();
            if(topicForm) await this.request("stud-research-plan-add-topic",{planId:plan.id,expectedVersion:plan.rowVersion,topic:this.topicPayload(topicForm)});
            else if(topicUpdate){const data=new FormData(topicUpdate);await this.request("stud-research-plan-update-topic",{planId:plan.id,topicId:topicUpdate.dataset.studResearchTopicUpdate,expectedPlanVersion:plan.rowVersion,expectedTopicVersion:Number(data.get("topicVersion")),topic:{title:data.get("title"),description:data.get("description")||null,order:Number(data.get("order")),basis:data.get("basis"),disposition:data.get("disposition"),requirementItemIds:data.getAll("requirementItemIds")}});}
            else if(questionForm){const data=new FormData(questionForm);await this.request("stud-research-plan-add-question",{planId:plan.id,topicId:topic.id,expectedVersion:plan.rowVersion,question:{text:data.get("text")}});}
            else if(questionUpdate){const data=new FormData(questionUpdate);await this.request("stud-research-plan-update-question",{planId:plan.id,questionId:questionUpdate.dataset.studResearchQuestionUpdate,expectedPlanVersion:plan.rowVersion,expectedQuestionVersion:Number(data.get("questionVersion")),question:{text:data.get("text"),priority:data.get("priority"),state:data.get("state"),requirementItemIds:data.getAll("requirementItemIds")}});}
            else if(gapForm){const data=new FormData(gapForm);await this.request("stud-research-gap-add",{planId:plan.id,topicId:topic.id,gapType:data.get("gapType"),title:data.get("title"),description:data.get("description")||null});}
            else {const data=new FormData(dossierForm);await this.request("stud-topic-dossier-update",{assignmentId:this.assignment().id,itemId:dossierForm.dataset.studDossierUpdate,expectedVersion:Number(data.get("version")),disposition:data.get("disposition"),reviewState:data.get("reviewState"),sourceSuitability:data.get("sourceSuitability"),stance:data.get("stance"),rationale:data.get("rationale")||null});}
            await this.refresh();
        } catch(error){this.showToast(this.parent.parent.view,error.message||"RESEARCH PLAN UPDATE UNAVAILABLE");}
        return true;
    }
}

if (typeof window !== "undefined") window.StudResearchPlanWorkspace = StudResearchPlanWorkspace;
if (typeof module !== "undefined") module.exports = {StudResearchPlanWorkspace, RESEARCH_MATERIAL_TYPES};

"use strict";

const Academic = require("./studAcademicModel.class.js");
const Workflow = require("./studWorkflowModel.class.js");
const {StudWorkflowTemplateRegistry} = require("./studWorkflowTemplateRegistry.class.js");
const {StudWorkflowRepository} = require("./studWorkflowRepository.class.js");
const {deterministicClassification} = require("./studWorkingContextService.class.js");

class StudWorkflowService {
    constructor(options = {}) {
        if (!options.store) throw new Error("StudAcademicStore is required.");
        this.store = options.store;
        this.repository = options.repository || new StudWorkflowRepository(this.store);
        this.registry = options.registry || new StudWorkflowTemplateRegistry();
        this.requirements = options.requirementsService || null;
        this.workingContext = options.workingContextService || null;
        this.registry.list().forEach(template => this.repository.seedTemplate(template));
    }

    assignmentContractState(assignmentId) {
        if (!this.requirements) return Object.freeze({current: null, draft: null, history: Object.freeze([])});
        return this.requirements.state(assignmentId);
    }

    suggestions(assignmentId) {
        const assignment = this.repository.requireAssignment(assignmentId);
        const classificationRow = this.repository.db.prepare("SELECT classification FROM stud_assignment_classifications WHERE assignment_id=?").get(assignment.id);
        const classification = classificationRow ? classificationRow.classification : deterministicClassification(assignment).classification;
        const contracts = this.assignmentContractState(assignment.id);
        const source = contracts.current || contracts.draft || null;
        const requirementTypes = source ? source.items.map(item => item.type) : [];
        return this.registry.suggestions(classification, requirementTypes);
    }

    templates(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId"], "Workflow template request");
        const templates = this.repository.listTemplates();
        const suggestions = input.assignmentId ? this.suggestions(input.assignmentId) : Object.freeze([]);
        return Object.freeze({templates, suggestions});
    }

    contractSnapshot(assignmentId, contractId = null) {
        const state = this.assignmentContractState(assignmentId);
        const candidates = [state.current, ...(state.history || [])].filter(Boolean);
        const selected = contractId ? candidates.find(contract => contract.id === contractId) : state.current;
        if (!selected) return null;
        const full = selected.items ? selected : this.requirements.repository.hydrate(selected.id);
        if (full.assignmentId !== assignmentId) throw new Academic.StudError("INVALID_WORKFLOW_CONTRACT", "Requirements Contract does not belong to this Assignment.");
        if (!["APPROVED", "SUPERSEDED"].includes(full.lifecycle) || !full.contractHash) throw new Academic.StudError("INVALID_WORKFLOW_CONTRACT", "Workflow creation requires an approved immutable Requirements Contract revision.");
        return Object.freeze({id: full.id, revision: full.revision, hash: full.contractHash, lifecycle: full.lifecycle, completeness: full.completeness, approvedAsIncomplete: Boolean(full.approvedAsIncomplete)});
    }

    create(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId", "templateKey", "templateVersion", "contractId", "allowNoContract", "noContractReason", "replaceCurrent", "replaceWorkflowId", "expectedWorkflowVersion", "replacementReason"], "Workflow creation request");
        const assignment = this.repository.requireAssignment(input.assignmentId);
        const templateDefinition = this.registry.get(input.templateKey, input.templateVersion === undefined ? null : input.templateVersion);
        if (!templateDefinition) throw new Academic.StudError("NOT_FOUND", "Selected workflow template version does not exist.");
        const template = this.repository.templateVersionByKey(templateDefinition.key, templateDefinition.version);
        const contract = this.contractSnapshot(assignment.id, input.contractId || null);
        let noContractReason = null;
        if (!contract) {
            if (input.allowNoContract !== true) throw new Academic.StudError("REVIEWED_CONTRACT_REQUIRED", "No approved Requirements Contract exists. Continue without one only through the explicit no-Contract path.");
            noContractReason = Academic.requiredText(input.noContractReason, "No-Contract reason", Workflow.LIMITS.reason);
        } else if (input.allowNoContract === true || input.noContractReason) {
            throw new Academic.StudError("INVALID_INPUT", "A no-Contract reason cannot be combined with an approved Contract revision.");
        }
        const replacing = input.replaceCurrent === true;
        let replacementReason = null;
        if (replacing) replacementReason = Academic.requiredText(input.replacementReason, "Workflow replacement reason", Workflow.LIMITS.reason);
        else if (input.replaceWorkflowId || input.expectedWorkflowVersion || input.replacementReason) throw new Academic.StudError("INVALID_INPUT", "Workflow replacement fields require an explicit replacement action.");
        return this.repository.createInstance({
            assignmentId: assignment.id,
            templateVersionId: template.id,
            contractId: contract && contract.id,
            contractRevision: contract && contract.revision,
            contractHash: contract && contract.hash,
            noContractReason,
            replaceCurrent: replacing,
            replaceWorkflowId: input.replaceWorkflowId,
            expectedWorkflowVersion: input.expectedWorkflowVersion,
            replacementReason
        });
    }

    workflowIntegrity(workflow) {
        if (workflow.contractId && this.requirements && typeof this.requirements.refreshFreshness === "function") this.requirements.refreshFreshness(workflow.contractId);
        const currentContract = workflow.assignmentId ? this.assignmentContractState(workflow.assignmentId).current : null;
        const freshness = workflow.contractId ? this.repository.db.prepare("SELECT review_condition,details_json,checked_at FROM stud_requirement_contract_freshness WHERE contract_id=?").get(workflow.contractId) : null;
        const relation = !workflow.contractId ? "EXPLICIT_NO_CONTRACT"
            : currentContract && currentContract.id === workflow.contractId ? "CURRENT_APPROVED_REVISION"
                : currentContract ? "HISTORICAL_APPROVED_REVISION" : "APPROVED_REVISION_WITHOUT_CURRENT_POINTER";
        const exactHash = !workflow.contractId || Boolean(workflow.contract && workflow.contract.contractHash === workflow.contractHash);
        return Object.freeze({
            contractRelation: relation,
            contractSnapshotMatches: exactHash,
            sourceReviewCondition: freshness ? freshness.review_condition : workflow.contractId ? "NEEDS_REVIEW" : null,
            sourceCheckedAt: freshness && freshness.checked_at || null
        });
    }

    read(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId", "historyLimit"], "Workflow read request");
        const workflow = this.repository.hydrate(input.workflowId, input.historyLimit);
        return Object.freeze({...workflow, integrity: this.workflowIntegrity(workflow)});
    }

    assignmentState(input = {}) {
        Academic.assertAllowedKeys(input, ["assignmentId", "historyLimit"], "Assignment workflow request");
        const assignment = this.repository.requireAssignment(input.assignmentId);
        const current = this.repository.currentForAssignment(assignment.id);
        return Object.freeze({
            assignmentId: assignment.id,
            current: current ? Object.freeze({...current, integrity: this.workflowIntegrity(current)}) : null,
            history: this.repository.listForAssignment(assignment.id, input.historyLimit || 25).filter(item => !current || item.id !== current.id),
            setup: this.templates({assignmentId: assignment.id}),
            contractState: this.assignmentContractState(assignment.id)
        });
    }

    transition(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId", "nodeId", "action", "reason", "expectedWorkflowVersion", "expectedNodeVersion"], "Workflow transition request");
        return this.repository.transitionNode(input);
    }

    renameNode(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId", "nodeId", "title", "expectedWorkflowVersion", "expectedNodeVersion"], "Workflow rename request");
        return this.repository.renameNode(input);
    }

    addNode(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId", "node", "expectedWorkflowVersion"], "Workflow node creation request");
        return this.repository.addNode(input);
    }

    addEdge(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId", "fromNodeId", "toNodeId", "expectedWorkflowVersion"], "Workflow dependency request");
        return this.repository.addEdge(input);
    }

    removeEdge(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId", "edgeId", "expectedWorkflowVersion"], "Workflow dependency removal request");
        return this.repository.removeEdge(input);
    }

    history(input = {}) {
        Academic.assertAllowedKeys(input, ["workflowId", "limit"], "Workflow history request");
        return this.repository.events(input.workflowId, input.limit);
    }
}

module.exports = Object.freeze({StudWorkflowService});

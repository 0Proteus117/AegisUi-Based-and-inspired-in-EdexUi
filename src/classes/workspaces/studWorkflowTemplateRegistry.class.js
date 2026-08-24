"use strict";

const WorkflowModel = require("./studWorkflowModel.class.js");

function chain(keys) {
    return keys.slice(1).map((key, index) => Object.freeze({from: keys[index], to: key}));
}

const DEFINITIONS = Object.freeze([
    {
        key: "STANDARD_WRITTEN_COURSEWORK", version: 1, title: "Standard written coursework",
        description: "A source-led written assignment from requirements review to a final reviewed package.",
        nodes: [
            ["requirements_review", "Requirements review", "REVIEW"],
            ["research_planning", "Research planning", "RESEARCH"],
            ["evidence_collection", "Evidence collection", "RESEARCH"],
            ["evidence_review", "Evidence review", "REVIEW"],
            ["composition_planning", "Composition planning", "WRITING"],
            ["drafting", "Drafting", "WRITING"],
            ["citation_integrity_review", "Citation / integrity review", "REVIEW"],
            ["human_review", "Human review", "HUMAN_TASK"],
            ["final_package", "Final package", "FINALISATION"]
        ]
    },
    {
        key: "TECHNICAL_ENGINEERING", version: 1, title: "Technical / engineering coursework",
        description: "A branched technical workflow in which research and analysis converge before reporting.",
        nodes: [
            ["requirements_review", "Requirements review", "REVIEW"],
            ["technical_planning", "Technical planning", "TECHNICAL"],
            ["background_research", "Background research", "RESEARCH"],
            ["technical_work", "Technical work / analysis", "TECHNICAL"],
            ["evidence_results", "Evidence & results", "TECHNICAL"],
            ["composition_planning", "Composition planning", "WRITING"],
            ["drafting", "Drafting", "WRITING"],
            ["technical_review", "Technical review", "REVIEW"],
            ["citation_integrity_review", "Citation / integrity review", "REVIEW"],
            ["human_review", "Human review", "HUMAN_TASK"],
            ["final_package", "Final package", "FINALISATION"]
        ],
        edges: [
            ["requirements_review", "technical_planning"],
            ["technical_planning", "background_research"],
            ["technical_planning", "technical_work"],
            ["background_research", "evidence_results"],
            ["technical_work", "evidence_results"],
            ["evidence_results", "composition_planning"],
            ["composition_planning", "drafting"],
            ["drafting", "technical_review"],
            ["technical_review", "citation_integrity_review"],
            ["citation_integrity_review", "human_review"],
            ["human_review", "final_package"]
        ]
    },
    {
        key: "EXAM_PREPARATION", version: 1, title: "Exam preparation",
        description: "A bounded preparation sequence from scope review through practice and final revision.",
        nodes: [
            ["requirements_scope", "Requirements / scope", "REVIEW"],
            ["topic_mapping", "Topic mapping", "RESEARCH"],
            ["study_material", "Study material", "RESEARCH"],
            ["practice", "Practice", "HUMAN_TASK"],
            ["mock_self_assessment", "Mock / self-assessment", "HUMAN_TASK"],
            ["gap_review", "Gap review", "REVIEW"],
            ["final_revision", "Final revision", "FINALISATION"]
        ]
    },
    {
        key: "GROUP_PROJECT", version: 1, title: "Group / project work",
        description: "A human-led project structure with parallel team coordination and individual work.",
        nodes: [
            ["requirements_review", "Requirements review", "REVIEW"],
            ["team_definition", "Team / responsibility definition", "HUMAN_TASK"],
            ["planning", "Planning", "HUMAN_TASK"],
            ["individual_work", "Individual work", "HUMAN_TASK"],
            ["team_coordination", "Team coordination", "EXTERNAL_TASK"],
            ["integration", "Integration", "HUMAN_TASK"],
            ["review", "Review", "REVIEW"],
            ["final_package", "Final package", "FINALISATION"]
        ],
        edges: [
            ["requirements_review", "team_definition"],
            ["team_definition", "planning"],
            ["planning", "individual_work"],
            ["planning", "team_coordination"],
            ["individual_work", "integration"],
            ["team_coordination", "integration"],
            ["integration", "review"],
            ["review", "final_package"]
        ]
    },
    {
        key: "GENERIC_MANUAL", version: 1, title: "Generic / manual",
        description: "A minimal institution-neutral workflow that can be adjusted before work begins.",
        nodes: [
            ["requirements_review", "Requirements review", "REVIEW"],
            ["planning", "Planning", "OTHER"],
            ["work", "Work", "OTHER"],
            ["review", "Review", "REVIEW"],
            ["final_package", "Final package", "FINALISATION"]
        ]
    }
].map(definition => {
    const nodes = definition.nodes.map((node, index) => ({key: node[0], title: node[1], semanticType: node[2], description: null, order: index}));
    const edgeTuples = definition.edges || chain(nodes.map(node => node.key)).map(edge => [edge.from, edge.to]);
    return WorkflowModel.normalizeTemplate({...definition, nodes, edges: edgeTuples.map(edge => ({from: edge[0], to: edge[1]}))});
}));

class StudWorkflowTemplateRegistry {
    constructor(definitions = DEFINITIONS) {
        this.definitions = Object.freeze(definitions.map(template => template && template.fingerprint ? template : WorkflowModel.normalizeTemplate(template)));
        this.byKey = new Map(this.definitions.map(template => [template.key, template]));
    }

    list() { return this.definitions; }

    get(key, version = null) {
        const template = this.byKey.get(String(key || "").trim().toUpperCase());
        if (!template || (version !== null && Number(version) !== template.version)) return null;
        return template;
    }

    suggestions(classification = "UNKNOWN", requirementTypes = []) {
        const normalized = String(classification || "UNKNOWN").toUpperCase();
        const types = new Set((Array.isArray(requirementTypes) ? requirementTypes : []).map(value => String(value).toUpperCase()));
        const ranked = [];
        const add = (key, reason, strength) => {
            if (!ranked.some(entry => entry.key === key)) ranked.push(Object.freeze({key, reason, strength}));
        };
        if (normalized === "EXAM") add("EXAM_PREPARATION", "Explicit assessment classification: EXAM.", "STRONG");
        if (normalized === "TEAM_PROJECT" || types.has("GROUP_WORK")) add("GROUP_PROJECT", normalized === "TEAM_PROJECT" ? "Explicit assessment classification: TEAM PROJECT." : "Reviewed Contract contains a GROUP WORK requirement.", "STRONG");
        if (["LAB_PRACTICAL"].includes(normalized) || types.has("EVIDENCE")) add("TECHNICAL_ENGINEERING", "Structured practical/evidence requirement supports a technical workflow candidate.", "DETERMINISTIC");
        if (["COURSEWORK", "INDIVIDUAL_COMPONENT", "PRESENTATION"].includes(normalized) || types.has("CITATION") || types.has("STRUCTURE")) add("STANDARD_WRITTEN_COURSEWORK", "Assessment classification or reviewed writing requirements support written coursework.", "DETERMINISTIC");
        add("GENERIC_MANUAL", normalized === "UNKNOWN" ? "No supported deterministic template signal; Generic remains the honest default candidate." : "Generic remains available for explicit selection.", normalized === "UNKNOWN" ? "DETERMINISTIC" : "FALLBACK");
        return Object.freeze(ranked);
    }
}

module.exports = Object.freeze({StudWorkflowTemplateRegistry, DEFINITIONS});

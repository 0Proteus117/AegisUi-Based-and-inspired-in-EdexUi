# STUD Assignment Workflow Engine authority

The authoritative product specification for the next STUD development
programme is:

- [AEGIS STUD Assignment Workflow Engine Specification](AEGIS_STUD_ASSIGNMENT_WORKFLOW_ENGINE_SPEC.pdf)

The PDF is preserved byte-for-byte from the product source supplied on
2026-08-21. Its SHA-256 is:

`bfe485757d1b58d1725760e36977f9f907f79f5fdc48c536f8d6fafb858ffa57`

The specification defines product intent and truth constraints. The following
documents translate that intent into the audited v2.7.0 implementation:

- [v2.7.0 gap analysis](STUD_ASSIGNMENT_WORKFLOW_ENGINE_GAP_ANALYSIS.md)
- [target architecture](STUD_ASSIGNMENT_WORKFLOW_ENGINE_ARCHITECTURE.md)
- [implementation roadmap](STUD_ASSIGNMENT_WORKFLOW_ENGINE_ROADMAP.md)
- [M1 Requirements Contract implementation and validation](STUD_M1_REQUIREMENTS_CONTRACT_VALIDATION.md)
- [M2 Academic Organisation / Working Context implementation and validation](STUD_M2_ACADEMIC_ORGANISATION_WORKING_CONTEXT_VALIDATION.md)
- [M3 Workflow Templates / Persistent DAG implementation and validation](STUD_M3_WORKFLOW_TEMPLATES_PERSISTENT_DAG_VALIDATION.md)
- [M4 Blockers / Human Checkpoints implementation and validation](STUD_M4_BLOCKERS_CHECKPOINTS_RECOVERY_VALIDATION.md)
- [M5 Assignment Workspace implementation and validation](STUD_M5_ASSIGNMENT_WORKSPACE_VALIDATION.md)
- [M6 Artifact Bay / Mission Control implementation and validation](STUD_M6_ARTIFACT_BAY_MISSION_CONTROL_VALIDATION.md)
- [M7 Research Plan / Topic Dossiers implementation and validation](STUD_M7_RESEARCH_PLAN_TOPIC_DOSSIERS_VALIDATION.md)
- [M8 Claims / Evidence Map / Citation Integrity implementation and validation](STUD_M8_CLAIMS_EVIDENCE_CITATION_INTEGRITY_VALIDATION.md)
- [M9 Faculty Literature Scout implementation and validation](STUD_M9_FACULTY_LITERATURE_SCOUT_VALIDATION.md)
- [M10 Composition Plan / Draft Versions implementation and validation](STUD_M10_COMPOSITION_PLAN_DRAFT_VERSIONS_VALIDATION.md)
- [M1-M3 integration and final technical audit](STUD_M1_M3_INTEGRATION_AUDIT.md)
- [Electron trust-boundary hardening](../../security/ELECTRON_TRUST_BOUNDARY_HARDENING_2026-08-24.md)

When documents disagree, use this order:

1. security, privacy and non-fabrication constraints in the Master Specification;
2. the Master Specification's product behaviour;
3. the target architecture for implementation contracts;
4. the roadmap for milestone boundaries;
5. historical phase documents as evidence of the implementation that existed at
   that time.

Historical documents do not override the Master Specification. Existing real
v2.7.0 data, provider, provenance and packaging contracts remain protected as
described in the architecture document.

M1 advances the canonical STUD schema from v14 to v15 and replaces the transient
requirements readout as product authority with a reviewed, revisioned
Requirements Contract. M2 advances schema v15 to v16 with explicit academic
organisation and one validated, persistent Working Context. M3 advances schema
v16 to v17 with immutable versioned templates and Assignment-owned persistent
DAG instances. M4 advances schema v17 to v18 with explicit blockers, human
checkpoints, meaningful journal events and derived dependency propagation. The
dedicated Electron Trust-Boundary Hardening intervention is also complete. M5
adds the Assignment Workspace as a renderer composition over those records. M6
advances schema v18 to v19 with an Assignment-scoped Artifact Registry, bounded
Operation Runs and a structured operational Event Journal. Artifact Bay indexes
canonical objects without copying their contents, while Mission Control renders
only persisted Runs, events and authoritative M3/M4 state. M7 advances schema
v19 to v20 with reviewed Assignment Research Plans, requirement-linked Topics
and Questions, reference-only Topic Dossiers, explicit Research Gaps and
explainable research-preparation coverage. M8 advances schema v20 to v21 with
immutable Claim revisions, exact canonical Evidence provenance, explicit
reviewed Claim/Evidence assessments, citation-support integrity and an
Assignment-scoped Evidence Map. Citation rendering remains separate from
intellectual support and M7 Dossier membership requires explicit promotion
before it becomes Evidence. M9 advances schema v21 to v22 with provenance-bound
faculty observations, explicit OpenAlex identity confirmation, bounded
works-by-author discovery and explainable Topic relevance. A Faculty Gem is an
explicit canonical Research Paper/M7 Dossier import; it is not M8 Evidence or a
source-quality judgement. M10 advances schema v22 to v23 with reviewed immutable
Composition Plan revisions, Section-level purpose and length allocation,
explicit Requirement/Claim/Evidence placement, explainable readiness and
immutable Draft Versions with bounded line diff. M10 references M8 Evidence and
Citation.js output without creating a second intellectual-evidence store, and
ordinary planning creates no provider, AI or Mission Control activity. The
exact next product milestone is M11 — Humanisation with Diff.

#!/usr/bin/env node
"use strict";

const assert=require("assert"),fs=require("fs"),path=require("path");const root=path.resolve(__dirname,".."),ui=fs.readFileSync(path.join(root,"src/ui.html"),"utf8"),assignment=fs.readFileSync(path.join(root,"src/classes/workspaces/studAssignmentWorkspace.class.js"),"utf8"),workspace=fs.readFileSync(path.join(root,"src/classes/workspaces/studEvidenceMapWorkspace.class.js"),"utf8"),css=fs.readFileSync(path.join(root,"src/assets/css/workspaces.css"),"utf8"),preload=fs.readFileSync(path.join(root,"src/preload.js"),"utf8");let passed=0;function check(name,value){assert.ok(value,name);passed+=1;console.log(`${name}: PASS`);}
check("M8_WORKSPACE_LOADS_BEFORE_ASSIGNMENT_WORKSPACE",ui.indexOf("studEvidenceMapWorkspace.class.js")>0&&ui.indexOf("studEvidenceMapWorkspace.class.js")<ui.indexOf("studAssignmentWorkspace.class.js"));
check("ASSIGNMENT_WORKSPACE_HAS_ONE_CONTEXTUAL_EVIDENCE_MAP_ENTRY",assignment.includes('data-stud-workspace-mode="EVIDENCE_MAP"')&&assignment.includes("this.evidenceMap.render()"));
check("PRIMARY_PATH_IS_CLAIM_EVIDENCE_ASSESS_PROVENANCE_CITATION",workspace.includes("ADD CLAIM")&&workspace.includes("USE AS EVIDENCE")&&workspace.includes("ASSESS RELATIONSHIP")&&workspace.includes("EXACT PROVENANCE")&&workspace.includes("CITATION INTEGRITY"));
check("NO_FAKE_STRENGTH_OR_COMPLETION_PERCENTAGE",workspace.includes("No support score or completion percentage is inferred")&&!/confidencePercent|supportPercentage|completionPercentage/.test(workspace));
check("DOSSIER_MEMBERSHIP_IS_NOT_UI_SUPPORT",workspace.includes("does not treat Dossier membership or citation presence as support"));
check("DOSSIER_TO_EVIDENCE_REQUIRES_EXPLICIT_ACTION",workspace.includes("data-stud-evidence-create-dossier")&&workspace.includes("Dossier membership is not Evidence")&&workspace.includes("dossierItemId:item.id"));
check("DRAFT_CLAIMS_ARE_EDITABLE_AND_HIERARCHY_IS_EXPLICIT",workspace.includes("data-stud-claim-update")&&workspace.includes("OPTIONAL PARENT CLAIM")&&workspace.includes("parentClaimId"));
check("NO_PROVIDER_AI_OR_MISSION_RUN_SIDE_EFFECT",!workspace.includes('request("stud-research-search"')&&!workspace.includes('request("stud-academic-ai-')&&!workspace.includes('request("stud-operation-')&&!workspace.includes('request("stud-moodle-'));
check("M5_PREVIEW_HANDOFF_REUSED",workspace.includes("this.parent.openObject(selected.sourceObjectType"));
check("PROGRESSIVE_DISCLOSURE_AND_RESPONSIVE_LAYOUT",css.includes(".stud-evidence-map-layout")&&css.includes("details:not([open])")&&css.includes("@media (max-width: 1220px)"));
check("PRELOAD_EXPOSES_ONLY_NAMED_M8_CHANNELS",preload.includes('"stud-evidence-map"')&&preload.includes('"stud-claim-create"')&&!preload.includes("invokeAny"));
console.log(`STUD M8 EVIDENCE MAP UI CONTRACT TESTS: ${passed} PASSED`);

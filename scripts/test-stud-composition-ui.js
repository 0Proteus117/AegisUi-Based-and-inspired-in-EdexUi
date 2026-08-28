#!/usr/bin/env node
"use strict";

const assert=require("assert"),fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,".."),ui=fs.readFileSync(path.join(root,"src/ui.html"),"utf8"),assignment=fs.readFileSync(path.join(root,"src/classes/workspaces/studAssignmentWorkspace.class.js"),"utf8"),workspace=fs.readFileSync(path.join(root,"src/classes/workspaces/studCompositionWorkspace.class.js"),"utf8"),css=fs.readFileSync(path.join(root,"src/assets/css/workspaces.css"),"utf8"),preload=fs.readFileSync(path.join(root,"src/preload.js"),"utf8");
let passed=0;function check(name,value){assert.ok(value,name);passed+=1;console.log(`${name}: PASS`);}
check("M10_WORKSPACE_LOADS_BEFORE_ASSIGNMENT_WORKSPACE",ui.indexOf("studCompositionWorkspace.class.js")>0&&ui.indexOf("studCompositionWorkspace.class.js")<ui.indexOf("studAssignmentWorkspace.class.js"));
check("ASSIGNMENT_WORKSPACE_HAS_ONE_CONTEXTUAL_COMPOSITION_ENTRY",assignment.includes('data-stud-workspace-mode="COMPOSITION"')&&assignment.includes("this.composition.render()"));
check("PRIMARY_PATH_IS_PLAN_SECTION_SUPPORT_WRITE_VERSION",workspace.includes("DOCUMENT STRUCTURE")&&workspace.includes("WHY / SUPPORT")&&workspace.includes("DRAFT TEXT")&&workspace.includes("VERSION HISTORY"));
check("PLAN_REVIEW_AND_DRAFT_CREATION_ARE_EXPLICIT",workspace.includes("REVIEW PLAN")&&workspace.includes("CREATE DRAFT")&&!workspace.includes("autoCreateDraft"));
check("HISTORICAL_VERSIONS_ARE_READ_ONLY_AND_INSPECTABLE",workspace.includes("READ-ONLY HISTORICAL VERSION")&&workspace.includes('request("stud-draft-version-read"')&&workspace.includes("RETURN TO CURRENT"));
check("REQUIREMENT_EXCLUSION_REQUIRES_REASON",workspace.includes("EXCLUDE WITH REASON")&&workspace.includes('name="reason"')&&workspace.includes('disposition:"EXCLUDED"'));
check("CITATION_INSERTION_REUSES_M8_INTEGRITY",workspace.includes("citationIntegrity")&&workspace.includes("rendered?.citation")&&workspace.includes("INSPECT SOURCE"));
check("NO_FAKE_COMPLETION_OR_QUALITY_PERCENTAGE",workspace.includes("noPercentage")===false&&!/completionPercentage|qualityScore|readinessPercent/.test(workspace));
check("NO_PROVIDER_AI_OR_MISSION_RUN_SIDE_EFFECT",!workspace.includes('request("stud-research-search"')&&!workspace.includes('request("stud-academic-ai-')&&!workspace.includes('request("stud-operation-')&&!workspace.includes('request("stud-moodle-'));
check("DRAFT_CONTENT_ESCAPED_BEFORE_RENDER",workspace.includes("${this.escape(content)}")&&workspace.includes("${this.escape(line.text)}"));
check("PROGRESSIVE_DISCLOSURE_AND_RESPONSIVE_LAYOUT",workspace.includes("<details")&&css.includes(".stud-composition-layout")&&css.includes("@media (max-width: 900px)"));
check("PRELOAD_EXPOSES_ONLY_NAMED_M10_CHANNELS",preload.includes('"stud-draft-version-read"')&&preload.includes('"stud-composition-state"')&&!preload.includes("invokeAny"));
console.log(`STUD M10 COMPOSITION UI CONTRACT: ${passed} PASSED`);

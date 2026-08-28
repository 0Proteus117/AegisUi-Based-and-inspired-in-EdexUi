#!/usr/bin/env node
"use strict";

const assert=require("assert"),fs=require("fs"),path=require("path"),root=path.resolve(__dirname,".."),ui=fs.readFileSync(path.join(root,"src/ui.html"),"utf8"),assignment=fs.readFileSync(path.join(root,"src/classes/workspaces/studAssignmentWorkspace.class.js"),"utf8"),workspace=fs.readFileSync(path.join(root,"src/classes/workspaces/studFacultyScoutWorkspace.class.js"),"utf8"),css=fs.readFileSync(path.join(root,"src/assets/css/workspaces.css"),"utf8"),preload=fs.readFileSync(path.join(root,"src/preload.js"),"utf8");let passed=0;function check(name,value){assert.ok(value,name);passed+=1;console.log(`${name}: PASS`);}
check("M9_WORKSPACE_LOADS_BEFORE_ASSIGNMENT",ui.indexOf("studFacultyScoutWorkspace.class.js")>0&&ui.indexOf("studFacultyScoutWorkspace.class.js")<ui.indexOf("studAssignmentWorkspace.class.js"));
check("ASSIGNMENT_HAS_ONE_CONTEXTUAL_SCOUT_ENTRY",assignment.includes('data-stud-workspace-mode="FACULTY_SCOUT"')&&assignment.includes("this.facultyScout.render()"));
check("PRIMARY_PATH_OBSERVE_RESOLVE_CONFIRM_DISCOVER_IMPORT",workspace.includes("ADD FACULTY OBSERVATION")&&workspace.includes("FIND PUBLIC SCHOLARLY RECORDS")&&workspace.includes("CONFIRM MATCH")&&workspace.includes("DISCOVER PUBLICATIONS")&&workspace.includes("ADD TO TOPIC DOSSIER"));
check("IDENTITY_AND_RELEVANCE_GATES_EXPLAINED",workspace.includes("Identity confirmed by user")||workspace.includes("IDENTITY CONFIRMED BY USER"));
check("NO_FAKE_SCORE_QUALITY_OR_AUTHORITY_BADGE",!/(confidencePercent|qualityScore|facultyAuthority|relevancePercentage)/.test(workspace)&&workspace.includes("not an authority badge"));
check("DOSSIER_NOT_EVIDENCE_BOUNDARY_VISIBLE",workspace.includes("Dossier membership is not Evidence")&&workspace.includes("separate explicit review"));
check("NO_AI_MOODLE_OR_MISSION_SIDE_EFFECT",!workspace.includes('request("stud-academic-ai-')&&!workspace.includes('request("stud-moodle-')&&!workspace.includes('request("stud-operation-'));
check("PROGRESSIVE_DISCLOSURE_AND_RESPONSIVE",workspace.includes("<details>")&&css.includes(".stud-faculty-layout")&&css.includes("details:not([open])")&&css.includes("@media (max-width: 1220px)"));
check("PRELOAD_EXPOSES_ONLY_FIXED_M9_CHANNELS",preload.includes('"stud-faculty-scout-state"')&&preload.includes('"stud-faculty-publication-import"')&&!preload.includes("invokeAny"));
console.log(`STUD M9 FACULTY UI CONTRACT: ${passed} PASSED`);

#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
const ui = fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8");

const failures = [];
function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key} · ${detail}`);
}

[
    "ensureOSINTCasesLoaded()",
    "renderOSINTCaseWorkspace(grid)",
    "openOSINTNewCaseDialog(trigger = null, afterCreate = null)",
    "openOSINTEvidencePromotion(providerId, trigger = null)",
    "openOSINTEvidencePreview(caseId, providerId, trigger = null)",
    "openOSINTEvidenceDetail(caseId, evidenceId, trigger = null)",
    "verifyOSINTEvidence(caseId, evidenceId)",
    "exportOSINTCase(caseId, format)",
    "exportOSINTEvidence(caseId, evidenceId, format)",
    "closeOSINTCaseDialog()"
].forEach(signature => check(`CASE_UI_${signature.slice(0, 30)}`, manager.includes(signature)));

check("CASE_UI_MODEL_LOAD_ORDER", ui.includes("osintCaseModel.class.js") && ui.includes("osintProviderAdapters.class.js"));
check("CASE_UI_NO_AUTOSAVE", !/localStorage.*osint|sessionStorage.*osint|indexedDB/i.test(manager));
check("CASE_UI_EXPLICIT_PROMOTION", manager.includes("SAVE TO CASE") && manager.includes("data-osint-save-result"));
check("CASE_UI_REFERENCE_ONLY_BLOCKED", manager.includes("REFERENCE ONLY · EVIDENCE BLOCKED"));
check("CASE_UI_ESCAPE_CLOSE", manager.includes('event.key === "Escape"') && manager.includes("boundOSINTCaseDialogKeys"));
check("CASE_UI_INTERNAL_CLICK_SAFE", manager.includes("if (event.target === overlay) close()"));
check("CASE_UI_FOCUS_RETURN", manager.includes("this.osintCaseDialogTrigger") && manager.includes("trigger.focus({preventScroll: true})"));
check("CASE_UI_CASE_NOTE", manager.includes("ADD CASE NOTE") && manager.includes("osint-case-note-create"));
check("CASE_UI_EVIDENCE_NOTE", manager.includes("ADD EVIDENCE NOTE") && manager.includes("data-osint-evidence-note-form"));
check("CASE_UI_EVIDENCE_EXPORT", manager.includes("osint-evidence-export") && manager.includes("EXPORT MARKDOWN"));
check("CASE_UI_STYLED_INPUTS", css.includes(".osint-case-dialog .aegis-input") && css.includes(".osint-case-workspace-header"));
check("CASE_UI_NO_LEGACY_RUNTIME_RECONNECT", !manager.includes("OsintAccessController") && !manager.includes('ipc.invoke("osint-native-query"'));
check("CASE_UI_NO_RAW_RESPONSE_RENDER", !/rawResponse|raw response|responseHeaders|authorization/i.test(manager));

console.log(`OSINT_CASE_UI: ${failures.length ? "FAIL" : "OK"}`);
if (failures.length) {
    failures.forEach(item => console.error(`- ${item}`));
    process.exitCode = 1;
}

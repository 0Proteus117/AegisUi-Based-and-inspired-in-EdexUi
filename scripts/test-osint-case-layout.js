#!/usr/bin/env node

"use strict";

/*
 * Layout contract checks intentionally target structural invariants, not a
 * screenshot coordinate. Visual packaging validation measures live bounds.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const manager = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8");
const failures = [];

function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key} · ${detail}`);
}

const caseRendererStart = manager.indexOf("renderOSINTCaseWorkspace(grid)");
const caseRenderer = manager.slice(caseRendererStart, manager.indexOf("\n    handleOSINTCaseAction(", caseRendererStart));
const evidenceRendererStart = manager.indexOf("async openOSINTEvidenceDetail(");
const evidenceRenderer = manager.slice(evidenceRendererStart, manager.indexOf("\n    async verifyOSINTEvidence(", evidenceRendererStart));

check("CASE_LAYOUT_ACTIVE_CONTENT_FLOW", caseRenderer.includes('class="osint-case-active-content"') && !caseRenderer.includes('workspace-panel-content osint-case-metadata'));
check("CASE_LAYOUT_PANEL_CONTENT_FLOW", (caseRenderer.match(/class="osint-case-panel-content"/g) || []).length >= 4);
check("CASE_LAYOUT_DISTINCT_GRID_AREAS", css.includes('"active active"') && css.includes('"evidence timeline"') && css.includes('"notes notes"'));
check("CASE_LAYOUT_NO_FIXED_MAIN_HEIGHT", !/\.engineering-mode \.osint-case-main\s*\{[^}]*height:\s*100%/s.test(css));
check("CASE_LAYOUT_ACTIVE_HEADER_CONTENT_SIZED", /\.engineering-mode \.osint-case-active > header\s*\{[^}]*height:\s*auto/s.test(css));
check("CASE_LAYOUT_LONG_TITLE_WRAPS", css.includes(".engineering-mode .osint-case-active h2") && css.includes("white-space: normal") && css.includes("overflow-wrap: anywhere"));
check("CASE_LAYOUT_METADATA_SAFE", css.includes(".engineering-mode .osint-case-metadata") && css.includes("min-width: 0") && css.includes(".engineering-mode .osint-case-metadata strong"));
check("CASE_LAYOUT_ACTIONS_FLOW", css.includes(".engineering-mode .osint-case-active footer") && css.includes("flex-wrap: wrap"));
check("CASE_LAYOUT_NOTES_CONTENT_FLOW", caseRenderer.includes('class="osint-case-note-content"') && css.includes(".engineering-mode .osint-case-note-content { display: grid;"));

check("EVIDENCE_LAYOUT_CONTEXT_LABEL", manager.includes("OSINT / CASE / WORKSPACE"));
check("EVIDENCE_LAYOUT_SEMANTIC_HEADER", evidenceRenderer.includes('class="osint-evidence-detail-header"') && evidenceRenderer.includes("EVIDENCE OBJECT / LOCAL RECORD"));
check("EVIDENCE_LAYOUT_SECTIONED_CONTENT", (evidenceRenderer.match(/class="osint-evidence-detail-section"/g) || []).length >= 5);
check("EVIDENCE_LAYOUT_NOTE_AND_ACTION_REGIONS", evidenceRenderer.includes('class="osint-evidence-note-form"') && evidenceRenderer.includes('class="osint-evidence-detail-actions"'));
check("EVIDENCE_LAYOUT_DIALOG_TWO_ROWS", /\.engineering-mode \.osint-detail-panel\.osint-case-dialog\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s.test(css));
check("EVIDENCE_LAYOUT_DIALOG_CONTENT_HEIGHT", /\.engineering-mode \.osint-detail-panel\.osint-case-dialog\s*\{[^}]*max-height:/s.test(css));
check("EVIDENCE_LAYOUT_HEADER_SAFE_COLUMNS", /\.engineering-mode \.osint-case-dialog > header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s.test(css));
check("EVIDENCE_LAYOUT_METADATA_WRAPS", css.includes(".engineering-mode .osint-evidence-detail-section p") && css.includes("word-break: break-word"));
check("EVIDENCE_LAYOUT_ACTIONS_WRAP", css.includes(".engineering-mode .osint-evidence-detail-actions") && css.includes("flex-wrap: wrap"));
check("EVIDENCE_LAYOUT_COMPACT_SINGLE_COLUMN", css.includes('grid-template-areas:\n            "active"\n            "evidence"\n            "timeline"\n            "notes"'));

console.log(`OSINT_CASE_LAYOUT: ${failures.length ? "FAIL" : "OK"}`);
if (failures.length) {
    failures.forEach(item => console.error(`- ${item}`));
    process.exitCode = 1;
}

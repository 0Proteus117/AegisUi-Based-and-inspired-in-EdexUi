#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const Model = require(path.join(ROOT, "src/classes/workspaces/osintCaseModel.class.js"));
const {CaseService} = require(path.join(ROOT, "src/classes/workspaces/osintCaseServices.class.js"));

const failures = [];
function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key} · ${detail}`);
}

function normalizedResult(overrides = {}) {
    return {
        providerId: "wayback",
        capability: "HISTORICAL_ARCHIVE",
        status: "SUCCESS",
        queriedAt: "2026-08-08T12:00:00.000Z",
        completedAt: "2026-08-08T12:00:01.000Z",
        summary: "A public snapshot is available from the archive.",
        data: {
            available: true,
            originalInput: "https://example.org/",
            canonicalUrl: "https://example.org/",
            snapshotUrl: "https://web.archive.org/web/20240102030405/https://example.org/",
            snapshotTimestamp: "20240102030405",
            provider: "Wayback Machine",
            queriedAt: "2026-08-08T12:00:00.000Z",
            completedAt: "2026-08-08T12:00:01.000Z",
            confidence: "PROVIDER_REPORTED",
            warnings: []
        },
        warnings: [],
        source: {provider: "Wayback Machine", type: "REST_API"},
        confidence: "PROVIDER_REPORTED",
        ...overrides
    };
}

async function expectCode(operation, code) {
    try { await operation(); return false; }
    catch (error) { return error && error.code === code; }
}

async function main() {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-osint-cases-"));
    const root = path.join(parent, "userData", "osint");
    const service = new CaseService({root, applicationVersion: "2.4.0-test"});
    try {
        const empty = await service.list();
        check("CASE_NO_AUTOMATIC_STORAGE", empty.ok && empty.cases.length === 0 && !fs.existsSync(root));

        const created = await service.create({title: "Archive review", description: "A concise local investigation.", priority: "HIGH", tags: "archive, example"});
        check("CASE_CREATE", created.ok && created.case.id.startsWith("case-") && created.case.status === "OPEN");
        check("CASE_STORAGE_ROOT", fs.existsSync(path.join(root, "cases", created.case.id, "case.json")));
        const duplicate = await service.create({title: "Archive review", priority: "LOW", tags: []});
        check("CASE_DUPLICATE_ALLOWED_WARNED", duplicate.ok && duplicate.warning === "DUPLICATE_TITLE");
        const listed = await service.list();
        check("CASE_INDEX", listed.cases.length === 2 && listed.cases.some(item => item.id === created.case.id));

        const promoted = await service.promote(created.case.id, {
            normalizedResult: normalizedResult(),
            draft: {
                title: "Wayback availability",
                summary: "One archive snapshot was reported by the permitted provider.",
                tags: ["historical", "wayback"],
                redactions: ["data.originalInput", "data.canonicalUrl", "data.snapshotUrl"]
            }
        });
        check("EVIDENCE_PROMOTION", promoted.ok && promoted.evidence.type === "PROVIDER_RESULT");
        check("EVIDENCE_SHA256", promoted.evidence.integrity.algorithm === "SHA-256" && /^[a-f0-9]{64}$/.test(promoted.evidence.integrity.value));
        check("EVIDENCE_REDACTION_BEFORE_HASH", !Object.prototype.hasOwnProperty.call(promoted.evidence.data, "originalInput") && !Object.prototype.hasOwnProperty.call(promoted.evidence.data, "canonicalUrl") && !Object.prototype.hasOwnProperty.call(promoted.evidence.data, "snapshotUrl"));
        check("EVIDENCE_NO_RAW_RESPONSE", !Object.prototype.hasOwnProperty.call(promoted.evidence, "raw") && !Object.prototype.hasOwnProperty.call(promoted.evidence, "headers"));

        const evidenceId = promoted.evidence.id;
        const loaded = await service.read(created.case.id);
        check("CASE_READ", loaded.ok && loaded.evidence.length === 1 && loaded.timeline.some(event => event.type === "EVIDENCE_ADDED"));
        const verified = await service.verifyEvidence(created.case.id, evidenceId);
        check("EVIDENCE_VERIFY_VALID", verified.ok && verified.evidence.integrity.status === "VALID");

        const evidencePath = path.join(root, "cases", created.case.id, "evidence", `${evidenceId}.json`);
        const tampered = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
        tampered.summary = "Tampered metadata.";
        fs.writeFileSync(evidencePath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
        const invalid = await service.verifyEvidence(created.case.id, evidenceId);
        check("EVIDENCE_VERIFY_INVALID", invalid.ok && invalid.evidence.integrity.status === "INVALID");
        const afterInvalid = await service.read(created.case.id);
        check("INTEGRITY_WARNING_TIMELINE", afterInvalid.timeline.some(event => event.type === "INTEGRITY_WARNING"));

        const note = await service.addNote(created.case.id, {text: "Reviewed locally; no external claim made.", tags: ["review"]});
        check("CASE_NOTE", note.ok && note.note.id.startsWith("note-"));
        const evidenceNote = await service.addNote(created.case.id, {evidenceId, text: "Integrity warning observed after test tamper.", tags: []});
        check("EVIDENCE_NOTE", evidenceNote.ok && evidenceNote.note.evidenceId === evidenceId);
        const updatedNote = await service.updateNote(created.case.id, note.note.id, {text: "Updated local note.", tags: ["updated"]});
        check("NOTE_UPDATE", updatedNote.ok && updatedNote.note.text === "Updated local note." && updatedNote.note.tags[0] === "updated");
        const manual = await service.createEvidence(created.case.id, {manual: {type: "MANUAL_OBSERVATION", title: "Local observation", summary: "Analyst-entered neutral observation.", tags: ["manual"]}});
        check("MANUAL_EVIDENCE", manual.ok && manual.evidence.type === "MANUAL_OBSERVATION");
        check("WEB_REFERENCE_REQUIRES_URL", await expectCode(() => service.createEvidence(created.case.id, {manual: {type: "WEB_REFERENCE", title: "No URL", summary: "Invalid", tags: []}}), "EVIDENCE_INVALID"));

        const caseExport = path.join(parent, "case-export.json");
        const evidenceExport = path.join(parent, "evidence-export.md");
        const exportedCase = await service.exportCase(created.case.id, "json", caseExport);
        const exportedEvidence = await service.exportEvidence(created.case.id, evidenceId, "markdown", evidenceExport);
        check("CASE_EXPORT", exportedCase.ok && fs.existsSync(caseExport) && JSON.parse(fs.readFileSync(caseExport, "utf8")).disclaimer.includes("Integrity is technical only"));
        check("EVIDENCE_EXPORT", exportedEvidence.ok && fs.existsSync(evidenceExport) && fs.readFileSync(evidenceExport, "utf8").includes("Evidence —"));

        check("REFERENCE_ONLY_BLOCKED", await expectCode(() => service.promote(created.case.id, {normalizedResult: normalizedResult({providerId: "cobalt-strike-reference", capability: "THREAT_REPUTATION"}), draft: {title: "Blocked", summary: "Blocked", tags: []}}), "POLICY_BLOCKED"));
        check("INVALID_RESULT_BLOCKED", await expectCode(() => service.promote(created.case.id, {normalizedResult: normalizedResult({status: "ERROR"}), draft: {title: "Invalid", summary: "Invalid", tags: []}}), "POLICY_BLOCKED"));
        check("ARCHIVE_REQUIRES_EXPLICIT_STATUS", (await service.archive(created.case.id)).case.status === "ARCHIVED");
        check("ARCHIVED_CASE_BLOCKS_NOTE", await expectCode(() => service.addNote(created.case.id, {text: "No", tags: []}), "CASE_ARCHIVED"));
        check("ARCHIVED_CASE_BLOCKS_EVIDENCE", await expectCode(() => service.promote(created.case.id, {normalizedResult: normalizedResult(), draft: {title: "No", summary: "No", tags: []}}), "CASE_ARCHIVED"));

        const second = await service.create({title: "Removal controls", priority: "LOW", tags: []});
        const secondEvidence = await service.promote(second.case.id, {normalizedResult: normalizedResult({queriedAt: "2026-08-08T13:00:00.000Z"}), draft: {title: "Safe result", summary: "Safe result", tags: []}});
        check("EVIDENCE_REMOVE_CONFIRMATION", await expectCode(() => service.removeEvidence(second.case.id, secondEvidence.evidence.id, false), "POLICY_BLOCKED"));
        check("EVIDENCE_REMOVE", (await service.removeEvidence(second.case.id, secondEvidence.evidence.id, true)).ok);

        const rawSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintCaseModel.class.js"), "utf8");
        check("SCHEMA_MODEL_PRESENT", rawSource.includes("CASE_SCHEMA_VERSION") && rawSource.includes("REDACTABLE_FIELDS"));
        check("NO_FILESYSTEM_PATH_FROM_RENDERER", !fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8").includes("userData/osint"));
    } finally {
        fs.rmSync(parent, {recursive: true, force: true});
    }
}

main().catch(error => {
    failures.push(`UNHANDLED · ${error.stack || error.message}`);
    console.error(error.stack || error.message);
}).finally(() => {
    console.log(`OSINT_CASES: ${failures.length ? "FAIL" : "OK"}`);
    if (failures.length) {
        failures.forEach(item => console.error(`- ${item}`));
        process.exitCode = 1;
    }
});

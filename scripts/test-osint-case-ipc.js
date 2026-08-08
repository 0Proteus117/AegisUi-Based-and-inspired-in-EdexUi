#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const Ipc = require(path.join(ROOT, "src/classes/workspaces/osintCaseIpc.class.js"));

const failures = [];
function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key} · ${detail}`);
}

function event(url = "file:///aegis/src/ui.html") {
    return {sender: {isDestroyed: () => false, getURL: () => url}};
}

function normalizedResult() {
    return {providerId: "wayback", capability: "HISTORICAL_ARCHIVE", status: "SUCCESS", queriedAt: "2026-08-08T12:00:00.000Z", summary: "A public snapshot is available.", data: {available: true, originalInput: "https://example.org/", canonicalUrl: "https://example.org/", snapshotUrl: "https://web.archive.org/web/20240102030405/https://example.org/", snapshotTimestamp: "20240102030405", provider: "Wayback Machine", queriedAt: "2026-08-08T12:00:00.000Z", completedAt: "2026-08-08T12:00:01.000Z", confidence: "PROVIDER_REPORTED", warnings: []}, warnings: [], source: {provider: "Wayback Machine", type: "REST_API"}, confidence: "PROVIDER_REPORTED"};
}

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-osint-ipc-"));
    const handlers = new Map();
    const ipc = {handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel)};
    const exportsDir = path.join(root, "user-export");
    const dialog = {showSaveDialog: async () => ({canceled: false, filePath: path.join(exportsDir, "case-export.json")})};
    const registration = Ipc.registerOsintCaseIpc({ipc, app: {getPath: () => root, getVersion: () => "2.4.0-test"}, dialog});
    try {
        check("CASE_IPC_CHANNELS_EXPLICIT", registration.channels.length === 13 && registration.channels.every(channel => channel.startsWith("osint-case-") || channel.startsWith("osint-evidence-")));
        check("CASE_IPC_NO_GENERIC_FILESYSTEM", !registration.channels.some(channel => /file|path|write|read-directory/i.test(channel)));
        check("CASE_IPC_REGISTERED", [...registration.channels].every(channel => handlers.has(channel)));
        check("CASE_IPC_REJECTS_UNTRUSTED", !(await handlers.get("osint-case-list")(event("https://evil.test"), {})).ok);
        check("CASE_IPC_REJECTS_UNKNOWN_FIELD", !(await handlers.get("osint-case-create")(event(), {title: "No", arbitraryPath: "/tmp/no"})).ok);
        check("CASE_IPC_REJECTS_PROTO", !(await handlers.get("osint-case-create")(event(), JSON.parse('{"title":"No","__proto__":{"polluted":true}}'))).ok);

        const created = await handlers.get("osint-case-create")(event(), {title: "IPC case", description: "validated", priority: "MEDIUM", tags: ["ipc"]});
        check("CASE_IPC_CREATE", created.ok && created.case.id.startsWith("case-"));
        const saved = await handlers.get("osint-evidence-create")(event(), {caseId: created.case.id, normalizedResult: normalizedResult(), draft: {title: "IPC evidence", summary: "Safe normalized metadata", tags: [], redactions: ["data.originalInput"]}});
        check("CASE_IPC_PROMOTE", saved.ok && saved.evidence.integrity.status === "VALID");
        const read = await handlers.get("osint-evidence-read")(event(), {caseId: created.case.id, evidenceId: saved.evidence.id});
        check("CASE_IPC_READ_EVIDENCE", read.ok && !Object.prototype.hasOwnProperty.call(read.evidence.data, "originalInput"));
        const reference = await handlers.get("osint-evidence-create")(event(), {caseId: created.case.id, normalizedResult: {...normalizedResult(), providerId: "cobalt-strike-reference", capability: "THREAT_REPUTATION"}, draft: {title: "Blocked", summary: "Blocked", tags: []}});
        check("CASE_IPC_REFERENCE_ONLY_BLOCKED", !reference.ok && reference.code === "POLICY_BLOCKED");
        const caseExport = await handlers.get("osint-case-export")(event(), {caseId: created.case.id, format: "json"});
        check("CASE_IPC_MAIN_SELECTS_EXPORT_PATH", caseExport.ok && fs.existsSync(path.join(exportsDir, "case-export.json")));
        dialog.showSaveDialog = async () => ({canceled: false, filePath: path.join(exportsDir, "evidence-export.md")});
        const evidenceExport = await handlers.get("osint-evidence-export")(event(), {caseId: created.case.id, evidenceId: saved.evidence.id, format: "markdown"});
        check("CASE_IPC_EVIDENCE_EXPORT", evidenceExport.ok && fs.existsSync(path.join(exportsDir, "evidence-export.md")));
        check("CASE_IPC_NO_BOOT_CHANGE", !fs.readFileSync(path.join(ROOT, "src/_boot.js"), "utf8").includes("osint-case-create"));
    } finally {
        registration.dispose();
        check("CASE_IPC_DISPOSE", handlers.size === 0);
        fs.rmSync(root, {recursive: true, force: true});
    }
}

main().catch(error => {
    failures.push(`UNHANDLED · ${error.stack || error.message}`);
    console.error(error.stack || error.message);
}).finally(() => {
    console.log(`OSINT_CASE_IPC: ${failures.length ? "FAIL" : "OK"}`);
    if (failures.length) {
        failures.forEach(item => console.error(`- ${item}`));
        process.exitCode = 1;
    }
});

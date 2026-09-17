#!/usr/bin/env node
"use strict";
// Explicit destructive-copy acceptance test, restricted to the known synthetic
// 40-byte CSV and preselected synthetic profile. No picker or UI automation.
// Exercises the shipped preload/main API; never accepts arbitrary file paths.
const port = Number(process.argv[2]);
const assignmentId = process.argv[3];
if (!Number.isInteger(port) || port < 1024 || port > 65535 ||
    !/^stud_assignment_[a-z0-9_]{1,80}$/.test(assignmentId || "") ||
    process.argv[4] !== "--confirm-synthetic-copy-cleanup") {
    throw Error("Supply port, synthetic Assignment ID and --confirm-synthetic-copy-cleanup.");
}

async function exercise(assignmentId) {
    if (!/^\/Volumes\/AegisUi[^/]*\/AegisUi\.app\/Contents\/Resources\/app\.asar\/ui\.html$/.test(decodeURIComponent(location.pathname))) {
        throw Error("Requires the application launched from its mounted validation image.");
    }
    const assert = (value, reason) => { if (!value) throw Error(reason); };
    const call = async (channel, payload = {}) => {
        const response = await window.aegis.stud[channel](payload);
        if (!response.ok) throw Error(`${channel}: ${response.code}`);
        return response.data;
    };
    const hash = "41da7f69a0de0d2f1ca06a9ba5ff7d677d0852e30d28110b01037a06f671887a";
    const inventory = () => call("stud-storage-catalog", {assignmentId, limit: 10});
    const initial = await inventory();
    assert(initial.totalFiles === 1 && !initial.truncated && initial.files[0].expectedHash === hash &&
        initial.files[0].declaredBytes === 40 && !initial.files[0].shared,
    "Requires exactly one unshared synthetic 40-byte CSV; refuses other data.");
    const reference = initial.files[0].reference;
    assert(/^datasets\/[a-zA-Z0-9_-]+_41da7f69a0de0d2f\.csv$/.test(reference), "Unexpected synthetic reference.");
    const profiles = await call("stud-storage-profiles");
    const local = profiles.find(profile => profile.kind === "LOCAL");
    const external = profiles.filter(profile => profile.kind === "EXTERNAL" && profile.label === "Synthetic native archive");
    assert(local && external.length === 1 && external[0].availability === "AVAILABLE", "Requires the explicitly selected synthetic archive.");
    assert(initial.files[0].profileId === local.id, "Start from the restored local fixture; no automatic recovery.");
    const datasets = await call("stud-dataset-list", {assignmentId, limit: 10});
    const dataset = datasets.find(item => item.checksum === hash);
    assert(dataset, "Synthetic canonical Dataset is missing.");
    const baseline = await call("stud-dataset-read", {datasetId: dataset.id});
    assert(baseline.summary.rows === 3, "Synthetic Dataset row count differs.");
    const checks = [];
    const verifyRead = async label => {
        const data = await call("stud-dataset-read", {datasetId: dataset.id});
        assert(JSON.stringify(data) === JSON.stringify(baseline), "Canonical dataset or data changed during transfer.");
        checks.push(label);
    };
    const transfer = async (target, purpose) => {
        const catalog = await inventory();
        const draft = await call("stud-storage-transfer-prepare", {assignmentId, targetProfileId: target.id,
            expectedTargetVersion: target.rowVersion, purpose, expectedScopeHash: catalog.scopeHash, references: [reference]});
        assert(draft.state === "PREPARED" && draft.totalItems === 1 && draft.totalBytes === 40 && draft.portableReady === false,
            "Prepared scope or portable limitation differs.");
        const base = {assignmentId, manifestId: draft.id, expectedVersion: draft.rowVersion};
        const denied = await window.aegis.stud["stud-storage-transfer-execute"](base);
        assert(!denied.ok && denied.code === "STORAGE_APPROVAL_REQUIRED", "Main approval guard failed.");
        const result = await call("stud-storage-transfer-execute", {...base, confirmLimitedScope: true});
        assert(result.state === "APPLIED" && result.run.state === "COMPLETED" && result.run.progressCurrent === 1 &&
            result.run.progressTotal === 1 && result.sources.length > 0 && result.items[0].sha256 === hash,
        "Transfer did not preserve verified source identity and real progress.");
        assert((await inventory()).files[0].profileId === target.id, "Canonical active storage did not switch.");
        await verifyRead(purpose + "_READ_UNCHANGED");
        return result;
    };
    const cleanup = async manifest => {
        const copy = manifest.retainedCopies.find(item => item.reference === reference);
        assert(copy?.eligibleForVerification, "Expected retained synthetic original is not eligible.");
        const input = {assignmentId, manifestId: manifest.id, expectedVersion: manifest.rowVersion,
            reference, expectedAssetVersion: copy.expectedAssetVersion};
        const denied = await window.aegis.stud["stud-storage-copy-remove"](input);
        assert(!denied.ok && denied.code === "STORAGE_APPROVAL_REQUIRED", "Main cleanup approval guard failed.");
        const result = await call("stud-storage-copy-remove", {...input, confirmDeleteRetainedCopy: true});
        assert(result.retainedCopies[0].classification === "REMOVED" && result.cleanupHistory[0].state === "REMOVED" &&
            result.run.state === "COMPLETED", "Retained-copy removal was not durably completed.");
        await verifyRead("CLEANUP_ACTIVE_READ_UNCHANGED");
        // Removed originals cannot be silently resurrected or reported as a
        // successful rollback. The subsequent explicit transfer recreates bytes.
        const rollback = await window.aegis.stud["stud-storage-transfer-rollback"]({assignmentId,
            manifestId: result.id, expectedVersion: result.rowVersion});
        assert(!rollback.ok, "Rollback unexpectedly succeeded after original removal.");
        await verifyRead("FAILED_ROLLBACK_ACTIVE_READ_UNCHANGED");
    };
    await cleanup(await transfer(external[0], "RELOCATE"));
    await cleanup(await transfer(local, "PORTABLE"));
    const returned = await transfer(external[0], "RETURN");
    const restored = await call("stud-storage-transfer-rollback", {assignmentId, manifestId: returned.id, expectedVersion: returned.rowVersion});
    assert(restored.state === "ROLLED_BACK" && restored.run.state === "COMPLETED", "Verified rollback failed.");
    assert((await inventory()).files[0].profileId === local.id, "Final local fixture was not restored.");
    await verifyRead("RETURN_ROLLBACK_READ_UNCHANGED");
    return {status: "PASS", checks, transfers: 3, retainedCopyRemovals: 2,
        finalState: restored.state, finalProfile: "LOCAL", bytes: 40, checksum: hash,
        sourceReferences: restored.sources.length, fullPortableEnvironmentClaimed: false,
        uiInteractionValidated: false, providerOrModelInvokedByProbe: false};
}

(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page" && item.url.includes("app.asar/ui.html"));
    if (!page) throw Error("No packaged renderer available.");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, {once: true});
        socket.addEventListener("error", reject, {once: true});
    });
    let timer;
    try {
        const result = await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(Error("Packaged cycle timed out; inspect history before retrying.")), 120000);
            socket.addEventListener("message", event => {
                const message = JSON.parse(event.data);
                if (message.id !== 1) return;
                if (message.error || message.result?.exceptionDetails) reject(Error("Packaged cycle failed: " + JSON.stringify(message.error || message.result.exceptionDetails)));
                else resolve(message.result.result.value);
            });
            socket.send(JSON.stringify({id: 1, method: "Runtime.evaluate", params: {
                expression: `(${exercise.toString()})(${JSON.stringify(assignmentId)})`, returnByValue: true, awaitPromise: true}}));
        });
        console.log(JSON.stringify(result));
    } finally { clearTimeout(timer); socket.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

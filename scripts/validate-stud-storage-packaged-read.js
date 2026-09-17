#!/usr/bin/env node
"use strict";
// Read-only acceptance probe for an explicitly prepared synthetic Assignment.
// This does not import, transfer, delete, seed records, navigate UI or generate AI.
const port = Number(process.argv[2]);
const assignmentId = process.argv[3];
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^stud_assignment_[a-z0-9_]{1,80}$/.test(assignmentId || "")) {
    throw Error("Supply the validation CDP port and synthetic Assignment ID.");
}
async function inspect(assignmentId) {
    const mounted = /^\/Volumes\/AegisUi[^/]*\/AegisUi\.app\/Contents\/Resources\/app\.asar\/ui\.html$/.test(decodeURIComponent(location.pathname));
    if (!mounted) throw Error("This probe requires the application launched from its mounted validation image.");
    const call = async (channel, payload) => {
        const response = await window.aegis.stud[channel](payload);
        if (!response.ok) throw Error(`${channel}: ${response.code}`);
        return response.data;
    };
    const datasets = await call("stud-dataset-list", {assignmentId, limit: 10});
    const fixture = datasets.find(item => item.checksum === "41da7f69a0de0d2f1ca06a9ba5ff7d677d0852e30d28110b01037a06f671887a");
    if (!fixture) throw Error("The explicitly imported synthetic CSV fixture was not found.");
    const data = await call("stud-dataset-read", {datasetId: fixture.id});
    const history = await call("stud-storage-history", {assignmentId, limit: 10});
    if (!history.length) throw Error("No actual transfer history exists for this fixture.");
    const manifest = await call("stud-storage-transfer-read", {assignmentId, manifestId: history[0].id, limit: 10});
    const core = await call("stud-core-status", {});
    const ai = await window.aegis.assistant.status(true);
    return {
        mounted, schema: core.version,
        rendererNodeAbsent: typeof require === "undefined" && typeof process === "undefined" && typeof Buffer === "undefined",
        rawIpcAbsent: !window.aegis.ipcRenderer && !window.electron,
        rows: data.summary.rows, checksum: data.dataset.checksum,
        manifestState: manifest.state, realRunState: manifest.run?.state,
        approved: Boolean(manifest.approvedAt), sourceReferences: manifest.sources.length,
        ollamaStatus: ai.status, ollamaReady: ai.ok === true,
        modelGenerationPerformed: false
    };
}
(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page" && item.url.includes("app.asar/ui.html"));
    if (!page) throw Error("No packaged renderer is available.");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, {once: true});
        socket.addEventListener("error", reject, {once: true});
    });
    let timer;
    try {
        const result = await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(Error("Packaged read validation timed out")), 45000);
            socket.addEventListener("message", event => {
                const message = JSON.parse(event.data);
                if (message.id !== 1) return;
                if (message.error || message.result?.exceptionDetails) reject(Error("Packaged read failed: " + JSON.stringify(message.error || message.result.exceptionDetails)));
                else resolve(message.result.result.value);
            });
            socket.send(JSON.stringify({id: 1, method: "Runtime.evaluate", params: {expression: `(${inspect.toString()})(${JSON.stringify(assignmentId)})`, returnByValue: true, awaitPromise: true}}));
        });
        const passed = result.mounted && result.schema === 27 && result.rendererNodeAbsent && result.rawIpcAbsent && result.rows === 3 && result.approved && result.sourceReferences > 0 && ["APPLIED", "ROLLED_BACK"].includes(result.manifestState) && result.realRunState === "COMPLETED";
        console.log(JSON.stringify({status: passed ? "PASS" : "FAIL", ...result}));
        if (!passed) process.exitCode = 1;
    } finally { clearTimeout(timer); socket.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

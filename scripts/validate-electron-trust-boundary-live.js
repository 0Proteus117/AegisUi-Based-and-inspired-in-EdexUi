#!/usr/bin/env node
"use strict";

const port = Number(process.argv[2] || 9223);

async function main() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    let sequence = 0;
    const evaluate = expression => new Promise((resolve, reject) => {
        const id = ++sequence;
        const listener = event => {
            const message = JSON.parse(event.data);
            if (message.id !== id) return;
            socket.removeEventListener("message", listener);
            if (message.error || message.result && message.result.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
            else resolve(message.result.result.value);
        };
        socket.addEventListener("message", listener);
        socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}}));
    });
    const result = await evaluate(`(async()=>{
        const core=await window.aegis.stud["stud-core-status"]({});
        return {
            requireType:typeof window.require, processType:typeof window.process, bufferType:typeof window.Buffer,
            rawIpc:Boolean(window.aegis&&window.aegis.ipcRenderer), rawElectron:Boolean(window.electron),
            genericFiles:Boolean(window.aegis&&window.aegis.files), genericExec:Boolean(window.aegis&&window.aegis.exec),
            bridge:Boolean(window.aegis), workspace:Boolean(window.workspaceManager), terminal:Boolean(window.term&&window.term[0]&&window.term[0].socket),
            studChannels:Object.keys(window.aegis.stud||{}).length,
            researchPlanChannel:typeof window.aegis?.stud?.["stud-research-plan-state"] === "function",
            schema:core&&core.data&&core.data.version
        }})()`);
    socket.close();
    const valid = result.requireType === "undefined" && result.processType === "undefined" && result.bufferType === "undefined"
        && !result.rawIpc && !result.rawElectron && !result.genericFiles && !result.genericExec
        && result.bridge && result.workspace && result.terminal && result.studChannels >= 127
        && result.researchPlanChannel && Number(result.schema) >= 20;
    console.log(`ELECTRON_TRUST_BOUNDARY_LIVE: ${valid ? "PASS" : "FAIL"} ${JSON.stringify(result)}`);
    if (!valid) process.exitCode = 1;
}

main().catch(error => { console.error(`ELECTRON_TRUST_BOUNDARY_LIVE: FAIL ${error.message}`); process.exitCode = 1; });

#!/usr/bin/env node
"use strict";

const port = Number(process.argv[2] || 9223);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    socket.sequence = 0; socket.pending = new Map(); socket.exceptions = [];
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, {once: true});
        socket.addEventListener("error", reject, {once: true});
    });
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        if (message.method === "Runtime.exceptionThrown") socket.exceptions.push(message.params.exceptionDetails.text || "Renderer exception");
        const pending = socket.pending.get(message.id);
        if (!pending) return;
        socket.pending.delete(message.id);
        if (message.error || message.result?.exceptionDetails) pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
        else pending.resolve(message.result);
    });
    return socket;
}

function command(socket, method, params = {}) {
    const id = ++socket.sequence;
    return new Promise((resolve, reject) => {
        socket.pending.set(id, {resolve, reject});
        socket.send(JSON.stringify({id, method, params}));
    });
}

async function evaluate(socket, expression) {
    const response = await command(socket, "Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
    return response?.result?.value;
}

async function callGlobal(socket, functionDeclaration, values = []) {
    const globalResponse = await command(socket, "Runtime.evaluate", {expression: "globalThis"});
    const objectId = globalResponse?.result?.objectId;
    if (!objectId) throw new Error("Electron renderer global object is unavailable.");
    const response = await command(socket, "Runtime.callFunctionOn", {
        objectId,
        functionDeclaration,
        arguments: values.map(value => ({value})),
        returnByValue: true,
        awaitPromise: true
    });
    return response?.result?.value;
}

(async () => {
    const socket = await connect();
    try {
        await command(socket, "Runtime.enable");
        const workspaces = await evaluate(socket, "window.workspaceManager.definitions.map(item => item.id)");
        const workspaceResults = [];
        for (const id of workspaces) {
            const result = await callGlobal(socket, "function(id){window.workspaceManager.activate(id,false);const el=id==='hub'?document.getElementById('main_shell'):[...document.querySelectorAll('[data-workspace]')].find(item=>item.dataset.workspace===id);return{id,active:window.workspaceManager.activeId===id,visible:!!el&&!el.classList.contains('workspace-is-hidden'),content:!!el&&el.textContent.trim().length>0}}", [id]);
            await delay(100);
            workspaceResults.push(result);
        }
        await evaluate(socket, "window.workspaceManager.activate('student',false);true");
        await delay(200);
        const views = await evaluate(socket, "typeof ACTIVE_VIEWS!=='undefined'?[...ACTIVE_VIEWS]:[]");
        const studResults = [];
        for (const view of views) {
            const result = await callGlobal(socket, "function(view){const cc=window.workspaceManager.studCommandCenter;cc.setActiveView(view);const main=document.querySelector('[data-workspace=\"student\"] [data-stud-main]');return{view,active:cc.state.activeView===view,content:!!main&&main.textContent.trim().length>0,overflow:!!main&&main.scrollWidth>main.clientWidth+4}}", [view]);
            await delay(80);
            studResults.push(result);
        }
        const terminal = await evaluate(socket, "(()=>{const item=window.term&&window.term[0];return{present:!!item,authenticated:typeof item?.authToken==='string'&&item.authToken.length>=32,connected:item?.socket?.readyState===WebSocket.OPEN}})()");
        const badWorkspaces = workspaceResults.filter(item => !item.active || !item.visible || !item.content);
        const badStud = studResults.filter(item => !item.active || !item.content || item.overflow);
        const report = {workspaces: workspaceResults.length, studViews: studResults.length, badWorkspaces, badStud, terminal, exceptions: socket.exceptions};
        const valid = !badWorkspaces.length && !badStud.length && terminal.present && terminal.authenticated && terminal.connected && !socket.exceptions.length;
        console.log(`ELECTRON_WORKSPACES_LIVE: ${valid ? "PASS" : "FAIL"} ${JSON.stringify(report)}`);
        if (!valid) process.exitCode = 1;
    } finally { socket.close(); }
})().catch(error => { console.error(`ELECTRON_WORKSPACES_LIVE: FAIL ${error.message}`); process.exitCode = 1; });

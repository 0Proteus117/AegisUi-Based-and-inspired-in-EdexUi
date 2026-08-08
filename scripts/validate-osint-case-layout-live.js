#!/usr/bin/env node

"use strict";

/*
 * Optional packaged-Electron layout verifier. Start AegisUi with
 * --remote-debugging-port=<port>, navigate to a seeded Cases/Evidence state,
 * then run this script. It measures semantic rectangle invariants instead of
 * comparing one machine-specific screenshot.
 */
const port = Number(process.argv[2] || 9224);
const scenario = process.argv[3] || "current";
const screenshotPath = process.argv[4] || "";
const viewportWidth = Number(process.argv[5] || 0);
const viewportHeight = Number(process.argv[6] || 0);
const deviceScaleFactor = Number(process.argv[7] || 0);

async function evaluate(socket, expression) {
    const id = ++socket.sequence;
    return new Promise((resolve, reject) => {
        socket.pending.set(id, {resolve, reject, raw: false});
        socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}}));
    });
}

async function command(socket, method, params = {}) {
    const id = ++socket.sequence;
    return new Promise((resolve, reject) => {
        socket.pending.set(id, {resolve, reject, raw: true});
        socket.send(JSON.stringify({id, method, params}));
    });
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No packaged Electron page found");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.sequence = 0;
    ws.pending = new Map();
    await new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve, {once: true});
        ws.addEventListener("error", reject, {once: true});
    });
    ws.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        const pending = ws.pending.get(message.id);
        if (!pending) return;
        ws.pending.delete(message.id);
        if (message.error || message.result && message.result.exceptionDetails) return pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
        pending.resolve(pending.raw ? message.result : message.result && message.result.result && message.result.result.value);
    });
    return ws;
}

function print(key, value) {
    console.log(`${key}: ${value ? "OK" : "FAIL"}`);
    return value;
}

async function main() {
    const socket = await connect();
    try {
        if (viewportWidth > 0 && viewportHeight > 0) {
            await command(socket, "Emulation.setDeviceMetricsOverride", {width: viewportWidth, height: viewportHeight, deviceScaleFactor: deviceScaleFactor || 1, mobile: false});
            await delay(150);
        }
        if (scenario === "dump") {
            const snapshot = await evaluate(socket, `(() => ({workspace:document.body.dataset.workspace, manager:window.workspaceManager && window.workspaceManager.activeId, buttons:[...document.querySelectorAll('button')].map(button => ({text:button.textContent.trim(), action:button.dataset.osintCaseAction || null})).filter(item => /OSINT|CASE|INVESTIGATION/i.test(item.text) || item.action)}))()`);
            console.log(`LIVE_LAYOUT_DUMP: ${JSON.stringify(snapshot)}`);
            return;
        }
        if (scenario === "active" || scenario === "evidence") {
            if (scenario === "active") {
                await evaluate(socket, `(() => { const close = document.querySelector('.osint-case-dialog-overlay.visible [data-osint-case-dialog-close]'); if (close) close.click(); return true; })()`);
                await delay(150);
            }
            await evaluate(socket, `(() => { if (!window.workspaceManager || typeof window.workspaceManager.activate !== 'function') throw new Error('OSINT workspace manager unavailable'); window.workspaceManager.activate('osint', false); return true; })()`);
            await delay(1250);
            const caseView = await evaluate(socket, `Boolean(document.querySelector('.osint-case-main'))`);
            if (!caseView) {
                await evaluate(socket, `(() => { const button = document.querySelector('[data-osint-case-action="workspace"]'); if (!button) throw new Error('Case workspace control unavailable'); button.click(); return true; })()`);
                await delay(750);
            }
            const activeCase = await evaluate(socket, `Boolean(document.querySelector('.osint-case-active'))`);
            if (!activeCase) {
                await evaluate(socket, `(() => { const button = document.querySelector('[data-osint-case-action="open"]'); if (!button) throw new Error('Seeded case unavailable'); button.click(); return true; })()`);
                await delay(500);
            }
        }
        if (scenario === "evidence") {
            await evaluate(socket, `(() => { const button = document.querySelector('[data-osint-case-action="evidence-view"]'); if (!button) throw new Error('Seeded evidence unavailable'); button.click(); return true; })()`);
            await delay(350);
        }
        const report = await evaluate(socket, `(() => {
            const rect = element => { const value = element.getBoundingClientRect(); return {left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height}; };
            const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const active = document.querySelector('.osint-case-active');
            const activeTitle = active && active.querySelector('h2');
            const activeStatus = active && active.querySelector('.osint-case-status');
            const activeMetadata = active && active.querySelector('.osint-case-metadata');
            const activeActions = active && active.querySelector('footer');
            const dialog = document.querySelector('.osint-case-dialog');
            const context = dialog && dialog.querySelector(':scope > header');
            const evidence = dialog && dialog.querySelector('.osint-evidence-detail');
            const evidenceTitle = evidence && evidence.querySelector('.osint-evidence-detail-header');
            const detailMetadata = evidence && evidence.querySelector('.osint-detail-readout');
            const note = evidence && evidence.querySelector('.osint-evidence-note-form');
            const actions = evidence && evidence.querySelector('.osint-evidence-detail-actions');
            const panel = dialog && dialog.querySelector('.osint-detail-body');
            const within = (child, parent) => child && parent && child.left >= parent.left - 1 && child.right <= parent.right + 1 && child.top >= parent.top - 1 && child.bottom <= parent.bottom + 1;
            const data = {
                viewport: {width: innerWidth, height: innerHeight, dpr: devicePixelRatio},
                active: active && activeTitle && activeStatus && activeMetadata && activeActions ? {title:rect(activeTitle), status:rect(activeStatus), metadata:rect(activeMetadata), actions:rect(activeActions)} : null,
                evidence: dialog && context && evidenceTitle && detailMetadata && note && actions && panel ? {dialog:rect(dialog), context:rect(context), title:rect(evidenceTitle), metadata:rect(detailMetadata), note:rect(note), actions:rect(actions), body:rect(panel)} : null
            };
            data.activePass = !data.active || (!intersects(data.active.title, data.active.status) && data.active.title.bottom <= data.active.metadata.top + 1 && data.active.metadata.bottom <= data.active.actions.top + 1);
            data.evidencePass = !data.evidence || (!intersects(data.evidence.context, data.evidence.title) && data.evidence.context.bottom <= data.evidence.body.top + 1 && data.evidence.title.bottom <= data.evidence.metadata.top + 1 && data.evidence.metadata.bottom <= data.evidence.note.top + 1 && data.evidence.note.bottom <= data.evidence.actions.top + 1 && within(data.evidence.actions, data.evidence.body));
            data.available = Boolean(data.active || data.evidence);
            return data;
        })()`);
        print("LIVE_LAYOUT_TARGET_AVAILABLE", report && report.available);
        print("LIVE_ACTIVE_CASE_FLOW", !report || report.activePass);
        print("LIVE_EVIDENCE_DETAIL_FLOW", !report || report.evidencePass);
        console.log(`LIVE_LAYOUT_VIEWPORT: ${JSON.stringify(report && report.viewport || {})}`);
        if (screenshotPath) {
            const captured = await command(socket, "Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
            require("fs").writeFileSync(screenshotPath, Buffer.from(captured.data, "base64"));
            console.log(`LIVE_LAYOUT_SCREENSHOT: ${screenshotPath}`);
        }
        if (!report || !report.available || !report.activePass || !report.evidencePass) process.exitCode = 1;
    } finally {
        socket.close();
    }
}

main().catch(error => {
    console.error(`LIVE_OSINT_LAYOUT: FAIL ${error.message}`);
    process.exitCode = 1;
});

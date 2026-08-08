#!/usr/bin/env node

"use strict";

/*
 * Packaged Electron visual contract probe. It uses semantic bounds and colours
 * rather than one machine's coordinates. Run only against a disposable
 * user-data directory: case/evidence fixtures are created through the existing
 * constrained IPC and never become production defaults.
 */
const fs = require("fs");

const port = Number(process.argv[2] || 9231);
const requestedAppearance = String(process.argv[3] || "light").toLowerCase();
const surface = String(process.argv[4] || "hub").toLowerCase();
const screenshotPath = process.argv[5] || "";
const viewportWidth = Number(process.argv[6] || 0);
const viewportHeight = Number(process.argv[7] || 0);
const deviceScaleFactor = Number(process.argv[8] || 0);
const screenshotRegion = String(process.argv[9] || "full").toLowerCase();

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No packaged Electron page found");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    socket.sequence = 0;
    socket.pending = new Map();
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, {once: true});
        socket.addEventListener("error", reject, {once: true});
    });
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        const pending = socket.pending.get(message.id);
        if (!pending) return;
        socket.pending.delete(message.id);
        if (message.error || message.result && message.result.exceptionDetails) {
            pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
            return;
        }
        pending.resolve(pending.raw ? message.result : message.result && message.result.result && message.result.result.value);
    });
    return socket;
}

function command(socket, method, params = {}) {
    const id = ++socket.sequence;
    return new Promise((resolve, reject) => {
        socket.pending.set(id, {resolve, reject, raw: true});
        socket.send(JSON.stringify({id, method, params}));
    });
}

function evaluate(socket, expression) {
    const id = ++socket.sequence;
    return new Promise((resolve, reject) => {
        socket.pending.set(id, {resolve, reject, raw: false});
        socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}}));
    });
}

function print(key, passed, detail = "") {
    console.log(`${key}: ${passed ? "OK" : "FAIL"}${detail ? ` ${detail}` : ""}`);
    return passed;
}

async function prepareSurface(socket) {
    const target = surface;
    if (target === "assistant") {
        await evaluate(socket, `(() => {
            document.querySelector('[data-osint-case-dialog-close]')?.click();
            window.assistantPresence?.panel?.setOpen(true);
            return Boolean(document.querySelector('.assistant-panel.visible'));
        })()`);
        return;
    }
    if (target === "hub") {
        await evaluate(socket, `(() => window.workspaceManager.activate('hub', false))()`);
        return;
    }
    if (target === "eng") {
        await evaluate(socket, `(() => window.workspaceManager.activate('engineer', false))()`);
        return;
    }
    if (!["osint", "case", "evidence"].includes(target)) {
        await evaluate(socket, `(() => {
            const id = ${JSON.stringify(target)};
            if (!window.workspaceManager?.byId?.has(id)) throw new Error('Unknown workspace: ' + id);
            return window.workspaceManager.activate(id, false);
        })()`);
        return;
    }
    await evaluate(socket, `(() => window.workspaceManager.activate('osint', false))()`);
    await delay(700);
    if (target === "osint") return;
    await evaluate(socket, `(() => { window.workspaceManager.osintCaseState.mode = 'CASE'; window.workspaceManager.renderOSINTState(); return true; })()`);
    await delay(300);
    await evaluate(socket, `(() => window.workspaceManager.ipc.invoke('osint-case-create', {
        title: 'Theme validation investigation with a deliberately long legitimate title for wrapping',
        description: 'Disposable packaged-validation fixture. It verifies light appearance contrast and the protected Case layout flow only.',
        priority: 'HIGH',
        tags: 'theme, packaged-validation, long-content'
    }))()`);
    await delay(250);
    await evaluate(socket, `(() => window.workspaceManager.refreshOSINTCases({render: false}).then(() => {
        const candidate = window.workspaceManager.osintCaseState.cases.find(item => item.title.startsWith('Theme validation investigation'));
        if (!candidate) throw new Error('Theme case fixture unavailable');
        return window.workspaceManager.openOSINTCaseById(candidate.id, {render: true, silent: true});
    }))()`);
    await delay(450);
    if (target === "case") return;
    await evaluate(socket, `(() => {
        const manager = window.workspaceManager;
        const caseId = manager.osintCaseState.activeCaseId;
        return manager.ipc.invoke('osint-evidence-create', {caseId, manual: {
            type: 'MANUAL_OBSERVATION',
            title: 'Theme validation evidence with a deliberately long legitimate title for metadata wrapping',
            summary: 'Disposable local evidence for visual validation. No provider response, credential, network payload or user data is stored by this fixture.',
            sourceUrl: '',
            tags: 'theme, layout, evidence'
        }}).then(response => {
            if (!response || !response.ok) throw new Error(response && response.message || 'Fixture evidence failed');
            return manager.openOSINTEvidenceDetail(caseId, response.evidence.id, document.body);
        });
    })()`);
}

async function main() {
    const failures = [];
    const socket = await connect();
    try {
        const systemAppearance = /^system-(light|dark)$/.exec(requestedAppearance);
        const appearance = systemAppearance ? "system" : requestedAppearance;
        const expectedAppearance = systemAppearance ? systemAppearance[1] : appearance;
        if (viewportWidth > 0 && viewportHeight > 0) {
            await command(socket, "Emulation.setDeviceMetricsOverride", {width: viewportWidth, height: viewportHeight, deviceScaleFactor: deviceScaleFactor || 1, mobile: false});
        }
        if (systemAppearance) {
            await command(socket, "Emulation.setEmulatedMedia", {media: "", features: [{name: "prefers-color-scheme", value: expectedAppearance}]});
        }
        for (let attempt = 0; attempt < 80; attempt += 1) {
            if (await evaluate(socket, "typeof window.setAegisAppearance === 'function'")) break;
            await delay(250);
        }
        if (!await evaluate(socket, "typeof window.setAegisAppearance === 'function'")) {
            throw new Error("Aegis appearance runtime did not initialise");
        }
        await evaluate(socket, `window.setAegisAppearance(${JSON.stringify(appearance)})`);
        await delay(350);
        await prepareSurface(socket);
        await delay(850);
        const report = await evaluate(socket, `(() => {
            const root = document.documentElement;
            const style = getComputedStyle(document.body);
            const rect = element => {
                if (!element) return null;
                const value = element.getBoundingClientRect();
                return {left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height};
            };
            const intersect = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const visible = element => {
                const value = rect(element);
                return value && value.width > 0 && value.height > 0 && value.bottom > 0 && value.right > 0 && value.top < innerHeight && value.left < innerWidth;
            };
            const active = document.querySelector('.osint-case-active');
            const evidenceDialog = document.querySelector('.osint-case-dialog-overlay.visible .osint-case-dialog');
            const report = {
                appearance: root.dataset.aegisAppearance,
                preference: root.dataset.aegisAppearancePreference,
                bodyBackground: style.backgroundColor,
                bodyColor: style.color,
                viewport: {width: innerWidth, height: innerHeight, dpr: devicePixelRatio},
                workspace: window.workspaceManager && window.workspaceManager.activeId,
                activeCase: active ? {
                    title: rect(active.querySelector('h2')),
                    status: rect(active.querySelector('.osint-case-status')),
                    metadata: rect(active.querySelector('.osint-case-metadata')),
                    actions: rect(active.querySelector('footer'))
                } : null,
                evidenceDetail: evidenceDialog ? {
                    dialog: rect(evidenceDialog),
                    context: rect(evidenceDialog.querySelector(':scope > header')),
                    title: rect(evidenceDialog.querySelector('.osint-evidence-detail-header')),
                    metadata: rect(evidenceDialog.querySelector('.osint-detail-readout')),
                    actions: rect(evidenceDialog.querySelector('.osint-evidence-detail-actions'))
                } : null,
                controlVisible: visible(document.querySelector('.workspace-nav-button, .assistant-panel button, .workspace-panel button'))
            };
            report.activeFlow = !report.activeCase || (!intersect(report.activeCase.title, report.activeCase.status)
                && report.activeCase.title.bottom <= report.activeCase.metadata.top + 1
                && report.activeCase.metadata.bottom <= report.activeCase.actions.top + 1);
            report.evidenceFlow = !report.evidenceDetail || (!intersect(report.evidenceDetail.context, report.evidenceDetail.title)
                && report.evidenceDetail.context.bottom <= report.evidenceDetail.title.top + 1
                && report.evidenceDetail.title.bottom <= report.evidenceDetail.metadata.top + 1
                && report.evidenceDetail.metadata.bottom <= report.evidenceDetail.actions.top + 1
                && report.evidenceDetail.actions.bottom <= report.evidenceDetail.dialog.bottom + 1);
            return report;
        })()`);
        failures.push(!print("LIVE_THEME_APPEARANCE", report.appearance === expectedAppearance && report.preference === appearance, JSON.stringify({appearance: report.appearance, preference: report.preference, expectedAppearance, expectedPreference: appearance})));
        failures.push(!print("LIVE_THEME_CONTROL_VISIBLE", report.controlVisible));
        failures.push(!print("LIVE_THEME_CASE_FLOW", report.activeFlow));
        failures.push(!print("LIVE_THEME_EVIDENCE_FLOW", report.evidenceFlow));
        console.log(`LIVE_THEME_VIEWPORT: ${JSON.stringify(report.viewport)}`);
        console.log(`LIVE_THEME_SURFACE: ${surface}`);
        if (screenshotPath) {
            const screenshotOptions = {format: "png", captureBeyondViewport: false};
            if (screenshotRegion === "sanitized") {
                await evaluate(socket, `(() => {
                    const id = 'aegis-release-evidence-sanitize';
                    document.getElementById(id)?.remove();
                    const style = document.createElement('style');
                    style.id = id;
                    style.textContent = '#main_shell_innercontainer > * { visibility: hidden !important; } #main_shell_innercontainer::after { content: "AEGISUI / RELEASE VALIDATION"; position: absolute; inset: 0; display: flex; align-items: center; padding-left: .5vw; color: #9ed9ff; font: 1.05em monospace; visibility: visible; }';
                    document.head.appendChild(style);
                    return true;
                })()`);
            }
            if (screenshotRegion === "content") {
                const contentBounds = await evaluate(socket, `(() => {
                    const view = document.getElementById('workspace_views');
                    const rect = view && view.getBoundingClientRect();
                    return rect ? {x: 0, y: Math.max(0, rect.top), width: innerWidth, height: Math.max(1, innerHeight - rect.top)} : null;
                })()`);
                if (contentBounds) screenshotOptions.clip = {...contentBounds, scale: 1};
            }
            const capture = await command(socket, "Page.captureScreenshot", screenshotOptions);
            fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64"));
            console.log(`LIVE_THEME_SCREENSHOT: ${screenshotPath}`);
        }
    } finally {
        socket.close();
    }
    if (failures.some(Boolean)) process.exitCode = 1;
}

main().catch(error => {
    console.error(`LIVE_THEME_VALIDATION: FAIL ${error.message}`);
    process.exitCode = 1;
});

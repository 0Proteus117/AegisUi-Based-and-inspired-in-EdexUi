#!/usr/bin/env node

"use strict";

/* Packaged Electron Calendar probe. Run only with a disposable user-data
 * directory: it queries the existing read-only native helper and proves that
 * appearance transitions cannot own or reset Calendar state. */
const fs = require("fs");

const port = Number(process.argv[2] || 9362);
const screenshotPath = process.argv[3] || "";

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

function report(key, passed, detail = "") {
    console.log(`${key}: ${passed ? "OK" : "FAIL"}${detail ? ` ${detail}` : ""}`);
    return passed;
}

async function main() {
    const socket = await connect();
    const failures = [];
    try {
        for (let attempt = 0; attempt < 80; attempt += 1) {
            if (await evaluate(socket, "Boolean(window.engineeringDashboard?.calendarPanel && window.setAegisAppearance)")) break;
            await delay(250);
        }
        if (!await evaluate(socket, "Boolean(window.engineeringDashboard?.calendarPanel && window.setAegisAppearance)")) {
            throw new Error("Calendar/theme runtime did not initialise");
        }

        const initial = await evaluate(socket, `(() => {
            window.workspaceManager.activate('hub', false);
            const panel = window.engineeringDashboard.calendarPanel;
            window.__aegisCalendarProbePanel = panel;
            return panel.load(true).then(() => ({
                connected: localStorage.getItem('edexui-eng-calendar-native-connected'),
                hasData: Boolean(panel.calendarData),
                calendars: panel.calendarData?.calendars?.length || 0,
                events: panel.calendarData?.events?.length || 0,
                fallback: document.getElementById('eng_calendar_content')?.textContent?.includes('CALENDAR LINK UNAVAILABLE') || false
            }));
        })()`);
        failures.push(!report("CALENDAR_PACKAGED_NATIVE_RESPONSE", initial.hasData && !initial.fallback, JSON.stringify(initial)));

        await evaluate(socket, "window.setAegisAppearance('dark')");
        await delay(180);
        await evaluate(socket, "window.setAegisAppearance('light')");
        await delay(180);
        await evaluate(socket, "window.setAegisAppearance('system')");
        await command(socket, "Emulation.setEmulatedMedia", {media: "", features: [{name: "prefers-color-scheme", value: "light"}]});
        await delay(220);
        const systemLight = await evaluate(socket, `(() => {
            const panel = window.engineeringDashboard.calendarPanel;
            return {
                appearance: document.documentElement.dataset.aegisAppearance,
                preference: document.documentElement.dataset.aegisAppearancePreference,
                samePanel: panel === window.__aegisCalendarProbePanel,
                connected: localStorage.getItem('edexui-eng-calendar-native-connected'),
                calendars: panel.calendarData?.calendars?.length || 0,
                events: panel.calendarData?.events?.length || 0,
                fallback: document.getElementById('eng_calendar_content')?.textContent?.includes('CALENDAR LINK UNAVAILABLE') || false
            };
        })()`);
        failures.push(!report("CALENDAR_THEME_SWITCH_PRESERVES_STATE", systemLight.appearance === "light"
            && systemLight.preference === "system" && systemLight.samePanel && systemLight.connected === "true"
            && systemLight.calendars === initial.calendars && systemLight.events === initial.events && !systemLight.fallback, JSON.stringify(systemLight)));

        await command(socket, "Emulation.setEmulatedMedia", {media: "", features: [{name: "prefers-color-scheme", value: "dark"}]});
        await delay(220);
        const systemDark = await evaluate(socket, `(() => ({
            appearance: document.documentElement.dataset.aegisAppearance,
            preference: document.documentElement.dataset.aegisAppearancePreference,
            samePanel: window.engineeringDashboard.calendarPanel === window.__aegisCalendarProbePanel,
            connected: localStorage.getItem('edexui-eng-calendar-native-connected'),
            fallback: document.getElementById('eng_calendar_content')?.textContent?.includes('CALENDAR LINK UNAVAILABLE') || false
        }))()`);
        failures.push(!report("CALENDAR_SYSTEM_DARK_PRESERVES_STATE", systemDark.appearance === "dark"
            && systemDark.preference === "system" && systemDark.samePanel && systemDark.connected === "true" && !systemDark.fallback, JSON.stringify(systemDark)));

        if (screenshotPath) {
            await evaluate(socket, "window.setAegisAppearance('light')");
            await delay(180);
            const capture = await command(socket, "Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
            fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64"));
            console.log(`CALENDAR_PACKAGED_SCREENSHOT: ${screenshotPath}`);
        }
    } finally {
        socket.close();
    }
    if (failures.some(Boolean)) process.exitCode = 1;
}

main().catch(error => {
    console.error(`CALENDAR_PACKAGED_VALIDATION: FAIL ${error.message}`);
    process.exitCode = 1;
});

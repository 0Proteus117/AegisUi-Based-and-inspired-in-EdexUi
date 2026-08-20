#!/usr/bin/env node
"use strict";

// Captures only the STUD deck from an already prepared renderer. This keeps
// usernames, terminal contents and the system sidebar out of public release
// evidence while preserving the real renderer/layout under validation.
const fs = require("fs");

const port = Number(process.argv[2] || 9223);
const output = String(process.argv[3] || "");
const selector = String(process.argv[4] || "");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found.");
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
        if (message.error || message.result?.exceptionDetails) pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
        else pending.resolve(pending.raw ? message.result : message.result?.result?.value);
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

(async () => {
    if (!output) throw new Error("Output path is required.");
    const socket = await connect();
    try {
        if (selector) await evaluate(socket, `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:"start",inline:"nearest"});true`);
        await delay(180);
        const report = await evaluate(socket, `(()=>{const deck=document.querySelector('[data-workspace="student"] .stud-command-center-deck');if(!deck)return null;const r=deck.getBoundingClientRect(),main=deck.querySelector('[data-stud-main]');return{x:Math.max(0,r.left),y:Math.max(0,r.top),width:Math.min(innerWidth-r.left,r.width),height:Math.min(innerHeight-r.top,r.height),horizontalOverflow:Boolean(main&&main.scrollWidth>main.clientWidth+4)}})()`);
        if (!report) throw new Error("STUD deck is unavailable.");
        if (report.horizontalOverflow) throw new Error("STUD deck has horizontal overflow.");
        const capture = await command(socket, "Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
            clip: {...report, scale: 1}
        });
        fs.mkdirSync(require("path").dirname(output), {recursive: true});
        fs.writeFileSync(output, Buffer.from(capture.data, "base64"));
        console.log(`STUD_RELEASE_DECK_SCREENSHOT: ${output}`);
    } finally {
        socket.close();
    }
})().catch(error => {
    console.error(`STUD_RELEASE_DECK_SCREENSHOT: FAIL ${error.message}`);
    process.exitCode = 1;
});

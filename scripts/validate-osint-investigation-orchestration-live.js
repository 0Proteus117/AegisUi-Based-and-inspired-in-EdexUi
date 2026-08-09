#!/usr/bin/env node
"use strict";

/* Optional Electron visual contract probe for Phase 10. It injects synthetic
 * renderer-only state and neither reads nor writes Case persistence. */
const fs = require("fs");
const port = Number(process.argv[2] || 9229);
const screenshotPath = process.argv[3] || "";
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark");
const scenario = String(process.argv[8] || "overview");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found");
    const socket = new WebSocket(page.webSocketDebuggerUrl); socket.sequence = 0; socket.pending = new Map();
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    socket.addEventListener("message", event => { const message = JSON.parse(event.data); const pending = socket.pending.get(message.id); if (!pending) return; socket.pending.delete(message.id); if (message.error || message.result && message.result.exceptionDetails) return pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails))); pending.resolve(pending.raw ? message.result : message.result && message.result.result && message.result.result.value); });
    return socket;
}
function command(socket, method, params = {}) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: true}); socket.send(JSON.stringify({id, method, params})); }); }
function evaluate(socket, expression) { const id = ++socket.sequence; return new Promise((resolve, reject) => { socket.pending.set(id, {resolve, reject, raw: false}); socket.send(JSON.stringify({id, method: "Runtime.evaluate", params: {expression, returnByValue: true, awaitPromise: true}})); }); }

async function main() {
    const socket = await connect();
    try {
        await command(socket, "Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: scale, mobile: false});
        await evaluate(socket, `(() => {
            const manager = window.workspaceManager; if (!manager) throw new Error('Workspace manager unavailable');
            manager.activate('osint', false);
            const now = '2026-08-09T12:00:00.000Z';
            manager.osintEntityState = window.OSINTEntityResolution.createState({mode:'CATALOG', entities:[
                {id:'entity-org-001',type:'ORGANIZATION',label:'Synthetic Public Validation Organization With A Long But Non-Private Name',aliases:[],attributes:[],confidence:'MEDIUM',status:'PARTIALLY_RESOLVED',archived:false},
                {id:'entity-domain-001',type:'DOMAIN',label:'example.invalid',aliases:[],attributes:[],confidence:'MEDIUM',status:'CONSISTENT',archived:false}
            ], relationships:[{id:'relationship-001',fromId:'entity-org-001',toId:'entity-domain-001',type:'USES_DOMAIN',confidence:'MEDIUM',status:'INCONSISTENT',evidence:[{summary:'Synthetic evidence'}],contradictions:['Synthetic contradiction retained for analyst review.']}]});
            manager.osintCaseState = {mode:'OVERVIEW',loaded:true,loading:false,activeCaseId:'case-phase10-synthetic',cases:[{id:'case-phase10-synthetic',title:'Synthetic Phase 10 investigation with long content for safe layout validation',status:'OPEN',priority:'HIGH',evidenceCount:4,tags:['synthetic','phase10']}],lastError:null,activeCase:{case:{id:'case-phase10-synthetic',title:'Synthetic Phase 10 investigation with long content for safe layout validation',status:'OPEN',priority:'HIGH',updatedAt:now,tags:['synthetic','phase10']},evidence:[
              {id:'evidence-domain-001',title:'Synthetic domain observation with a deliberately long label',capability:'INFRASTRUCTURE_CONTEXT',confidence:'MEDIUM',source:{type:'NORMALIZED_PASSIVE_OBSERVATIONS'},integrity:{status:'VALID'},data:{infrastructure:{normalizedTarget:'example.invalid',targetType:'DOMAIN',verificationStatus:'PARTIALLY_VERIFIED',confidence:'MEDIUM'}}},
              {id:'evidence-source-001',title:'Synthetic research source',capability:'SOURCE_VERIFICATION',confidence:'LOW',source:{type:'NORMALIZED_SOURCE_CONTEXT'},integrity:{status:'VALID'},data:{research:{sourceType:'URL',normalizedUrl:'https://example.invalid/research/synthetic-report',hostname:'example.invalid',title:'Synthetic report',verificationStatus:'UNVERIFIED',confidence:'LOW'}}},
              {id:'evidence-media-001',title:'Synthetic visual metadata',capability:'VISUAL_MEDIA_VERIFICATION',confidence:'LOW',source:{type:'EXPLICIT_LOCAL_FILE'},integrity:{status:'VALID'},data:{media:{displayLabel:'synthetic-validation.png',metadataStatus:'METADATA_AVAILABLE',geo:{latitude:40.4168,longitude:-3.7038}}}},
              {id:'evidence-entity-001',title:'Synthetic entity snapshot',capability:'ENTITY_RESOLUTION',confidence:'MEDIUM',source:{type:'LOCAL_ENTITY_RESOLUTION'},integrity:{status:'VALID'},data:{entityResolution:{entity:{id:'entity-org-001',type:'ORGANIZATION',label:'Synthetic Public Validation Organization',aliases:[],attributes:[{field:'DOMAIN',value:'example.invalid'}],confidence:'MEDIUM',status:'PARTIALLY_RESOLVED'},relationships:[{contradictions:['Synthetic contradiction retained for analyst review.']}]}}}
            ],notes:[{id:'note-1',text:'Synthetic local note only.'}],timeline:[{type:'EVIDENCE_CREATED',summary:'Synthetic evidence entered through the existing Case model.',timestamp:now},{type:'RELATIONSHIP_REVIEWED',summary:'Synthetic contradiction remains unresolved.',timestamp:now}]}};
            manager.updateOSINTInvestigationContext({activeCaseId:'case-phase10-synthetic'});
            manager.renderOSINTState();
            document.documentElement.dataset.aegisAppearance = ${JSON.stringify(appearance)};
            return true;
        })()`);
        await delay(350);
        if (scenario === "selected" || scenario === "handoff") {
            await evaluate(socket, `(() => { document.querySelector('[data-osint-object-id="evidence-source-001:source"]')?.click(); return Boolean(document.querySelector('[data-osint-handoff-action="OPEN_DOMAIN_CONTEXT"]')); })()`);
            await delay(120);
        }
        if (scenario === "entity") {
            await evaluate(socket, `(() => { const manager = window.workspaceManager; const object = manager.getOSINTCaseOverview().objects.find(item => item.id === 'evidence-source-001:source'); manager.beginOSINTInvestigationHandoff(object, 'PROMOTE_TO_ENTITY'); return manager.osintEntityState.orchestrationHandoff && manager.osintEntityState.orchestrationHandoff.explicit; })()`);
            await delay(120);
        }
        if (scenario === "evidence-preview") {
            await evaluate(socket, `(() => {
                const manager = window.workspaceManager;
                manager.osintLastNormalizedResults['google-public-dns'] = Object.freeze({requestId:'synthetic-phase10-preview', providerId:'google-public-dns', capability:'INFRASTRUCTURE_CONTEXT', status:'SUCCESS', queriedAt:'2026-08-09T12:00:00.000Z', completedAt:'2026-08-09T12:00:00.000Z', durationMs:0, summary:'Synthetic bounded provider observation for Evidence Preview validation.', data:{provider:'Synthetic provider fixture', target:{normalizedTarget:'example.invalid', targetType:'DOMAIN'}, dns:{records:[]}}, warnings:[], source:{provider:'Synthetic provider fixture', type:'NORMALIZED_PASSIVE_OBSERVATIONS'}, confidence:'MEDIUM', rawAvailable:false, error:null});
                manager.openOSINTEvidencePreview('case-phase10-synthetic', 'google-public-dns');
                return Boolean(document.querySelector('.osint-evidence-preview-dialog'));
            })()`);
            await delay(120);
        }
        const handoff = scenario === "handoff" ? await evaluate(socket, `(() => {
            const manager = window.workspaceManager; let calls = 0; const runtime = manager.osintRuntime; const original = runtime && runtime.startQuery;
            if (runtime && original) runtime.startQuery = (...args) => { calls += 1; return original.apply(runtime, args); };
            document.querySelector('[data-osint-handoff-action="OPEN_DOMAIN_CONTEXT"]')?.click();
            if (runtime && original) runtime.startQuery = original;
            return {calls, mode:manager.osintDomainState.mode, input:manager.osintDomainState.input, phase:manager.osintDomainState.phase, handoff:manager.osintDomainState.handoff && manager.osintDomainState.handoff.explicit};
        })()`) : null;
        const report = await evaluate(socket, `(() => {
            const rect = element => { const r = element.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
            const overlap = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            if (${JSON.stringify(scenario)} === "handoff") {
                const header = document.querySelector('.osint-domain-header'); const input = document.querySelector('[data-osint-domain-input]'); const notice = document.querySelector('.osint-orchestration-handoff');
                return {available:Boolean(header && input && notice), flow:Boolean(header && input && notice && input.value === 'example.invalid'), viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, count:0};
            }
            if (${JSON.stringify(scenario)} === "entity") {
                const header = document.querySelector('.osint-entity-header'); const label = document.querySelector('[data-osint-entity-create-form] [name="label"]'); const notice = document.querySelector('.osint-orchestration-handoff');
                return {available:Boolean(header && label && notice), flow:Boolean(header && label && notice && label.value.includes('Synthetic report')), viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, count:0};
            }
            if (${JSON.stringify(scenario)} === "evidence-preview") {
                const dialog = document.querySelector('.osint-case-dialog'); const actions = dialog && dialog.querySelector('footer');
                return {available:Boolean(dialog && actions), flow:Boolean(dialog && actions && actions.getBoundingClientRect().bottom <= dialog.getBoundingClientRect().bottom + 1), viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, count:0};
            }
            const header = document.querySelector('.osint-investigation-header'); const summary = document.querySelector('.osint-investigation-summary'); const index = document.querySelector('.osint-investigation-index'); const actions = document.querySelector('.osint-investigation-actions'); const question = document.querySelector('.osint-investigation-questions');
            const objects = [...document.querySelectorAll('.osint-investigation-object')];
            const out = {available:Boolean(header&&summary&&index&&actions&&question), viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, count:objects.length, header:header&&rect(header), summary:summary&&rect(summary), index:index&&rect(index), actions:actions&&rect(actions), question:question&&rect(question)};
            out.flow = out.available && !overlap(out.header,out.summary) && !overlap(out.header,out.index) && !overlap(out.header,out.actions) && objects.every(item => item.getBoundingClientRect().width <= index.getBoundingClientRect().width + 1);
            return out;
        })()`);
        console.log(`LIVE_ORCHESTRATION_AVAILABLE: ${report && report.available ? 'OK' : 'FAIL'}`);
        console.log(`LIVE_ORCHESTRATION_LAYOUT: ${report && report.flow ? 'OK' : 'FAIL'}`);
        console.log(`LIVE_ORCHESTRATION_VIEWPORT: ${JSON.stringify(report && report.viewport || {})}`);
        if (handoff) console.log(`LIVE_ORCHESTRATION_HANDOFF: ${handoff.calls === 0 && handoff.mode === 'DOMAIN' && handoff.phase === 'IDLE' && handoff.handoff ? 'OK' : 'FAIL'} ${JSON.stringify(handoff)}`);
        if (screenshotPath) {
            const bounds = await evaluate(socket, `(() => { const element = ${JSON.stringify(scenario)} === "evidence-preview" ? document.querySelector('.osint-case-dialog') : document.querySelector('[data-workspace="osint"]:not(.workspace-is-hidden) .workspace-grid') || document.querySelector('[data-workspace="osint"]:not(.workspace-is-hidden)'); if (!element) return null; const rect = element.getBoundingClientRect(); return {x:Math.max(0, rect.left), y:Math.max(0, rect.top), width:Math.max(1, rect.width), height:Math.max(1, rect.height)}; })()`);
            const captureOptions = {format:"png",captureBeyondViewport:false};
            if (bounds) captureOptions.clip = {...bounds, scale: 1};
            const capture = await command(socket, "Page.captureScreenshot", captureOptions);
            fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64"));
            console.log(`LIVE_ORCHESTRATION_CAPTURE_BOUNDS: ${JSON.stringify(bounds)}`);
            console.log(`LIVE_ORCHESTRATION_SCREENSHOT: ${screenshotPath}`);
        }
        if (!report || !report.available || !report.flow || handoff && (handoff.calls !== 0 || handoff.mode !== "DOMAIN" || handoff.phase !== "IDLE" || !handoff.handoff)) process.exitCode = 1;
    } finally { socket.close(); }
}
main().catch(error => { console.error(`LIVE_ORCHESTRATION: FAIL ${error.message}`); process.exitCode = 1; });

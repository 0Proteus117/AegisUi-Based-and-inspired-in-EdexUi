#!/usr/bin/env node
"use strict";

/* Optional visual probe for the v2.6.0 milestone. It injects renderer-only
 * synthetic state; it never opens a provider, writes a Case or reads user data. */
const fs = require("fs");

const port = Number(process.argv[2] || 9230);
const screenshotPath = process.argv[3] || "";
const width = Number(process.argv[4] || 1440);
const height = Number(process.argv[5] || 900);
const scale = Number(process.argv[6] || 2);
const appearance = String(process.argv[7] || "dark").toLowerCase();
const scenario = String(process.argv[8] || "overview").toLowerCase();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === "page");
    if (!page) throw new Error("No Electron renderer page found");
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
        if (message.error || message.result && message.result.exceptionDetails) return pending.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
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

function fixtureExpression() {
    return `(() => {
        const manager = window.workspaceManager;
        if (!manager || !window.OSINTEntityResolution || !window.OSINTDomainInfrastructure || !window.OSINTResearchSourceVerification) throw new Error('OSINT modules unavailable');
        manager.activate('osint', false);
        const now = '2026-08-09T12:00:00.000Z';
        const caseId = 'case-phase11-synthetic';
        const evidence = [
            {id:'evidence-domain',title:'Synthetic domain context for example.invalid',capability:'INFRASTRUCTURE_CONTEXT',confidence:'MEDIUM',source:{type:'NORMALIZED_PASSIVE_OBSERVATIONS'},integrity:{status:'VALID'},data:{infrastructure:{normalizedTarget:'example.invalid',targetType:'DOMAIN',verificationStatus:'PARTIALLY_VERIFIED',confidence:'MEDIUM'}}},
            {id:'evidence-source',title:'Synthetic public source with non-private long title',capability:'SOURCE_VERIFICATION',confidence:'LOW',source:{type:'NORMALIZED_SOURCE_CONTEXT'},integrity:{status:'VALID'},data:{research:{sourceType:'URL',normalizedUrl:'https://example.invalid/research/synthetic-report',hostname:'example.invalid',title:'Synthetic report',verificationStatus:'UNVERIFIED',confidence:'LOW'}}},
            {id:'evidence-media',title:'Synthetic visual metadata context',capability:'VISUAL_MEDIA_VERIFICATION',confidence:'LOW',source:{type:'EXPLICIT_LOCAL_FILE'},integrity:{status:'VALID'},data:{media:{displayLabel:'synthetic-validation.png',metadataStatus:'METADATA_AVAILABLE',geo:{latitude:40.4168,longitude:-3.7038}}}},
            {id:'evidence-geo',title:'Synthetic location verification',capability:'GEOSPATIAL_VERIFICATION',confidence:'MEDIUM',source:{type:'IMAGE_METADATA'},integrity:{status:'VALID'},data:{geo:{latitude:40.4168,longitude:-3.7038,displayName:'Synthetic validation location',verificationStatus:'PARTIALLY_VERIFIED',verificationConfidence:'MEDIUM'}}}
        ];
        manager.osintEntityState = window.OSINTEntityResolution.createState({mode:'CATALOG',entities:[
            {id:'entity-org',type:'ORGANIZATION',label:'Synthetic Public Validation Organization',aliases:['SPVO'],attributes:[{field:'DOMAIN',value:'example.invalid',sourceType:'CASE_EVIDENCE',sourceIdentifier:'evidence-domain',confidence:'MEDIUM'}],confidence:'MEDIUM',status:'PARTIALLY_RESOLVED'},
            {id:'entity-domain',type:'DOMAIN',label:'example.invalid',aliases:[],attributes:[],confidence:'MEDIUM',status:'CONSISTENT'},
            {id:'entity-location',type:'LOCATION',label:'Synthetic validation location',aliases:[],attributes:[{field:'LOCATION',value:'40.4168, -3.7038',sourceType:'CASE_EVIDENCE',sourceIdentifier:'evidence-geo',confidence:'MEDIUM'}],confidence:'LOW',status:'AMBIGUOUS'},
            {id:'entity-source',type:'SOURCE',label:'Synthetic public report',aliases:[],attributes:[{field:'URL',value:'https://example.invalid/research/synthetic-report',sourceType:'CASE_EVIDENCE',sourceIdentifier:'evidence-source',confidence:'LOW'}],confidence:'LOW',status:'UNVERIFIED'}
        ],relationships:[
            {id:'rel-1',fromId:'entity-org',toId:'entity-domain',type:'USES_DOMAIN',confidence:'MEDIUM',status:'CONSISTENT',evidence:[{summary:'Synthetic bounded evidence',sourceType:'CASE_EVIDENCE'}],contradictions:[]},
            {id:'rel-2',fromId:'entity-org',toId:'entity-location',type:'ASSOCIATED_WITH',confidence:'LOW',status:'INCONSISTENT',evidence:[{summary:'Synthetic contrasting observation',sourceType:'CASE_EVIDENCE'}],contradictions:['Synthetic contradiction remains unresolved for review.']},
            {id:'rel-3',fromId:'entity-source',toId:'entity-domain',type:'MENTIONS',confidence:'LOW',status:'PARTIALLY_RESOLVED',evidence:[{summary:'Synthetic document field',sourceType:'SOURCE_METADATA'}],contradictions:[]}
        ]});
        manager.osintCaseState = {mode:'OVERVIEW',loaded:true,loading:false,activeCaseId:caseId,cases:[{id:caseId,title:'Synthetic Phase 11 investigation — public-safe validation only',status:'OPEN',priority:'HIGH',evidenceCount:evidence.length,tags:['synthetic','phase11']}],lastError:null,activeCase:{case:{id:caseId,title:'Synthetic Phase 11 investigation — public-safe validation only',status:'OPEN',priority:'HIGH',updatedAt:now,tags:['synthetic','phase11']},evidence,notes:[{id:'note-1',text:'Synthetic note used only for visual validation.'}],timeline:[{type:'EVIDENCE_CREATED',summary:'Synthetic evidence promoted through the validated local model.',timestamp:now},{type:'RELATIONSHIP_REVIEWED',summary:'Synthetic contradiction remains unresolved.',timestamp:now}]}};
        manager.osintGeoState = {mode:'CATALOG',input:'',phase:'IDLE',verification:null,selectedCandidateIndex:0,activeRequestId:null,lastError:null,investigatorNote:'',investigatorAssessment:'INCONCLUSIVE',handoff:null};
        manager.osintMediaState = {mode:'CATALOG',phase:'IDLE',result:null,previewUrl:null,analystObservation:'',lastError:null,selectedFile:null};
        manager.osintDomainState = {mode:'CATALOG',input:'',phase:'IDLE',verification:null,activeRequestId:null,lastError:null,analystObservation:'',selectedPublicIp:''};
        manager.osintResearchState = {mode:'CATALOG',sourceKind:'URL',input:'',phase:'IDLE',context:null,activeRequestId:null,lastError:null,analystObservation:'',excerpt:'',excerptLocation:'',claimRelationship:'UNKNOWN',selectedFile:null};
        manager.updateOSINTInvestigationContext({activeCaseId:caseId,selectedObjectId:null,selectedObjectType:'UNKNOWN',originatingCapability:null,provenance:null});
        document.documentElement.dataset.aegisAppearance = ${JSON.stringify(appearance)};
        return {caseId, now};
    })()`;
}

function scenarioExpression() {
    const encodedScenario = JSON.stringify(scenario);
    return `(() => {
        const manager = window.workspaceManager;
        const scenario = ${encodedScenario};
        const svg = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="100%" height="100%" fill="#132436"/><path d="M0 430L240 190 460 400 650 130 960 360" fill="none" stroke="#5fc7ff" stroke-width="7"/><circle cx="460" cy="400" r="18" fill="#9adfff"/><text x="48" y="72" fill="#bdeeff" font-family="monospace" font-size="34">SYNTHETIC MEDIA FIXTURE</text></svg>');
        if (scenario === 'case') manager.osintCaseState.mode = 'CASE';
        if (scenario === 'geo') {
            manager.osintCaseState.mode = 'CATALOG';
            const parsed = window.OSINTGeospatialVerification.parseInput('40.4168, -3.7038');
            const verification = window.OSINTGeospatialVerification.createVerification({parsed,provenance:'IMAGE_METADATA',providerObservations:[{providerId:'synthetic-geo',providerName:'Synthetic provider observation',type:'VALIDATION_FIXTURE',latitude:40.4168,longitude:-3.7038,displayName:'Synthetic validation location',country:'Synthetic',observedAt:'2026-08-09T12:00:00.000Z'}]});
            manager.osintGeoState = {mode:'GEO',input:'40.4168, -3.7038',phase:'COMPLETE',activeRequestId:null,lastError:null,selectedCandidateIndex:0,investigatorNote:'Synthetic analyst observation.',investigatorAssessment:'INCONCLUSIVE',handoff:null,verification};
        }
        if (scenario === 'media') {
            manager.osintCaseState.mode = 'CATALOG';
            manager.osintMediaState = {mode:'MEDIA',phase:'COMPLETE',previewUrl:svg,analystObservation:'Synthetic analyst observation that remains ephemeral until Add to Case.',lastError:null,selectedFile:{name:'synthetic-validation.png',type:'image/png',size:4096},result:{status:'METADATA_AVAILABLE',confidence:'MEDIUM',file:{displayLabel:'synthetic-validation.png',mediaType:'image/png',byteSize:4096},image:{width:960,height:540,aspectRatio:'1.778',orientation:'NORMAL',hasAlpha:false,colorProfile:'sRGB'},exif:{captureTimestamp:'2026-08-09T12:00:00',timezoneStatus:'TIMEZONE UNKNOWN',cameraMake:'SYNTHETIC',cameraModel:'VALIDATION'},geo:{latitude:40.4168,longitude:-3.7038,altitudeM:null,directionDegrees:null,source:'IMAGE METADATA'},software:{tag:'Synthetic local fixture'},integrity:{originalMediaHash:'a'.repeat(64),scope:'ORIGINAL_SUPPLIED_BYTES'},warnings:[{code:'METADATA_CONTEXTUAL',message:'Synthetic metadata remains contextual evidence only.'}]}};
        }
        if (scenario === 'domain') {
            manager.osintCaseState.mode = 'CATALOG';
            const target = window.OSINTDomainInfrastructure.normalizeInput('example.invalid');
            manager.osintDomainState = {mode:'DOMAIN',input:'example.invalid',phase:'COMPLETE',activeRequestId:null,lastError:null,analystObservation:'Synthetic passive context observation.',selectedPublicIp:'',verification:window.OSINTDomainInfrastructure.createVerification({target,dns:{records:[{type:'A',values:['203.0.113.10'],status:'OBSERVED'},{type:'AAAA',values:['2001:db8::10'],status:'OBSERVED'},{type:'MX',values:['mail.example.invalid'],status:'OBSERVED'},{type:'TXT',values:['synthetic bounded TXT record'],status:'OBSERVED'}]},registration:{registrar:'NOT RETURNED',status:'UNAVAILABLE'},providerObservations:[{providerId:'google-public-dns',providerName:'Synthetic fixed provider fixture',type:'PUBLIC_DNS',observedAt:'2026-08-09T12:00:00.000Z',summary:'Synthetic bounded record set'}],analystObservation:'Synthetic passive context observation.'})};
        }
        if (scenario === 'source') {
            manager.osintCaseState.mode = 'CATALOG';
            const source = window.OSINTResearchSourceVerification.normalizeUrl('https://example.invalid/research/synthetic-report');
            manager.osintResearchState = {mode:'SOURCE',sourceKind:'URL',input:source.normalizedUrl,phase:'COMPLETE',activeRequestId:null,lastError:null,analystObservation:'Synthetic analyst note.',excerpt:'Synthetic short excerpt retained only to validate bounded Evidence controls.',excerptLocation:'p. 4 · §2',claimRelationship:'CONTEXT',selectedFile:null,context:window.OSINTResearchSourceVerification.createSourceContext({source,metadata:{title:'Synthetic source title for public-safe visual validation',publisher:'Synthetic Validation Publisher',authors:['Synthetic Analyst A','Synthetic Analyst B'],publishedAt:'2026-08-09',updatedAt:'2026-08-09',container:'Synthetic Journal',workType:'report'},providerObservations:[{providerId:'synthetic-source',providerName:'Synthetic normalized source',type:'VALIDATION_FIXTURE',observedAt:'2026-08-09T12:00:00.000Z',summary:'Synthetic metadata fixture'}],analystObservation:'Synthetic analyst note.',excerpt:'Synthetic short excerpt retained only to validate bounded Evidence controls.',excerptLocation:'p. 4 · §2',claimRelationship:'CONTEXT',status:'METADATA_AVAILABLE'})};
        }
        if (scenario === 'entity') { manager.osintCaseState.mode = 'CATALOG'; manager.osintEntityState = {...manager.osintEntityState,mode:'ENTITY',selectedEntityId:'entity-org',analystNote:'Synthetic analyst note.'}; }
        if (scenario === 'evidence') {
            manager.osintCaseState.mode = 'CASE';
            manager.osintLastNormalizedResults = manager.osintLastNormalizedResults || {};
            manager.osintLastNormalizedResults['google-public-dns'] = Object.freeze({requestId:'synthetic-phase11-preview',providerId:'google-public-dns',capability:'INFRASTRUCTURE_CONTEXT',status:'SUCCESS',queriedAt:'2026-08-09T12:00:00.000Z',completedAt:'2026-08-09T12:00:00.000Z',durationMs:0,summary:'Synthetic bounded provider observation for Evidence Preview validation.',data:{infrastructure:{normalizedTarget:'example.invalid',targetType:'DOMAIN',dns:{records:[]}},provider:'Synthetic provider fixture'},warnings:[],source:{provider:'Synthetic provider fixture',type:'NORMALIZED_PASSIVE_OBSERVATIONS'},confidence:'MEDIUM',rawAvailable:false,error:null});
        }
        manager.renderOSINTState();
        if (scenario === 'evidence') manager.openOSINTEvidencePreview('case-phase11-synthetic','google-public-dns');
        return true;
    })()`;
}

async function main() {
    const socket = await connect();
    try {
        await command(socket, "Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: scale, mobile: false});
        await evaluate(socket, fixtureExpression());
        await evaluate(socket, scenarioExpression());
        await delay(260);
        const report = await evaluate(socket, `(() => {
            const root = document.querySelector('[data-workspace="osint"]:not(.workspace-is-hidden) .workspace-grid');
            const dialog = document.querySelector('.osint-case-dialog');
            const scope = ${JSON.stringify(scenario)} === 'evidence' ? dialog : root;
            if (!scope) return {available:false, reason:'missing workspace scope'};
            const box = scope.getBoundingClientRect();
            const panels = [...scope.querySelectorAll('.workspace-panel')];
            const controls = [...scope.querySelectorAll('button,input,textarea,select')].filter(item => !item.disabled);
            const rect = item => item.getBoundingClientRect();
            const overflow = panels.filter(panel => { const r = rect(panel); return r.width <= 0 || r.height <= 0 || r.left < box.left - 2 || r.right > box.right + 2; });
            const escapedControls = controls.filter(control => { const panel = control.closest('.workspace-panel, .osint-case-dialog'); if (!panel) return false; const r = rect(control), p = rect(panel); return r.left < p.left - 2 || r.right > p.right + 2 || r.top < p.top - 2 || r.bottom > p.bottom + 2; });
            const horizontalOverflow = scope.scrollWidth > scope.clientWidth + 3;
            const key = ${JSON.stringify(scenario)} === 'evidence' ? document.querySelector('[data-osint-evidence-preview-form]') : scope.querySelector('h2');
            return {available:Boolean(key), panels:panels.length, controls:controls.length, overflow:overflow.length, escapedControls:escapedControls.length, horizontalOverflow, viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, scope:{width:box.width,height:box.height}};
        })()`);
        console.log(`PHASE11_LIVE_SCENARIO: ${scenario}`);
        console.log(`PHASE11_LIVE_AVAILABLE: ${report && report.available ? 'OK' : 'FAIL'}`);
        console.log(`PHASE11_LIVE_LAYOUT: ${report && report.overflow === 0 && report.escapedControls === 0 && !report.horizontalOverflow ? 'OK' : 'FAIL'} ${JSON.stringify(report)}`);
        if (screenshotPath) {
            const bounds = await evaluate(socket, `(() => { const element = ${JSON.stringify(scenario)} === 'evidence' ? document.querySelector('.osint-case-dialog') : document.querySelector('[data-workspace="osint"]:not(.workspace-is-hidden) .workspace-grid'); if (!element) return null; const r = element.getBoundingClientRect(); return {x:Math.max(0,r.left),y:Math.max(0,r.top),width:Math.max(1,r.width),height:Math.max(1,r.height)}; })()`);
            const capture = await command(socket, "Page.captureScreenshot", {format:"png",captureBeyondViewport:false,clip:{...bounds,scale:1}});
            fs.writeFileSync(screenshotPath, Buffer.from(capture.data, "base64"));
            console.log(`PHASE11_LIVE_SCREENSHOT: ${screenshotPath}`);
        }
        if (!report || !report.available || report.overflow || report.escapedControls || report.horizontalOverflow) process.exitCode = 1;
    } finally { socket.close(); }
}

main().catch(error => { console.error(`PHASE11_LIVE: FAIL ${error.message}`); process.exitCode = 1; });

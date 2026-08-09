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
    await evaluate(socket, `(() => {
        window.workspaceManager?.closeEngineeringDetail?.();
        window.engineeringDashboard?.projectsPanel?.closeEditor?.();
        document.getElementById('eng_map_settings_close')?.click();
        document.querySelector('.osint-detail-close')?.click();
        document.querySelector('[data-osint-case-dialog-close]')?.click();
        window.assistantPresence?.panel?.closeExpandedChat?.();
        return true;
    })()`);
    await delay(120);
    if (target === "eng-detail") {
        await evaluate(socket, `(() => {
            window.workspaceManager.activate('engineer', false);
            window.workspaceManager.openEngineeringToolById('gear-ratio');
            return Boolean(document.querySelector('.eng-detail-overlay.visible .eng-detail-panel'));
        })()`);
        return;
    }
    if (target === "project-control") {
        await evaluate(socket, `(() => {
            window.workspaceManager.activate('hub', false);
            window.engineeringDashboard?.projectsPanel?.openEditor();
            return Boolean(document.getElementById('eng_project_editor'));
        })()`);
        return;
    }
    if (target === "map-settings") {
        await evaluate(socket, `(() => {
            window.workspaceManager.activate('hub', false);
            document.getElementById('eng_map_settings')?.click();
            return Boolean(document.getElementById('eng_map_settings_modal'));
        })()`);
        return;
    }
    if (target === "osint-tool") {
        await evaluate(socket, `(() => {
            window.workspaceManager.activate('osint', false);
            document.querySelector('.osint-tool-card')?.click();
            return Boolean(document.querySelector('.osint-detail-overlay.visible .osint-detail-panel'));
        })()`);
        return;
    }
    if (target === "geo" || target === "geo-stress" || target === "geo-provider" || target === "geo-evidence") {
        await evaluate(socket, `(() => {
            window.workspaceManager.activate('osint', false);
            window.workspaceManager.osintGeoState.mode = 'GEO';
            window.workspaceManager.osintGeoState.input = 'London';
            if (${JSON.stringify(target)} === 'geo-stress') {
                const Geo = window.OSINTGeospatialVerification;
                const parsed = Geo.parseInput('51.5074, -0.1278');
                const providerObservation = {
                    providerId: 'open-meteo-geocoding',
                    providerName: 'Open-Meteo Geocoding — a deliberately long provider label for layout verification',
                    latitude: 51.5074,
                    longitude: -0.1278,
                    observedAt: '2026-08-09T12:00:00.000Z'
                };
                const investigatorObservation = {
                    providerId: 'investigator',
                    providerName: 'Investigator observation',
                    latitude: 51.526,
                    longitude: -0.151,
                    observedAt: '2026-08-09T12:01:00.000Z',
                    note: 'A deliberately long but legitimate investigator note confirms that long analytical content wraps without colliding with nearby controls.'
                };
                window.workspaceManager.osintGeoState.input = '51.5074, -0.1278';
                window.workspaceManager.osintGeoState.verification = Geo.createVerification({
                    parsed,
                    providerObservations: [providerObservation],
                    investigatorObservations: [investigatorObservation]
                });
                window.workspaceManager.osintGeoState.providerResult = {data: {geoCandidates: [{
                    displayName: 'London, Greater London, England, United Kingdom',
                    locality: 'London', region: 'Greater London', country: 'United Kingdom', countryCode: 'GB',
                    latitude: 51.5074, longitude: -0.1278, elevationM: 14
                }]}};
            }
            window.workspaceManager.renderOSINTState();
            if (${JSON.stringify(target)} === 'geo-provider' || ${JSON.stringify(target)} === 'geo-evidence') {
                return window.workspaceManager.beginOSINTGeoVerification().then(async () => {
                    if (${JSON.stringify(target)} === 'geo-evidence') {
                        const manager = window.workspaceManager;
                        const created = await manager.ipc.invoke('osint-case-create', {
                            title: 'Disposable Geo validation case',
                            description: 'Temporary local visual-validation fixture only.',
                            priority: 'LOW', tags: 'geo, validation'
                        });
                        if (!created || !created.ok) throw new Error('Geo validation case fixture unavailable');
                        await manager.refreshOSINTCases({render: false});
                        await manager.openOSINTCaseById(created.case.id, {render: false, silent: true});
                        manager.promoteOSINTGeoEvidence(document.body);
                    }
                    return Boolean(document.querySelector('.osint-geo-header'));
                });
            }
            return Boolean(document.querySelector('.osint-geo-header'));
        })()`);
        return;
    }
    if (target === "media" || target === "media-rich" || target === "media-no-metadata" || target === "media-evidence" || target === "media-file") {
        await evaluate(socket, `(() => {
            window.workspaceManager.activate('osint', false);
            if (${JSON.stringify(target)} === 'media-file') {
                const manager = window.workspaceManager;
                manager.osintCaseState = {...manager.osintCaseState, mode: 'CATALOG'};
                manager.osintGeoState = {...manager.osintGeoState, mode: 'CATALOG'};
                manager.osintMediaState = {...manager.osintMediaState, mode: 'MEDIA', phase: 'IDLE', result: null, previewUrl: null, analystObservation: '', lastError: null, selectedFile: null};
                const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0XQAAAABJRU5ErkJggg=='), value => value.charCodeAt(0));
                return manager.inspectOSINTMediaFile(new File([bytes], 'synthetic-preview.png', {type: 'image/png'})).then(() => {
                    const image = document.querySelector('.osint-media-preview img');
                    return Boolean(image && image.complete && image.naturalWidth > 0);
                });
            }
            const rich = ['media-rich', 'media-evidence'].includes(${JSON.stringify(target)});
            const result = {
                capability: 'VISUAL_MEDIA_VERIFICATION',
                status: rich ? 'METADATA_AVAILABLE' : 'NO_METADATA',
                confidence: 'LOW',
                file: {displayLabel: rich ? 'synthetic-gps-validation.jpg' : 'synthetic-no-metadata.png', mediaType: rich ? 'image/jpeg' : 'image/png', byteSize: rich ? 184320 : 4096},
                image: {width: rich ? 1600 : 480, height: rich ? 900 : 1600, aspectRatio: rich ? 1.77778 : .3, orientation: 1, colorProfile: 'UNKNOWN', hasAlpha: !rich},
                exif: {captureTimestamp: rich ? '2026:08:09 10:11:12' : null, normalizedTimestamp: rich ? '2026-08-09T10:11:12' : null, timezoneStatus: rich ? 'UNKNOWN' : 'ABSENT', cameraMake: rich ? 'Synthetic Camera' : null, cameraModel: rich ? 'Validation Model' : null, lens: rich ? '50 mm validation lens' : null},
                geo: rich ? {latitude: 51.5074, longitude: -0.1278, altitudeM: 25, directionDegrees: 180, source: 'IMAGE_METADATA'} : null,
                software: {tag: rich ? 'Synthetic validation editor tag' : null},
                integrity: {originalMediaHash: 'a'.repeat(64), algorithm: 'SHA-256', scope: 'ORIGINAL_SUPPLIED_BYTES'},
                warnings: rich ? ['GPS metadata is present; it is not independently verified until explicit Geo verification.', 'Editing software metadata is present; this is neutral metadata context.'] : ['No software tag is not proof that the image is original.', 'No GPS metadata is available from this supplied file.']
            };
            window.workspaceManager.osintCaseState = {...window.workspaceManager.osintCaseState, mode: 'CATALOG'};
            window.workspaceManager.osintGeoState = {...window.workspaceManager.osintGeoState, mode: 'CATALOG'};
            window.workspaceManager.osintMediaState = {mode: 'MEDIA', phase: 'COMPLETE', result, previewUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"%3E%3Crect width="100%25" height="100%25" fill="%23121d2a"/%3E%3Cpath d="M0 700 L500 250 L900 620 L1200 340 L1600 720" stroke="%233ba7ff" stroke-width="18" fill="none"/%3E%3C/svg%3E', analystObservation: 'Synthetic validation note with deliberately long but non-private text to verify normal wrapping inside the observation surface.', lastError: null, selectedFile: null};
            window.workspaceManager.renderOSINTState();
            if (${JSON.stringify(target)} !== 'media-evidence') return Boolean(document.querySelector('.osint-media-header'));
            const manager = window.workspaceManager;
            return manager.ipc.invoke('osint-case-create', {title: 'Disposable media validation case', description: 'Synthetic local visual-validation fixture only.', priority: 'LOW', tags: 'media, validation'}).then(async created => {
                if (!created || !created.ok) throw new Error('Media validation case fixture unavailable');
                await manager.refreshOSINTCases({render: false});
                await manager.openOSINTCaseById(created.case.id, {render: false, silent: true});
                manager.promoteOSINTMediaEvidence(document.body);
                return Boolean(document.querySelector('.osint-case-dialog'));
            });
        })()`);
        return;
    }
    if (target === "assistant-expanded") {
        await evaluate(socket, `(() => {
            window.assistantPresence?.panel?.setOpen(true);
            document.querySelector('[data-action="expand-chat"]')?.click();
            return Boolean(document.querySelector('.assistant-chat-overlay.visible .assistant-chat-expanded'));
        })()`);
        return;
    }
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
            const geoHeader = document.querySelector('.osint-geo-header');
            const geoInput = document.querySelector('[data-osint-geo-input]');
            const geoResult = document.querySelector('.osint-geo-result');
            const geoObservation = document.querySelector('.osint-geo-observation');
            const mediaHeader = document.querySelector('.osint-media-header');
            const mediaInput = document.querySelector('.osint-media-input');
            const mediaPreview = document.querySelector('.osint-media-preview');
            const mediaMetadata = document.querySelector('.osint-media-metadata');
            const mediaObservation = document.querySelector('.osint-media-observation');
            const mediaMetadataContent = mediaMetadata && mediaMetadata.querySelector('.workspace-panel-content');
            const mediaAssessment = mediaMetadata && mediaMetadata.querySelector('.osint-media-warnings');
            const evidenceDialog = document.querySelector('.osint-case-dialog-overlay.visible .osint-case-dialog');
            const evidenceDetailRoot = evidenceDialog && evidenceDialog.querySelector('.osint-evidence-detail');
            const popup = document.querySelector(
                '.eng-detail-overlay.visible .eng-detail-panel, '
                + '#eng_project_editor_overlay #eng_project_editor, '
                + '#eng_map_settings_overlay #eng_map_settings_modal, '
                + '.osint-detail-overlay.visible .osint-detail-panel, '
                + '.assistant-chat-overlay.visible .assistant-chat-expanded'
            );
            const report = {
                target: ${JSON.stringify(surface)},
                appearance: root.dataset.aegisAppearance,
                preference: root.dataset.aegisAppearancePreference,
                bodyBackground: style.backgroundColor,
                bodyColor: style.color,
                viewport: {width: innerWidth, height: innerHeight, dpr: devicePixelRatio},
                workspace: window.workspaceManager && window.workspaceManager.activeId,
                mediaGrid: document.querySelector('.osint-command-grid:has(.osint-media-header)') ? getComputedStyle(document.querySelector('.osint-command-grid:has(.osint-media-header)')).gridTemplateRows : null,
                geo: geoHeader && geoInput && geoResult && geoObservation ? {header: rect(geoHeader), input: rect(geoInput), result: rect(geoResult), observation: rect(geoObservation)} : null,
                media: mediaHeader && mediaInput && mediaPreview && mediaMetadata && mediaObservation ? {header: rect(mediaHeader), input: rect(mediaInput), preview: rect(mediaPreview), metadata: rect(mediaMetadata), metadataContent: rect(mediaMetadataContent), assessment: rect(mediaAssessment), observation: rect(mediaObservation), image: rect(mediaPreview.querySelector('img')), action: rect(mediaMetadata.querySelector('footer'))} : null,
                activeCase: active ? {
                    title: rect(active.querySelector('h2')),
                    status: rect(active.querySelector('.osint-case-status')),
                    metadata: rect(active.querySelector('.osint-case-metadata')),
                    actions: rect(active.querySelector('footer'))
                } : null,
                evidenceDetail: evidenceDetailRoot ? {
                    dialog: rect(evidenceDialog),
                    context: rect(evidenceDialog.querySelector(':scope > header')),
                    title: rect(evidenceDetailRoot.querySelector('.osint-evidence-detail-header')),
                    metadata: rect(evidenceDetailRoot.querySelector('.osint-detail-readout')),
                    actions: rect(evidenceDetailRoot.querySelector('.osint-evidence-detail-actions'))
                } : null,
                popup: popup ? rect(popup) : null,
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
            report.popupFlow = !report.popup || (report.popup.width > 0 && report.popup.height > 0
                && report.popup.left >= -1 && report.popup.top >= -1
                && report.popup.right <= innerWidth + 1 && report.popup.bottom <= innerHeight + 1);
            report.geoAvailable = !['geo', 'geo-stress', 'geo-provider', 'geo-evidence'].includes(report.target) || Boolean(report.geo);
            report.geoFlow = report.target === 'geo-evidence'
                ? Boolean(report.popup)
                : report.geoAvailable && (!report.geo || (!intersect(report.geo.header, report.geo.input)
                && !intersect(report.geo.header, report.geo.result)
                && !intersect(report.geo.result, report.geo.observation)
                && visible(geoInput)));
            report.mediaAvailable = !['media', 'media-rich', 'media-no-metadata', 'media-evidence', 'media-file'].includes(report.target) || Boolean(report.media);
            report.mediaFlow = report.target === 'media-evidence'
                ? Boolean(report.popup)
                : report.mediaAvailable && (!report.media || (!intersect(report.media.header, report.media.input)
                && !intersect(report.media.header, report.media.preview)
                && !intersect(report.media.preview, report.media.metadata)
                && !intersect(report.media.metadata, report.media.observation)
                && visible(mediaInput) && visible(mediaPreview.querySelector('img')) && visible(mediaMetadata.querySelector('footer'))
                && (!report.media.assessment || (!intersect(report.media.assessment, report.media.action)
                    && report.media.assessment.top >= report.media.metadataContent.top - 1
                    && report.media.assessment.bottom <= report.media.metadataContent.bottom + 1))));
            return report;
        })()`);
        failures.push(!print("LIVE_THEME_APPEARANCE", report.appearance === expectedAppearance && report.preference === appearance, JSON.stringify({appearance: report.appearance, preference: report.preference, expectedAppearance, expectedPreference: appearance})));
        failures.push(!print("LIVE_THEME_CONTROL_VISIBLE", report.controlVisible));
        failures.push(!print("LIVE_THEME_CASE_FLOW", report.activeFlow));
        failures.push(!print("LIVE_THEME_EVIDENCE_FLOW", report.evidenceFlow));
        failures.push(!print("LIVE_THEME_POPUP_FLOW", report.popupFlow, report.popup ? JSON.stringify(report.popup) : ""));
        failures.push(!print("LIVE_THEME_GEO_FLOW", report.geoFlow));
        failures.push(!print("LIVE_THEME_MEDIA_FLOW", report.mediaFlow));
        console.log(`LIVE_THEME_VIEWPORT: ${JSON.stringify(report.viewport)}`);
        console.log(`LIVE_THEME_SURFACE: ${surface}`);
        if (report.media) console.log(`LIVE_THEME_MEDIA: ${JSON.stringify(report.media)}`);
        if (report.mediaGrid) console.log(`LIVE_THEME_MEDIA_GRID: ${report.mediaGrid}`);
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
                    const view = document.querySelector('.osint-command-grid') || document.getElementById('workspace_views');
                    const rect = view && view.getBoundingClientRect();
                    return rect ? {
                        x: Math.max(0, rect.left),
                        y: Math.max(0, rect.top),
                        width: Math.max(1, rect.right - Math.max(0, rect.left)),
                        height: Math.max(1, innerHeight - rect.top)
                    } : null;
                })()`);
                if (contentBounds) screenshotOptions.clip = {...contentBounds, scale: 1};
            }
            if (screenshotRegion === "dialog") {
                const dialogBounds = await evaluate(socket, `(() => {
                    const dialog = document.querySelector('.osint-case-dialog-overlay.visible .osint-case-dialog');
                    const rect = dialog && dialog.getBoundingClientRect();
                    return rect ? {x: rect.left, y: rect.top, width: rect.width, height: rect.height} : null;
                })()`);
                if (dialogBounds) screenshotOptions.clip = {...dialogBounds, scale: 1};
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

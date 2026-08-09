#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const Media = require(path.join(ROOT, "src/classes/workspaces/osintVisualMediaVerification.class.js"));
const Model = require(path.join(ROOT, "src/classes/workspaces/osintCaseModel.class.js"));
const Geo = require(path.join(ROOT, "src/classes/workspaces/osintGeospatialVerification.class.js"));
const Registry = require(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"));
const ui = fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "src/assets/css/workspaces.css"), "utf8");

const failures = [];
function check(key, condition, detail = "OK") {
    console.log(`${key}: ${condition ? detail : "FAIL"}`);
    if (!condition) failures.push(`${key} · ${detail}`);
}

function minimalPng(width = 4, height = 3) {
    const bytes = Buffer.alloc(8 + 12 + 13 + 12);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
    bytes.writeUInt32BE(13, 8);
    bytes.write("IHDR", 12, "ascii");
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    bytes[24] = 8; bytes[25] = 2;
    bytes.writeUInt32BE(0, 33);
    bytes.write("IEND", 37, "ascii");
    return bytes;
}

function minimalJpegWithExif() {
    const tiff = Buffer.alloc(370);
    tiff.write("II", 0, "ascii"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
    const entry = (offset, tag, type, count, value) => {
        tiff.writeUInt16LE(tag, offset); tiff.writeUInt16LE(type, offset + 2); tiff.writeUInt32LE(count, offset + 4);
        if (type === 3 && count === 1) tiff.writeUInt16LE(value, offset + 8);
        else tiff.writeUInt32LE(value, offset + 8);
    };
    tiff.writeUInt16LE(6, 8);
    entry(10, 0x0112, 3, 1, 1);
    entry(22, 0x010f, 2, 6, 100);
    entry(34, 0x0110, 2, 8, 108);
    entry(46, 0x0131, 2, 10, 116);
    entry(58, 0x8769, 4, 1, 140);
    entry(70, 0x8825, 4, 1, 205);
    tiff.writeUInt32LE(0, 82);
    tiff.write("Canon\0", 100, "ascii");
    tiff.write("EOS R\0", 108, "ascii");
    tiff.write("EditorX\0", 116, "ascii");
    tiff.writeUInt16LE(5, 140);
    entry(142, 0x9003, 2, 20, 270);
    entry(154, 0x920a, 5, 1, 290);
    entry(166, 0x829d, 5, 1, 298);
    entry(178, 0x8827, 3, 1, 200);
    entry(190, 0x9209, 3, 1, 0);
    tiff.writeUInt32LE(0, 202);
    tiff.writeUInt16LE(4, 205);
    entry(207, 1, 2, 2, 0); tiff.write("N\0", 215, "ascii");
    entry(219, 2, 5, 3, 306);
    entry(231, 3, 2, 2, 0); tiff.write("W\0", 239, "ascii");
    entry(243, 4, 5, 3, 330);
    tiff.writeUInt32LE(0, 255);
    tiff.write("2026:08:09 10:11:12\0", 270, "ascii");
    [[50, 1], [0, 1], [0, 1]].forEach((pair, index) => { tiff.writeUInt32LE(pair[0], 306 + index * 8); tiff.writeUInt32LE(pair[1], 310 + index * 8); });
    [[3, 1], [0, 1], [0, 1]].forEach((pair, index) => { tiff.writeUInt32LE(pair[0], 330 + index * 8); tiff.writeUInt32LE(pair[1], 334 + index * 8); });
    tiff.writeUInt32LE(50, 290); tiff.writeUInt32LE(1, 294);
    tiff.writeUInt32LE(28, 298); tiff.writeUInt32LE(10, 302);
    const appPayload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
    const app = Buffer.alloc(4); app[0] = 0xff; app[1] = 0xe1; app.writeUInt16BE(appPayload.length + 2, 2);
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x06, 0x00, 0x08, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00]);
    return Buffer.concat([Buffer.from([0xff, 0xd8]), app, appPayload, sof, Buffer.from([0xff, 0xd9])]);
}

async function expectError(input, code) {
    try { await Media.inspectMedia(input); return false; } catch (error) { return error && error.code === code; }
}

async function main() {
    const provider = Registry.getProvider("local-media-inspection");
    check("MEDIA_CAPABILITY_REGISTERED", provider && provider.capabilities.includes("VISUAL_MEDIA_VERIFICATION") && provider.accessMode === "LOCAL");
    check("MEDIA_SUPPORTED_FORMATS", Media.SUPPORTED_FORMATS.join(",") === "JPEG,PNG,WEBP");

    const png = minimalPng();
    const pngResult = await Media.inspectMedia({name: "no-metadata.png", type: "image/png", bytes: png});
    check("MEDIA_PNG_NO_EXIF", pngResult.status === "NO_METADATA" && pngResult.image.width === 4 && pngResult.image.height === 3);
    check("MEDIA_SHA256", pngResult.integrity.originalMediaHash === crypto.createHash("sha256").update(png).digest("hex"));
    check("MEDIA_NO_AUTHENTICITY_INFERENCE", pngResult.observations.some(item => /does not establish authenticity/i.test(item)) && !pngResult.warnings.some(item => /proved|authentic|original image/i.test(item)));

    const jpeg = minimalJpegWithExif();
    const jpegResult = await Media.inspectMedia({name: "capture.jpg", type: "image/jpeg", bytes: jpeg});
    check("MEDIA_JPEG_METADATA", jpegResult.status === "METADATA_AVAILABLE" && jpegResult.image.width === 8 && jpegResult.image.height === 6 && jpegResult.exif.cameraMake === "Canon");
    check("MEDIA_GPS_NORMALIZATION", jpegResult.geo && jpegResult.geo.latitude === 50 && jpegResult.geo.longitude === -3 && jpegResult.geo.source === "IMAGE_METADATA");
    check("MEDIA_TIMEZONE_UNKNOWN", jpegResult.exif.captureTimestamp === "2026:08:09 10:11:12" && jpegResult.exif.timezoneStatus === "UNKNOWN" && jpegResult.exif.normalizedTimestamp === "2026-08-09T10:11:12");
    check("MEDIA_SOFTWARE_NEUTRAL", jpegResult.software.tag === "EditorX" && jpegResult.warnings.some(item => /neutral metadata observation/i.test(item)));
    check("MEDIA_MALFORMED_REJECTED", await expectError({name: "broken.jpg", bytes: Buffer.from([0xff, 0xd8, 0xff])}, "INVALID_INPUT"));
    check("MEDIA_UNSUPPORTED_REJECTED", await expectError({name: "note.txt", bytes: Buffer.from("not an image")}, "UNSUPPORTED"));

    const mediaData = Media.toEvidenceData(jpegResult, "Analyst note kept distinct from extracted metadata.");
    const normalizedResult = {requestId: "media-test-1", providerId: provider.id, capability: "VISUAL_MEDIA_VERIFICATION", status: "SUCCESS", queriedAt: "2026-08-09T10:00:00.000Z", completedAt: "2026-08-09T10:00:01.000Z", durationMs: 1, summary: "Visual media inspection: capture.jpg.", data: mediaData, warnings: jpegResult.warnings, source: {provider: "Local media inspection", type: "EXPLICIT_LOCAL_FILE"}, confidence: "LOW", rawAvailable: false, error: null};
    const sanitized = Model.sanitizeNormalizedResult(normalizedResult);
    check("MEDIA_EVIDENCE_SANITIZED", sanitized.data.media && sanitized.data.media.originalMediaHash === jpegResult.integrity.originalMediaHash && sanitized.data.media.geo.latitude === 50);
    const evidence = Model.createProviderEvidence({caseId: "case-media123", normalizedResult, draft: {title: "Media metadata", summary: "Reviewed local image metadata.", tags: ["media"], redactions: ["data.media.displayLabel", "data.media.geo", "data.media.cameraMake", "data.media.analystObservation"]}});
    check("MEDIA_EVIDENCE_REDACTION", evidence.acquisitionMethod === "LOCAL_MEDIA_INSPECTION" && !Object.prototype.hasOwnProperty.call(evidence.data.media, "geo") && !Object.prototype.hasOwnProperty.call(evidence.data.media, "displayLabel") && /^[a-f0-9]{64}$/.test(evidence.integrity.value));
    check("MEDIA_NO_ORIGINAL_PERSISTENCE", !JSON.stringify(evidence).includes(jpeg.toString("base64")) && !Object.prototype.hasOwnProperty.call(evidence.data.media, "bytes"));

    const handoff = Geo.createVerification({parsed: Geo.parseInput({latitude: jpegResult.geo.latitude, longitude: jpegResult.geo.longitude}), provenance: "IMAGE_METADATA"});
    check("MEDIA_GEO_HANDOFF_PROVENANCE", handoff.provenance === "IMAGE_METADATA" && handoff.verificationStatus === "UNVERIFIED");
    const managerSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaceManager.class.js"), "utf8");
    const mediaModuleSource = fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintVisualMediaVerification.class.js"), "utf8");
    // Keep the no-auto-query assertion scoped to Media itself. Domain Context
    // legitimately owns a separate, user-initiated provider lifecycle below
    // this block and must not change the Media security invariant.
    const mediaManagerBlock = managerSource.match(/getOSINTVisualMediaModule[\s\S]*?getOSINTDomainInfrastructureModule/)?.[0] || "";
    check("MEDIA_NO_NEW_IPC", !/ipc\.invoke\(\s*["']osint-media-|ipcMain\.handle\(\s*["']osint-media-/.test(managerSource));
    check("MEDIA_NO_AUTOMATIC_GEO_QUERY", !/startQuery\(/.test(mediaManagerBlock));
    check("MEDIA_NO_GLOBAL_MAP_MUTATION", !/\b(?:mapManager|leaflet|\.flyTo\(|\.setView\(|map\.set)/i.test(mediaManagerBlock));
    check("MEDIA_NO_HIDDEN_PERSISTENCE", !/localStorage|sessionStorage|indexedDB|fs\.write|fetch\(/.test(mediaModuleSource));
    check("MEDIA_NO_RAW_METADATA_RENDERER", !/rawMetadata|EXIFTOOL|child_process|exec\(/.test(mediaModuleSource));
    check("MEDIA_UI_LOAD_ORDER", ui.includes("osintVisualMediaVerification.class.js") && ui.indexOf("osintVisualMediaVerification.class.js") < ui.indexOf("workspaceManager.class.js"));
    check("MEDIA_LAYOUT_NORMAL_FLOW", css.includes(".osint-command-grid:has(.osint-media-header)") && css.includes('"media-header media-header media-header"') && !/\.osint-media-header\s*\{[^}]*position:\s*absolute/s.test(css));
    check("MEDIA_LAYOUT_PREVIEW_BOUNDED", css.includes(".osint-media-preview img") && css.includes("max-width: 100%") && css.includes("object-fit: contain"));
    check("MEDIA_PREVIEW_BROWSER_SAFE", managerSource.includes("createOSINTMediaPreview(file)") && managerSource.includes("FileReader") && managerSource.includes("preview.onload") && !managerSource.includes("URL.createObjectURL(file)"));
    check("MEDIA_LAYOUT_LONG_CONTENT_SAFE", css.includes(".osint-media-readout-group strong") && css.includes("overflow-wrap: anywhere") && css.includes(".osint-media-metadata footer") && css.includes("flex-wrap: wrap"));
    check("MEDIA_ASSESSMENT_CONTAINED", css.includes(".osint-media-metadata .workspace-panel-content") && css.includes("grid-template-rows: max-content max-content max-content") && css.includes("overflow-y: auto") && css.includes("scrollbar-gutter: stable") && css.includes("grid-template-columns: repeat(4, minmax(0, 1fr))"));
    check("MEDIA_LAYOUT_COMPACT_FLOW", css.includes('"media-header"\n            "media-input"\n            "media-preview"\n            "media-metadata"'));

    console.log(`OSINT_VISUAL_MEDIA_VERIFICATION: ${failures.length ? "FAIL" : "OK"}`);
}

main().catch(error => { failures.push(error.stack || error.message); console.error(error.stack || error.message); }).finally(() => {
    if (failures.length) { failures.forEach(item => console.error(`- ${item}`)); process.exitCode = 1; }
});

"use strict";

// Phase 11 is deliberately editing/data-first. It does not embed Python,
// Jupyter, Node or a shell. Files reach this main-process runtime only through
// an explicit native picker, are copied into managed STUD storage, and are
// parsed under strict local bounds.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Model = require("./studAcademicModel.class.js");

const LIMITS = Object.freeze({datasetBytes: 8 * 1024 * 1024, rows: 20000, columns: 120, previewRows: 80, cellOutput: 12000, githubBytes: 2 * 1024 * 1024, timeoutMs: 12000});
const GITHUB_API = "https://api.github.com";

function fail(code, message, details = {}) { throw new Model.StudError(code, message, details); }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function safeName(value) { return String(value || "dataset").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "dataset"; }

function parseDelimited(text, delimiter) {
    const rows = []; let row = []; let value = ""; let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quoted) { if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; } else if (char === '"') quoted = false; else value += char; continue; }
        if (char === '"') { quoted = true; continue; }
        if (char === delimiter) { row.push(value); value = ""; continue; }
        if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; if (rows.length > LIMITS.rows + 1) fail("BOUNDS_EXCEEDED", `Dataset exceeds the local limit of ${LIMITS.rows} rows.`); continue; }
        value += char;
    }
    if (quoted) fail("MALFORMED_DATASET", "Dataset contains an unclosed quoted field.");
    if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
    return rows.filter(row => row.some(value => String(value).trim() !== ""));
}

function valuesSummary(values) {
    const numeric = values.map(value => Number(value)).filter(Number.isFinite);
    const missing = values.filter(value => String(value).trim() === "").length;
    if (numeric.length && numeric.length >= Math.ceil((values.length - missing) * 0.9)) {
        const sorted = [...numeric].sort((a, b) => a - b); const sum = numeric.reduce((total, value) => total + value, 0); const mean = sum / numeric.length;
        const variance = numeric.reduce((total, value) => total + ((value - mean) ** 2), 0) / numeric.length;
        return {type: "NUMBER", missing, count: numeric.length, minimum: Number(sorted[0].toPrecision(12)), maximum: Number(sorted[sorted.length - 1].toPrecision(12)), mean: Number(mean.toPrecision(12)), median: Number((numeric.length % 2 ? sorted[(numeric.length - 1) / 2] : (sorted[numeric.length / 2 - 1] + sorted[numeric.length / 2]) / 2).toPrecision(12)), standardDeviation: Number(Math.sqrt(variance).toPrecision(12))};
    }
    const counts = new Map(); values.filter(value => String(value).trim()).forEach(value => { const key = String(value).slice(0, 240); counts.set(key, (counts.get(key) || 0) + 1); });
    return {type: "TEXT", missing, distinct: counts.size, frequencies: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([value, count]) => ({value, count}))};
}

function inspectDataset(bytes, format) {
    const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
    if (text.includes("\0")) fail("UNSUPPORTED_DATASET", "Binary datasets are not supported.");
    const rows = parseDelimited(text, format === "TSV" ? "\t" : ",");
    if (rows.length < 2) fail("MALFORMED_DATASET", "Dataset requires a header row and at least one data row.");
    const headers = rows[0].map(value => String(value).trim());
    if (!headers.length || headers.length > LIMITS.columns || headers.some(value => !value || value.length > 160) || new Set(headers.map(value => value.toLocaleLowerCase())).size !== headers.length) fail("MALFORMED_DATASET", "Dataset headers must be unique, non-empty and within local bounds.");
    const data = rows.slice(1); if (data.some(row => row.length !== headers.length)) fail("MALFORMED_DATASET", "Every dataset row must match the header column count.");
    const columns = headers.map((name, index) => ({name, ...valuesSummary(data.map(row => row[index]))}));
    return Object.freeze({rowCount: data.length, columns: Object.freeze(columns), preview: Object.freeze(data.slice(0, LIMITS.previewRows).map(row => Object.freeze(row.map(value => String(value).slice(0, 500))))), summary: Object.freeze({rows: data.length, columns: columns.length, missingValues: columns.reduce((total, item) => total + item.missing, 0)}), rows: data});
}

function normalizeGitHub(input) {
    const raw = String(input || "").trim();
    const value = raw.replace(/^git\+/, "").replace(/\.git\/?$/i, "");
    const match = value.match(/^(?:https:\/\/github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})\/?$/);
    if (!match || /[@?#]/.test(value)) fail("INVALID_REPOSITORY", "Use a public GitHub owner/repository identifier or canonical https URL without credentials, query or fragment.");
    const owner = match[1]; const repository = match[2];
    return Object.freeze({provider: "GITHUB", owner, repository, canonicalUrl: `https://github.com/${owner}/${repository}`, title: `${owner}/${repository}`});
}

class StudNotebookRuntime {
    constructor(options = {}) { this.root = path.resolve(options.root || process.cwd()); this.dialog = options.dialog || null; this.fetch = options.fetch || global.fetch; this.controllers = new Map(); }
    capabilities() { return Object.freeze({notebook: {status: "EDITING_ONLY", execution: "NOT_INSTALLED", reason: "No Python, Jupyter, WASM runtime or shell is bundled in Phase 11."}, data: {status: "AVAILABLE", formats: ["CSV", "TSV"], localOnly: true, limits: LIMITS}, github: {status: "EXPLICIT_PUBLIC_READ_ONLY", provider: "GITHUB", authentication: "NOT_REQUIRED", fixedEndpoint: GITHUB_API}}); }
    cancel(requestId) { const controller = this.controllers.get(String(requestId || "")); if (controller) controller.abort(); return Object.freeze({cancelled: Boolean(controller)}); }
    dispose() { this.controllers.forEach(controller => controller.abort()); this.controllers.clear(); }
    async chooseAndImportDataset() {
        if (!this.dialog || typeof this.dialog.showOpenDialog !== "function") fail("FILE_DIALOG_UNAVAILABLE", "The explicit dataset selector is unavailable.");
        const result = await this.dialog.showOpenDialog({title: "Select local CSV or TSV dataset", properties: ["openFile"], filters: [{name: "Tabular data", extensions: ["csv", "tsv"]}]});
        if (result.canceled || !result.filePaths || !result.filePaths[0]) return Object.freeze({cancelled: true});
        return this.importDatasetFromPath(result.filePaths[0]);
    }
    importDatasetFromPath(filePath) {
        const absolute = path.resolve(filePath); const stat = fs.lstatSync(absolute);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > LIMITS.datasetBytes) fail("INVALID_DATASET", `Dataset must be a regular CSV/TSV file between 2 bytes and ${LIMITS.datasetBytes} bytes.`);
        const extension = path.extname(absolute).toLowerCase(); const format = extension === ".csv" ? "CSV" : extension === ".tsv" ? "TSV" : null;
        if (!format) fail("UNSUPPORTED_DATASET", "Only CSV and TSV datasets are supported.");
        const bytes = fs.readFileSync(absolute); const inspected = inspectDataset(bytes, format); const digest = sha256(bytes);
        const folder = path.join(this.root, "datasets"); fs.mkdirSync(folder, {recursive: true, mode: 0o700});
        const name = `${safeName(path.basename(absolute, extension))}_${digest.slice(0, 16)}${extension}`; const destination = path.join(folder, name);
        if (!fs.existsSync(destination)) fs.copyFileSync(absolute, destination, fs.constants.COPYFILE_EXCL);
        return Object.freeze({cancelled: false, title: path.basename(absolute, extension).slice(0, Model.LIMITS.title), format, reference: `datasets/${name}`, mimeType: format === "CSV" ? "text/csv" : "text/tab-separated-values", size: stat.size, sha256: digest, rowCount: inspected.rowCount, columns: inspected.columns, summary: inspected.summary, preview: inspected.preview});
    }
    readManagedDataset(reference) {
        const value = String(reference || ""); if (!/^datasets\/[a-z0-9._-]+_[a-f0-9]{16}\.(csv|tsv)$/i.test(value)) fail("POLICY_BLOCKED", "Only managed STUD CSV/TSV references can be read.");
        const absolute = path.resolve(this.root, value); if (!absolute.startsWith(`${this.root}${path.sep}`) || !fs.existsSync(absolute)) fail("DATASET_MISSING", "The managed local dataset is unavailable.");
        const format = path.extname(absolute).toLowerCase() === ".tsv" ? "TSV" : "CSV"; return inspectDataset(fs.readFileSync(absolute), format);
    }
    analyzeDataset(dataset, operation, input = {}) {
        const inspected = this.readManagedDataset(dataset.managedReference); const action = Model.enumValue(operation, ["SUMMARY", "FREQUENCIES", "PLOT"], "Dataset operation", "SUMMARY");
        const column = input.column ? String(input.column) : null; const source = column ? inspected.columns.find(item => item.name === column) : null;
        if (column && !source) fail("NOT_FOUND", "Selected dataset column does not exist.");
        if (action === "SUMMARY") return Object.freeze({status: "SUCCESS", datasetId: dataset.id, operation: action, result: {summary: inspected.summary, columns: inspected.columns}, provenance: {datasetId: dataset.id, operation: action, deterministic: true, offline: true}});
        if (!source) fail("INVALID_INPUT", "Select a dataset column for this analysis.");
        if (action === "FREQUENCIES") return Object.freeze({status: "SUCCESS", datasetId: dataset.id, operation: action, result: {column: source.name, type: source.type, frequencies: source.frequencies || [], message: source.type === "NUMBER" ? "Numeric columns use summary statistics; categorical frequencies are not inferred." : null}, provenance: {datasetId: dataset.id, operation: action, deterministic: true, offline: true}});
        const plotType = Model.enumValue(input.plotType, ["LINE", "SCATTER", "HISTOGRAM", "BAR"], "Dataset plot type", "HISTOGRAM");
        if (plotType === "HISTOGRAM" && source.type !== "NUMBER") fail("INCOMPATIBLE_DATA", "Histogram requires a numeric dataset column.");
        if (plotType === "BAR" && source.type !== "TEXT") fail("INCOMPATIBLE_DATA", "Bar chart requires a categorical dataset column.");
        const index = inspected.columns.findIndex(item => item.name === source.name);
        const values = inspected.rows.slice(0, 1000).map(row => row[index]);
        let points = [];
        if (plotType === "BAR") points = (source.frequencies || []).map(item => ({x: item.value, y: item.count}));
        else if (plotType === "HISTOGRAM") {
            const numeric = values.map(Number).filter(Number.isFinite); const minimum = Math.min(...numeric); const maximum = Math.max(...numeric); const buckets = Math.max(1, Math.min(12, Math.ceil(Math.sqrt(numeric.length)))); const span = Math.max(maximum - minimum, 1); const counts = Array.from({length: buckets}, () => 0);
            numeric.forEach(value => { counts[Math.min(buckets - 1, Math.floor(((value - minimum) / span) * buckets))] += 1; });
            points = counts.map((count, bucket) => ({x: Number((minimum + (bucket * span / buckets)).toPrecision(8)), y: count}));
        } else {
            const yColumn = String(input.yColumn || ""); const yIndex = inspected.columns.findIndex(item => item.name === yColumn); const ySource = inspected.columns[yIndex];
            if (!ySource || ySource.type !== "NUMBER" || source.type !== "NUMBER") fail("INCOMPATIBLE_DATA", "Line and scatter plots require explicit numeric X and Y columns.");
            points = inspected.rows.slice(0, 1000).map(row => ({x: Number(row[index]), y: Number(row[yIndex])})).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
            if (!points.length) fail("INSUFFICIENT_DATA", "The selected numeric columns do not have finite paired values.");
        }
        return Object.freeze({status: "SUCCESS", datasetId: dataset.id, operation: action, result: {plot: {type: plotType, title: String(input.title || `${dataset.title} · ${source.name}`).slice(0, 160), xLabel: String(input.xLabel || source.name).slice(0, 80), yLabel: String(input.yLabel || (plotType === "BAR" ? "Count" : plotType === "HISTOGRAM" ? "Frequency" : input.yColumn)).slice(0, 80), sourceColumn: source.name, summary: source, points}}, provenance: {datasetId: dataset.id, operation: action, parameters: {plotType, yColumn: input.yColumn || null}, deterministic: true, offline: true}});
    }
    async githubMetadata(input = {}) {
        const repository = normalizeGitHub(input.repository || `${input.owner || ""}/${input.name || ""}`); const requestId = Model.requiredText(input.requestId, "GitHub request ID", 100);
        if (typeof this.fetch !== "function") fail("OFFLINE", "Public GitHub metadata is unavailable; saved local references remain available.");
        this.cancel(requestId); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), LIMITS.timeoutMs); this.controllers.set(requestId, controller);
        try {
            const response = await this.fetch(`${GITHUB_API}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`, {method: "GET", redirect: "error", signal: controller.signal, headers: {Accept: "application/vnd.github+json", "User-Agent": "AegisUi-STUD/2.6"}});
            if (!response.ok) fail(response.status === 404 ? "NOT_FOUND" : response.status === 403 ? "RATE_LIMITED" : `HTTP_${response.status}`, `GitHub public metadata returned HTTP ${response.status}.`);
            const text = await response.text(); if (Buffer.byteLength(text, "utf8") > LIMITS.githubBytes) fail("RESPONSE_TOO_LARGE", "GitHub metadata exceeded the local response limit."); const raw = JSON.parse(text);
            return Object.freeze({...repository, selectedRef: raw.default_branch || null, commitSha: null, metadata: Object.freeze({description: raw.description || null, defaultBranch: raw.default_branch || null, license: raw.license && raw.license.spdx_id || null, visibility: raw.private ? "PRIVATE_UNSUPPORTED" : "PUBLIC", updatedAt: raw.updated_at || null, archived: Boolean(raw.archived), source: "GITHUB_PUBLIC_API"})});
        } catch (error) { if (controller.signal.aborted) fail("CANCELLED", "GitHub public metadata request was cancelled or timed out."); if (error instanceof Model.StudError) throw error; fail("OFFLINE", "GitHub public metadata is unavailable; saved local references remain available."); }
        finally { clearTimeout(timeout); this.controllers.delete(requestId); }
    }
}

module.exports = Object.freeze({StudNotebookRuntime, LIMITS, inspectDataset, normalizeGitHub});

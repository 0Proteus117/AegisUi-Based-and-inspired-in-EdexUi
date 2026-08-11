"use strict";

const COMPUTE_TOOLS = Object.freeze(["EQUATIONS", "UNITS", "NUMERICAL", "DATA", "PLOTS", "THERMODYNAMICS", "CONTROL_SYSTEMS"]);

function splitNumbers(value) {
    return String(value || "").split(/[\s,;]+/).filter(Boolean).map(item => Number(item));
}

class StudComputeWorkspace {
    constructor(options = {}) {
        this.request = options.request;
        this.escape = options.escape || (value => String(value || ""));
        this.showToast = options.showToast || (() => {});
        this.parent = options.parent || null;
        this.state = {tool: "EQUATIONS", capabilities: null, result: null, lastRequest: null, data: null, loading: false};
    }

    async initialize() { this.state.capabilities = await this.request("stud-compute-capabilities"); }
    async refresh() { if (!this.state.capabilities) await this.initialize(); }

    render() {
        const caps = this.state.capabilities || {};
        return `<section class="stud-compute-shell" aria-label="Engineering Compute local STEM workbench">
            <header class="stud-compute-intro workspace-panel"><div><small>STUD / ENGINEERING COMPUTE</small><h2>LOCAL STEM WORKBENCH</h2><p>Explicit, bounded calculations run locally. No cloud runtime, provider query, shell command or hidden academic save is available here.</p></div><div class="stud-compute-status"><small>CORE ENGINE</small><strong>${this.escape(caps.core ? caps.core.status : "CHECKING")}</strong><span>OFFLINE / TYPED</span></div></header>
            <nav class="stud-compute-tools" aria-label="Engineering compute tools">${COMPUTE_TOOLS.map(tool => `<button type="button" data-stud-compute-tool="${tool}" class="${this.state.tool === tool ? "active" : ""}">${tool.replace(/_/g, " ")}${["THERMODYNAMICS", "CONTROL_SYSTEMS"].includes(tool) ? `<small>${this.capabilityFor(tool, caps).status}</small>` : ""}</button>`).join("")}</nav>
            <div class="stud-compute-grid"><section class="workspace-panel stud-compute-input"><header><h2>${this.state.tool.replace(/_/g, " ")}</h2><span>EXPLICIT INPUT</span></header><div class="workspace-panel-content">${this.renderTool(caps)}</div></section>
            <section class="workspace-panel stud-compute-result"><header><h2>RESULT</h2><span>${this.state.result ? this.escape(this.state.result.status) : "IDLE"}</span></header><div class="workspace-panel-content">${this.renderResult()}</div></section></div>
            <section class="workspace-panel stud-compute-policy"><header><h2>LOCAL COMPUTE POLICY</h2><span>FAIL-CLOSED</span></header><div class="workspace-panel-content"><p>Only typed calculation requests reach the local engine. Original datasets stay in the selected browser file object; absolute paths, Aegis secrets, providers, filesystem scans, shell execution and network requests are unavailable.</p>${this.renderCapabilities(caps)}</div></section>
        </section>`;
    }

    capabilityFor(tool, caps = this.state.capabilities || {}) {
        if (tool === "THERMODYNAMICS") return caps.coolprop || {status: "NOT_INSTALLED"};
        if (tool === "CONTROL_SYSTEMS") return caps.pythonControl || {status: "NOT_INSTALLED"};
        return caps.core || {status: "CHECKING"};
    }

    renderCapabilities(caps) {
        return `<div class="stud-compute-capabilities">${[["SYMPY", caps.sympy], ["PINT", caps.pint], ["COOLPROP", caps.coolprop], ["PYTHON-CONTROL", caps.pythonControl]].map(([name, value]) => `<article><strong>${name}</strong><span>${this.escape(value && value.status || "UNAVAILABLE")}</span><small>${this.escape(value && value.reason || "")}</small></article>`).join("")}</div>`;
    }

    renderTool(caps) {
        if (["THERMODYNAMICS", "CONTROL_SYSTEMS"].includes(this.state.tool)) {
            const capability = this.capabilityFor(this.state.tool, caps);
            return `<div class="stud-compute-unavailable"><strong>${this.state.tool.replace(/_/g, " ")} · ${this.escape(capability.status)}</strong><p>${this.escape(capability.reason || "This optional local engine is unavailable.")}</p><small>There is no web fallback. Installable packs are intentionally deferred until they can be approved, packaged and validated independently.</small></div>`;
        }
        if (this.state.tool === "EQUATIONS") return `<form data-stud-compute-form="EQUATIONS" class="stud-compute-form"><label>OPERATION<select class="aegis-select" name="operation"><option>SIMPLIFY</option><option>SOLVE</option><option>SYSTEM</option><option>DIFFERENTIATE</option><option>INTEGRATE</option><option>SUBSTITUTE</option><option>MATRIX</option></select></label><label>EXPRESSION / EQUATION<textarea class="aegis-input" name="expression" maxlength="4000" placeholder="2*x^2 + 3*x - 5 = 0">2*x^2 + 3*x - 5 = 0</textarea></label><label>VARIABLE<input class="aegis-input" name="variable" maxlength="12" value="x"></label><label>SUBSTITUTION VALUE<input class="aegis-input" name="value" type="number" step="any" value="2"></label><label>SYSTEM EQUATIONS <small>one per line</small><textarea class="aegis-input" name="equations" placeholder="2*x+y=5&#10;x-y=1">2*x+y=5
x-y=1</textarea></label><label>SYSTEM VARIABLES <small>comma-separated</small><input class="aegis-input" name="variables" value="x,y"></label><label>MATRIX <small>JSON square matrix</small><textarea class="aegis-input" name="matrix">[[1,2],[3,4]]</textarea></label><button type="submit">CALCULATE LOCALLY</button><small class="stud-compute-hint">Bounded local algebra supports polynomials, linear systems and small matrices. Division, grouping and unbounded symbolic syntax are intentionally rejected.</small></form>`;
        if (this.state.tool === "UNITS") return `<form data-stud-compute-form="UNITS" class="stud-compute-form"><label>OPERATION<select class="aegis-select" name="operation"><option>CONVERT</option><option>ADD</option></select></label><label>VALUE<input class="aegis-input" name="value" type="number" step="any" value="2500"></label><label>FROM UNIT<input class="aegis-input" name="fromUnit" value="mm" maxlength="32"></label><label>TO UNIT<input class="aegis-input" name="toUnit" value="m" maxlength="32"></label><label>SECOND VALUE <small>ADD only</small><input class="aegis-input" name="otherValue" type="number" step="any" value="0"></label><label>SECOND UNIT <small>ADD only</small><input class="aegis-input" name="otherUnit" value="mm" maxlength="32"></label><button type="submit">CONVERT / VALIDATE</button><small class="stud-compute-hint">Supported local units include SI bases and common engineering-derived units: mm, km, h, N, Pa, kPa, MPa, bar, J, W, Hz, m/s and km/h.</small></form>`;
        if (this.state.tool === "NUMERICAL") return `<form data-stud-compute-form="NUMERICAL" class="stud-compute-form"><label>OPERATION<select class="aegis-select" name="operation"><option>STATISTICS</option><option>INTERPOLATE</option><option>ROOT</option><option>INTEGRATE</option><option>LINEAR_ALGEBRA</option></select></label><label>VALUES <small>comma-separated</small><textarea class="aegis-input" name="values">1, 2, 3, 4, 5</textarea></label><label>X VALUES<textarea class="aegis-input" name="x">0, 10, 20</textarea></label><label>Y VALUES<textarea class="aegis-input" name="y">0, 100, 400</textarea></label><label>AT / BOUNDS<input class="aegis-input" name="at" type="number" step="any" value="5"></label><label>EXPRESSION<input class="aegis-input" name="expression" value="x^2 - 4"></label><label>LOWER / UPPER<input class="aegis-input" name="lower" type="number" step="any" value="0"><input class="aegis-input" name="upper" type="number" step="any" value="2"></label><label>MATRIX JSON<textarea class="aegis-input" name="matrix">[[1,2],[3,4]]</textarea></label><label>VECTOR<input class="aegis-input" name="vector" value="2, 1"></label><button type="submit">RUN NUMERICAL METHOD</button></form>`;
        if (this.state.tool === "DATA") return `<form data-stud-compute-form="DATA" class="stud-compute-form"><label>LOCAL CSV / TSV <input class="aegis-input" data-stud-compute-file type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values"></label><div class="stud-compute-data-state">${this.state.data ? `${this.escape(this.state.data.columns.join(", "))} · ${this.state.data.rows} ROWS · SELECTED EXPLICITLY` : "NO DATASET SELECTED · CSV/TSV ONLY · 2 MB MAX / 10,000 ROWS"}</div><button type="submit"${this.state.data ? "" : " disabled"}>INSPECT LOCAL DATA</button><small class="stud-compute-hint">The file is parsed only in this renderer session. Its path is not sent to Aegis or stored in STUD.</small></form>`;
        return `<form data-stud-compute-form="PLOTS" class="stud-compute-form"><label>PLOT TYPE<select class="aegis-select" name="operation"><option>LINE</option><option>SCATTER</option><option>HISTOGRAM</option></select></label><label>TITLE<input class="aegis-input" name="title" value="Synthetic local engineering result" maxlength="160"></label><label>X LABEL<input class="aegis-input" name="xLabel" value="Distance (m)" maxlength="80"></label><label>Y LABEL<input class="aegis-input" name="yLabel" value="Force (N)" maxlength="80"></label><label>X VALUES<textarea class="aegis-input" name="x">0, 1, 2, 3, 4</textarea></label><label>Y VALUES<textarea class="aegis-input" name="y">0, 10, 40, 90, 160</textarea></label><label>HISTOGRAM VALUES<textarea class="aegis-input" name="values">1, 2, 2, 3, 3, 3, 4, 5</textarea></label><button type="submit">GENERATE LOCAL PLOT</button></form>`;
    }

    renderResult() {
        const result = this.state.result;
        if (!result) return `<div class="stud-empty-inline">SELECT A TOOL, PROVIDE EXPLICIT INPUT AND RUN A LOCAL CALCULATION. NOTHING IS SAVED AUTOMATICALLY.</div>`;
        if (result.status !== "SUCCESS") return `<div class="stud-compute-error" role="alert"><strong>${this.escape(result.code || "COMPUTE ERROR")}</strong><p>${this.escape(result.message || "The local calculation could not be completed.")}</p></div>`;
        const courseOptions = (this.parent && this.parent.state ? this.parent.state.courses : []).map(item => `<option value="${this.escape(item.id)}">${this.escape(item.code || item.shortName || item.title)}</option>`).join("");
        const assignmentOptions = (this.parent && this.parent.state ? this.parent.state.assignments : []).map(item => `<option value="${this.escape(item.id)}">${this.escape(item.title)}</option>`).join("");
        const notes = this.parent && this.parent.research && this.parent.research.state ? this.parent.research.state.notes || [] : [];
        const noteOptions = notes.map(item => `<option value="${this.escape(item.id)}">${this.escape(item.title)}</option>`).join("");
        return `<div class="stud-compute-result-body"><section><small>INPUT</small><pre>${this.escape(JSON.stringify(result.normalizedInput, null, 2))}</pre></section><section><small>RESULT</small><pre>${this.escape(JSON.stringify(result.result, null, 2))}</pre></section>${result.units ? `<section><small>UNITS</small><pre>${this.escape(JSON.stringify(result.units, null, 2))}</pre></section>` : ""}${result.plot ? this.renderPlot(result.plot) : ""}<section class="stud-compute-save"><h3>SAVE TO ACADEMIC CONTEXT</h3><p>Explicit persistence creates a canonical COMPUTE RESULT with local provenance. Existing Note content is appended only when you select it below.</p><form data-stud-compute-save><label>TITLE<input class="aegis-input" name="title" maxlength="240" value="${this.escape(`${result.tool.replace(/_/g, " ")} · ${result.operation}`)}"></label><label>COURSE<select class="aegis-select" name="courseId"><option value="">NO COURSE</option>${courseOptions}</select></label><label>ASSIGNMENT<select class="aegis-select" name="assignmentId"><option value="">NO ASSIGNMENT</option>${assignmentOptions}</select></label><label>NOTE <small>append explicit result</small><select class="aegis-select" name="noteId"><option value="">NO NOTE</option>${noteOptions}</select></label><button type="submit">SAVE LOCAL RESULT</button></form></section></div>`;
    }

    renderPlot(plot) {
        const values = plot.type === "HISTOGRAM" ? plot.values.map((value, index) => [index, value]) : plot.x.map((value, index) => [value, plot.y[index]]);
        const x = values.map(pair => pair[0]); const y = values.map(pair => pair[1]); const minX = Math.min(...x); const maxX = Math.max(...x); const minY = Math.min(...y); const maxY = Math.max(...y); const scale = (value, min, max, size, offset) => max === min ? offset + size / 2 : offset + (value - min) / (max - min) * size;
        const points = values.map(pair => `${scale(pair[0], minX, maxX, 280, 30).toFixed(1)},${(190 - scale(pair[1], minY, maxY, 140, 30)).toFixed(1)}`).join(" ");
        return `<section class="stud-compute-plot"><small>PLOT · ${this.escape(plot.type)}</small><svg viewBox="0 0 340 240" role="img" aria-label="${this.escape(plot.title)}"><path d="M30 20V190H320"/><polyline points="${points}" fill="none"/><text x="170" y="225">${this.escape(plot.xLabel)}</text><text x="4" y="18">${this.escape(plot.yLabel)}</text></svg><strong>${this.escape(plot.title)}</strong></section>`;
    }

    async handleClick(event) {
        const tool = event.target.closest("[data-stud-compute-tool]");
        if (!tool) return false;
        this.state.tool = tool.dataset.studComputeTool; this.state.result = null; this.parent.render(); return true;
    }

    async handleSubmit(event) {
        const form = event.target.closest("form[data-stud-compute-form], form[data-stud-compute-save]");
        if (!form) return false;
        event.preventDefault();
        try {
            if (form.hasAttribute("data-stud-compute-save")) {
                const context = Object.fromEntries(new FormData(form).entries()); Object.keys(context).forEach(key => { if (!context[key]) delete context[key]; });
                const saved = await this.request("stud-compute-save-result", {request: this.state.lastRequest, context});
                await this.parent.refresh(); this.showToast(this.parent.view, `COMPUTE RESULT SAVED · ${saved.id}`); return true;
            }
            const request = this.requestFromForm(form); this.state.lastRequest = request; this.state.loading = true;
            try { this.state.result = await this.request("stud-compute-run", request); } finally { this.state.loading = false; }
        } catch (error) { this.state.result = {status: "ERROR", code: error.code || "COMPUTE_ERROR", message: error.message || "Local calculation failed."}; }
        this.parent.render(); return true;
    }

    requestFromForm(form) {
        const value = Object.fromEntries(new FormData(form).entries()); const tool = form.dataset.studComputeForm;
        if (tool === "EQUATIONS") return {tool, operation: value.operation, input: {expression: value.expression, variable: value.variable, value: Number(value.value), equations: String(value.equations || "").split(/\r?\n/).filter(Boolean), variables: String(value.variables || "").split(",").map(item => item.trim()).filter(Boolean), matrix: JSON.parse(value.matrix)}};
        if (tool === "UNITS") return {tool, operation: value.operation, input: {value: Number(value.value), fromUnit: value.fromUnit, toUnit: value.toUnit, otherValue: Number(value.otherValue), otherUnit: value.otherUnit}};
        if (tool === "NUMERICAL") return {tool, operation: value.operation, input: {values: splitNumbers(value.values), x: splitNumbers(value.x), y: splitNumbers(value.y), at: Number(value.at), expression: value.expression, variable: "x", lower: Number(value.lower), upper: Number(value.upper), matrix: JSON.parse(value.matrix), vector: splitNumbers(value.vector)}};
        if (tool === "DATA") return {tool, operation: "SUMMARY", input: {columns: this.state.data.values}};
        return {tool, operation: value.operation, input: {title: value.title, xLabel: value.xLabel, yLabel: value.yLabel, x: splitNumbers(value.x), y: splitNumbers(value.y), values: splitNumbers(value.values)}};
    }

    async handleChange(event) {
        const input = event.target.closest("[data-stud-compute-file]"); if (!input || !input.files || !input.files[0]) return false;
        const file = input.files[0];
        try {
            if (file.size > 2 * 1024 * 1024) throw new Error("CSV/TSV is limited to 2 MB.");
            const raw = await file.text(); const rows = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
            if (rows.length < 2 || rows.length > 10001) throw new Error("CSV/TSV requires a header and at most 10,000 rows.");
            const separator = file.name.toLowerCase().endsWith(".tsv") ? "\t" : ","; const headers = rows[0].split(separator).map(item => item.trim());
            if (!headers.length || headers.length > 32 || headers.some(item => !item || item.length > 120) || new Set(headers).size !== headers.length) throw new Error("CSV/TSV headers are invalid.");
            const values = Object.fromEntries(headers.map(name => [name, []]));
            rows.slice(1).forEach((row, rowIndex) => { const cells = row.split(separator); if (cells.length !== headers.length) throw new Error(`Row ${rowIndex + 2} has an unexpected column count.`); cells.forEach((cell, index) => { const number = Number(cell.trim()); if (!Number.isFinite(number)) throw new Error(`Row ${rowIndex + 2} contains a non-numeric value.`); values[headers[index]].push(number); }); });
            this.state.data = {columns: headers, rows: rows.length - 1, values}; this.parent.render();
        } catch (error) { this.state.data = null; this.showToast(this.parent.view, error.message || "LOCAL DATA IMPORT FAILED"); this.parent.render(); }
        return true;
    }
}

window.StudComputeWorkspace = StudComputeWorkspace;
window.STUD_COMPUTE_TOOLS = COMPUTE_TOOLS;

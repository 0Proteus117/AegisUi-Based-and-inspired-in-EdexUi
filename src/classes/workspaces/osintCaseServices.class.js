"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const Model = require("./osintCaseModel.class.js");
const {CaseStorage} = require("./osintCaseStorage.class.js");
const ProviderRegistry = require("./osintTools.registry.js");
const ProviderPolicy = require("./osintProviderPolicy.class.js");

function publicCaseSummary(caseRecord) {
    return {id: caseRecord.id, title: caseRecord.title, description: caseRecord.description, status: caseRecord.status, priority: caseRecord.priority, tags: caseRecord.tags, createdAt: caseRecord.createdAt, updatedAt: caseRecord.updatedAt, closedAt: caseRecord.closedAt, createdBy: caseRecord.createdBy, schemaVersion: caseRecord.schemaVersion, evidenceCount: caseRecord.evidenceIds.length};
}

function safeError(error) {
    if (error instanceof Model.CaseError) return {ok: false, code: error.code, message: error.userMessage};
    return {ok: false, code: "STORAGE_UNAVAILABLE", message: "The local case service is unavailable."};
}

function assertProvider(providerId, capability) {
    const provider = ProviderRegistry.getProvider(providerId);
    if (!provider) throw new Model.CaseError("POLICY_BLOCKED", "Evidence provider is not available in the official registry.");
    if (!Array.isArray(provider.capabilities) || !provider.capabilities.includes(capability)) throw new Model.CaseError("POLICY_BLOCKED", "Evidence capability is not available for this provider.");
    if (ProviderPolicy.isReferenceOnly(provider)) throw new Model.CaseError("POLICY_BLOCKED", "Reference-only providers cannot create operational evidence.");
    return provider;
}

function buildExport(caseRecord, evidence, notes, timeline, applicationVersion) {
    return {
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        applicationVersion,
        schemaVersion: Model.CASE_SCHEMA_VERSION,
        disclaimer: "User-generated local metadata export. Integrity is technical only; it does not establish external authenticity or a legal chain of custody.",
        case: caseRecord,
        evidence,
        notes,
        timeline
    };
}

function markdownEscape(value) { return String(value === null || value === undefined ? "" : value).replace(/[\r\n]+/g, " ").trim(); }

function buildMarkdown(exportData) {
    const caseRecord = exportData.case;
    const evidence = exportData.evidence || [];
    const notes = exportData.notes || [];
    const timeline = exportData.timeline || [];
    const lines = [
        `# ${markdownEscape(caseRecord.title)}`,
        "",
        `**Status:** ${caseRecord.status}  `,
        `**Priority:** ${caseRecord.priority}  `,
        `**Tags:** ${(caseRecord.tags || []).join(", ") || "None"}  `,
        `**Created:** ${caseRecord.createdAt}  `,
        `**Updated:** ${caseRecord.updatedAt}`,
        "",
        "## Description",
        caseRecord.description || "No description recorded.",
        "",
        "## Evidence"
    ];
    evidence.forEach(item => {
        lines.push(`### ${markdownEscape(item.title)}`, "", `- **Type:** ${item.type}`, `- **Provider:** ${item.providerName || "Manual"}`, `- **Capability:** ${item.capability || "Not applicable"}`, `- **Captured:** ${item.capturedAt}`, `- **Acquisition:** ${item.acquisitionMethod}`, `- **Integrity:** ${item.integrity && item.integrity.status || "UNKNOWN"}`, `- **Warnings:** ${(item.warnings || []).join("; ") || "None"}`, `- **Summary:** ${markdownEscape(item.summary)}`, "");
        if (item.redactions && item.redactions.length) lines.push(`- **Redactions:** ${item.redactions.map(redaction => redaction.field).join(", ")}`, "");
    });
    lines.push("## Notes");
    notes.forEach(note => lines.push(`- ${note.createdAt}: ${markdownEscape(note.text)}`));
    if (!notes.length) lines.push("No notes recorded.");
    lines.push("", "## Case Timeline");
    timeline.forEach(event => lines.push(`- ${event.timestamp}: **${event.type}** — ${markdownEscape(event.summary)}`));
    if (!timeline.length) lines.push("No timeline events recorded.");
    lines.push("", "---", exportData.disclaimer);
    return `${lines.join("\n")}\n`;
}

function buildEvidenceExport(caseRecord, evidence, notes, applicationVersion) {
    return {
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        applicationVersion,
        schemaVersion: Model.CASE_SCHEMA_VERSION,
        disclaimer: "User-generated local metadata export. Integrity is technical only; it does not establish external authenticity or a legal chain of custody.",
        case: {id: caseRecord.id, title: caseRecord.title, status: caseRecord.status},
        evidence,
        notes
    };
}

function buildEvidenceMarkdown(exportData) {
    const evidence = exportData.evidence;
    const lines = [
        `# Evidence — ${markdownEscape(evidence.title)}`,
        "",
        `**Case:** ${markdownEscape(exportData.case.title)}  `,
        `**Type:** ${evidence.type}  `,
        `**Provider:** ${markdownEscape(evidence.providerName || "Manual")}  `,
        `**Capability:** ${markdownEscape(evidence.capability || "Not applicable")}  `,
        `**Captured:** ${evidence.capturedAt}  `,
        `**Acquisition:** ${evidence.acquisitionMethod}  `,
        `**Integrity:** ${evidence.integrity && evidence.integrity.status || "UNKNOWN"}`,
        "",
        "## Summary",
        markdownEscape(evidence.summary),
        "",
        "## Notes"
    ];
    (exportData.notes || []).forEach(note => lines.push(`- ${note.createdAt}: ${markdownEscape(note.text)}`));
    if (!(exportData.notes || []).length) lines.push("No notes recorded.");
    lines.push("", "---", exportData.disclaimer);
    return `${lines.join("\n")}\n`;
}

class CaseService {
    constructor(options = {}) {
        this.storage = options.storage || new CaseStorage({root: options.root, clock: options.clock});
        this.clock = typeof options.clock === "function" ? options.clock : () => new Date();
        this.applicationVersion = String(options.applicationVersion || "unknown");
    }

    async list() {
        const cases = await this.storage.listCases();
        return {ok: true, cases};
    }

    async create(input) {
        const existing = await this.storage.listCases();
        const caseRecord = Model.createCase(input, {clock: this.clock});
        const event = Model.createTimelineEvent(caseRecord.id, "CASE_CREATED", "Case created.", {clock: this.clock});
        caseRecord.timelineIds.push(event.id);
        await this.storage.createCase(caseRecord);
        await this.storage.appendTimeline(caseRecord.id, event);
        const duplicateTitle = existing.some(item => String(item.title || "").trim().toLocaleLowerCase() === caseRecord.title.toLocaleLowerCase());
        return {ok: true, case: publicCaseSummary(caseRecord), warning: duplicateTitle ? "DUPLICATE_TITLE" : null};
    }

    async read(caseId) {
        const caseRecord = await this.storage.readCase(caseId);
        const evidence = await this.storage.listEvidence(caseId);
        const timeline = await this.storage.readTimeline(caseId);
        const notes = await this.storage.readNotes(caseId);
        return {ok: true, case: publicCaseSummary(caseRecord), evidence, timeline, notes};
    }

    async update(caseId, patch) {
        return this.storage.withCaseLock(caseId, async () => {
            const current = await this.storage.readCase(caseId);
            const updated = Model.updateCase(current, patch, {clock: this.clock});
            const type = patch.status && patch.status !== current.status ? "CASE_STATUS_CHANGED" : "CASE_UPDATED";
            const summary = type === "CASE_STATUS_CHANGED" ? `Case status changed to ${updated.status}.` : "Case metadata updated.";
            const event = Model.createTimelineEvent(updated.id, type, summary, {clock: this.clock});
            updated.timelineIds = [...updated.timelineIds, event.id].slice(-Model.LIMITS.timeline);
            await this.storage.writeCase(updated);
            await this.storage.appendTimeline(updated.id, event);
            return {ok: true, case: publicCaseSummary(updated)};
        });
    }

    async archive(caseId) { return this.update(caseId, {status: "ARCHIVED"}); }

    async promote(caseId, payload) {
        return this.storage.withCaseLock(caseId, async () => {
            const caseRecord = await this.storage.readCase(caseId);
            if (caseRecord.status === "ARCHIVED") throw new Model.CaseError("CASE_ARCHIVED", "Archived cases cannot receive new evidence.");
            if (caseRecord.evidenceIds.length >= Model.LIMITS.caseEvidence) throw new Model.CaseError("PAYLOAD_TOO_LARGE", "This case has reached its evidence limit.");
            if (!payload || typeof payload !== "object") throw new Model.CaseError("EVIDENCE_INVALID", "Evidence promotion payload is invalid.");
            const normalized = Model.sanitizeNormalizedResult(payload.normalizedResult);
            const provider = assertProvider(normalized.providerId, normalized.capability);
            const evidence = Model.createProviderEvidence({caseId, normalizedResult: payload.normalizedResult, draft: payload.draft || {}}, {clock: this.clock, providerName: provider.name, legalContext: provider.legalStatus, riskContext: provider.riskProfile});
            await this.storage.writeEvidence(evidence);
            const event = Model.createTimelineEvent(caseId, "EVIDENCE_ADDED", `Evidence added from ${provider.name}.`, {clock: this.clock, relatedObjectId: evidence.id, metadata: {type: evidence.type, providerId: provider.id}});
            caseRecord.evidenceIds = [...caseRecord.evidenceIds, evidence.id];
            caseRecord.timelineIds = [...caseRecord.timelineIds, event.id].slice(-Model.LIMITS.timeline);
            caseRecord.updatedAt = Model.now(this.clock);
            await this.storage.writeCase(caseRecord);
            await this.storage.appendTimeline(caseId, event);
            if (payload.draft && payload.draft.note) await this.addNote(caseId, {text: payload.draft.note, evidenceId: evidence.id, tags: []}, {insideLock: true});
            return {ok: true, evidence: await this.storage.readEvidence(caseId, evidence.id), case: publicCaseSummary(await this.storage.readCase(caseId))};
        });
    }

    async createEvidence(caseId, payload) {
        if (payload && payload.manual) return this.addManualEvidence(caseId, payload.manual);
        return this.promote(caseId, payload);
    }

    async addManualEvidence(caseId, payload) {
        return this.storage.withCaseLock(caseId, async () => {
            const caseRecord = await this.storage.readCase(caseId);
            if (caseRecord.status === "ARCHIVED") throw new Model.CaseError("CASE_ARCHIVED", "Archived cases cannot receive new evidence.");
            const evidence = Model.createManualEvidence({...payload, caseId}, {clock: this.clock});
            await this.storage.writeEvidence(evidence);
            const event = Model.createTimelineEvent(caseId, "EVIDENCE_ADDED", "Manual evidence added.", {clock: this.clock, relatedObjectId: evidence.id, metadata: {type: evidence.type}});
            caseRecord.evidenceIds = [...caseRecord.evidenceIds, evidence.id];
            caseRecord.timelineIds = [...caseRecord.timelineIds, event.id];
            caseRecord.updatedAt = Model.now(this.clock);
            await this.storage.writeCase(caseRecord);
            await this.storage.appendTimeline(caseId, event);
            return {ok: true, evidence};
        });
    }

    async readEvidence(caseId, evidenceId) { return {ok: true, evidence: await this.storage.readEvidence(caseId, evidenceId)}; }

    async verifyEvidence(caseId, evidenceId) {
        return this.storage.withCaseLock(caseId, async () => {
            const evidence = await this.storage.readEvidence(caseId, evidenceId);
            const valid = evidence.integrity.status === "VALID";
            const updated = {...evidence, integrity: {...evidence.integrity, status: valid ? "VALID" : "INVALID", verifiedAt: Model.now(this.clock)}};
            if (!valid) {
                const event = Model.createTimelineEvent(caseId, "INTEGRITY_WARNING", "Evidence integrity verification failed.", {clock: this.clock, relatedObjectId: evidenceId, metadata: {status: "INVALID"}});
                const caseRecord = await this.storage.readCase(caseId);
                caseRecord.timelineIds = [...caseRecord.timelineIds, event.id].slice(-Model.LIMITS.timeline);
                caseRecord.updatedAt = Model.now(this.clock);
                await this.storage.writeCase(caseRecord);
                await this.storage.appendTimeline(caseId, event);
            }
            await this.storage.writeEvidence(updated);
            return {ok: true, evidence: updated};
        });
    }

    async removeEvidence(caseId, evidenceId, confirmation) {
        if (confirmation !== true) throw new Model.CaseError("POLICY_BLOCKED", "Evidence removal requires explicit confirmation.");
        return this.storage.withCaseLock(caseId, async () => {
            await this.storage.readEvidence(caseId, evidenceId);
            const caseRecord = await this.storage.readCase(caseId);
            await this.storage.removeEvidence(caseId, evidenceId);
            const event = Model.createTimelineEvent(caseId, "EVIDENCE_REMOVED", "Evidence removed from case.", {clock: this.clock, relatedObjectId: evidenceId});
            caseRecord.evidenceIds = caseRecord.evidenceIds.filter(id => id !== evidenceId);
            caseRecord.timelineIds = [...caseRecord.timelineIds, event.id].slice(-Model.LIMITS.timeline);
            caseRecord.updatedAt = Model.now(this.clock);
            await this.storage.writeCase(caseRecord);
            await this.storage.appendTimeline(caseId, event);
            return {ok: true, case: publicCaseSummary(caseRecord)};
        });
    }

    async addNote(caseId, payload, options = {}) {
        const work = async () => {
            const caseRecord = await this.storage.readCase(caseId);
            if (caseRecord.status === "ARCHIVED") throw new Model.CaseError("CASE_ARCHIVED", "Archived cases cannot receive notes.");
            const note = Model.createNote({...payload, caseId}, {clock: this.clock});
            if (note.evidenceId) await this.storage.readEvidence(caseId, note.evidenceId);
            const notes = await this.storage.readNotes(caseId);
            await this.storage.writeNotes(caseId, [...notes, note]);
            const event = Model.createTimelineEvent(caseId, "NOTE_ADDED", note.evidenceId ? "Evidence note added." : "Case note added.", {clock: this.clock, relatedObjectId: note.id, metadata: {evidenceId: note.evidenceId}});
            caseRecord.noteIds = [...caseRecord.noteIds, note.id];
            caseRecord.timelineIds = [...caseRecord.timelineIds, event.id].slice(-Model.LIMITS.timeline);
            caseRecord.updatedAt = Model.now(this.clock);
            await this.storage.writeCase(caseRecord);
            await this.storage.appendTimeline(caseId, event);
            return {ok: true, note};
        };
        return options.insideLock ? work() : this.storage.withCaseLock(caseId, work);
    }

    async updateNote(caseId, noteId, patch) {
        return this.storage.withCaseLock(caseId, async () => {
            const caseRecord = await this.storage.readCase(caseId);
            if (caseRecord.status === "ARCHIVED") throw new Model.CaseError("CASE_ARCHIVED", "Archived cases cannot receive notes.");
            const notes = await this.storage.readNotes(caseId);
            const index = notes.findIndex(note => note.id === Model.safeId(noteId, "note"));
            if (index < 0) throw new Model.CaseError("CASE_NOT_FOUND", "The requested local note is unavailable.");
            const note = Model.updateNote(notes[index], patch, {clock: this.clock});
            notes[index] = note;
            await this.storage.writeNotes(caseId, notes);
            const event = Model.createTimelineEvent(caseId, "NOTE_UPDATED", note.evidenceId ? "Evidence note updated." : "Case note updated.", {clock: this.clock, relatedObjectId: note.id, metadata: {evidenceId: note.evidenceId}});
            caseRecord.timelineIds = [...caseRecord.timelineIds, event.id].slice(-Model.LIMITS.timeline);
            caseRecord.updatedAt = Model.now(this.clock);
            await this.storage.writeCase(caseRecord);
            await this.storage.appendTimeline(caseId, event);
            return {ok: true, note};
        });
    }

    async exportCase(caseId, format, destination) {
        if (!["json", "markdown"].includes(format)) throw new Model.CaseError("EXPORT_FAILED", "Requested export format is not supported.");
        if (typeof destination !== "string" || path.isAbsolute(destination) === false || destination.includes("\0") || destination.includes("..")) throw new Model.CaseError("PATH_REJECTED", "Export destination is invalid.");
        const expectedExtension = format === "json" ? ".json" : ".md";
        if (path.extname(destination).toLowerCase() !== expectedExtension) throw new Model.CaseError("PATH_REJECTED", "Export extension is invalid.");
        const caseRecord = await this.storage.readCase(caseId);
        const evidence = await this.storage.listEvidence(caseId);
        const notes = await this.storage.readNotes(caseId);
        const timeline = await this.storage.readTimeline(caseId);
        const data = buildExport(caseRecord, evidence, notes, timeline, this.applicationVersion);
        const output = format === "json" ? `${JSON.stringify(data, null, 2)}\n` : buildMarkdown(data);
        if (Buffer.byteLength(output, "utf8") > Model.LIMITS.exportBytes) throw new Model.CaseError("PAYLOAD_TOO_LARGE", "Export exceeds the permitted size.");
        if (fs.existsSync(destination)) throw new Model.CaseError("EXPORT_FAILED", "Export destination already exists and requires confirmation.");
        await fspWriteAtomic(destination, output);
        await this.storage.withCaseLock(caseId, async () => {
            const mutable = await this.storage.readCase(caseId);
            const event = Model.createTimelineEvent(caseId, "EXPORT_CREATED", `Case exported as ${format.toUpperCase()}.`, {clock: this.clock, metadata: {format}});
            mutable.timelineIds = [...mutable.timelineIds, event.id].slice(-Model.LIMITS.timeline);
            mutable.updatedAt = Model.now(this.clock);
            await this.storage.writeCase(mutable);
            await this.storage.appendTimeline(caseId, event);
        });
        return {ok: true, format, fileName: path.basename(destination), exportedAt: data.exportedAt, warning: evidence.some(item => item.integrity && item.integrity.status === "INVALID") ? "INTEGRITY_INVALID" : null};
    }

    async exportEvidence(caseId, evidenceId, format, destination) {
        if (!["json", "markdown"].includes(format)) throw new Model.CaseError("EXPORT_FAILED", "Requested export format is not supported.");
        if (typeof destination !== "string" || path.isAbsolute(destination) === false || destination.includes("\0") || destination.includes("..")) throw new Model.CaseError("PATH_REJECTED", "Export destination is invalid.");
        const expectedExtension = format === "json" ? ".json" : ".md";
        if (path.extname(destination).toLowerCase() !== expectedExtension) throw new Model.CaseError("PATH_REJECTED", "Export extension is invalid.");
        const caseRecord = await this.storage.readCase(caseId);
        const evidence = await this.storage.readEvidence(caseId, evidenceId);
        const notes = (await this.storage.readNotes(caseId)).filter(note => !note.evidenceId || note.evidenceId === evidenceId);
        const data = buildEvidenceExport(caseRecord, evidence, notes, this.applicationVersion);
        const output = format === "json" ? `${JSON.stringify(data, null, 2)}\n` : buildEvidenceMarkdown(data);
        if (Buffer.byteLength(output, "utf8") > Model.LIMITS.exportBytes) throw new Model.CaseError("PAYLOAD_TOO_LARGE", "Export exceeds the permitted size.");
        if (fs.existsSync(destination)) throw new Model.CaseError("EXPORT_FAILED", "Export destination already exists and requires confirmation.");
        await fspWriteAtomic(destination, output);
        await this.storage.withCaseLock(caseId, async () => {
            const mutable = await this.storage.readCase(caseId);
            const event = Model.createTimelineEvent(caseId, "EXPORT_CREATED", `Evidence exported as ${format.toUpperCase()}.`, {clock: this.clock, relatedObjectId: evidenceId, metadata: {format, scope: "EVIDENCE"}});
            mutable.timelineIds = [...mutable.timelineIds, event.id].slice(-Model.LIMITS.timeline);
            mutable.updatedAt = Model.now(this.clock);
            await this.storage.writeCase(mutable);
            await this.storage.appendTimeline(caseId, event);
        });
        return {ok: true, format, fileName: path.basename(destination), exportedAt: data.exportedAt, warning: evidence.integrity && evidence.integrity.status === "INVALID" ? "INTEGRITY_INVALID" : null};
    }
}

async function fspWriteAtomic(destination, contents) {
    const directory = path.dirname(destination);
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.tmp`);
    let handle;
    try {
        await fsp.mkdir(directory, {recursive: true, mode: 0o700});
        handle = await fsp.open(temporary, "wx", 0o600);
        await handle.writeFile(contents, "utf8");
        await handle.sync();
        await handle.close(); handle = null;
        await fsp.rename(temporary, destination);
    } catch (error) {
        if (handle) await handle.close().catch(() => {});
        await fsp.unlink(temporary).catch(() => {});
        throw error instanceof Model.CaseError ? error : new Model.CaseError("EXPORT_FAILED", "The export could not be written.");
    }
}

module.exports = {CaseService, CaseStorage, publicCaseSummary, safeError, buildExport, buildMarkdown, buildEvidenceExport, buildEvidenceMarkdown};

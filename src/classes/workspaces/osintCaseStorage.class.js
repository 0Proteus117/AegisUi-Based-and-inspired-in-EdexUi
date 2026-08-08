"use strict";

const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const Model = require("./osintCaseModel.class.js");

class CaseStorage {
    constructor(options = {}) {
        if (!options.root || typeof options.root !== "string") throw new Model.CaseError("STORAGE_UNAVAILABLE", "Case storage is unavailable.");
        this.root = path.resolve(options.root);
        this.clock = typeof options.clock === "function" ? options.clock : () => new Date();
        this.locks = new Map();
    }

    casesDir() { return path.join(this.root, "cases"); }
    exportsDir() { return path.join(this.root, "exports"); }
    backupsDir() { return path.join(this.root, "backups"); }
    indexPath() { return path.join(this.root, "index.json"); }
    caseDir(caseId) { return this.resolveInside(this.casesDir(), Model.safeId(caseId, "case")); }
    casePath(caseId) { return this.resolveInside(this.caseDir(caseId), "case.json"); }
    evidenceDir(caseId) { return this.resolveInside(this.caseDir(caseId), "evidence"); }
    evidencePath(caseId, evidenceId) { return this.resolveInside(this.evidenceDir(caseId), `${Model.safeId(evidenceId, "evidence")}.json`); }
    timelinePath(caseId) { return this.resolveInside(this.caseDir(caseId), "timeline.json"); }
    notesPath(caseId) { return this.resolveInside(this.caseDir(caseId), "notes.json"); }

    resolveInside(base, fragment) {
        if (typeof fragment !== "string" || fragment.includes("\0") || path.isAbsolute(fragment) || fragment.includes("..")) throw new Model.CaseError("PATH_REJECTED", "Storage path is invalid.");
        const resolvedBase = path.resolve(base);
        const resolved = path.resolve(resolvedBase, fragment);
        if (resolved !== resolvedBase && !resolved.startsWith(`${resolvedBase}${path.sep}`)) throw new Model.CaseError("PATH_REJECTED", "Storage path is invalid.");
        return resolved;
    }

    async ensure() {
        try {
            await Promise.all([this.root, this.casesDir(), this.exportsDir(), this.backupsDir()].map(directory => fsp.mkdir(directory, {recursive: true, mode: 0o700})));
        } catch (error) {
            throw new Model.CaseError("STORAGE_UNAVAILABLE", "Local case storage could not be prepared.");
        }
    }

    async withCaseLock(caseId, operation) {
        const id = Model.safeId(caseId, "case");
        const previous = this.locks.get(id) || Promise.resolve();
        const current = previous.catch(() => {}).then(operation);
        this.locks.set(id, current);
        try { return await current; }
        finally { if (this.locks.get(id) === current) this.locks.delete(id); }
    }

    async writeAtomic(file, value) {
        const json = `${JSON.stringify(value, null, 2)}\n`;
        const bytes = Buffer.byteLength(json, "utf8");
        if (bytes > Model.LIMITS.exportBytes) throw new Model.CaseError("PAYLOAD_TOO_LARGE", "Stored case data exceeds the permitted size.");
        const directory = path.dirname(file);
        const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(5).toString("hex")}.tmp`);
        let handle = null;
        try {
            await fsp.mkdir(directory, {recursive: true, mode: 0o700});
            handle = await fsp.open(temporary, "wx", 0o600);
            await handle.writeFile(json, "utf8");
            await handle.sync();
            await handle.close();
            handle = null;
            await fsp.rename(temporary, file);
        } catch (error) {
            if (handle) await handle.close().catch(() => {});
            await fsp.unlink(temporary).catch(() => {});
            if (error instanceof Model.CaseError) throw error;
            throw new Model.CaseError("STORAGE_WRITE_FAILED", "Local case data could not be written.");
        }
    }

    async readJson(file, errorCode = "STORAGE_READ_FAILED") {
        try {
            const source = await fsp.readFile(file, "utf8");
            if (Buffer.byteLength(source, "utf8") > Model.LIMITS.exportBytes) throw new Model.CaseError("PAYLOAD_TOO_LARGE", "Stored case data exceeds the permitted size.");
            return JSON.parse(source);
        } catch (error) {
            if (error && error.code === "ENOENT") throw new Model.CaseError("CASE_NOT_FOUND", "The requested local case is unavailable.");
            if (error instanceof Model.CaseError) throw error;
            throw new Model.CaseError(errorCode, "Stored local case data is unreadable.");
        }
    }

    async createCase(record) {
        await this.ensure();
        const caseRecord = Model.validateCaseRecord(record);
        const dir = this.caseDir(caseRecord.id);
        try { await fsp.mkdir(dir, {recursive: false, mode: 0o700}); }
        catch (error) {
            if (error && error.code === "EEXIST") throw new Model.CaseError("CASE_ALREADY_EXISTS", "A case with this identifier already exists.");
            throw new Model.CaseError("STORAGE_WRITE_FAILED", "The local case directory could not be created.");
        }
        try {
            await Promise.all([fsp.mkdir(this.evidenceDir(caseRecord.id), {recursive: true, mode: 0o700}), this.writeAtomic(this.casePath(caseRecord.id), caseRecord), this.writeAtomic(this.timelinePath(caseRecord.id), []), this.writeAtomic(this.notesPath(caseRecord.id), [])]);
        } catch (error) {
            await fsp.rm(dir, {recursive: true, force: true}).catch(() => {});
            throw error;
        }
        await this.rebuildIndex();
        return caseRecord;
    }

    async readCase(caseId) {
        const record = Model.validateCaseRecord(await this.readJson(this.casePath(caseId), "CASE_INVALID"));
        return record;
    }

    async writeCase(record) {
        const validated = Model.validateCaseRecord(record);
        await this.writeAtomic(this.casePath(validated.id), validated);
        await this.rebuildIndex();
        return validated;
    }

    async readTimeline(caseId) {
        try {
            const timeline = await this.readJson(this.timelinePath(caseId), "CASE_INVALID");
            if (!Array.isArray(timeline)) throw new Model.CaseError("CASE_INVALID", "Case timeline is invalid.");
            return timeline;
        } catch (error) {
            if (error.code === "CASE_NOT_FOUND") return [];
            throw error;
        }
    }

    async writeTimeline(caseId, timeline) {
        if (!Array.isArray(timeline) || timeline.length > Model.LIMITS.timeline) throw new Model.CaseError("PAYLOAD_TOO_LARGE", "Case timeline exceeds the permitted limit.");
        await this.writeAtomic(this.timelinePath(caseId), timeline);
        return timeline;
    }

    async appendTimeline(caseId, event) {
        const current = await this.readTimeline(caseId);
        const next = [...current, event].slice(-Model.LIMITS.timeline);
        await this.writeTimeline(caseId, next);
        return event;
    }

    async readNotes(caseId) {
        try {
            const notes = await this.readJson(this.notesPath(caseId), "CASE_INVALID");
            if (!Array.isArray(notes)) throw new Model.CaseError("CASE_INVALID", "Case notes are invalid.");
            return notes;
        } catch (error) {
            if (error.code === "CASE_NOT_FOUND") return [];
            throw error;
        }
    }

    async writeNotes(caseId, notes) {
        if (!Array.isArray(notes) || notes.length > Model.LIMITS.timeline) throw new Model.CaseError("PAYLOAD_TOO_LARGE", "Case notes exceed the permitted limit.");
        await this.writeAtomic(this.notesPath(caseId), notes);
        return notes;
    }

    async listEvidence(caseId) {
        const dir = this.evidenceDir(caseId);
        try {
            const entries = await fsp.readdir(dir, {withFileTypes: true});
            const records = [];
            for (const entry of entries) {
                if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
                try {
                    const record = Model.validateEvidenceRecord(await this.readJson(this.resolveInside(dir, entry.name), "EVIDENCE_INVALID"));
                    const actual = Model.sha256(Model.integrityPayload(record));
                    records.push({...record, integrity: {...record.integrity, status: actual === record.integrity.value ? "VALID" : "INVALID"}});
                }
                catch (error) { records.push({id: entry.name.replace(/\.json$/, ""), caseId, unreadable: true, integrity: {status: "UNKNOWN"}, errorCode: error.code || "EVIDENCE_INVALID"}); }
            }
            return records.sort((left, right) => String(right.capturedAt || "").localeCompare(String(left.capturedAt || "")));
        } catch (error) {
            if (error && error.code === "ENOENT") return [];
            throw new Model.CaseError("STORAGE_READ_FAILED", "Evidence records could not be read.");
        }
    }

    async readEvidence(caseId, evidenceId) {
        let evidence;
        try { evidence = Model.validateEvidenceRecord(await this.readJson(this.evidencePath(caseId, evidenceId), "EVIDENCE_INVALID")); }
        catch (error) {
            if (error.code === "CASE_NOT_FOUND") throw new Model.CaseError("EVIDENCE_NOT_FOUND", "The requested evidence is unavailable.");
            throw error;
        }
        const actual = Model.sha256(Model.integrityPayload(evidence));
        const integrity = actual === evidence.integrity.value ? {...evidence.integrity, status: "VALID"} : {...evidence.integrity, status: "INVALID"};
        return {...evidence, integrity};
    }

    async writeEvidence(evidence) {
        const validated = Model.validateEvidenceRecord(evidence);
        await this.writeAtomic(this.evidencePath(validated.caseId, validated.id), validated);
        return validated;
    }

    async removeEvidence(caseId, evidenceId) {
        const file = this.evidencePath(caseId, evidenceId);
        try { await fsp.unlink(file); }
        catch (error) {
            if (error && error.code === "ENOENT") throw new Model.CaseError("EVIDENCE_NOT_FOUND", "The requested evidence is unavailable.");
            throw new Model.CaseError("STORAGE_WRITE_FAILED", "Evidence could not be removed.");
        }
    }

    toIndexEntry(caseRecord) {
        return {id: caseRecord.id, title: caseRecord.title, status: caseRecord.status, priority: caseRecord.priority, createdAt: caseRecord.createdAt, updatedAt: caseRecord.updatedAt, evidenceCount: caseRecord.evidenceIds.length, tags: caseRecord.tags, schemaVersion: caseRecord.schemaVersion};
    }

    async listCases() {
        // Merely opening OSINT must not create a persistence footprint. The
        // store is materialised only by an explicit create operation.
        try { await fsp.stat(this.root); }
        catch (error) {
            if (error && error.code === "ENOENT") return [];
            throw new Model.CaseError("STORAGE_UNAVAILABLE", "Local case storage is unavailable.");
        }
        try {
            const index = await this.readJson(this.indexPath(), "INDEX_CORRUPTED");
            if (!index || index.schemaVersion !== Model.CASE_SCHEMA_VERSION || !Array.isArray(index.cases)) throw new Model.CaseError("INDEX_CORRUPTED", "Case index is invalid.");
            return index.cases.map(item => ({...item})).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
        } catch (error) {
            if (!["CASE_NOT_FOUND", "INDEX_CORRUPTED"].includes(error.code)) throw error;
            return this.rebuildIndex({preserveCorrupt: error.code === "INDEX_CORRUPTED"});
        }
    }

    async rebuildIndex(options = {}) {
        await this.ensure();
        if (options.preserveCorrupt) {
            try {
                const stamp = this.clock().toISOString().replace(/[:.]/g, "-");
                await fsp.rename(this.indexPath(), this.resolveInside(this.backupsDir(), `index-corrupt-${stamp}.json`));
                const backups = (await fsp.readdir(this.backupsDir())).filter(name => name.startsWith("index-corrupt-")).sort();
                while (backups.length > 2) await fsp.unlink(this.resolveInside(this.backupsDir(), backups.shift())).catch(() => {});
            } catch (error) { /* missing/corrupt index remains untouched when it cannot be renamed */ }
        }
        const entries = await fsp.readdir(this.casesDir(), {withFileTypes: true});
        const cases = [];
        for (const entry of entries) {
            if (!entry.isDirectory() || !entry.name.startsWith("case-")) continue;
            try { cases.push(this.toIndexEntry(await this.readCase(entry.name))); }
            catch (error) { /* preserve unreadable case data but omit it from the navigable index */ }
        }
        const index = {schemaVersion: Model.CASE_SCHEMA_VERSION, generatedAt: Model.now(this.clock), cases: cases.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))};
        await this.writeAtomic(this.indexPath(), index);
        return index.cases;
    }

    async cleanup() {
        await fsp.rm(this.root, {recursive: true, force: true}).catch(() => {});
    }
}

module.exports = {CaseStorage};

"use strict";

const fs = require("fs");
const path = require("path");
const {LmsError, safeId} = require("./studLmsModel.class.js");

class StudCredentialVault {
    constructor(options = {}) {
        if (!options.root) throw new LmsError("STORAGE_UNAVAILABLE", "Secure STUD credential storage is unavailable.");
        this.root = path.resolve(options.root);
        this.safeStorage = options.safeStorage || null;
        this.file = path.join(this.root, "secure-provider-credentials.json");
    }

    supported() {
        return Boolean(this.safeStorage
            && typeof this.safeStorage.isEncryptionAvailable === "function"
            && typeof this.safeStorage.encryptString === "function"
            && typeof this.safeStorage.decryptString === "function");
    }

    available() { return this.supported() && this.safeStorage.isEncryptionAvailable(); }

    read() {
        if (!fs.existsSync(this.file)) return {};
        try {
            const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
            return parsed && parsed.version === 1 && parsed.providers && typeof parsed.providers === "object" ? parsed.providers : {};
        } catch (error) { throw new LmsError("SECURE_STORAGE_UNAVAILABLE", "Secure provider credentials cannot be read safely."); }
    }

    write(providers) {
        fs.mkdirSync(this.root, {recursive: true, mode: 0o700});
        const temporary = `${this.file}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify({version: 1, providers}), {mode: 0o600});
        fs.renameSync(temporary, this.file);
        try { fs.chmodSync(this.file, 0o600); } catch (error) {}
    }

    put(providerId, secrets = {}) {
        if (!this.available()) throw new LmsError("SECURE_STORAGE_UNAVAILABLE", "macOS secure storage is unavailable; Moodle credentials were not saved.");
        const id = safeId(providerId);
        const current = this.read();
        const next = {...(current[id] || {})};
        ["token", "privateToken", "icsUrl"].forEach(key => {
            if (secrets[key] === undefined) return;
            if (secrets[key] === null || secrets[key] === "") delete next[key];
            else next[key] = this.safeStorage.encryptString(String(secrets[key])).toString("base64");
        });
        if (Object.keys(next).length) current[id] = next;
        else delete current[id];
        this.write(current);
        return this.status(id);
    }

    forget(providerId) {
        const id = safeId(providerId);
        const current = this.read();
        if (Object.prototype.hasOwnProperty.call(current, id)) {
            delete current[id];
            this.write(current);
        }
        return this.status(id);
    }

    get(providerId) {
        const id = safeId(providerId);
        if (!this.available()) return {token: null, privateToken: null, icsUrl: null};
        const encrypted = this.read()[id] || {};
        const decrypt = value => value ? this.safeStorage.decryptString(Buffer.from(value, "base64")) : null;
        try { return Object.freeze({token: decrypt(encrypted.token), privateToken: decrypt(encrypted.privateToken), icsUrl: decrypt(encrypted.icsUrl)}); }
        catch (error) { throw new LmsError("SECURE_STORAGE_UNAVAILABLE", "Secure Moodle credentials cannot be decrypted safely."); }
    }

    status(providerId) {
        const id = safeId(providerId);
        const value = this.read()[id] || {};
        // Status is a metadata-only operation and must not synchronously touch
        // Keychain. Mounted/ad-hoc validation builds can otherwise block on a
        // macOS keychain authorisation dialog merely by opening STUD. Actual
        // credential reads and writes still require available() and therefore
        // fail closed at the point a secret is used.
        return Object.freeze({secureStorageAvailable: this.supported(), tokenConfigured: Boolean(value.token), icsConfigured: Boolean(value.icsUrl)});
    }
}

module.exports = {StudCredentialVault};

(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTDomainInfrastructure = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const CAPABILITY = "INFRASTRUCTURE_CONTEXT";
    const TARGET_TYPES = Object.freeze(["DOMAIN", "IPv4", "IPv6"]);
    const VERIFICATION_STATUSES = Object.freeze(["UNVERIFIED", "PARTIALLY_VERIFIED", "CONSISTENT", "INCONSISTENT", "PROVIDER_UNAVAILABLE", "INVALID_INPUT", "CANCELLED"]);
    const CONFIDENCE_LEVELS = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
    const DNS_RECORD_TYPES = Object.freeze(["A", "AAAA", "MX", "NS", "TXT", "CNAME"]);
    const MAX_INPUT_LENGTH = 512;
    const MAX_ANALYST_NOTE = 4000;

    class DomainInfrastructureError extends Error {
        constructor(code, message) { super(message); this.name = "DomainInfrastructureError"; this.code = code; }
    }

    function cleanText(value, maximum = 240) {
        if (value === null || value === undefined) return null;
        const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
        return text || null;
    }

    function parseIPv4(value) {
        if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null;
        const octets = value.split(".").map(item => Number(item));
        if (octets.some(item => !Number.isInteger(item) || item < 0 || item > 255)) return null;
        return octets;
    }

    function isPublicIPv4(octets) {
        const [a, b] = octets;
        if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
        if (a === 100 && b >= 64 && b <= 127) return false;
        if (a === 169 && b === 254) return false;
        if (a === 172 && b >= 16 && b <= 31) return false;
        if (a === 192 && (b === 0 || b === 168)) return false;
        if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
        if (a === 203 && b === 0) return false;
        return true;
    }

    function ipv6Bytes(value) {
        const raw = String(value || "").toLowerCase();
        if (!raw || raw.includes("%") || raw.includes(".")) return null;
        const halves = raw.split("::");
        if (halves.length > 2) return null;
        const left = halves[0] ? halves[0].split(":") : [];
        const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
        if (left.concat(right).some(part => !/^[0-9a-f]{1,4}$/.test(part))) return null;
        const missing = 8 - left.length - right.length;
        if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
        const parts = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
        if (parts.length !== 8) return null;
        const bytes = [];
        parts.forEach(part => { const number = parseInt(part, 16); bytes.push(number >> 8, number & 255); });
        return bytes;
    }

    function canonicalIPv6(value) {
        try { return new URL(`http://[${value}]/`).hostname.replace(/^\[|\]$/g, "").toLowerCase(); }
        catch (error) { return null; }
    }

    function isPublicIPv6(bytes) {
        if (!bytes || bytes.length !== 16) return false;
        const allZero = bytes.every(value => value === 0);
        const loopback = bytes.slice(0, 15).every(value => value === 0) && bytes[15] === 1;
        const ipv4Mapped = bytes.slice(0, 10).every(value => value === 0) && bytes[10] === 255 && bytes[11] === 255;
        if (allZero || loopback || ipv4Mapped || bytes[0] === 255) return false;
        if ((bytes[0] & 0xfe) === 0xfc || (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80)) return false;
        if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false;
        return true;
    }

    function isValidDomain(value) {
        if (!value || value.length > 253 || !value.includes(".") || value.endsWith(".")) return false;
        if (value === "localhost" || value.endsWith(".localhost") || value.endsWith(".local")) return false;
        const labels = value.split(".");
        return labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
    }

    function reject(message) { throw new DomainInfrastructureError("INVALID_INPUT", message); }

    function normalizeInput(input) {
        if (Array.isArray(input) || (input && typeof input === "object")) reject("Enter one public domain, public IP address, or HTTP(S) URL only.");
        const originalInput = String(input === null || input === undefined ? "" : input).trim();
        if (!originalInput) reject("Enter one public domain or public IP address.");
        if (originalInput.length > MAX_INPUT_LENGTH || /[\s,;]|[*]|\//.test(originalInput) && !/^https?:\/\//i.test(originalInput)) reject("Enter one target only; ranges, wildcards, paths and target lists are not supported.");
        let candidate = originalInput;
        let source = "MANUAL_INPUT";
        if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
            let parsed;
            try { parsed = new URL(candidate); } catch (error) { reject("Enter a valid public HTTP(S) URL, domain or IP address."); }
            if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) reject("Only a public HTTP(S) host without credentials or a port may be normalized.");
            candidate = parsed.hostname.replace(/^\[|\]$/g, "");
            source = "URL_HOSTNAME";
        }
        if (/[/\\@#?]/.test(candidate) || candidate.includes("%") || candidate.includes("..")) reject("Enter one plain public domain or IP address.");
        const ipv4 = parseIPv4(candidate);
        if (ipv4) {
            if (!isPublicIPv4(ipv4)) reject("Private, reserved, loopback, multicast and documentation IPv4 addresses are not supported.");
            return Object.freeze({originalInput, normalizedTarget: ipv4.join("."), targetType: "IPv4", source});
        }
        const ipv6 = ipv6Bytes(candidate);
        if (ipv6) {
            if (!isPublicIPv6(ipv6)) reject("Private, reserved, loopback, multicast and documentation IPv6 addresses are not supported.");
            const normalizedTarget = canonicalIPv6(candidate);
            if (!normalizedTarget) reject("Enter a valid public IPv6 address.");
            return Object.freeze({originalInput, normalizedTarget, targetType: "IPv6", source});
        }
        const domain = candidate.toLowerCase();
        if (!isValidDomain(domain)) reject("Enter one valid public domain name or public IP address.");
        return Object.freeze({originalInput, normalizedTarget: domain, targetType: "DOMAIN", source});
    }

    function safeString(value, maximum = 320) { return cleanText(value, maximum); }
    function safeArray(value, maximum = 12, length = 640) {
        return Object.freeze((Array.isArray(value) ? value : []).map(item => safeString(item, length)).filter(Boolean).slice(0, maximum));
    }

    function createVerification(input = {}) {
        const target = input.target && input.target.normalizedTarget ? input.target : normalizeInput(input.input);
        const dns = input.dns && typeof input.dns === "object" ? input.dns : null;
        const network = input.network && typeof input.network === "object" ? input.network : null;
        const providerObservations = Object.freeze((input.providerObservations || []).filter(Boolean).slice(0, 8).map(item => Object.freeze({
            providerId: safeString(item.providerId, 80), providerName: safeString(item.providerName, 160), type: safeString(item.type, 80), observedAt: safeString(item.observedAt, 64), status: safeString(item.status, 64), summary: safeString(item.summary, 320)
        })));
        const available = providerObservations.some(item => item.status === "SUCCESS" || item.status === "PARTIAL");
        const unavailable = providerObservations.length && !available;
        const status = input.status && VERIFICATION_STATUSES.includes(input.status)
            ? input.status
            : unavailable ? "PROVIDER_UNAVAILABLE" : available ? "PARTIALLY_VERIFIED" : "UNVERIFIED";
        const confidence = input.confidence && CONFIDENCE_LEVELS.includes(input.confidence)
            ? input.confidence
            : network && dns ? "MEDIUM" : available ? "LOW" : "LOW";
        return Object.freeze({
            id: String(input.id || `infrastructure-${Date.now().toString(36)}`), capability: CAPABILITY,
            target: Object.freeze({originalInput: target.originalInput, normalizedTarget: target.normalizedTarget, targetType: target.targetType, source: target.source}),
            registration: Object.freeze({available: false, provider: "NOT QUERIED", observation: "Authoritative RDAP is link-only in this phase; no dynamic registry routing or personal contact data is requested."}),
            dns: dns ? Object.freeze({records: Object.freeze(dns.records || []), warnings: Object.freeze(dns.warnings || []), provider: "Google Public DNS"}) : null,
            network: network ? Object.freeze({...network}) : null,
            certificate: Object.freeze({available: false, provider: "NOT QUERIED", observation: "Certificate context is deferred; this capability does not probe target sockets or ports."}),
            providerObservations, verificationStatus: status, confidence,
            analystObservation: safeString(input.analystObservation, MAX_ANALYST_NOTE),
            createdAt: input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
        });
    }

    function toEvidenceData(verification, analystObservation = "") {
        if (!verification || !verification.target) throw new DomainInfrastructureError("INVALID_INPUT", "A normalized infrastructure context is required before evidence can be created.");
        const target = verification.target;
        const dnsRecords = verification.dns && verification.dns.records || [];
        const network = verification.network || null;
        return Object.freeze({
            available: verification.providerObservations.some(item => item.status === "SUCCESS" || item.status === "PARTIAL"),
            originalInput: target.originalInput,
            canonicalUrl: null, snapshotUrl: null, snapshotTimestamp: null,
            provider: verification.providerObservations.map(item => item.providerName).filter(Boolean).join(" · ") || "No provider observation",
            queriedAt: verification.createdAt, completedAt: verification.updatedAt, confidence: verification.confidence,
            warnings: Object.freeze([]),
            infrastructure: Object.freeze({
                normalizedTarget: target.normalizedTarget, targetType: target.targetType, inputSource: target.source,
                verificationStatus: verification.verificationStatus, confidence: verification.confidence,
                registration: Object.freeze({available: false, observation: verification.registration.observation}),
                dns: Object.freeze({records: Object.freeze(dnsRecords.slice(0, 36).map(record => Object.freeze({type: safeString(record.type, 12), values: safeArray(record.values, 12), status: safeString(record.status, 32)}))), warnings: safeArray(verification.dns && verification.dns.warnings || [], 12)}),
                network: network ? Object.freeze({ip: safeString(network.ip, 80), asns: safeArray(network.asns, 12, 32), prefix: safeString(network.prefix, 80), rir: safeString(network.rir, 80), country: safeString(network.country, 80), allocationContext: safeString(network.allocationContext, 320)}) : null,
                certificate: Object.freeze({available: false, observation: verification.certificate.observation}),
                provenance: Object.freeze(verification.providerObservations.slice())
            }),
            analystObservation: safeString(analystObservation, MAX_ANALYST_NOTE)
        });
    }

    return Object.freeze({CAPABILITY, TARGET_TYPES, VERIFICATION_STATUSES, CONFIDENCE_LEVELS, DNS_RECORD_TYPES, MAX_INPUT_LENGTH, DomainInfrastructureError, normalizeInput, parseIPv4, ipv6Bytes, isPublicIPv4, isPublicIPv6, createVerification, toEvidenceData});
});

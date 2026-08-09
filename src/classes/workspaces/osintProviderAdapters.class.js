(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTProviderAdapters = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const Runtime = (typeof window !== "undefined" && window.OSINTProviderRuntime)
        || (typeof require === "function" ? require("./osintProviderRuntime.class.js") : null);
    const Policy = (typeof window !== "undefined" && window.OSINTProviderPolicy)
        || (typeof require === "function" ? require("./osintProviderPolicy.class.js") : null);
    const DomainInfrastructure = (typeof window !== "undefined" && window.OSINTDomainInfrastructure)
        || (typeof require === "function" ? require("./osintDomainInfrastructure.class.js") : null);
    const ResearchSource = (typeof window !== "undefined" && window.OSINTResearchSourceVerification)
        || (typeof require === "function" ? require("./osintResearchSourceVerification.class.js") : null);
    if (!Runtime || !Policy || !DomainInfrastructure || !ResearchSource) throw new Error("OSINT provider runtime, policy, domain and source modules must load before adapters.");

    const WAYBACK_AVAILABILITY_ENDPOINT = "https://archive.org/wayback/available";
    const WAYBACK_TIMEOUT_MS = 9000;
    const OPEN_METEO_GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
    const OPEN_METEO_TIMEOUT_MS = 8000;
    const GOOGLE_DNS_DOH_ENDPOINT = "https://dns.google/resolve";
    const GOOGLE_DNS_TIMEOUT_MS = 8000;
    const RIPESTAT_NETWORK_INFO_ENDPOINT = "https://stat.ripe.net/data/network-info/data.json";
    const RIPESTAT_TIMEOUT_MS = 8000;
    const CROSSREF_WORKS_ENDPOINT = "https://api.crossref.org/works/";
    const CROSSREF_TIMEOUT_MS = 8000;

    function safeText(value, fallback = "Provider request failed.") {
        return String(value || fallback).replace(/https?:\/\/[^\s]+/gi, "[URL REDACTED]").replace(/\s+/g, " ").trim().slice(0, 240) || fallback;
    }

    function isPublicTarget(parsed) {
        const host = String(parsed.hostname || "").toLowerCase();
        if (!host || host === "localhost" || host.endsWith(".local")) return false;
        if (/^(127\.|0\.0\.0\.0$|::1$|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
        return true;
    }

    function validateWaybackInput(input) {
        if (Array.isArray(input) || (input && typeof input === "object")) throw new Runtime.ProviderError("INVALID_INPUT", "Enter one URL or domain only.");
        const value = String(input || "").trim();
        if (!value) throw new Runtime.ProviderError("INVALID_INPUT", "Enter a public URL or domain.");
        if (value.length > 2048) throw new Runtime.ProviderError("INVALID_INPUT", "The URL is too long.");
        const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
        let parsed;
        try {
            parsed = new URL(candidate);
        } catch (error) {
            throw new Runtime.ProviderError("INVALID_INPUT", "Enter a valid public URL or domain.");
        }
        if (!["http:", "https:"].includes(parsed.protocol) || !isPublicTarget(parsed)) {
            throw new Runtime.ProviderError("INVALID_INPUT", "Only public HTTP or HTTPS URLs are supported.");
        }
        parsed.hash = "";
        return parsed.toString();
    }

    function validateOpenMeteoPlaceInput(input) {
        if (!input || typeof input !== "object" || Array.isArray(input) || input.kind !== "PLACE_TEXT") {
            throw new Runtime.ProviderError("INVALID_INPUT", "Open-Meteo Geocoding accepts one public place name only.");
        }
        const query = String(input.query || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
        if (!query || query.length > 240 || /<\/?script\b|javascript:|data:|https?:\/\//i.test(query)) {
            throw new Runtime.ProviderError("INVALID_INPUT", "Enter a short public place name only.");
        }
        return Object.freeze({kind: "PLACE_TEXT", query});
    }

    function retryAfterMs(response) {
        const value = response && response.headers && response.headers.get && response.headers.get("retry-after");
        if (!value) return null;
        const seconds = Number(value);
        return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
    }

    class ProviderAdapter {
        constructor(provider, options = {}) {
            this.provider = provider;
            this.fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
        }
        getMetadata() { return this.provider; }
        getCapabilities() { return (this.provider.capabilities || []).slice(); }
        getPolicy() { return Policy; }
        getStatus() { return {status: this.provider.providerStatus || "UNKNOWN"}; }
        getRateLimitState() { return Runtime.createRateLimitState(); }
        async checkHealth() { return {status: "UNKNOWN", checkedAt: new Date().toISOString()}; }
        async query() { throw new Runtime.ProviderError("UNSUPPORTED", "This provider has no native query adapter.", {providerId: this.provider.id}); }
        normalizeResult() { throw new Runtime.ProviderError("NORMALIZATION_FAILED", "Provider result could not be normalized.", {providerId: this.provider.id}); }
        cancel() { return false; }
        dispose() {}
    }

    class ExternalWebAdapter extends ProviderAdapter {
        async query() { throw new Runtime.ProviderError("UNSUPPORTED", "External web providers do not expose a native query in this phase.", {providerId: this.provider.id}); }
        canOpen() { return Policy.canLaunch(this.provider); }
    }

    class RestApiAdapter extends ProviderAdapter {
        async fetchJson(url, context, timeoutMs = WAYBACK_TIMEOUT_MS) {
            if (!context.networkAllowed) throw new Runtime.ProviderError("NETWORK_DISABLED", "Network access is disabled by provider policy.", {providerId: context.providerId});
            if (typeof this.fetchImpl !== "function") throw new Runtime.ProviderError("OFFLINE", "Network support is unavailable in this runtime.", {providerId: context.providerId, retryable: true});
            if (context.abortSignal.aborted) throw new Runtime.ProviderError("CANCELLED", "The query was cancelled.", {providerId: context.providerId});
            let timeoutTriggered = false;
            const controller = new AbortController();
            const abortLinked = () => controller.abort();
            context.abortSignal.addEventListener("abort", abortLinked, {once: true});
            const timer = setTimeout(() => { timeoutTriggered = true; controller.abort(); }, timeoutMs);
            try {
                const response = await this.fetchImpl(url, {method: "GET", signal: controller.signal, credentials: "omit", cache: "no-store"});
                if (response.status === 429) {
                    const limit = Runtime.createRateLimitState({limited: true, retryAfterMs: retryAfterMs(response), source: "HTTP_RESPONSE"});
                    throw new Runtime.ProviderError("RATE_LIMITED", "The provider rate-limited this request.", {providerId: context.providerId, retryable: true, safeDetails: {rateLimit: limit}});
                }
                if (response.status === 401 || response.status === 403) throw new Runtime.ProviderError("AUTH_FAILED", "The provider denied this request.", {providerId: context.providerId});
                if (!response.ok) throw new Runtime.ProviderError(response.status >= 500 ? "OFFLINE" : "PROVIDER_ERROR", "The provider is temporarily unavailable.", {providerId: context.providerId, retryable: response.status >= 500});
                try { return await response.json(); }
                catch (error) { throw new Runtime.ProviderError("NORMALIZATION_FAILED", "The provider returned an unreadable response.", {providerId: context.providerId}); }
            } catch (error) {
                if (error instanceof Runtime.ProviderError) throw error;
                if (timeoutTriggered) throw new Runtime.ProviderError("TIMEOUT", "The provider did not respond before the timeout.", {providerId: context.providerId, retryable: true});
                if (context.abortSignal.aborted) throw new Runtime.ProviderError("CANCELLED", "The query was cancelled.", {providerId: context.providerId});
                throw new Runtime.ProviderError("OFFLINE", "The provider could not be reached.", {providerId: context.providerId, retryable: true});
            } finally {
                clearTimeout(timer);
                context.abortSignal.removeEventListener("abort", abortLinked);
            }
        }
    }

    class LocalToolAdapter extends ProviderAdapter {
        async query() { throw new Runtime.ProviderError("UNSUPPORTED", "Local tool execution is disabled in this phase.", {providerId: this.provider.id}); }
    }

    class SystemIntegrationAdapter extends ProviderAdapter {
        async query() { throw new Runtime.ProviderError("UNSUPPORTED", "System integrations are disabled in this phase.", {providerId: this.provider.id}); }
    }

    class ReferenceOnlyAdapter extends ProviderAdapter {
        getStatus() { return {status: "REFERENCE_ONLY"}; }
        async checkHealth() { throw new Runtime.ProviderError("REFERENCE_ONLY_PROVIDER", "Reference-only entries cannot perform health checks.", {providerId: this.provider.id}); }
        async query() { throw new Runtime.ProviderError("REFERENCE_ONLY_PROVIDER", "Reference-only entries cannot perform queries.", {providerId: this.provider.id}); }
        async launch() { throw new Runtime.ProviderError("REFERENCE_ONLY_PROVIDER", "Reference-only entries cannot be launched.", {providerId: this.provider.id}); }
        async integrate() { throw new Runtime.ProviderError("REFERENCE_ONLY_PROVIDER", "Reference-only entries cannot be integrated.", {providerId: this.provider.id}); }
    }

    class WaybackAdapter extends RestApiAdapter {
        validateInput(input) { return validateWaybackInput(input); }
        buildRequest(input) { return `${WAYBACK_AVAILABILITY_ENDPOINT}?url=${encodeURIComponent(input)}`; }
        async checkHealth(context) {
            if (!context || !context.userInitiated) return {status: "UNKNOWN", checkedAt: new Date().toISOString()};
            return {status: "UNKNOWN", checkedAt: new Date().toISOString(), note: "Health is evaluated by a user-initiated query; no background polling occurs."};
        }
        async query(input, context) {
            const submittedInput = String(input || "").trim();
            const canonicalInput = this.validateInput(submittedInput);
            const raw = await this.fetchJson(this.buildRequest(canonicalInput), context, WAYBACK_TIMEOUT_MS);
            return this.normalizeResult(raw, context, submittedInput, canonicalInput);
        }
        normalizeResult(raw, context, originalInput, canonicalInput = originalInput) {
            if (!raw || typeof raw !== "object" || !raw.archived_snapshots || typeof raw.archived_snapshots !== "object") {
                throw new Runtime.ProviderError("NORMALIZATION_FAILED", "The archive response did not match the expected format.", {providerId: context.providerId});
            }
            const closest = raw.archived_snapshots.closest;
            const completedAt = new Date().toISOString();
            const base = {requestId: context.requestId, providerId: context.providerId, capability: context.capability, queriedAt: context.startedAt, completedAt, durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(context.startedAt).getTime()), source: {provider: "Internet Archive Wayback Machine", type: "PUBLIC_AVAILABILITY_API"}, confidence: "PROVIDER_REPORTED"};
            if (!closest || closest.available !== true || typeof closest.url !== "string") {
                return Runtime.createNormalizedResult({...base, status: "EMPTY", summary: "No public snapshot is available for this URL.", data: {available: false, originalInput, canonicalUrl: canonicalInput, snapshotUrl: null, snapshotTimestamp: null, provider: "Wayback Machine", queriedAt: context.startedAt, completedAt, confidence: "PROVIDER_REPORTED", warnings: []}, warnings: []});
            }
            let snapshotUrl;
            try {
                snapshotUrl = new URL(closest.url).toString();
            } catch (error) {
                throw new Runtime.ProviderError("NORMALIZATION_FAILED", "The archive response contained an invalid snapshot URL.", {providerId: context.providerId});
            }
            return Runtime.createNormalizedResult({...base, status: "SUCCESS", summary: "A public snapshot is available from the archive.", data: {available: true, originalInput, canonicalUrl: String(raw.url || canonicalInput), snapshotUrl, snapshotTimestamp: String(closest.timestamp || "UNKNOWN"), provider: "Wayback Machine", queriedAt: context.startedAt, completedAt, confidence: "PROVIDER_REPORTED", warnings: []}, warnings: []});
        }
    }

    class OpenMeteoGeocodingAdapter extends RestApiAdapter {
        validateInput(input) { return validateOpenMeteoPlaceInput(input); }
        buildRequest(input, context) {
            const url = new URL(OPEN_METEO_GEOCODING_ENDPOINT);
            url.searchParams.set("name", input.query);
            url.searchParams.set("count", "5");
            url.searchParams.set("language", String(context && context.locale || "en").slice(0, 2));
            url.searchParams.set("format", "json");
            return url.toString();
        }
        async checkHealth(context) {
            if (!context || !context.userInitiated) return {status: "UNKNOWN", checkedAt: new Date().toISOString()};
            return {status: "UNKNOWN", checkedAt: new Date().toISOString(), note: "Health is evaluated by an explicit geospatial query; no background polling occurs."};
        }
        async query(input, context) {
            const validated = this.validateInput(input);
            const raw = await this.fetchJson(this.buildRequest(validated, context), context, OPEN_METEO_TIMEOUT_MS);
            return this.normalizeResult(raw, context, validated);
        }
        normalizeResult(raw, context, input) {
            if (!raw || typeof raw !== "object" || (raw.results !== undefined && !Array.isArray(raw.results))) {
                throw new Runtime.ProviderError("NORMALIZATION_FAILED", "The geocoding response did not match the expected format.", {providerId: context.providerId});
            }
            const completedAt = new Date().toISOString();
            const base = {requestId: context.requestId, providerId: context.providerId, capability: context.capability, queriedAt: context.startedAt, completedAt, durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(context.startedAt).getTime()), source: {provider: "Open-Meteo Geocoding", type: "PUBLIC_GEOCODING_API"}, confidence: "PROVIDER_REPORTED"};
            const candidates = (raw.results || []).map(item => {
                const latitude = Number(item && item.latitude);
                const longitude = Number(item && item.longitude);
                if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
                const label = [item.name, item.admin1, item.country].filter(Boolean).map(value => String(value).replace(/\s+/g, " ").trim()).join(", ");
                return {latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7)), displayName: label || null, locality: item.name ? String(item.name).slice(0, 180) : null, region: item.admin1 ? String(item.admin1).slice(0, 180) : null, country: item.country ? String(item.country).slice(0, 180) : null, countryCode: item.country_code ? String(item.country_code).slice(0, 12).toUpperCase() : null, elevationM: Number.isFinite(Number(item.elevation)) ? Number(Number(item.elevation).toFixed(2)) : null};
            }).filter(Boolean).slice(0, 5);
            if (!candidates.length) {
                return Runtime.createNormalizedResult({...base, status: "EMPTY", summary: "No public geocoding candidate was returned for this place text.", data: {available: false, originalInput: input.query, canonicalUrl: null, snapshotUrl: null, snapshotTimestamp: null, provider: "Open-Meteo Geocoding", queriedAt: context.startedAt, completedAt, confidence: "PROVIDER_REPORTED", warnings: [], geoCandidates: []}, warnings: []});
            }
            return Runtime.createNormalizedResult({...base, status: "SUCCESS", summary: `${candidates.length} public geocoding candidate${candidates.length === 1 ? "" : "s"} returned; choose one before treating it as a normalized location.`, data: {available: true, originalInput: input.query, canonicalUrl: null, snapshotUrl: null, snapshotTimestamp: null, provider: "Open-Meteo Geocoding", queriedAt: context.startedAt, completedAt, confidence: "PROVIDER_REPORTED", warnings: [], geoCandidates: candidates}, warnings: []});
        }
    }

    function dnsStatus(code) {
        return ({0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 4: "NOTIMP", 5: "REFUSED"})[Number(code)] || "UNKNOWN";
    }

    function normalizeDnsValue(type, value) {
        const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
        if (!text) return null;
        // TXT fields can be very large. They are rendered only as a bounded,
        // context record; no provider payload is retained.
        return text.slice(0, type === "TXT" ? 1024 : 320);
    }

    class GooglePublicDnsAdapter extends RestApiAdapter {
        validateInput(input) {
            const target = input && typeof input === "object" && input.normalizedTarget ? input : DomainInfrastructure.normalizeInput(input);
            if (target.targetType !== "DOMAIN") throw new Runtime.ProviderError("INVALID_INPUT", "Google Public DNS accepts one normalized public domain only.", {providerId: this.provider.id});
            return target;
        }
        buildRequest(target, recordType) {
            if (!DomainInfrastructure.DNS_RECORD_TYPES.includes(recordType)) throw new Runtime.ProviderError("INVALID_INPUT", "Only the approved DNS record types are supported.", {providerId: this.provider.id});
            const url = new URL(GOOGLE_DNS_DOH_ENDPOINT);
            url.searchParams.set("name", target.normalizedTarget);
            url.searchParams.set("type", recordType);
            url.searchParams.set("do", "false");
            url.searchParams.set("cd", "false");
            return url.toString();
        }
        async query(input, context) {
            const target = this.validateInput(input);
            const settled = await Promise.allSettled(DomainInfrastructure.DNS_RECORD_TYPES.map(async type => ({type, raw: await this.fetchJson(this.buildRequest(target, type), context, GOOGLE_DNS_TIMEOUT_MS)})));
            if (context.abortSignal && context.abortSignal.aborted) throw new Runtime.ProviderError("CANCELLED", "DNS context was cancelled.", {providerId: context.providerId});
            const rawResults = settled.map((result, index) => result.status === "fulfilled"
                ? result.value
                : {type: DomainInfrastructure.DNS_RECORD_TYPES[index], error: result.reason});
            if (!rawResults.some(item => item.raw)) {
                const cause = rawResults.find(item => item.error)?.error;
                throw cause instanceof Runtime.ProviderError ? cause : new Runtime.ProviderError("PROVIDER_UNAVAILABLE", "The DNS provider did not return a usable response.", {providerId: context.providerId});
            }
            return this.normalizeResult(rawResults, context, target);
        }
        normalizeResult(results, context, target) {
            if (!Array.isArray(results) || results.length !== DomainInfrastructure.DNS_RECORD_TYPES.length) throw new Runtime.ProviderError("NORMALIZATION_FAILED", "The DNS response did not match the fixed query set.", {providerId: context.providerId});
            const warnings = [];
            const records = results.map(item => {
                if (item.error) {
                    warnings.push(`DNS ${item.type} was unavailable: ${safeText(item.error && item.error.message, "Provider request failed.")}`);
                    return Object.freeze({type: item.type, status: item.error.code || "PROVIDER_UNAVAILABLE", values: Object.freeze([])});
                }
                if (!item.raw || typeof item.raw !== "object" || (item.raw.Answer !== undefined && !Array.isArray(item.raw.Answer))) throw new Runtime.ProviderError("NORMALIZATION_FAILED", "The DNS provider returned an unreadable record response.", {providerId: context.providerId});
                const values = (item.raw.Answer || []).map(answer => normalizeDnsValue(item.type, answer && answer.data)).filter(Boolean).slice(0, 12);
                return Object.freeze({type: item.type, status: dnsStatus(item.raw.Status), values: Object.freeze(values)});
            });
            const nonEmpty = records.filter(record => record.values.length).length;
            const unavailable = records.filter(record => record.status === "PROVIDER_UNAVAILABLE" || record.status === "TIMEOUT").length;
            const completedAt = new Date().toISOString();
            return Runtime.createNormalizedResult({
                requestId: context.requestId, providerId: context.providerId, capability: context.capability, status: unavailable ? "PARTIAL" : nonEmpty ? "SUCCESS" : "EMPTY", queriedAt: context.startedAt, completedAt,
                durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(context.startedAt).getTime()),
                summary: unavailable ? `${nonEmpty} fixed DNS record group${nonEmpty === 1 ? "" : "s"} returned; ${unavailable} record group${unavailable === 1 ? "" : "s"} unavailable.` : nonEmpty ? `${nonEmpty} fixed DNS record group${nonEmpty === 1 ? "" : "s"} returned for the explicit domain.` : "No values were returned for the fixed DNS record set.",
                data: {target: target.normalizedTarget, targetType: target.targetType, records, warnings: Object.freeze(warnings.slice(0, 6))}, warnings: Object.freeze(warnings.slice(0, 6)), source: {provider: "Google Public DNS", type: "PUBLIC_DNS_OVER_HTTPS"}, confidence: "PROVIDER_REPORTED"
            });
        }
    }

    class RIPEstatNetworkInfoAdapter extends RestApiAdapter {
        validateInput(input) {
            const target = input && typeof input === "object" && input.normalizedTarget ? input : DomainInfrastructure.normalizeInput(input);
            if (!["IPv4", "IPv6"].includes(target.targetType)) throw new Runtime.ProviderError("INVALID_INPUT", "RIPEstat Network Info accepts one normalized public IP address only.", {providerId: this.provider.id});
            return target;
        }
        buildRequest(target) {
            const url = new URL(RIPESTAT_NETWORK_INFO_ENDPOINT);
            url.searchParams.set("resource", target.normalizedTarget);
            return url.toString();
        }
        async query(input, context) {
            const target = this.validateInput(input);
            const raw = await this.fetchJson(this.buildRequest(target), context, RIPESTAT_TIMEOUT_MS);
            return this.normalizeResult(raw, context, target);
        }
        normalizeResult(raw, context, target) {
            const data = raw && raw.data;
            if (!raw || typeof raw !== "object" || !data || typeof data !== "object") throw new Runtime.ProviderError("NORMALIZATION_FAILED", "The network provider returned an unreadable response.", {providerId: context.providerId});
            const asns = (Array.isArray(data.asns) ? data.asns : []).map(value => String(value).replace(/[^0-9]/g, "")).filter(Boolean).slice(0, 12).map(value => `AS${value}`);
            const network = Object.freeze({ip: target.normalizedTarget, asns: Object.freeze(asns), prefix: safeText(data.prefix, "NOT RETURNED").replace("[URL REDACTED]", "NOT RETURNED"), rir: data.rir ? safeText(data.rir, "NOT RETURNED").replace("[URL REDACTED]", "NOT RETURNED") : "NOT RETURNED", country: null, allocationContext: asns.length ? "Containing network and announcing ASN context returned by RIPEstat." : "RIPEstat returned no announcing ASN context for this public IP."});
            const completedAt = new Date().toISOString();
            return Runtime.createNormalizedResult({
                requestId: context.requestId, providerId: context.providerId, capability: context.capability, status: asns.length || network.prefix !== "NOT RETURNED" ? "SUCCESS" : "EMPTY", queriedAt: context.startedAt, completedAt,
                durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(context.startedAt).getTime()), summary: asns.length ? "Public network and ASN context returned for the explicit IP." : "No public ASN context was returned for the explicit IP.",
                data: {target: target.normalizedTarget, targetType: target.targetType, network}, warnings: [], source: {provider: "RIPEstat Network Info", type: "PUBLIC_NETWORK_INFORMATION_API"}, confidence: "PROVIDER_REPORTED"
            });
        }
    }

    // One DOI maps to one fixed Crossref works endpoint. This is deliberately
    // not a search, pagination, crawler or generic scholarly-data adapter.
    class CrossrefWorksAdapter extends RestApiAdapter {
        validateInput(input) {
            if (input && typeof input === "object" && input.sourceType === "DOI" && input.identifiers && input.identifiers.doi) return input;
            return ResearchSource.normalizeDoi(input);
        }
        buildRequest(source) {
            return `${CROSSREF_WORKS_ENDPOINT}${encodeURIComponent(source.identifiers.doi)}`;
        }
        async checkHealth(context) {
            if (!context || !context.userInitiated) return {status: "UNKNOWN", checkedAt: new Date().toISOString()};
            return {status: "UNKNOWN", checkedAt: new Date().toISOString(), note: "Health is evaluated only by one explicit DOI query; no background polling occurs."};
        }
        async query(input, context) {
            const source = this.validateInput(input);
            const raw = await this.fetchJson(this.buildRequest(source), context, CROSSREF_TIMEOUT_MS);
            return this.normalizeResult(raw, context, source);
        }
        normalizeResult(raw, context, source) {
            const metadata = ResearchSource.normalizeCrossrefMetadata(raw, source.identifiers.doi);
            const completedAt = new Date().toISOString();
            return Runtime.createNormalizedResult({
                requestId: context.requestId, providerId: context.providerId, capability: context.capability,
                status: metadata.title ? "SUCCESS" : "PARTIAL", queriedAt: context.startedAt, completedAt,
                durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(context.startedAt).getTime()),
                summary: metadata.title ? "Crossref returned bounded metadata for the explicit DOI." : "Crossref returned an incomplete metadata record for the explicit DOI.",
                data: {source, metadata, provider: "Crossref", queriedAt: context.startedAt, completedAt, confidence: "PROVIDER_REPORTED", warnings: []}, warnings: [],
                source: {provider: "Crossref", type: "PUBLIC_SCHOLARLY_METADATA_API"}, confidence: "PROVIDER_REPORTED"
            });
        }
    }

    class AdapterFactory {
        constructor(options = {}) {
            this.providerRegistry = options.providerRegistry;
            this.fetchImpl = options.fetchImpl;
        }
        getProvider(providerId) {
            return this.providerRegistry && typeof this.providerRegistry.getProvider === "function" ? this.providerRegistry.getProvider(providerId) : null;
        }
        createAdapter(providerId) {
            const provider = this.getProvider(providerId);
            if (!provider) throw new Runtime.ProviderError("PROVIDER_NOT_FOUND", "Provider record is unavailable.", {providerId});
            if (Policy.isReferenceOnly(provider)) throw new Runtime.ProviderError("REFERENCE_ONLY_PROVIDER", "Reference-only entries cannot receive an operational adapter.", {providerId});
            if (["DISABLED", "UNSUPPORTED"].includes(provider.providerStatus)) throw new Runtime.ProviderError("PROVIDER_DISABLED", "This provider is disabled.", {providerId});
            if (provider.runtimeAdapter === "WAYBACK_AVAILABILITY") return new WaybackAdapter(provider, {fetchImpl: this.fetchImpl});
            if (provider.runtimeAdapter === "OPEN_METEO_GEOCODING") return new OpenMeteoGeocodingAdapter(provider, {fetchImpl: this.fetchImpl});
            if (provider.runtimeAdapter === "GOOGLE_DNS_DOH") return new GooglePublicDnsAdapter(provider, {fetchImpl: this.fetchImpl});
            if (provider.runtimeAdapter === "RIPESTAT_NETWORK_INFO") return new RIPEstatNetworkInfoAdapter(provider, {fetchImpl: this.fetchImpl});
            if (provider.runtimeAdapter === "CROSSREF_WORKS") return new CrossrefWorksAdapter(provider, {fetchImpl: this.fetchImpl});
            if (provider.runtimeAdapter === "EXTERNAL_WEB") return new ExternalWebAdapter(provider, {fetchImpl: this.fetchImpl});
            if (provider.runtimeAdapter === "LOCAL_TOOL") return new LocalToolAdapter(provider, {fetchImpl: this.fetchImpl});
            if (provider.runtimeAdapter === "SYSTEM_INTEGRATION") return new SystemIntegrationAdapter(provider, {fetchImpl: this.fetchImpl});
            throw new Runtime.ProviderError("ADAPTER_NOT_FOUND", "No supported adapter is configured for this provider.", {providerId});
        }
        createReferenceAdapter(providerId) {
            const provider = this.getProvider(providerId);
            if (!provider) throw new Runtime.ProviderError("PROVIDER_NOT_FOUND", "Provider record is unavailable.", {providerId});
            if (!Policy.isReferenceOnly(provider)) throw new Runtime.ProviderError("ADAPTER_NOT_FOUND", "This provider is not reference-only.", {providerId});
            return new ReferenceOnlyAdapter(provider, {fetchImpl: this.fetchImpl});
        }
    }

    return Object.freeze({WAYBACK_AVAILABILITY_ENDPOINT, WAYBACK_TIMEOUT_MS, OPEN_METEO_GEOCODING_ENDPOINT, OPEN_METEO_TIMEOUT_MS, GOOGLE_DNS_DOH_ENDPOINT, GOOGLE_DNS_TIMEOUT_MS, RIPESTAT_NETWORK_INFO_ENDPOINT, RIPESTAT_TIMEOUT_MS, CROSSREF_WORKS_ENDPOINT, CROSSREF_TIMEOUT_MS, ProviderAdapter, ExternalWebAdapter, RestApiAdapter, LocalToolAdapter, SystemIntegrationAdapter, ReferenceOnlyAdapter, WaybackAdapter, OpenMeteoGeocodingAdapter, GooglePublicDnsAdapter, RIPEstatNetworkInfoAdapter, CrossrefWorksAdapter, AdapterFactory, validateWaybackInput, validateOpenMeteoPlaceInput, safeText});
});

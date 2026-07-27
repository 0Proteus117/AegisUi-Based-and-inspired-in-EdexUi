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
    if (!Runtime || !Policy) throw new Error("OSINT provider runtime and policy must load before adapters.");

    const WAYBACK_AVAILABILITY_ENDPOINT = "https://archive.org/wayback/available";
    const WAYBACK_TIMEOUT_MS = 9000;

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

    return Object.freeze({WAYBACK_AVAILABILITY_ENDPOINT, WAYBACK_TIMEOUT_MS, ProviderAdapter, ExternalWebAdapter, RestApiAdapter, LocalToolAdapter, SystemIntegrationAdapter, ReferenceOnlyAdapter, WaybackAdapter, AdapterFactory, validateWaybackInput, safeText});
});

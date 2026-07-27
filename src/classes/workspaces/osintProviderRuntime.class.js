(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTProviderRuntime = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const RESULT_STATUSES = Object.freeze(["SUCCESS", "EMPTY", "PARTIAL", "ERROR", "CANCELLED", "POLICY_BLOCKED", "OFFLINE", "RATE_LIMITED", "KEY_REQUIRED"]);
    const HEALTH_STATES = Object.freeze(["UNKNOWN", "READY", "DEGRADED", "OFFLINE", "RATE_LIMITED", "KEY_REQUIRED", "DISABLED", "REFERENCE_ONLY"]);
    const ERROR_CODES = Object.freeze(["PROVIDER_NOT_FOUND", "ADAPTER_NOT_FOUND", "PROVIDER_DISABLED", "REFERENCE_ONLY_PROVIDER", "POLICY_BLOCKED", "INVALID_INPUT", "NETWORK_DISABLED", "OFFLINE", "TIMEOUT", "RATE_LIMITED", "KEY_REQUIRED", "AUTH_FAILED", "PROVIDER_ERROR", "NORMALIZATION_FAILED", "CANCELLED", "UNKNOWN_ERROR", "UNSUPPORTED"]);
    let requestSequence = 0;

    class ProviderError extends Error {
        constructor(code, userMessage, options = {}) {
            super(userMessage || "Provider request failed.");
            this.name = "ProviderError";
            this.code = ERROR_CODES.includes(code) ? code : "UNKNOWN_ERROR";
            this.userMessage = String(userMessage || "Provider request failed.").slice(0, 240);
            this.providerId = options.providerId || null;
            this.retryable = Boolean(options.retryable);
            this.timestamp = options.timestamp || new Date().toISOString();
            this.safeDetails = options.safeDetails && typeof options.safeDetails === "object" ? Object.freeze({...options.safeDetails}) : null;
        }
    }

    function createRequestId(prefix = "osint") {
        requestSequence += 1;
        return `${prefix}-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
    }

    function createQueryContext(input = {}) {
        if (!input || input.userInitiated !== true) {
            throw new ProviderError("POLICY_BLOCKED", "Queries must be explicitly initiated by the user.");
        }
        if (!input.providerId || !input.capability) {
            throw new ProviderError("INVALID_INPUT", "Provider and capability are required for a query.", {providerId: input.providerId || null});
        }
        const controller = input.abortController || new AbortController();
        return Object.freeze({
            requestId: String(input.requestId || createRequestId()),
            providerId: String(input.providerId),
            capability: String(input.capability),
            startedAt: input.startedAt || new Date().toISOString(),
            locale: String(input.locale || "en"),
            timezone: String(input.timezone || "UTC"),
            networkAllowed: input.networkAllowed === true,
            userInitiated: true,
            abortSignal: controller.signal,
            abortController: controller,
            sessionId: String(input.sessionId || "ephemeral"),
            privacyMode: String(input.privacyMode || "EPHEMERAL")
        });
    }

    function createRateLimitState(input = {}) {
        return Object.freeze({
            limited: input.limited === true,
            remaining: Number.isFinite(input.remaining) ? input.remaining : null,
            resetAt: input.resetAt || null,
            retryAfterMs: Number.isFinite(input.retryAfterMs) ? input.retryAfterMs : null,
            source: input.source || null,
            observedAt: input.observedAt || new Date().toISOString()
        });
    }

    function createNormalizedResult(input = {}) {
        const status = RESULT_STATUSES.includes(input.status) ? input.status : "ERROR";
        return Object.freeze({
            requestId: String(input.requestId || createRequestId()),
            providerId: String(input.providerId || "unknown"),
            capability: String(input.capability || "UNKNOWN"),
            status,
            queriedAt: input.queriedAt || new Date().toISOString(),
            completedAt: input.completedAt || new Date().toISOString(),
            durationMs: Math.max(0, Number(input.durationMs) || 0),
            summary: String(input.summary || "Provider request completed.").slice(0, 360),
            data: input.data && typeof input.data === "object" ? Object.freeze({...input.data}) : Object.freeze({}),
            warnings: Object.freeze(Array.isArray(input.warnings) ? input.warnings.map(value => String(value).slice(0, 240)) : []),
            source: input.source && typeof input.source === "object" ? Object.freeze({...input.source}) : Object.freeze({}),
            confidence: String(input.confidence || "UNKNOWN"),
            rawAvailable: false,
            error: input.error ? Object.freeze({code: String(input.error.code || "UNKNOWN_ERROR"), userMessage: String(input.error.userMessage || "Provider request failed.").slice(0, 240), retryable: Boolean(input.error.retryable)}) : null
        });
    }

    function resultFromError(error, context, startedAt = Date.now()) {
        const safe = error instanceof ProviderError
            ? error
            : new ProviderError("UNKNOWN_ERROR", "The provider returned an unexpected error.", {providerId: context.providerId});
        const statusByCode = {CANCELLED: "CANCELLED", POLICY_BLOCKED: "POLICY_BLOCKED", OFFLINE: "OFFLINE", TIMEOUT: "ERROR", RATE_LIMITED: "RATE_LIMITED", KEY_REQUIRED: "KEY_REQUIRED"};
        return createNormalizedResult({
            requestId: context.requestId,
            providerId: context.providerId,
            capability: context.capability,
            status: statusByCode[safe.code] || "ERROR",
            queriedAt: context.startedAt,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            summary: safe.userMessage,
            error: safe
        });
    }

    class ProviderRegistry {
        constructor(registry) {
            this.registry = registry || {PROVIDERS: []};
        }

        getProvider(providerId) {
            if (typeof this.registry.getProvider === "function") return this.registry.getProvider(providerId);
            return (this.registry.PROVIDERS || []).find(provider => provider.id === providerId) || null;
        }

        getProviders(filters = {}) {
            if (typeof this.registry.getProviders === "function") return this.registry.getProviders(filters);
            return (this.registry.PROVIDERS || []).filter(provider => !filters.capability || provider.capabilities.includes(filters.capability));
        }
    }

    class ProviderRuntime {
        constructor(options = {}) {
            this.providerRegistry = options.providerRegistry instanceof ProviderRegistry
                ? options.providerRegistry
                : new ProviderRegistry(options.providerRegistry);
            this.capabilityRegistry = options.capabilityRegistry || null;
            this.adapterFactory = options.adapterFactory;
            this.activeRequests = new Map();
            this.healthByProvider = new Map();
            this.rateLimitByProvider = new Map();
            this.logger = typeof options.logger === "function" ? options.logger : () => {};
        }

        getProviderState(providerId) {
            const provider = this.providerRegistry.getProvider(providerId);
            if (!provider) return {health: "UNKNOWN", rateLimit: createRateLimitState()};
            const health = this.healthByProvider.get(provider.id)
                || (provider.providerStatus === "REFERENCE_ONLY" ? "REFERENCE_ONLY" : provider.providerStatus === "DISABLED" ? "DISABLED" : "UNKNOWN");
            return {health, rateLimit: this.rateLimitByProvider.get(provider.id) || createRateLimitState()};
        }

        setHealth(providerId, state) {
            this.healthByProvider.set(providerId, HEALTH_STATES.includes(state) ? state : "UNKNOWN");
            return this.getProviderState(providerId);
        }

        async checkHealth(providerId, options = {}) {
            const provider = this.providerRegistry.getProvider(providerId);
            if (!provider) throw new ProviderError("PROVIDER_NOT_FOUND", "Provider record is unavailable.", {providerId});
            const adapter = this.adapterFactory.createAdapter(provider.id);
            const context = createQueryContext({providerId: provider.id, capability: options.capability || provider.capabilities[0], userInitiated: options.userInitiated === true, networkAllowed: options.networkAllowed === true, locale: options.locale, timezone: options.timezone});
            const health = await adapter.checkHealth(context);
            this.setHealth(provider.id, health.status || "UNKNOWN");
            return health;
        }

        startQuery(providerId, input, options = {}) {
            const provider = this.providerRegistry.getProvider(providerId);
            const requestId = options.requestId || createRequestId();
            const startedMs = Date.now();
            if (!provider) {
                const context = {requestId, providerId, capability: options.capability || "UNKNOWN", startedAt: new Date().toISOString()};
                return {requestId, promise: Promise.resolve(resultFromError(new ProviderError("PROVIDER_NOT_FOUND", "Provider record is unavailable.", {providerId}), context, startedMs))};
            }
            let context;
            try {
                context = createQueryContext({
                    requestId,
                    providerId: provider.id,
                    capability: options.capability || provider.capabilities[0],
                    userInitiated: options.userInitiated === true,
                    networkAllowed: options.networkAllowed === true,
                    locale: options.locale,
                    timezone: options.timezone,
                    sessionId: options.sessionId,
                    privacyMode: "EPHEMERAL"
                });
            } catch (error) {
                const fallback = {requestId, providerId: provider.id, capability: options.capability || provider.capabilities[0], startedAt: new Date().toISOString()};
                return {requestId, promise: Promise.resolve(resultFromError(error, fallback, startedMs))};
            }
            let adapter;
            try {
                adapter = this.adapterFactory.createAdapter(provider.id);
            } catch (error) {
                return {requestId, promise: Promise.resolve(resultFromError(error, context, startedMs))};
            }
            const promise = Promise.resolve()
                .then(() => adapter.query(input, context))
                .catch(error => resultFromError(error, context, startedMs))
                .then(result => {
                    this.updateResultState(provider.id, result);
                    return result;
                })
                .finally(() => this.activeRequests.delete(requestId));
            this.activeRequests.set(requestId, {providerId: provider.id, adapter, context});
            this.logger({providerId: provider.id, requestId, state: "LOADING"});
            return {requestId, promise};
        }

        query(providerId, input, options = {}) {
            return this.startQuery(providerId, input, options).promise;
        }

        cancel(requestId) {
            const active = this.activeRequests.get(requestId);
            if (!active) return false;
            active.context.abortController.abort();
            if (active.adapter && typeof active.adapter.cancel === "function") active.adapter.cancel(requestId);
            this.logger({providerId: active.providerId, requestId, state: "CANCELLED"});
            return true;
        }

        updateResultState(providerId, result) {
            const healthByResult = {SUCCESS: "READY", EMPTY: "READY", PARTIAL: "DEGRADED", OFFLINE: "OFFLINE", RATE_LIMITED: "RATE_LIMITED", KEY_REQUIRED: "KEY_REQUIRED"};
            if (healthByResult[result.status]) this.setHealth(providerId, healthByResult[result.status]);
            if (result.status === "RATE_LIMITED" && result.data && result.data.rateLimit) this.rateLimitByProvider.set(providerId, createRateLimitState(result.data.rateLimit));
            this.logger({providerId, requestId: result.requestId, state: result.status, duration: result.durationMs, errorCode: result.error && result.error.code || null});
        }

        dispose() {
            [...this.activeRequests.keys()].forEach(requestId => this.cancel(requestId));
            this.activeRequests.clear();
            this.healthByProvider.clear();
            this.rateLimitByProvider.clear();
        }
    }

    return Object.freeze({RESULT_STATUSES, HEALTH_STATES, ERROR_CODES, ProviderError, ProviderRegistry, ProviderRuntime, createRequestId, createQueryContext, createRateLimitState, createNormalizedResult, resultFromError});
});

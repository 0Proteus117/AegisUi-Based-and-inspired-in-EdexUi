(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTToolAccessPanel = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    const PANEL_STATES = Object.freeze([
        "IDLE",
        "SELECTED",
        "READY",
        "LOADING",
        "RESULT",
        "ERROR",
        "OFFLINE",
        "RATE_LIMITED",
        "KEY_REQUIRED",
        "REFERENCE_ONLY"
    ]);
    const QUERY_STATES = Object.freeze(["IDLE", "LOADING", "RESULT", "ERROR", "OFFLINE", "RATE_LIMITED", "KEY_REQUIRED"]);
    const DEFAULT_HISTORY_LIMIT = 50;

    function formatEnum(value, fallback = "NOT AVAILABLE") {
        if (value === null || value === undefined || value === "") return fallback;
        return String(value).replace(/_/g, " ").replace(/\s+/g, " ").trim();
    }

    function formatList(values, fallback = "NOT DECLARED") {
        if (!Array.isArray(values) || !values.length) return fallback;
        return values.map(value => formatEnum(value, "")).filter(Boolean).join(" · ");
    }

    function sanitizeSummary(value, fallback = "") {
        if (value === null || value === undefined) return fallback;
        return String(value)
            .replace(/https?:\/\/[^\s]+/gi, "[URL REDACTED]")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 240) || fallback;
    }

    function providerSnapshot(provider) {
        if (!provider) return null;
        return {
            id: provider.id,
            name: provider.name,
            capability: Array.isArray(provider.capabilities) ? provider.capabilities[0] || null : null,
            providerStatus: provider.providerStatus || null,
            legalStatus: provider.legalStatus || null,
            referenceOnly: provider.providerType === "REFERENCE"
                && provider.accessMode === "REFERENCE_ONLY"
                && provider.providerStatus === "REFERENCE_ONLY"
        };
    }

    class SessionHistory {
        constructor(options = {}) {
            this.maxEntries = Math.max(1, Number(options.maxEntries) || DEFAULT_HISTORY_LIMIT);
            this.clock = typeof options.clock === "function" ? options.clock : () => new Date();
            this.reset();
        }

        reset() {
            this.history = [];
            this.activeProviderId = null;
            this.activeReferenceOnly = false;
            this.previewProviderId = null;
            this.panelState = "IDLE";
            this.providerStatus = null;
            this.queryState = "IDLE";
            this.legalStatus = null;
            this.lastAction = null;
            this.lastResult = null;
            this.lastError = null;
            this.clearArmed = false;
        }

        snapshot() {
            return Object.freeze({
                history: this.history.slice(),
                activeProviderId: this.activeProviderId,
                activeReferenceOnly: this.activeReferenceOnly,
                previewProviderId: this.previewProviderId,
                panelState: this.panelState,
                providerStatus: this.providerStatus,
                queryState: this.queryState,
                legalStatus: this.legalStatus,
                lastAction: this.lastAction,
                lastResult: this.lastResult,
                lastError: this.lastError,
                clearArmed: this.clearArmed
            });
        }

        append(provider, action, details = {}) {
            const snapshot = providerSnapshot(provider) || {};
            const event = Object.freeze({
                id: `osint-session-${this.clock().getTime()}-${this.history.length + 1}`,
                providerId: snapshot.id || null,
                providerName: snapshot.name || "AegisUi OSINT",
                capability: snapshot.capability,
                action: String(action || "UNKNOWN_ACTION"),
                timestamp: this.clock().toISOString(),
                state: String(details.state || this.panelState || "IDLE"),
                querySummary: sanitizeSummary(details.querySummary),
                resultSummary: sanitizeSummary(details.resultSummary),
                errorCode: details.errorCode ? String(details.errorCode) : null
            });
            this.history.push(event);
            if (this.history.length > this.maxEntries) this.history.splice(0, this.history.length - this.maxEntries);
            this.lastAction = event;
            return event;
        }

        select(provider) {
            const snapshot = providerSnapshot(provider);
            if (!snapshot) return this.snapshot();
            this.activeProviderId = snapshot.id;
            this.activeReferenceOnly = snapshot.referenceOnly;
            this.previewProviderId = null;
            this.providerStatus = snapshot.providerStatus;
            this.legalStatus = snapshot.legalStatus;
            this.queryState = "IDLE";
            this.lastResult = null;
            this.lastError = null;
            this.clearArmed = false;
            this.panelState = snapshot.referenceOnly ? "REFERENCE_ONLY" : "SELECTED";
            this.append(provider, "SELECT_PROVIDER", {state: this.panelState, resultSummary: "Provider selected"});
            return this.snapshot();
        }

        hover(provider) {
            const snapshot = providerSnapshot(provider);
            this.previewProviderId = snapshot ? snapshot.id : null;
            return this.snapshot();
        }

        clearHover() {
            this.previewProviderId = null;
            return this.snapshot();
        }

        recordAction(provider, action, details = {}) {
            this.clearArmed = false;
            return this.append(provider, action, details);
        }

        setPanelState(panelState, queryState = this.queryState) {
            this.panelState = PANEL_STATES.includes(panelState) ? panelState : "ERROR";
            this.queryState = QUERY_STATES.includes(queryState) ? queryState : "ERROR";
            return this.snapshot();
        }

        recordError(provider, code, message) {
            this.queryState = "ERROR";
            this.panelState = "ERROR";
            this.lastError = Object.freeze({
                code: String(code || "UNKNOWN_ERROR"),
                message: sanitizeSummary(message, "Action unavailable."),
                timestamp: this.clock().toISOString()
            });
            return this.append(provider, "POLICY_REJECTED", {
                state: this.panelState,
                resultSummary: this.lastError.message,
                errorCode: this.lastError.code
            });
        }

        requestClear() {
            if (!this.history.length) return {cleared: false, confirmationRequired: false};
            if (!this.clearArmed) {
                this.clearArmed = true;
                return {cleared: false, confirmationRequired: true};
            }
            this.history = [];
            this.lastAction = null;
            this.lastResult = null;
            this.lastError = null;
            this.queryState = "IDLE";
            this.clearArmed = false;
            this.panelState = this.activeProviderId ? (this.activeReferenceOnly ? "REFERENCE_ONLY" : "SELECTED") : "IDLE";
            return {cleared: true, confirmationRequired: false};
        }

        closeSelection() {
            this.activeProviderId = null;
            this.activeReferenceOnly = false;
            this.previewProviderId = null;
            this.providerStatus = null;
            this.legalStatus = null;
            this.queryState = "IDLE";
            this.lastResult = null;
            this.lastError = null;
            this.panelState = "IDLE";
            this.clearArmed = false;
            return this.snapshot();
        }
    }

    return Object.freeze({
        PANEL_STATES,
        QUERY_STATES,
        DEFAULT_HISTORY_LIMIT,
        formatEnum,
        formatList,
        sanitizeSummary,
        SessionHistory
    });
});

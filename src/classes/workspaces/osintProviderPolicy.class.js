(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTProviderPolicy = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    function isReferenceOnly(provider) {
        return Boolean(provider)
            && provider.providerType === "REFERENCE"
            && provider.accessMode === "REFERENCE_ONLY"
            && provider.providerStatus === "REFERENCE_ONLY";
    }

    function validWebUrl(value) {
        if (typeof value !== "string" || !value.trim()) return false;
        try {
            const url = new URL(value);
            return url.protocol === "https:" || url.protocol === "http:";
        } catch (error) {
            return false;
        }
    }

    function denied(code, message) {
        return Object.freeze({allowed: false, code, message});
    }

    function allowed(action) {
        return Object.freeze({allowed: true, action});
    }

    function canLaunch(provider) {
        if (!provider) return denied("PROVIDER_NOT_FOUND", "Provider record is unavailable.");
        if (isReferenceOnly(provider)) return denied("REFERENCE_ONLY", "Reference-only entries cannot be launched by AegisUi.");
        if (!provider.launchAllowed) return denied("LAUNCH_BLOCKED", "This provider is not approved for launch.");
        if (provider.accessMode !== "WEB") return denied("ACCESS_MODE_BLOCKED", "Only approved web providers can launch from this catalog.");
        if (!validWebUrl(provider.officialUrl)) return denied("INVALID_URL", "This provider has no valid approved launch URL.");
        if (["DISABLED", "UNSUPPORTED", "REFERENCE_ONLY"].includes(provider.providerStatus)) return denied("STATUS_BLOCKED", "This provider is not currently launchable.");
        return allowed("LAUNCH_EXTERNAL_WEB");
    }

    function canCopyUrl(provider) {
        const launch = canLaunch(provider);
        if (!launch.allowed) return denied(launch.code, launch.message);
        if (!provider.copyUrlAllowed) return denied("COPY_BLOCKED", "Copying this provider URL is not approved.");
        return allowed("COPY_APPROVED_URL");
    }

    function canViewDocs(provider) {
        if (!provider) return denied("PROVIDER_NOT_FOUND", "Provider record is unavailable.");
        if (isReferenceOnly(provider)) return denied("REFERENCE_ONLY", "Reference-only entries have no actionable documentation route.");
        if (["DISABLED", "UNSUPPORTED", "REFERENCE_ONLY"].includes(provider.providerStatus)) {
            return denied("STATUS_BLOCKED", "This provider is not currently available for documentation access.");
        }
        if (!validWebUrl(provider.docsUrl)) return denied("DOCS_UNAVAILABLE", "This provider has no approved documentation URL.");
        return allowed("VIEW_APPROVED_DOCUMENTATION");
    }

    function canReadReference(provider) {
        if (!provider) return denied("PROVIDER_NOT_FOUND", "Provider record is unavailable.");
        if (!isReferenceOnly(provider)) return denied("NOT_REFERENCE_ONLY", "This action is reserved for reference-only entries.");
        return allowed("READ_REFERENCE");
    }

    function canInstall(provider) {
        if (isReferenceOnly(provider)) return denied("REFERENCE_ONLY", "Reference-only entries cannot be installed by AegisUi.");
        return provider && provider.installationAllowed
            ? allowed("INSTALL_APPROVED_PROVIDER")
            : denied("INSTALL_BLOCKED", "Installation is not approved for this provider.");
    }

    function canConfigure(provider) {
        if (isReferenceOnly(provider)) return denied("REFERENCE_ONLY", "Reference-only entries cannot be configured by AegisUi.");
        return denied("CONFIGURATION_BLOCKED", "Provider configuration is outside this catalog phase.");
    }

    function canIntegrate(provider) {
        if (isReferenceOnly(provider)) return denied("REFERENCE_ONLY", "Reference-only entries cannot be integrated by AegisUi.");
        return provider && provider.integrationAllowed
            ? allowed("INTEGRATION_APPROVED")
            : denied("INTEGRATION_BLOCKED", "This provider has no approved runtime integration.");
    }

    function displayAccess(provider) {
        if (isReferenceOnly(provider)) return "REFERENCE ONLY";
        if (provider && provider.accessMode === "API") return "API";
        if (provider && provider.accessMode === "LOCAL") return "LOCAL";
        return "EXTERNAL";
    }

    return Object.freeze({
        isReferenceOnly,
        canOpen: canLaunch,
        canLaunch,
        canCopyUrl,
        canViewDocs,
        canReadReference,
        canInstall,
        canConfigure,
        canIntegrate,
        displayAccess
    });
});

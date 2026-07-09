(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) {
        root.AssistantAIProviderLayer = exported.AssistantAIProviderLayer;
        root.AssistantAppleNativeProvider = exported.AssistantAppleNativeProvider;
        root.AssistantOllamaProvider = exported.AssistantOllamaProvider;
    }
})(typeof window !== "undefined" ? window : null, function() {
    function optionalRequire(name) {
        try {
            if (typeof require === "function") return require(name);
        } catch (error) {}
        return null;
    }

    function getOllamaClientClass() {
        if (typeof window !== "undefined" && window.AssistantOllamaClient) return window.AssistantOllamaClient;
        const required = optionalRequire("./assistantOllamaClient.class.js");
        return required && required.AssistantOllamaClient ? required.AssistantOllamaClient : null;
    }

    class AssistantOllamaProvider {
        constructor(options = {}) {
            const Client = options.Client || getOllamaClientClass();
            this.client = options.client || (Client ? new Client({
                endpoint: options.endpoint || "http://127.0.0.1:11434",
                timeoutMs: options.timeoutMs || 60000
            }) : null);
        }

        getProviderId() {
            return "ollama";
        }

        getCapabilities() {
            return {
                chat: true,
                streaming: false,
                tools: false,
                images: false,
                localOnly: true,
                portable: true
            };
        }

        supportsStreaming() { return false; }
        supportsTools() { return false; }
        supportsImages() { return false; }
        supportsLocalOnly() { return true; }

        setEndpoint(endpoint) {
            if (this.client && this.client.setEndpoint) this.client.setEndpoint(endpoint);
        }

        async checkHealth(config = {}) {
            if (!this.client) {
                return {
                    ok: false,
                    status: "ERROR",
                    provider: "Ollama",
                    endpoint: config.endpoint || "http://127.0.0.1:11434",
                    error: "Ollama client unavailable",
                    models: []
                };
            }
            this.setEndpoint(config.endpoint || "http://127.0.0.1:11434");
            return this.client.checkHealth();
        }

        async listModels(config = {}) {
            return this.checkHealth(config);
        }

        async chat(request = {}) {
            if (!this.client) {
                return {ok: false, status: "ERROR", response: "", error: "Ollama client unavailable"};
            }
            if (request.endpoint) this.setEndpoint(request.endpoint);
            return this.client.chat(request);
        }
    }

    class AssistantAppleNativeProvider {
        getProviderId() {
            return "apple-native";
        }

        getCapabilities() {
            return {
                chat: false,
                streaming: false,
                tools: false,
                images: false,
                localOnly: true,
                portable: false,
                planned: true
            };
        }

        supportsStreaming() { return false; }
        supportsTools() { return false; }
        supportsImages() { return false; }
        supportsLocalOnly() { return true; }

        async checkHealth() {
            return {
                ok: false,
                status: "PLANNED",
                provider: "Apple Native",
                summary: "Apple Native provider is planned, not connected in this build.",
                models: []
            };
        }

        async listModels() {
            return this.checkHealth();
        }

        async chat() {
            return {
                ok: false,
                status: "PLANNED",
                response: "",
                error: "Apple Native provider is not connected in v2.2.0"
            };
        }
    }

    class AssistantAIProviderLayer {
        constructor(options = {}) {
            this.providers = new Map();
            this.register(new AssistantOllamaProvider(options.ollama || {}));
            this.register(new AssistantAppleNativeProvider());
        }

        register(provider) {
            if (!provider || typeof provider.getProviderId !== "function") return;
            this.providers.set(provider.getProviderId(), provider);
        }

        normalizeProviderId(id = "") {
            const value = String(id || "ollama").toLowerCase();
            if (value === "apple" || value === "apple-native" || value === "foundation-models") return "apple-native";
            return this.providers.has(value) ? value : "ollama";
        }

        getProvider(id = "ollama") {
            return this.providers.get(this.normalizeProviderId(id));
        }

        listProviders() {
            return Array.from(this.providers.values()).map(provider => ({
                id: provider.getProviderId(),
                capabilities: provider.getCapabilities()
            }));
        }

        async checkHealth(config = {}) {
            const provider = this.getProvider(config.provider);
            return provider.checkHealth(config);
        }

        async listModels(config = {}) {
            const provider = this.getProvider(config.provider);
            return provider.listModels(config);
        }

        async chat(request = {}) {
            const provider = this.getProvider(request.provider);
            return provider.chat(request);
        }

        getCapabilities(id = "ollama") {
            const provider = this.getProvider(id);
            return provider ? provider.getCapabilities() : {};
        }
    }

    return {
        AssistantAIProviderLayer,
        AssistantAppleNativeProvider,
        AssistantOllamaProvider
    };
});

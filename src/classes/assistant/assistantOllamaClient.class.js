(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.AssistantOllamaClient = exported.AssistantOllamaClient;
})(typeof window !== "undefined" ? window : null, function() {
    function optionalRequire(name) {
        try {
            if (typeof require === "function") return require(name);
        } catch (error) {}
        return null;
    }

    function normalizeEndpoint(endpoint = "") {
        return String(endpoint || "http://127.0.0.1:11434")
            .trim()
            .replace(/[,\s]+$/g, "")
            .replace(/\/+$/, "");
    }

    function validateEndpoint(endpoint = "") {
        const normalized = normalizeEndpoint(endpoint);
        try {
            const parsed = new URL(normalized);
            if (!["http:", "https:"].includes(parsed.protocol)) return {ok: false, status: "INVALID_ENDPOINT", endpoint: normalized};
            if (!parsed.hostname) return {ok: false, status: "INVALID_ENDPOINT", endpoint: normalized};
            return {ok: true, status: "OK", endpoint: normalized};
        } catch (error) {
            return {ok: false, status: "INVALID_ENDPOINT", endpoint: normalized, error: error.message || String(error)};
        }
    }

    function normalizeError(error, fallback = "ERROR") {
        const message = String((error && (error.code || error.message)) || error || fallback);
        if (/INVALID_ENDPOINT/i.test(message)) return "INVALID_ENDPOINT";
        if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|fetch failed|Failed to fetch|network/i.test(message)) return "OLLAMA_OFFLINE";
        if (/aborted/i.test(message)) return "CANCELLED";
        if (/timeout|ETIMEDOUT/i.test(message)) return "TIMEOUT";
        return fallback;
    }

    class AssistantOllamaClient {
        constructor(options = {}) {
            this.endpoint = normalizeEndpoint(options.endpoint);
            this.timeoutMs = Number(options.timeoutMs || 60000);
            this.http = options.http || optionalRequire("http");
            this.https = options.https || optionalRequire("https");
            this.URL = options.URL || (typeof URL !== "undefined" ? URL : null);
        }

        setEndpoint(endpoint) {
            this.endpoint = normalizeEndpoint(endpoint);
        }

        validateEndpoint(endpoint = this.endpoint) {
            return validateEndpoint(endpoint);
        }

        request(path = "/", options = {}) {
            const method = options.method || "GET";
            const body = options.body ? JSON.stringify(options.body) : null;
            const timeoutMs = Number(options.timeoutMs || this.timeoutMs || 60000);
            const endpoint = validateEndpoint(this.endpoint);
            if (!endpoint.ok) {
                const error = new Error("INVALID_ENDPOINT");
                error.code = "INVALID_ENDPOINT";
                return Promise.reject(error);
            }
            const url = `${this.endpoint}${path}`;

            if (this.http && this.https && this.URL) {
                return this.nodeRequest(url, {method, body, timeoutMs, signal: options.signal});
            }

            if (typeof fetch === "function") {
                const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
                const abort = () => controller && controller.abort();
                if (options.signal) {
                    if (options.signal.aborted) abort();
                    else options.signal.addEventListener("abort", abort, {once: true});
                }
                const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
                return fetch(url, {
                    method,
                    body,
                    headers: body ? {"Content-Type": "application/json"} : undefined,
                    signal: controller ? controller.signal : undefined
                }).then(async response => {
                    if (timer) clearTimeout(timer);
                    if (options.signal) options.signal.removeEventListener("abort", abort);
                    const text = await response.text();
                    if (!response.ok) {
                        const error = new Error(`HTTP_${response.status}: ${text.slice(0, 240)}`);
                        error.statusCode = response.status;
                        throw error;
                    }
                    return text ? JSON.parse(text) : {};
                }).catch(error => {
                    if (timer) clearTimeout(timer);
                    if (options.signal) options.signal.removeEventListener("abort", abort);
                    throw error;
                });
            }

            return Promise.reject(new Error("NO_HTTP_CLIENT"));
        }

        nodeRequest(url, options = {}) {
            return new Promise((resolve, reject) => {
                let parsed;
                try {
                    parsed = new this.URL(url);
                } catch (error) {
                    reject(error);
                    return;
                }

                const transport = parsed.protocol === "https:" ? this.https : this.http;
                const request = transport.request({
                    method: options.method || "GET",
                    hostname: parsed.hostname,
                    port: parsed.port,
                    path: `${parsed.pathname}${parsed.search}`,
                    headers: options.body ? {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(options.body)
                    } : {}
                }, response => {
                    let data = "";
                    response.setEncoding("utf8");
                    response.on("data", chunk => { data += chunk; });
                    response.on("end", () => {
                        if (response.statusCode < 200 || response.statusCode >= 300) {
                            const error = new Error(`HTTP_${response.statusCode}: ${data.slice(0, 240)}`);
                            error.statusCode = response.statusCode;
                            finish(reject)(error);
                            return;
                        }
                        try {
                            finish(resolve)(data ? JSON.parse(data) : {});
                        } catch (error) {
                            error.code = "INVALID_JSON";
                            finish(reject)(error);
                        }
                    });
                });

                let settled = false;
                const finish = callback => value => {
                    if (settled) return;
                    settled = true;
                    if (options.signal) options.signal.removeEventListener("abort", onAbort);
                    callback(value);
                };
                const onAbort = () => {
                    const error = new Error("ABORTED");
                    error.code = "ABORTED";
                    request.destroy(error);
                };
                request.on("error", finish(reject));
                if (options.signal) {
                    if (options.signal.aborted) onAbort();
                    else options.signal.addEventListener("abort", onAbort, {once: true});
                }
                request.setTimeout(options.timeoutMs || this.timeoutMs || 60000, () => {
                    request.destroy(new Error("TIMEOUT"));
                });
                if (options.body) request.write(options.body);
                request.end();
            });
        }

        async checkHealth() {
            const checkedAt = new Date().toISOString();
            const endpoint = validateEndpoint(this.endpoint);
            if (!endpoint.ok) {
                return {
                    ok: false,
                    status: "INVALID_ENDPOINT",
                    endpoint: endpoint.endpoint,
                    checkedAt,
                    error: endpoint.error || "Invalid Ollama endpoint",
                    models: []
                };
            }

            try {
                const data = await this.request("/api/tags", {method: "GET", timeoutMs: 5000});
                const models = Array.isArray(data.models) ? data.models.map(model => model.name).filter(Boolean) : [];
                return {ok: true, status: "READY", endpoint: endpoint.endpoint, checkedAt, models};
            } catch (error) {
                return {
                    ok: false,
                    status: normalizeError(error, "OLLAMA_OFFLINE"),
                    endpoint: endpoint.endpoint,
                    checkedAt,
                    error: error.message || String(error),
                    models: []
                };
            }
        }

        async listModels() {
            const health = await this.checkHealth();
            return health;
        }

        async ensureModelAvailable(model = "") {
            const health = await this.checkHealth();
            if (!health.ok) return health;
            const wanted = String(model || "").trim();
            const exists = health.models.some(name => name === wanted || name.replace(/:latest$/, "") === wanted);
            return exists
                ? {...health, status: "READY", model: wanted}
                : {...health, ok: false, status: "MODEL_NOT_FOUND", model: wanted};
        }

        async chat({model, messages, temperature, signal} = {}) {
            try {
                const data = await this.request("/api/chat", {
                    method: "POST",
                    timeoutMs: this.timeoutMs,
                    body: {
                        model,
                        messages: Array.isArray(messages) ? messages : [],
                        stream: false,
                        options: {
                            temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.5
                        }
                    },
                    signal
                });
                const content = data && data.message && typeof data.message.content === "string"
                    ? data.message.content.trim()
                    : "";
                if (!content) return {ok: false, status: "INVALID_RESPONSE", response: "", raw: data};
                return {ok: true, status: "READY", response: content, raw: data};
            } catch (error) {
                const status = error && error.statusCode === 404 ? "MODEL_NOT_FOUND" : normalizeError(error, "ERROR");
                return {ok: false, status, error: error.message || String(error), response: ""};
            }
        }
    }

    return {AssistantOllamaClient};
});

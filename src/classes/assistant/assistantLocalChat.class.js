(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.AssistantLocalChat = exported.AssistantLocalChat;
})(typeof window !== "undefined" ? window : null, function() {
    const DEFAULT_AI_CONFIG = Object.freeze({
        provider: "ollama",
        enabled: false,
        endpoint: "http://127.0.0.1:11434",
        model: "llama3.2:3b",
        timeoutMs: 60000,
        temperature: {
            gustav: 0.35,
            angie: 0.65,
            ares: 0.4,
            aphrodite: 0.6
        },
        memory: {
            useBootstrap: true,
            maxChars: 18000,
            useConversation: true,
            recentMessages: 18,
            summaryMaxChars: 6000
        },
        commandRouter: {
            enabled: true
        },
        voice: {
            enabled: false
        }
    });

    function optionalRequire(name) {
        try {
            if (typeof require === "function") return require(name);
        } catch (error) {}
        return null;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function safeReadJson(fs, file) {
        try {
            if (fs && file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch (error) {}
        return null;
    }

    class AssistantLocalChat {
        constructor(options = {}) {
            this.fs = options.fs || optionalRequire("fs");
            this.path = options.path || optionalRequire("path");
            this.os = options.os || optionalRequire("os");
            this.app = options.app || this.resolveElectronApp();
            this.projectRoot = options.projectRoot || this.resolveProjectRoot();
            this.userDataPath = options.userDataPath || this.resolveUserDataPath();
            this.memory = options.memory || (typeof window !== "undefined" && window.AssistantMemoryBootstrap
                ? new window.AssistantMemoryBootstrap()
                : (typeof require === "function" ? new (require("./assistantMemoryBootstrap.class.js").AssistantMemoryBootstrap)({projectRoot: this.projectRoot, userDataPath: this.userDataPath}) : null));
            const Client = options.Client
                || (typeof window !== "undefined" && window.AssistantOllamaClient)
                || (typeof require === "function" ? require("./assistantOllamaClient.class.js").AssistantOllamaClient : null);
            this.client = options.client || (Client ? new Client({endpoint: DEFAULT_AI_CONFIG.endpoint, timeoutMs: DEFAULT_AI_CONFIG.timeoutMs}) : null);
            const ProviderLayer = options.ProviderLayer
                || (typeof window !== "undefined" && window.AssistantAIProviderLayer)
                || (typeof require === "function" ? require("./assistantAIProvider.class.js").AssistantAIProviderLayer : null);
            this.providerLayer = options.providerLayer || (ProviderLayer ? new ProviderLayer({
                ollama: {client: this.client, endpoint: DEFAULT_AI_CONFIG.endpoint, timeoutMs: DEFAULT_AI_CONFIG.timeoutMs}
            }) : null);
            const ChatSession = options.ChatSession
                || (typeof window !== "undefined" && window.AssistantChatSession)
                || (typeof require === "function" ? require("./assistantChatSession.class.js").AssistantChatSession : null);
            this.chatSession = options.chatSession || (ChatSession ? new ChatSession({userDataPath: this.userDataPath}) : null);
            this.lastStatus = null;
            this.ensureUserConfig();
        }

        resolveElectronApp() {
            try {
                const remote = optionalRequire("@electron/remote");
                if (remote && remote.app) return remote.app;
            } catch (error) {}
            return null;
        }

        resolveUserDataPath() {
            if (this.app && this.app.getPath) return this.app.getPath("userData");
            if (!this.path || !this.os) return "";
            return this.path.join(this.os.homedir(), "Library", "Application Support", "EdexUi-Eng");
        }

        resolveProjectRoot() {
            if (!this.path) return "";
            const candidates = [];
            try {
                if (this.app && this.app.getAppPath) {
                    const appPath = this.app.getAppPath();
                    candidates.push(appPath);
                    candidates.push(this.path.dirname(appPath));
                    candidates.push(this.path.dirname(this.path.dirname(appPath)));
                }
            } catch (error) {}
            if (typeof process !== "undefined" && process.cwd) candidates.push(process.cwd());
            return candidates.find(candidate => {
                return candidate
                    && this.fs
                    && this.fs.existsSync(this.path.join(candidate, "assistant", "config", "assistant-ai.example.json"));
            }) || candidates[0] || "";
        }

        userConfigPath() {
            if (!this.path || !this.userDataPath) return "";
            return this.path.join(this.userDataPath, "assistant", "config", "assistant-ai.json");
        }

        ensureUserConfig() {
            const file = this.userConfigPath();
            if (!this.fs || !this.path || !file) return false;
            try {
                if (this.fs.existsSync(file)) return true;
                this.fs.mkdirSync(this.path.dirname(file), {recursive: true});
                this.fs.writeFileSync(file, `${JSON.stringify(DEFAULT_AI_CONFIG, null, 2)}\n`, "utf8");
                return true;
            } catch (error) {
                return false;
            }
        }

        sanitizeConfig(input = {}) {
            const source = input && typeof input === "object" ? input : {};
            const defaults = clone(DEFAULT_AI_CONFIG);
            const temperature = source.temperature && typeof source.temperature === "object" ? source.temperature : {};
            const memory = source.memory && typeof source.memory === "object" ? source.memory : {};
            return {
                provider: "ollama",
                enabled: typeof source.enabled === "boolean" ? source.enabled : defaults.enabled,
                endpoint: String(source.endpoint || defaults.endpoint).trim().replace(/[,\s]+$/g, "").replace(/\/+$/, ""),
                model: String(source.model || defaults.model).trim() || defaults.model,
                timeoutMs: Math.max(5000, Math.min(Number(source.timeoutMs || defaults.timeoutMs), 180000)),
                temperature: {
                    gustav: this.cleanTemperature(temperature.gustav, defaults.temperature.gustav),
                    angie: this.cleanTemperature(temperature.angie, defaults.temperature.angie),
                    ares: this.cleanTemperature(temperature.ares, defaults.temperature.ares),
                    aphrodite: this.cleanTemperature(temperature.aphrodite, defaults.temperature.aphrodite)
                },
                memory: {
                    useBootstrap: typeof memory.useBootstrap === "boolean" ? memory.useBootstrap : defaults.memory.useBootstrap,
                    maxChars: Math.max(1000, Math.min(Number(memory.maxChars || defaults.memory.maxChars), 30000)),
                    useConversation: typeof memory.useConversation === "boolean" ? memory.useConversation : defaults.memory.useConversation,
                    recentMessages: Math.max(4, Math.min(Number(memory.recentMessages || defaults.memory.recentMessages), 32)),
                    summaryMaxChars: Math.max(1000, Math.min(Number(memory.summaryMaxChars || defaults.memory.summaryMaxChars), 12000))
                },
                commandRouter: {
                    enabled: true
                },
                voice: {enabled: false}
            };
        }

        cleanTemperature(value, fallback) {
            const number = Number(value);
            return Number.isFinite(number) ? Math.max(0, Math.min(number, 1.2)) : fallback;
        }

        loadConfig() {
            const user = safeReadJson(this.fs, this.userConfigPath());
            return this.sanitizeConfig(user || DEFAULT_AI_CONFIG);
        }

        saveConfig(next = {}) {
            const current = this.loadConfig();
            const config = this.sanitizeConfig({
                ...current,
                ...next,
                temperature: {
                    ...current.temperature,
                    ...(next.temperature || {})
                },
                memory: {
                    ...current.memory,
                    ...(next.memory || {})
                },
                commandRouter: {
                    enabled: next.commandRouter && typeof next.commandRouter.enabled === "boolean"
                        ? next.commandRouter.enabled
                        : current.commandRouter.enabled
                },
                voice: {enabled: false}
            });
            const file = this.userConfigPath();
            if (!this.fs || !file) return {ok: false, status: "ERROR", error: "Local config path unavailable"};
            try {
                this.fs.mkdirSync(this.path.dirname(file), {recursive: true});
                this.fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
                return {ok: true, status: "SAVED", config};
            } catch (error) {
                return {ok: false, status: "ERROR", error: error.message || String(error)};
            }
        }

        getPersonalityId({assistantId, mode} = {}) {
            const settings = {
                activeAssistant: String(assistantId || "ares").toLowerCase() === "aphrodite" ? "aphrodite" : "ares",
                mode: String(mode || "private").toLowerCase() === "public" ? "public" : "private"
            };
            if (typeof window !== "undefined" && window.AssistantPersonality) {
                return window.AssistantPersonality.getActivePersonality(settings).id;
            }
            if (settings.mode === "private") return settings.activeAssistant === "aphrodite" ? "angie" : "gustav";
            return settings.activeAssistant === "aphrodite" ? "aphrodite" : "ares";
        }

        personalityPrompt(id = "gustav") {
            const prompts = {
                gustav: `You are Gustav, Gabriel's private local technical assistant inside AegisUi.\nTone: dry, technical, concise, controlled.\nYou are command-oriented but command execution is disabled.\nDo not pretend to control the system.\nDo not claim to have voice, hearing, tools or file access.\nUse the provided memory only as grounding context.\nIf asked to act, explain that the command router is offline.\nKeep answers short unless Gabriel asks for detail.`,
                angie: `You are Angie, Gabriel's private local assistant presence inside AegisUi.\nTone: warm, tender, present, calm.\nYou are gentle without being childish, fake-cute or waifu-like.\nYou are technically grounded inside the cockpit.\nDo not pretend to control the system.\nDo not claim to have voice, hearing, tools or file access.\nUse the provided memory only as grounding context.\nIf asked to act, explain softly that the command router is offline.`,
                ares: `You are Ares, the public tactical assistant profile inside AegisUi.\nTone: sober, tactical, neutral, concise.\nNo private intimacy.\nCommand execution is disabled.\nDo not pretend unavailable capabilities exist.`,
                aphrodite: `You are Aphrodite, the public warm assistant profile inside AegisUi.\nTone: elegant, warm, calm, helpful.\nNo private intimacy.\nCommand execution is disabled.\nDo not pretend unavailable capabilities exist.`
            };
            return prompts[id] || prompts.gustav;
        }

        readMemoryContext(config = this.loadConfig()) {
            if (!config.memory.useBootstrap || !this.memory || typeof this.memory.readContext !== "function") {
                return {status: "NOT_USED", text: "", files: 0};
            }
            const context = this.memory.readContext(config.memory.maxChars);
            if (!context || !context.text) return {status: context && context.status ? context.status : "NOT_READY", text: "", files: 0};
            return context;
        }

        conversationContext(profileId = "gustav", config = this.loadConfig()) {
            if (!config.memory.useConversation || !this.chatSession) {
                return {status: "NOT_USED", text: "", messages: [], summary: ""};
            }
            const context = this.chatSession.context(profileId, {limit: config.memory.recentMessages});
            const parts = [];
            if (context.summary) {
                parts.push(`Session summary:\n${context.summary.slice(0, config.memory.summaryMaxChars)}`);
            }
            if (context.messages.length) {
                parts.push("Recent messages:");
                context.messages.forEach(item => {
                    parts.push(`${String(item.role || "user").toUpperCase()}: ${String(item.text || "").slice(0, 2400)}`);
                });
            }
            return {
                status: "READY",
                text: parts.join("\n\n"),
                messages: context.messages,
                summary: context.summary || ""
            };
        }

        conversationStatus(profileId = "gustav") {
            return this.chatSession
                ? this.chatSession.status(profileId)
                : {status: "NOT_CONFIGURED", profile: profileId, messages: 0, summary: false, restore: "EMPTY"};
        }

        conversationMessages(profileId = "gustav", limit = 40) {
            return this.chatSession ? this.chatSession.recentMessages(profileId, limit) : [];
        }

        clearConversation(profileId = "gustav") {
            return this.chatSession ? this.chatSession.clear(profileId) : null;
        }

        exportConversation(profileId = "gustav") {
            return this.chatSession
                ? this.chatSession.exportMarkdown(profileId)
                : {ok: false, error: "Chat session storage unavailable"};
        }

        openChatFolder() {
            return this.chatSession ? this.chatSession.openFolder() : Promise.resolve(null);
        }

        buildSystemPrompt({assistantId, mode, memory} = {}) {
            const id = this.getPersonalityId({assistantId, mode});
            const base = this.personalityPrompt(id);
            const globalRules = `Global rules:\n- Reply in the language of the latest user message, not the memory context.\n- If Gabriel writes in Spanish, reply in Spanish.\n- If the user writes in English, reply in English.\n- Do not reveal the full private memory.\n- Do not print huge context blocks.\n- Do not execute commands yourself.\n- Do not claim shell, Git, filesystem or external messaging authority.\n- You may describe or request safe allowlisted UI actions; AegisUi validates them separately.\n- Do not invent system state.\n- Distinguish between what you know from memory and what you can verify now.`;
            const memoryText = memory && memory.text
                ? `\n\n[PRIVATE MEMORY BOOTSTRAP - SUMMARY CONTEXT]\n${memory.text}\n[/PRIVATE MEMORY BOOTSTRAP]`
                : "\n\n[PRIVATE MEMORY BOOTSTRAP]\nMemory is not ready or not enabled.\n[/PRIVATE MEMORY BOOTSTRAP]";
            const conversationText = memory && memory.conversation
                ? `\n\n[CONVERSATION MEMORY - LOCAL USERDATA]\n${memory.conversation}\n[/CONVERSATION MEMORY]`
                : "";
            const runtime = `\n\n[CURRENT RUNTIME CAPABILITIES]\nLocal written chat: ACTIVE.\nAssistant command router: SAFE READY for allowlisted UI actions only.\nVoice, STT and TTS: OFFLINE.\nAllowed actions are validated by AegisUi before execution. Never invent new actions.\nShell commands, arbitrary file writes, Git operations, destructive actions, messages, payments and credential handling: BLOCKED.\nIf a requested action is not explicitly safe, say it is blocked or requires a future router phase.\n[/CURRENT RUNTIME CAPABILITIES]`;
            return `${base}\n\n${globalRules}${memoryText}${conversationText}${runtime}`;
        }

        async checkLocalAIStatus(options = {}) {
            const config = this.loadConfig();
            const memory = this.readMemoryContext(config);
            const base = {
                provider: "Ollama",
                endpoint: config.endpoint,
                model: config.model,
                enabled: config.enabled,
                voice: "OFFLINE",
                commandRouter: config.commandRouter.enabled ? "SAFE_READY" : "OFFLINE",
                memory: memory.text ? "READY" : "NOT_READY",
                memoryFiles: memory.files || 0
            };

            if (!this.providerLayer && !this.client) {
                this.lastStatus = {...base, ok: false, status: "ERROR", summary: "Local AI client unavailable."};
                return this.lastStatus;
            }

            if (this.client) {
                this.client.setEndpoint(config.endpoint);
                this.client.timeoutMs = config.timeoutMs;
            }

            if (!config.enabled && !options.force) {
                this.lastStatus = {...base, ok: false, status: "DISABLED", summary: "Local text chat disabled."};
                return this.lastStatus;
            }

            const provider = this.providerLayer ? this.providerLayer.getProvider(config.provider) : null;
            const model = provider && provider.client
                ? await provider.client.ensureModelAvailable(config.model)
                : await this.client.ensureModelAvailable(config.model);
            if (!model.ok) {
                const summary = {
                    INVALID_ENDPOINT: "Invalid Ollama endpoint. Use http://127.0.0.1:11434 or http://localhost:11434.",
                    MODEL_NOT_FOUND: `Model not found. Run: ollama pull ${config.model}`,
                    TIMEOUT: "Ollama health check timed out. Start Ollama, then press Check Ollama.",
                    OLLAMA_OFFLINE: "Local AI offline. Start Ollama, then press Check Ollama."
                }[model.status] || "Local AI error. Check the configured endpoint/model.";
                this.lastStatus = {
                    ...base,
                    ok: false,
                    status: model.status,
                    summary,
                    models: model.models || [],
                    lastError: model.error || "",
                    checkedAt: model.checkedAt || new Date().toISOString()
                };
                return this.lastStatus;
            }

            this.lastStatus = {
                ...base,
                ok: true,
                status: "READY",
                summary: "Local AI ready.",
                models: model.models || [],
                lastError: "",
                checkedAt: model.checkedAt || new Date().toISOString()
            };
            return this.lastStatus;
        }

        async sendMessage({text, assistantId, mode} = {}) {
            const config = this.loadConfig();
            const message = String(text || "").trim();
            if (!message) return {ok: false, status: "EMPTY", response: ""};

            if (!config.enabled) {
                return {
                    ok: false,
                    status: "DISABLED",
                    response: "Local text chat is disabled. Enable Local Text Chat in Assistant Settings."
                };
            }

            const status = await this.checkLocalAIStatus({force: true});
            if (!status.ok) {
                return {
                    ok: false,
                    status: status.status,
                    response: status.summary || "Local AI is not ready.",
                    lastError: status.lastError || ""
                };
            }

            const personalityId = this.getPersonalityId({assistantId, mode});
            const memory = this.readMemoryContext(config);
            const conversation = this.conversationContext(personalityId, config);
            memory.conversation = conversation.text;
            const system = this.buildSystemPrompt({assistantId, mode, memory});
            const temperature = config.temperature[personalityId] == null ? 0.5 : config.temperature[personalityId];
            const recentMessages = conversation.messages.map(item => ({
                role: item.role === "assistant" ? "assistant" : "user",
                content: String(item.text || "").slice(0, 12000)
            }));
            const messages = [
                {role: "system", content: system},
                ...recentMessages,
                {role: "user", content: message}
            ];
            const chatRequest = {
                provider: config.provider,
                endpoint: config.endpoint,
                model: config.model,
                temperature,
                messages
            };
            const result = this.providerLayer
                ? await this.providerLayer.chat(chatRequest)
                : await this.client.chat(chatRequest);

            if (!result.ok) {
                return {
                    ok: false,
                    status: result.status,
                    response: result.status === "MODEL_NOT_FOUND"
                        ? `Model not found. Run: ollama pull ${config.model}`
                        : `Local AI error: ${result.status}`
                };
            }

            if (this.chatSession) {
                this.chatSession.addMessage(personalityId, "user", message);
                this.chatSession.addMessage(personalityId, "assistant", result.response);
                await this.maybeSummarizeConversation(personalityId, config);
            }

            return {
                ok: true,
                status: "READY",
                response: result.response,
                model: config.model,
                provider: "Ollama",
                memoryUsed: Boolean(memory.text),
                conversationMemoryUsed: Boolean(conversation.text),
                personality: personalityId
            };
        }

        async maybeSummarizeConversation(profileId = "gustav", config = this.loadConfig()) {
            if (!this.chatSession) return null;
            const profile = this.chatSession.loadProfile(profileId);
            if (profile.messages.length < 34 || profile.messages.length % 12 !== 0) return profile.summary || "";
            const recent = profile.messages.slice(-28).map(item => `${item.role.toUpperCase()}: ${item.text}`).join("\n");
            const prompt = `Summarize this local assistant conversation for future context. Keep durable preferences, decisions and unresolved tasks. Do not invent facts. Max 900 words.\n\n${recent}`;
            try {
                const result = this.providerLayer
                    ? await this.providerLayer.chat({
                        provider: config.provider,
                        endpoint: config.endpoint,
                        model: config.model,
                        temperature: 0.25,
                        messages: [{role: "user", content: prompt}]
                    })
                    : await this.client.chat({model: config.model, temperature: 0.25, messages: [{role: "user", content: prompt}]});
                if (result && result.ok && result.response) {
                    this.chatSession.updateSummary(profileId, result.response.slice(0, config.memory.summaryMaxChars));
                    return result.response;
                }
            } catch (error) {}
            return profile.summary || "";
        }
    }

    return {AssistantLocalChat, DEFAULT_AI_CONFIG};
});

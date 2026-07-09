(function() {
    class AssistantBridge {
        constructor(options = {}) {
            this.settings = options.settings || null;
            this.setState = typeof options.setState === "function" ? options.setState : () => {};
            this.localChat = options.localChat || (window.AssistantLocalChat ? new window.AssistantLocalChat() : null);
            this.commandRouter = options.commandRouter || (window.AssistantCommandRouter ? new window.AssistantCommandRouter() : null);
        }

        async sendText(message = "") {
            const text = String(message || "").trim();
            const settings = this.settings ? this.settings.settings : {};
            if (!text) return {ok: false, status: "EMPTY", input: "", response: ""};

            if (!this.localChat) {
                return {
                    ok: false,
                    status: "OFFLINE",
                    input: text,
                    response: window.AssistantMicrocopy
                        ? window.AssistantMicrocopy.placeholderResponse(settings)
                        : "Assistant backend not connected yet.",
                    source: "local-placeholder"
                };
            }

            this.setState("THINKING");
            if (this.commandRouter) {
                const commandResult = await this.commandRouter.executeFromText(text);
                if (commandResult && commandResult.handled) {
                    this.setState(commandResult.ok ? "SPEAKING" : "ERROR");
                    return {
                        ok: Boolean(commandResult.ok),
                        status: commandResult.status || (commandResult.ok ? "EXECUTED" : "BLOCKED"),
                        input: text,
                        response: commandResult.response,
                        action: commandResult.action,
                        source: "assistant-command-router"
                    };
                }
            }
            const result = await this.localChat.sendMessage({
                text,
                assistantId: settings.activeAssistant,
                mode: settings.mode
            });
            this.setState(result.ok ? "SPEAKING" : "ERROR");
            return {
                ...result,
                input: text,
                source: result.ok ? "ollama-local" : "local-ai-status"
            };
        }

        async checkLocalAIStatus(options = {}) {
            if (!this.localChat) {
                return {
                    ok: false,
                    status: "ERROR",
                    provider: "Ollama",
                    endpoint: "127.0.0.1:11434",
                    model: "",
                    memory: "NOT_READY",
                    commandRouter: "OFFLINE",
                    voice: "OFFLINE",
                    summary: "Local AI bridge unavailable."
                };
            }
            return this.localChat.checkLocalAIStatus(options);
        }

        localAIConfig() {
            return this.localChat ? this.localChat.loadConfig() : null;
        }

        commandRouterStatus() {
            return this.commandRouter
                ? this.commandRouter.getStatus()
                : {status: "OFFLINE", mode: "Unavailable", actions: 0};
        }

        safeActions() {
            return this.commandRouter ? this.commandRouter.listActions() : [];
        }

        conversationProfileId() {
            const settings = this.settings ? this.settings.settings : {};
            return this.localChat
                ? this.localChat.getPersonalityId({assistantId: settings.activeAssistant, mode: settings.mode})
                : "gustav";
        }

        conversationStatus() {
            return this.localChat
                ? this.localChat.conversationStatus(this.conversationProfileId())
                : {status: "NOT_CONFIGURED", messages: 0, summary: false};
        }

        conversationMessages(limit = 40) {
            return this.localChat ? this.localChat.conversationMessages(this.conversationProfileId(), limit) : [];
        }

        clearConversation() {
            return this.localChat ? this.localChat.clearConversation(this.conversationProfileId()) : null;
        }

        exportConversation() {
            return this.localChat
                ? this.localChat.exportConversation(this.conversationProfileId())
                : {ok: false, error: "Conversation storage unavailable"};
        }

        openChatFolder() {
            return this.localChat ? this.localChat.openChatFolder() : Promise.resolve(null);
        }

        saveLocalAIConfig(partial = {}) {
            return this.localChat
                ? this.localChat.saveConfig(partial)
                : {ok: false, status: "ERROR", error: "Local AI bridge unavailable"};
        }

        async startListening() {
            const settings = this.settings ? this.settings.settings : {};
            return {
                ok: false,
                status: "OFFLINE",
                response: window.AssistantMicrocopy
                    ? window.AssistantMicrocopy.state(settings, "LISTENING")
                    : "Speech-to-text backend not connected yet."
            };
        }

        async stopListening() {
            return {
                ok: true,
                status: "IDLE",
                response: "Listening stopped locally."
            };
        }

        async speak(text = "") {
            const settings = this.settings ? this.settings.settings : {};
            return {
                ok: false,
                status: "OFFLINE",
                text: String(text || ""),
                response: window.AssistantMicrocopy
                    ? window.AssistantMicrocopy.voiceNotConfigured(settings)
                    : "Voice backend not connected yet."
            };
        }

        async checkBackendHealth() {
            const settings = this.settings ? this.settings.settings : {};
            return {
                ok: false,
                status: "OFFLINE",
                summary: window.AssistantMicrocopy
                    ? window.AssistantMicrocopy.backendOffline(settings)
                    : "Assistant backend not connected yet."
            };
        }

        async checkVoiceHealth() {
            const settings = this.settings ? this.settings.settings : {};
            return {
                ok: false,
                status: "OFFLINE",
                summary: window.AssistantMicrocopy
                    ? window.AssistantMicrocopy.voiceNotConfigured(settings)
                    : "Voice backend not connected yet."
            };
        }
    }

    window.AssistantBridge = AssistantBridge;
})();

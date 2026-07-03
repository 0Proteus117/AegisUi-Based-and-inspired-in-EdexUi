(function() {
    class AssistantBridge {
        constructor(options = {}) {
            this.settings = options.settings || null;
        }

        async sendText(message = "") {
            const text = String(message || "").trim();
            const settings = this.settings ? this.settings.settings : {};
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

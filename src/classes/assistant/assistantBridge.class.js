(function() {
    class AssistantBridge {
        constructor(options = {}) {
            this.settings = options.settings || null;
        }

        async sendText(message = "") {
            const text = String(message || "").trim();
            return {
                ok: false,
                status: "OFFLINE",
                input: text,
                response: "Assistant backend not connected yet.",
                source: "local-placeholder"
            };
        }

        async startListening() {
            return {
                ok: false,
                status: "OFFLINE",
                response: "Speech-to-text backend not connected yet."
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
            return {
                ok: false,
                status: "OFFLINE",
                text: String(text || ""),
                response: "Voice backend not connected yet."
            };
        }

        async checkBackendHealth() {
            return {
                ok: false,
                status: "OFFLINE",
                summary: "Assistant backend not connected yet."
            };
        }

        async checkVoiceHealth() {
            return {
                ok: false,
                status: "OFFLINE",
                summary: "Voice backend not connected yet."
            };
        }
    }

    window.AssistantBridge = AssistantBridge;
})();

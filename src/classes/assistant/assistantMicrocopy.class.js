(function() {
    class AssistantMicrocopy {
        static profile(settings = {}) {
            return window.AssistantPersonality
                ? window.AssistantPersonality.getActivePersonality(settings).id
                : "gustav";
        }

        static publicRole(settings = {}) {
            return window.AssistantPersonality
                ? window.AssistantPersonality.getPublicName(settings)
                : "Ares";
        }

        static tone(settings = {}) {
            return window.AssistantPersonality
                ? window.AssistantPersonality.getActivePersonality(settings)
                : {style: "command-oriented"};
        }

        static state(settings = {}, state = "IDLE") {
            return window.AssistantPersonality
                ? window.AssistantPersonality.getMicrocopy(settings, state)
                : "Assistant backend offline.";
        }

        static backendOffline(settings = {}) {
            return window.AssistantPersonality
                ? window.AssistantPersonality.getMicrocopy(settings, "BACKEND_OFFLINE")
                : "Assistant backend offline.";
        }

        static voiceNotConfigured(settings = {}) {
            return window.AssistantPersonality
                ? window.AssistantPersonality.getMicrocopy(settings, "VOICE_NOT_CONFIGURED")
                : "Voice provider not configured.";
        }

        static placeholderResponse(settings = {}) {
            return window.AssistantPersonality
                ? window.AssistantPersonality.getMicrocopy(settings, "PLACEHOLDER_RESPONSE")
                : "Backend offline. No action executed.";
        }

        static inputPlaceholder(settings = {}) {
            return window.AssistantPersonality
                ? window.AssistantPersonality.getInputPlaceholder(settings)
                : "Type a local prompt…";
        }

        static style(settings = {}) {
            return this.tone(settings).style || "command-oriented";
        }

        static all() {
            return window.AssistantPersonality ? window.AssistantPersonality.all() : {};
        }
    }

    window.AssistantMicrocopy = AssistantMicrocopy;
    window.ASSISTANT_MICROCOPY = window.AssistantPersonality ? window.AssistantPersonality.all() : {};
})();

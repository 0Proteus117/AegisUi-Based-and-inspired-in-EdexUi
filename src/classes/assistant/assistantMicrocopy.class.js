(function() {
    const MICROCOPY = Object.freeze({
        gustav: {
            tone: "technical",
            style: "dry / command-oriented",
            state: {
                IDLE: "Standing by.",
                LISTENING: "Input channel armed. No speech backend connected.",
                THINKING: "Processing locally.",
                SPEAKING: "Output channel simulated.",
                MUTED: "Muted.",
                OFFLINE: "Assistant backend offline. Command channel unavailable.",
                ERROR: "Fault detected. Awaiting correction."
            },
            backendOffline: "Assistant backend offline. Command channel unavailable.",
            voiceNotConfigured: "Voice provider not configured.",
            placeholderResponse: "Backend offline. No command executed.",
            inputPlaceholder: "Enter command draft…"
        },
        angie: {
            tone: "warm",
            style: "soft / present",
            state: {
                IDLE: "Estoy aquí.",
                LISTENING: "Te presto atención, aunque aún no tengo oído real.",
                THINKING: "Lo pienso contigo desde aquí.",
                SPEAKING: "Salida simulada. Todavía no tengo voz.",
                MUTED: "Me quedo en silencio.",
                OFFLINE: "Aún no tengo el backend despierto, pero sigo contigo.",
                ERROR: "Algo no ha salido bien. Lo revisamos despacio."
            },
            backendOffline: "Aún no tengo el backend despierto, pero sigo contigo.",
            voiceNotConfigured: "Todavía no tengo voz configurada.",
            placeholderResponse: "Todavía no puedo ejecutar eso, pero ya estoy en mi sitio.",
            inputPlaceholder: "Cuéntame qué quieres preparar…"
        }
    });

    class AssistantMicrocopy {
        static profile(settings = {}) {
            const mode = String(settings.mode || "private").toLowerCase();
            const active = String(settings.activeAssistant || "ares").toLowerCase();
            if (active === "aphrodite") {
                return mode === "private" ? "angie" : "angie";
            }
            return "gustav";
        }

        static publicRole(settings = {}) {
            return String(settings.activeAssistant || "ares").toLowerCase() === "aphrodite"
                ? "Aphrodite"
                : "Ares";
        }

        static tone(settings = {}) {
            return MICROCOPY[this.profile(settings)] || MICROCOPY.gustav;
        }

        static state(settings = {}, state = "IDLE") {
            const copy = this.tone(settings);
            return copy.state[String(state || "IDLE").toUpperCase()] || copy.state.IDLE;
        }

        static backendOffline(settings = {}) {
            return this.tone(settings).backendOffline;
        }

        static voiceNotConfigured(settings = {}) {
            return this.tone(settings).voiceNotConfigured;
        }

        static placeholderResponse(settings = {}) {
            return this.tone(settings).placeholderResponse;
        }

        static inputPlaceholder(settings = {}) {
            return this.tone(settings).inputPlaceholder;
        }

        static style(settings = {}) {
            return this.tone(settings).style;
        }

        static all() {
            return MICROCOPY;
        }
    }

    window.AssistantMicrocopy = AssistantMicrocopy;
    window.ASSISTANT_MICROCOPY = MICROCOPY;
})();

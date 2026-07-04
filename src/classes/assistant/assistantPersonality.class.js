(function() {
    const PROFILES = Object.freeze({
        gustav: {
            id: "gustav",
            publicName: "Ares",
            privateName: "Gustav",
            tone: "dry, technical, concise, controlled",
            style: "command-oriented",
            emotionalRange: "low",
            role: "private technical command presence",
            microcopy: {
                IDLE: "Standing by.",
                LISTENING: "Input channel open.",
                THINKING: "Processing.",
                SPEAKING: "Output active.",
                MUTED: "Muted.",
                OFFLINE: "Backend offline.",
                ERROR: "Fault detected.",
                BACKEND_OFFLINE: "Assistant backend offline. Command channel unavailable.",
                VOICE_NOT_CONFIGURED: "Voice provider not configured.",
                PLACEHOLDER_RESPONSE: "Backend offline. No command executed.",
                INPUT_PLACEHOLDER: "Enter command draft…"
            }
        },
        angie: {
            id: "angie",
            publicName: "Aphrodite",
            privateName: "Angie",
            tone: "warm, tender, present, calm",
            style: "soft technical companion",
            emotionalRange: "medium",
            role: "private warm cockpit presence",
            microcopy: {
                IDLE: "Estoy aquí.",
                LISTENING: "Te escucho.",
                THINKING: "Dame un segundo.",
                SPEAKING: "Te respondo.",
                MUTED: "Me quedo en silencio.",
                OFFLINE: "Aún no tengo el backend despierto.",
                ERROR: "Algo no ha salido bien. Lo revisamos despacio.",
                BACKEND_OFFLINE: "Aún no tengo el backend despierto, pero sigo contigo.",
                VOICE_NOT_CONFIGURED: "Todavía no tengo voz configurada.",
                PLACEHOLDER_RESPONSE: "Todavía no puedo ejecutar eso, pero ya estoy en mi sitio.",
                INPUT_PLACEHOLDER: "Dime qué quieres preparar…"
            }
        },
        ares: {
            id: "ares",
            publicName: "Ares",
            privateName: "",
            tone: "sober, tactical, concise, neutral",
            style: "public tactical assistant",
            emotionalRange: "low",
            role: "public operational presence",
            microcopy: {
                IDLE: "Standing by.",
                LISTENING: "Awaiting input.",
                THINKING: "Processing.",
                SPEAKING: "Response channel active.",
                MUTED: "Muted.",
                OFFLINE: "Assistant backend offline.",
                ERROR: "System fault detected.",
                BACKEND_OFFLINE: "Assistant backend offline. Command channel unavailable.",
                VOICE_NOT_CONFIGURED: "Voice provider not configured.",
                PLACEHOLDER_RESPONSE: "Backend offline. No action executed.",
                INPUT_PLACEHOLDER: "Enter request draft…"
            }
        },
        aphrodite: {
            id: "aphrodite",
            publicName: "Aphrodite",
            privateName: "",
            tone: "warm, elegant, calm, present",
            style: "public warm cockpit presence",
            emotionalRange: "medium",
            role: "public soft presence",
            microcopy: {
                IDLE: "Ready.",
                LISTENING: "Listening.",
                THINKING: "Thinking.",
                SPEAKING: "Responding.",
                MUTED: "Silent mode.",
                OFFLINE: "Assistant backend offline.",
                ERROR: "Something needs attention.",
                BACKEND_OFFLINE: "Assistant backend offline.",
                VOICE_NOT_CONFIGURED: "Voice provider not configured.",
                PLACEHOLDER_RESPONSE: "Backend offline. I cannot act yet.",
                INPUT_PLACEHOLDER: "Type a note or request draft…"
            }
        }
    });

    const PUBLIC_TO_PRIVATE = Object.freeze({
        ares: "gustav",
        aphrodite: "angie"
    });

    class AssistantPersonality {
        static normalizeMode(settings = {}) {
            return String(settings.mode || "private").toLowerCase() === "public"
                ? "public"
                : "private";
        }

        static normalizeActive(settings = {}) {
            return String(settings.activeAssistant || "ares").toLowerCase() === "aphrodite"
                ? "aphrodite"
                : "ares";
        }

        static getActivePersonality(settings = {}) {
            const mode = this.normalizeMode(settings);
            const active = this.normalizeActive(settings);
            const id = mode === "private" ? PUBLIC_TO_PRIVATE[active] : active;
            return PROFILES[id] || PROFILES.gustav;
        }

        static getPersonality(id = "gustav") {
            return PROFILES[String(id || "gustav").toLowerCase()] || PROFILES.gustav;
        }

        static getDisplayName(settings = {}) {
            const mode = this.normalizeMode(settings);
            const active = this.normalizeActive(settings);
            if (mode === "public") return active === "aphrodite" ? "Aphrodite" : "Ares";
            const aliases = settings.aliases && typeof settings.aliases === "object" ? settings.aliases : {};
            if (active === "aphrodite") return String(aliases.aphrodite || PROFILES.angie.privateName).slice(0, 32);
            return String(aliases.ares || PROFILES.gustav.privateName).slice(0, 32);
        }

        static getPublicName(settings = {}) {
            return this.normalizeActive(settings) === "aphrodite" ? "Aphrodite" : "Ares";
        }

        static getPrivateName(settings = {}) {
            return this.normalizeActive(settings) === "aphrodite" ? "Angie" : "Gustav";
        }

        static getSubtitle(settings = {}) {
            const mode = this.normalizeMode(settings);
            const publicName = this.getPublicName(settings);
            if (mode === "public") return `${publicName} · PUBLIC`;
            return `${publicName} / ${this.getPrivateName(settings)} · PRIVATE`;
        }

        static getToneLabel(settings = {}) {
            const personality = this.getActivePersonality(settings);
            if (personality.id === "gustav") return "technical command";
            if (personality.id === "angie") return "warm presence";
            if (personality.id === "ares") return "tactical public";
            return "warm public";
        }

        static getMicrocopy(personalityOrSettings = {}, state = "IDLE") {
            const personality = typeof personalityOrSettings === "string"
                ? this.getPersonality(personalityOrSettings)
                : this.getActivePersonality(personalityOrSettings);
            const key = String(state || "IDLE").toUpperCase();
            return personality.microcopy[key] || personality.microcopy.IDLE;
        }

        static getInputPlaceholder(settings = {}) {
            return this.getMicrocopy(settings, "INPUT_PLACEHOLDER");
        }

        static all() {
            return PROFILES;
        }
    }

    window.AssistantPersonality = AssistantPersonality;
    window.ASSISTANT_PERSONALITIES = PROFILES;
})();

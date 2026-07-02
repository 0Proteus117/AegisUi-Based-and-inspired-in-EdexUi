(function() {
    const DEFAULT_ASSISTANT_SETTINGS = Object.freeze({
        version: 1,
        mode: "private",
        activeAssistant: "ares",
        aliases: {
            ares: "Gustav",
            aphrodite: "Angie"
        },
        muted: false,
        voiceMode: "default-robotic",
        panelOpen: false,
        backend: {
            assistant: "OFFLINE",
            voice: "OFFLINE"
        }
    });

    class AssistantSettings {
        constructor(storageKey = "aegisui-assistant-settings-v1") {
            this.storageKey = storageKey;
            this.settings = this.load();
        }

        defaults() {
            return JSON.parse(JSON.stringify(DEFAULT_ASSISTANT_SETTINGS));
        }

        sanitize(input = {}) {
            const defaults = this.defaults();
            const source = input && typeof input === "object" ? input : {};
            const aliases = source.aliases && typeof source.aliases === "object" ? source.aliases : {};
            const backend = source.backend && typeof source.backend === "object" ? source.backend : {};
            const cleanStatus = value => ["OFFLINE", "READY", "ERROR"].includes(String(value || "").toUpperCase())
                ? String(value).toUpperCase()
                : "OFFLINE";

            return {
                version: 1,
                mode: ["public", "private"].includes(String(source.mode || "").toLowerCase())
                    ? String(source.mode).toLowerCase()
                    : defaults.mode,
                activeAssistant: ["ares", "aphrodite"].includes(String(source.activeAssistant || "").toLowerCase())
                    ? String(source.activeAssistant).toLowerCase()
                    : defaults.activeAssistant,
                aliases: {
                    ares: String(aliases.ares || defaults.aliases.ares).slice(0, 32),
                    aphrodite: String(aliases.aphrodite || defaults.aliases.aphrodite).slice(0, 32)
                },
                muted: typeof source.muted === "boolean" ? source.muted : defaults.muted,
                voiceMode: ["default-robotic", "local-custom", "not-configured"].includes(String(source.voiceMode || ""))
                    ? String(source.voiceMode)
                    : defaults.voiceMode,
                panelOpen: Boolean(source.panelOpen),
                backend: {
                    assistant: cleanStatus(backend.assistant),
                    voice: cleanStatus(backend.voice)
                }
            };
        }

        load() {
            try {
                return this.sanitize(JSON.parse(localStorage.getItem(this.storageKey) || "{}"));
            } catch (error) {
                return this.defaults();
            }
        }

        save(next = this.settings) {
            this.settings = this.sanitize(next);
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
            } catch (error) {}
            return this.settings;
        }

        patch(partial = {}) {
            return this.save({
                ...this.settings,
                ...partial,
                aliases: {
                    ...this.settings.aliases,
                    ...(partial.aliases || {})
                },
                backend: {
                    ...this.settings.backend,
                    ...(partial.backend || {})
                }
            });
        }

        displayName(profileId = this.settings.activeAssistant) {
            const id = String(profileId || "ares").toLowerCase();
            if (this.settings.mode === "private") {
                return id === "aphrodite" ? this.settings.aliases.aphrodite : this.settings.aliases.ares;
            }
            return id === "aphrodite" ? "Aphrodite" : "Ares";
        }

        publicName(profileId = this.settings.activeAssistant) {
            return String(profileId || "ares").toLowerCase() === "aphrodite" ? "Aphrodite" : "Ares";
        }
    }

    window.AssistantSettings = AssistantSettings;
    window.DEFAULT_ASSISTANT_SETTINGS = DEFAULT_ASSISTANT_SETTINGS;
})();

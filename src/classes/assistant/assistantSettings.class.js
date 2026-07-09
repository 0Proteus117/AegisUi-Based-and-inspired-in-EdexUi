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
        voiceMode: "not-configured",
        panelOpen: false,
        expandedChatOpen: false,
        restoreExpandedChat: false,
        lastState: "IDLE",
        backend: {
            assistant: "OFFLINE",
            voice: "OFFLINE",
            commandRouter: "SAFE_READY",
            memory: "READY"
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
            const cleanStatus = value => ["OFFLINE", "READY", "SAFE_READY", "ERROR"].includes(String(value || "").toUpperCase())
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
                voiceMode: ["not-configured", "default-robotic", "local-custom", "google-emotional-planned"].includes(String(source.voiceMode || ""))
                    ? String(source.voiceMode)
                    : defaults.voiceMode,
                panelOpen: Boolean(source.panelOpen),
                expandedChatOpen: Boolean(source.expandedChatOpen),
                restoreExpandedChat: Boolean(source.restoreExpandedChat),
                lastState: ["IDLE", "LISTENING", "THINKING", "SPEAKING", "MUTED", "OFFLINE", "ERROR"].includes(String(source.lastState || "").toUpperCase())
                    ? String(source.lastState).toUpperCase()
                    : defaults.lastState,
                backend: {
                    assistant: cleanStatus(backend.assistant),
                    voice: cleanStatus(backend.voice),
                    commandRouter: cleanStatus(backend.commandRouter),
                    memory: cleanStatus(backend.memory)
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
            const settings = {...this.settings, activeAssistant: profileId};
            return window.AssistantPersonality
                ? window.AssistantPersonality.getDisplayName(settings)
                : "Ares";
        }

        publicName(profileId = this.settings.activeAssistant) {
            const settings = {...this.settings, activeAssistant: profileId};
            return window.AssistantPersonality
                ? window.AssistantPersonality.getPublicName(settings)
                : "Ares";
        }

        subtitle(profileId = this.settings.activeAssistant) {
            const settings = {...this.settings, activeAssistant: profileId};
            return window.AssistantPersonality
                ? window.AssistantPersonality.getSubtitle(settings)
                : `${this.publicName(profileId)} · ${this.settings.mode.toUpperCase()}`;
        }

        microcopyProfile(profileId = this.settings.activeAssistant) {
            const settings = {...this.settings, activeAssistant: profileId};
            return window.AssistantPersonality
                ? window.AssistantPersonality.getActivePersonality(settings).id
                : "gustav";
        }

        toneLabel(profileId = this.settings.activeAssistant) {
            const settings = {...this.settings, activeAssistant: profileId};
            return window.AssistantPersonality
                ? window.AssistantPersonality.getToneLabel(settings)
                : "technical command";
        }
    }

    window.AssistantSettings = AssistantSettings;
    window.DEFAULT_ASSISTANT_SETTINGS = DEFAULT_ASSISTANT_SETTINGS;
})();

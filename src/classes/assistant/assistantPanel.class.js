(function() {
    function assistantEscape(value) {
        return window._escapeHtml(String(value == null ? "" : value));
    }

    class AssistantPanel {
        constructor(options = {}) {
            this.presence = options.presence;
            this.settings = options.settings;
            this.stateMachine = options.stateMachine;
            this.bridge = options.bridge;
            this.root = null;
            this.lastResponse = "";
            this.settingsVisible = false;
        }

        mount() {
            if (this.root) return this.root;
            this.root = document.createElement("aside");
            this.root.id = "assistant_presence_panel";
            this.root.className = "assistant-panel";
            this.root.setAttribute("aria-live", "polite");
            this.root.setAttribute("aria-label", "Assistant presence panel");
            document.body.appendChild(this.root);
            this.render();
            return this.root;
        }

        setOpen(open) {
            this.mount();
            this.root.classList.toggle("visible", Boolean(open));
            this.root.setAttribute("aria-hidden", open ? "false" : "true");
            this.settings.patch({panelOpen: Boolean(open)});
            if (open) {
                const input = this.root.querySelector("#assistant_manual_input");
                if (input) setTimeout(() => input.focus(), 120);
            }
        }

        isOpen() {
            return Boolean(this.root && this.root.classList.contains("visible"));
        }

        close() {
            this.setOpen(false);
        }

        render() {
            if (!this.root) return;
            const config = this.settings.settings;
            const name = this.settings.displayName();
            const subtitle = this.settings.subtitle();
            const state = this.stateMachine.getState();
            const muted = config.muted;
            const microcopy = window.AssistantMicrocopy;
            const profile = this.settings.microcopyProfile();
            const stateLine = microcopy ? microcopy.state(config, state) : "Assistant backend not connected yet.";
            const backendLine = microcopy ? microcopy.backendOffline(config) : "Assistant backend not connected yet.";
            const voiceStatusLine = microcopy ? microcopy.voiceNotConfigured(config) : "Voice backend not connected yet.";
            const lastResponse = this.lastResponse || (microcopy ? microcopy.placeholderResponse(config) : "Assistant backend not connected yet.");
            const inputPlaceholder = microcopy ? microcopy.inputPlaceholder(config) : "Type a local prompt…";
            const toneLabel = this.settings.toneLabel();
            const aresOption = config.mode === "private" ? "Gustav (Ares public)" : "Ares";
            const aphroditeOption = config.mode === "private" ? "Angie (Aphrodite public)" : "Aphrodite";
            const voiceLabel = {
                "not-configured": "Not configured",
                "default-robotic": "Default Robotic",
                "local-custom": "Local Custom Voice",
                "google-emotional-planned": "Google Emotional TTS · planned"
            }[config.voiceMode] || "Not configured";

            this.root.dataset.profile = profile;
            this.root.dataset.mode = config.mode;

            this.root.innerHTML = `
                <header class="assistant-panel-header">
                    <div>
                        <small>ASSISTANT PRESENCE</small>
                        <h1>${assistantEscape(name)}</h1>
                        <span>${assistantEscape(subtitle)} · ${assistantEscape(toneLabel.toUpperCase())}</span>
                    </div>
                    <button type="button" class="assistant-panel-close" aria-label="Close assistant panel">×</button>
                </header>

                <section class="assistant-panel-status" data-state="${assistantEscape(state)}">
                    <strong>${assistantEscape(state)}</strong>
                    <span>${assistantEscape(stateLine)}</span>
                </section>

                <section class="assistant-panel-response">
                    <small>LAST RESPONSE</small>
                    <p>${assistantEscape(lastResponse)}</p>
                </section>

                <form class="assistant-panel-input">
                    <label for="assistant_manual_input">Manual input</label>
                    <textarea id="assistant_manual_input" rows="3" spellcheck="false" placeholder="${assistantEscape(inputPlaceholder)}"></textarea>
                    <div>
                        <button type="submit" class="primary">SEND</button>
                        <button type="button" data-action="mute">${muted ? "UNMUTE" : "MUTE"}</button>
                        <button type="button" data-action="settings">SETTINGS</button>
                        <button type="button" data-action="clear">CLEAR</button>
                    </div>
                </form>

                <section class="assistant-panel-settings ${this.settingsVisible ? "visible" : ""}">
                    <h2>SETTINGS</h2>
                    <label>
                        <span>Assistant Mode</span>
                        <select id="assistant_setting_mode">
                            <option value="public" ${config.mode === "public" ? "selected" : ""}>Public</option>
                            <option value="private" ${config.mode === "private" ? "selected" : ""}>Private</option>
                        </select>
                    </label>
                    <label>
                        <span>Default active assistant</span>
                        <select id="assistant_setting_active">
                            <option value="ares" ${config.activeAssistant === "ares" ? "selected" : ""}>${assistantEscape(aresOption)}</option>
                            <option value="aphrodite" ${config.activeAssistant === "aphrodite" ? "selected" : ""}>${assistantEscape(aphroditeOption)}</option>
                        </select>
                    </label>
                    <div class="assistant-panel-pair">
                        <label>
                            <span>Ares alias</span>
                            <input id="assistant_alias_ares" value="${assistantEscape(config.aliases.ares)}" spellcheck="false">
                        </label>
                        <label>
                            <span>Aphrodite alias</span>
                            <input id="assistant_alias_aphrodite" value="${assistantEscape(config.aliases.aphrodite)}" spellcheck="false">
                        </label>
                    </div>
                    <label>
                        <span>Voice</span>
                        <select id="assistant_setting_voice">
                            <option value="not-configured" ${config.voiceMode === "not-configured" ? "selected" : ""}>Not configured</option>
                            <option value="default-robotic" ${config.voiceMode === "default-robotic" ? "selected" : ""}>Default Robotic</option>
                            <option value="local-custom" ${config.voiceMode === "local-custom" ? "selected" : ""}>Local Custom Voice</option>
                            <option value="google-emotional-planned" ${config.voiceMode === "google-emotional-planned" ? "selected" : ""}>Google Emotional TTS · planned</option>
                        </select>
                    </label>
                    <p class="assistant-voice-warning">Voice is not connected in this build. Only use voices you own or have explicit permission to use.</p>
                    <div class="assistant-backend-grid">
                        <span>Assistant backend</span><strong>${assistantEscape(config.backend.assistant)}</strong>
                        <span>Voice backend</span><strong>${assistantEscape(config.backend.voice)}</strong>
                        <span>Command router</span><strong>${assistantEscape(config.backend.commandRouter)}</strong>
                        <span>Memory</span><strong>${assistantEscape(config.backend.memory)}</strong>
                        <span>Voice shell</span><strong>${assistantEscape(voiceLabel)}</strong>
                    </div>
                    <div class="assistant-panel-health">
                        <span>Backend</span><strong>${assistantEscape(backendLine)}</strong>
                        <span>Voice</span><strong>${assistantEscape(voiceStatusLine)}</strong>
                    </div>
                    <section class="assistant-future-voice">
                        <small>FUTURE VOICE PROVIDERS</small>
                        <ul>
                            <li><span>Default Robotic</span><em>planned local/public shell</em></li>
                            <li><span>Local Custom Voice</span><em>BYOV / local only</em></li>
                            <li><span>Google Emotional TTS</span><em>optional future cloud provider</em></li>
                        </ul>
                        <p>Google Emotional TTS is planned as an optional cloud provider. It is not connected in this build.</p>
                    </section>
                    <h2>TEST STATES</h2>
                    <div class="assistant-state-test" aria-label="Assistant state visual test">
                        ${Object.keys(window.ASSISTANT_STATES || {}).map(key => `
                            <button type="button" data-state-test="${assistantEscape(key)}">${assistantEscape(key)}</button>
                        `).join("")}
                    </div>
                    <button type="button" data-action="save-settings" class="primary">SAVE SETTINGS</button>
                </section>`;

            this.bindEvents();
        }

        bindEvents() {
            const close = this.root.querySelector(".assistant-panel-close");
            if (close) close.addEventListener("click", () => this.close());

            const form = this.root.querySelector(".assistant-panel-input");
            if (form) {
                form.addEventListener("submit", event => {
                    event.preventDefault();
                    this.handleSend();
                });
            }

            this.root.querySelectorAll("[data-action]").forEach(button => {
                button.addEventListener("click", () => {
                    const action = button.dataset.action;
                    if (action === "mute") this.toggleMute();
                    if (action === "settings") {
                        this.settingsVisible = !this.settingsVisible;
                        this.render();
                    }
                    if (action === "clear") this.clear();
                    if (action === "save-settings") this.saveSettings();
                });
            });

            this.root.querySelectorAll("[data-state-test]").forEach(button => {
                button.addEventListener("click", () => {
                    this.settings.patch({lastState: button.dataset.stateTest});
                    this.presence.setState(button.dataset.stateTest);
                });
            });
        }

        async handleSend() {
            const input = this.root.querySelector("#assistant_manual_input");
            const message = input ? input.value.trim() : "";
            if (!message) return;

            this.presence.setState("THINKING");
            const result = await this.bridge.sendText(message);
            this.lastResponse = result.response || (window.AssistantMicrocopy
                ? window.AssistantMicrocopy.placeholderResponse(this.settings.settings)
                : "Assistant backend not connected yet.");
            if (input) input.value = "";
            this.presence.setState("SPEAKING");
            this.render();
            setTimeout(() => {
                if (!this.settings.settings.muted) this.presence.setState("IDLE");
            }, 900);
        }

        toggleMute() {
            const nextMuted = !this.settings.settings.muted;
            this.settings.patch({muted: nextMuted});
            this.presence.setState(nextMuted ? "MUTED" : "IDLE");
            this.render();
        }

        clear() {
            this.lastResponse = "";
            this.render();
        }

        saveSettings() {
            const mode = this.root.querySelector("#assistant_setting_mode");
            const active = this.root.querySelector("#assistant_setting_active");
            const ares = this.root.querySelector("#assistant_alias_ares");
            const aphrodite = this.root.querySelector("#assistant_alias_aphrodite");
            const voice = this.root.querySelector("#assistant_setting_voice");
            this.settings.patch({
                mode: mode ? mode.value : this.settings.settings.mode,
                activeAssistant: active ? active.value : this.settings.settings.activeAssistant,
                aliases: {
                    ares: ares ? ares.value : this.settings.settings.aliases.ares,
                    aphrodite: aphrodite ? aphrodite.value : this.settings.settings.aliases.aphrodite
                },
                voiceMode: voice ? voice.value : this.settings.settings.voiceMode
            });
            this.render();
            this.presence.refreshLabels();
        }
    }

    window.AssistantPanel = AssistantPanel;
})();

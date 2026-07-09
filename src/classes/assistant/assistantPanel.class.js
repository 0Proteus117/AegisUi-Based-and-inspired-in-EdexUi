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
            this.memory = options.memory || (window.AssistantMemoryBootstrap
                ? new window.AssistantMemoryBootstrap()
                : null);
            this.root = null;
            this.lastResponse = "";
            this.settingsVisible = false;
            this.lastMemoryStatus = null;
            this.localAIStatus = null;
            this.commandRouterStatus = null;
            this.chatSessionStatus = null;
            this.transcript = [];
            this.isSending = false;
            this.expandedRoot = null;
            this.expandedOpen = false;
        }

        mount() {
            if (this.root) return this.root;
            this.root = document.createElement("aside");
            this.root.id = "assistant_presence_panel";
            this.root.className = "assistant-panel";
            this.root.setAttribute("aria-live", "polite");
            this.root.setAttribute("aria-label", "Assistant presence panel");
            this.root.addEventListener("click", event => event.stopPropagation());
            this.root.addEventListener("mousedown", event => event.stopPropagation());
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
                this.restoreTranscript();
                const input = this.root.querySelector("#assistant_manual_input");
                if (input) setTimeout(() => input.focus(), 120);
                this.checkLocalAI({silent: true});
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
            if (!this.isSending) this.restoreTranscript();
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
            const defaultResponse = this.localAIStatus && this.localAIStatus.status === "READY"
                ? "Local written chat ready."
                : lastResponse;
            const inputPlaceholder = microcopy ? microcopy.inputPlaceholder(config) : "Type a local prompt…";
            const toneLabel = this.settings.toneLabel();
            const memoryStatus = this.readMemoryStatus();
            const localAIConfig = this.bridge && this.bridge.localAIConfig ? this.bridge.localAIConfig() : null;
            const localAIStatus = this.localAIStatus || this.defaultLocalAIStatus(localAIConfig, memoryStatus);
            const commandRouterStatus = this.readCommandRouterStatus();
            const chatStatus = this.readConversationStatus();
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
                    <p>${assistantEscape(defaultResponse)}</p>
                </section>

                <section class="assistant-chat-transcript">
                    <small>WRITTEN CHAT</small>
                    <div>${this.renderTranscript()}</div>
                </section>

                <form class="assistant-panel-input">
                    <label for="assistant_manual_input">Manual input · local text only</label>
                    <textarea id="assistant_manual_input" rows="3" spellcheck="false" placeholder="${assistantEscape(inputPlaceholder)}"></textarea>
                    <div>
                        <button type="submit" class="primary" ${this.isSending ? "disabled" : ""}>${this.isSending ? "GENERATING" : "SEND"}</button>
                        <button type="button" data-action="mute">${muted ? "UNMUTE" : "MUTE"}</button>
                        <button type="button" data-action="expand-chat">EXPAND</button>
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
                        <span>Command router</span><strong>${assistantEscape(commandRouterStatus.status || config.backend.commandRouter)}</strong>
                        <span>Memory</span><strong>${assistantEscape(config.backend.memory)}</strong>
                        <span>Voice shell</span><strong>${assistantEscape(voiceLabel)}</strong>
                    </div>
                    <div class="assistant-panel-health">
                        <span>Backend</span><strong>${assistantEscape(backendLine)}</strong>
                        <span>Voice</span><strong>${assistantEscape(voiceStatusLine)}</strong>
                    </div>
                    <section class="assistant-local-ai-status" data-status="${assistantEscape(localAIStatus.status)}">
                        <div>
                            <small>LOCAL AI</small>
                            <strong>${assistantEscape(this.localAIStatusLabel(localAIStatus))}</strong>
                        </div>
                        <dl>
                            <dt>Provider</dt><dd>${assistantEscape(localAIStatus.provider || "Ollama")}</dd>
                            <dt>Status</dt><dd>${assistantEscape(localAIStatus.status || "DISABLED")}</dd>
                            <dt>Endpoint</dt><dd>${assistantEscape(localAIStatus.endpoint || (localAIConfig && localAIConfig.endpoint) || "127.0.0.1:11434")}</dd>
                            <dt>Model</dt><dd>${assistantEscape(localAIStatus.model || (localAIConfig && localAIConfig.model) || "llama3.2:3b")}</dd>
                            <dt>Memory bootstrap</dt><dd>${assistantEscape(localAIStatus.memory || memoryStatus.status || "NOT_READY")}</dd>
                            <dt>Chat</dt><dd>${assistantEscape(localAIStatus.enabled ? "ENABLED" : "DISABLED")}</dd>
                            <dt>Last check</dt><dd>${assistantEscape(localAIStatus.checkedAt ? new Date(localAIStatus.checkedAt).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"}) : "Never")}</dd>
                            <dt>Last error</dt><dd>${assistantEscape(localAIStatus.lastError || "None")}</dd>
                            <dt>Command router</dt><dd>${assistantEscape(localAIStatus.commandRouter || commandRouterStatus.status || "OFFLINE")}</dd>
                            <dt>Voice</dt><dd>OFFLINE</dd>
                        </dl>
                        <p>${assistantEscape(localAIStatus.summary || "Local text chat can use Ollama when enabled. Voice and commands stay offline.")}</p>
                        <div class="assistant-local-ai-actions">
                            <button type="button" data-action="check-ai">CHECK OLLAMA</button>
                            <button type="button" data-action="refresh-models">REFRESH MODELS</button>
                            <button type="button" data-action="${localAIStatus.enabled ? "disable-local-ai" : "enable-local-ai"}">${localAIStatus.enabled ? "DISABLE LOCAL TEXT CHAT" : "ENABLE LOCAL TEXT CHAT"}</button>
                        </div>
                    </section>
                    <section class="assistant-ai-provider-status">
                        <div>
                            <small>AI PROVIDER LAYER</small>
                            <strong>${assistantEscape(localAIConfig && localAIConfig.provider === "apple-native" ? "APPLE NATIVE · PLANNED" : "OLLAMA · ACTIVE")}</strong>
                        </div>
                        <dl>
                            <dt>Active provider</dt><dd>${assistantEscape((localAIConfig && localAIConfig.provider) || "ollama")}</dd>
                            <dt>Ollama</dt><dd>${assistantEscape(localAIStatus.status === "READY" ? "READY" : localAIStatus.status || "DISABLED")}</dd>
                            <dt>Apple Native</dt><dd>PLANNED / NOT CONNECTED</dd>
                            <dt>Tools</dt><dd>DISABLED</dd>
                        </dl>
                    </section>
                    <section class="assistant-local-ai-config">
                        <h2>LOCAL AI</h2>
                        <label>
                            <span>Endpoint</span>
                            <input id="assistant_ai_endpoint" value="${assistantEscape((localAIConfig && localAIConfig.endpoint) || "http://127.0.0.1:11434")}" spellcheck="false">
                        </label>
                        <label>
                            <span>Model</span>
                            <input id="assistant_ai_model" value="${assistantEscape((localAIConfig && localAIConfig.model) || "llama3.2:3b")}" spellcheck="false">
                        </label>
                        <label class="assistant-checkbox-row">
                            <span>Use bootstrap memory</span>
                            <input id="assistant_ai_memory" type="checkbox" ${(localAIConfig && localAIConfig.memory && localAIConfig.memory.useBootstrap) !== false ? "checked" : ""}>
                        </label>
                        <p>Written chat plus safe allowlisted UI actions. No shell, no Git, no destructive actions, no voice.</p>
                    </section>
                    <section class="assistant-chat-memory-status">
                        <div>
                            <small>CONVERSATION MEMORY</small>
                            <strong>${assistantEscape(chatStatus.status || "NOT_CONFIGURED")}</strong>
                        </div>
                        <dl>
                            <dt>Profile</dt><dd>${assistantEscape(chatStatus.profile || "unknown")}</dd>
                            <dt>Messages</dt><dd>${assistantEscape(chatStatus.messages || 0)}</dd>
                            <dt>Summary</dt><dd>${assistantEscape(chatStatus.summary ? "READY" : "EMPTY")}</dd>
                            <dt>Restore</dt><dd>${assistantEscape(chatStatus.restore || "EMPTY")}</dd>
                        </dl>
                        <div class="assistant-memory-actions">
                            <button type="button" data-action="open-chat-folder">OPEN CHAT FOLDER</button>
                            <button type="button" data-action="export-chat">EXPORT LOCAL MARKDOWN</button>
                            <button type="button" data-action="clear-chat-memory">CLEAR ASSISTANT MEMORY</button>
                        </div>
                    </section>
                    <section class="assistant-command-router-status" data-status="${assistantEscape(commandRouterStatus.status || "OFFLINE")}">
                        <div>
                            <small>COMMAND ROUTER</small>
                            <strong>${assistantEscape(commandRouterStatus.status || "OFFLINE")}</strong>
                        </div>
                        <dl>
                            <dt>Mode</dt><dd>${assistantEscape(commandRouterStatus.mode || "LOCAL / SAFE / CONTROLLED")}</dd>
                            <dt>Authority</dt><dd>${assistantEscape(commandRouterStatus.authority || "LEVEL_2_SAFE")}</dd>
                            <dt>Safe actions</dt><dd>${assistantEscape(commandRouterStatus.actions || 0)}</dd>
                            <dt>Last action</dt><dd>${assistantEscape(commandRouterStatus.lastAction || "None")}</dd>
                        </dl>
                    </section>
                    <section class="assistant-memory-status" data-status="${assistantEscape(memoryStatus.status)}">
                        <div>
                            <small>MEMORY</small>
                            <strong>${assistantEscape(memoryStatus.status)}</strong>
                        </div>
                        <dl>
                            <dt>Source</dt><dd>${assistantEscape(memoryStatus.source)}</dd>
                            <dt>Files</dt><dd>${assistantEscape(memoryStatus.files)}</dd>
                            <dt>Bootstrap</dt><dd>${assistantEscape(memoryStatus.installed ? "Installed" : "Not installed")}</dd>
                            <dt>Index</dt><dd>${assistantEscape(memoryStatus.index || "NOT_INDEXED")}</dd>
                            <dt>Embeddings</dt><dd>${assistantEscape(memoryStatus.embeddings || "NOT_CONNECTED")}</dd>
                            <dt>Retrieval</dt><dd>${assistantEscape(memoryStatus.retrieval || "NOT_CONNECTED")}</dd>
                        </dl>
                        <p>${assistantEscape(this.memoryPreview(memoryStatus))}</p>
                        <div class="assistant-memory-actions">
                            <button type="button" data-action="refresh-memory">REFRESH MEMORY STATUS</button>
                            <button type="button" data-action="open-memory">OPEN MEMORY FOLDER</button>
                            <button type="button" data-action="install-memory">INSTALL LOCAL BOOTSTRAP</button>
                        </div>
                    </section>
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

            const input = this.root.querySelector("#assistant_manual_input");
            if (input) {
                input.addEventListener("keydown", event => {
                    if (event.key !== "Enter") return;
                    if (event.shiftKey) return;
                    if (event.metaKey || !event.altKey) {
                        event.preventDefault();
                        this.handleSend();
                    }
                });
            }

            this.root.querySelectorAll("[data-action]").forEach(button => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const action = button.dataset.action;
                    if (action === "mute") this.toggleMute();
                    if (action === "expand-chat") this.openExpandedChat();
                    if (action === "settings") {
                        this.settingsVisible = !this.settingsVisible;
                        this.render();
                    }
                    if (action === "clear") this.clear();
                    if (action === "save-settings") this.saveSettings();
                    if (action === "refresh-memory") this.refreshMemory();
                    if (action === "open-memory") this.openMemoryFolder();
                    if (action === "install-memory") this.installMemory();
                    if (action === "check-ai") this.checkLocalAI({force: true});
                    if (action === "refresh-models") this.checkLocalAI({force: true});
                    if (action === "enable-local-ai") this.setLocalAIEnabled(true);
                    if (action === "disable-local-ai") this.setLocalAIEnabled(false);
                    if (action === "open-chat-folder") this.openChatFolder();
                    if (action === "export-chat") this.exportChat();
                    if (action === "clear-chat-memory") this.clearConversationMemory();
                });
            });

            this.root.querySelectorAll("[data-state-test]").forEach(button => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.settings.patch({lastState: button.dataset.stateTest});
                    this.presence.setState(button.dataset.stateTest);
                });
            });
        }

        async handleSend(source = "panel") {
            if (this.isSending) return;
            const input = source === "expanded" && this.expandedRoot
                ? this.expandedRoot.querySelector("#assistant_expanded_input")
                : this.root.querySelector("#assistant_manual_input");
            const message = input ? input.value.trim() : "";
            if (!message) return;

            this.isSending = true;
            this.addTranscript("user", message);
            if (input) input.value = "";
            this.lastResponse = "Thinking…";
            this.presence.setState("THINKING");
            this.render();
            if (this.expandedOpen) this.renderExpandedChat();
            const activeInput = source === "expanded" && this.expandedRoot
                ? this.expandedRoot.querySelector("#assistant_expanded_input")
                : this.root.querySelector("#assistant_manual_input");
            if (activeInput) setTimeout(() => activeInput.focus(), 20);
            try {
                const result = await this.bridge.sendText(message);
                this.lastResponse = result.response || (window.AssistantMicrocopy
                    ? window.AssistantMicrocopy.placeholderResponse(this.settings.settings)
                    : "Assistant backend not connected yet.");
                if (result.lastError) {
                    this.localAIStatus = {
                        ...(this.localAIStatus || {}),
                        status: result.status,
                        lastError: result.lastError,
                        checkedAt: new Date().toISOString()
                    };
                }
                this.addTranscript("assistant", this.lastResponse);
                this.refreshTranscriptFromSession();
            } catch (error) {
                this.lastResponse = `Local AI error: ${error.message || error}`;
                this.addTranscript("assistant", this.lastResponse);
                this.presence.setState("ERROR");
            } finally {
                this.isSending = false;
                this.render();
                if (this.expandedOpen) this.renderExpandedChat();
                const nextInput = source === "expanded" && this.expandedRoot
                    ? this.expandedRoot.querySelector("#assistant_expanded_input")
                    : this.root.querySelector("#assistant_manual_input");
                if (nextInput) setTimeout(() => nextInput.focus(), 40);
                setTimeout(() => {
                    if (!this.settings.settings.muted) this.presence.setState("IDLE");
                }, 900);
            }
        }

        toggleMute() {
            const nextMuted = !this.settings.settings.muted;
            this.settings.patch({muted: nextMuted});
            this.presence.setState(nextMuted ? "MUTED" : "IDLE");
            this.render();
        }

        clear() {
            this.lastResponse = "";
            this.transcript = [];
            if (this.bridge && this.bridge.clearConversation) this.bridge.clearConversation();
            this.renderExpandedChat();
            this.render();
        }

        restoreTranscript() {
            if (!this.bridge || !this.bridge.conversationMessages) return;
            const messages = this.bridge.conversationMessages(18);
            if (!messages || !messages.length) return;
            this.transcript = messages.slice(-12).map(item => ({
                role: item.role === "assistant" ? "assistant" : "user",
                text: item.text,
                time: item.time ? new Date(item.time).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"}) : ""
            }));
        }

        refreshTranscriptFromSession() {
            if (!this.bridge || !this.bridge.conversationMessages) return;
            const messages = this.bridge.conversationMessages(40);
            if (messages && messages.length) {
                this.transcript = messages.slice(-12).map(item => ({
                    role: item.role === "assistant" ? "assistant" : "user",
                    text: item.text,
                    time: item.time ? new Date(item.time).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"}) : ""
                }));
            }
        }

        readCommandRouterStatus() {
            this.commandRouterStatus = this.bridge && this.bridge.commandRouterStatus
                ? this.bridge.commandRouterStatus()
                : {status: "OFFLINE", mode: "Unavailable", actions: 0};
            return this.commandRouterStatus;
        }

        readConversationStatus() {
            this.chatSessionStatus = this.bridge && this.bridge.conversationStatus
                ? this.bridge.conversationStatus()
                : {status: "NOT_CONFIGURED", messages: 0, summary: false, restore: "EMPTY"};
            return this.chatSessionStatus;
        }

        expandedTranscriptHtml() {
            const messages = this.bridge && this.bridge.conversationMessages
                ? this.bridge.conversationMessages(80)
                : this.transcript;
            if (!messages || !messages.length) {
                return this.isSending
                    ? this.thinkingIndicatorHtml()
                    : `<p class="assistant-chat-empty">No local messages yet.</p>`;
            }
            return `${messages.map(item => {
                const role = item.role === "assistant" ? "assistant" : "user";
                const time = item.time ? new Date(item.time).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"}) : item.time || "";
                return `
                    <article data-role="${assistantEscape(role)}">
                        <header><strong>${assistantEscape(role === "user" ? "YOU" : this.settings.displayName())}</strong><span>${assistantEscape(time)}</span></header>
                        <p>${assistantEscape(item.text || "")}</p>
                    </article>`;
            }).join("")}${this.isSending ? this.thinkingIndicatorHtml() : ""}`;
        }

        openExpandedChat() {
            this.expandedOpen = true;
            if (!this.expandedRoot) {
                this.expandedRoot = document.createElement("section");
                this.expandedRoot.id = "assistant_expanded_chat";
                this.expandedRoot.className = "assistant-chat-overlay";
                this.expandedRoot.setAttribute("aria-modal", "true");
                this.expandedRoot.setAttribute("role", "dialog");
                this.expandedRoot.addEventListener("click", event => {
                    if (event.target === this.expandedRoot) this.closeExpandedChat();
                });
                this.expandedRoot.addEventListener("mousedown", event => {
                    if (event.target !== this.expandedRoot) event.stopPropagation();
                });
                document.body.appendChild(this.expandedRoot);
            }
            this.renderExpandedChat();
            this.expandedRoot.classList.add("visible");
            this.settings.patch({expandedChatOpen: true});
            const input = this.expandedRoot.querySelector("#assistant_expanded_input");
            if (input) setTimeout(() => input.focus(), 80);
        }

        closeExpandedChat() {
            this.expandedOpen = false;
            if (this.expandedRoot) {
                this.expandedRoot.classList.remove("visible");
            }
            this.settings.patch({expandedChatOpen: false});
        }

        renderExpandedChat() {
            if (!this.expandedRoot || !this.expandedOpen) return;
            const config = this.settings.settings;
            const localAIStatus = this.localAIStatus || this.defaultLocalAIStatus(this.bridge.localAIConfig ? this.bridge.localAIConfig() : {}, this.lastMemoryStatus || {});
            const memoryStatus = this.readMemoryStatus();
            const chatStatus = this.readConversationStatus();
            const routerStatus = this.readCommandRouterStatus();
            this.expandedRoot.dataset.profile = this.settings.microcopyProfile();
            this.expandedRoot.innerHTML = `
                <div class="assistant-chat-expanded" data-profile="${assistantEscape(this.settings.microcopyProfile())}">
                    <header>
                        <div>
                            <small>AEGISUI ASSISTANT CHAT</small>
                            <h1>${assistantEscape(this.settings.displayName())}</h1>
                            <span>${assistantEscape(this.settings.subtitle())}</span>
                        </div>
                        <button type="button" class="assistant-expanded-close" aria-label="Close expanded assistant chat">×</button>
                    </header>
                    <section class="assistant-chat-expanded-status">
                        <span>STATE <strong>${assistantEscape(this.stateMachine.getState())}</strong></span>
                        <span>LOCAL AI <strong>${assistantEscape(localAIStatus.status || "UNKNOWN")}</strong></span>
                        <span>MEMORY <strong>${assistantEscape(memoryStatus.status || "NOT_READY")}</strong></span>
                        <span>SESSION <strong>${assistantEscape(chatStatus.restore || "EMPTY")}</strong></span>
                        <span>ROUTER <strong>${assistantEscape(routerStatus.status || "OFFLINE")}</strong></span>
                        <span>VOICE <strong>OFFLINE</strong></span>
                    </section>
                    <section class="assistant-chat-expanded-log" aria-label="Assistant conversation">
                        ${this.expandedTranscriptHtml()}
                    </section>
                    <form class="assistant-chat-expanded-input">
                        <textarea id="assistant_expanded_input" rows="4" spellcheck="false" placeholder="${assistantEscape(window.AssistantMicrocopy ? window.AssistantMicrocopy.inputPlaceholder(config) : "Type a local prompt…")}"></textarea>
                        <div>
                            <button type="submit" class="primary" ${this.isSending ? "disabled" : ""}>${this.isSending ? "GENERATING" : "SEND"}</button>
                            <button type="button" data-expanded-action="clear">CLEAR CURRENT</button>
                            <button type="button" data-expanded-action="export">EXPORT</button>
                            <button type="button" data-expanded-action="folder">OPEN FOLDER</button>
                        </div>
                    </form>
                </div>`;
            this.bindExpandedEvents();
            const log = this.expandedRoot.querySelector(".assistant-chat-expanded-log");
            if (log) log.scrollTop = log.scrollHeight;
        }

        bindExpandedEvents() {
            if (!this.expandedRoot) return;
            const close = this.expandedRoot.querySelector(".assistant-expanded-close");
            if (close) close.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                this.closeExpandedChat();
            });
            const form = this.expandedRoot.querySelector(".assistant-chat-expanded-input");
            if (form) form.addEventListener("submit", event => {
                event.preventDefault();
                event.stopPropagation();
                this.handleSend("expanded");
            });
            const input = this.expandedRoot.querySelector("#assistant_expanded_input");
            if (input) input.addEventListener("keydown", event => {
                if (event.key !== "Enter") return;
                if (event.shiftKey) return;
                if (event.metaKey || !event.altKey) {
                    event.preventDefault();
                    this.handleSend("expanded");
                }
            });
            this.expandedRoot.querySelectorAll("[data-expanded-action]").forEach(button => {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const action = button.dataset.expandedAction;
                    if (action === "clear") this.clear();
                    if (action === "export") this.exportChat();
                    if (action === "folder") this.openChatFolder();
                });
            });
        }

        async openChatFolder() {
            if (this.bridge && this.bridge.openChatFolder) await this.bridge.openChatFolder();
        }

        exportChat() {
            if (!this.bridge || !this.bridge.exportConversation) return;
            const result = this.bridge.exportConversation();
            this.lastResponse = result && result.ok ? `Conversation exported locally: ${result.file}` : `Conversation export failed: ${result && result.error ? result.error : "unknown error"}`;
            this.render();
            this.renderExpandedChat();
        }

        clearConversationMemory() {
            if (this.bridge && this.bridge.clearConversation) this.bridge.clearConversation();
            this.transcript = [];
            this.lastResponse = "Conversation memory cleared for the active assistant.";
            this.render();
            this.renderExpandedChat();
        }

        addTranscript(role, text) {
            const item = {
                role,
                text: String(text || "").trim(),
                time: new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})
            };
            if (!item.text) return;
            this.transcript.push(item);
            this.transcript = this.transcript.slice(-8);
        }

        renderTranscript() {
            if (!this.transcript.length) {
                return this.isSending
                    ? this.thinkingIndicatorHtml()
                    : `<p class="assistant-chat-empty">No local messages yet.</p>`;
            }
            return `${this.transcript.map(item => `
                <article data-role="${assistantEscape(item.role)}">
                    <header><strong>${assistantEscape(item.role === "user" ? "YOU" : this.settings.displayName())}</strong><span>${assistantEscape(item.time)}</span></header>
                    <p>${assistantEscape(item.text)}</p>
                </article>
            `).join("")}${this.isSending ? this.thinkingIndicatorHtml() : ""}`;
        }

        thinkingIndicatorHtml() {
            return `
                <article class="assistant-thinking-indicator" data-role="assistant">
                    <header><strong>${assistantEscape(this.settings.displayName())}</strong><span>GENERATING</span></header>
                    <p><span class="assistant-typing-dots"><i></i><i></i><i></i></span> Thinking…</p>
                </article>`;
        }

        readMemoryStatus() {
            if (!this.memory) {
                return {
                    status: "ERROR",
                    source: "None",
                    files: 0,
                    titles: [],
                    installed: false,
                    index: "NOT_INDEXED",
                    embeddings: "NOT_CONNECTED",
                    retrieval: "NOT_CONNECTED",
                    error: "Memory loader unavailable"
                };
            }
            this.lastMemoryStatus = this.memory.status();
            return this.lastMemoryStatus;
        }

        memoryPreview(status = {}) {
            if (status.error) return status.error;
            const titles = Array.isArray(status.titles) ? status.titles : [];
            if (!titles.length) return "No private bootstrap memory loaded.";
            const names = titles.slice(0, 3).map(item => item.title || item.file).join(" · ");
            const suffix = titles.length > 3 ? ` · +${titles.length - 3} more` : "";
            return `${names}${suffix}`;
        }

        refreshMemory() {
            this.readMemoryStatus();
            this.render();
        }

        async openMemoryFolder() {
            if (!this.memory) return;
            await this.memory.openFolder();
            this.refreshMemory();
        }

        installMemory() {
            if (!this.memory) return;
            const result = this.memory.install();
            this.lastResponse = result.ok
                ? `Private memory bootstrap installed locally. Files copied: ${result.filesCopied}.`
                : `Memory install failed: ${result.error || result.status || "unknown error"}`;
            this.refreshMemory();
        }

        defaultLocalAIStatus(config = {}, memoryStatus = {}) {
            return {
                ok: false,
                enabled: Boolean(config && config.enabled),
                status: config && config.enabled ? "UNKNOWN" : "DISABLED",
                provider: "Ollama",
                endpoint: config && config.endpoint ? config.endpoint : "http://127.0.0.1:11434",
                model: config && config.model ? config.model : "llama3.2:3b",
                memory: memoryStatus && memoryStatus.status === "READY" ? "READY" : "NOT_READY",
                commandRouter: "SAFE_READY",
                voice: "OFFLINE",
                summary: config && config.enabled ? "Local AI status not checked yet." : "Local text chat disabled."
            };
        }

        localAIStatusLabel(status = {}) {
            if (status.status === "READY") return "LOCAL AI READY";
            if (status.status === "OLLAMA_OFFLINE") return "OLLAMA OFFLINE";
            if (status.status === "INVALID_ENDPOINT") return "INVALID ENDPOINT";
            if (status.status === "MODEL_NOT_FOUND") return "MODEL NOT FOUND";
            if (status.status === "TIMEOUT") return "TIMEOUT";
            if (status.status === "DISABLED") return "DISABLED";
            return status.status || "UNKNOWN";
        }

        async checkLocalAI(options = {}) {
            if (!this.bridge || !this.bridge.checkLocalAIStatus) return;
            const status = await this.bridge.checkLocalAIStatus({force: Boolean(options.force)});
            this.localAIStatus = status;
            if (!options.silent) {
                this.lastResponse = status.summary || this.localAIStatusLabel(status);
                this.render();
            }
        }

        setLocalAIEnabled(enabled) {
            if (!this.bridge || !this.bridge.saveLocalAIConfig) return;
            const endpoint = this.root.querySelector("#assistant_ai_endpoint");
            const model = this.root.querySelector("#assistant_ai_model");
            const memory = this.root.querySelector("#assistant_ai_memory");
            this.bridge.saveLocalAIConfig({
                enabled: Boolean(enabled),
                endpoint: endpoint ? endpoint.value : undefined,
                model: model ? model.value : undefined,
                memory: {
                    useBootstrap: memory ? memory.checked : true
                },
                commandRouter: {enabled: true},
                voice: {enabled: false}
            });
            this.localAIStatus = null;
            this.checkLocalAI({force: true});
            this.render();
        }

        saveSettings() {
            const mode = this.root.querySelector("#assistant_setting_mode");
            const active = this.root.querySelector("#assistant_setting_active");
            const ares = this.root.querySelector("#assistant_alias_ares");
            const aphrodite = this.root.querySelector("#assistant_alias_aphrodite");
            const voice = this.root.querySelector("#assistant_setting_voice");
            const endpoint = this.root.querySelector("#assistant_ai_endpoint");
            const model = this.root.querySelector("#assistant_ai_model");
            const memory = this.root.querySelector("#assistant_ai_memory");
            if (this.bridge && this.bridge.saveLocalAIConfig) {
                const current = this.bridge.localAIConfig ? this.bridge.localAIConfig() : {};
                this.bridge.saveLocalAIConfig({
                    enabled: Boolean(current && current.enabled),
                    endpoint: endpoint ? endpoint.value : undefined,
                    model: model ? model.value : undefined,
                    memory: {
                        useBootstrap: memory ? memory.checked : true
                    },
                    commandRouter: {enabled: true},
                    voice: {enabled: false}
                });
                this.localAIStatus = null;
            }
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

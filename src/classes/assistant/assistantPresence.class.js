(function() {
    class AssistantPresence {
        constructor(options = {}) {
            this.container = null;
            this.settings = new AssistantSettings();
            this.stateMachine = new AssistantState(this.settings.settings.muted ? "MUTED" : "IDLE");
            this.permissions = new AssistantPermissions();
            this.bridge = new AssistantBridge({settings: this.settings});
            this.panel = new AssistantPanel({
                presence: this,
                settings: this.settings,
                stateMachine: this.stateMachine,
                bridge: this.bridge
            });
            this.boundOutsideClick = event => this.handleOutsideClick(event);
            this.boundKeydown = event => this.handleKeydown(event);
            this.mount();
        }

        mount() {
            if (this.container) return this.container;
            this.container = document.createElement("div");
            this.container.id = "assistant_presence";
            this.container.className = "assistant-presence";
            this.container.dataset.state = this.stateMachine.getState();
            this.container.innerHTML = this.renderOrb();
            document.body.appendChild(this.container);
            this.panel.mount();
            this.bindEvents();
            this.stateMachine.subscribe(snapshot => this.applyState(snapshot.state));
            this.applyState(this.stateMachine.getState());
            this.panel.setOpen(Boolean(this.settings.settings.panelOpen));
            return this.container;
        }

        renderOrb() {
            const points = Array.from({length: 18}).map((_, index) => {
                const angle = Math.round(index * (360 / 18));
                const delay = (index * -0.18).toFixed(2);
                return `<span class="assistant-orbit-point" style="--i:${index}; --angle:${angle}deg; --delay:${delay}s"></span>`;
            }).join("");
            return `
                <button type="button" class="assistant-orb-button" aria-label="Open assistant presence panel">
                    <span class="assistant-orb-core"></span>
                    <span class="assistant-orb-ring"></span>
                    <span class="assistant-orbit-cloud">${points}</span>
                    <span class="assistant-orb-status">
                        <strong>${this.escape(this.settings.displayName())}</strong>
                        <em>${this.escape(this.stateMachine.getState())}</em>
                    </span>
                </button>`;
        }

        bindEvents() {
            const button = this.container.querySelector(".assistant-orb-button");
            if (button) {
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.togglePanel();
                });
            }
            document.addEventListener("click", this.boundOutsideClick);
            document.addEventListener("keydown", this.boundKeydown);
        }

        destroy() {
            document.removeEventListener("click", this.boundOutsideClick);
            document.removeEventListener("keydown", this.boundKeydown);
            if (this.container) this.container.remove();
            if (this.panel && this.panel.root) this.panel.root.remove();
            this.container = null;
        }

        handleOutsideClick(event) {
            if (!this.panel || !this.panel.isOpen()) return;
            if (this.container && this.container.contains(event.target)) return;
            if (this.panel.root && this.panel.root.contains(event.target)) return;
            this.panel.close();
        }

        handleKeydown(event) {
            if (event.key !== "Escape") return;
            if (this.panel && this.panel.isOpen()) {
                this.panel.close();
            }
        }

        togglePanel() {
            const open = !this.panel.isOpen();
            this.panel.setOpen(open);
        }

        setState(state) {
            const next = String(state || "").toUpperCase();
            if (next === "MUTED" && !this.settings.settings.muted) {
                this.settings.patch({muted: true});
            }
            if (next !== "MUTED" && this.settings.settings.muted) {
                this.settings.patch({muted: false});
            }
            return this.stateMachine.setState(next);
        }

        applyState(state) {
            if (!this.container) return;
            this.container.dataset.state = state;
            const label = this.container.querySelector(".assistant-orb-status em");
            if (label) label.innerText = state;
            if (this.panel && this.panel.root) {
                const status = this.panel.root.querySelector(".assistant-panel-status");
                if (status) {
                    status.dataset.state = state;
                    const strong = status.querySelector("strong");
                    if (strong) strong.innerText = state;
                }
            }
        }

        refreshLabels() {
            if (!this.container) return;
            const name = this.container.querySelector(".assistant-orb-status strong");
            if (name) name.innerText = this.settings.displayName();
        }

        escape(value) {
            return window._escapeHtml(String(value || ""));
        }
    }

    window.AssistantPresence = AssistantPresence;
})();

(function() {
    const ASSISTANT_STATES = Object.freeze({
        IDLE: "IDLE",
        LISTENING: "LISTENING",
        THINKING: "THINKING",
        SPEAKING: "SPEAKING",
        MUTED: "MUTED",
        OFFLINE: "OFFLINE",
        ERROR: "ERROR"
    });

    class AssistantState {
        constructor(initialState = ASSISTANT_STATES.IDLE) {
            this.listeners = new Set();
            this.previousState = ASSISTANT_STATES.IDLE;
            this.state = this.normalize(initialState);
            this.updatedAt = new Date().toISOString();
        }

        normalize(state) {
            const next = String(state || "").toUpperCase();
            return ASSISTANT_STATES[next] || ASSISTANT_STATES.IDLE;
        }

        setState(state, detail = {}) {
            const next = this.normalize(state);
            if (next === this.state && !detail.force) return this.snapshot();

            this.previousState = this.state;
            this.state = next;
            this.updatedAt = new Date().toISOString();
            const snapshot = this.snapshot(detail);
            this.listeners.forEach(listener => {
                try {
                    listener(snapshot);
                } catch (error) {}
            });
            return snapshot;
        }

        getState() {
            return this.state;
        }

        snapshot(detail = {}) {
            return {
                state: this.state,
                previousState: this.previousState,
                updatedAt: this.updatedAt,
                detail
            };
        }

        subscribe(listener) {
            if (typeof listener !== "function") return () => {};
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        }
    }

    window.AssistantState = AssistantState;
    window.ASSISTANT_STATES = ASSISTANT_STATES;
})();

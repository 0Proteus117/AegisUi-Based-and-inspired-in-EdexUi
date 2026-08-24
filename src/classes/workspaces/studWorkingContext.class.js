"use strict";

// Renderer coordinator for M2.  It has no authority of its own: all context
// validation and persistence remain in StudWorkingContextService in main.
class StudWorkingContext {
    constructor(options = {}) {
        this.request = options.request;
        this.value = null;
    }

    async refresh() {
        this.value = await this.request("stud-working-context-read");
        return this.value;
    }

    async update(value) {
        this.value = await this.request("stud-working-context-update", value);
        return this.value;
    }

    async clear() {
        this.value = await this.request("stud-working-context-clear");
        return this.value;
    }
}

window.StudWorkingContext = StudWorkingContext;

class MapLayerCache {
    constructor() {
        this.entries = new Map();
    }

    get(key) {
        const entry = this.entries.get(key);
        if (!entry) return null;
        if (entry.expiresAt && entry.expiresAt <= Date.now()) {
            this.entries.delete(key);
            return null;
        }
        return entry.value;
    }

    set(key, value, ttlMs = 0) {
        this.entries.set(key, {
            value,
            storedAt: Date.now(),
            expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0
        });
        return value;
    }

    async getOrFetch(key, ttlMs, loader) {
        const cached = this.get(key);
        if (cached !== null) return cached;
        const value = await loader();
        return this.set(key, value, ttlMs);
    }

    clear(prefix = "") {
        if (!prefix) {
            this.entries.clear();
            return;
        }

        Array.from(this.entries.keys())
            .filter(key => key.startsWith(prefix))
            .forEach(key => this.entries.delete(key));
    }
}

module.exports = {MapLayerCache};

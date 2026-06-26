const {MapLayerCache} = require("./utils/mapCache.js");
const {
    MAP_LAYER_STATES,
    normalizeProviderError,
    sanitizeErrorMessage
} = require("./utils/mapLayerState.js");
const {TrafficProvider} = require("./providers/trafficProvider.js");
const {WeatherRadarProvider} = require("./providers/weatherRadarProvider.js");
const {OpenSkyProvider} = require("./providers/openSkyProvider.js");
const {AISProvider} = require("./providers/aisProvider.js");
const {CelesTrakProvider} = require("./providers/celestrakProvider.js");
const {NOAAOceanProvider} = require("./providers/noaaOceanProvider.js");

class MapLayerRegistry {
    constructor(options = {}) {
        this.definitions = Array.isArray(options.definitions) ? options.definitions : [];
        this.preferences = options.preferences || {};
        this.baseContext = options.context || {};
        this.onLayerChange = typeof options.onLayerChange === "function"
            ? options.onLayerChange
            : () => {};
        this.cache = options.cache || new MapLayerCache();
        this.layers = new Map();
        this.initialize();
    }

    initialize() {
        this.definitions.forEach(definition => {
            const savedLayer = this.preferences[definition.id] || {};
            const active = typeof savedLayer.active === "boolean"
                ? savedLayer.active
                : Boolean(definition.defaultActive);
            const opacity = Number(savedLayer.opacity);
            const provider = this.createProvider(definition);
            const layer = {
                definition,
                provider,
                active,
                available: definition.available !== false,
                status: active ? MAP_LAYER_STATES.LOADING : MAP_LAYER_STATES.OFF,
                error: "",
                summary: "No data loaded while disabled",
                updatedAt: null,
                count: 0,
                opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : definition.opacity || 1
            };

            provider.bindUpdate(status => this.syncProviderStatus(definition.id, status));
            this.layers.set(definition.id, layer);
        });
    }

    createProvider(definition) {
        if (definition.id === "ROAD_TRAFFIC") return new TrafficProvider(definition);
        if (definition.id === "WEATHER_RADAR") return new WeatherRadarProvider(definition);
        if (definition.id === "AIR_TRAFFIC") return new OpenSkyProvider(definition);
        if (definition.id === "MARITIME_AIS") return new AISProvider(definition);
        if (definition.id === "SATELLITES") return new CelesTrakProvider(definition);
        if (definition.id === "OCEAN_ALERTS") return new NOAAOceanProvider(definition);
        throw new Error(`Unknown map layer provider: ${definition.id}`);
    }

    buildContext(id, options = {}) {
        const layer = this.layers.get(id);
        return {
            ...this.baseContext,
            ...options,
            layer,
            cache: this.cache
        };
    }

    list() {
        return Array.from(this.layers.values());
    }

    get(id) {
        return this.layers.get(id);
    }

    async activate(id, options = {}) {
        const layer = this.layers.get(id);
        if (!layer) return;

        layer.active = true;
        layer.status = MAP_LAYER_STATES.LOADING;
        layer.error = "";
        layer.summary = "Loading provider data";
        this.onLayerChange(layer);

        try {
            await layer.provider.start(this.buildContext(id, options));
            this.syncProviderStatus(id, layer.provider.getStatus());
        } catch (error) {
            layer.status = normalizeProviderError(error, this.buildContext(id, options));
            layer.error = sanitizeErrorMessage(error, `${layer.definition.label} provider failed`);
            layer.summary = `${layer.definition.name} provider failed`;
            this.onLayerChange(layer);
        }
    }

    deactivate(id) {
        const layer = this.layers.get(id);
        if (!layer) return;
        layer.active = false;
        layer.provider.stop(this.buildContext(id));
        layer.status = MAP_LAYER_STATES.OFF;
        layer.error = "";
        layer.summary = "No data loaded while disabled";
        layer.count = 0;
        layer.updatedAt = null;
        this.onLayerChange(layer);
    }

    async refresh(id, options = {}) {
        const layer = this.layers.get(id);
        if (!layer || !layer.active) return;
        try {
            await layer.provider.refresh(this.buildContext(id, options));
            this.syncProviderStatus(id, layer.provider.getStatus());
        } catch (error) {
            layer.status = normalizeProviderError(error, this.buildContext(id, options));
            layer.error = sanitizeErrorMessage(error, `${layer.definition.label} refresh failed`);
            layer.summary = `${layer.definition.name} refresh failed`;
            this.onLayerChange(layer);
        }
    }

    syncProviderStatus(id, status = {}) {
        const layer = this.layers.get(id);
        if (!layer || !layer.active) return;

        layer.status = status.status || layer.status;
        layer.error = status.error || "";
        layer.summary = status.summary || layer.definition.providerType;
        layer.updatedAt = status.updatedAt || layer.updatedAt;
        layer.count = Number.isFinite(Number(status.count)) ? Number(status.count) : 0;
        this.onLayerChange(layer);
    }

    serialize() {
        const data = {};
        this.layers.forEach((layer, id) => {
            data[id] = {
                active: Boolean(layer.active),
                opacity: layer.opacity,
                mode: layer.definition.mode || "live"
            };
        });
        return data;
    }

    stopAll() {
        this.layers.forEach(layer => {
            layer.active = false;
            layer.provider.stop(this.buildContext(layer.definition.id));
        });
    }
}

module.exports = {MapLayerRegistry, MAP_LAYER_STATES};

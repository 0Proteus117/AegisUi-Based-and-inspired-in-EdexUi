const {BaseMapProvider} = require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = require("../utils/mapLayerState.js");

class TrafficProvider extends BaseMapProvider {
    isConfigured(context = this.context) {
        return Boolean(context && context.getTrafficKey && context.getTrafficKey());
    }

    async start(context) {
        await super.start(context);
        this.removeLeafletLayers(context);

        if (isOffline(context)) {
            this.setStatus(MAP_LAYER_STATES.OFFLINE, {
                summary: "Offline mode · road traffic disabled"
            });
            return;
        }

        const trafficKey = context.getTrafficKey ? context.getTrafficKey() : "";
        if (!trafficKey) {
            if (context.userInitiated && typeof context.onTrafficKeyRequired === "function") {
                context.onTrafficKeyRequired();
            }
            this.setStatus(MAP_LAYER_STATES.API_KEY_MISSING, {
                error: "TomTom traffic key missing",
                summary: "Add a TomTom key to enable live road traffic"
            });
            return;
        }

        if (context.ipc && typeof context.ipc.invoke === "function") {
            try {
                const diagnostic = await context.ipc.invoke("tomtom-traffic-diagnostic", trafficKey);
                if (diagnostic && diagnostic.ok === false) {
                    const status = diagnostic.serviceStatus === MAP_LAYER_STATES.API_KEY_INVALID
                        || diagnostic.keyStatus === "INVALID"
                        ? MAP_LAYER_STATES.API_KEY_INVALID
                        : (diagnostic.serviceStatus === MAP_LAYER_STATES.RATE_LIMITED
                            ? MAP_LAYER_STATES.RATE_LIMITED
                            : MAP_LAYER_STATES.SERVICE_UNAVAILABLE);
                    this.setStatus(status, {
                        error: diagnostic.summary || "TomTom traffic diagnostic failed",
                        summary: diagnostic.keyStatus === "INVALID"
                            ? "TomTom traffic key rejected by provider"
                            : (diagnostic.summary || "TomTom traffic unavailable")
                    });
                    return;
                }
            } catch (error) {
                this.setStatus(MAP_LAYER_STATES.SERVICE_UNAVAILABLE, {
                    error: error.message || "TomTom traffic diagnostic failed",
                    summary: "TomTom traffic diagnostic failed"
                });
                return;
            }
        }

        const key = encodeURIComponent(trafficKey);
        const layer = context.L.tileLayer(
            `https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/{z}/{x}/{y}.png?tileSize=256&key=${key}`,
            {
                opacity: context.layer.opacity || 0.9,
                maxZoom: 22,
                zIndex: this.definition.zIndex,
                className: "eng-traffic-map"
            }
        );

        layer.on("tileerror", () => {
            if (!this.active) return;
            this.setStatus(MAP_LAYER_STATES.SERVICE_UNAVAILABLE, {
                error: "Traffic tile service unavailable",
                summary: "TomTom traffic tiles failed"
            });
        });

        this.rememberLeafletLayer(layer);
        layer.addTo(context.map);
        this.setStatus(MAP_LAYER_STATES.ONLINE, {
            summary: "TomTom live traffic tiles",
            count: 0
        });
    }
}

module.exports = {TrafficProvider};

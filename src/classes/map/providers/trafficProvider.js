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

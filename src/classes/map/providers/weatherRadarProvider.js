(function weatherRadarProviderModule() {
const {BaseMapProvider} = typeof window !== "undefined" ? window.AegisBaseMapProvider : require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = typeof window !== "undefined" ? window.AegisMapLayerState : require("../utils/mapLayerState.js");

class WeatherRadarProvider extends BaseMapProvider {
    async start(context) {
        await super.start(context);
        await this.refresh(context);

        if (this.active && this.status === MAP_LAYER_STATES.ONLINE && this.definition.updateIntervalMs > 0) {
            this.rememberTimer(setInterval(() => {
                this.refresh(context).catch(error => this.applyProviderError(
                    error,
                    context,
                    "Radar refresh failed"
                ));
            }, this.definition.updateIntervalMs));
        }
    }

    async refresh(context = this.context) {
        if (!this.active) return;

        if (isOffline(context)) {
            this.removeLeafletLayers(context);
            this.setStatus(MAP_LAYER_STATES.OFFLINE, {
                summary: "Offline mode · radar disabled"
            });
            return;
        }

        this.setStatus(MAP_LAYER_STATES.LOADING, {
            summary: "Loading RainViewer precipitation radar metadata"
        });

        try {
            const response = await context.cache.getOrFetch(
                "rainviewer-metadata",
                this.definition.cacheTtlMs,
                () => context.ipc.invoke("rainviewer-metadata")
            );

            if (!response.ok || !response.data || !response.data.radar || !response.data.radar.past.length) {
                this.removeLeafletLayers(context);
                this.setStatus(MAP_LAYER_STATES.SERVICE_UNAVAILABLE, {
                    error: response.error || "Radar metadata unavailable",
                    summary: "RainViewer metadata unavailable"
                });
                return;
            }

            const frame = response.data.radar.past[response.data.radar.past.length - 1];
            const tileLayer = context.L.tileLayer(
                `${response.data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
                {
                    opacity: context.layer.opacity || 0.55,
                    maxNativeZoom: 7,
                    maxZoom: 18,
                    zIndex: this.definition.zIndex,
                    className: "eng-radar-map",
                    attribution: "Weather data by RainViewer"
                }
            );

            tileLayer.on("tileerror", () => {
                if (!this.active) return;
                this.setStatus(MAP_LAYER_STATES.SERVICE_UNAVAILABLE, {
                    error: "Radar tile service unavailable",
                    summary: "RainViewer radar tiles failed"
                });
            });

            this.removeLeafletLayers(context);
            this.rememberLeafletLayer(tileLayer);
            tileLayer.addTo(context.map);
            this.setStatus(MAP_LAYER_STATES.ONLINE, {
                summary: "RainViewer precipitation radar · latest real frame",
                updatedAt: frame.time ? new Date(frame.time * 1000).toISOString() : new Date().toISOString(),
                count: 1
            });
        } catch (error) {
            this.removeLeafletLayers(context);
            this.applyProviderError(error, context, "Radar service unavailable");
        }
    }
}

if (typeof module !== "undefined" && module.exports) module.exports = {WeatherRadarProvider};
if (typeof window !== "undefined") window.AegisWeatherRadarProvider = {WeatherRadarProvider};
})();

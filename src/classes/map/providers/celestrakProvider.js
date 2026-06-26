const {BaseMapProvider} = require("./baseProvider.js");
const {MAP_LAYER_STATES, isOffline} = require("../utils/mapLayerState.js");

const CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php";

class CelesTrakProvider extends BaseMapProvider {
    getGroup(context = this.context) {
        const configured = context && context.getEnv
            ? context.getEnv("CELESTRAK_GROUP") || context.getEnv("AEGISUI_CELESTRAK_GROUP")
            : "";
        return String(configured || this.definition.defaultGroup || "stations")
            .trim()
            .replace(/[^a-z0-9_-]/ig, "")
            .toLowerCase() || "stations";
    }

    async start(context) {
        await super.start(context);
        await this.refresh(context);

        if (this.active && this.definition.updateIntervalMs > 0) {
            this.rememberTimer(setInterval(() => {
                this.refresh(context).catch(error => this.applyProviderError(
                    error,
                    context,
                    "CelesTrak refresh failed"
                ));
            }, this.definition.updateIntervalMs));
        }
    }

    async refresh(context = this.context) {
        if (!this.active) return;

        if (isOffline(context)) {
            this.setStatus(MAP_LAYER_STATES.OFFLINE, {
                summary: "Offline mode · satellite catalog disabled"
            });
            return;
        }

        const group = this.getGroup(context);
        const url = `${CELESTRAK_GP_URL}?GROUP=${encodeURIComponent(group)}&FORMAT=json`;
        const controller = this.createAbortController();

        this.setStatus(MAP_LAYER_STATES.LOADING, {
            summary: `Loading CelesTrak GP data · ${group}`
        });

        try {
            const data = await context.cache.getOrFetch(
                `celestrak:${group}`,
                this.definition.cacheTtlMs,
                () => this.fetchJson(url, {signal: controller.signal, headers: {Accept: "application/json"}})
            );
            const count = Array.isArray(data) ? data.length : 0;

            if (!count) {
                this.setStatus(MAP_LAYER_STATES.NO_DATA, {
                    summary: `CelesTrak returned no objects for ${group}`,
                    count: 0
                });
                return;
            }

            this.catalogSample = data.slice(0, 6).map(item => ({
                name: item.OBJECT_NAME || item.OBJECT_ID || item.NORAD_CAT_ID || "Unknown object",
                norad: item.NORAD_CAT_ID || "",
                epoch: item.EPOCH || ""
            }));
            this.setStatus(MAP_LAYER_STATES.POSITION_ENGINE_REQUIRED, {
                summary: `${count} real CelesTrak GP objects loaded · SGP4 position engine required for markers`,
                count,
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            this.applyProviderError(error, context, "CelesTrak service unavailable");
        }
    }
}

module.exports = {CelesTrakProvider};

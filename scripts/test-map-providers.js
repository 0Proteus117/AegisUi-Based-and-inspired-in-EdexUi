#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

function loadEnvFile(file) {
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(raw => {
        const line = raw.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) return;
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if ((value.startsWith("\"") && value.endsWith("\""))
            || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (key && value && !process.env[key]) process.env[key] = value;
    });
}

function loadLocalConfig() {
    const settingsFile = path.join(os.homedir(), "Library/Application Support/EdexUi-Eng/settings.json");
    try {
        return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    } catch (error) {
        return {};
    }
}

function firstValue(...items) {
    for (const item of items) {
        if (typeof item === "string" && item.trim()) return item.trim();
    }
    return "";
}

function mask(value) {
    const text = String(value || "");
    return text ? `****${text.slice(-4)}` : "MISSING";
}

function requestUrl(remoteUrl, options = {}) {
    return new Promise(resolve => {
        const request = https.get(remoteUrl, {
            headers: {
                "Accept": options.accept || "*/*",
                "User-Agent": "AegisUi/2.0.7 map-provider-diagnostics"
            }
        }, response => {
            const chunks = [];
            let bytes = 0;
            response.on("data", chunk => {
                bytes += chunk.length;
                if (bytes <= (options.maxBytes || 8192)) chunks.push(chunk);
            });
            response.on("end", () => {
                resolve({
                    ok: response.statusCode >= 200 && response.statusCode < 300,
                    status: response.statusCode,
                    contentType: response.headers["content-type"] || "",
                    bytes,
                    body: Buffer.concat(chunks).toString("utf8")
                });
            });
        });
        request.setTimeout(options.timeoutMs || 12000, () => {
            request.destroy();
            resolve({ok: false, status: 0, error: "timeout", bytes: 0, contentType: "", body: ""});
        });
        request.on("error", error => {
            resolve({ok: false, status: 0, error: error.message, bytes: 0, contentType: "", body: ""});
        });
    });
}

async function testTomTom(key) {
    if (!key) {
        return {
            segment: {ok: false, label: "FAIL", detail: "missing key"},
            tile: {ok: false, label: "FAIL", detail: "missing key"}
        };
    }

    const encodedKey = encodeURIComponent(key);
    const segmentUrl = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/12/json?key=${encodedKey}&point=40.4168,-3.7038`;
    const tileUrl = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/12/2044/1360.png?key=${encodedKey}&tileSize=256`;
    const [segment, tile] = await Promise.all([
        requestUrl(segmentUrl, {accept: "application/json"}),
        requestUrl(tileUrl, {accept: "image/png", maxBytes: 1024 * 128})
    ]);

    let segmentHasGeometry = false;
    if (segment.ok) {
        try {
            const data = JSON.parse(segment.body);
            const coords = data && data.flowSegmentData && data.flowSegmentData.coordinates;
            segmentHasGeometry = Boolean(coords && Array.isArray(coords.coordinate) && coords.coordinate.length > 1);
        } catch (error) {}
    }

    return {
        segment: {
            ok: segment.ok && segmentHasGeometry,
            label: segment.ok && segmentHasGeometry ? "OK" : "FAIL",
            detail: segment.ok ? `HTTP ${segment.status}${segmentHasGeometry ? " geometry" : " no-geometry"}` : `HTTP ${segment.status || 0} ${segment.error || ""}`.trim()
        },
        tile: {
            ok: tile.ok && /^image\//i.test(tile.contentType) && tile.bytes > 0,
            label: tile.ok && /^image\//i.test(tile.contentType) && tile.bytes > 0 ? "OK" : "FAIL",
            detail: tile.ok ? `HTTP ${tile.status} ${tile.contentType} ${tile.bytes}B` : `HTTP ${tile.status || 0} ${tile.error || ""}`.trim()
        }
    };
}

function testAisStream(apiKey) {
    return new Promise(resolve => {
        if (!apiKey) {
            resolve({ok: false, label: "FAIL", detail: "missing AISSTREAM_API_KEY"});
            return;
        }
        let WebSocketClient;
        try {
            WebSocketClient = require(path.join(ROOT, "src/node_modules/ws"));
        } catch (error) {
            resolve({ok: false, label: "FAIL", detail: "ws module unavailable"});
            return;
        }

        const ws = new WebSocketClient(AISSTREAM_URL);
        let count = 0;
        let settled = false;
        const finish = result => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch (error) {}
            resolve(result);
        };
        const timeout = setTimeout(() => finish({
            ok: count > 0,
            label: count > 0 ? "OK" : "FAIL",
            detail: count > 0 ? `${count} real messages` : "no messages within timeout"
        }), 18000);

        ws.on("open", () => {
            ws.send(JSON.stringify({
                APIKey: apiKey,
                BoundingBoxes: [[[-90, -180], [90, 180]]],
                FilterMessageTypes: [
                    "PositionReport",
                    "StandardClassBPositionReport",
                    "ExtendedClassBPositionReport",
                    "ShipStaticData"
                ]
            }));
        });
        ws.on("message", () => {
            count += 1;
            if (count >= 3) {
                clearTimeout(timeout);
                finish({ok: true, label: "OK", detail: `${count} real messages`});
            }
        });
        ws.on("error", error => {
            clearTimeout(timeout);
            finish({ok: false, label: "FAIL", detail: String(error.message || error).slice(0, 160)});
        });
        ws.on("close", (code, reason) => {
            if (settled) return;
            clearTimeout(timeout);
            finish({
                ok: count > 0,
                label: count > 0 ? "OK" : "FAIL",
                detail: count > 0 ? `${count} real messages before close` : `closed ${code} ${String(reason || "").slice(0, 80)}`
            });
        });
    });
}

async function testRainViewer() {
    const response = await requestUrl("https://api.rainviewer.com/public/weather-maps.json", {accept: "application/json"});
    if (!response.ok) return {ok: false, label: "FAIL", detail: `HTTP ${response.status || 0}`};
    try {
        const data = JSON.parse(response.body);
        const frames = data && data.radar && Array.isArray(data.radar.past) ? data.radar.past : [];
        const frame = frames[frames.length - 1];
        return {
            ok: Boolean(data.host && frame && frame.path),
            label: data.host && frame && frame.path ? "OK" : "FAIL",
            detail: frame && frame.time ? `last_frame=${new Date(frame.time * 1000).toISOString()}` : "no frame"
        };
    } catch (error) {
        return {ok: false, label: "FAIL", detail: "invalid JSON"};
    }
}

async function testOpenMeteoMarine() {
    const endpoint = "https://marine-api.open-meteo.com/v1/marine"
        + "?latitude=36.55&longitude=-7.25"
        + "&hourly=wave_height,wave_direction,wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl"
        + "&forecast_days=1&cell_selection=sea&timezone=auto";
    const response = await requestUrl(endpoint, {accept: "application/json"});
    if (!response.ok) return {ok: false, label: "FAIL", detail: `HTTP ${response.status || 0}`};
    try {
        const data = JSON.parse(response.body);
        const times = data && data.hourly && Array.isArray(data.hourly.time) ? data.hourly.time : [];
        return {
            ok: times.length > 0,
            label: times.length > 0 ? "OK" : "FAIL",
            detail: times.length > 0 ? `${times.length} hourly sea cells` : "no marine time series"
        };
    } catch (error) {
        return {ok: false, label: "FAIL", detail: "invalid JSON"};
    }
}

(async () => {
    loadEnvFile(path.join(ROOT, ".env.local"));
    loadEnvFile(path.join(ROOT, ".env"));
    const localConfig = loadLocalConfig();
    const tomTomKey = firstValue(
        process.env.TOMTOM_API_KEY,
        process.env.TOMTOM_KEY,
        process.env.VITE_TOMTOM_API_KEY,
        process.env.REACT_APP_TOMTOM_API_KEY,
        process.env.AEGISUI_TOMTOM_API_KEY,
        localConfig.tomtomApiKey,
        localConfig.tomtomKey
    );
    const aisKey = firstValue(process.env.AISSTREAM_API_KEY, process.env.AEGISUI_AISSTREAM_API_KEY);

    console.log(`TOMTOM_KEY: ${mask(tomTomKey)}`);
    console.log(`AISSTREAM_KEY: ${mask(aisKey)}`);

    const tomtom = await testTomTom(tomTomKey);
    const ais = await testAisStream(aisKey);
    const rainviewer = await testRainViewer();
    const marine = await testOpenMeteoMarine();

    console.log(`TOMTOM_FLOW_SEGMENT: ${tomtom.segment.label} ${tomtom.segment.detail}`);
    console.log(`TOMTOM_FLOW_TILE: ${tomtom.tile.label} ${tomtom.tile.detail}`);
    console.log(`AISSTREAM_GLOBAL: ${ais.label} ${ais.detail}`);
    console.log(`RAINVIEWER: ${rainviewer.label} ${rainviewer.detail}`);
    console.log(`OPEN_METEO_MARINE: ${marine.label} ${marine.detail}`);

    const trafficOk = tomtom.segment.ok || tomtom.tile.ok;
    const allOk = trafficOk && ais.ok && rainviewer.ok && marine.ok;
    if (!allOk) process.exit(1);
})().catch(error => {
    console.error(`MAP_PROVIDER_DIAGNOSTICS: FAIL ${String(error.message || error).slice(0, 180)}`);
    process.exit(1);
});

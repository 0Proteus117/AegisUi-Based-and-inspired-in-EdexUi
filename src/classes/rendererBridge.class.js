"use strict";

(function installRendererBridge(root) {
    if (!root || !root.aegis) throw new Error("Aegis preload bridge is unavailable.");

    const invokeRoutes = Object.freeze({
        ...Object.fromEntries(Object.keys(root.aegis.stud).map(channel => [channel, root.aegis.stud[channel]])),
        ...Object.fromEntries(Object.keys(root.aegis.osint).filter(channel => channel.startsWith("osint-")).map(channel => [channel, root.aegis.osint[channel]])),
        ...Object.fromEntries(Object.keys(root.aegis.services).map(channel => [channel, root.aegis.services[channel]]))
    });
    const onceListeners = new Map();

    function dispatch(channel, ...args) {
        const listeners = onceListeners.get(channel) || [];
        onceListeners.delete(channel);
        listeners.forEach(listener => listener({}, ...args));
    }

    root.aegisIpc = Object.freeze({
        invoke(channel, ...args) {
            const operation = invokeRoutes[channel];
            if (typeof operation !== "function") return Promise.reject(Object.assign(new Error(`IPC operation is not exposed: ${channel}`), {code: "IPC_NOT_EXPOSED"}));
            return operation(...args);
        },
        send(channel, ...args) {
            if (channel === "log") return root.aegis.runtime.log(...args);
            if (channel === "setThemeOverride") return root.aegis.runtime.setThemeOverride(...args);
            if (channel === "setKbOverride") return root.aegis.runtime.setKeyboardOverride(...args);
            if (channel === "ttyspawn") return root.aegis.terminal.spawn().then(result => dispatch("ttyspawn-reply", result));
            if (channel === "systeminformation-call") {
                const [type, id, ...callArgs] = args;
                return root.aegis.system.call(type, callArgs).then(result => dispatch(`systeminformation-reply-${id}`, result));
            }
            throw Object.assign(new Error(`IPC send operation is not exposed: ${channel}`), {code: "IPC_NOT_EXPOSED"});
        },
        once(channel, listener) {
            if (typeof listener !== "function") throw new TypeError("IPC listener must be a function.");
            const current = onceListeners.get(channel) || [];
            current.push(listener);
            onceListeners.set(channel, current);
        },
        on(channel, listener) {
            if (channel === "osint-source-event") return root.aegis.osint.onSourceEvent(payload => listener({}, payload));
            throw Object.assign(new Error(`IPC event is not exposed: ${channel}`), {code: "IPC_NOT_EXPOSED"});
        }
    });

    root.AegisRendererRuntime = Object.freeze({
        platform: root.aegis.runtime.bootstrap.runtime.platform,
        version: root.aegis.runtime.bootstrap.runtime.appVersion,
        randomId: () => root.aegis.crypto.randomId(),
        sha256Text: value => root.aegis.crypto.sha256Text(value),
        utf8Bytes: value => root.aegis.crypto.utf8Bytes(value),
        prettyBytes(value) {
            const number = Number(value) || 0;
            if (!number) return "0 B";
            const units = ["B", "kB", "MB", "GB", "TB"];
            const index = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(number)) / Math.log(1000)));
            return `${Number((number / Math.pow(1000, index)).toPrecision(3))} ${units[index]}`;
        }
    });
})(window);

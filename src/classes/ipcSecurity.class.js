"use strict";

const path = require("path");
const {fileURLToPath} = require("url");

function senderUrl(event) {
    if (event && event.senderFrame && event.senderFrame.url) return event.senderFrame.url;
    if (event && event.sender && typeof event.sender.getURL === "function") return event.sender.getURL();
    return "";
}

function isTrustedMainFrame(event, expectedUiPath) {
    if (!event || !expectedUiPath) return false;
    if (event.senderFrame && event.senderFrame.parent) return false;
    try {
        const parsed = new URL(senderUrl(event));
        if (parsed.protocol !== "file:" || parsed.username || parsed.password || parsed.search || parsed.hash) return false;
        return path.resolve(fileURLToPath(parsed)) === path.resolve(expectedUiPath);
    } catch (error) {
        return false;
    }
}

function untrustedError() {
    const error = new Error("Renderer sender is not authorised for this operation.");
    error.code = "UNTRUSTED_RENDERER";
    return error;
}

function createTrustedIpcMain(ipcMain, expectedUiPath) {
    if (!ipcMain || typeof ipcMain.handle !== "function" || typeof ipcMain.on !== "function") {
        throw new TypeError("ipcMain is required.");
    }
    const handlers = new Map();
    return Object.freeze({
        handle(channel, listener) {
            const wrapped = (event, ...args) => {
                if (!isTrustedMainFrame(event, expectedUiPath)) throw untrustedError();
                return listener(event, ...args);
            };
            handlers.set(channel, wrapped);
            ipcMain.handle(channel, wrapped);
        },
        removeHandler(channel) {
            handlers.delete(channel);
            ipcMain.removeHandler(channel);
        },
        on(channel, listener) {
            const wrapped = (event, ...args) => {
                if (!isTrustedMainFrame(event, expectedUiPath)) {
                    if (event) event.returnValue = null;
                    return;
                }
                return listener(event, ...args);
            };
            handlers.set(channel, wrapped);
            ipcMain.on(channel, wrapped);
            return this;
        },
        once(channel, listener) {
            const wrapped = (event, ...args) => {
                if (!isTrustedMainFrame(event, expectedUiPath)) return;
                return listener(event, ...args);
            };
            ipcMain.once(channel, wrapped);
            return this;
        },
        removeListener(channel, listener) {
            ipcMain.removeListener(channel, listener);
            return this;
        },
        isTrusted(event) { return isTrustedMainFrame(event, expectedUiPath); }
    });
}

module.exports = {senderUrl, isTrustedMainFrame, createTrustedIpcMain};

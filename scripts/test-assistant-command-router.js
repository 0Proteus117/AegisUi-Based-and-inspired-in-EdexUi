#!/usr/bin/env node

"use strict";

const {AssistantCommandRouter, ASSISTANT_SAFE_ACTIONS} = require("../src/classes/assistant/assistantCommandRouter.class.js");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

async function main() {
    const calls = [];
    const fakeWindow = {
        assistantPresence: {
            panel: {
                setOpen: value => calls.push(`panel:${value}`),
                close: () => calls.push("panel:close"),
                openExpandedChat: () => calls.push("expanded:open"),
                closeExpandedChat: () => calls.push("expanded:close"),
                clear: () => calls.push("conversation:clear")
            },
            settings: {patch: value => calls.push(`settings:${JSON.stringify(value)}`)},
            refreshLabels: () => calls.push("labels:refresh")
        },
        workspaceManager: {setActiveWorkspace: id => calls.push(`workspace:${id}`)},
        engineeringDashboard: {
            musicPanel: {connect: async () => calls.push("music:connect")},
            mapPanel: {toggleLayer: id => calls.push(`map:${id}`)}
        }
    };

    const router = new AssistantCommandRouter({context: () => fakeWindow});
    const open = await router.executeFromText("abre el chat grande");
    const switchProfile = await router.executeFromText("cambia a Angie");
    const blocked = await router.executeFromText("ejecuta rm -rf todo");
    const unknown = await router.executeFromText("cuéntame una historia corta");

    const ok = open.ok
        && switchProfile.ok
        && blocked.handled
        && !blocked.ok
        && unknown.handled === false
        && ASSISTANT_SAFE_ACTIONS.length >= 10
        && calls.includes("expanded:open");

    print("COMMAND_ROUTER_ALLOWLIST", ASSISTANT_SAFE_ACTIONS.length >= 10 ? "OK" : "FAIL");
    print("COMMAND_ROUTER_SAFE_ACTION", open.ok ? "OK" : "FAIL");
    print("COMMAND_ROUTER_PROFILE_ACTION", switchProfile.ok ? "OK" : "FAIL");
    print("COMMAND_ROUTER_BLOCKED_ACTION", blocked.status === "BLOCKED" ? "OK" : "FAIL");
    print("COMMAND_ROUTER_NO_SHELL_ARBITRARY", blocked.status === "BLOCKED" ? "OK" : "FAIL");
    print("COMMAND_ROUTER_UNKNOWN_CHAT", unknown.handled === false ? "OK" : "FAIL");
    print("SECURITY", ok ? "OK" : "FAIL");
    print("COMMAND_ROUTER", ok ? "OK" : "FAIL");
    if (!ok) process.exit(1);
}

main().catch(error => {
    print("COMMAND_ROUTER", "FAIL");
    print("RAW_ERROR", error.message || String(error));
    process.exit(1);
});

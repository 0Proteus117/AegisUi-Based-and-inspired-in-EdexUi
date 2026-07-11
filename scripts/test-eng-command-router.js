#!/usr/bin/env node

"use strict";

const {AssistantCommandRouter} = require("../src/classes/assistant/assistantCommandRouter.class.js");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

async function main() {
    const calls = [];
    const fakeWindow = {
        workspaceManager: {
            setActiveWorkspace: id => calls.push(`workspace:${id}`),
            openEngineeringCategory: id => calls.push(`category:${id}`),
            openEngineeringToolById: id => calls.push(`tool:${id}`),
            openEngineeringCalculator: id => calls.push(`calculator:${id}`)
        },
        assistantPresence: {
            panel: {},
            settings: {patch: () => {}},
            refreshLabels: () => {}
        },
        engineeringDashboard: {}
    };
    const router = new AssistantCommandRouter({context: () => fakeWindow});

    const normal = router.classifyMessage("hola, qué tal");
    const openEng = await router.executeFromText("abre ingeniería");
    const cad = await router.executeFromText("abre CAD");
    const torque = await router.executeFromText("abre calculadora de torque");
    const materials = await router.executeFromText("abre materiales");
    const fusion = await router.executeFromText("abre Fusion");
    const gearLab = await router.executeFromText("abre generador de engranajes");
    const blocked = await router.executeFromText("ejecuta rm -rf /");

    await new Promise(resolve => setTimeout(resolve, 120));

    const ok = normal.type === "CHAT"
        && openEng.ok
        && cad.ok
        && torque.ok
        && materials.ok
        && fusion.ok
        && gearLab.ok
        && blocked.status === "BLOCKED"
        && calls.includes("workspace:ENGINEER")
        && calls.includes("category:cad")
        && calls.includes("calculator:torque_power_rpm")
        && calls.includes("category:materials")
        && calls.includes("tool:fusion");
    const gearLabOk = gearLab.ok && calls.includes("tool:aegis-gearlab");

    print("ENG_ROUTER_NORMAL_CHAT", normal.type === "CHAT" ? "OK" : "FAIL");
    print("ENG_ROUTER_OPEN_WORKSPACE", openEng.ok ? "OK" : "FAIL");
    print("ENG_ROUTER_CATEGORY", cad.ok && materials.ok ? "OK" : "FAIL");
    print("ENG_ROUTER_CALCULATOR", torque.ok ? "OK" : "FAIL");
    print("ENG_ROUTER_TOOL", fusion.ok ? "OK" : "FAIL");
    print("ENG_ROUTER_GEARLAB", gearLabOk ? "OK" : "FAIL");
    print("ENG_ROUTER_BLOCKED", blocked.status === "BLOCKED" ? "OK" : "FAIL");
    print("ENG_COMMAND_ROUTER", ok && gearLabOk ? "OK" : "FAIL");
    if (!ok || !gearLabOk) process.exit(1);
}

main().catch(error => {
    print("ENG_COMMAND_ROUTER", "FAIL");
    print("RAW_ERROR", error.message || String(error));
    process.exit(1);
});

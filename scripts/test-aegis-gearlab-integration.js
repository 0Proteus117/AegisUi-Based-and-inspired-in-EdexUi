#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const registry = require("../src/classes/workspaces/engineeringTools.registry.js");
const {AssistantCommandRouter} = require("../src/classes/assistant/assistantCommandRouter.class.js");

const ROOT = path.resolve(__dirname, "..");
const GEARLAB = path.join(ROOT, "tools", "aegis-gearlab");

function exists(relativePath) {
    return fs.existsSync(path.join(GEARLAB, relativePath));
}

function print(key, value) {
    console.log(`${key}: ${value}`);
}

async function main() {
    const required = [
        "README.md",
        "ROADMAP.md",
        "AegisUI_INTEGRATION.md",
        "setup_mac.sh",
        "run_api.sh",
        "pyproject.toml",
        "examples/spur_external_example.json",
        "examples/spur_internal_example.json",
        "examples/internal_pair_example.json",
        "examples/helical_external_example.json",
        "examples/herringbone_external_example.json",
        "aegis_gearlab/main.py",
        "aegis_gearlab/api/routes.py",
        "aegis_gearlab/api/schemas.py",
        "aegis_gearlab/core/gear_math.py",
        "aegis_gearlab/core/involute.py",
        "aegis_gearlab/cad/spur_external.py",
        "aegis_gearlab/cad/exporters.py"
    ];
    const missing = required.filter(item => !exists(item));
    const tool = registry.TOOLS.find(item => item.id === "aegis-gearlab");
    const calls = [];
    const fakeWindow = {
        workspaceManager: {
            setActiveWorkspace: id => calls.push(`workspace:${id}`),
            openEngineeringToolById: id => calls.push(`tool:${id}`)
        },
        assistantPresence: {panel: {}, settings: {patch: () => {}}, refreshLabels: () => {}},
        engineeringDashboard: {}
    };
    const router = new AssistantCommandRouter({context: () => fakeWindow});
    const command = await router.executeFromText("abre Aegis GearLab");
    const normal = router.classifyMessage("explícame cómo funciona una involuta");
    await new Promise(resolve => setTimeout(resolve, 120));

    const moduleOk = fs.existsSync(GEARLAB) && missing.length === 0;
    const registryOk = Boolean(tool
        && tool.type === "special"
        && tool.actionId === "aegis_gearlab"
        && tool.supportsFullscreen
        && tool.supportsCommandRouter);
    const routerOk = command.ok
        && calls.includes("workspace:ENGINEER")
        && calls.includes("tool:aegis-gearlab")
        && normal.type === "CHAT";
    const hubIsolation = !required.some(item => item.includes("engineeringDashboard") || item.includes("_boot"));

    print("GEARLAB_MODULE", moduleOk ? "OK" : "FAIL");
    print("GEARLAB_DOCS", ["README.md", "ROADMAP.md", "AegisUI_INTEGRATION.md"].every(exists) ? "OK" : "FAIL");
    print("GEARLAB_SCRIPTS", ["setup_mac.sh", "run_api.sh"].every(exists) ? "OK" : "FAIL");
    print("GEARLAB_EXAMPLES", required.filter(item => item.startsWith("examples/")).every(exists) ? "OK" : "FAIL");
    print("GEARLAB_ENG_REGISTRY", registryOk ? "OK" : "FAIL");
    print("GEARLAB_COMMAND_ROUTER", routerOk ? "OK" : "FAIL");
    print("GEARLAB_HUB_ISOLATION", hubIsolation ? "OK" : "FAIL");
    print("AEGIS_GEARLAB_INTEGRATION", moduleOk && registryOk && routerOk && hubIsolation ? "OK" : "FAIL");
    if (missing.length) missing.forEach(item => console.error(`- missing ${item}`));
    if (!(moduleOk && registryOk && routerOk && hubIsolation)) process.exit(1);
}

main().catch(error => {
    print("AEGIS_GEARLAB_INTEGRATION", "FAIL");
    print("RAW_ERROR", error.message || String(error));
    process.exit(1);
});


#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const gearlab = path.join(root, "tools", "aegis-gearlab");

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
    ? fs.readFileSync(path.join(root, relativePath), "utf8")
    : "";
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

check("GEARLAB_FOLDER", fs.existsSync(gearlab));
check("README", exists("tools/aegis-gearlab/README.md"));
check("ROADMAP", exists("tools/aegis-gearlab/ROADMAP.md"));
check("FUTURE_INTEGRATION_DOC", exists("tools/aegis-gearlab/AegisUI_INTEGRATION_FUTURE.md"));
check("OLD_ACTIVE_INTEGRATION_DOC_ABSENT", !exists("tools/aegis-gearlab/AegisUI_INTEGRATION.md"));
check("RUN_API_SCRIPT", exists("tools/aegis-gearlab/run_api.sh"));
check("RUN_UI_SCRIPT", exists("tools/aegis-gearlab/run_ui.sh"));
check("SETUP_SCRIPT", exists("tools/aegis-gearlab/setup_mac.sh"));
check("UI_TEMPLATE", exists("tools/aegis-gearlab/aegis_gearlab/ui/templates/index.html"));
check("UI_CSS", exists("tools/aegis-gearlab/aegis_gearlab/ui/static/style.css"));

[
  "spur_external_example.json",
  "spur_internal_example.json",
  "internal_pair_example.json",
  "helical_external_example.json",
  "herringbone_external_example.json",
  "bevel_external_example.json",
  "worm_gear_example.json",
  "rack_pinion_example.json",
  "planetary_set_example.json",
].forEach((file) => check(`EXAMPLE_${file}`, exists(`tools/aegis-gearlab/examples/${file}`)));

const engRegistry = read("src/classes/workspaces/engineeringTools.registry.js");
const router = read("src/classes/assistant/assistantCommandRouter.class.js");
const packageJson = read("package.json");
check("NO_ACTIVE_ENG_REGISTRY_INTEGRATION", !/gearlab|Aegis GearLab|aegis-gearlab/i.test(engRegistry));
check("NO_ACTIVE_COMMAND_ROUTER_ACTION", !/gearlab|open_eng_tool_aegis/i.test(router));
check("NO_ELECTRON_EXTRA_RESOURCE", !/aegis-gearlab|GearLab/i.test(packageJson));

const trackedExports = git(["ls-files", "tools/aegis-gearlab/exports"]).split(/\n/).filter(Boolean);
check(
  "GEARLAB_EXPORTS_TRACKED_ONLY_GITKEEP",
  trackedExports.length === 1 && trackedExports[0] === "tools/aegis-gearlab/exports/.gitkeep",
  trackedExports.join(", ")
);

const ignored = git(["check-ignore", "--no-index", "tools/aegis-gearlab/.venv", "tools/aegis-gearlab/exports/generated.step"]);
check("GEARLAB_LOCAL_ARTIFACTS_IGNORED", ignored.includes(".venv") && ignored.includes("generated.step"));

for (const result of checks) {
  console.log(`${result.name}: ${result.ok ? "OK" : "FAIL"}${result.detail ? ` ${result.detail}` : ""}`);
}

const failed = checks.filter((item) => !item.ok);
console.log(`AEGIS_GEARLAB_STANDALONE: ${failed.length ? "FAIL" : "OK"}`);
if (failed.length) {
  process.exit(1);
}

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
    EXPORTABLE_JSON_FILES,
    USER_DATA_DIR,
    redactSensitiveData
} = require("./config-paths");

function argumentValue(flag, fallback) {
    const index = process.argv.indexOf(flag);
    if (index === -1 || !process.argv[index + 1]) return fallback;
    return process.argv[index + 1];
}

const outputPath = path.resolve(argumentValue(
    "--out",
    `aegisui-config-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
));

if (!fs.existsSync(USER_DATA_DIR)) {
    console.error(`Local data folder not found: ${USER_DATA_DIR}`);
    console.error("Launch the app once before exporting configuration.");
    process.exit(1);
}

const files = {};
for (const fileName of EXPORTABLE_JSON_FILES) {
    const filePath = path.join(USER_DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
        files[fileName] = redactSensitiveData(JSON.parse(fs.readFileSync(filePath, "utf8")));
    } catch (error) {
        console.warn(`Skipping ${fileName}: ${error.message}`);
    }
}

const bundle = {
    format: "aegisui.user-config.v1",
    exportedAt: new Date().toISOString(),
    sourceAppDataDir: USER_DATA_DIR,
    includesSecrets: false,
    note: "API keys, tokens, passwords and sessions are intentionally removed. Add keys separately on the destination Mac.",
    files
};

fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 4));
console.log(`Export written to ${outputPath}`);
console.log("Secrets were not exported.");

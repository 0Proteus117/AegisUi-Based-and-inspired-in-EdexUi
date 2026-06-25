#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
    EXPORTABLE_JSON_FILES,
    USER_DATA_DIR,
    mergeWithoutSecrets
} = require("./config-paths");

function argumentValue(flag, fallback) {
    const index = process.argv.indexOf(flag);
    if (index === -1 || !process.argv[index + 1]) return fallback;
    return process.argv[index + 1];
}

const input = argumentValue("--from", process.argv[2]);
if (!input) {
    console.error("Usage: npm run config:import -- --from ./aegisui-config-export.json");
    process.exit(1);
}

const inputPath = path.resolve(input);
if (!fs.existsSync(inputPath)) {
    console.error(`Import file not found: ${inputPath}`);
    process.exit(1);
}

const bundle = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (bundle.format !== "aegisui.user-config.v1" || !bundle.files || typeof bundle.files !== "object") {
    console.error("This does not look like an AegisUi configuration export.");
    process.exit(1);
}

fs.mkdirSync(USER_DATA_DIR, {recursive: true});
const backupDir = path.join(
    USER_DATA_DIR,
    `import-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
);
fs.mkdirSync(backupDir, {recursive: true});

let imported = 0;
for (const fileName of EXPORTABLE_JSON_FILES) {
    if (!Object.prototype.hasOwnProperty.call(bundle.files, fileName)) continue;
    const destination = path.join(USER_DATA_DIR, fileName);
    const backup = path.join(backupDir, fileName);
    let existing = {};
    if (fs.existsSync(destination)) {
        fs.copyFileSync(destination, backup);
        try {
            existing = JSON.parse(fs.readFileSync(destination, "utf8"));
        } catch (error) {
            existing = {};
        }
    }

    const nextData = mergeWithoutSecrets(existing, bundle.files[fileName]);
    fs.writeFileSync(destination, JSON.stringify(nextData, null, 4));
    imported++;
}

console.log(`Imported ${imported} file(s) into ${USER_DATA_DIR}`);
console.log(`Previous files were backed up in ${backupDir}`);
console.log("API keys and other secrets were not imported from the bundle.");

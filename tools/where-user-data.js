#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {EXPORTABLE_JSON_FILES, USER_DATA_DIR} = require("./config-paths");

console.log(`AegisUi / EdexUi-Eng local data folder: ${USER_DATA_DIR}`);

if (!fs.existsSync(USER_DATA_DIR)) {
    console.log("Status: not created yet. Launch the app once to create it.");
    process.exit(0);
}

console.log("Known portable JSON files:");
for (const fileName of EXPORTABLE_JSON_FILES) {
    const filePath = path.join(USER_DATA_DIR, fileName);
    console.log(`- ${fileName}: ${fs.existsSync(filePath) ? "present" : "missing"}`);
}

console.log("Caches and generated helpers in this folder should not be committed or shared by default.");

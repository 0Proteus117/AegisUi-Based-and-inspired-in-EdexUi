#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(projectRoot, "assistant", "memory", "private", "bootstrap");
const destination = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "EdexUi-Eng",
    "assistant",
    "memory",
    "bootstrap"
);

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

function memoryFiles(folder) {
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder)
        .filter(file => /\.(md|json)$/i.test(file))
        .filter(file => !file.startsWith("."))
        .sort();
}

function print(key, value) {
    console.log(`${key}: ${value}`);
}

function main() {
    const files = memoryFiles(source);
    if (!files.length) {
        print("PRIVATE_MEMORY_SOURCE", "FAIL");
        print("SOURCE", source);
        process.exit(1);
    }
    print("PRIVATE_MEMORY_SOURCE", "OK");
    print("SOURCE", source);

    fs.mkdirSync(path.dirname(destination), {recursive: true});
    print("USERDATA_DESTINATION", "OK");
    print("DESTINATION", destination);

    let backupPath = "";
    if (fs.existsSync(destination) && memoryFiles(destination).length) {
        backupPath = `${destination}.backup-${timestamp()}`;
        fs.renameSync(destination, backupPath);
        print("BACKUP_PATH", backupPath);
    }

    fs.mkdirSync(destination, {recursive: true});
    files.forEach(file => {
        fs.copyFileSync(path.join(source, file), path.join(destination, file));
    });

    print("FILES_COPIED", files.length);
    print("PRIVATE_MEMORY_INSTALLED", "OK");
}

main();

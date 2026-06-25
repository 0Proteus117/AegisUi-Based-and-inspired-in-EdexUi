#!/usr/bin/env node

const path = require("path");
const {spawnSync} = require("child_process");

const root = path.join(__dirname, "..");
const npmExecPath = process.env.npm_execpath;

function runAudit(cwd) {
    const command = npmExecPath ? process.execPath : "npm";
    const args = npmExecPath ? [npmExecPath, "audit"] : ["audit"];
    const result = spawnSync(command, args, {
        cwd,
        stdio: "inherit"
    });
    if (result.error) {
        console.error(result.error.message);
        process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status);
}

runAudit(root);
runAudit(path.join(root, "src"));

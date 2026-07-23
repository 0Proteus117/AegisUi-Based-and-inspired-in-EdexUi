#!/usr/bin/env node

const {execFileSync, spawnSync} = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {AssistantMemoryBootstrap} = require("../src/classes/assistant/assistantMemoryBootstrap.class.js");

const projectRoot = path.resolve(__dirname, "..");
const schema = path.join(projectRoot, "assistant", "memory", "bootstrap", "schema.json");
const privateBootstrap = path.join(projectRoot, "assistant", "memory", "private", "bootstrap");
const installedBootstrap = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "EdexUi-Eng",
    "assistant",
    "memory",
    "bootstrap"
);

function print(key, value) {
    console.log(`${key}: ${value}`);
}

function ok(condition, key, value = "OK") {
    print(key, condition ? value : "FAIL");
    if (!condition) process.exitCode = 1;
}

function runGit(args) {
    try {
        return execFileSync("git", args, {
            cwd: projectRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"]
        }).trim();
    } catch (error) {
        return "";
    }
}

function listMemoryFiles(folder) {
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder).filter(file => /\.(md|json)$/i.test(file)).sort();
}

function main() {
    ok(fs.existsSync(schema), "MEMORY_SCHEMA");
    if (fs.existsSync(schema)) JSON.parse(fs.readFileSync(schema, "utf8"));

    const localFiles = listMemoryFiles(privateBootstrap);
    const ignored = runGit(["check-ignore", "assistant/memory/private/bootstrap/00_index.md"]);
    ok(Boolean(ignored), "PRIVATE_BOOTSTRAP_GITIGNORED");
    const cleanWorktreeWithoutPrivateSource = localFiles.length === 0 && Boolean(ignored);
    if (cleanWorktreeWithoutPrivateSource) {
        print("PRIVATE_BOOTSTRAP_LOCAL", "CLEAN_WORKTREE_NOT_PRESENT_EXPECTED");
    } else {
        ok(localFiles.length >= 10, "PRIVATE_BOOTSTRAP_LOCAL");
    }

    const tracked = runGit(["ls-files", "assistant/memory/private"]);
    ok(!tracked, "PRIVATE_BOOTSTRAP_TRACKED", tracked ? "YES" : "NO");

    const stagedPrivate = runGit(["diff", "--cached", "--name-only", "--", "assistant/memory/private"]);
    ok(!stagedPrivate, "PRIVATE_BOOTSTRAP_STAGED", stagedPrivate ? "YES" : "NO");

    if (cleanWorktreeWithoutPrivateSource) {
        print("USERDATA_INSTALL", "SKIPPED_CLEAN_WORKTREE_SOURCE_ABSENT");
    } else {
        const install = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "install-assistant-bootstrap-memory.js")], {
            cwd: projectRoot,
            encoding: "utf8"
        });
        if (install.stdout) process.stdout.write(install.stdout);
        if (install.stderr) process.stderr.write(install.stderr);
        ok(install.status === 0, "USERDATA_INSTALL");
    }

    const installedFiles = listMemoryFiles(installedBootstrap);
    ok(installedFiles.length >= 10, "USERDATA_BOOTSTRAP_FILES", String(installedFiles.length));

    const loader = new AssistantMemoryBootstrap({projectRoot, userDataPath: path.join(os.homedir(), "Library", "Application Support", "EdexUi-Eng")});
    const status = loader.status();
    ok(status.status === "READY" && status.files >= 10, "MEMORY_LOADER");

    const stagedEnv = runGit(["diff", "--cached", "--name-only", "--", ".env", ".env.local"]);
    ok(!stagedEnv, "ENV_STAGED", stagedEnv ? "YES" : "NO");

    print("MEMORY_STATUS", status.status);
    print("MEMORY_FILES", status.files);
    print("READY_FOR_LOCAL_CHAT", process.exitCode ? "NO" : "YES");
}

main();

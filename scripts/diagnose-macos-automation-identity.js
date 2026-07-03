#!/usr/bin/env node

const {execFile} = require("child_process");
const {promisify} = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = promisify(execFile);

function print(name, value = "") {
    console.log(`${name}: ${value}`);
}

async function run(command, args, options = {}) {
    try {
        const {stdout, stderr} = await execFileAsync(command, args, {
            timeout: options.timeout || 10000,
            maxBuffer: options.maxBuffer || 1024 * 1024
        });
        return {ok: true, output: `${stdout}${stderr}`.trim()};
    } catch (error) {
        const output = `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`.trim();
        return {ok: false, output};
    }
}

async function readPlist(appPath, key) {
    const plist = path.join(appPath, "Contents", "Info.plist");
    if (!fs.existsSync(plist)) return "";
    const result = await run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist]);
    return result.ok ? result.output.trim() : "";
}

function parseCodesignValue(output, key) {
    const line = output.split(/\r?\n/).find(item => item.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : "";
}

async function main() {
    const candidate = process.argv[2]
        || path.join(process.cwd(), "dist", "manual-v2.1.4", "EdexUi-Eng.app");
    const appPath = path.resolve(candidate);
    const exists = fs.existsSync(appPath);

    print("APP_NAME", exists ? path.basename(appPath) : "not found");
    print("APP_PATH", appPath);
    print("APP_EXISTS", exists ? "yes" : "no");
    print("NODE_EXEC_PATH", process.execPath);
    print("ELECTRON_RUNTIME", process.versions.electron ? process.versions.electron : "no");
    print("PACKAGED", "not running inside Electron app context");

    if (!exists) return;

    print("BUNDLE_IDENTIFIER", await readPlist(appPath, "CFBundleIdentifier"));
    print("BUNDLE_NAME", await readPlist(appPath, "CFBundleName"));
    print("BUNDLE_DISPLAY_NAME", await readPlist(appPath, "CFBundleDisplayName"));
    print("BUNDLE_VERSION", await readPlist(appPath, "CFBundleVersion"));
    print("BUNDLE_SHORT_VERSION", await readPlist(appPath, "CFBundleShortVersionString"));

    const signature = await run("/usr/bin/codesign", ["-dv", "--verbose=4", appPath], {maxBuffer: 2 * 1024 * 1024});
    print("CODESIGN_DV", signature.ok ? "OK" : "FAIL");
    if (signature.output) {
        print("CODESIGN_IDENTIFIER", parseCodesignValue(signature.output, "Identifier") || "unknown");
        print("CODESIGN_TEAM_IDENTIFIER", parseCodesignValue(signature.output, "TeamIdentifier") || "not set");
        print("CODESIGN_SIGNATURE", parseCodesignValue(signature.output, "Signature") || "unknown");
    }

    const verify = await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], {maxBuffer: 2 * 1024 * 1024});
    print("CODESIGN_VERIFY", verify.ok ? "OK" : "FAIL");
    if (verify.output) print("CODESIGN_VERIFY_DETAIL", verify.output.replace(/\s+/g, " ").slice(0, 500));
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

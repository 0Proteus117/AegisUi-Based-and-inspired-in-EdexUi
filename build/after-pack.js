const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");

function findSpawnHelpers(root, matches = []) {
    for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            findSpawnHelpers(entryPath, matches);
        } else if (entry.isFile() && entry.name === "spawn-helper") {
            matches.push(entryPath);
        }
    }
    return matches;
}

exports.default = async function removeMacMetadata(context) {
    if (context.electronPlatformName !== "darwin") return;
    execFileSync("/usr/bin/xattr", ["-cr", context.appOutDir], {
        stdio: "ignore"
    });

    // node-pty launches this binary outside the Electron process. Keep it
    // unpacked and explicitly ad-hoc signed so macOS does not reject it with
    // SIGKILL / Code Signature Invalid on the final packaged application.
    const helpers = findSpawnHelpers(context.appOutDir);
    if (helpers.length === 0) {
        throw new Error("node-pty spawn-helper missing from packaged macOS application");
    }
    for (const helper of helpers) {
        // npm/pnpm staging can preserve the helper without an executable bit.
        // Signing alone is insufficient: node-pty must execute this binary to
        // create the first terminal, before the main Aegis window is shown.
        fs.chmodSync(helper, 0o755);
        execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", helper], {
            stdio: "ignore"
        });
    }
};

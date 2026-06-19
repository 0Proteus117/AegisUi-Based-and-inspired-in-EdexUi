const {execFileSync} = require("child_process");

exports.default = async function removeMacMetadata(context) {
    if (context.electronPlatformName !== "darwin") return;
    execFileSync("/usr/bin/xattr", ["-cr", context.appOutDir], {
        stdio: "ignore"
    });
};

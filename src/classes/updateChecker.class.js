class UpdateChecker {
    constructor() {
        const https = require("https");
        const electron = require("electron");
        const remote = require("@electron/remote");
        const current = remote.app.getVersion();
        const tagPrefix = "edexui-eng-v";

        if (window.settings && (window.settings.disableUpdateCheck || window.settings.offlineMode)) {
            electron.ipcRenderer.send("log", "info", "UpdateChecker: Disabled by local settings.");
            return;
        }

        const versionParts = version => {
            return String(version)
                .replace(tagPrefix, "")
                .split(".")
                .map(part => Number.parseInt(part, 10) || 0);
        };
        const compareVersions = (left, right) => {
            const a = versionParts(left);
            const b = versionParts(right);
            for (let i = 0; i < Math.max(a.length, b.length); i++) {
                if ((a[i] || 0) > (b[i] || 0)) return 1;
                if ((a[i] || 0) < (b[i] || 0)) return -1;
            }
            return 0;
        };
        const fail = error => {
            electron.ipcRenderer.send("log", "note", "UpdateChecker: Could not fetch EdexUi-Eng releases.");
            electron.ipcRenderer.send("log", "debug", `Error: ${error}`);
        };

        const request = https.get({
            protocol: "https:",
            host: "api.github.com",
            path: "/repos/0Proteus117/AegisUi-Based-and-inspired-in-EdexUi/releases?per_page=10",
            headers: {
                "User-Agent": "EdexUi-Eng UpdateChecker"
            }
        }, response => {
            let rawData = "";
            response.on("data", chunk => rawData += chunk);
            response.on("end", () => {
                if (response.statusCode !== 200) {
                    fail(`GitHub returned ${response.statusCode}`);
                    return;
                }
                try {
                    const releases = JSON.parse(rawData);
                    const release = releases.find(item => {
                        return !item.draft && String(item.tag_name).startsWith(tagPrefix);
                    });
                    if (!release) {
                        electron.ipcRenderer.send("log", "info", "UpdateChecker: No EdexUi-Eng release found.");
                        return;
                    }

                    const comparison = compareVersions(current, release.tag_name);
                    if (comparison === 0) {
                        electron.ipcRenderer.send("log", "info", "UpdateChecker: Running latest EdexUi-Eng version.");
                    } else if (comparison > 0) {
                        electron.ipcRenderer.send("log", "info", "UpdateChecker: Running an EdexUi-Eng development version.");
                    } else {
                        new Modal({
                            type: "info",
                            title: "New EdexUi-Eng version available",
                            message: `EdexUi-Eng <strong>${release.tag_name.replace(tagPrefix, "")}</strong> is available.<br/>Open the <a href="#" onclick="require('electron').shell.openExternal('${release.html_url}')">GitHub release</a> to download it.`
                        });
                        electron.ipcRenderer.send("log", "info", `UpdateChecker: New EdexUi-Eng version ${release.tag_name} available.`);
                    }
                } catch (error) {
                    fail(error);
                }
            });
        }).on("error", fail);
        request.setTimeout(5000, () => {
            request.destroy(new Error("GitHub update check timeout"));
        });
    }
}

module.exports = {
    UpdateChecker
};

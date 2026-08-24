class UpdateChecker {
    constructor() {
        const current = window.AegisRendererRuntime.version;
        const tagPrefix = "edexui-eng-v";

        if (window.settings && (window.settings.disableUpdateCheck || window.settings.offlineMode)) {
            window.aegis.runtime.log("info", "UpdateChecker: Disabled by local settings.");
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
            window.aegis.runtime.log("note", "UpdateChecker: Could not fetch AegisUi releases.");
            window.aegis.runtime.log("debug", `Error: ${error}`);
        };

        window.aegis.updates.check().then(release => {
                try {
                    if (!release || !release.tag) {
                        window.aegis.runtime.log("info", "UpdateChecker: No AegisUi release found.");
                        return;
                    }
                    const comparison = compareVersions(current, release.tag);
                    if (comparison === 0) {
                        window.aegis.runtime.log("info", "UpdateChecker: Running latest AegisUi version.");
                    } else if (comparison > 0) {
                        window.aegis.runtime.log("info", "UpdateChecker: Running an AegisUi development version.");
                    } else {
                        const modal = new Modal({
                            type: "info",
                            title: "New AegisUi version available",
                            message: `AegisUi <strong>${release.tag.replace(tagPrefix, "")}</strong> is available.<br/><button type="button" data-aegis-open-release>OPEN GITHUB RELEASE</button>`
                        });
                        const button = document.querySelector(`#modal_${modal.id} [data-aegis-open-release]`);
                        if (button) button.addEventListener("click", () => window.aegis.updates.open(release.url));
                        window.aegis.runtime.log("info", `UpdateChecker: New AegisUi version ${release.tag} available.`);
                    }
                } catch (error) {
                    fail(error);
                }
        }).catch(fail);
    }
}

module.exports = {
    UpdateChecker
};

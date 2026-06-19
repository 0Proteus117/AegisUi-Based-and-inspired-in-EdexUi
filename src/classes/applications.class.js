class ApplicationsDisplay {
    constructor(parentId) {
        if (!parentId) throw "Missing options";

        this.ipc = require("electron").ipcRenderer;
        this.parent = document.getElementById(parentId);
        this.parent.innerHTML = `
            <div class="eng-apps-loading">
                <span class="eng-scanline"></span>
                SCANNING INSTALLED APPLICATIONS
            </div>`;
        this.load();
    }

    async load() {
        try {
            const applications = await this.ipc.invoke("applications-list");
            this.render(applications);
        } catch (error) {
            this.parent.innerHTML = `<div class="eng-empty-state">APPLICATION INDEX UNAVAILABLE</div>`;
        }
    }

    render(applications) {
        this.parent.innerHTML = "";
        if (!applications.length) {
            this.parent.innerHTML = `<div class="eng-empty-state">NO APPLICATIONS DETECTED</div>`;
            return;
        }

        applications.forEach(application => {
            const tile = document.createElement("button");
            tile.className = "eng-app-tile";
            tile.title = application.path;

            if (application.icon) {
                const icon = document.createElement("img");
                icon.src = application.icon;
                icon.alt = "";
                tile.appendChild(icon);
            } else {
                const fallback = document.createElement("span");
                fallback.className = "eng-app-fallback";
                fallback.innerText = application.name.slice(0, 2).toUpperCase();
                tile.appendChild(fallback);
            }

            const name = document.createElement("span");
            name.innerText = application.name;
            tile.appendChild(name);

            tile.addEventListener("click", async () => {
                tile.classList.add("launching");
                window.audioManager.folder.play();
                const result = await this.ipc.invoke("launch-application", application.path);
                if (!result.ok) {
                    tile.classList.add("failed");
                    tile.title = result.error;
                }
                setTimeout(() => tile.classList.remove("launching"), 500);
            });
            this.parent.appendChild(tile);
        });
    }
}

module.exports = {
    ApplicationsDisplay
};

(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.AssistantMemoryBootstrap = exported.AssistantMemoryBootstrap;
})(typeof window !== "undefined" ? window : null, function() {
    const MEMORY_FILES = [
        "00_index.md",
        "01_gabriel_profile.md",
        "02_communication_preferences.md",
        "03_aegisui_project_state.md",
        "04_technical_projects.md",
        "05_current_roadmap.md",
        "06_assistant_identity.md",
        "07_codex_workflow_rules.md",
        "08_safety_authority.md",
        "09_sensitive_boundaries.md"
    ];

    function optionalRequire(name) {
        try {
            if (typeof require === "function") return require(name);
        } catch (error) {}
        return null;
    }

    function timestamp() {
        return new Date().toISOString().replace(/[:.]/g, "-");
    }

    class AssistantMemoryBootstrap {
        constructor(options = {}) {
            this.fs = options.fs || optionalRequire("fs");
            this.path = options.path || optionalRequire("path");
            this.os = options.os || optionalRequire("os");
            this.shell = options.shell || (optionalRequire("electron") || {}).shell || null;
            this.app = options.app || this.resolveElectronApp();
            this.projectRoot = options.projectRoot || this.resolveProjectRoot();
            this.userDataPath = options.userDataPath || this.resolveUserDataPath();
        }

        resolveElectronApp() {
            try {
                const remote = optionalRequire("@electron/remote");
                if (remote && remote.app) return remote.app;
            } catch (error) {}
            return null;
        }

        resolveUserDataPath() {
            if (this.app && this.app.getPath) return this.app.getPath("userData");
            if (!this.path || !this.os) return "";
            return this.path.join(this.os.homedir(), "Library", "Application Support", "EdexUi-Eng");
        }

        resolveProjectRoot() {
            if (!this.path) return "";
            const candidates = [];
            try {
                if (this.app && this.app.getAppPath) {
                    const appPath = this.app.getAppPath();
                    candidates.push(appPath);
                    candidates.push(this.path.dirname(appPath));
                    candidates.push(this.path.dirname(this.path.dirname(appPath)));
                }
            } catch (error) {}
            if (typeof process !== "undefined" && process.cwd) candidates.push(process.cwd());
            return candidates.find(candidate => {
                return candidate
                    && this.fs
                    && this.fs.existsSync(this.path.join(candidate, "assistant", "memory", "bootstrap", "schema.json"));
            }) || candidates[0] || "";
        }

        projectPrivatePath() {
            if (!this.path || !this.projectRoot) return "";
            const candidates = [
                this.path.join(this.projectRoot, "assistant", "memory", "private", "bootstrap"),
                this.path.join(this.path.dirname(this.projectRoot), "assistant", "memory", "private", "bootstrap")
            ];
            return candidates.find(folder => this.exists(folder)) || candidates[0];
        }

        installedPath() {
            if (!this.path || !this.userDataPath) return "";
            return this.path.join(this.userDataPath, "assistant", "memory", "bootstrap");
        }

        exists(target) {
            try {
                return Boolean(this.fs && target && this.fs.existsSync(target));
            } catch (error) {
                return false;
            }
        }

        ensureDir(folder) {
            if (!this.fs || !folder) return;
            this.fs.mkdirSync(folder, {recursive: true});
        }

        memoryFiles(folder) {
            if (!this.exists(folder)) return [];
            try {
                return this.fs.readdirSync(folder)
                    .filter(file => /\.(md|json)$/i.test(file))
                    .filter(file => !file.startsWith("."))
                    .sort();
            } catch (error) {
                return [];
            }
        }

        readSummary(folder) {
            const files = this.memoryFiles(folder);
            let characters = 0;
            const titles = [];

            files.forEach(file => {
                const filePath = this.path.join(folder, file);
                try {
                    const text = this.fs.readFileSync(filePath, "utf8");
                    characters += text.length;
                    const title = text.split(/\r?\n/).find(line => /^#\s+/.test(line));
                    titles.push({
                        file,
                        title: title ? title.replace(/^#\s+/, "").trim().slice(0, 90) : file
                    });
                } catch (error) {
                    titles.push({file, title: file});
                }
            });

            return {files, characters, titles};
        }

        readContext(maxChars = 18000) {
            if (!this.fs || !this.path) {
                return {status: "ERROR", text: "", files: 0, characters: 0, error: "Filesystem access unavailable"};
            }

            const status = this.status();
            if (!status || !status.path || !status.files) {
                return {
                    status: status && status.status ? status.status : "NOT_CONFIGURED",
                    text: "",
                    files: 0,
                    characters: 0
                };
            }

            const limit = Math.max(1000, Math.min(Number(maxChars || 18000), 30000));
            const files = this.memoryFiles(status.path);
            const chunks = [];
            let characters = 0;

            for (const file of files) {
                if (characters >= limit) break;
                try {
                    const filePath = this.path.join(status.path, file);
                    let text = this.fs.readFileSync(filePath, "utf8").trim();
                    const remaining = limit - characters;
                    if (text.length > remaining) text = `${text.slice(0, Math.max(0, remaining - 24)).trim()}\n[TRUNCATED]`;
                    const chunk = `\n--- ${file} ---\n${text}`;
                    chunks.push(chunk);
                    characters += chunk.length;
                } catch (error) {}
            }

            return {
                status: status.status,
                source: status.source,
                path: status.path,
                text: chunks.join("\n").trim(),
                files: files.length,
                characters,
                truncated: characters >= limit
            };
        }

        status() {
            if (!this.fs || !this.path) {
                return {
                    status: "ERROR",
                    source: "None",
                    files: 0,
                    characters: 0,
                    titles: [],
                    installed: false,
                    projectPrivateFound: false,
                    error: "Filesystem access unavailable"
                };
            }

            try {
                const installed = this.installedPath();
                const project = this.projectPrivatePath();
                const installedSummary = this.readSummary(installed);
                if (installedSummary.files.length) {
                    return {
                        status: "READY",
                        source: "UserData",
                        path: installed,
                        installed: true,
                        projectPrivateFound: this.exists(project),
                        files: installedSummary.files.length,
                        characters: installedSummary.characters,
                        titles: installedSummary.titles,
                        index: "NOT_INDEXED",
                        embeddings: "NOT_CONNECTED",
                        retrieval: "NOT_CONNECTED"
                    };
                }

                const projectSummary = this.readSummary(project);
                if (projectSummary.files.length) {
                    return {
                        status: "PRIVATE_BOOTSTRAP_FOUND",
                        source: "Project Private",
                        path: project,
                        installed: false,
                        projectPrivateFound: true,
                        files: projectSummary.files.length,
                        characters: projectSummary.characters,
                        titles: projectSummary.titles,
                        index: "NOT_INDEXED",
                        embeddings: "NOT_CONNECTED",
                        retrieval: "NOT_CONNECTED"
                    };
                }

                return {
                    status: "NOT_CONFIGURED",
                    source: "None",
                    path: installed,
                    installed: false,
                    projectPrivateFound: false,
                    files: 0,
                    characters: 0,
                    titles: [],
                    index: "NOT_INDEXED",
                    embeddings: "NOT_CONNECTED",
                    retrieval: "NOT_CONNECTED"
                };
            } catch (error) {
                return {
                    status: "ERROR",
                    source: "None",
                    files: 0,
                    characters: 0,
                    titles: [],
                    installed: false,
                    projectPrivateFound: false,
                    error: error.message || "Memory status failed"
                };
            }
        }

        install() {
            const source = this.projectPrivatePath();
            const destination = this.installedPath();
            if (!this.exists(source)) {
                return {ok: false, status: "NOT_CONFIGURED", error: "Private bootstrap source not found."};
            }
            const files = this.memoryFiles(source);
            if (!files.length) {
                return {ok: false, status: "NOT_CONFIGURED", error: "Private bootstrap source has no memory files."};
            }

            let backupPath = "";
            this.ensureDir(this.path.dirname(destination));
            if (this.exists(destination) && this.memoryFiles(destination).length) {
                backupPath = `${destination}.backup-${timestamp()}`;
                this.fs.renameSync(destination, backupPath);
            }
            this.ensureDir(destination);
            files.forEach(file => {
                this.fs.copyFileSync(this.path.join(source, file), this.path.join(destination, file));
            });
            return {
                ok: true,
                status: "INSTALLED",
                source,
                destination,
                backupPath,
                filesCopied: files.length
            };
        }

        openFolder() {
            const folder = this.installedPath();
            this.ensureDir(folder);
            if (this.shell && this.shell.openPath) return this.shell.openPath(folder);
            return Promise.resolve(folder);
        }

        expectedFiles() {
            return MEMORY_FILES.slice();
        }
    }

    return {AssistantMemoryBootstrap, MEMORY_FILES};
});

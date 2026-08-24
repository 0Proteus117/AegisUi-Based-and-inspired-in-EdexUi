(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.AssistantChatSession = exported.AssistantChatSession;
})(typeof window !== "undefined" ? window : null, function() {
    const PROFILE_IDS = Object.freeze(["gustav", "angie", "ares", "aphrodite"]);

    function optionalRequire(name) {
        try {
            if (typeof require === "function") return require(name);
        } catch (error) {}
        return null;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function safeName(id = "gustav") {
        const value = String(id || "gustav").toLowerCase();
        return PROFILE_IDS.includes(value) ? value : "gustav";
    }

    class AssistantChatSession {
        constructor(options = {}) {
            this.fs = options.fs || optionalRequire("fs");
            this.path = options.path || optionalRequire("path");
            this.os = options.os || optionalRequire("os");
            this.app = options.app || this.resolveElectronApp();
            this.userDataPath = options.userDataPath || this.resolveUserDataPath();
            this.maxMessages = Number(options.maxMessages || 160);
            this.maxContextMessages = Number(options.maxContextMessages || 18);
            this.ensureFolders();
        }

        resolveElectronApp() {
            return null;
        }

        resolveUserDataPath() {
            if (this.app && this.app.getPath) return this.app.getPath("userData");
            if (!this.path || !this.os) return "";
            return this.path.join(this.os.homedir(), "Library", "Application Support", "EdexUi-Eng");
        }

        rootDir() {
            return this.path ? this.path.join(this.userDataPath, "assistant", "chat") : "";
        }

        profilesDir() {
            return this.path ? this.path.join(this.rootDir(), "profiles") : "";
        }

        exportsDir() {
            return this.path ? this.path.join(this.rootDir(), "exports") : "";
        }

        backupsDir() {
            return this.path ? this.path.join(this.rootDir(), "backups") : "";
        }

        profileFile(profileId = "gustav") {
            return this.path ? this.path.join(this.profilesDir(), `${safeName(profileId)}.json`) : "";
        }

        currentSessionFile() {
            return this.path ? this.path.join(this.rootDir(), "current-session.json") : "";
        }

        ensureFolders() {
            if (!this.fs || !this.path) return false;
            [this.rootDir(), this.profilesDir(), this.exportsDir(), this.backupsDir()].forEach(folder => {
                try { this.fs.mkdirSync(folder, {recursive: true}); } catch (error) {}
            });
            PROFILE_IDS.forEach(profile => {
                const file = this.profileFile(profile);
                if (!this.fs.existsSync(file)) this.writeJson(file, this.emptyProfile(profile));
            });
            const current = this.currentSessionFile();
            if (!this.fs.existsSync(current)) this.writeJson(current, {version: 1, activeProfile: "gustav", updatedAt: new Date().toISOString()});
            return true;
        }

        emptyProfile(profileId = "gustav") {
            return {
                version: 1,
                profile: safeName(profileId),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                summary: "",
                messages: []
            };
        }

        readJson(file, fallback = null) {
            try {
                if (!this.fs || !file || !this.fs.existsSync(file)) return fallback;
                return JSON.parse(this.fs.readFileSync(file, "utf8"));
            } catch (error) {
                return fallback;
            }
        }

        writeJson(file, value) {
            if (!this.fs || !file) return false;
            this.fs.mkdirSync(this.path.dirname(file), {recursive: true});
            this.fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
            return true;
        }

        normalizeProfile(data = {}, profileId = "gustav") {
            const clean = data && typeof data === "object" ? data : {};
            const messages = Array.isArray(clean.messages) ? clean.messages : [];
            return {
                version: 1,
                profile: safeName(clean.profile || profileId),
                createdAt: clean.createdAt || new Date().toISOString(),
                updatedAt: clean.updatedAt || new Date().toISOString(),
                summary: String(clean.summary || "").slice(0, 12000),
                messages: messages
                    .filter(item => item && ["user", "assistant", "system"].includes(String(item.role || "")))
                    .map(item => ({
                        role: String(item.role),
                        text: String(item.text || item.content || "").slice(0, 12000),
                        time: item.time || item.createdAt || new Date().toISOString()
                    }))
                    .filter(item => item.text)
                    .slice(-this.maxMessages)
            };
        }

        loadProfile(profileId = "gustav") {
            this.ensureFolders();
            return this.normalizeProfile(this.readJson(this.profileFile(profileId), null), profileId);
        }

        saveProfile(profileId = "gustav", data = {}) {
            const profile = this.normalizeProfile(data, profileId);
            profile.updatedAt = new Date().toISOString();
            profile.messages = profile.messages.slice(-this.maxMessages);
            this.writeJson(this.profileFile(profileId), profile);
            this.writeJson(this.currentSessionFile(), {
                version: 1,
                activeProfile: profile.profile,
                updatedAt: profile.updatedAt
            });
            return profile;
        }

        addMessage(profileId = "gustav", role = "user", text = "") {
            const value = String(text || "").trim();
            if (!value) return this.loadProfile(profileId);
            const profile = this.loadProfile(profileId);
            profile.messages.push({
                role: String(role || "user"),
                text: value,
                time: new Date().toISOString()
            });
            return this.saveProfile(profileId, profile);
        }

        recentMessages(profileId = "gustav", limit = this.maxContextMessages) {
            const profile = this.loadProfile(profileId);
            return profile.messages.slice(-Number(limit || this.maxContextMessages));
        }

        context(profileId = "gustav", options = {}) {
            const profile = this.loadProfile(profileId);
            const limit = Number(options.limit || this.maxContextMessages);
            return {
                profile: profile.profile,
                summary: profile.summary || "",
                messages: profile.messages.slice(-limit)
            };
        }

        clear(profileId = "gustav") {
            const clean = this.emptyProfile(profileId);
            this.saveProfile(profileId, clean);
            return clean;
        }

        clearAll() {
            PROFILE_IDS.forEach(profile => this.clear(profile));
            return true;
        }

        updateSummary(profileId = "gustav", summary = "") {
            const profile = this.loadProfile(profileId);
            profile.summary = String(summary || "").slice(0, 12000);
            return this.saveProfile(profileId, profile);
        }

        exportMarkdown(profileId = "gustav") {
            this.ensureFolders();
            const profile = this.loadProfile(profileId);
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const file = this.path.join(this.exportsDir(), `${profile.profile}-${stamp}.md`);
            const lines = [
                `# AegisUi Assistant Conversation — ${profile.profile}`,
                "",
                `Exported: ${new Date().toISOString()}`,
                "",
                profile.summary ? `## Summary\n\n${profile.summary}\n` : "",
                "## Messages",
                ""
            ];
            profile.messages.forEach(item => {
                lines.push(`### ${item.role.toUpperCase()} · ${item.time}`);
                lines.push("");
                lines.push(item.text);
                lines.push("");
            });
            this.fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
            return {ok: true, file};
        }

        status(profileId = "gustav") {
            this.ensureFolders();
            const profile = this.loadProfile(profileId);
            return {
                status: "READY",
                source: "UserData",
                path: this.rootDir(),
                profile: profile.profile,
                messages: profile.messages.length,
                summary: Boolean(profile.summary),
                files: PROFILE_IDS.length,
                restore: profile.messages.length > 0 ? "SESSION_RESTORED" : "EMPTY",
                exports: this.exportsDir()
            };
        }

        openFolder() {
            const folder = this.rootDir();
            try {
                const shell = optionalRequire("electron") && optionalRequire("electron").shell;
                if (shell && shell.openPath) return shell.openPath(folder);
            } catch (error) {}
            try {
                const childProcess = optionalRequire("child_process");
                if (childProcess) childProcess.spawn("open", [folder], {detached: true, stdio: "ignore"}).unref();
            } catch (error) {}
            return Promise.resolve(folder);
        }
    }

    return {AssistantChatSession, ASSISTANT_CHAT_PROFILES: PROFILE_IDS};
});

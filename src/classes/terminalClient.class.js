"use strict";

class TerminalClient {
    constructor(opts = {}) {
        if (!opts.parentId) throw new Error("Missing terminal parent.");
        if (!window.Terminal || !window.FitAddon || !window.AttachAddon) throw new Error("Terminal browser libraries are unavailable.");
        this.port = Number(opts.port || 3000);
        this.cwd = "";
        this.oncwdchange = () => {};
        this.term = new window.Terminal({
            cols: 80,
            rows: 24,
            cursorBlink: window.theme.terminal.cursorBlink !== false,
            cursorStyle: window.theme.terminal.cursorStyle || "block",
            allowTransparency: Boolean(window.theme.terminal.allowTransparency),
            fontFamily: window.theme.terminal.fontFamily || "Fira Mono",
            fontSize: window.theme.terminal.fontSize || window.settings.termFontSize || 15,
            fontWeight: window.theme.terminal.fontWeight || "normal",
            fontWeightBold: window.theme.terminal.fontWeightBold || "bold",
            letterSpacing: window.theme.terminal.letterSpacing || 0,
            lineHeight: window.theme.terminal.lineHeight || 1,
            scrollback: 1500,
            bellStyle: "none",
            theme: {
                foreground: window.theme.terminal.foreground,
                background: window.theme.terminal.background,
                cursor: window.theme.terminal.cursor,
                cursorAccent: window.theme.terminal.cursorAccent,
                selection: window.theme.terminal.selection,
                black: window.theme.colors.black || "#2e3436",
                red: window.theme.colors.red || "#cc0000",
                green: window.theme.colors.green || "#4e9a06",
                yellow: window.theme.colors.yellow || "#c4a000",
                blue: window.theme.colors.blue || "#3465a4",
                magenta: window.theme.colors.magenta || "#75507b",
                cyan: window.theme.colors.cyan || "#06989a",
                white: window.theme.colors.white || "#d3d7cf",
                brightBlack: window.theme.colors.brightBlack || "#555753",
                brightRed: window.theme.colors.brightRed || "#ef2929",
                brightGreen: window.theme.colors.brightGreen || "#8ae234",
                brightYellow: window.theme.colors.brightYellow || "#fce94f",
                brightBlue: window.theme.colors.brightBlue || "#729fcf",
                brightMagenta: window.theme.colors.brightMagenta || "#ad7fa8",
                brightCyan: window.theme.colors.brightCyan || "#34e2e2",
                brightWhite: window.theme.colors.brightWhite || "#eeeeec"
            }
        });
        this.fitAddon = new window.FitAddon.FitAddon();
        this.term.loadAddon(this.fitAddon);
        this.term.open(document.getElementById(opts.parentId));
        if (window.WebglAddon && window.WebglAddon.WebglAddon) {
            try { this.term.loadAddon(new window.WebglAddon.WebglAddon()); } catch (error) {}
        }
        this.term.attachCustomKeyEventHandler(event => {
            if (window.keyboard) window.keyboard.keydownHandler(event);
            return true;
        });
        document.querySelectorAll(".xterm-helper-textarea").forEach(textarea => textarea.setAttribute("readonly", "readonly"));
        this.term.focus();

        window.aegis.terminal.send(this.port, "Renderer startup");
        this.authToken = window.aegis.terminal.auth(this.port);
        if (typeof this.authToken !== "string" || this.authToken.length < 32) throw new Error("Terminal authentication failed.");
        this.disposeTerminalEvents = window.aegis.terminal.onMessage(this.port, (...args) => {
            if (args[0] === "New cwd") { this.cwd = args[1]; this.oncwdchange(this.cwd); }
            else if (args[0] === "Fallback cwd") { this.cwd = `FALLBACK |-- ${args[1]}`; this.oncwdchange(this.cwd); }
            else if (args[0] === "New process" && this.onprocesschange) this.onprocesschange(args[1]);
        });

        this.socket = new WebSocket(`ws://127.0.0.1:${this.port}/?token=${encodeURIComponent(this.authToken)}`);
        this.socket.onopen = () => {
            this.term.loadAddon(new window.AttachAddon.AttachAddon(this.socket));
            this.fit();
        };
        this.socket.onerror = () => { if (this.onerror) this.onerror(new Error("Terminal loopback connection failed.")); };
        this.socket.onclose = event => { if (this.onclose) this.onclose(event); };
        this.lastSoundFX = Date.now();
        this.lastRefit = 0;
        this.socket.addEventListener("message", event => {
            const now = Date.now();
            if (now - this.lastSoundFX > 30 && window.passwordMode === "false") window.audioManager.stdout.play();
            this.lastSoundFX = now;
            if (now - this.lastRefit > 10000) this.fit();
            if (!window.settings.experimentalGlobeFeatures || typeof event.data !== "string") return;
            const ips = event.data.match(/((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g);
            [...new Set(ips || [])].forEach(ip => window.mods.globe && window.mods.globe.addTemporaryConnectedMarker(ip));
        });
        const parent = document.getElementById(opts.parentId);
        parent.addEventListener("wheel", event => this.term.scrollLines(Math.round(event.deltaY / 10)));
        document.querySelector(".xterm-helper-textarea")?.addEventListener("keydown", event => {
            if (event.key === "F11" && window.settings.allowWindowed) { event.preventDefault(); window.toggleFullScreen(); }
        });
        this.clipboard = {
            copy: () => {
                if (!this.term.hasSelection()) return false;
                window.aegis.clipboard.writeText(this.term.getSelection());
                this.term.clearSelection();
                this.clipboard.didCopy = true;
                return true;
            },
            paste: () => { this.write(window.aegis.clipboard.readText()); this.clipboard.didCopy = false; },
            didCopy: false
        };
    }

    fit() {
        this.lastRefit = Date.now();
        const proposed = this.fitAddon.proposeDimensions();
        if (!proposed) return;
        const cols = Math.max(2, proposed.cols);
        const rows = Math.max(1, proposed.rows);
        if (this.term.cols !== cols || this.term.rows !== rows) this.resize(cols, rows);
    }

    resize(cols, rows) {
        this.term.resize(cols, rows);
        window.aegis.terminal.send(this.port, "Resize", String(cols).padStart(3, "0"), String(rows).padStart(3, "0"));
    }

    resendCWD() { this.oncwdchange(this.cwd || null); }
    write(command) { if (this.socket.readyState === WebSocket.OPEN) this.socket.send(String(command)); }
    writelr(command) { this.write(`${command}\r`); }
    close() {
        try { window.aegis.terminal.send(this.port, "Close"); } catch (error) {}
        if (this.disposeTerminalEvents) this.disposeTerminalEvents();
        if (this.socket) this.socket.close();
        if (this.term) this.term.dispose();
    }
}

window.TerminalClient = TerminalClient;

(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.AssistantCommandRouter = exported.AssistantCommandRouter;
})(typeof window !== "undefined" ? window : null, function() {
    const STATES = Object.freeze({
        READY: "SAFE_READY",
        EXECUTING: "EXECUTING",
        BLOCKED: "BLOCKED",
        ERROR: "ERROR"
    });

    const SAFE_ACTIONS = Object.freeze([
        "open_assistant_panel",
        "close_assistant_panel",
        "open_expanded_chat",
        "close_expanded_chat",
        "switch_to_gustav",
        "switch_to_angie",
        "switch_to_ares",
        "switch_to_aphrodite",
        "open_workspace_hub",
        "open_workspace_engineer",
        "open_workspace_osint",
        "open_workspace_student",
        "open_workspace_artist",
        "open_workspace_business",
        "open_workspace_comms",
        "open_workspace_launch_bay",
        "open_workspace_developer",
        "open_workspace_agent_command",
        "open_project_control",
        "open_calendar",
        "open_apple_music",
        "refresh_apple_music",
        "music_play_pause",
        "refresh_map",
        "map_toggle_traffic",
        "map_toggle_radar",
        "map_toggle_sea",
        "map_toggle_marine",
        "map_toggle_sat",
        "map_my_location",
        "clear_current_conversation",
        "show_memory_status",
        "show_local_ai_status"
    ]);

    const BLOCKED_PATTERNS = [
        /rm\s+-rf/i,
        /borrar|elimina|delete|wipe|format/i,
        /git\s+(push|reset|checkout|commit|merge|rebase)/i,
        /terminal|shell|bash|zsh|script|comando arbitrario/i,
        /contraseña|password|token|clave|secret/i,
        /pago|payment|transferencia/i,
        /envía|send message|email|correo|whatsapp/i
    ];

    function normalize(text = "") {
        return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    class AssistantCommandRouter {
        constructor(options = {}) {
            this.context = options.context || (() => (typeof window !== "undefined" ? window : null));
            this.status = STATES.READY;
            this.lastAction = null;
            this.lastError = "";
        }

        getStatus() {
            return {
                status: this.status,
                mode: "LOCAL / SAFE / CONTROLLED",
                authority: "LEVEL_2_SAFE",
                actions: SAFE_ACTIONS.length,
                lastAction: this.lastAction,
                lastError: this.lastError
            };
        }

        listActions() {
            return Array.from(SAFE_ACTIONS);
        }

        inferAction(text = "") {
            const value = normalize(text);
            if (!value) return null;
            if (BLOCKED_PATTERNS.some(pattern => pattern.test(value))) {
                return {action: "blocked", reason: "unsafe_intent"};
            }

            const checks = [
                [/chat (grande|ampliado)|abre.*chat|expand.*chat|maximiza.*chat/, "open_expanded_chat"],
                [/cierra.*chat|close.*chat/, "close_expanded_chat"],
                [/abre.*asistente|open.*assistant/, "open_assistant_panel"],
                [/cierra.*asistente|close.*assistant/, "close_assistant_panel"],
                [/cambia.*angie|pon.*angie|switch.*angie/, "switch_to_angie"],
                [/cambia.*gustav|pon.*gustav|switch.*gustav/, "switch_to_gustav"],
                [/cambia.*ares|switch.*ares/, "switch_to_ares"],
                [/cambia.*aphrodite|afrodita|switch.*aphrodite/, "switch_to_aphrodite"],
                [/abre.*hub|workspace.*hub/, "open_workspace_hub"],
                [/abre.*engineer|ingenier|workspace.*engineer/, "open_workspace_engineer"],
                [/abre.*osint|analyst|analista/, "open_workspace_osint"],
                [/abre.*student|estudiante/, "open_workspace_student"],
                [/abre.*artist|artista/, "open_workspace_artist"],
                [/abre.*business|negocio/, "open_workspace_business"],
                [/abre.*comms|comunicaciones/, "open_workspace_comms"],
                [/launch bay|gaming|juegos/, "open_workspace_launch_bay"],
                [/developer|desarrollador|programador/, "open_workspace_developer"],
                [/agent command|agentes/, "open_workspace_agent_command"],
                [/project control|control.*proyecto/, "open_project_control"],
                [/calendario|calendar/, "open_calendar"],
                [/apple music|musica|música|abre.*music/, "open_apple_music"],
                [/refresca.*music|actualiza.*music/, "refresh_apple_music"],
                [/pausa.*musica|pausa.*música|play.?pause|reanuda.*musica/, "music_play_pause"],
                [/refresca.*mapa|actualiza.*mapa/, "refresh_map"],
                [/traffic|trafico|tráfico/, "map_toggle_traffic"],
                [/radar/, "map_toggle_radar"],
                [/barcos|sea|ais|maritimo|marítimo/, "map_toggle_sea"],
                [/marine|marino|oleaje|mar/, "map_toggle_marine"],
                [/sat|satelite|satélite/, "map_toggle_sat"],
                [/mi ubicacion|mi ubicación|my location/, "map_my_location"],
                [/limpia.*conversacion|clear.*conversation/, "clear_current_conversation"],
                [/estado.*memoria|memory status/, "show_memory_status"],
                [/estado.*local ai|ollama|ia local/, "show_local_ai_status"]
            ];

            const found = checks.find(([pattern]) => pattern.test(value));
            return found ? {action: found[1], reason: "matched"} : null;
        }

        async executeFromText(text = "") {
            const inferred = this.inferAction(text);
            if (!inferred) return {handled: false};
            if (inferred.action === "blocked") {
                this.status = STATES.BLOCKED;
                this.lastAction = "blocked";
                return {
                    handled: true,
                    ok: false,
                    status: "BLOCKED",
                    response: "Command blocked: action not allowed in current authority level."
                };
            }
            return this.execute(inferred.action);
        }

        async execute(action = "") {
            const id = String(action || "");
            if (!SAFE_ACTIONS.includes(id)) {
                this.status = STATES.BLOCKED;
                this.lastAction = id;
                return {
                    handled: true,
                    ok: false,
                    status: "BLOCKED",
                    action: id,
                    response: "Command blocked: action not allowed in current authority level."
                };
            }

            this.status = STATES.EXECUTING;
            this.lastAction = id;
            this.lastError = "";

            try {
                const win = this.context();
                const presence = win && win.assistantPresence;
                const dashboard = win && win.engineeringDashboard;
                const workspace = win && win.workspaceManager;
                const mapPanel = dashboard && dashboard.mapPanel;
                const musicPanel = dashboard && dashboard.musicPanel;

                const setProfile = (mode, activeAssistant) => {
                    if (!presence || !presence.settings) return false;
                    presence.settings.patch({mode, activeAssistant});
                    presence.refreshLabels();
                    return true;
                };

                const workspaceMap = {
                    open_workspace_hub: "HUB",
                    open_workspace_engineer: "ENGINEER",
                    open_workspace_osint: "OSINT",
                    open_workspace_student: "STUDENT",
                    open_workspace_artist: "ARTIST",
                    open_workspace_business: "BUSINESS",
                    open_workspace_comms: "COMMS",
                    open_workspace_launch_bay: "LAUNCH_BAY",
                    open_workspace_developer: "DEVELOPER",
                    open_workspace_agent_command: "AGENT_COMMAND"
                };

                if (id === "open_assistant_panel" && presence) presence.panel.setOpen(true);
                if (id === "close_assistant_panel" && presence) presence.panel.close();
                if (id === "open_expanded_chat" && presence && presence.panel.openExpandedChat) presence.panel.openExpandedChat();
                if (id === "close_expanded_chat" && presence && presence.panel.closeExpandedChat) presence.panel.closeExpandedChat();
                if (id === "switch_to_gustav") setProfile("private", "ares");
                if (id === "switch_to_angie") setProfile("private", "aphrodite");
                if (id === "switch_to_ares") setProfile("public", "ares");
                if (id === "switch_to_aphrodite") setProfile("public", "aphrodite");
                if (workspaceMap[id] && workspace && workspace.setActiveWorkspace) workspace.setActiveWorkspace(workspaceMap[id]);
                if (id === "open_project_control" && dashboard && dashboard.projectsPanel && dashboard.projectsPanel.openControl) dashboard.projectsPanel.openControl();
                if (id === "open_calendar" && workspace && workspace.setActiveWorkspace) workspace.setActiveWorkspace("HUB");
                if (id === "open_apple_music" && musicPanel && musicPanel.connect) await musicPanel.connect();
                if (id === "refresh_apple_music" && musicPanel && musicPanel.updateStatus) await musicPanel.updateStatus();
                if (id === "music_play_pause" && musicPanel && musicPanel.ipc) await musicPanel.ipc.invoke("music-playpause");
                if (id === "refresh_map" && mapPanel && mapPanel.layerRegistry) {
                    await Promise.allSettled(["ROAD_TRAFFIC", "WEATHER_RADAR", "MARINE_WEATHER", "MARITIME_AIS", "SATELLITES"]
                        .map(layerId => mapPanel.layerRegistry.refresh(layerId)));
                }
                if (id === "map_toggle_traffic" && mapPanel) mapPanel.toggleLayer("ROAD_TRAFFIC");
                if (id === "map_toggle_radar" && mapPanel) mapPanel.toggleLayer("WEATHER_RADAR");
                if (id === "map_toggle_sea" && mapPanel) mapPanel.toggleLayer("MARITIME_AIS");
                if (id === "map_toggle_marine" && mapPanel) mapPanel.toggleLayer("MARINE_WEATHER");
                if (id === "map_toggle_sat" && mapPanel) mapPanel.toggleLayer("SATELLITES");
                if (id === "map_my_location" && mapPanel && mapPanel.returnToMyLocation) mapPanel.returnToMyLocation();
                if (id === "clear_current_conversation" && presence && presence.panel) presence.panel.clear();
                if (id === "show_memory_status" && presence && presence.panel) {
                    presence.panel.setOpen(true);
                    presence.panel.refreshMemory();
                }
                if (id === "show_local_ai_status" && presence && presence.panel) {
                    presence.panel.setOpen(true);
                    await presence.panel.checkLocalAI({force: true});
                }

                this.status = STATES.READY;
                return {
                    handled: true,
                    ok: true,
                    status: "EXECUTED",
                    action: id,
                    response: `Action executed: ${id}`
                };
            } catch (error) {
                this.status = STATES.ERROR;
                this.lastError = error.message || String(error);
                return {
                    handled: true,
                    ok: false,
                    status: "ERROR",
                    action: id,
                    response: `Command error: ${this.lastError}`,
                    error: this.lastError
                };
            }
        }
    }

    return {AssistantCommandRouter, ASSISTANT_SAFE_ACTIONS: SAFE_ACTIONS};
});

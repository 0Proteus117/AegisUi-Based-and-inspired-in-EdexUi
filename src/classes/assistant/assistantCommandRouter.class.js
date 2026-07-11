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
        "open_workspace_eng",
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
        "show_local_ai_status",
        "open_eng_category_cad",
        "open_eng_category_simulation",
        "open_eng_category_manufacturing",
        "open_eng_category_calculators",
        "open_eng_category_materials",
        "open_eng_category_research",
        "open_eng_category_standards",
        "open_eng_category_projects",
        "open_eng_tool_fusion",
        "open_eng_tool_freecad",
        "open_eng_tool_blender",
        "open_eng_tool_bambu_studio",
        "open_eng_tool_aegis_gearlab",
        "open_eng_calculator_unit_converter",
        "open_eng_calculator_torque_power_rpm",
        "open_eng_calculator_mass_estimator",
        "open_eng_calculator_gear_ratio",
        "open_eng_calculator_beam_deflection",
        "open_eng_calculator_thread_reference"
    ]);

    const BLOCKED_PATTERNS = [
        /\brm\s+-rf\b/i,
        /\b(sudo|chmod|chown|curl|wget|osascript|python|node|npm|pnpm|yarn)\b.*\b(ejecuta|run|exec|shell|terminal|bash|zsh|script)\b/i,
        /\b(ejecuta|run|exec|abre|open|usa|launch)\b.*\b(terminal|shell|bash|zsh|comando arbitrario)\b/i,
        /\b(borra|borrar|elimina|delete|wipe|format|formatea|destruye)\b.*\b(archivo|archivos|file|files|carpeta|carpetas|folder|folders|todo|sistema|disk|disco|historial|datos)\b/i,
        /\bgit\s+(push|reset|checkout|commit|merge|rebase|clean)\b/i,
        /\b(contraseña|password|token|clave|secret|secreto|credencial)\b/i,
        /\b(pago|payment|transferencia|bank|banco)\b/i,
        /\b(envia|enviar|manda|mandar|send)\b.*\b(email|correo|whatsapp|mensaje|historial|datos)\b/i
    ];

    const SAFE_COMMAND_PATTERNS = Object.freeze([
        [/^(abre|abrir|open|muestra|mostrar|show|expand|expande|maximiza|maximizar).*(chat (grande|ampliado)|chat|asistente)/, "open_expanded_chat"],
        [/^(cierra|cerrar|close).*(chat|asistente)/, "close_expanded_chat"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(panel.*asistente|asistente)/, "open_assistant_panel"],
        [/^(cambia|cambiar|pon|poner|switch).*(angie)\b/, "switch_to_angie"],
        [/^(cambia|cambiar|pon|poner|switch).*(gustav)\b/, "switch_to_gustav"],
        [/^(cambia|cambiar|pon|poner|switch).*(ares)\b/, "switch_to_ares"],
        [/^(cambia|cambiar|pon|poner|switch).*(aphrodite|afrodita)\b/, "switch_to_aphrodite"],
        [/^(abre|abrir|open|muestra|mostrar|show|ve a|ir a).*\bhub\b/, "open_workspace_hub"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(aegis gearlab|gearlab|generador de engranajes|gear generator)/, "open_eng_tool_aegis_gearlab"],
        [/^(abre|abrir|open|muestra|mostrar|show|ve a|ir a).*(eng|engineer|engineering|ingenier|ingenieria|ingeniería)/, "open_workspace_eng"],
        [/^(abre|abrir|open|muestra|mostrar|show|ve a|ir a).*(osint|analyst|analista)/, "open_workspace_osint"],
        [/^(abre|abrir|open|muestra|mostrar|show|ve a|ir a).*(student|estudiante)/, "open_workspace_student"],
        [/^(abre|abrir|open|muestra|mostrar|show|ve a|ir a).*(artist|artista)/, "open_workspace_artist"],
        [/^(abre|abrir|open|muestra|mostrar|show|ve a|ir a).*(business|negocio)/, "open_workspace_business"],
        [/^(abre|abrir|open|muestra|mostrar|show|ve a|ir a).*(comms|comunicaciones)/, "open_workspace_comms"],
        [/^(abre|abrir|open|muestra|mostrar|show|ve a|ir a).*(launch bay|gaming|juegos)/, "open_workspace_launch_bay"],
        [/^(abre|abrir|open|muestra|mostrar|show|ve a|ir a).*(developer|desarrollador|programador)/, "open_workspace_developer"],
        [/^(abre|abrir|open|muestra|mostrar|show|ve a|ir a).*(agent command|agentes)/, "open_workspace_agent_command"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(project control|control.*proyecto)/, "open_project_control"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(calendario|calendar)/, "open_calendar"],
        [/^(abre|abrir|open|connect|conecta).*(apple music|music|musica|música)/, "open_apple_music"],
        [/^(refresca|refrescar|actualiza|actualizar|refresh).*(apple music|music|musica|música)/, "refresh_apple_music"],
        [/^(pausa|pausar|play|reanuda|reanudar|toggle).*(music|musica|música)/, "music_play_pause"],
        [/^(refresca|refrescar|actualiza|actualizar|refresh).*(mapa|map)/, "refresh_map"],
        [/^(activa|activar|desactiva|desactivar|toggle|muestra|mostrar).*(traffic|trafico|tráfico)/, "map_toggle_traffic"],
        [/^(activa|activar|desactiva|desactivar|toggle|muestra|mostrar).*(radar)/, "map_toggle_radar"],
        [/^(activa|activar|desactiva|desactivar|toggle|muestra|mostrar).*(barcos|sea|ais|maritimo|marítimo)/, "map_toggle_sea"],
        [/^(activa|activar|desactiva|desactivar|toggle|muestra|mostrar).*(marine|marino|oleaje)/, "map_toggle_marine"],
        [/^(activa|activar|desactiva|desactivar|toggle|muestra|mostrar).*(sat|satelite|satélite)/, "map_toggle_sat"],
        [/^(centra|centrar|ve a|ir a|my location|mi ubicacion|mi ubicación).*(ubicacion|ubicación|location)?/, "map_my_location"],
        [/^(limpia|limpiar|clear).*(conversacion|conversación|conversation)/, "clear_current_conversation"],
        [/^(muestra|mostrar|show).*(estado.*memoria|memory status)/, "show_memory_status"],
        [/^(muestra|mostrar|show|comprueba|check).*(estado.*local ai|ollama|ia local)/, "show_local_ai_status"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(cad|cam|diseño|diseno)/, "open_eng_category_cad"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(simulacion|simulación|cae|cfd|ansys|openfoam)/, "open_eng_category_simulation"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(manufacturing|fabricacion|fabricación|impresion 3d|impresión 3d|3d print)/, "open_eng_category_manufacturing"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(calculadoras|calculators|calculator deck|herramientas de calculo|herramientas de cálculo)/, "open_eng_category_calculators"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(materiales|materials)/, "open_eng_category_materials"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(investigacion|investigación|research|documentacion|documentación)/, "open_eng_category_research"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(standards|estandares|estándares|normas|iso|asme)/, "open_eng_category_standards"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(proyectos|projects).*eng/, "open_eng_category_projects"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(fusion|autodesk fusion)/, "open_eng_tool_fusion"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(freecad)/, "open_eng_tool_freecad"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(blender)/, "open_eng_tool_blender"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(bambu studio|bambu)/, "open_eng_tool_bambu_studio"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(conversor|unit converter|unidades)/, "open_eng_calculator_unit_converter"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(torque|par|potencia|rpm)/, "open_eng_calculator_torque_power_rpm"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(masa|mass|densidad|density)/, "open_eng_calculator_mass_estimator"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(gear|engranaje|relacion|relación)/, "open_eng_calculator_gear_ratio"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(beam|viga|deflection|deflexion|deflexión)/, "open_eng_calculator_beam_deflection"],
        [/^(abre|abrir|open|muestra|mostrar|show).*(thread|rosca|drill|tap)/, "open_eng_calculator_thread_reference"]
    ]);

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

        classifyMessage(text = "") {
            const value = normalize(text).trim();
            if (!value) return {type: "CHAT", action: null, reason: "empty"};
            if (BLOCKED_PATTERNS.some(pattern => pattern.test(value))) {
                return {type: "COMMAND_BLOCKED", action: "blocked", reason: "unsafe_intent"};
            }
            const found = SAFE_COMMAND_PATTERNS.find(([pattern]) => pattern.test(value));
            if (found) return {type: "COMMAND_SAFE", action: found[1], reason: "allowlist"};
            return {type: "CHAT", action: null, reason: "no_system_command_intent"};
        }

        isLikelySystemCommand(text = "") {
            return this.classifyMessage(text).type === "COMMAND_SAFE";
        }

        inferAction(text = "") {
            const classified = this.classifyMessage(text);
            if (classified.type === "CHAT") return null;
            if (classified.type === "COMMAND_BLOCKED") return {action: "blocked", reason: classified.reason};
            return {action: classified.action, reason: classified.reason};
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
                    open_workspace_eng: "ENGINEER",
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
                const engineeringCategoryMap = {
                    open_eng_category_cad: "cad",
                    open_eng_category_simulation: "simulation",
                    open_eng_category_manufacturing: "manufacturing",
                    open_eng_category_calculators: "calculators",
                    open_eng_category_materials: "materials",
                    open_eng_category_research: "research",
                    open_eng_category_standards: "standards",
                    open_eng_category_projects: "projects"
                };
                const engineeringToolMap = {
                    open_eng_tool_fusion: "fusion",
                    open_eng_tool_freecad: "freecad",
                    open_eng_tool_blender: "blender",
                    open_eng_tool_bambu_studio: "bambu-studio",
                    open_eng_tool_aegis_gearlab: "aegis-gearlab"
                };
                const engineeringCalculatorMap = {
                    open_eng_calculator_unit_converter: "unit_converter",
                    open_eng_calculator_torque_power_rpm: "torque_power_rpm",
                    open_eng_calculator_mass_estimator: "material_mass",
                    open_eng_calculator_gear_ratio: "gear_ratio",
                    open_eng_calculator_beam_deflection: "beam_deflection",
                    open_eng_calculator_thread_reference: "thread_reference"
                };
                if (engineeringCategoryMap[id] && workspace && workspace.openEngineeringCategory) {
                    workspace.setActiveWorkspace && workspace.setActiveWorkspace("ENGINEER");
                    setTimeout(() => workspace.openEngineeringCategory(engineeringCategoryMap[id]), 80);
                }
                if (engineeringToolMap[id] && workspace && workspace.openEngineeringToolById) {
                    workspace.setActiveWorkspace && workspace.setActiveWorkspace("ENGINEER");
                    setTimeout(() => workspace.openEngineeringToolById(engineeringToolMap[id]), 80);
                }
                if (engineeringCalculatorMap[id] && workspace && workspace.openEngineeringCalculator) {
                    workspace.setActiveWorkspace && workspace.setActiveWorkspace("ENGINEER");
                    setTimeout(() => workspace.openEngineeringCalculator(engineeringCalculatorMap[id]), 80);
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

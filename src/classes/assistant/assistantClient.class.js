"use strict";

(function(root) {
    const PROFILE_IDS = ["gustav", "angie", "ares", "aphrodite"];
    const profile = value => PROFILE_IDS.includes(value) ? value : "gustav";

    class AssistantMemoryBootstrapClient {
        status() { return root.aegis.assistant.memoryStatus(); }
        install() { return root.aegis.assistant.installMemory(); }
        openFolder() { return root.aegis.assistant.open("memory"); }
        readContext() { return {status: "MAIN_PROCESS_ONLY", text: "", files: 0}; }
    }

    class AssistantLocalChatClient {
        loadConfig() { return root.aegis.assistant.config(); }
        saveConfig(value) { return root.aegis.assistant.saveConfig(value); }
        getPersonalityId({assistantId, mode} = {}) {
            const active = String(assistantId || "ares").toLowerCase() === "aphrodite" ? "aphrodite" : "ares";
            return profile(String(mode || "private").toLowerCase() === "private" ? (active === "aphrodite" ? "angie" : "gustav") : active);
        }
        checkLocalAIStatus(options = {}) { return root.aegis.assistant.status(Boolean(options.force)); }
        sendMessage(payload) { return root.aegis.assistant.send(payload); }
        conversationStatus(id) { return root.aegis.assistant.conversationStatus(profile(id)); }
        conversationMessages(id, limit) { return root.aegis.assistant.conversationMessages(profile(id), limit); }
        clearConversation(id) { return root.aegis.assistant.clearConversation(profile(id)); }
        exportConversation(id) { return root.aegis.assistant.exportConversation(profile(id)); }
        openChatFolder() { return root.aegis.assistant.open("chat"); }
    }

    root.AssistantMemoryBootstrap = AssistantMemoryBootstrapClient;
    root.AssistantLocalChat = AssistantLocalChatClient;
})(window);

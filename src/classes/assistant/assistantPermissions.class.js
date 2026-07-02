(function() {
    const ASSISTANT_AUTHORITY_LEVELS = Object.freeze({
        OBSERVE: 0,
        NAVIGATE: 1,
        CONFIGURE: 2,
        LAUNCH: 3,
        DELEGATE: 4,
        CONFIRM_REQUIRED: 5,
        BLOCKED: 6
    });

    class AssistantPermissions {
        constructor() {
            this.levels = ASSISTANT_AUTHORITY_LEVELS;
        }

        describe(level) {
            const value = Number(level);
            if (value === 0) return "OBSERVE · read visible/local state only";
            if (value === 1) return "NAVIGATE · switch workspaces";
            if (value === 2) return "CONFIGURE · reversible local settings";
            if (value === 3) return "LAUNCH · open configured tools";
            if (value === 4) return "DELEGATE · create local agent tasks";
            if (value === 5) return "CONFIRM_REQUIRED · scripts/files/commits/messages";
            return "BLOCKED · destructive, credential, payment or unsafe action";
        }

        requiresConfirmation(level) {
            return Number(level) >= ASSISTANT_AUTHORITY_LEVELS.CONFIRM_REQUIRED;
        }

        isBlocked(level) {
            return Number(level) >= ASSISTANT_AUTHORITY_LEVELS.BLOCKED;
        }
    }

    window.AssistantPermissions = AssistantPermissions;
    window.ASSISTANT_AUTHORITY_LEVELS = ASSISTANT_AUTHORITY_LEVELS;
})();

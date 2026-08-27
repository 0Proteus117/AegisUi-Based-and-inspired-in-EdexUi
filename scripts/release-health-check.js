#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function readJson(relativePath) {
    const file = path.join(ROOT, relativePath);
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runGit(args, options = {}) {
    try {
        return {
            ok: true,
            stdout: execFileSync("git", args, {
                cwd: ROOT,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
                timeout: options.timeout || 8000
            }).trim()
        };
    } catch (error) {
        return {
            ok: false,
            stdout: String(error.stdout || "").trim(),
            stderr: String(error.stderr || error.message || "").trim()
        };
    }
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
}

function print(key, value) {
    console.log(`${key}: ${value}`);
}

function main() {
    const failures = [];
    const pkg = readJson("package.json");
    const srcPkg = readJson("src/package.json");
    const versionsMatch = pkg.version === srcPkg.version;
    const aegisUiBranding = pkg.productName === "AegisUi"
        && srcPkg.productName === "AegisUi"
        && exists("media/aegisui-mark.svg")
        && exists("media/aegisui-icon.icns")
        && exists("scripts/test-aegisui-branding.js");

    const privateTracked = runGit(["ls-files", "assistant/memory/private"], {timeout: 5000});
    const privateTrackedNo = privateTracked.ok && !privateTracked.stdout;

    const privateIgnored = runGit(["check-ignore", "assistant/memory/private/bootstrap/00_index.md"], {timeout: 5000});
    const privateIgnoredYes = privateIgnored.ok && privateIgnored.stdout.includes("assistant/memory/private/");

    const chatTracked = runGit(["ls-files", "assistant/chat"], {timeout: 5000});
    const chatTrackedNo = chatTracked.ok && !chatTracked.stdout;

    const stagedSensitive = runGit(["diff", "--cached", "--name-only", "--", ".env", ".env.local", "assistant/memory/private", "assistant/chat"], {timeout: 5000});
    const secretsStagedNo = stagedSensitive.ok && !stagedSensitive.stdout;

    const assistantLocalAi = exists("src/classes/assistant/assistantLocalChat.class.js")
        && exists("src/classes/assistant/assistantOllamaClient.class.js")
        && exists("src/classes/assistant/assistantAIProvider.class.js")
        && exists("src/classes/assistant/assistantChatSession.class.js")
        && exists("src/classes/assistant/assistantCommandRouter.class.js")
        && exists("scripts/test-assistant-routing-classifier.js")
        && exists("assistant/config/assistant-ai.example.json");

    const appleMusicBridge = exists("scripts/test-apple-music-runtime.js")
        && exists("scripts/test-apple-music-bridge-static.js")
        && exists("scripts/diagnose-macos-automation-identity.js")
        && exists("src/classes/engineeringDashboard.class.js");

    const mapProviders = [
        "src/classes/map/providers/trafficProvider.js",
        "src/classes/map/providers/aisProvider.js",
        "src/classes/map/providers/weatherRadarProvider.js",
        "src/classes/map/providers/marineWeatherProvider.js",
        "src/classes/map/providers/celestrakProvider.js",
        "src/classes/map/providers/openSkyProvider.js",
        "src/classes/map/providers/noaaOceanProvider.js"
    ].every(exists);
    const engWorkspace = exists("src/classes/workspaces/engineeringTools.registry.js")
        && exists("scripts/test-eng-workspace-registry.js")
        && exists("scripts/test-eng-command-router.js")
        && exists("scripts/test-eng-calculators.js");
    const studAcademicCore = exists("src/classes/workspaces/studAcademicModel.class.js")
        && exists("src/classes/workspaces/studAcademicStore.class.js")
        && exists("src/classes/workspaces/studAcademicIpc.class.js")
        && exists("scripts/test-stud-academic-core.js")
        && exists("scripts/test-stud-workspace.js")
        && exists("scripts/test-stud-command-center.js")
        && exists("scripts/test-stud-assignment-workspace.js")
        && exists("scripts/test-stud-assignment-workspace-scale.js")
        && exists("src/classes/workspaces/studAssignmentWorkspace.class.js")
        && exists("src/classes/workspaces/studCommandCenter.class.js")
        && exists("STUD_ARCHITECTURE.md")
        && exists("STUD_PHASE1_VALIDATION.md")
        && exists("STUD_COMMAND_CENTER.md")
        && exists("STUD_PHASE2_VALIDATION.md");
    const studAcademicAi = exists("src/classes/workspaces/studAcademicAssistantRuntime.class.js")
        && exists("src/classes/workspaces/studAcademicAssistantWorkspace.class.js")
        && exists("scripts/test-stud-academic-ai.js")
        && exists("STUD_LOCAL_ACADEMIC_AI.md")
        && exists("STUD_PHASE10_VALIDATION.md");
    const studToolCatalog = exists("src/classes/workspaces/studToolCatalog.registry.js")
        && exists("src/classes/workspaces/studToolCatalog.class.js")
        && exists("src/classes/workspaces/studToolCatalogWorkspace.class.js")
        && exists("scripts/test-stud-tool-catalog.js")
        && exists("STUD_TOOL_CATALOG.md")
        && exists("STUD_PHASE13_VALIDATION.md");
    const studFinalAcceptance = exists("scripts/test-stud-phase14-reproducibility.js")
        && exists("scripts/test-stud-phase14-acceptance.js")
        && exists("STUD_FINAL_ACCEPTANCE.md");
    const studWorkflowDag = exists("src/classes/workspaces/studWorkflowModel.class.js")
        && exists("src/classes/workspaces/studWorkflowRepository.class.js")
        && exists("src/classes/workspaces/studWorkflowService.class.js")
        && exists("src/classes/workspaces/studWorkflowTemplateRegistry.class.js")
        && exists("src/classes/workspaces/studWorkflowWorkspace.class.js")
        && exists("scripts/test-stud-workflow-dag.js")
        && exists("scripts/test-stud-workflow-ipc.js")
        && exists("docs/product/stud/STUD_M3_WORKFLOW_TEMPLATES_PERSISTENT_DAG_VALIDATION.md");
    const studWorkflowConditions = exists("src/classes/workspaces/studWorkflowConditionsModel.class.js")
        && exists("src/classes/workspaces/studWorkflowConditionsRepository.class.js")
        && exists("src/classes/workspaces/studWorkflowConditionsService.class.js")
        && exists("scripts/test-stud-workflow-conditions.js")
        && exists("scripts/test-stud-workflow-conditions-ipc.js")
        && exists("scripts/test-stud-workflow-conditions-scale.js")
        && exists("docs/product/stud/STUD_M4_BLOCKERS_CHECKPOINTS_RECOVERY_VALIDATION.md");
    const studArtifactMissionControl = exists("src/classes/workspaces/studArtifactOperationsModel.class.js")
        && exists("src/classes/workspaces/studArtifactOperationsRepository.class.js")
        && exists("src/classes/workspaces/studArtifactOperationsService.class.js")
        && exists("src/classes/workspaces/studMissionControlWorkspace.class.js")
        && exists("scripts/test-stud-artifact-mission-control.js")
        && exists("scripts/test-stud-artifact-mission-control-ipc.js")
        && exists("scripts/test-stud-mission-control-workspace.js")
        && exists("scripts/test-stud-artifact-mission-control-scale.js")
        && exists("docs/product/stud/STUD_M6_ARTIFACT_BAY_MISSION_CONTROL_VALIDATION.md");
    const studResearchPlan = exists("src/classes/workspaces/studResearchPlanModel.class.js")
        && exists("src/classes/workspaces/studResearchPlanRepository.class.js")
        && exists("src/classes/workspaces/studResearchPlanService.class.js")
        && exists("src/classes/workspaces/studResearchPlanWorkspace.class.js")
        && exists("scripts/test-stud-research-plan-topic-dossiers.js")
        && exists("scripts/test-stud-research-plan-ipc.js")
        && exists("scripts/test-stud-research-plan-ui.js")
        && exists("scripts/test-stud-research-plan-scale.js")
        && exists("docs/product/stud/STUD_M7_RESEARCH_PLAN_TOPIC_DOSSIERS_VALIDATION.md");
    const studClaimEvidence = exists("src/classes/workspaces/studClaimEvidenceModel.class.js")
        && exists("src/classes/workspaces/studClaimEvidenceRepository.class.js")
        && exists("src/classes/workspaces/studClaimEvidenceService.class.js")
        && exists("src/classes/workspaces/studEvidenceMapWorkspace.class.js")
        && exists("scripts/test-stud-claims-evidence-citation.js")
        && exists("scripts/test-stud-claims-evidence-ipc.js")
        && exists("scripts/test-stud-evidence-map-ui.js")
        && exists("scripts/test-stud-claims-evidence-scale.js")
        && exists("docs/product/stud/STUD_M8_CLAIMS_EVIDENCE_CITATION_INTEGRITY_VALIDATION.md");
    const osintFoundation = exists("src/classes/workspaces/osintTools.registry.js")
        && exists("src/classes/workspaces/osintProviderSchema.class.js")
        && exists("src/classes/workspaces/osintProviderPolicy.class.js")
        && exists("src/classes/workspaces/osintCapabilityRegistry.class.js")
        && exists("src/classes/workspaces/osintProviderRuntime.class.js")
        && exists("src/classes/workspaces/osintProviderAdapters.class.js")
        && exists("src/classes/workspaces/osintToolAccessPanel.class.js")
        && exists("src/classes/workspaces/osintAccess.class.js")
        && exists("scripts/test-osint-native-access-foundation.js")
        && exists("scripts/test-osint-provider-registry.js")
        && exists("scripts/test-osint-reference-only-policy.js")
        && exists("scripts/test-osint-tool-access-panel.js")
        && exists("scripts/test-osint-provider-runtime.js")
        && exists("src/classes/workspaces/osintVisualMediaVerification.class.js")
        && exists("scripts/test-osint-visual-media-verification.js")
        && exists("src/classes/workspaces/osintDomainInfrastructure.class.js")
        && exists("scripts/test-osint-domain-infrastructure.js")
        && exists("src/classes/workspaces/osintResearchSourceVerification.class.js")
        && exists("scripts/test-osint-research-source-verification.js");
    const osintCaseWorkspace = exists("src/classes/workspaces/osintCaseModel.class.js")
        && exists("src/classes/workspaces/osintCaseStorage.class.js")
        && exists("src/classes/workspaces/osintCaseServices.class.js")
        && exists("src/classes/workspaces/osintCaseIpc.class.js")
        && exists("scripts/test-osint-cases.js")
        && exists("scripts/test-osint-case-ipc.js")
        && exists("scripts/test-osint-case-ui.js")
        && exists("scripts/test-osint-case-layout.js");
    const osintGeospatialVerification = exists("src/classes/workspaces/osintGeospatialVerification.class.js")
        && exists("scripts/test-osint-geospatial-verification.js")
        && fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"), "utf8").includes("open-meteo-geocoding");
    const osintVisualMediaVerification = exists("src/classes/workspaces/osintVisualMediaVerification.class.js")
        && exists("scripts/test-osint-visual-media-verification.js")
        && fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"), "utf8").includes("local-media-inspection");
    const osintDomainInfrastructure = exists("src/classes/workspaces/osintDomainInfrastructure.class.js")
        && exists("scripts/test-osint-domain-infrastructure.js")
        && fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"), "utf8").includes("google-public-dns")
        && fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"), "utf8").includes("ripestat-network-info");
    const osintResearchSourceVerification = exists("src/classes/workspaces/osintResearchSourceVerification.class.js")
        && exists("scripts/test-osint-research-source-verification.js")
        && fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"), "utf8").includes("crossref-works")
        && fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"), "utf8").includes("local-pdf-inspection");
    const osintEntityResolution = exists("src/classes/workspaces/osintEntityResolution.class.js")
        && exists("scripts/test-osint-entity-resolution.js")
        && fs.readFileSync(path.join(ROOT, "src/classes/workspaces/osintTools.registry.js"), "utf8").includes("local-entity-resolution");
    const osintInvestigationOrchestration = exists("src/classes/workspaces/osintInvestigationOrchestration.class.js")
        && exists("scripts/test-osint-investigation-orchestration.js")
        && fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8").includes("osintInvestigationOrchestration.class.js");
    const osintAnalystDeskMilestone = exists("OSINT_ANALYST_DESK_ARCHITECTURE.md")
        && exists("OSINT_PHASE11_MILESTONE_VALIDATION.md")
        && exists("scripts/test-osint-analyst-desk-milestone.js");
    const themeIntegrity = exists("src/assets/css/aegis_theme.css")
        && exists("scripts/test-aegis-theme-integrity.js")
        && exists("scripts/test-calendar-theme-integrity.js")
        && fs.readFileSync(path.join(ROOT, "src/ui.html"), "utf8").includes("assets/css/aegis_theme.css")
        && fs.readFileSync(path.join(ROOT, "src/_renderer.js"), "utf8").includes("aegisAppearance");

    if (!versionsMatch) failures.push("package versions do not match");
    if (!aegisUiBranding) failures.push("AegisUi visible branding files are missing");
    if (!privateTrackedNo) failures.push("private memory is tracked");
    if (!privateIgnoredYes) failures.push("private memory is not ignored");
    if (!chatTrackedNo) failures.push("assistant chat exports are tracked");
    if (!secretsStagedNo) failures.push("sensitive files are staged");
    if (!assistantLocalAi) failures.push("assistant local AI files missing");
    if (!appleMusicBridge) failures.push("Apple Music bridge validation files missing");
    if (!mapProviders) failures.push("map provider files missing");
    if (!engWorkspace) failures.push("ENG workspace files missing");
    if (!studAcademicCore) failures.push("STUD academic core files missing");
    if (!studAcademicAi) failures.push("STUD local academic AI files missing");
    if (!studToolCatalog) failures.push("STUD tool catalog files missing");
    if (!studFinalAcceptance) failures.push("STUD final acceptance safeguards missing");
    if (!studWorkflowDag) failures.push("STUD workflow DAG foundation missing");
    if (!studWorkflowConditions) failures.push("STUD workflow blockers/checkpoints foundation missing");
    if (!studArtifactMissionControl) failures.push("STUD Artifact Bay / Mission Control foundation missing");
    if (!studResearchPlan) failures.push("STUD Research Plan / Topic Dossiers foundation missing");
    if (!studClaimEvidence) failures.push("STUD Claims / Evidence Map / Citation Integrity foundation missing");
    if (!osintFoundation) failures.push("OSINT native access foundation files missing");
    if (!osintCaseWorkspace) failures.push("OSINT investigation case workspace files missing");
    if (!osintGeospatialVerification) failures.push("OSINT geospatial verification files missing");
    if (!osintVisualMediaVerification) failures.push("OSINT visual media verification files missing");
    if (!osintDomainInfrastructure) failures.push("OSINT domain infrastructure files missing");
    if (!osintResearchSourceVerification) failures.push("OSINT research source verification files missing");
    if (!osintEntityResolution) failures.push("OSINT entity resolution files missing");
    if (!osintInvestigationOrchestration) failures.push("OSINT investigation orchestration files missing");
    if (!osintAnalystDeskMilestone) failures.push("OSINT Analyst Desk milestone safeguards missing");
    if (!themeIntegrity) failures.push("Aegis semantic theme integrity files missing");

    print("PACKAGE_VERSION", pkg.version || "UNKNOWN");
    print("SRC_PACKAGE_VERSION", srcPkg.version || "UNKNOWN");
    print("VERSIONS_MATCH", versionsMatch ? "YES" : "NO");
    print("AEGISUI_BRANDING", aegisUiBranding ? "PRESENT" : "MISSING");
    print("PRIVATE_MEMORY_TRACKED", privateTrackedNo ? "NO" : "YES");
    print("PRIVATE_MEMORY_IGNORED", privateIgnoredYes ? "YES" : "NO");
    print("CHAT_EXPORTS_TRACKED", chatTrackedNo ? "NO" : "YES");
    print("SECRETS_STAGED", secretsStagedNo ? "NO" : "YES");
    print("ASSISTANT_LOCAL_AI", assistantLocalAi ? "PRESENT" : "MISSING");
    print("ASSISTANT_AI_PROVIDER", exists("src/classes/assistant/assistantAIProvider.class.js") ? "PRESENT" : "MISSING");
    print("ASSISTANT_CHAT_SESSION", exists("src/classes/assistant/assistantChatSession.class.js") ? "PRESENT" : "MISSING");
    print("ASSISTANT_COMMAND_ROUTER", exists("src/classes/assistant/assistantCommandRouter.class.js") ? "PRESENT" : "MISSING");
    print("APPLE_MUSIC_BRIDGE", appleMusicBridge ? "PRESENT" : "MISSING");
    print("MAP_PROVIDERS", mapProviders ? "PRESENT" : "MISSING");
    print("ENG_WORKSPACE", engWorkspace ? "PRESENT" : "MISSING");
    print("STUD_ACADEMIC_CORE", studAcademicCore ? "PRESENT" : "MISSING");
    print("STUD_LOCAL_ACADEMIC_AI", studAcademicAi ? "PRESENT" : "MISSING");
    print("STUD_TOOL_CATALOG", studToolCatalog ? "PRESENT" : "MISSING");
    print("STUD_FINAL_ACCEPTANCE", studFinalAcceptance ? "PRESENT" : "MISSING");
    print("STUD_WORKFLOW_DAG", studWorkflowDag ? "PRESENT" : "MISSING");
    print("STUD_WORKFLOW_CONDITIONS", studWorkflowConditions ? "PRESENT" : "MISSING");
    print("STUD_ARTIFACT_MISSION_CONTROL", studArtifactMissionControl ? "PRESENT" : "MISSING");
    print("STUD_RESEARCH_PLAN_TOPIC_DOSSIERS", studResearchPlan ? "PRESENT" : "MISSING");
    print("STUD_CLAIMS_EVIDENCE_CITATION", studClaimEvidence ? "PRESENT" : "MISSING");
    print("OSINT_NATIVE_ACCESS", osintFoundation ? "PRESENT" : "MISSING");
    print("OSINT_PROVIDER_REGISTRY", exists("src/classes/workspaces/osintProviderSchema.class.js") && exists("src/classes/workspaces/osintProviderPolicy.class.js") && exists("src/classes/workspaces/osintToolAccessPanel.class.js") ? "PRESENT" : "MISSING");
    print("OSINT_CASE_WORKSPACE", osintCaseWorkspace ? "PRESENT" : "MISSING");
    print("OSINT_GEOSPATIAL_VERIFICATION", osintGeospatialVerification ? "PRESENT" : "MISSING");
    print("OSINT_VISUAL_MEDIA_VERIFICATION", osintVisualMediaVerification ? "PRESENT" : "MISSING");
    print("OSINT_DOMAIN_INFRASTRUCTURE", osintDomainInfrastructure ? "PRESENT" : "MISSING");
    print("OSINT_RESEARCH_SOURCE_VERIFICATION", osintResearchSourceVerification ? "PRESENT" : "MISSING");
    print("OSINT_ENTITY_RESOLUTION", osintEntityResolution ? "PRESENT" : "MISSING");
    print("OSINT_INVESTIGATION_ORCHESTRATION", osintInvestigationOrchestration ? "PRESENT" : "MISSING");
    print("OSINT_ANALYST_DESK_MILESTONE", osintAnalystDeskMilestone ? "PRESENT" : "MISSING");
    print("AEGIS_THEME_INTEGRITY", themeIntegrity ? "PRESENT" : "MISSING");
    print("CALENDAR_THEME_INTEGRITY", exists("scripts/test-calendar-theme-integrity.js") ? "PRESENT" : "MISSING");
    print("PACKAGED_CALENDAR_HELPER", exists("scripts/test-packaged-calendar-helper.js") ? "PRESENT" : "MISSING");
    print("RELEASE_HEALTH", failures.length ? "FAIL" : "OK");

    if (failures.length) {
        failures.forEach(item => console.error(`- ${item}`));
        process.exit(1);
    }
}

main();

"use strict";

/*
 * STUD Tool Catalog is deliberately application-owned, versioned metadata.
 * It is not a remote configuration feed and it never contains user state.
 */
(function registerStudToolCatalogRegistry(scope) {
    const REGISTRY_VERSION = "1.0.0";
    const VERIFIED_ON = "2026-08-13";
    const TOOL_TYPES = Object.freeze(["AEGIS_NATIVE", "LOCAL_OPTIONAL", "DESKTOP_EXTERNAL", "WEB_TOOL", "ACADEMIC_SERVICE", "LEARNING_RESOURCE", "REFERENCE_RESOURCE", "OPEN_SOURCE_PROJECT", "DISCIPLINE_PACK", "INSTITUTION_SERVICE", "OTHER"]);
    const INTEGRATION_LEVELS = Object.freeze(["NATIVE", "INTEGRATED", "OPTIONAL_LOCAL", "EXTERNAL_LAUNCH", "REFERENCE_ONLY", "LEARNING_ONLY", "NOT_INTEGRATED"]);
    const AVAILABILITY = Object.freeze(["AVAILABLE", "INSTALLED", "NOT_INSTALLED", "CONFIG_REQUIRED", "ACCOUNT_REQUIRED", "ONLINE_REQUIRED", "UNAVAILABLE", "UNKNOWN"]);
    const COST_CLASSES = Object.freeze(["FREE_OPEN_LOCAL", "FREE_OPEN_ONLINE", "FREE_ONLINE", "FREEMIUM_LIMITED", "PAID_ONE_TIME", "PAID_SUBSCRIPTION", "TRIAL_ONLY", "INSTITUTION_LICENSED", "UNKNOWN"]);
    const OFFLINE_CLASSES = Object.freeze(["FULL_OFFLINE", "PARTIAL_OFFLINE", "ONLINE_REQUIRED", "UNKNOWN"]);
    const PRIVACY_CLASSES = Object.freeze(["LOCAL_ONLY", "LOCAL_FIRST", "EXTERNAL_NETWORK", "ACCOUNT_REQUIRED", "CLOUD_PROCESSING", "UNKNOWN"]);
    const OPEN_SOURCE = Object.freeze(["YES", "NO", "UNKNOWN", "LICENSE_REVIEW"]);
    const DISCIPLINES = Object.freeze(["GENERAL", "RESEARCH", "WRITING", "REVISION", "PRODUCTIVITY", "PROGRAMMING", "COMPUTER_SCIENCE", "AI", "DATA", "MATHEMATICS", "ENGINEERING", "CAD", "ELECTRONICS", "PHYSICS", "CHEMISTRY", "BIOLOGY", "MEDICINE", "PSYCHOLOGY", "SOCIAL_SCIENCE", "CRIMINOLOGY", "LAW", "HISTORY", "PHILOLOGY", "LINGUISTICS", "LITERATURE", "LANGUAGES", "ECONOMICS", "BUSINESS", "DESIGN", "ARCHITECTURE", "CYBERSECURITY", "MEDIA", "PRESENTATION", "CAREER", "OTHER"]);
    const COST_ORDER = Object.freeze({FREE_OPEN_LOCAL: 0, FREE_OPEN_ONLINE: 1, FREE_ONLINE: 2, FREEMIUM_LIMITED: 3, INSTITUTION_LICENSED: 4, PAID_ONE_TIME: 5, PAID_SUBSCRIPTION: 6, TRIAL_ONLY: 7, UNKNOWN: 8});
    const ENTRY_FIELDS = Object.freeze(["id", "name", "description", "toolType", "integrationLevel", "availability", "costClass", "offlineClass", "privacyClass", "accountRequirement", "openSource", "license", "websiteUrl", "repositoryUrl", "disciplines", "capabilities", "nativeTarget", "lastVerified", "verificationNote", "alternatives", "launchAllowed", "deprecated", "replacementId"]);

    function safeUrl(value) {
        if (value === null || value === undefined || value === "") return null;
        try {
            const parsed = new URL(String(value));
            if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) return null;
            return parsed.toString();
        } catch (error) { return null; }
    }

    function enumValue(value, values) { return values.includes(value); }
    function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
    function frozen(value) { return Object.freeze(value); }
    function entry(id, name, description, options = {}) {
        return frozen({
            id, name, description,
            toolType: options.toolType || "REFERENCE_RESOURCE",
            integrationLevel: options.integrationLevel || "EXTERNAL_LAUNCH",
            availability: options.availability || "ONLINE_REQUIRED",
            costClass: options.costClass || "UNKNOWN",
            offlineClass: options.offlineClass || "UNKNOWN",
            privacyClass: options.privacyClass || "UNKNOWN",
            accountRequirement: options.accountRequirement || "UNKNOWN",
            openSource: options.openSource || "UNKNOWN",
            license: options.license || "LICENSE_REVIEW",
            websiteUrl: options.websiteUrl || null,
            repositoryUrl: options.repositoryUrl || null,
            disciplines: frozen(options.disciplines || ["GENERAL"]),
            capabilities: frozen(options.capabilities || []),
            nativeTarget: options.nativeTarget || null,
            lastVerified: options.lastVerified || VERIFIED_ON,
            verificationNote: options.verificationNote || "Built-in registry metadata; verify volatile commercial terms with the linked official source.",
            alternatives: frozen(options.alternatives || []),
            launchAllowed: options.launchAllowed === true,
            deprecated: options.deprecated === true,
            replacementId: options.replacementId || null
        });
    }

    const native = (id, name, description, nativeTarget, disciplines, capabilities, availability = "AVAILABLE") => entry(id, name, description, {
        toolType: "AEGIS_NATIVE", integrationLevel: "NATIVE", availability, costClass: "FREE_OPEN_LOCAL", offlineClass: "FULL_OFFLINE", privacyClass: "LOCAL_FIRST", accountRequirement: "NO", openSource: "UNKNOWN", license: "LICENSE_REVIEW", nativeTarget, disciplines, capabilities
    });
    const optional = (id, name, description, repositoryUrl, disciplines, capabilities) => entry(id, name, description, {
        toolType: "LOCAL_OPTIONAL", integrationLevel: "OPTIONAL_LOCAL", availability: "NOT_INSTALLED", costClass: "FREE_OPEN_LOCAL", offlineClass: "FULL_OFFLINE", privacyClass: "LOCAL_ONLY", accountRequirement: "NO", openSource: "YES", license: "LICENSE_REVIEW", repositoryUrl, websiteUrl: repositoryUrl, disciplines, capabilities, verificationNote: "Optional local capability only. It is not installed, downloaded or invoked by this phase."
    });
    const external = (id, name, description, websiteUrl, options = {}) => entry(id, name, description, {...options, websiteUrl, launchAllowed: options.launchAllowed !== false});

    const ENTRIES = frozen([
        native("aegis_academic_core", "Academic Core", "Canonical local courses, assignments, resources and provenance.", "OVERVIEW", ["GENERAL", "PRODUCTIVITY"], ["ACADEMIC_STORE"]),
        native("aegis_research", "Research", "Explicit academic discovery and local research library.", "RESEARCH", ["GENERAL", "RESEARCH", "WRITING", "LAW", "CRIMINOLOGY", "HISTORY", "PHILOLOGY", "SOCIAL_SCIENCE", "BUSINESS"], ["ACADEMIC_RESEARCH"]),
        native("aegis_crossref", "Crossref", "Integrated explicit DOI metadata lookup through the Research desk.", "RESEARCH", ["RESEARCH", "WRITING"], ["DOI_METADATA"], "ONLINE_REQUIRED"),
        native("aegis_datacite", "DataCite", "Integrated explicit DOI metadata lookup through the Research desk.", "RESEARCH", ["RESEARCH", "DATA"], ["DOI_METADATA"], "ONLINE_REQUIRED"),
        native("aegis_openalex", "OpenAlex", "Integrated explicit academic discovery provider.", "RESEARCH", ["RESEARCH", "DATA"], ["ACADEMIC_DISCOVERY"], "ONLINE_REQUIRED"),
        native("aegis_unpaywall", "Unpaywall", "Explicit legal open-access resolution for DOI records.", "RESEARCH", ["RESEARCH", "WRITING"], ["OPEN_ACCESS"], "ONLINE_REQUIRED"),
        native("aegis_pdf", "PDF.js", "Managed local PDF reading and bounded document context.", "DOCUMENTS", ["GENERAL", "RESEARCH", "WRITING"], ["PDF_READING"]),
        native("aegis_notes", "Notes", "Structured canonical academic notes with explicit relationships.", "NOTES", ["GENERAL", "WRITING", "REVISION", "LAW", "CRIMINOLOGY", "HISTORY", "PHILOLOGY", "SOCIAL_SCIENCE", "BUSINESS"], ["NOTES"]),
        native("aegis_tiptap", "Tiptap / ProseMirror", "Structured local note editor used by STUD Notes.", "NOTES", ["WRITING", "GENERAL"], ["STRUCTURED_WRITING"]),
        native("aegis_katex", "KaTeX", "Mathematics presentation inside structured local notes.", "NOTES", ["MATHEMATICS", "ENGINEERING", "PHYSICS"], ["MATH_TYPESSETTING"]),
        native("aegis_citation", "Citation.js", "Citation rendering for saved academic records.", "RESEARCH", ["RESEARCH", "WRITING"], ["CITATIONS"]),
        native("aegis_zotero", "Zotero Interoperability", "Explicit local Zotero interoperability when available.", "RESEARCH", ["RESEARCH", "WRITING"], ["ZOTERO"], "CONFIG_REQUIRED"),
        native("aegis_moodle", "Moodle", "Read-only LMS integration with explicit sync and safe fallback paths.", "MOODLE", ["GENERAL", "PRODUCTIVITY"], ["LMS"], "CONFIG_REQUIRED"),
        native("aegis_calendar_email_context", "Calendar / Email Context", "Explicit academic orchestration references; no mailbox scan, event write or external mutation.", "ASSIGNMENTS", ["GENERAL", "PRODUCTIVITY", "REVISION"], ["ACADEMIC_ORCHESTRATION"]),
        native("aegis_revision", "Revision", "Local revision planning and explicit study sessions.", "REVISION", ["GENERAL", "REVISION"], ["STUDY_PLANNING"]),
        native("aegis_engineering_compute", "Engineering Compute", "Bounded local STEM equations, units, numerical work, data and plots.", "TOOLS:COMPUTE", ["ENGINEERING", "MATHEMATICS", "PHYSICS", "DATA"], ["LOCAL_COMPUTE"]),
        native("aegis_document_intelligence", "Document Intelligence", "Local managed-document extraction and contextual analysis.", "DOCUMENTS", ["GENERAL", "RESEARCH", "LAW", "HISTORY", "LITERATURE"], ["DOCUMENT_CONTEXT"]),
        native("aegis_academic_intelligence", "Academic Intelligence", "Local context packages, concepts and explainable coverage.", "KNOWLEDGE", ["GENERAL", "RESEARCH"], ["CONTEXT_BUILDING"]),
        native("aegis_local_academic_ai", "Local Academic AI", "Explicit reviewed Context Package assistance; no cloud fallback.", "AI", ["GENERAL", "WRITING", "RESEARCH", "AI"], ["LOCAL_AI"], "CONFIG_REQUIRED"),
        native("aegis_notebook", "Notebook", "Local notebook, data and GitHub repository context workbench.", "WORKBENCH", ["PROGRAMMING", "DATA", "ENGINEERING"], ["NOTEBOOK_DATA"]),
        native("aegis_data_workbench", "Data Workbench", "Managed CSV/TSV inspection and bounded local analysis inside STUD Workbench.", "WORKBENCH", ["DATA", "SOCIAL_SCIENCE", "ECONOMICS", "ENGINEERING"], ["LOCAL_DATA"]),
        native("aegis_github_context", "GitHub Repository Context", "Explicit public repository context inside STUD Workbench; no clone, token or background fetch.", "WORKBENCH", ["PROGRAMMING", "DATA", "ENGINEERING"], ["REPOSITORY_CONTEXT"]),
        native("aegis_progress", "Progress / Analytics", "Derived local academic reporting without prediction or surveillance.", "PROGRESS", ["GENERAL", "REVISION", "PRODUCTIVITY"], ["PROGRESS_ANALYTICS"]),

        external("open_notebook", "Open Notebook", "External open-source knowledge-workspace project; listed for reference, not duplicated inside STUD.", "https://github.com/lfnovo/open-notebook", {toolType: "OPEN_SOURCE_PROJECT", integrationLevel: "NOT_INTEGRATED", availability: "ONLINE_REQUIRED", costClass: "FREE_OPEN_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "UNKNOWN", openSource: "YES", repositoryUrl: "https://github.com/lfnovo/open-notebook", disciplines: ["GENERAL", "RESEARCH", "WRITING"], capabilities: ["KNOWLEDGE_MANAGEMENT"]}),
        external("obsidian", "Obsidian", "External knowledge-management application. STUD remains the canonical owner of its own Notes.", "https://obsidian.md/", {toolType: "DESKTOP_EXTERNAL", integrationLevel: "EXTERNAL_LAUNCH", availability: "UNKNOWN", costClass: "UNKNOWN", offlineClass: "FULL_OFFLINE", privacyClass: "LOCAL_FIRST", accountRequirement: "NO", openSource: "NO", license: "PROPRIETARY", disciplines: ["GENERAL", "WRITING", "RESEARCH"], capabilities: ["KNOWLEDGE_MANAGEMENT"]}),
        external("appflowy", "AppFlowy", "External open-source productivity and knowledge-management project.", "https://github.com/AppFlowy-IO/AppFlowy", {toolType: "OPEN_SOURCE_PROJECT", integrationLevel: "EXTERNAL_LAUNCH", availability: "UNKNOWN", costClass: "FREE_OPEN_ONLINE", offlineClass: "PARTIAL_OFFLINE", privacyClass: "LOCAL_FIRST", accountRequirement: "UNKNOWN", openSource: "YES", repositoryUrl: "https://github.com/AppFlowy-IO/AppFlowy", disciplines: ["GENERAL", "PRODUCTIVITY", "WRITING"], capabilities: ["KNOWLEDGE_MANAGEMENT"]}),
        external("anytype", "Anytype", "External knowledge-management product; account, pricing and privacy posture are shown as provider-dependent.", "https://anytype.io/", {toolType: "DESKTOP_EXTERNAL", integrationLevel: "EXTERNAL_LAUNCH", availability: "UNKNOWN", costClass: "UNKNOWN", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "UNKNOWN", openSource: "UNKNOWN", disciplines: ["GENERAL", "PRODUCTIVITY"], capabilities: ["KNOWLEDGE_MANAGEMENT"]}),
        external("whisper", "Whisper", "Open-source speech-recognition project and future optional local transcription candidate.", "https://github.com/openai/whisper", {toolType: "OPEN_SOURCE_PROJECT", integrationLevel: "OPTIONAL_LOCAL", availability: "NOT_INSTALLED", costClass: "FREE_OPEN_LOCAL", offlineClass: "FULL_OFFLINE", privacyClass: "LOCAL_ONLY", accountRequirement: "NO", openSource: "YES", license: "MIT", repositoryUrl: "https://github.com/openai/whisper", disciplines: ["AI", "LANGUAGES", "RESEARCH", "MEDIA"], capabilities: ["LOCAL_TRANSCRIPTION"], verificationNote: "Listed as an optional future local capability. Aegis does not download or execute it."}),
        external("napkin_slides", "Napkin Slides", "External online presentation tool. Commercial availability is volatile and presented as freemium/limits.", "https://www.napkin.ai/slides/", {toolType: "WEB_TOOL", integrationLevel: "EXTERNAL_LAUNCH", availability: "ONLINE_REQUIRED", costClass: "FREEMIUM_LIMITED", offlineClass: "ONLINE_REQUIRED", privacyClass: "CLOUD_PROCESSING", accountRequirement: "UNKNOWN", openSource: "NO", license: "PROPRIETARY", disciplines: ["PRESENTATION", "DESIGN", "GENERAL"], capabilities: ["PRESENTATIONS"]}),
        external("tldraw", "tldraw", "External visual whiteboard project with an open-source ecosystem and self-hosting potential.", "https://tldraw.com/", {toolType: "WEB_TOOL", integrationLevel: "EXTERNAL_LAUNCH", availability: "ONLINE_REQUIRED", costClass: "FREE_OPEN_ONLINE", offlineClass: "PARTIAL_OFFLINE", privacyClass: "UNKNOWN", accountRequirement: "UNKNOWN", openSource: "YES", license: "LICENSE_REVIEW", repositoryUrl: "https://github.com/tldraw/tldraw", disciplines: ["GENERAL", "DESIGN", "PRESENTATION"], capabilities: ["WHITEBOARD"]}),
        external("penpot", "Penpot", "Open-source design platform; hosted/service terms remain provider-dependent.", "https://penpot.app/", {toolType: "WEB_TOOL", integrationLevel: "EXTERNAL_LAUNCH", availability: "ONLINE_REQUIRED", costClass: "FREE_OPEN_ONLINE", offlineClass: "PARTIAL_OFFLINE", privacyClass: "EXTERNAL_NETWORK", accountRequirement: "UNKNOWN", openSource: "YES", license: "MPL-2.0", repositoryUrl: "https://github.com/penpot/penpot", disciplines: ["DESIGN", "ARCHITECTURE", "PRESENTATION"], capabilities: ["DESIGN"]}),
        external("neal_fun", "Neal.fun", "External interactive learning resource.", "https://neal.fun/", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "ONLINE_REQUIRED", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", disciplines: ["GENERAL", "MATHEMATICS", "ECONOMICS"], capabilities: ["INTERACTIVE_LEARNING"]}),
        external("deepl", "DeepL", "External translation service with free access and paid/pro subscription offerings; content is processed outside the device.", "https://www.deepl.com/", {toolType: "WEB_TOOL", integrationLevel: "EXTERNAL_LAUNCH", availability: "ONLINE_REQUIRED", costClass: "FREEMIUM_LIMITED", offlineClass: "ONLINE_REQUIRED", privacyClass: "CLOUD_PROCESSING", accountRequirement: "OPTIONAL", openSource: "NO", license: "PROPRIETARY", disciplines: ["LANGUAGES", "WRITING", "LINGUISTICS"], capabilities: ["TRANSLATION"], verificationNote: "Official DeepL plans document free and paid/Pro offerings. Verify the current plan before uploading academic content."}),

        external("thirty_days_python", "30 Days of Python", "Open learning repository for Python practice.", "https://github.com/Asabeneh/30-Days-Of-Python", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/Asabeneh/30-Days-Of-Python", disciplines: ["PROGRAMMING", "COMPUTER_SCIENCE"], capabilities: ["PROGRAMMING_LEARNING"]}),
        external("project_based_learning", "Project Based Learning", "Curated project-learning resource repository.", "https://github.com/practical-tutorials/project-based-learning", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/practical-tutorials/project-based-learning", disciplines: ["PROGRAMMING", "GENERAL"], capabilities: ["PROJECT_LEARNING"]}),
        external("build_your_own_x", "Build Your Own X", "Learning resource for reconstructing familiar technologies from first principles.", "https://github.com/codecrafters-io/build-your-own-x", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/codecrafters-io/build-your-own-x", disciplines: ["PROGRAMMING", "COMPUTER_SCIENCE", "ENGINEERING"], capabilities: ["PROGRAMMING_LEARNING"]}),
        external("generative_ai_beginners", "Generative AI for Beginners", "Microsoft learning repository for generative AI concepts.", "https://github.com/microsoft/generative-ai-for-beginners", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/microsoft/generative-ai-for-beginners", disciplines: ["AI", "PROGRAMMING"], capabilities: ["AI_LEARNING"]}),
        external("llm_course", "LLM Course", "External learning repository for language-model concepts.", "https://github.com/mlabonne/llm-course", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/mlabonne/llm-course", disciplines: ["AI", "PROGRAMMING"], capabilities: ["AI_LEARNING"]}),
        external("learn_harness_engineering", "Learn Harness Engineering", "External learning resource; no Aegis integration is implied.", "https://github.com/walkinglabs/learn-harness-engineering", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/walkinglabs/learn-harness-engineering", disciplines: ["AI", "PROGRAMMING", "OTHER"], capabilities: ["LEARNING"]}),
        external("book_to_skill", "Book to Skill", "External open project listed as a learning/reference resource.", "https://github.com/virgiliojr94/book-to-skill", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/virgiliojr94/book-to-skill", disciplines: ["GENERAL", "WRITING"], capabilities: ["LEARNING"]}),
        external("no_ai_slop", "No AI Slop", "External reference repository; it is not a runtime capability.", "https://github.com/petergyang/no-ai-slop", {toolType: "REFERENCE_RESOURCE", integrationLevel: "REFERENCE_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "ONLINE_REQUIRED", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/petergyang/no-ai-slop", disciplines: ["AI", "WRITING", "RESEARCH"], capabilities: ["REFERENCE"], launchAllowed: true}),
        external("i_have_adhd", "I Have ADHD", "External accessibility/productivity reference project.", "https://github.com/ayghri/i-have-adhd", {toolType: "REFERENCE_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/ayghri/i-have-adhd", disciplines: ["GENERAL", "PRODUCTIVITY", "PSYCHOLOGY"], capabilities: ["ACCESSIBILITY"]}),
        external("omniroute", "OmniRoute", "External routing project listed as a programming reference.", "https://github.com/diegosouzapw/OmniRoute", {toolType: "OPEN_SOURCE_PROJECT", integrationLevel: "NOT_INTEGRATED", availability: "ONLINE_REQUIRED", costClass: "FREE_OPEN_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/diegosouzapw/OmniRoute", disciplines: ["PROGRAMMING", "DATA"], capabilities: ["REFERENCE"]}),
        external("open_generative_ai", "Open Generative AI", "External generative-AI learning/reference project.", "https://github.com/Anil-matcha/Open-Generative-AI", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/Anil-matcha/Open-Generative-AI", disciplines: ["AI", "PROGRAMMING"], capabilities: ["AI_LEARNING"]}),

        external("text_to_cad", "CAD Skills / text-to-CAD", "External open project for CAD-oriented experimentation; it is not bundled into Aegis.", "https://github.com/earthtojake/text-to-cad", {toolType: "OPEN_SOURCE_PROJECT", integrationLevel: "NOT_INTEGRATED", availability: "ONLINE_REQUIRED", costClass: "FREE_OPEN_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "YES", license: "LICENSE_REVIEW", repositoryUrl: "https://github.com/earthtojake/text-to-cad", disciplines: ["ENGINEERING", "CAD", "DESIGN"], capabilities: ["CAD_REFERENCE"]}),
        external("alternativeto", "AlternativeTo", "External comparison directory; Aegis does not scrape or import it automatically.", "https://alternativeto.net/", {toolType: "REFERENCE_RESOURCE", integrationLevel: "REFERENCE_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "ONLINE_REQUIRED", privacyClass: "EXTERNAL_NETWORK", accountRequirement: "NO", openSource: "NO", license: "PROPRIETARY", disciplines: ["GENERAL", "PRODUCTIVITY"], capabilities: ["TOOL_DISCOVERY"]}),
        external("freedomain", "FreeDomain", "External open-source project listed for domain-related reference only.", "https://github.com/DigitalPlatDev/FreeDomain", {toolType: "OPEN_SOURCE_PROJECT", integrationLevel: "NOT_INTEGRATED", availability: "ONLINE_REQUIRED", costClass: "FREE_OPEN_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/DigitalPlatDev/FreeDomain", disciplines: ["PROGRAMMING", "BUSINESS"], capabilities: ["REFERENCE"]}),
        external("camelcamelcamel", "CamelCamelCamel", "External price-history website; not an Aegis data source or provider.", "https://camelcamelcamel.com/", {toolType: "WEB_TOOL", integrationLevel: "EXTERNAL_LAUNCH", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "ONLINE_REQUIRED", privacyClass: "EXTERNAL_NETWORK", accountRequirement: "UNKNOWN", openSource: "UNKNOWN", disciplines: ["BUSINESS", "ECONOMICS"], capabilities: ["PRICE_REFERENCE"]}),

        external("hacktricks", "HackTricks", "Cybersecurity educational/reference material. It does not provide active tooling inside STUD.", "https://github.com/HackTricks-wiki/hacktricks", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/HackTricks-wiki/hacktricks", disciplines: ["CYBERSECURITY", "PROGRAMMING"], capabilities: ["SECURITY_LEARNING"]}),
        external("payloads_all_the_things", "PayloadsAllTheThings", "Cybersecurity reference resource. Catalog listing does not execute, distribute or automate it.", "https://github.com/swisskyrepo/PayloadsAllTheThings", {toolType: "REFERENCE_RESOURCE", integrationLevel: "REFERENCE_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/swisskyrepo/PayloadsAllTheThings", disciplines: ["CYBERSECURITY"], capabilities: ["SECURITY_REFERENCE"]}),
        external("seclists", "SecLists", "Cybersecurity reference collection. Aegis provides no execution, download or target workflow.", "https://github.com/danielmiessler/SecLists", {toolType: "REFERENCE_RESOURCE", integrationLevel: "REFERENCE_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/danielmiessler/SecLists", disciplines: ["CYBERSECURITY"], capabilities: ["SECURITY_REFERENCE"]}),
        external("awesome_hacking", "Awesome Hacking", "Cybersecurity learning directory; reference-only inside STUD.", "https://github.com/Hack-with-Github/Awesome-Hacking", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/Hack-with-Github/Awesome-Hacking", disciplines: ["CYBERSECURITY"], capabilities: ["SECURITY_LEARNING"]}),
        external("awesome_bug_bounty", "Awesome Bug Bounty", "Cybersecurity learning directory; it remains external and user-directed.", "https://github.com/djadmin/awesome-bug-bounty", {toolType: "LEARNING_RESOURCE", integrationLevel: "LEARNING_ONLY", availability: "ONLINE_REQUIRED", costClass: "FREE_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/djadmin/awesome-bug-bounty", disciplines: ["CYBERSECURITY"], capabilities: ["SECURITY_LEARNING"]}),
        external("strix", "Strix", "External cybersecurity project listed as a reference only; no target, scan or execution workflow is added.", "https://github.com/usestrix/strix", {toolType: "REFERENCE_RESOURCE", integrationLevel: "REFERENCE_ONLY", availability: "ONLINE_REQUIRED", costClass: "UNKNOWN", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "UNKNOWN", openSource: "UNKNOWN", repositoryUrl: "https://github.com/usestrix/strix", disciplines: ["CYBERSECURITY"], capabilities: ["SECURITY_REFERENCE"]}),
        external("open_seo", "OpenSEO", "External open-source business/marketing reference project.", "https://github.com/every-app/open-seo", {toolType: "OPEN_SOURCE_PROJECT", integrationLevel: "NOT_INTEGRATED", availability: "ONLINE_REQUIRED", costClass: "FREE_OPEN_ONLINE", offlineClass: "UNKNOWN", privacyClass: "UNKNOWN", accountRequirement: "NO", openSource: "UNKNOWN", repositoryUrl: "https://github.com/every-app/open-seo", disciplines: ["BUSINESS", "ECONOMICS"], capabilities: ["MARKETING_REFERENCE"]}),

        optional("optional_docling", "Docling", "Optional local document-processing engine, deferred pending a separately approved installation path.", "https://github.com/docling-project/docling", ["RESEARCH", "DATA", "PROGRAMMING"], ["DOCUMENT_PROCESSING"]),
        optional("optional_grobid", "GROBID", "Optional local scholarly-document engine, deferred and not installed.", "https://github.com/kermitt2/grobid", ["RESEARCH", "WRITING"], ["BIBLIOGRAPHY_EXTRACTION"]),
        optional("optional_tesseract", "Tesseract / OCRmyPDF", "Optional local OCR capability, deferred and not installed.", "https://github.com/tesseract-ocr/tesseract", ["RESEARCH", "WRITING", "DATA"], ["OCR"]),
        optional("optional_sympy", "SymPy", "Optional local symbolic-mathematics dependency; current Engineering Compute does not claim it is installed.", "https://github.com/sympy/sympy", ["MATHEMATICS", "ENGINEERING", "PHYSICS"], ["SYMBOLIC_MATH"]),
        optional("optional_pint", "Pint", "Optional local units dependency; current availability is intentionally separate from catalog metadata.", "https://github.com/hgrecco/pint", ["MATHEMATICS", "ENGINEERING", "PHYSICS"], ["UNITS"]),
        optional("optional_coolprop", "CoolProp", "Optional local thermophysical engine, not installed by this phase.", "https://github.com/CoolProp/CoolProp", ["ENGINEERING", "PHYSICS", "CHEMISTRY"], ["THERMODYNAMICS"]),
        optional("optional_python_control", "python-control", "Optional local control-systems engine, not installed by this phase.", "https://github.com/python-control/python-control", ["ENGINEERING", "MATHEMATICS"], ["CONTROL_SYSTEMS"]),
        optional("optional_pyodide", "Pyodide", "Optional browser Python runtime, deferred and not bundled.", "https://github.com/pyodide/pyodide", ["PROGRAMMING", "DATA"], ["PYTHON_RUNTIME"]),
        optional("optional_jupyter", "Jupyter / JupyterLite", "Optional notebook ecosystem, deferred and not bundled.", "https://github.com/jupyter/jupyter", ["PROGRAMMING", "DATA", "ENGINEERING"], ["NOTEBOOK_RUNTIME"]),
        optional("optional_sqlite_vec", "sqlite-vec", "Optional local vector-search component, deferred; no embedding provider is enabled.", "https://github.com/asg017/sqlite-vec", ["DATA", "AI", "PROGRAMMING"], ["LOCAL_VECTOR_SEARCH"]),
        optional("optional_duckdb", "DuckDB", "Optional local analytical database engine, deferred and not installed.", "https://github.com/duckdb/duckdb", ["DATA", "ECONOMICS", "SOCIAL_SCIENCE"], ["LOCAL_ANALYTICS"]),
        optional("optional_ankiconnect", "AnkiConnect", "Optional local study interoperability bridge, deferred and not installed.", "https://github.com/FooSoft/anki-connect", ["REVISION", "LANGUAGES", "GENERAL"], ["FLASHCARD_INTEROP"])
    ]);

    const PACKS = frozen([
        frozen({id: "general_student", name: "General Student", disciplines: ["GENERAL"], entryIds: ["aegis_academic_core", "aegis_research", "aegis_pdf", "aegis_notes", "aegis_revision", "aegis_progress", "aegis_moodle", "aegis_calendar_email_context", "aegis_notebook"]}),
        frozen({id: "research_writing", name: "Research & Writing", disciplines: ["RESEARCH", "WRITING"], entryIds: ["aegis_research", "aegis_crossref", "aegis_datacite", "aegis_openalex", "aegis_unpaywall", "aegis_pdf", "aegis_citation", "aegis_zotero", "aegis_document_intelligence", "optional_grobid", "optional_docling"]}),
        frozen({id: "engineering", name: "Engineering", disciplines: ["ENGINEERING", "CAD", "MATHEMATICS"], entryIds: ["aegis_engineering_compute", "aegis_notebook", "aegis_research", "text_to_cad", "optional_sympy", "optional_pint", "optional_coolprop", "optional_python_control"]}),
        frozen({id: "computer_science", name: "Computer Science", disciplines: ["PROGRAMMING", "AI", "DATA"], entryIds: ["aegis_notebook", "aegis_research", "thirty_days_python", "project_based_learning", "build_your_own_x", "generative_ai_beginners", "llm_course", "optional_jupyter", "optional_duckdb"]}),
        frozen({id: "law_criminology", name: "Law / Criminology", disciplines: ["LAW", "CRIMINOLOGY", "RESEARCH"], entryIds: ["aegis_research", "aegis_document_intelligence", "aegis_notes", "aegis_citation", "aegis_academic_intelligence", "aegis_progress"]}),
        frozen({id: "humanities", name: "Humanities", disciplines: ["HISTORY", "LITERATURE", "PHILOLOGY", "LANGUAGES"], entryIds: ["aegis_research", "aegis_pdf", "aegis_notes", "aegis_document_intelligence", "aegis_citation", "whisper", "deepl"]}),
        frozen({id: "social_science", name: "Social Science", disciplines: ["SOCIAL_SCIENCE", "PSYCHOLOGY", "DATA"], entryIds: ["aegis_research", "aegis_notebook", "aegis_document_intelligence", "aegis_notes", "aegis_progress", "optional_duckdb"]}),
        frozen({id: "business_economics", name: "Business / Economics", disciplines: ["BUSINESS", "ECONOMICS"], entryIds: ["aegis_notebook", "aegis_research", "aegis_progress", "open_seo", "camelcamelcamel", "neal_fun"]}),
        frozen({id: "design", name: "Design", disciplines: ["DESIGN", "ARCHITECTURE", "PRESENTATION"], entryIds: ["penpot", "tldraw", "napkin_slides", "aegis_notes", "aegis_pdf"]}),
        frozen({id: "cybersecurity_learning", name: "Cybersecurity Learning", disciplines: ["CYBERSECURITY"], entryIds: ["hacktricks", "payloads_all_the_things", "seclists", "awesome_hacking", "awesome_bug_bounty", "strix", "aegis_notes"]})
    ]);

    function validateEntry(item) {
        const errors = [];
        if (!item || typeof item !== "object") return ["entry must be an object"];
        Object.keys(item).forEach(key => { if (!ENTRY_FIELDS.includes(key)) errors.push(`unknown field ${key}`); });
        if (!/^[a-z][a-z0-9_]{2,95}$/.test(item.id || "")) errors.push("invalid id");
        if (!clean(item.name) || !clean(item.description)) errors.push("name and description are required");
        if (!enumValue(item.toolType, TOOL_TYPES)) errors.push("invalid toolType");
        if (!enumValue(item.integrationLevel, INTEGRATION_LEVELS)) errors.push("invalid integrationLevel");
        if (!enumValue(item.availability, AVAILABILITY)) errors.push("invalid availability");
        if (!enumValue(item.costClass, COST_CLASSES)) errors.push("invalid costClass");
        if (!enumValue(item.offlineClass, OFFLINE_CLASSES)) errors.push("invalid offlineClass");
        if (!enumValue(item.privacyClass, PRIVACY_CLASSES)) errors.push("invalid privacyClass");
        if (!enumValue(item.openSource, OPEN_SOURCE)) errors.push("invalid openSource");
        ["websiteUrl", "repositoryUrl"].forEach(field => { if (item[field] && !safeUrl(item[field])) errors.push(`invalid ${field}`); });
        if (!Array.isArray(item.disciplines) || !item.disciplines.length || item.disciplines.some(value => !DISCIPLINES.includes(value))) errors.push("invalid disciplines");
        if (!Array.isArray(item.capabilities)) errors.push("invalid capabilities");
        if (!Array.isArray(item.alternatives)) errors.push("invalid alternatives");
        if (item.launchAllowed && !safeUrl(item.websiteUrl)) errors.push("launchAllowed requires a trusted https websiteUrl");
        if (item.integrationLevel === "NATIVE" && !item.nativeTarget) errors.push("native entry requires nativeTarget");
        if (item.integrationLevel !== "NATIVE" && item.nativeTarget) errors.push("non-native entry cannot have nativeTarget");
        return errors;
    }

    function validateRegistry(entries = ENTRIES, packs = PACKS) {
        const errors = [];
        const ids = new Set();
        entries.forEach(item => { const itemErrors = validateEntry(item); itemErrors.forEach(error => errors.push(`${item && item.id || "unknown"}: ${error}`)); if (ids.has(item.id)) errors.push(`${item.id}: duplicate id`); ids.add(item.id); });
        packs.forEach(pack => {
            if (!pack || !/^[a-z][a-z0-9_]{2,95}$/.test(pack.id || "")) errors.push("invalid pack id");
            if (!Array.isArray(pack.entryIds) || new Set(pack.entryIds).size !== pack.entryIds.length) errors.push(`${pack && pack.id || "unknown"}: duplicate entry id`);
            (pack.entryIds || []).forEach(id => { if (!ids.has(id)) errors.push(`${pack.id}: unknown entry ${id}`); });
        });
        return frozen(errors);
    }

    function requireValidRegistry() { const errors = validateRegistry(); if (errors.length) throw new Error(`Invalid STUD tool registry: ${errors.join("; ")}`); return true; }
    function getEntry(id) { return ENTRIES.find(item => item.id === String(id || "")) || null; }
    function getPack(id) { return PACKS.find(item => item.id === String(id || "")) || null; }
    function launchUrl(id) { const item = getEntry(id); if (!item || item.launchAllowed !== true || !safeUrl(item.websiteUrl)) return null; return safeUrl(item.websiteUrl); }
    function entrySort(a, b) { return COST_ORDER[a.costClass] - COST_ORDER[b.costClass] || (a.toolType === "AEGIS_NATIVE" ? -1 : 0) - (b.toolType === "AEGIS_NATIVE" ? -1 : 0) || a.name.localeCompare(b.name); }

    requireValidRegistry();
    const api = frozen({REGISTRY_VERSION, VERIFIED_ON, TOOL_TYPES, INTEGRATION_LEVELS, AVAILABILITY, COST_CLASSES, OFFLINE_CLASSES, PRIVACY_CLASSES, OPEN_SOURCE, DISCIPLINES, COST_ORDER, ENTRIES, PACKS, safeUrl, validateEntry, validateRegistry, requireValidRegistry, getEntry, getPack, launchUrl, entrySort});
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    scope.StudToolCatalogRegistry = api;
})(typeof window !== "undefined" ? window : globalThis);

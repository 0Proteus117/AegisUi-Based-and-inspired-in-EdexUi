(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OsintToolsRegistry = exported;
})(typeof window !== "undefined" ? window : null, function() {
    const CATEGORY_PHASE = "PHASE 1";

    const CATEGORIES = Object.freeze([
        {id: "discovery", title: "Discovery / Search", icon: "⌕", status: CATEGORY_PHASE, description: "Public-source starting points and query surfaces."},
        {id: "archives", title: "Archives", icon: "◫", status: "NEXT", description: "Historic pages, captures and source chronology."},
        {id: "geospatial", title: "Geospatial", icon: "⌖", status: "NEXT", description: "Maps, imagery and location verification."},
        {id: "infrastructure", title: "Domains / Infra", icon: "⌬", status: "NEXT", description: "Domains, hosts and public network context."},
        {id: "media", title: "Media Verification", icon: "◈", status: "NEXT", description: "Image, video and visual-source analysis."},
        {id: "social", title: "Public Profiles", icon: "◎", status: "NEXT", description: "Public-facing profiles and organisation context."},
        {id: "research", title: "Research / Docs", icon: "▤", status: "NEXT", description: "Papers, records and reference collections."},
        {id: "monitoring", title: "Source Monitor", icon: "≋", status: "NEXT", description: "Public source watchlists and change tracking."},
        {id: "evidence", title: "Evidence", icon: "▱", status: "NEXT", description: "Provenance, notes and exportable findings."}
    ]);

    const embeddedTool = (id, title, url, allowedHosts, description, tags = []) => Object.freeze({
        id,
        title,
        category: "discovery",
        accessMode: "embedded_web",
        status: "EMBEDDED WEB",
        url,
        allowedHosts,
        description,
        tags
    });

    const nativeTool = (id, title, providerId, description, tags = []) => Object.freeze({
        id,
        title,
        category: "discovery",
        accessMode: "native_api",
        status: "NATIVE API",
        providerId,
        description,
        tags,
        query: {
            label: "URL TO CHECK",
            placeholder: "https://example.org",
            button: "CHECK ARCHIVE"
        }
    });

    const TOOLS = Object.freeze([
        nativeTool(
            "wayback-availability",
            "Wayback Availability",
            "wayback-availability",
            "Native lookup of the closest public Internet Archive snapshot for a supplied URL.",
            ["archive", "native", "no key"]
        ),
        embeddedTool(
            "bellingcat-toolkit",
            "Bellingcat Toolkit",
            "https://bellingcat.gitbook.io/toolkit",
            ["bellingcat.gitbook.io"],
            "Public investigation methods and reference toolkit.",
            ["methods", "reference", "public source"]
        ),
        embeddedTool(
            "google-search",
            "Google Search",
            "https://www.google.com/",
            ["google.com", "www.google.com"],
            "General-purpose public web discovery. Search terms remain user-directed.",
            ["search", "web"]
        ),
        embeddedTool(
            "bing-search",
            "Bing Search",
            "https://www.bing.com/",
            ["bing.com", "www.bing.com"],
            "Independent web-search surface for cross-checking discovery results.",
            ["search", "web"]
        ),
        embeddedTool(
            "duckduckgo-search",
            "DuckDuckGo",
            "https://duckduckgo.com/",
            ["duckduckgo.com", "www.duckduckgo.com"],
            "Privacy-oriented public search surface.",
            ["search", "web"]
        ),
        embeddedTool(
            "yandex-search",
            "Yandex Search",
            "https://yandex.com/",
            ["yandex.com", "www.yandex.com"],
            "Alternative public search surface for cross-source discovery.",
            ["search", "web"]
        ),
        embeddedTool(
            "google-scholar",
            "Google Scholar",
            "https://scholar.google.com/",
            ["scholar.google.com"],
            "Academic papers, citations and technical literature search.",
            ["academic", "research"]
        ),
        embeddedTool(
            "osint-framework",
            "OSINT Framework",
            "https://osintframework.com/",
            ["osintframework.com", "www.osintframework.com"],
            "Reference directory of public-source research resources.",
            ["directory", "reference"]
        ),
        embeddedTool(
            "inteltechniques-tools",
            "IntelTechniques Tools",
            "https://inteltechniques.com/tools/",
            ["inteltechniques.com", "www.inteltechniques.com"],
            "Public search-tool directory for investigator-led queries.",
            ["directory", "search"]
        )
    ]);

    function getTool(id) {
        return TOOLS.find(tool => tool.id === id) || null;
    }

    function getToolsForCategory(category) {
        return TOOLS.filter(tool => tool.category === category);
    }

    function getEmbeddedTool(id) {
        const tool = getTool(id);
        return tool && tool.accessMode === "embedded_web" ? tool : null;
    }

    return Object.freeze({
        CATEGORIES,
        TOOLS,
        getTool,
        getToolsForCategory,
        getEmbeddedTool
    });
});

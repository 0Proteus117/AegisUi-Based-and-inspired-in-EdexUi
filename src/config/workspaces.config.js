(() => {
    const link = (label, url, description = "") => ({
        type: "link",
        label,
        url,
        description
    });

    const app = (label, aliases, description = "") => ({
        type: "application",
        label,
        aliases,
        description
    });

    window.workspaceDefinitions = [
        {
            id: "hub",
            navigationLabel: "HUB",
            name: "Personal Engineering HUB",
            description: "The original cockpit: local situation, calendar, projects, music and applications.",
            status: "active",
            implementation: "active",
            preserveExistingView: true,
            categories: ["system", "situation", "planning", "music", "applications"],
            widgets: [
                {id: "hub-map", name: "Local situation", status: "active"},
                {id: "hub-calendar", name: "Calendar", status: "active"},
                {id: "hub-projects", name: "Project timelines", status: "active"},
                {id: "hub-music", name: "Apple Music", status: "active"},
                {id: "hub-apps", name: "Applications", status: "active"}
            ],
            quickActions: [],
            recommendedTools: [],
            futureModules: []
        },
        {
            id: "engineer",
            navigationLabel: "ENGINEER",
            name: "Engineering Command Deck",
            description: "Mechanical engineering, CAD/CAE, simulation, manufacturing, research and project control.",
            status: "active",
            implementation: "foundation",
            categories: ["design", "simulation", "manufacturing", "research", "standards", "projects"],
            quickActions: [
                app("AUTODESK FUSION", ["Autodesk Fusion", "Fusion 360"], "CAD / CAM / CAE"),
                app("FREECAD", ["FreeCAD"], "Parametric CAD"),
                app("BLENDER", ["Blender"], "3D modelling and visualization"),
                app("BAMBU STUDIO", ["BambuStudio", "Bambu Studio"], "Additive manufacturing"),
                link("GITHUB", "https://github.com/", "Repositories and project documentation"),
                link("GOOGLE SCHOLAR", "https://scholar.google.com/", "Papers and citations")
            ],
            recommendedTools: [
                {
                    category: "CAD / CAM",
                    items: [
                        app("AUTODESK FUSION", ["Autodesk Fusion", "Fusion 360"]),
                        app("FREECAD", ["FreeCAD"]),
                        app("SOLIDWORKS", ["SOLIDWORKS", "3DEXPERIENCE Launcher"]),
                        app("BAMBU STUDIO", ["BambuStudio", "Bambu Studio"])
                    ]
                },
                {
                    category: "CAE / CFD",
                    items: [
                        app("ANSYS", ["Ansys", "Ansys Workbench"]),
                        app("OPENFOAM", ["ParaView", "OpenFOAM"]),
                        app("MATLAB", ["MATLAB"]),
                        link("SIMSCALE", "https://www.simscale.com/")
                    ]
                }
            ],
            widgets: [
                {
                    id: "engineering-project-status",
                    name: "Engineering project status",
                    type: "project-status",
                    status: "active",
                    description: "A compact read-only view of the projects already managed by the HUB."
                },
                {
                    id: "engineering-sector-pulse",
                    name: "Sector pulse",
                    type: "source-list",
                    status: "placeholder",
                    description: "Configurable source deck. Live feeds will be connected in a future phase.",
                    items: [
                        link("ASME NEWS", "https://www.asme.org/topics-resources"),
                        link("AUTODESK DESIGN & MAKE", "https://www.autodesk.com/design-make/articles"),
                        link("ANSYS BLOG", "https://www.ansys.com/blog"),
                        link("NASA TECHNICAL REPORTS", "https://ntrs.nasa.gov/")
                    ]
                },
                {
                    id: "engineering-research",
                    name: "Research & documentation",
                    type: "link-list",
                    status: "active",
                    items: [
                        link("GOOGLE SCHOLAR", "https://scholar.google.com/"),
                        link("ASME DIGITAL COLLECTION", "https://asmedigitalcollection.asme.org/"),
                        link("OPENFOAM RESOURCES", "https://openfoam.org/resources/"),
                        link("GITHUB", "https://github.com/"),
                        link("GITHUB DOCS", "https://docs.github.com/")
                    ]
                },
                {
                    id: "engineering-standards",
                    name: "Standards & references",
                    type: "link-list",
                    status: "active",
                    items: [
                        link("ASME CODES & STANDARDS", "https://www.asme.org/codes-standards"),
                        link("ISO ENGINEERING", "https://www.iso.org/sectors/engineering"),
                        link("NIST", "https://www.nist.gov/")
                    ]
                },
                {
                    id: "engineering-toolbox",
                    name: "Technical tools",
                    type: "roadmap",
                    status: "future",
                    items: [
                        {label: "Unit and tolerance calculator", status: "future"},
                        {label: "Material property quick view", status: "future"},
                        {label: "CAD revision tracker", status: "future"},
                        {label: "Simulation queue and result monitor", status: "future"}
                    ]
                }
            ],
            futureModules: [
                "Live engineering news feeds",
                "Material database",
                "Calculation notebooks",
                "CAD revision and simulation result watchers"
            ]
        },
        {
            id: "osint",
            navigationLabel: "OSINT",
            name: "OSINT / Analyst Desk",
            description: "A legal, public-source investigation workspace for discovery, verification and organized notes.",
            status: "placeholder",
            implementation: "foundation",
            categories: ["search", "maps", "domains", "archives", "news", "evidence"],
            quickActions: [
                link("BELLINGCAT TOOLKIT", "https://bellingcat.gitbook.io/toolkit"),
                link("WAYBACK MACHINE", "https://web.archive.org/"),
                link("VIRUSTOTAL", "https://www.virustotal.com/gui/home/search"),
                link("CENSYS", "https://search.censys.io/")
            ],
            recommendedTools: [
                {
                    category: "PUBLIC-SOURCE DISCOVERY",
                    items: [
                        link("BELLINGCAT TOOLKIT", "https://bellingcat.gitbook.io/toolkit"),
                        link("WAYBACK MACHINE", "https://web.archive.org/"),
                        link("VIRUSTOTAL", "https://www.virustotal.com/gui/home/search"),
                        link("CENSYS", "https://search.censys.io/")
                    ]
                }
            ],
            widgets: [
                {id: "osint-search", name: "Search launchpad", type: "placeholder", status: "placeholder"},
                {id: "osint-map", name: "Geospatial verification", type: "placeholder", status: "future"},
                {id: "osint-domains", name: "Domain & infrastructure context", type: "placeholder", status: "future"},
                {id: "osint-findings", name: "Findings notebook", type: "placeholder", status: "future"},
                {id: "osint-news", name: "Source monitor", type: "placeholder", status: "future"}
            ],
            futureModules: ["Case board", "Source provenance", "Archive snapshots", "Exportable evidence log"]
        },
        {
            id: "student",
            navigationLabel: "STUDENT",
            name: "Student Study Deck",
            description: "Academic planning, papers, writing, bibliography, notes and spaced repetition.",
            status: "placeholder",
            implementation: "foundation",
            categories: ["courses", "deadlines", "papers", "writing", "bibliography", "revision"],
            quickActions: [
                link("MOODLE", "https://moodle.org/"),
                link("GOOGLE SCHOLAR", "https://scholar.google.com/"),
                app("ZOTERO", ["Zotero"]),
                app("ANKI", ["Anki"])
            ],
            recommendedTools: [
                {
                    category: "RESEARCH & STUDY",
                    items: [
                        link("GOOGLE SCHOLAR", "https://scholar.google.com/"),
                        app("ZOTERO", ["Zotero"]),
                        app("ANKI", ["Anki"]),
                        app("MICROSOFT WORD", ["Microsoft Word"])
                    ]
                }
            ],
            widgets: [
                {id: "student-deadlines", name: "Academic deadlines", type: "placeholder", status: "future"},
                {id: "student-reading", name: "Paper reading queue", type: "placeholder", status: "future"},
                {id: "student-writing", name: "Writing desk", type: "placeholder", status: "future"},
                {id: "student-bibliography", name: "Bibliography status", type: "placeholder", status: "future"},
                {id: "student-review", name: "Flashcard review", type: "placeholder", status: "future"}
            ],
            futureModules: ["Moodle deadlines", "Zotero library", "Anki review counts", "Academic calendar"]
        },
        {
            id: "artist",
            navigationLabel: "ARTIST",
            name: "Artist Creative Deck",
            description: "A calm creative cockpit for references, assets, palettes, production and portfolio work.",
            status: "placeholder",
            implementation: "foundation",
            categories: ["inspiration", "production", "assets", "color", "portfolio", "publishing"],
            quickActions: [
                app("PHOTOSHOP", ["Adobe Photoshop"]),
                app("LIGHTROOM", ["Adobe Lightroom", "Adobe Lightroom Classic"]),
                app("ILLUSTRATOR", ["Adobe Illustrator"]),
                app("BLENDER", ["Blender"]),
                link("PINTEREST", "https://www.pinterest.com/"),
                link("BEHANCE", "https://www.behance.net/")
            ],
            recommendedTools: [
                {
                    category: "CREATIVE SUITE",
                    items: [
                        app("PHOTOSHOP", ["Adobe Photoshop"]),
                        app("LIGHTROOM", ["Adobe Lightroom", "Adobe Lightroom Classic"]),
                        app("ILLUSTRATOR", ["Adobe Illustrator"]),
                        app("BLENDER", ["Blender"])
                    ]
                }
            ],
            widgets: [
                {id: "artist-moodboard", name: "Moodboard", type: "placeholder", status: "future"},
                {id: "artist-assets", name: "Asset folders", type: "placeholder", status: "future"},
                {id: "artist-palette", name: "Color palette", type: "placeholder", status: "future"},
                {id: "artist-production", name: "Creative project status", type: "placeholder", status: "future"},
                {id: "artist-portfolio", name: "Portfolio & publishing", type: "placeholder", status: "future"}
            ],
            futureModules: ["Local moodboards", "Asset tagging", "Palette extraction", "Portfolio publishing checklist"]
        },
        {
            id: "business",
            navigationLabel: "BUSINESS",
            name: "Business Operations Deck",
            description: "A decision-oriented overview for schedule, KPIs, markets, communication and operations.",
            status: "placeholder",
            implementation: "foundation",
            categories: ["calendar", "kpis", "markets", "communications", "tasks", "documents"],
            quickActions: [
                app("MICROSOFT TEAMS", ["Microsoft Teams"]),
                app("SLACK", ["Slack"]),
                app("OUTLOOK", ["Microsoft Outlook"]),
                link("FRED", "https://fred.stlouisfed.org/"),
                link("SEC EDGAR", "https://www.sec.gov/search-filings")
            ],
            recommendedTools: [
                {
                    category: "OPERATIONS & INTELLIGENCE",
                    items: [
                        app("MICROSOFT TEAMS", ["Microsoft Teams"]),
                        app("SLACK", ["Slack"]),
                        app("OUTLOOK", ["Microsoft Outlook"]),
                        link("FRED", "https://fred.stlouisfed.org/"),
                        link("SEC EDGAR", "https://www.sec.gov/search-filings")
                    ]
                }
            ],
            widgets: [
                {id: "business-agenda", name: "Executive agenda", type: "placeholder", status: "future"},
                {id: "business-kpi", name: "KPI quick view", type: "placeholder", status: "future"},
                {id: "business-market", name: "Market watchlist", type: "placeholder", status: "future"},
                {id: "business-comms", name: "Communication queue", type: "placeholder", status: "future"},
                {id: "business-operations", name: "Operations & projects", type: "placeholder", status: "future"}
            ],
            futureModules: ["Read-only KPI connectors", "Portfolio performance", "Communication summaries", "Operations alerts"]
        }
    ];
})();

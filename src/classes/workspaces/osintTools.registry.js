(function(root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    if (root) root.OSINTToolsRegistry = exported;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    // Electron's legacy renderer exposes CommonJS `require`, but resolves it
    // relative to ui.html for normal <script> tags. Prefer the already-loaded
    // browser globals so the same registry works in Electron and Node tests.
    const ProviderSchema = (typeof window !== "undefined" && window.OSINTProviderSchema)
        || (typeof require === "function" ? require("./osintProviderSchema.class.js") : null);
    const ProviderPolicy = (typeof window !== "undefined" && window.OSINTProviderPolicy)
        || (typeof require === "function" ? require("./osintProviderPolicy.class.js") : null);

    if (!ProviderSchema || !ProviderPolicy) throw new Error("OSINT provider schema and policy must load before the registry.");

    const CATEGORY_DEFINITIONS = Object.freeze([
        {id: "discovery", title: "Discovery / Research", icon: "⌕", description: "Search engines, investigation directories and structured public research."},
        {id: "archives", title: "Archive / Evidence", icon: "▤", description: "Historical web, capture, preservation and source provenance."},
        {id: "infrastructure", title: "Domains / Infrastructure", icon: "◌", description: "Passive DNS, certificates, public exposure and web technology context."},
        {id: "threat", title: "Threat Intelligence", icon: "◈", description: "URL, file, malware and phishing context from public intelligence sources."},
        {id: "geospatial", title: "Geo / Visual", icon: "⌖", description: "Maps, satellite imagery, visual verification and media metadata."},
        {id: "entities", title: "Entities / Records", icon: "▣", description: "Companies, sanctions, legal records, patents and public datasets."},
        {id: "presence", title: "Public Presence", icon: "◍", description: "Public organisation, brand and account-presence research."},
        {id: "data", title: "Data / Analysis", icon: "Σ", description: "Case analysis, graphing, cleaning and reproducible research."},
        {id: "transport", title: "Transport / Space", icon: "⌁", description: "Public aviation, maritime, satellite and Earth-observation sources."}
    ]);

    const providerSeed = (id, title, category, icon, url, description, tags = [], featuredOrder = 0) => ({
        id, title, category, icon, url, description, tags, featuredOrder, type: "web", status: "external"
    });
    const tool = providerSeed;

    const PROVIDER_SEEDS = Object.freeze([
        tool("bellingcat", "Bellingcat Toolkit", "discovery", "B", "https://bellingcat.gitbook.io/toolkit", "Curated online-investigation methods and public-source tools.", ["method", "verification"], 1),
        tool("osint-framework", "OSINT Framework", "discovery", "O", "https://osintframework.com/", "Browsable directory of public-source research resources.", ["directory", "research"]),
        tool("maltego", "Maltego", "discovery", "M", "https://www.maltego.com/", "Entity relationship mapping and transform-based investigations.", ["graph", "entities"]),
        tool("spiderfoot", "SpiderFoot", "discovery", "S", "https://www.spiderfoot.net/", "Automated public-source reconnaissance framework.", ["automation", "public-data"]),
        tool("google", "Google Search", "discovery", "G", "https://www.google.com/", "General web discovery and indexed public material.", ["search"]),
        tool("bing", "Bing Search", "discovery", "B", "https://www.bing.com/", "Alternative web index and image search.", ["search"]),
        tool("yandex", "Yandex Search", "discovery", "Y", "https://yandex.com/", "Alternative web and visual search index.", ["search", "visual"]),
        tool("google-scholar", "Google Scholar", "discovery", "GS", "https://scholar.google.com/", "Academic papers, citations and author records.", ["research", "papers"]),
        tool("openalex", "OpenAlex", "discovery", "OA", "https://openalex.org/", "Open scholarly catalogue for works, authors and institutions.", ["research", "data"]),
        tool("lens-org", "Lens", "discovery", "L", "https://www.lens.org/", "Scholarly and patent research platform.", ["research", "patents"]),

        tool("wayback", "Wayback Machine", "archives", "W", "https://web.archive.org/", "Historical snapshots of websites and public pages.", ["archive", "history"], 2),
        tool("archive-today", "Archive.today", "archives", "A", "https://archive.ph/", "On-demand snapshots of public web pages.", ["archive"]),
        tool("common-crawl", "Common Crawl", "archives", "CC", "https://commoncrawl.org/", "Open archive of web crawl data.", ["archive", "datasets"]),
        tool("memento", "Memento Time Travel", "archives", "MT", "http://timetravel.mementoweb.org/", "Search across public web archives.", ["archive"]),
        tool("perma", "Perma.cc", "archives", "P", "https://perma.cc/", "Persistent citation and evidence links.", ["evidence", "citation"]),
        tool("documentcloud", "DocumentCloud", "archives", "DC", "https://www.documentcloud.org/", "Searchable public-document hosting and annotation.", ["documents", "evidence"]),
        tool("webrecorder", "Webrecorder", "archives", "WR", "https://webrecorder.net/", "High-fidelity local web capture and replay.", ["capture", "evidence"]),
        tool("singlefile", "SingleFile", "archives", "SF", "https://github.com/gildas-lormeau/SingleFile", "Save a public web page into a single local file.", ["capture", "local"]),
        tool("github-history", "GitHub History", "archives", "GH", "https://github.com/", "Public repository commits, releases and issue history.", ["code", "history"]),

        tool("shodan", "Shodan", "infrastructure", "SH", "https://www.shodan.io/", "Search engine for publicly exposed Internet services.", ["public-exposure", "assets"]),
        tool("censys", "Censys", "infrastructure", "C", "https://search.censys.io/", "Public host, certificate and Internet asset search.", ["certificates", "assets"], 4),
        tool("securitytrails", "SecurityTrails", "infrastructure", "ST", "https://securitytrails.com/", "DNS history, domain and subdomain context.", ["dns", "domains"]),
        tool("crtsh", "crt.sh", "infrastructure", "CT", "https://crt.sh/", "Certificate Transparency search.", ["certificates", "domains"]),
        tool("certspotter", "Cert Spotter", "infrastructure", "CS", "https://sslmate.com/certspotter/", "Certificate Transparency monitoring and search.", ["certificates"]),
        tool("dnsdumpster", "DNSdumpster", "infrastructure", "DD", "https://dnsdumpster.com/", "DNS reconnaissance and relationship visualisation.", ["dns", "domains"]),
        tool("dnsltyics", "DNSlytics", "infrastructure", "DL", "https://dnslytics.com/", "DNS, domain and IP intelligence.", ["dns", "ip"]),
        tool("viewdns", "ViewDNS", "infrastructure", "VD", "https://viewdns.info/", "WHOIS, DNS and public infrastructure lookup.", ["whois", "dns"]),
        tool("netcraft", "Netcraft", "infrastructure", "N", "https://www.netcraft.com/", "Internet infrastructure and web technology context.", ["technology", "domains"]),
        tool("builtwith", "BuiltWith", "infrastructure", "BW", "https://builtwith.com/", "Public web technology profiling.", ["technology", "web"]),
        tool("wappalyzer", "Wappalyzer", "infrastructure", "WA", "https://www.wappalyzer.com/", "Website technology identification.", ["technology", "web"]),
        tool("publicwww", "PublicWWW", "infrastructure", "PW", "https://publicwww.com/", "Search public source code and web fingerprints.", ["code", "web"]),

        tool("virustotal", "VirusTotal", "threat", "VT", "https://www.virustotal.com/gui/home/search", "Public reputation and analysis context for files, URLs, domains and IPs.", ["malware", "urls"], 3),
        tool("urlscan", "urlscan.io", "threat", "US", "https://urlscan.io/", "Public URL scans, rendered pages, DOM and network indicators.", ["urls", "phishing"]),
        tool("urlhaus", "URLhaus", "threat", "UH", "https://urlhaus.abuse.ch/", "Malware distribution URL exchange.", ["malware", "urls"]),
        tool("malwarebazaar", "MalwareBazaar", "threat", "MB", "https://bazaar.abuse.ch/", "Malware sample intelligence and hashes.", ["malware", "hashes"]),
        tool("threatfox", "ThreatFox", "threat", "TF", "https://threatfox.abuse.ch/", "Indicators of compromise from abuse.ch.", ["ioc", "malware"]),
        tool("abuseipdb", "AbuseIPDB", "threat", "AI", "https://www.abuseipdb.com/", "IP reputation and abuse reports.", ["ip", "reputation"]),
        tool("otx", "AlienVault OTX", "threat", "OTX", "https://otx.alienvault.com/", "Community threat intelligence pulses and indicators.", ["ioc", "threat-intel"]),
        tool("openphish", "OpenPhish", "threat", "OP", "https://openphish.com/", "Phishing intelligence feeds and samples.", ["phishing", "urls"]),
        tool("phishtank", "PhishTank", "threat", "PT", "https://phishtank.org/", "Community phishing verification and data.", ["phishing", "urls"]),
        tool("greynoise", "GreyNoise", "threat", "GN", "https://viz.greynoise.io/", "Internet background-noise and IP context.", ["ip", "context"]),
        tool("hybrid-analysis", "Hybrid Analysis", "threat", "HA", "https://www.hybrid-analysis.com/", "Malware and suspicious-file analysis sandbox.", ["malware", "files"]),

        tool("google-earth", "Google Earth", "geospatial", "GE", "https://earth.google.com/", "3D globe, imagery and historical geographic context.", ["maps", "imagery"]),
        tool("openstreetmap", "OpenStreetMap", "geospatial", "OSM", "https://www.openstreetmap.org/", "Open map data and geographic context.", ["maps", "open-data"]),
        tool("mapillary", "Mapillary", "geospatial", "MP", "https://www.mapillary.com/", "Crowdsourced street-level imagery.", ["imagery", "maps"]),
        tool("sentinel", "Copernicus Browser", "geospatial", "CB", "https://browser.dataspace.copernicus.eu/", "Sentinel satellite imagery and comparison tools.", ["satellite", "imagery"]),
        tool("nasa-worldview", "NASA Worldview", "geospatial", "NW", "https://worldview.earthdata.nasa.gov/", "Near-real-time Earth observation layers.", ["satellite", "earth"]),
        tool("zoom-earth", "Zoom Earth", "geospatial", "ZE", "https://zoom.earth/", "Weather, satellite and event context.", ["weather", "satellite"]),
        tool("suncalc", "SunCalc", "geospatial", "SC", "https://www.suncalc.org/", "Sun position and daylight calculations.", ["sun", "verification"]),
        tool("windy", "Windy", "geospatial", "WI", "https://www.windy.com/", "Weather, wind and forecast layers.", ["weather", "verification"]),
        tool("exiftool", "ExifTool", "geospatial", "EX", "https://exiftool.org/", "Local metadata reader for images, video and documents.", ["metadata", "local"]),
        tool("invid", "InVID-WeVerify", "geospatial", "IV", "https://www.invid-project.eu/tools-and-services/invid-verification-plugin/", "Video verification and keyframe analysis.", ["video", "verification"]),
        tool("tineye", "TinEye", "geospatial", "TI", "https://tineye.com/", "Reverse-image search.", ["image", "verification"]),
        tool("google-lens", "Google Lens", "geospatial", "GL", "https://lens.google/", "Visual lookup and reverse-image discovery.", ["image", "visual"]),
        tool("forensically", "Forensically", "geospatial", "FO", "https://29a.ch/photo-forensics/", "Browser-based image-analysis utilities.", ["image", "forensics"]),

        tool("opencorporates", "OpenCorporates", "entities", "OC", "https://opencorporates.com/", "Open company-register aggregation.", ["companies", "records"]),
        tool("companies-house", "Companies House", "entities", "CH", "https://find-and-update.company-information.service.gov.uk/", "UK company records and filings.", ["companies", "uk"]),
        tool("sec-edgar", "SEC EDGAR", "entities", "SEC", "https://www.sec.gov/edgar/search/", "US public-company filings.", ["companies", "filings"]),
        tool("borme", "BORME", "entities", "BO", "https://www.boe.es/borme/", "Spanish corporate notices and legal publication.", ["companies", "spain"]),
        tool("opensanctions", "OpenSanctions", "entities", "OS", "https://www.opensanctions.org/", "Sanctions, PEP and public-risk data.", ["sanctions", "entities"]),
        tool("ofac", "OFAC Sanctions", "entities", "OF", "https://sanctionssearch.ofac.treas.gov/", "US sanctions-list search.", ["sanctions", "us"]),
        tool("icij", "ICIJ Offshore Leaks", "entities", "IC", "https://offshoreleaks.icij.org/", "Public database of offshore investigations.", ["companies", "investigations"]),
        tool("courtlistener", "CourtListener", "entities", "CL", "https://www.courtlistener.com/", "US legal opinions and court research.", ["legal", "records"]),
        tool("eurlex", "EUR-Lex", "entities", "EU", "https://eur-lex.europa.eu/", "European Union legislation and legal acts.", ["legal", "eu"]),
        tool("google-patents", "Google Patents", "entities", "GP", "https://patents.google.com/", "Patent discovery and citation research.", ["patents", "research"]),
        tool("espacenet", "Espacenet", "entities", "EP", "https://worldwide.espacenet.com/", "European Patent Office search.", ["patents", "research"]),
        tool("worldbank", "World Bank Data", "entities", "WB", "https://data.worldbank.org/", "Public global development indicators.", ["data", "economics"]),

        tool("whatsmyname", "WhatsMyName", "presence", "WM", "https://whatsmyname.app/", "Public username and brand-presence reference.", ["brand", "public"]),
        tool("namechk", "Namechk", "presence", "NC", "https://namechk.com/", "Public username and domain availability lookup.", ["brand", "domains"]),
        tool("social-searcher", "Social Searcher", "presence", "SS", "https://www.social-searcher.com/", "Public social-content monitoring.", ["social", "public"]),
        tool("google-alerts", "Google Alerts", "presence", "GA", "https://www.google.com/alerts", "Monitor indexed public mentions.", ["monitoring", "web"]),
        tool("github", "GitHub", "presence", "GH", "https://github.com/", "Public organisation, repository and release research.", ["code", "organisations"]),
        tool("gitlab", "GitLab", "presence", "GL", "https://gitlab.com/", "Public projects and organisation research.", ["code", "organisations"]),
        tool("youtube", "YouTube", "presence", "YT", "https://www.youtube.com/", "Public video and channel search.", ["video", "public"]),
        tool("reddit", "Reddit", "presence", "RD", "https://www.reddit.com/", "Public discussion and community search.", ["communities", "public"]),

        tool("hunchly", "Hunchly", "data", "HU", "https://hunch.ly/", "Case capture, source tracking and evidence organisation.", ["casework", "evidence"]),
        tool("gephi", "Gephi", "data", "GF", "https://gephi.org/", "Local graph visualisation and exploration.", ["graph", "local"]),
        tool("qgis", "QGIS", "data", "QG", "https://qgis.org/", "Local geographic data analysis and cartography.", ["maps", "local"]),
        tool("openrefine", "OpenRefine", "data", "OR", "https://openrefine.org/", "Local data cleaning and reconciliation.", ["data", "local"]),
        tool("duckdb", "DuckDB", "data", "DB", "https://duckdb.org/", "Local analytical database for structured evidence.", ["data", "local"]),
        tool("jupyter", "Jupyter", "data", "JP", "https://jupyter.org/", "Reproducible analysis notebooks.", ["analysis", "local"]),
        tool("neo4j", "Neo4j", "data", "N4", "https://neo4j.com/", "Graph database for authorised case relationships.", ["graph", "data"]),
        tool("misp", "MISP", "data", "MI", "https://www.misp-project.org/", "Threat-intelligence sharing and correlation platform.", ["threat-intel", "ioc"]),
        tool("opencti", "OpenCTI", "data", "CTI", "https://www.opencti.io/", "Threat knowledge graph and intelligence platform.", ["threat-intel", "graph"]),
        tool("datawrapper", "Datawrapper", "data", "DW", "https://www.datawrapper.de/", "Charts and visual data communication.", ["visualisation", "data"]),

        tool("opensky", "OpenSky Network", "transport", "SK", "https://opensky-network.org/", "Public research data for aviation analysis.", ["aviation", "public"]),
        tool("flightradar24", "Flightradar24", "transport", "FR", "https://www.flightradar24.com/", "Public flight tracking and flight-history context.", ["aviation", "public"]),
        tool("adsbexchange", "ADS-B Exchange", "transport", "AD", "https://www.adsbexchange.com/", "Public ADS-B flight-data viewer.", ["aviation", "public"]),
        tool("marinetraffic", "MarineTraffic", "transport", "MT", "https://www.marinetraffic.com/", "Public AIS and maritime context.", ["maritime", "public"]),
        tool("vesselfinder", "VesselFinder", "transport", "VF", "https://www.vesselfinder.com/", "Public vessel and port context.", ["maritime", "public"]),
        tool("celestrak", "CelesTrak", "transport", "CE", "https://celestrak.org/", "Orbital elements and satellite data.", ["space", "satellite"]),
        tool("n2yo", "N2YO", "transport", "N2", "https://www.n2yo.com/", "Satellite position and orbital context.", ["space", "satellite"]),
        tool("nasa-firms", "NASA FIRMS", "transport", "NF", "https://firms.modaps.eosdis.nasa.gov/", "Satellite fire and thermal anomaly data.", ["earth", "satellite"]),

        tool("brave-search", "Brave Search", "discovery", "BR", "https://search.brave.com/", "Independent web-search index.", ["search"]),
        tool("duckduckgo", "DuckDuckGo", "discovery", "DD", "https://duckduckgo.com/", "Privacy-focused web search.", ["search"]),
        tool("mojeek", "Mojeek", "discovery", "MJ", "https://www.mojeek.com/", "Independent crawler and web search.", ["search"]),
        tool("startpage", "Startpage", "discovery", "SP", "https://www.startpage.com/", "Privacy-oriented web search.", ["search"]),
        tool("semantic-scholar", "Semantic Scholar", "discovery", "SS", "https://www.semanticscholar.org/", "Academic literature and citation graph.", ["papers", "research"]),
        tool("core-ac", "CORE", "discovery", "CO", "https://core.ac.uk/", "Open-access research discovery.", ["papers", "research"]),
        tool("base-search", "BASE", "discovery", "BA", "https://www.base-search.net/", "Academic search engine for open repositories.", ["papers", "research"]),
        tool("arxiv", "arXiv", "discovery", "AX", "https://arxiv.org/", "Open scientific preprint archive.", ["papers", "research"]),

        tool("uk-web-archive", "UK Web Archive", "archives", "UK", "https://www.webarchive.org.uk/", "UK-focused public web archive.", ["archive", "uk"]),
        tool("arquivo-pt", "Arquivo.pt", "archives", "PT", "https://arquivo.pt/", "Portuguese web archive and research search.", ["archive", "history"]),
        tool("loc-web-archive", "Library of Congress Web Archive", "archives", "LC", "https://www.loc.gov/websites/", "Curated public US web collections.", ["archive", "records"]),
        tool("archivebox", "ArchiveBox", "archives", "AB", "https://archivebox.io/", "Self-hosted local archiving for public web evidence.", ["capture", "local"]),

        tool("domaintools", "DomainTools", "infrastructure", "DT", "https://www.domaintools.com/", "Domain profile and historical context.", ["domains", "commercial"]),
        tool("whoisxml", "WhoisXML API", "infrastructure", "WX", "https://www.whoisxmlapi.com/", "WHOIS, DNS and domain intelligence APIs.", ["domains", "dns"]),
        tool("dnsdb", "DNSDB", "infrastructure", "DB", "https://www.dnsdb.info/", "Passive DNS intelligence.", ["dns", "commercial"]),
        tool("zoomeye", "ZoomEye", "infrastructure", "ZY", "https://www.zoomeye.org/", "Public Internet asset search.", ["assets", "public-exposure"]),
        tool("fofa", "FOFA", "infrastructure", "FF", "https://en.fofa.info/", "Public Internet asset search.", ["assets", "public-exposure"]),
        tool("netlas", "Netlas", "infrastructure", "NL", "https://netlas.io/", "Internet asset search and discovery.", ["assets", "public-exposure"]),
        tool("binaryedge", "BinaryEdge", "infrastructure", "BE", "https://www.binaryedge.io/", "Internet-wide public exposure intelligence.", ["assets", "public-exposure"]),
        tool("leakix", "LeakIX", "infrastructure", "LX", "https://leakix.net/", "Publicly exposed service and leak monitoring.", ["assets", "exposure"]),
        tool("onyphe", "ONYPHE", "infrastructure", "ON", "https://www.onyphe.io/", "Cyber-defence search and data enrichment.", ["assets", "defence"]),
        tool("fullhunt", "FullHunt", "infrastructure", "FH", "https://fullhunt.io/", "Attack-surface intelligence for authorised assets.", ["assets", "authorised"]),
        tool("securityheaders", "SecurityHeaders", "infrastructure", "HD", "https://securityheaders.com/", "Public web security-header review.", ["web", "headers"]),
        tool("mozilla-observatory", "Mozilla Observatory", "infrastructure", "MO", "https://observatory.mozilla.org/", "Website security configuration assessment.", ["web", "headers"]),

        tool("feodo-tracker", "Feodo Tracker", "threat", "FT", "https://feodotracker.abuse.ch/", "Botnet and C2 indicator intelligence.", ["malware", "ioc"]),
        tool("spamhaus", "Spamhaus", "threat", "SH", "https://www.spamhaus.org/", "Domain and IP reputation context.", ["reputation", "dns"]),
        tool("talos-intelligence", "Cisco Talos Intelligence", "threat", "TA", "https://talosintelligence.com/", "Domain, IP and file reputation lookup.", ["reputation", "threat-intel"]),
        tool("anyrun", "ANY.RUN", "threat", "AR", "https://any.run/", "Interactive malware-analysis sandbox.", ["malware", "sandbox"]),
        tool("joesandbox", "Joe Sandbox", "threat", "JS", "https://www.joesecurity.org/", "Malware and suspicious-file analysis.", ["malware", "sandbox"]),
        tool("microsoft-security-intelligence", "Microsoft Security Intelligence", "threat", "MS", "https://www.microsoft.com/en-us/wdsi", "Microsoft threat-research resources.", ["threat-intel", "research"]),

        tool("kartaview", "KartaView", "geospatial", "KV", "https://kartaview.org/", "Open street-level imagery.", ["maps", "imagery"]),
        tool("landsatlook", "LandsatLook", "geospatial", "LL", "https://landsatlook.usgs.gov/", "USGS Landsat imagery access.", ["satellite", "imagery"]),
        tool("ventusky", "Ventusky", "geospatial", "VE", "https://www.ventusky.com/", "Weather visualisation and historic conditions.", ["weather", "verification"]),
        tool("meteoblue", "Meteoblue", "geospatial", "MB", "https://www.meteoblue.com/", "Weather modelling and archive context.", ["weather", "verification"]),
        tool("opentopomap", "OpenTopoMap", "geospatial", "OT", "https://opentopomap.org/", "Topographic open map layer.", ["maps", "terrain"]),
        tool("calctopo", "CalTopo", "geospatial", "CA", "https://caltopo.com/", "Topographic mapping and terrain reference.", ["maps", "terrain"]),
        tool("mediainfo", "MediaInfo", "geospatial", "MI", "https://mediaarea.net/en/MediaInfo", "Local technical metadata for media files.", ["metadata", "local"]),
        tool("ffmpeg", "FFmpeg", "geospatial", "FM", "https://ffmpeg.org/", "Local media inspection and frame extraction.", ["video", "local"]),
        tool("fotoforensics", "FotoForensics", "geospatial", "FF", "https://fotoforensics.com/", "Public image forensic analysis.", ["image", "forensics"]),

        tool("ted-europa", "TED Europa", "entities", "TED", "https://ted.europa.eu/", "European public-procurement notices.", ["procurement", "eu"]),
        tool("contracts-finder", "Contracts Finder", "entities", "CF", "https://www.contractsfinder.service.gov.uk/", "UK public-procurement notices.", ["procurement", "uk"]),
        tool("sam-gov", "SAM.gov", "entities", "SAM", "https://sam.gov/", "US public procurement and entity records.", ["procurement", "us"]),
        tool("world-bank-debarred", "World Bank Debarred Firms", "entities", "WB", "https://www.worldbank.org/en/projects-operations/procurement/debarred-firms", "World Bank public debarment listings.", ["sanctions", "records"]),
        tool("justia", "Justia", "entities", "JU", "https://www.justia.com/", "US legal and case-law research.", ["legal", "records"]),
        tool("wipo-patentscope", "WIPO Patentscope", "entities", "WP", "https://patentscope.wipo.int/", "International patent applications and records.", ["patents", "research"]),
        tool("uspto", "USPTO", "entities", "UP", "https://www.uspto.gov/patents/search", "US patent search.", ["patents", "us"]),
        tool("oecd-data", "OECD Data", "entities", "OE", "https://data.oecd.org/", "Public economic and social data.", ["data", "economics"]),
        tool("eurostat", "Eurostat", "entities", "ES", "https://ec.europa.eu/eurostat/", "European public statistics.", ["data", "eu"]),
        tool("our-world-in-data", "Our World in Data", "entities", "OW", "https://ourworldindata.org/", "Public global data visualisation.", ["data", "research"]),
        tool("undata", "UNData", "entities", "UN", "https://data.un.org/", "United Nations public datasets.", ["data", "global"]),
        tool("imf-data", "IMF Data", "entities", "IMF", "https://www.imf.org/en/Data", "International monetary data and indicators.", ["data", "economics"]),

        tool("mastodon-search", "Mastodon", "presence", "MA", "https://joinmastodon.org/", "Public federated social-source research.", ["social", "public"]),
        tool("bluesky", "Bluesky", "presence", "BS", "https://bsky.app/", "Public social posts and account research.", ["social", "public"]),
        tool("linkedin-company", "LinkedIn Companies", "presence", "LI", "https://www.linkedin.com/", "Public organisation and professional presence.", ["organisations", "public"]),
        tool("twitchtracker", "TwitchTracker", "presence", "TT", "https://twitchtracker.com/", "Public Twitch channel and stream context.", ["video", "public"]),
        tool("socialblade", "Social Blade", "presence", "SB", "https://socialblade.com/", "Public social-channel statistics.", ["social", "data"]),

        tool("obsidian", "Obsidian", "data", "OB", "https://obsidian.md/", "Local research notes and case knowledge base.", ["notes", "local"]),
        tool("linkurious", "Linkurious", "data", "LK", "https://linkurious.com/", "Entity graph investigation platform.", ["graph", "commercial"]),
        tool("ibm-i2", "IBM i2 Analyst's Notebook", "data", "I2", "https://www.ibm.com/products/i2-analysts-notebook", "Structured link analysis for authorised investigations.", ["graph", "commercial"]),
        tool("kumu", "Kumu", "data", "KU", "https://kumu.io/", "Relationship mapping and systems visualisation.", ["graph", "visualisation"]),
        tool("yed", "yEd", "data", "YE", "https://www.yworks.com/products/yed", "Desktop graph editor and diagrams.", ["graph", "local"]),
        tool("csvkit", "CSVKit", "data", "CSV", "https://csvkit.readthedocs.io/", "Command-line tools for tabular evidence.", ["data", "local"]),
        tool("datawrapper-extra", "Flourish", "data", "FL", "https://flourish.studio/", "Data visualisation and storytelling.", ["visualisation", "data"]),

        tool("planefinder", "PlaneFinder", "transport", "PF", "https://planefinder.net/", "Public flight-data context.", ["aviation", "public"]),
        tool("fleetmon", "FleetMon", "transport", "FM", "https://www.fleetmon.com/", "Public vessel and port intelligence.", ["maritime", "public"]),
        tool("aishub", "AISHub", "transport", "AH", "https://www.aishub.net/", "Community AIS data exchange.", ["maritime", "public"]),
        tool("openrailwaymap", "OpenRailwayMap", "transport", "OR", "https://www.openrailwaymap.org/", "Open railway infrastructure map.", ["rail", "maps"]),
        tool("portwatch", "PortWatch", "transport", "PW", "https://unctad.org/topic/transport-and-trade-logistics/portwatch", "Public port and maritime trade context.", ["maritime", "trade"])
    ]);

    const REVIEW_DATE = "2026-07-23";
    const CATEGORY_CAPABILITIES = Object.freeze({
        discovery: ["RESEARCH_DISCOVERY", "SOURCE_VERIFICATION"],
        archives: ["HISTORICAL_ARCHIVE", "EVIDENCE_PRESERVATION", "SOURCE_VERIFICATION"],
        infrastructure: ["INFRASTRUCTURE_CONTEXT"],
        threat: ["THREAT_REPUTATION"],
        geospatial: ["GEOSPATIAL_VERIFICATION", "VISUAL_MEDIA_VERIFICATION", "MEDIA_VERIFICATION"],
        entities: ["ENTITY_RESEARCH"],
        presence: ["PUBLIC_PRESENCE"],
        data: ["DATA_ANALYSIS"],
        transport: ["TRANSPORT_MONITORING"]
    });

    const STANDARD_LEGAL_DISCLAIMER = "External providers retain their own terms, rate limits and access controls. Use only within applicable law, authorization and provider policy.";
    const STANDARD_JURISDICTION_NOTE = "Availability and lawful use can vary by jurisdiction, authorization and the provider's own terms.";

    function normalizeSeed(seed) {
        const commercial = (seed.tags || []).includes("commercial");
        const account = ["shodan", "censys", "virustotal", "whoisxml", "domaintools", "dnsdb", "anyrun", "joesandbox", "linkedin-company"].includes(seed.id);
        const wayback = seed.id === "wayback";
        return Object.freeze({
            id: seed.id,
            name: seed.title,
            shortName: seed.title,
            description: seed.description,
            category: seed.category,
            capabilities: CATEGORY_CAPABILITIES[seed.category] || ["RESEARCH_DISCOVERY"],
            providerType: wayback ? "REST_API" : "EXTERNAL_WEB",
            accessMode: wayback ? "API" : "WEB",
            providerStatus: wayback ? "ACTIVE" : "LINK_ONLY",
            riskProfile: commercial ? "COMMERCIAL" : (account ? "ACCOUNT_REQUIRED" : "PASSIVE"),
            legalStatus: "GENERALLY_LEGAL",
            inputs: wayback ? ["URL", "DOMAIN"] : ["USER_DIRECTED_BROWSER_QUERY"],
            outputs: wayback ? ["SNAPSHOT_AVAILABILITY"] : ["PUBLIC_REFERENCE_CONTEXT"],
            authentication: wayback ? "NOT_REQUIRED" : (account ? "PROVIDER_ACCOUNT_OR_TIER" : "PROVIDER_DEFINED"),
            costModel: wayback ? "PROVIDER_DEFINED" : (commercial ? "COMMERCIAL_OR_PROVIDER_DEFINED" : "PROVIDER_DEFINED"),
            officialUrl: seed.url,
            docsUrl: wayback ? "https://archive.org/help/wayback_api.php" : null,
            publicReferenceUrl: null,
            launchAllowed: !wayback,
            copyUrlAllowed: !wayback,
            integrationAllowed: wayback,
            installationAllowed: false,
            runtimeAdapter: wayback ? "WAYBACK_AVAILABILITY" : "EXTERNAL_WEB",
            referenceReason: "Legitimate public-source entry retained from the existing AegisUi OSINT catalog.",
            legalDisclaimer: STANDARD_LEGAL_DISCLAIMER,
            jurisdictionNote: STANDARD_JURISDICTION_NOTE,
            tags: Object.freeze([...(seed.tags || [])]),
            lastReviewed: REVIEW_DATE,
            sourceConfidence: "VERIFIED_PUBLIC",
            icon: seed.icon,
            featured: Boolean(seed.featuredOrder),
            featuredOrder: Number(seed.featuredOrder || 0)
        });
    }

    const REFERENCE_ONLY_PROVIDERS = Object.freeze([
        Object.freeze({
            id: "cobalt-strike-reference",
            name: "Cobalt Strike",
            shortName: "Cobalt Strike",
            description: "Commercial adversary-emulation software that can appear in defensive reporting and threat-context discussions.",
            category: "threat",
            capabilities: ["THREAT_REPUTATION", "RESEARCH_DISCOVERY"],
            providerType: "REFERENCE",
            accessMode: "REFERENCE_ONLY",
            providerStatus: "REFERENCE_ONLY",
            riskProfile: "HIGH_ABUSE_POTENTIAL",
            legalStatus: "AUTHORIZATION_REQUIRED",
            inputs: [],
            outputs: ["ECOSYSTEM_CONTEXT"],
            authentication: "NOT_APPLICABLE",
            costModel: "NOT_APPLICABLE",
            officialUrl: null,
            docsUrl: null,
            publicReferenceUrl: null,
            launchAllowed: false,
            copyUrlAllowed: false,
            integrationAllowed: false,
            installationAllowed: false,
            runtimeAdapter: "REFERENCE_ONLY",
            referenceReason: "Included only so analysts can recognise the name in public reporting and defensive context. AegisUi intentionally blocks access and operational handling.",
            legalDisclaimer: "This entry is included exclusively for ecosystem recognition, defensive analysis, technical context and informational transparency. Possession, distribution or use may be restricted or unlawful depending on the tool, jurisdiction, authorization and context. AegisUi provides no access, download, installation, configuration, automation, integration or operational instructions.",
            jurisdictionNote: "Authorization and applicable law are required; legal treatment can vary by jurisdiction and context.",
            tags: Object.freeze(["adversary-emulation", "defensive-context", "sensitive"]),
            lastReviewed: REVIEW_DATE,
            sourceConfidence: "VERIFIED_OFFICIAL",
            icon: "CS",
            featured: false,
            featuredOrder: 0
        })
    ]);

    // The only Phase 5 live Geo adapter. Its host, method and parameters are
    // fixed in OpenMeteoGeocodingAdapter; it is not a generic HTTP bridge.
    const GEOSPATIAL_NATIVE_PROVIDERS = Object.freeze([
        Object.freeze({
            id: "open-meteo-geocoding",
            name: "Open-Meteo Geocoding",
            shortName: "Open-Meteo Geo",
            description: "Public place-text geocoding used only after an explicit investigator query to normalize candidate geographic context.",
            category: "geospatial",
            capabilities: ["GEOSPATIAL_VERIFICATION"],
            providerType: "REST_API",
            accessMode: "API",
            providerStatus: "ACTIVE",
            riskProfile: "PASSIVE",
            legalStatus: "GENERALLY_LEGAL",
            inputs: ["PLACE_TEXT"],
            outputs: ["NORMALIZED_GEO_CONTEXT", "PROVIDER_OBSERVATION"],
            authentication: "NONE",
            costModel: "PUBLIC_NO_KEY",
            officialUrl: "https://open-meteo.com/en/docs/geocoding-api",
            docsUrl: "https://open-meteo.com/en/docs/geocoding-api",
            publicReferenceUrl: null,
            launchAllowed: false,
            copyUrlAllowed: false,
            integrationAllowed: true,
            installationAllowed: false,
            runtimeAdapter: "OPEN_METEO_GEOCODING",
            referenceReason: "Approved as the small, no-key public provider set for explicit place-name normalization in the Phase 5 geospatial capability.",
            legalDisclaimer: "AegisUI submits only the place text explicitly entered by the investigator. Provider output is normalized locally and is not retained unless the investigator explicitly promotes a reviewed result to a local case.",
            jurisdictionNote: "Public geocoding availability and geographic names can vary by provider coverage and jurisdiction; results are contextual, not authoritative proof.",
            tags: Object.freeze(["geocoding", "coordinates", "public-api", "native-query"]),
            lastReviewed: REVIEW_DATE,
            sourceConfidence: "VERIFIED_OFFICIAL",
            icon: "OM",
            featured: false,
            featuredOrder: 0
        })
    ]);

    // This provider is local-only. The user selects one supported browser File;
    // the renderer parses bytes in-process and never receives filesystem paths.
    const VISUAL_MEDIA_LOCAL_PROVIDERS = Object.freeze([
        Object.freeze({
            id: "local-media-inspection",
            name: "Local Media Inspection",
            shortName: "Media Inspect",
            description: "Passive metadata inspection for one explicitly selected JPEG, PNG or WebP image. No upload, reverse-image search or background collection.",
            category: "geospatial",
            capabilities: ["VISUAL_MEDIA_VERIFICATION"],
            providerType: "LOCAL_TOOL",
            accessMode: "LOCAL",
            providerStatus: "ACTIVE",
            riskProfile: "PASSIVE",
            legalStatus: "GENERALLY_LEGAL",
            inputs: ["LOCAL_IMAGE"],
            outputs: ["NORMALIZED_MEDIA_METADATA", "ORIGINAL_MEDIA_HASH", "OPTIONAL_GEO_CONTEXT"],
            authentication: "NONE",
            costModel: "LOCAL_ONLY",
            officialUrl: null,
            docsUrl: null,
            publicReferenceUrl: null,
            launchAllowed: false,
            copyUrlAllowed: false,
            integrationAllowed: true,
            installationAllowed: false,
            runtimeAdapter: "LOCAL_TOOL",
            referenceReason: "Built-in passive media metadata inspection. Original bytes remain in the explicit, ephemeral analyst selection and are not persisted by this provider.",
            legalDisclaimer: "AegisUI reads only metadata actually present in one analyst-selected local image. Metadata is contextual and does not establish authenticity, authorship, capture time, location or manipulation.",
            jurisdictionNote: "The analyst remains responsible for lawful possession and handling of the supplied media. No external media service is contacted in this capability.",
            tags: Object.freeze(["metadata", "image", "local", "passive", "sha-256"]),
            lastReviewed: REVIEW_DATE,
            sourceConfidence: "VERIFIED_OFFICIAL",
            icon: "VM",
            featured: false,
            featuredOrder: 0
        })
    ]);

    // Phase 7 uses two narrow fixed adapters. Neither is launchable and neither
    // accepts an endpoint, method, header or credential from the renderer.
    const INFRASTRUCTURE_NATIVE_PROVIDERS = Object.freeze([
        Object.freeze({
            id: "google-public-dns", name: "Google Public DNS", shortName: "Google DNS",
            description: "Bounded public DNS context for one explicitly supplied domain using fixed record types only.",
            category: "infrastructure", capabilities: ["INFRASTRUCTURE_CONTEXT"], providerType: "REST_API", accessMode: "API", providerStatus: "ACTIVE",
            riskProfile: "PASSIVE", legalStatus: "GENERALLY_LEGAL", inputs: ["DOMAIN"], outputs: ["DNS_A", "DNS_AAAA", "DNS_MX", "DNS_NS", "DNS_TXT", "DNS_CNAME", "PROVIDER_OBSERVATION"],
            authentication: "NONE", costModel: "PUBLIC_NO_KEY", officialUrl: "https://developers.google.com/speed/public-dns/docs/doh/json", docsUrl: "https://developers.google.com/speed/public-dns/docs/doh/json", publicReferenceUrl: null,
            launchAllowed: false, copyUrlAllowed: false, integrationAllowed: true, installationAllowed: false, runtimeAdapter: "GOOGLE_DNS_DOH",
            referenceReason: "Approved only for a bounded, analyst-initiated DNS context request against one explicit domain. It does not enumerate names or perform recursive follow-up.",
            legalDisclaimer: "AegisUI sends only the explicitly entered public domain to a fixed public DNS endpoint and normalizes a small fixed record set. DNS observations are contextual and do not establish ownership, identity or authorization.",
            jurisdictionNote: "DNS data can vary by resolver, time and jurisdiction. The result is an observation from this provider, not an attribution finding.",
            tags: Object.freeze(["dns", "passive", "public-api", "fixed-endpoint"]), lastReviewed: REVIEW_DATE, sourceConfidence: "VERIFIED_OFFICIAL", icon: "DNS", featured: false, featuredOrder: 0
        }),
        Object.freeze({
            id: "ripestat-network-info", name: "RIPEstat Network Info", shortName: "RIPEstat",
            description: "Passive ASN and containing-prefix context for one explicitly supplied public IP address.",
            category: "infrastructure", capabilities: ["INFRASTRUCTURE_CONTEXT"], providerType: "REST_API", accessMode: "API", providerStatus: "ACTIVE",
            riskProfile: "PASSIVE", legalStatus: "GENERALLY_LEGAL", inputs: ["PUBLIC_IP"], outputs: ["ASN", "NETWORK_PREFIX", "RIR_CONTEXT", "PROVIDER_OBSERVATION"],
            authentication: "NONE", costModel: "PUBLIC_NO_KEY", officialUrl: "https://stat.ripe.net/docs/data-api/api-endpoints/network-info.html", docsUrl: "https://stat.ripe.net/docs/data-api/api-endpoints/network-info.html", publicReferenceUrl: null,
            launchAllowed: false, copyUrlAllowed: false, integrationAllowed: true, installationAllowed: false, runtimeAdapter: "RIPESTAT_NETWORK_INFO",
            referenceReason: "Approved only for one explicit public-IP network context request. Domain-derived addresses require a separate analyst selection before any network request.",
            legalDisclaimer: "AegisUI sends only the explicitly selected public IP to a fixed RIPEstat endpoint. ASN and prefix observations provide infrastructure context and do not prove operator, ownership or identity.",
            jurisdictionNote: "RIR and allocation data are provider observations that can be incomplete, time-dependent or jurisdiction-dependent.",
            tags: Object.freeze(["asn", "ip", "passive", "public-api", "fixed-endpoint"]), lastReviewed: REVIEW_DATE, sourceConfidence: "VERIFIED_OFFICIAL", icon: "ASN", featured: false, featuredOrder: 0
        })
    ]);

    // Phase 8 deliberately keeps native scholarly access to one DOI → one
    // metadata-record request. URL/source context reuses explicit Wayback
    // checks; no browser scraping, downloads or search endpoint is exposed.
    const RESEARCH_SOURCE_NATIVE_PROVIDERS = Object.freeze([
        Object.freeze({
            id: "crossref-works", name: "Crossref Works", shortName: "Crossref",
            description: "Bounded bibliographic metadata for one explicitly supplied DOI.",
            category: "discovery", capabilities: ["SOURCE_VERIFICATION"], providerType: "REST_API", accessMode: "API", providerStatus: "ACTIVE",
            riskProfile: "PASSIVE", legalStatus: "GENERALLY_LEGAL", inputs: ["DOI"], outputs: ["NORMALIZED_SOURCE_CONTEXT", "PROVIDER_OBSERVATION"],
            authentication: "NONE", costModel: "PUBLIC_NO_KEY", officialUrl: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/", docsUrl: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/", publicReferenceUrl: null,
            launchAllowed: false, copyUrlAllowed: false, integrationAllowed: true, installationAllowed: false, runtimeAdapter: "CROSSREF_WORKS",
            referenceReason: "Approved only for one analyst-initiated DOI metadata retrieval through Crossref's documented works endpoint. It does not search, paginate, download documents or crawl publisher sites.",
            legalDisclaimer: "AegisUI submits only the DOI explicitly entered by the analyst to Crossref. Returned bibliographic metadata is contextual and does not authenticate a document, prove authorship or establish the truth of a claim.",
            jurisdictionNote: "Publisher metadata, licensing and availability can vary. The analyst remains responsible for applying provider terms and applicable law.",
            tags: Object.freeze(["doi", "research", "metadata", "public-api", "fixed-endpoint"]), lastReviewed: REVIEW_DATE, sourceConfidence: "VERIFIED_OFFICIAL", icon: "CR", featured: false, featuredOrder: 0
        }),
        Object.freeze({
            id: "local-pdf-inspection", name: "Local PDF Inspection", shortName: "PDF Inspect",
            description: "Passive local metadata and SHA-256 inspection for one explicitly selected PDF. No upload or original-file persistence.",
            category: "archives", capabilities: ["SOURCE_VERIFICATION"], providerType: "LOCAL_TOOL", accessMode: "LOCAL", providerStatus: "ACTIVE",
            riskProfile: "PASSIVE", legalStatus: "GENERALLY_LEGAL", inputs: ["LOCAL_PDF"], outputs: ["DOCUMENT_METADATA", "ORIGINAL_DOCUMENT_HASH"],
            authentication: "NONE", costModel: "LOCAL_ONLY", officialUrl: null, docsUrl: null, publicReferenceUrl: null,
            launchAllowed: false, copyUrlAllowed: false, integrationAllowed: true, installationAllowed: false, runtimeAdapter: "LOCAL_TOOL",
            referenceReason: "Built-in local PDF metadata inspection. The renderer receives explicit file bytes only and does not persist paths or original documents.",
            legalDisclaimer: "AegisUI extracts only bounded local PDF metadata actually present in one selected file. Metadata is contextual and does not prove authorship, publication, integrity of content or claim accuracy.",
            jurisdictionNote: "The analyst remains responsible for lawful possession and handling of the selected document. No external document service is contacted.",
            tags: Object.freeze(["pdf", "metadata", "local", "passive", "sha-256"]), lastReviewed: REVIEW_DATE, sourceConfidence: "VERIFIED_OFFICIAL", icon: "PDF", featured: false, featuredOrder: 0
        })
    ]);

    // Phase 9 is a local analyst workspace, not a people-search provider. It
    // accepts only observations the analyst explicitly creates or promotes.
    const ENTITY_RESOLUTION_LOCAL_PROVIDERS = Object.freeze([
        Object.freeze({
            id: "local-entity-resolution", name: "Local Entity Resolution", shortName: "Entity Graph",
            description: "Explicit local entity profiles and evidence-backed relationship correlation. No enrichment, people search or network lookup.",
            category: "entities", capabilities: ["ENTITY_RESOLUTION"], providerType: "LOCAL_TOOL", accessMode: "LOCAL", providerStatus: "ACTIVE",
            riskProfile: "PASSIVE", legalStatus: "CONTEXT_DEPENDENT", inputs: ["ANALYST_ENTITY", "NORMALIZED_OBSERVATION", "CASE_EVIDENCE"], outputs: ["ENTITY_PROFILE", "RELATIONSHIP_GRAPH", "ENTITY_EVIDENCE_SNAPSHOT"],
            authentication: "NONE", costModel: "LOCAL_ONLY", officialUrl: null, docsUrl: null, publicReferenceUrl: null,
            launchAllowed: false, copyUrlAllowed: false, integrationAllowed: true, installationAllowed: false, runtimeAdapter: "LOCAL_TOOL",
            referenceReason: "Built-in local entity resolution is limited to analyst-entered or already-normalized investigation observations. It has no provider query or enrichment path.",
            legalDisclaimer: "Entity labels and relationships are analytical context, not proof of identity, ownership, affiliation or legal responsibility. The analyst must review provenance and contradictions.",
            jurisdictionNote: "The analyst is responsible for lawful handling of personal or organizational information. AegisUI does not search, verify or enrich private persons.",
            tags: Object.freeze(["entities", "relationships", "provenance", "local", "passive"]), lastReviewed: REVIEW_DATE, sourceConfidence: "VERIFIED_OFFICIAL", icon: "ER", featured: false, featuredOrder: 0
        })
    ]);

    const PROVIDERS = Object.freeze([
        ...PROVIDER_SEEDS.map(normalizeSeed),
        ...REFERENCE_ONLY_PROVIDERS,
        ...GEOSPATIAL_NATIVE_PROVIDERS,
        ...VISUAL_MEDIA_LOCAL_PROVIDERS,
        ...INFRASTRUCTURE_NATIVE_PROVIDERS,
        ...RESEARCH_SOURCE_NATIVE_PROVIDERS,
        ...ENTITY_RESOLUTION_LOCAL_PROVIDERS
    ]);

    const CATEGORIES = Object.freeze(CATEGORY_DEFINITIONS.map(category => Object.freeze({
        ...category,
        count: PROVIDERS.filter(provider => provider.category === category.id).length
    })));

    const TOOLS = Object.freeze(PROVIDERS.map(provider => Object.freeze({
        id: provider.id,
        title: provider.name,
        category: provider.category,
        icon: provider.icon,
        url: provider.officialUrl,
        description: provider.description,
        tags: provider.tags,
        type: provider.accessMode === "WEB" ? "web" : provider.accessMode === "API" ? "api" : "reference",
        status: provider.providerStatus.toLowerCase(),
        providerType: provider.providerType,
        accessMode: provider.accessMode,
        providerStatus: provider.providerStatus,
        riskProfile: provider.riskProfile,
        legalStatus: provider.legalStatus,
        launchAllowed: provider.launchAllowed,
        copyUrlAllowed: provider.copyUrlAllowed
    })));

    const FEATURED = Object.freeze(PROVIDERS
        .filter(provider => provider.featured)
        .sort((left, right) => left.featuredOrder - right.featuredOrder)
        .map(provider => provider.id));

    ProviderSchema.assertValidRegistry(PROVIDERS, CATEGORIES);

    function getProvider(id) {
        return PROVIDERS.find(provider => provider.id === String(id || "")) || null;
    }

    function getProviders(filters = {}) {
        return PROVIDERS.filter(provider => {
            if (filters.category && provider.category !== filters.category) return false;
            if (filters.providerStatus && provider.providerStatus !== filters.providerStatus) return false;
            if (filters.riskProfile && provider.riskProfile !== filters.riskProfile) return false;
            if (filters.legalStatus && provider.legalStatus !== filters.legalStatus) return false;
            if (filters.capability && !provider.capabilities.includes(filters.capability)) return false;
            return true;
        });
    }

    function getProvidersForCategory(categoryId, filters = {}) {
        return getProviders({...filters, category: categoryId});
    }

    function getCategoryCounts(filters = {}) {
        return Object.freeze(CATEGORIES.reduce((counts, category) => {
            counts[category.id] = getProvidersForCategory(category.id, filters).length;
            return counts;
        }, {}));
    }

    function getFeaturedProviders() {
        return Object.freeze(PROVIDERS
            .filter(provider => provider.featured)
            .sort((left, right) => left.featuredOrder - right.featuredOrder));
    }

    return Object.freeze({
        SCHEMA_VERSION: ProviderSchema.VERSION,
        CATEGORIES,
        PROVIDERS,
        TOOLS,
        FEATURED,
        ENUMS: ProviderSchema.ENUMS,
        RUNTIME_ADAPTERS: ProviderSchema.RUNTIME_ADAPTERS,
        CAPABILITIES: ProviderSchema.CAPABILITIES,
        getProvider,
        getProviders,
        getProvidersForCategory,
        getCategoryCounts,
        getFeaturedProviders,
        validate: () => ProviderSchema.validateRegistry(PROVIDERS, CATEGORIES),
        policy: ProviderPolicy
    });
});

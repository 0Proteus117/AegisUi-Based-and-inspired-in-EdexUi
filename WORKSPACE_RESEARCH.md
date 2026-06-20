# Workspace research

Research base for the modular workspaces introduced in EdexUi-Eng 1.4.0.
The objective is not to place every possible service on screen. Each mode
should show a small number of signals that help its user decide what to do
next, then provide deliberate shortcuts to specialist tools.

This phase implements the workspace architecture, the navigation, a developed
ENGINEER foundation and structured placeholders for the remaining profiles.
Authenticated services, live feeds and third-party APIs are intentionally left
for later phases.

## Shared design principles

- Keep the HUB mounted while another workspace is visible. This preserves the
  map, Calendar, Music and project state.
- Prefer read-only summaries before write-capable integrations.
- Keep credentials in the operating system keychain or the app's private local
  configuration, never in source-controlled files.
- Make every external source visible and understandable. A cockpit should not
  become an unexplained algorithmic feed.
- Load expensive integrations only when their workspace is opened.
- Allow links and tools to be configured independently from their visual
  components.
- Use notifications sparingly. The value of the interface is signal, not
  interruption.

---

## ENGINEER

### Target user

Mechanical engineers and technical project owners who move between design,
simulation, manufacturing, technical documentation and project coordination.
The initial emphasis is mechanical engineering, while the structure remains
usable for adjacent engineering disciplines.

### Typical tasks

- Create and review CAD assemblies, drawings and revisions.
- Prepare CAM operations or additive-manufacturing jobs.
- Run structural, thermal or fluid simulations and compare results.
- Search papers, technical reports, material properties and standards.
- Track requirements, milestones, design decisions and blocked work.
- Maintain code, scripts, documentation and automation in Git repositories.

### Main needs

- One view of active projects and their next technical milestone.
- Fast launch of locally installed CAD, CAE, CFD and manufacturing tools.
- Reliable access to research, documentation and standards.
- A future result queue for long simulations or manufacturing operations.
- Clear separation between project status and specialist engineering data.

### Common tools and services

- Autodesk Fusion for integrated CAD, CAM, CAE, electronics and collaboration.
- SOLIDWORKS or FreeCAD for parametric mechanical design.
- Ansys Fluent, OpenFOAM, SimScale and ParaView for simulation and CFD.
- MATLAB or engineering notebooks for calculations and data analysis.
- Bambu Studio and other slicers for additive manufacturing.
- GitHub Projects and GitHub Actions for planning, documentation and automation.
- ASME, ISO, NIST and discipline-specific repositories for standards and
  references.

### Useful quick view

- Active and blocked milestones.
- Project progress and the next gate or review.
- Simulation status, elapsed time and failed jobs.
- Recently changed CAD revisions.
- Manufacturing queue and material availability.
- New papers or reports from selected technical sources.

### Recommended widgets

1. Engineering project status, backed by the existing HUB projects.
2. CAD / CAE / simulation application launchpad.
3. Configurable sector and technical-report source list.
4. Research and documentation links.
5. Standards and reference links.
6. Future technical toolbox for units, tolerances and material properties.

### Recommended quick actions

- Installed CAD/CAE applications.
- GitHub and GitHub Docs.
- Google Scholar and ASME Digital Collection.
- OpenFOAM resources.
- ASME Codes & Standards, ISO Engineering and NIST.

### Future integrations

- RSS/Atom feeds with per-source enable/disable controls.
- Read-only GitHub project status and workflow results.
- Local watchers for CAD exports and revision folders.
- Simulation job monitors with explicit adapters per solver.
- Unit, tolerance, fastener and material calculators.
- Local engineering notebooks and decision logs.

### Implementation priority

1. Project status and application launcher.
2. Configurable research, standards and news sources.
3. Technical calculators that work fully offline.
4. Read-only GitHub and simulation integrations.
5. CAD revision and manufacturing watchers.

### Risks and things to avoid

- Presenting an approximate calculation as a validated engineering result.
- Reproducing standards content that requires a licence.
- Treating a simulation completion state as proof that its model is valid.
- Uploading proprietary CAD, project or material data to external services
  without explicit user action.
- Polling local files or solver processes continuously when the workspace is
  not visible.

### Primary references

- [Autodesk Fusion overview](https://www.autodesk.com/products/fusion-360/overview)
- [Ansys Fluent](https://www.ansys.com/products/fluids/ansys-fluent)
- [OpenFOAM resources](https://openfoam.org/resources/)
- [ASME Digital Collection](https://asmedigitalcollection.asme.org/)
- [ASME Codes & Standards](https://www.asme.org/codes-standards)
- [ISO engineering sector](https://www.iso.org/sectors/engineering)
- [GitHub Projects](https://docs.github.com/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)
- [GitHub Actions](https://docs.github.com/actions)

---

## OSINT / ANALYST

### Target user

Researchers and analysts conducting lawful investigations with public
information. The workspace is for discovery, verification, provenance and
organization; it is not an offensive-security console.

### Typical tasks

- Search the open web and compare multiple sources.
- Verify dates, locations, media and claims.
- Examine public domain, certificate and infrastructure context.
- Consult maps, satellite imagery, transport data and public records.
- Recover historical versions of web pages.
- Keep findings, source URLs, timestamps and confidence notes together.
- Monitor a defined set of news and public sources.

### Main needs

- A repeatable research path instead of a wall of unrelated links.
- Strong provenance: source, access time, archive link and analyst notes.
- Separate observations from inference.
- A case-oriented notebook with tags and an exportable chronology.
- Legal and ethical boundaries visible in the interface.

### Common tools and services

- Bellingcat's Online Investigation Toolkit for categorized discovery.
- Search engines and source-specific searches.
- OpenStreetMap and satellite/map services for geospatial verification.
- Wayback Machine for historical web pages.
- VirusTotal for public URL, domain and IP reports.
- Censys for internet-host, service and certificate context.
- Notes, spreadsheets and graph tools for organizing findings.

### Useful quick view

- Active cases and unanswered questions.
- Recent sources with confidence and provenance.
- Timeline of findings.
- Saved maps and locations.
- Changes from monitored public pages or feeds.
- Items awaiting verification by a second source.

### Recommended widgets

- Search launchpad grouped by purpose.
- Geospatial verification panel.
- Domain and infrastructure context panel.
- Findings notebook and source ledger.
- Timeline and archive snapshot panel.
- Source/news monitor with explicit per-source configuration.

### Recommended quick actions

- Bellingcat Toolkit.
- Wayback Machine.
- VirusTotal search.
- Censys Search.
- Maps and public-record portals selected for the current case.

### Future integrations

- Local case folders with structured notes and source metadata.
- One-click archive lookup without automatic bulk collection.
- Screenshot hashing and a local chain-of-custody log.
- Entity and relationship graph generated from user-entered facts.
- Read-only feeds for selected public sources.

### Implementation priority

1. Categorized launchpad and case notes.
2. Source provenance and timeline.
3. Archive and map helpers.
4. Read-only public-data connectors.
5. Evidence export.

### Risks and things to avoid

- Credential theft, bypassing access controls or intrusive scanning.
- Stalking, doxxing or targeting private individuals.
- Treating VirusTotal or Censys data as a verdict without context.
- Losing provenance when copying information between tools.
- Automatically sending sensitive case data to third parties.
- Hiding legal or jurisdictional limitations behind a generic disclaimer.

### Primary references

- [Bellingcat Online Investigations Toolkit](https://www.bellingcat.com/resources/2024/09/24/bellingcat-online-investigations-toolkit/)
- [Censys](https://censys.com/)
- [Censys platform datasets](https://docs.censys.com/docs/dataset-differences-legacy-search-censys-platform)
- [VirusTotal API overview](https://docs.virustotal.com/reference/overview)
- [VirusTotal reports](https://docs.virustotal.com/docs/results-reports)
- [Wayback Machine](https://web.archive.org/)

---

## STUDENT

### Target user

University students balancing classes, assignments, exams, papers, long-term
projects and personal study systems.

### Typical tasks

- Check course announcements, assignments and deadlines.
- Plan study sessions around an academic calendar.
- Search, read and annotate papers.
- Build and maintain a bibliography.
- Draft, revise and proofread written work.
- Convert notes into flashcards and review them with spaced repetition.
- Track progress on dissertations, final projects and group work.

### Main needs

- One deadline view across course platforms and calendars.
- A reading queue connected to notes and bibliography.
- Quick access to current modules instead of a generic Moodle home page.
- A clear distinction between capture, study, writing and submission.
- Low-friction review counts without turning the cockpit into a guilt machine.

### Common tools and services

- Moodle or the institution's learning-management system.
- Google Scholar for scholarly discovery, alerts and citation export.
- Zotero for collecting, organizing, annotating and citing sources.
- Anki for spaced-repetition review.
- Word, Google Docs or another writing environment.
- Grammar and style tools appropriate to the institution's privacy rules.
- Calendar and note applications.

### Useful quick view

- Deadlines in the next seven and thirty days.
- Today's classes and study blocks.
- Unread course announcements.
- Papers waiting to be read or annotated.
- Bibliography items missing metadata.
- Flashcards due today.
- Progress toward the next dissertation or project milestone.

### Recommended widgets

- Academic deadline timeline.
- Course and announcement summary.
- Paper reading queue.
- Bibliography health.
- Writing project status.
- Flashcard review count.
- Academic calendar.

### Recommended quick actions

- Institution Moodle or LMS.
- Google Scholar.
- Zotero.
- Anki.
- Current writing document and course folders.

### Future integrations

- Moodle calendar feeds or official web-service APIs.
- Zotero local/API library summaries.
- AnkiConnect review counts, only while Anki is running.
- Academic-calendar import.
- Local paper inbox with PDF metadata and reading state.

### Implementation priority

1. Calendar and deadlines.
2. Course launchpad and paper queue.
3. Zotero and writing status.
4. Anki review summary.
5. LMS announcements.

### Risks and things to avoid

- Storing university passwords or scraping authenticated pages.
- Uploading unpublished work or private papers to unapproved services.
- Generating citations without checking their bibliographic metadata.
- Encouraging notification overload.
- Presenting AI-generated text as original academic work.

### Primary references

- [Moodle Calendar](https://docs.moodle.org/en/Using_Calendar)
- [Moodle Timeline block](https://docs.moodle.org/en/Timeline_block)
- [Google Scholar](https://scholar.google.com/)
- [Google Scholar help](https://scholar.google.com/intl/en/scholar/help.html)
- [Zotero](https://www.zotero.org/)
- [Zotero quick start](https://www.zotero.org/support/quick_start_guide)
- [Anki background](https://docs.ankiweb.net/background.html)
- [Anki manual](https://docs.ankiweb.net/)

---

## ARTIST

### Target user

Visual artists, photographers, designers and 3D creators who need inspiration,
asset organization and production context without covering the screen in
social feeds.

### Typical tasks

- Collect references and build moodboards.
- Edit photographs and raster artwork.
- Create vector graphics and layouts.
- Model, texture, light and render 3D work.
- Organize project files, fonts, brushes, textures and other assets.
- Maintain palettes and visual direction.
- Prepare portfolio updates and publishing checklists.

### Main needs

- Fast access to the current creative project and its assets.
- A bounded reference board that does not become an endless feed.
- Consistent colour and export information.
- Visibility of render/export progress.
- A safe distinction between owned, licensed and reference-only assets.

### Common tools and services

- Photoshop for raster editing and compositing.
- Lightroom or Lightroom Classic for photographic catalogues and development.
- Illustrator for vector graphics.
- Blender for modelling, animation, simulation, compositing and rendering.
- Pinterest for visual discovery and boards.
- Behance or another portfolio platform for presentation and discovery.
- Local asset folders and font/brush managers.

### Useful quick view

- Current project, phase and next deliverable.
- Recent assets and reference board.
- Active palette with colour values.
- Render or export queue.
- Portfolio items awaiting descriptions, credits or publication.

### Recommended widgets

- Moodboard.
- Asset-folder shortcuts and recent files.
- Palette and contrast quick view.
- Creative project timeline.
- Render/export queue.
- Portfolio and publishing checklist.

### Recommended quick actions

- Photoshop, Lightroom, Illustrator and Blender.
- Current asset folders.
- Pinterest boards.
- Behance portfolio.
- Export destinations.

### Future integrations

- Local drag-and-drop moodboards.
- Palette extraction from local images.
- Asset tags, licences and usage notes.
- Blender render status.
- Portfolio publishing checklist and local preview.

### Implementation priority

1. Creative application and folder launcher.
2. Local moodboard and palette.
3. Asset metadata and licensing notes.
4. Render/export status.
5. Portfolio integrations.

### Risks and things to avoid

- Republishing copyrighted reference images.
- Losing licence and attribution information for assets.
- Sending unpublished client work to cloud services automatically.
- Using social engagement metrics as the main creative signal.
- Assuming display colour is calibrated.

### Primary references

- [Adobe Creative Cloud](https://www.adobe.com/creativecloud.html)
- [Lightroom and Photoshop workflows](https://www.adobe.com/creativecloud/photography/lightroom-vs-photoshop.html)
- [Blender features](https://www.blender.org/features/)
- [Pinterest guide](https://help.pinterest.com/en/guide/all-about-pinterest)
- [Behance](https://www.behance.net/)
- [Introduction to Behance](https://help.behance.net/hc/en-us/articles/204483894-Guide-Intro-to-Behance)

---

## BUSINESS

### Target user

Founders, managers, analysts and operations leads who need a concise view of
schedule, performance, markets, communications and delivery.

### Typical tasks

- Review calendar, priorities and pending decisions.
- Monitor a small set of KPIs against targets.
- Track operations, sales or project delivery.
- Follow selected market and economic indicators.
- Communicate through email, Teams, Slack or other approved channels.
- Review documents, tasks and meeting follow-ups.

### Main needs

- Decision-relevant signals with their source and refresh time.
- A single agenda across meetings, tasks and follow-ups.
- KPI trends and exceptions, not decorative numbers.
- Separation between personal portfolio information and company performance.
- Communication summaries that preserve privacy and context.

### Common tools and services

- Calendar and email.
- Microsoft Teams, Slack and approved messaging tools.
- Power BI or another business-intelligence platform.
- Task and project-management systems.
- SEC EDGAR for company filings.
- FRED for economic time series.
- Financial-market data from a licensed provider when real-time data is needed.

### Useful quick view

- Today's meetings and required preparation.
- Decisions and tasks awaiting an owner.
- KPI value, target, trend and last refresh.
- Operational exceptions or blocked projects.
- A deliberately small market watchlist.
- Important unread communications.

### Recommended widgets

- Executive agenda.
- KPI cards with target and trend.
- Operations and project status.
- Market/economic watchlist.
- Communication queue.
- Decision and follow-up list.
- Recent documents.

### Recommended quick actions

- Teams, Slack and Outlook.
- Task/project system.
- Power BI dashboard.
- SEC EDGAR.
- FRED.
- Approved document repositories.

### Future integrations

- Read-only Power BI or KPI connectors.
- Calendar and email action summaries.
- Market data with visible provider and delay.
- Portfolio performance separated from business operations.
- Meeting-preparation packets and decision logs.

### Implementation priority

1. Agenda, tasks and project status.
2. KPI cards with explicit data freshness.
3. Communication queue.
4. Economic and market watchlist.
5. Document and meeting-preparation integrations.

### Risks and things to avoid

- Showing delayed market data as real time.
- Giving financial advice or implying guaranteed performance.
- Exposing confidential KPIs, messages or documents.
- Reducing complex performance to a single colour without context.
- Pulling entire mail or chat histories when a local summary is sufficient.
- Creating an always-on notification wall.

### Primary references

- [Power BI KPI visual](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-kpi)
- [Power BI visualization guidance](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualizations-overview)
- [Slack workflow automation](https://slack.com/features/workflow-automation)
- [Microsoft Teams collaboration](https://www.microsoft.com/en-us/microsoft-teams/collaboration)
- [SEC EDGAR search](https://www.sec.gov/search-filings)
- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [FRED](https://fred.stlouisfed.org/)
- [FRED API](https://fred.stlouisfed.org/docs/api/fred/)

---

## Architecture consequences

The research suggests a shared shell with profile-specific definitions rather
than six independent applications. Every definition therefore contains:

- identity, description and implementation state;
- categories;
- quick actions;
- recommended tools;
- widget definitions;
- future modules.

The renderer consumes these definitions and creates workspace views lazily.
The HUB remains a preserved legacy view, while the other workspaces can grow
through new widget renderers without adding more responsibilities to the HUB's
`EngineeringDashboard` class.

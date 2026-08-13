# STUD Tool Catalog

## Scope

STUD Tool Catalog is a versioned, application-owned directory of Aegis capabilities, optional local engines, external desktop/web tools, academic services and learning/reference resources. It is local metadata, not a marketplace, installer, recommendation service or remote configuration system.

The shipped registry is `src/classes/workspaces/studToolCatalog.registry.js`. Registry version `1.0.0` is validated at load time for stable unique IDs, allowed enums, known disciplines, valid HTTPS launch URLs, native navigation targets and pack composition.

## What each entry discloses

- type and integration depth;
- availability as observed by Aegis, not a claim that every external tool is installed;
- cost classification;
- offline and privacy posture;
- account requirement, open-source status and licence when known;
- disciplines, capabilities, verification date/note and curated alternatives.

`UNKNOWN` and `LICENSE_REVIEW` are deliberate honest states. Commercial terms are volatile: the registry records a category rather than a price and links the official source for user review.

## Cost and ordering

The default order is native Aegis, free/open/local, free/open, free online, freemium, institution-licensed, paid one-time, paid subscription, trial/paywall, then unknown. An explicit local discipline profile can raise relevant items within the list. It never infers a profile from Notes, documents, email or any private material.

`FREEMIUM_LIMITED` is never included by the `FREE ONLY` filter. It remains visible with an amber limitation badge. The initial DeepL entry is deliberately marked `FREEMIUM_LIMITED`, `ONLINE_REQUIRED` and `CLOUD_PROCESSING`; the registry does not upload text or use its API.

## Integration and launch

Native entries navigate to an existing STUD surface. External launch receives only a trusted registry entry ID. The main-process catalog service resolves that ID to a prevalidated HTTPS URL; the renderer cannot provide a URL, scheme, headers, method or command. `REFERENCE_ONLY` and learning entries are metadata only unless an approved website launch is explicitly present.

There is no automatic catalog update, browser scraping, affiliate URL, installation, download, shell execution, provider chaining or remote recommendation path.

## Preferences and packs

The registry itself is immutable application metadata. SQLite schema v13 stores only explicit local user choices in `stud_tool_preferences` and `stud_discipline_profile`:

- favorite;
- hide;
- pin;
- explicit `MARK USED` after an approved launch;
- ranked discipline profile.

Hidden is not deletion; reset removes preferences, not registry entries. Packs are curated groupings that reference stable entry IDs. They never install dependencies or mutate the academic model.

## Privacy and offline boundaries

Catalog browsing, search, filters, packs and ranking run from the shipped registry with no network requirement. External sites naturally require network when the user explicitly opens them. Aegis neither sends a discipline profile nor records usage analytics. No localStorage store is used for canonical catalog preferences.

## Adding an entry

1. Add a stable lowercase ID to the versioned registry.
2. Supply every normalized disclosure field; use `UNKNOWN` where evidence is insufficient.
3. Use only a canonical HTTPS website/repository URL and set `launchAllowed` only for a trusted website URL.
4. Classify freemium/paywall restrictions honestly.
5. Add relevant many-to-many discipline/capability tags without making the STUD core discipline-specific.
6. Run `scripts/test-stud-tool-catalog.js` and the broader STUD checks.

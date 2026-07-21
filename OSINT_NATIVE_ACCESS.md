# OSINT Native Access Foundation

v2.3.0 establishes the first access layer for the AegisUi OSINT Analyst Deck.
It is intentionally limited to user-directed, public-source discovery.

## Access modes

| Mode | Behaviour |
| --- | --- |
| `NATIVE API` | AegisUi queries an official provider endpoint from the local main process and renders a cockpit-native result panel. |
| `EMBEDDED WEB` | The selected public source opens in an isolated Electron `WebContentsView` inside AegisUi. |
| `EXTERNAL BROWSER` | A visible fallback that opens the source in the user's browser when requested. |

The initial native provider is **Wayback Availability**. It makes a
user-triggered request to Internet Archive's public availability endpoint and
shows the closest available snapshot. It requires no stored key.

## Isolated web sources

Discovery/Search sources run in a separate persisted Electron session with:

- `nodeIntegration: false`;
- `contextIsolation: true`;
- sandboxing enabled;
- no permission grants;
- an allowlist of approved HTTPS source domains;
- no AegisUi renderer APIs, filesystem access or command access.

The embedded surface is a source's own website, not a claim that the site has
become a native AegisUi API. Links that leave an allowlisted source open in the
normal browser instead.

## API keys and later providers

This phase does not include third-party keys, scraping, credential capture,
background collection or automatic searches. Future official APIs must use a
key owned and configured by the user, stored only in local user configuration,
and expose clear states such as `KEY REQUIRED`, `READY`, `RATE LIMITED` and
`SOURCE UNAVAILABLE`.

## Scope

Active in this phase:

- Discovery / Search domain;
- Wayback Availability native lookup;
- Bellingcat Toolkit, Google, Bing, DuckDuckGo, Yandex, Google Scholar, OSINT
  Framework and IntelTechniques as isolated public web sources.

The remaining Analyst Deck domains are visible as staged navigation only. They
are intentionally not represented as working integrations until their specific
provider and security requirements have been implemented and tested.

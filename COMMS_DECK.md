# COMMS Deck

The `COMMS` workspace is a shared communications deck for AegisUi. It is
available beside `HUB`, `ENGINEER`, `OSINT`, `STUDENT`, `ARTIST` and
`BUSINESS`.

This first version is intentionally conservative: it provides safe launchers
and local placeholders, not deep account integrations.

## Current behavior

COMMS currently includes external HTTPS launchers for:

- WhatsApp Web;
- Slack;
- Microsoft Teams;
- Discord;
- Gmail;
- Outlook;
- LinkedIn;
- Instagram;
- X / Twitter.

The workspace also includes:

- a placeholder panel for unified notifications;
- a local communication-status panel showing `ONLINE`, `OFFLINE`,
  `LOGIN REQUIRED` and `EXTERNAL` states.

## WhatsApp policy

The WhatsApp entry opens WhatsApp Web only.

AegisUi does not:

- read personal chats;
- scrape WhatsApp Web;
- automate a session;
- store WhatsApp cookies;
- store WhatsApp credentials;
- use unofficial WhatsApp APIs.

Real official WhatsApp integration is only appropriate through the WhatsApp
Business Cloud API, which is designed for business accounts and requires
Meta-approved setup, tokens and webhooks. That is a future business integration,
not part of this launcher foundation.

## Webviews

Embedded webviews are disabled for now.

If a future version adds optional webviews, it must first review:

- Electron `webview` permissions;
- session partitioning;
- cookie/session storage boundaries;
- navigation allowlists;
- preload isolation;
- disabled Node.js integration;
- context isolation;
- external link handling;
- provider terms of service.

Until then, COMMS opens services in the default browser through safe HTTPS
links.

## Security boundaries

COMMS must not:

- commit cookies, sessions, tokens or credentials;
- scrape provider UIs;
- execute remote code inside AegisUi;
- bypass provider login flows;
- store personal message data in the repository;
- use unofficial APIs for private accounts.

Provider sessions remain owned by the browser or by each provider's native app.

## Future integrations

Possible future work:

- local macOS notification bridge;
- optional isolated webview experiment;
- Outlook/Gmail official APIs with explicit user consent;
- Slack/Teams official API status widgets;
- WhatsApp Business Cloud API for business accounts only;
- unified notification summaries stored locally.

Every future integration should be opt-in, documented and safe when offline or
logged out.

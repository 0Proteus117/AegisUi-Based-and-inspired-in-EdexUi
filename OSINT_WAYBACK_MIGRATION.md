# OSINT Wayback Migration

The former Wayback-related legacy implementation remains in `_boot.js` but is
not used by the modern Analyst Desk. Phase 3 adds a separate modern adapter
that reads the normalized `wayback` provider record and makes a fixed,
user-initiated Availability API request from the renderer.

This is not a legacy reconnection:

- no `osint-native-query` use;
- no `osint-source-*` use;
- no WebContentsView use;
- no new IPC;
- no generic webview or browser proxy;
- no old controller import.

The panel provides a manual URL/domain field, validates it locally, shows
loading/cancel/empty/error/success state and never auto-opens a snapshot.

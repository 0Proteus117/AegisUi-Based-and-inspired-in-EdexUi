# Developer Classic Deck

`DEVELOPER` is the workspace that preserves the original eDEX-UI spirit:
terminal, system context, code, Git, scripts, logs and development health.

The v1.7.0 foundation is intentionally safe and mostly read-only. It is built
to feel useful every day without turning the cockpit into an unsafe command
launcher.

## Modules

### Terminal bridge

The deck shows the current terminal context and provides a `FOCUS HUB TERMINAL`
button. The actual interactive terminal remains the existing eDEX terminal so
the app does not create extra shells or duplicate terminal backends.

Fallback: if terminal state is not available, the panel reports that safely.

### Git Status

The Git panel reads:

- current branch;
- last commit;
- modified file count;
- clean/dirty status;
- a capped list of modified files.

Git actions such as commit/push are placeholders in this foundation. AegisUi
does not commit or push automatically.

### Quick Scripts

Scripts are detected from the active project's `package.json`.

Favorite scripts are read from local config:

```json
{
  "favoriteScripts": ["start", "dev", "test", "build"]
}
```

In v1.7.0, clicking a script does not execute it. The UI explains that script
execution is disabled until a future confirmed runner exists.

### Logs / Console Output

The logs panel currently shows local Developer Deck operational notes and
safety state. Future versions can attach explicit script output or process
logs after a confirmed runner is added.

### Project Structure

The structure panel shows a small curated set of important project paths:

- README;
- changelog;
- security/config docs;
- package manifests;
- `src`;
- `tools`;
- `build`.

It intentionally avoids huge recursive trees. Sensitive files such as `.env`,
keys, tokens and credentials are blocked.

### Dependency / Health

The health panel shows:

- Node version;
- Electron version;
- Chrome version;
- npm version if available;
- package-lock presence;
- node_modules presence;
- dependency counts;
- audit placeholder.

Automatic dependency auditing is not run on every render to avoid heavy work
and surprise network or CPU use.

## Local configuration

The app creates:

```text
~/Library/Application Support/EdexUi-Eng/developer-deck.json
```

For first-run setup you can also set `AEGISUI_DEVELOPER_PROJECT` in your
private `.env`, then fine-tune the generated local JSON file later.

Example:

```json
{
  "version": 1,
  "activeProjectPath": "/Users/you/Projects/my-project",
  "favoriteScripts": ["start", "dev", "test", "build"],
  "maxModifiedFiles": 30
}
```

Use `developer-deck.example.json` as a safe template.

## Security boundaries

Developer Deck must not:

- execute arbitrary commands by default;
- run destructive commands automatically;
- commit, push or mutate Git state automatically;
- open `.env`, keys, token files or credential files;
- expose tokens in the UI;
- scan huge file trees by default;
- weaken Electron isolation.

Read-only commands used by the foundation are limited to Git status/log,
package metadata and runtime version checks.

## Future work

Possible future modules:

- confirmed script runner with per-command allowlist;
- process monitor for dev/build tasks;
- terminal profiles;
- safe Git action queue with explicit confirmation;
- dependency audit snapshots;
- log capture from approved scripts.

Any command execution should require a clear allowlist and explicit user
confirmation.

# Agent Command Deck

`AGENT COMMAND` is a control-room workspace for programming assisted by
configurable AI-style agents.

The v1.8.0 foundation is deliberately local, visual and approval-first. It does
not connect to AI providers, execute commands, write files or commit code. The
goal is to define the cockpit, roles, task routing and safety model before any
real autonomy exists.

## Objective

Agent Command is not a single chat window. It is a coordination deck with:

- multiple configurable agent windows;
- a central task board;
- visible agent status;
- explicit permission levels;
- local prompts and context notes;
- a human approval flow.

## Local architecture

The app creates:

```text
~/Library/Application Support/EdexUi-Eng/agent-command.json
```

That file stores agent definitions, placeholder output, task-board items and
approval-flow notes. It is local app data and must not be committed to GitHub.

Use `agent-command.example.json` as a safe template.

## Initial agents

The default deck includes:

- Architect Agent: architecture, dependencies, structure and design risk.
- Builder Agent: implementation drafts only; no automatic file writes.
- Reviewer Agent: inconsistencies, regressions and maintainability.
- Security Agent: secrets, permissions, Electron/webview/API risk.
- Tester Agent: validation plans and failure scenarios.
- Docs Agent: README, changelog and configuration docs.
- UX Agent: navigation, visual coherence, feedback and legibility.
- Performance Agent: CPU, RAM, polling, timers, leaks and render cost.

## Agent fields

Each agent can define:

- `id`;
- `name`;
- `role`;
- `description`;
- `basePrompt`;
- `permissionLevel`;
- `permissions`;
- `status`;
- `assignedContext`;
- `provider`;
- `history`;
- `output`.

Do not store private secrets, raw credentials, `.env` contents, tokens or
sensitive account data in prompts, history or output.

## Status values

Agent statuses:

- `IDLE`
- `WAITING`
- `THINKING`
- `REVIEWING`
- `DONE`
- `ERROR`
- `DISABLED`
- `NOT CONFIGURED`

Task statuses:

- `BACKLOG`
- `ACTIVE`
- `WAITING REVIEW`
- `APPROVED`
- `REJECTED`
- `DONE`
- `BLOCKED`

Task types:

- `ARCHITECTURE`
- `BUILD`
- `REVIEW`
- `SECURITY`
- `TESTING`
- `DOCUMENTATION`
- `UX`
- `PERFORMANCE`

## Permission levels

Only levels 0 and 1 are enabled in v1.8.0.

| Level | Name | Current behavior |
| --- | --- | --- |
| 0 | READ ONLY | Reads selected/local context notes and proposes. |
| 1 | DRAFT | Drafts text or future diff proposals only; does not touch files. |
| 2 | APPLY WITH APPROVAL | Future only; disabled in this phase. |
| 3 | LIMITED AUTONOMY | Future only; disabled in this phase. |
| 4 | FULL AUTONOMY | Not implemented. |

The generated `permissions` object is explicit about blocked capabilities:
`canApplyChanges`, `canRunCommands`, `canCommit`, `canPush` and
`canShareCloudContext` are all `false` in this phase.

## Task Board

The Task Board stores local tasks with:

- title;
- priority;
- type;
- status;
- assigned agent;
- result text.

Current safe actions:

- copy result to clipboard;
- copy selected agent prompt/output to clipboard;
- mark a task as reviewed;
- route a task to the next agent.

Routing a task only changes local task metadata. It does not call an AI model
or execute work.

## Approval flow

Example future flow:

1. Architect identifies cause and boundaries.
2. Builder drafts the solution.
3. Reviewer checks regression risk.
4. Tester proposes validation.
5. Security checks secrets and permissions.
6. User explicitly approves.
7. A future apply step may be allowed only after confirmation.

In v1.8.0, the flow stops at local proposals and task routing.

## Security boundaries

Agent Command must not:

- store API keys or tokens in Git;
- store private credentials in local shared examples;
- run shell commands automatically;
- write project files automatically;
- commit or push automatically;
- send code or local context to cloud services without explicit future
  confirmation;
- include `.env` contents in history or prompts;
- upload private agent histories.

The current implementation has no external AI provider adapter and no network
calls.

## Future roadmap

Future phases may add, after explicit design and safety review:

- modular AI provider adapters;
- selected-context packaging and redaction;
- prompt execution through user-provided API keys;
- generated diffs as text;
- apply-with-approval workflow;
- test execution with confirmation;
- automated review checklists;
- GitHub Issues integration;
- Codex or other agent handoff.

The important rule remains: the human stays in command.

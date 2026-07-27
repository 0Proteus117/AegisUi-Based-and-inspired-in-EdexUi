# OSINT Query Context

Every live query receives an ephemeral `QueryContext`:

`requestId`, `providerId`, `capability`, `startedAt`, `locale`, `timezone`,
`networkAllowed`, `userInitiated`, `abortSignal`, `sessionId` and `privacyMode`.

Execution requires `userInitiated: true` and the central policy must approve
the provider. The context intentionally contains no user identity, memory,
credentials, cookies, browsing history, workspace path or persistent case ID.

The runtime creates an `AbortController` per request. `CANCEL` aborts that
specific request. Switching provider or leaving the OSINT workspace also
cancels an active query. No global polling or long wait is used.

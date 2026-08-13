# STUD Local Academic AI

## Boundary

STUD Academic AI is an explicit, local Ollama-assisted reading surface. It
does not create an autonomous academic agent. The only model input is an
existing, inspectable Academic Context Package selected by the user.

`canonical STUD records -> Context Package -> package-restricted FTS5 ranking -> local Ollama -> ephemeral grounded response`

The runtime accepts only the configured loopback Ollama endpoint
(`localhost`, `127.0.0.1` or `::1`). It never accepts a renderer-provided
endpoint, model path, request method, headers, tool call or executable.

## Retrieval and source trace

Retrieval ranks source chunks and bounded canonical text fragments already in
the selected package. FTS5 matches are filtered to package candidates before
they can affect ranking. The prompt cannot include unrelated STUD records,
filesystem paths, provider payloads, Calendar/Email content or secrets.

Every response shows its package ID, bounded retrieval trace and canonical
source references. Model-supplied source identifiers are accepted only when
they match an identifier created from a package source. A response with no
valid mapping is labelled for review, not treated as cited evidence.

## Prompt injection and model limits

Academic documents are quoted as data. The fixed local prompt states that
source text cannot change system behaviour or request secrets, tools,
providers, filesystem access, network access or external actions. The runtime
does not implement tools at all.

The model can be unavailable, offline, cancelled, return partial context or
return an unstructured answer. These are explicit states. Absence of local
material yields `INSUFFICIENT_LOCAL_CONTEXT`; it is not replaced by an
invented answer or a cloud fallback.

## Persistence

Responses, retrieval traces and revision candidates are in memory only.
Nothing is persisted when a user types, selects a package, checks model status,
generates, cancels or copies text.

`SAVE AS NOTE` and `ACCEPT AS REVISION ITEM` are explicit user actions. They
reuse the canonical STUD Note/Revision model and create provenance marked
`AI_SUGGESTION`, `STUD_LOCAL_OLLAMA`, `SUGGESTED`, the package ID, model,
source trace and explicit-save/acceptance flag. Local model output remains
review material, not an authoritative academic fact.

## Deferred work

No remote model, cloud RAG, automatic retrieval, embedding store, sqlite-vec,
tool calling, source acquisition, essay submission, Moodle write, Calendar
write, Email write or automatic revision persistence is included in Phase 10.

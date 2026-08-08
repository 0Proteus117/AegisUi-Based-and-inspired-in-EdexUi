# OSINT Case Export

A case and each evidence object can be exported as JSON or Markdown through a
native main-process save dialog. The renderer selects only scope and format;
it never supplies an internal storage path. Extensions are validated, existing
files require the native overwrite confirmation and path traversal is rejected.

Exports contain schema/application version, export time, local case/evidence
metadata, provenance, notes, timeline and integrity status. Each export states
that integrity is technical only and does not establish external authenticity
or a legal chain of custody. Raw responses, secrets, Assistant memory, chat
history and internal storage paths are absent.

PDF, binary attachments, import UI and cloud sharing are intentionally outside
v2.4.0.

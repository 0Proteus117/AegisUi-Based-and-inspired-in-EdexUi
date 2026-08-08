# OSINT Investigation Cases

v2.4.0 adds a local, explicit investigation layer to the OSINT Analyst Desk.
An Investigation Case is a user-created container for selected evidence. It is
not a remote account, shared workspace, Assistant memory or Project Timeline
item.

## Case schema

Each version-`1` case has a generated `case-*` identifier, title, optional
description, enum status (`OPEN`, `PAUSED`, `CLOSED`, `ARCHIVED`), user-selected
priority (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), normalized tags, neutral creator
`LOCAL_USER`, timestamps, evidence/note/timeline identifiers, neutral metadata
and an integrity placeholder. No personal name, email or account identifier is
stored.

Opening a case is read-only. Creating, editing, archiving, adding evidence,
adding notes and exporting create explicit persistent events. Permanent case
deletion is intentionally not present in this phase; archive is the safe end
state and prevents new notes or evidence.

## Active case

The OSINT Case Workspace holds one active case for the current application
session. It is not automatically restored on relaunch. Catalog browsing and
provider queries stay ephemeral unless `SAVE TO CASE` is explicitly confirmed.

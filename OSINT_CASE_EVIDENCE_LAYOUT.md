# OSINT Case and Evidence Layout Integrity

## Scope

This document records the focused Dark Mode layout stabilization applied after
the v2.4.0 Cases/Evidence release. It is deliberately not a Light Mode
redesign and does not alter the case/evidence data model, persistence, IPC or
provider policy.

## Root cause

The generic `.workspace-panel-content` primitive is absolute-positioned. That
is correct for fixed-height dashboard panels, but the Active Investigation
card used it inside a content-sized grid row. Its metadata therefore did not
contribute to the card height, while the case header still had a fixed generic
height. Long headings, status and metadata could occupy the same vertical
space as the action footer.

The Case dialog inherited a second incompatible assumption: the shared detail
panel reserved a fixed three-row layout for a direct footer, while Case dialogs
keep their forms and Evidence actions inside the scrollable body. The compact
context/title header also inherited a four-column provider-detail grid despite
having only a context/title group and a close button. This made the Evidence
Detail hierarchy fragile under content growth and display scaling.

These were shared flow/ownership problems, not missing per-screenshot margins.

## Structural correction

- Cases use dedicated, in-flow `osint-case-active-content` and scrollable
  `osint-case-panel-content` regions instead of the absolute dashboard-panel
  primitive.
- The Case workspace uses named grid areas: active case, evidence, timeline
  and notes. Its active header sizes from real content; long titles, tags and
  status values can wrap safely.
- Case dialogs use their own two-row grid: a content-sized context/title header
  and one bounded, scrollable body. Provider-detail dialogs keep their existing
  layout.
- Evidence Detail has explicit regions for the evidence record heading,
  summary, metadata, detail sections, note form and actions. Its action row
  wraps rather than intruding into adjacent content.

## Layout invariants

- Header, metadata and actions remain in normal layout flow.
- A Case title cannot be covered by its status or action row.
- Metadata cells have `min-width: 0` and wrap valid long values.
- Case-note timestamps, text and type use their own in-flow note-content grid.
- Dialog body content is bounded by the viewport and scrolls internally.
- Evidence sections, note input and export/verify/close actions have separate
  layout regions.
- The compact breakpoint converts Case content and metadata to one column.

## Regression coverage and validation

`scripts/test-osint-case-layout.js` checks the semantic renderer and CSS
contract: no absolute generic content in Case flow, named grid areas, content-
sized headers, long-content wrapping, two-row Case dialogs, sectioned Evidence
content and compact fallback. It intentionally avoids machine-specific pixel
coordinates.

Live packaged validation additionally measures non-intersection of title,
status, metadata and action rectangles across desktop/windowed viewports and
content-stress fixtures. This confirms the contract against Electron font
metrics and device scaling rather than a single browser screenshot.

## Remaining limitation

Very long local record bodies are intentionally presented in the bounded
dialog's scrollable content region. No content is hidden or overlaid, but it
requires scrolling rather than expanding beyond the current Electron window.

## Non-goals

This pass does not start the planned full Light Mode review, reconnect legacy
OSINT runtime, modify provider behavior, or change any Cases/Evidence security
control.

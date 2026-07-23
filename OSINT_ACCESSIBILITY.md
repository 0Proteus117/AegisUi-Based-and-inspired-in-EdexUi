# OSINT Accessibility

The OSINT catalog uses native buttons for all selectable provider cards and
actions. The catalog containers expose listbox/option semantics, selected cards
publish `aria-selected`, and detail controls identify their dialog relationship
with `aria-haspopup` and `aria-expanded`.

- Keyboard: `Tab` and `Enter`/`Space` operate cards and actions.
- Focus: visible cyan focus treatment is supplied for cards, panel controls and
  dialog controls.
- Detail: modal dialog receives focus on open; `Escape`, the close control and
  backdrop return focus to the invoking control.
- Responsive: wide layouts keep `TOOL ACCESS` beside the catalog; compact
  layouts move it below the catalog rather than overlaying controls.
- Motion: this phase introduces no animated UI dependency for provider access.

The panel does not depend on hover: hover is an optional preview, while every
state and action is reachable through keyboard interaction.

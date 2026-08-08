# Calendar Regression Recovery — v2.4.2

## Finding

The Calendar implementation was compared directly between the pre-Light-Mode
baseline (`2209054`) and AegisUi v2.4.1 (`46fb948`). The renderer panel, the
`calendar-events` IPC contract, the macOS helper, account state keys and native
read-only behavior were unchanged by the Light Mode implementation.

The native helper was probed independently with a temporary output file. It
returned an authorized response with local calendar and event data. The
packaged-app investigation then found the actual release issue: the controlled
local DMG fallback staged the renderer but omitted `AegisUiCalendar.app` from
`Contents/Resources`. The IPC therefore returned a genuine unavailable result.
v2.4.2 builds the helper, stages it as the expected extra resource and signs it
before signing the app. No calendar contents are stored in this document or in
source control.

## Meaning of `CALENDAR LINK UNAVAILABLE`

The renderer shows that state only after an unsuccessful native
`calendar-events` response. It is not a theme-specific state and it does not
mean that appearance selection altered Calendar authentication or account
configuration. In the affected build the response was genuine: the packaged
helper was missing. The panel retains its existing full-access and
account-management paths for an unavailable helper or account state.

## Protection added

`scripts/test-calendar-theme-integrity.js` verifies that:

- Calendar remains owned by its existing renderer panel and IPC route;
- the unavailable fallback remains conditional on a genuine unsuccessful
  provider response;
- appearance code does not own Calendar connection state or lifecycle;
- Light Mode Calendar picker surfaces use semantic appearance tokens without
  display or visibility overrides.

`scripts/test-packaged-calendar-helper.js` additionally protects the packaging
contract and can inspect a built `.app` to confirm the helper bundle and its
executable are present.

The packaged validation additionally runs Calendar while changing Light, Dark
and System appearance. Theme changes are presentation-only and must not
disconnect the native read-only provider, mutate event data or recreate the
Calendar panel.

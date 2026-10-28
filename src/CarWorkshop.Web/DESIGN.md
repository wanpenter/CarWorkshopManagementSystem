# Workshop Registry frontend

Design draft for V2, based on the admin dashboard screenshot supplied by the user
on 28 October 2026. The user approved applying that image's visual direction.

The reference establishes a white left sidebar, compact white top bar, grey
workspace, bordered white panels, compact sans-serif typography, and orange
accents. Teal distinguishes booking volume from orange action/review emphasis.
The existing Workshop Registry name and actual workshop modules remain the content.

Mode: Operate. Staff need to find records, review visits, assign mechanics, and
maintain customer and vehicle details. ENERGY 1 / RHYTHM 2 / MOTION 1.

- Desktop: 224px sidebar, 76px top bar, 28px workspace gutters. The dashboard uses
  summary metrics, a seven-day booking chart, attention rows, and upcoming visits.
- Record workspaces: searchable records with an adjacent editor on wide screens;
  stacked panels below 1280px. Existing mobile record cards remain.
- Mobile: 64px header with an explicit navigation disclosure; the menu closes
  after navigation or Escape. Two-column metrics and single-column work panels.
- White and #f6f7f9 define surfaces. #20252d is primary text, #626873 secondary
  text, #c2410c accessible orange actions, #9a3412 selected text, and #0e5361
  booking-volume bars. Bright #f36a25 appears only as a non-text chart accent.
- Segoe UI follows the reference's compact administrative typography and the
  existing application's native controls. Titles use 23–28px, panel headings
  15–18px, controls 14px, and supporting chart labels 10–12px.
- Small SVG line icons identify their actual modules. Status text and counts
  provide meaning alongside color. Arrows indicate navigation to a full module.
- Borders separate surfaces; shadows are reserved for actions, dialogs, and the
  mobile navigation overlay. Controls use 6px corners, panels 8px.
- Motion is limited to hover/focus transitions and loading feedback, respecting
  reduced-motion preferences. No dashboard entrance animation delays staff work.

All counts, chart values, and visits derive from the API. Empty datasets remain
empty. No sample charts, personnel, notifications, avatars, financial metrics,
or authentication controls are presented as real functionality.

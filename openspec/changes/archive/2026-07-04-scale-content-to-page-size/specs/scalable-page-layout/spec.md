## ADDED Requirements

### Requirement: Geometry derives from the selected page size

The system SHALL derive all page geometry (page shell dimensions, frame insets, `@page` size, map sizing, Contents Key sizing) from the selected page size exposed as CSS custom properties (`--page-w` / `--page-h`), with no hard-coded page dimensions remaining in layout code.

#### Scenario: Changing size updates geometry
- **WHEN** the selected page size changes from Letter to A4
- **THEN** `--page-w` / `--page-h` update to A4
- **AND** the page shell, frame, maps, and Contents Key all reflect the new dimensions

#### Scenario: No hard-coded dimensions
- **WHEN** the layout renders at any selected size
- **THEN** its dimensions come from the CSS variables, not from literal `8.5in` / `11in` values

### Requirement: On-screen content scales proportionally to the selected size

The system SHALL render maps, the page frame, the cover, and the Contents Key so they scale and reflow proportionally to the selected page dimensions **on screen**.

#### Scenario: Map fills the framed area at any size
- **WHEN** the selected page size is A4, Letter, or a custom size
- **THEN** on screen the map scales to fill the framed content area proportionally without overflow or clipping

#### Scenario: Proportional parity across selected sizes
- **WHEN** the same dungeon is viewed at Letter and at A4 on screen
- **THEN** the two renders are proportionally equivalent (same relative placement of title, map, legend, and frame)

#### Scenario: Printed content is framed and correct at any paper
- **WHEN** the document is printed on any paper
- **THEN** the content is correctly framed, paginated, and margined for that sheet (per "Print auto-fits the real sheet"), even if it does not zoom edge-to-edge to fill the sheet
- **NOTE** Print content zoom-to-fill is a prototype-gated stretch (see design.md task 1), not a committed requirement

### Requirement: Print auto-fits the real sheet in any engine

The system SHALL produce printed output whose frame/border, page breaks, and margins auto-fit whatever paper the browser prints — one section per sheet, a full-page decorative border, symmetric margins, and a two-column Contents Key — in both Chromium and Firefox, **without requiring the on-screen selection to match the print dialog's paper**.

#### Scenario: Chromium print
- **WHEN** the document is printed in Chromium
- **THEN** the real print output has one section per sheet, a full-page border, and symmetric margins that fit the printed sheet

#### Scenario: Firefox print auto-fits the dialog paper
- **WHEN** the document is printed in Firefox with the print dialog set to A4
- **THEN** the real print output (verified via the Firefox print pipeline, not print emulation) is A4-sized with one section per sheet, a full-page border, symmetric margins, and a two-column Contents Key — regardless of the on-screen page-size selection

#### Scenario: No blank or overflow sheets
- **WHEN** the document is printed in either engine on any paper
- **THEN** there is no blank leading/trailing sheet and the Contents Key does not spill onto an unframed continuation sheet

#### Scenario: Only one border prints
- **WHEN** the document is printed (normal, non-bleed)
- **THEN** exactly one decorative frame border appears per sheet (no doubled border)

### Requirement: Contents Key pagination adapts to page size

The system SHALL paginate the Contents Key against the current page geometry and re-paginate when the page size changes, keeping columns `fr`-free in print so Firefox renders two columns.

#### Scenario: Re-paginate on size change
- **WHEN** the page size changes while a Contents Key with many entries is shown
- **THEN** the Contents Key re-paginates for the new page height without a full reload
- **AND** no entry is lost or duplicated

#### Scenario: Two columns in Firefox print
- **WHEN** the Contents Key is printed in Firefox at any supported size
- **THEN** it renders as two columns (not collapsed to one)

### Requirement: Preserve the full-bleed PDF export

The system SHALL keep the existing full-bleed PDF export (`html.pdf-bleed`) working unchanged, independent of the selected on-screen/normal-print page size.

#### Scenario: Bleed export unaffected
- **WHEN** the full-bleed PDF export is triggered
- **THEN** it renders at its own trim+bleed dimensions with parchment background and crop marks, regardless of the selected page size

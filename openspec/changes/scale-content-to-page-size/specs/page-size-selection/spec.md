## ADDED Requirements

### Requirement: User selects the target page size

The system SHALL present a paper-size control as an icon in the top-right screen chrome (in the margin, not on the printable page) that opens a popup offering presets (Letter, A4, Legal) or a custom width×height, and SHALL apply the selection to the on-screen page layout without a page reload. The selection drives the on-screen page size; it is independent of the browser's print dialog paper (printed output auto-fits the real sheet — see `scalable-page-layout`).

#### Scenario: Open the control from the chrome
- **WHEN** the user clicks the paper icon in the top-right screen chrome
- **THEN** a popup opens with the preset sizes and a custom width×height option

#### Scenario: Choose a preset
- **WHEN** the user selects the "A4" preset
- **THEN** the on-screen page and its contents re-render at A4 dimensions (210×297mm)

#### Scenario: Choose a custom size
- **WHEN** the user enters a valid custom size of 7in × 9in
- **THEN** the on-screen page re-renders at 7in × 9in
- **AND** the selection is treated the same as a preset for persistence

#### Scenario: Selection applies live
- **WHEN** the user changes the page size while a dungeon is loaded
- **THEN** the maps, page frame, and Contents Key re-render at the new size without a full page reload or loss of loaded data

#### Scenario: Selection does not need to match the print dialog
- **WHEN** the on-screen selection differs from the paper set in the browser's print dialog
- **THEN** no error or warning is required, and printing still produces correct output auto-fitted to the dialog's paper

### Requirement: Default page size resolution

The system SHALL resolve the initial page size in this order: a valid persisted selection, else a locale heuristic (`en-US`/`en-CA` → Letter, otherwise A4), else Letter.

#### Scenario: First run, US locale
- **WHEN** there is no persisted selection and the browser locale is `en-US`
- **THEN** the initial page size is Letter

#### Scenario: First run, non-US locale
- **WHEN** there is no persisted selection and the browser locale is `de-DE`
- **THEN** the initial page size is A4

#### Scenario: Returning user
- **WHEN** a valid page-size selection exists in persistence
- **THEN** that selection is used regardless of locale

### Requirement: Persistence of the selection

The system SHALL persist the selected page size and restore it on the next visit.

#### Scenario: Selection survives reload
- **WHEN** the user selects Legal and reloads the app
- **THEN** the page size is still Legal after reload

#### Scenario: Corrupt persisted value
- **WHEN** the persisted page-size value is malformed or unrecognized
- **THEN** the app does not crash
- **AND** it falls back to the default resolution order

### Requirement: Validation of custom dimensions

The system SHALL validate custom dimensions, rejecting non-numeric, zero, negative, or `NaN` values, and SHALL clamp accepted values to sane bounds (3in–48in per side, or unit-equivalent).

#### Scenario: Invalid custom input rejected
- **WHEN** the user enters a custom width of `0` or a non-numeric value
- **THEN** the input is rejected with an inline validation message
- **AND** the previously applied valid page size is retained

#### Scenario: Out-of-range custom input clamped
- **WHEN** the user enters a custom size of 0.1in or 500in
- **THEN** the value is clamped to the nearest allowed bound with feedback

#### Scenario: Custom value cannot inject CSS
- **WHEN** a custom dimension is supplied (including via a tampered persisted value) that is not a plain number
- **THEN** it is not interpolated into any CSS variable or `@page` rule
- **AND** it is rejected in favor of the last valid numeric value

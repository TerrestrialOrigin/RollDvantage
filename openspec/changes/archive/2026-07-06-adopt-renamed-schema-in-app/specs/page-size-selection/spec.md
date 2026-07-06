## MODIFIED Requirements

### Requirement: Persistence of the selection

The system SHALL persist the selected page size and restore it on the next visit. The persisted payload SHALL use full-name keys (`width`/`height`/`unit`) and SHALL read-migrate a legacy compact payload (`w`/`h`/`unit`) transparently on load, so a size saved before the rename still restores. A malformed or unrecognized persisted value (under either key set) SHALL NOT crash the app and SHALL fall back to the default resolution order.

#### Scenario: Selection survives reload
- **WHEN** the user selects Legal and reloads the app
- **THEN** the page size is still Legal after reload

#### Scenario: Selection saved under legacy keys still restores
- **WHEN** the persisted payload uses the legacy `{ w, h, unit }` keys
- **THEN** the page size restores correctly and is re-persisted under `{ width, height, unit }` on the next change

#### Scenario: Corrupt persisted value
- **WHEN** the persisted page-size value is malformed or unrecognized
- **THEN** the app does not crash
- **AND** it falls back to the default resolution order

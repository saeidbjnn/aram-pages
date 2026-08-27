# ARAM 3.3 Development Report

## Scope

Phase 3.3 introduced modular personalization without rebuilding ARAM, redesigning its visual identity or weakening existing specialized workflows.

## Architecture improvements

### Central module registry

`js/modules.js` is now the single source of truth for built-in module definitions, generic templates, stable IDs, versions, capabilities, destinations and data namespaces.

Before this phase, Reading, University and Screen Time names and routes were repeated across More, Search, Statistics, Calendar and Quick Add. Those integrations now resolve module status and capabilities through shared helpers.

### Separate configuration and records

Schema 4 separates:

- `settings.modulePreferences`
- `settings.moduleConfigs`
- `data.customModules`
- `data.customModuleRecords`

Calculated values are not stored in module configuration.

### Command boundary

`js/module-commands.js` owns lifecycle and generic-record mutations. UI code expresses actions instead of directly rewriting configuration arrays.

### Presentation boundary

`js/module-ui.js` contains Module Library, personalized More, module management, specialized routing and generic module surfaces. `js/onboarding.js` owns the optional onboarding state machine.

This avoids placing all module behavior directly inside `app.js`, although `app.js` remains the primary integration module.

### Capability-based providers

Calendar, Search, Statistics and Today consult module status and declared capabilities. This prevents irrelevant controls and calculations. It also allows a future specialized module to integrate without adding its name to every UI component.

## Data safety improvements

- Store schema upgraded to 4.
- Existing v3 data is copied to a migration backup before commit.
- Migration is normalized and committed only after full success.
- Existing users retain Reading, University and Screen Time visibility.
- Specialized records remain in original namespaces.
- Import creates a pre-import backup.
- Permanent deletion creates a downloadable backup and uses exact-name confirmation.
- University and Projects deletion ownership is scoped by stable module ID.
- Unknown or malformed module configuration fails safely.

## Product behavior

### Personalized More

More now shows pinned and active modules rather than a fixed lifestyle list. General tools remain available independently.

### Module Library

The library groups Active, Available, Hidden and Custom modules. Users can activate, hide, restore, deactivate, archive, reactivate, pin and reorder modules.

### Optional onboarding

New users may choose relevant modules in four concise steps or skip. Partial progress persists. Existing users are never forced through onboarding.

### Generic templates

Five reusable templates cover common needs without exposing arbitrary form design. Each template stores only fields supported by its contract.

## Performance improvements

- Inactive modules do not render.
- Optional providers check status/capability before scanning records.
- Calendar stores no copied events.
- Work and Projects reuse existing records.
- Existing revision selector cache remains enabled.
- Source budgets are enforced in tests.
- Stress tests cover 25 active custom modules and 500 records.

## Accessibility improvements

- Module controls provide readable Persian labels.
- Lifecycle switches expose ARIA state.
- Reordering has keyboard-operable up/down actions rather than drag-only behavior.
- Minimum touch-target safeguards remain active.
- Long Persian names use existing truncation/containment rules.
- Onboarding and Module Library use the existing accessible Bottom Sheet focus trap.
- Hidden-module Search preference is an explicitly labeled checkbox.

## Developer experience improvements

- Registry contract reduces repeated hardcoded module lists.
- Module lifecycle commands are independently testable.
- Migration fixtures document schema expectations.
- Three browser QA suites separate universal, Phase 3.1 and modular checks.
- New architecture/migration/dogfooding documents describe extension boundaries.

## Files created

- `js/modules.js`
- `js/module-commands.js`
- `js/module-ui.js`
- `js/onboarding.js`
- `tests/modules.test.mjs`
- `tests/module-migration.test.mjs`
- `tests/custom-modules.test.mjs`
- `tests/module-integration.test.mjs`
- `qa/module_qa.py`
- `MODULE_ARCHITECTURE.md`
- `DATA_MIGRATION_REPORT.md`
- `DOGFOODING_ISSUES.md`
- `PHASE3_3_REPORT.md`

## Files modified

- `app.js`
- `index.html`
- `styles.css`
- `js/store.js`
- `js/domain.js`
- `js/reports.js`
- `js/commands.js`
- `js/developer-mode.js`
- `sw.js`
- `package.json`
- Existing unit/quality/stress/browser tests
- Project documentation

## Technical debt remaining

1. LocalStorage remains synchronous and rewrites the complete state.
2. `app.js` remains close to the current per-module source budget.
3. A future IndexedDB migration may become justified for very long append-only histories.
4. Generic deleted-record restoration lacks a dedicated history view in each template.
5. Physical installed-PWA and assistive-technology certification is pending.
6. Reordering intentionally avoids drag-and-drop; power-user feedback should determine whether an accessible drag alternative is worth adding.
7. Module provider contracts are centralized but still executed through the existing monolithic application integration layer rather than true dynamic imports.

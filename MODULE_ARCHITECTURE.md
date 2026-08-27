# ARAM Module Architecture — Schema 4

## Purpose

ARAM 3.3 separates the universal planner core from optional lifestyle-specific modules. The architecture follows one product rule:

> Simple to activate, deeply useful after activation.

The module system is not a form builder and does not expose schemas, properties, collections or database concepts to users. A user chooses a useful activity; ARAM supplies the appropriate experience.

## Two product layers

### Universal core

These capabilities remain available for every installation and never depend on optional modules:

- Today
- Tasks
- Focus
- Habits
- Calendar
- Notes
- Statistics
- Search
- Settings

Core capabilities are declared in the registry for documentation and routing consistency, but they do not receive optional-module lifecycle states.

### Optional specialized modules

Built-in optional modules are registered once in `js/modules.js`:

- Reading (`reading`)
- University (`university`)
- Screen Time (`screen-time`)
- Work (`work`)
- Projects (`projects`)

Reading, University and Screen Time keep their dedicated data and interfaces. Work and Projects are specialized facades over existing task, focus and university-project records; they do not duplicate records.

## Specialized and generic modules

### Specialized module

A specialized module has dedicated commands, UI, statistics and domain behavior. Its records remain in their existing namespaces.

Examples:

- Reading uses `books` and `readingSessions`.
- University uses `universityItems` whose `moduleId` is `university` or absent for migrated records.
- Screen Time uses `screenTimeEntries`.
- Work references `tasks`, `taskEntries` and `focusSessions` whose `moduleId` is `work`.
- Projects references `tasks`, `taskEntries` and `universityItems` whose `moduleId` is `projects`.

Deactivating, hiding or archiving a specialized module does not rewrite or convert its records.

### Generic module

A generic module uses one of five intentionally limited templates:

1. Simple Tracker
2. Project
3. Routine
4. List
5. Time Tracker

Definitions live in `data.customModules`; records live in `data.customModuleRecords`. Users configure only a name, icon, template, optional goal/unit, reminder-ready preference and visibility. Generic modules do not claim the depth of Reading or University.

## Module contract

Every built-in definition has a stable contract in `js/modules.js`:

- `id` — immutable machine identifier
- `name` — Persian display name
- `description` — one concise Persian explanation
- `icon` — monochrome symbol
- `layer` — `core` or `optional`
- `internalType` — `core`, `specialized`, `specialized_facade` or `generic`
- `defaultEnabled`
- `version`
- `capabilities`
- `destination`
- `dataNamespaces`
- `availability`

Custom definitions are resolved through `getModuleDefinition()` and inherit the capabilities of their selected generic template.

Persian display names are never used as identifiers or storage keys.

## Capability declarations

Supported capabilities are:

- Tasks
- Time tracking
- Progress
- Goals
- Sessions
- Notes
- Calendar
- Statistics
- Search
- History
- Streak
- Numeric values

Calendar, Search, Statistics and Today integrations consult capabilities and module status instead of hardcoding every module in each view. For example, a custom List supports Search but intentionally does not create calendar activity.

## Module configuration

Configuration is separate from records:

```text
settings.modulePreferences
├── onboardingStatus
├── onboardingStep
├── onboardingUseCase
├── onboardingSelections
├── showHiddenSearchResults
└── moduleIntroductionDismissed

settings.moduleConfigs[]
├── moduleId
├── status
├── order
├── pinned
├── todayVisibility
├── version
└── updatedAt
```

Possible statuses:

- `active` — shown in the personalized module space and eligible for integrations
- `hidden` — remains active but is removed from visible module surfaces
- `available` — deactivated; data is preserved and no new module UI is shown
- `archived` — historical data is retained; new records are blocked until reactivation

`todayVisibility` is either `summary` or `hidden`. It never stores calculated summary values.

## Lifecycle semantics

- **Hide** removes the module from visible surfaces while preserving active status and data.
- **Deactivate** removes it from active navigation and integrations while preserving data.
- **Archive** preserves historical data and prevents new module records.
- **Delete permanently** removes the selected namespace only after an automatic backup download and exact-name confirmation.

Built-in modules remain available after permanent deletion. Custom definitions and their records are removed together.

## Storage boundaries

Schema 4 keeps one application store with normalized namespaces because the current dataset remains within LocalStorage limits and changing storage technology solely for architecture style would add migration risk.

Module configuration is not duplicated inside records. Records use stable `moduleId` references where applicable.

Unknown or corrupted module configuration is normalized safely. Unknown future custom records remain non-rendering rather than crashing the application.

## Calendar integration

Calendar providers return references to original records. No calendar event copies are created.

A record appears only when:

1. Its module is active, or it is historical data from an archived module where the domain allows history.
2. The module declares the Calendar capability.
3. The record contains a valid date.

The Jalali calendar remains primary; Gregorian information remains secondary.

## Search integration

Search results carry `sourceModuleId` and a Persian source label. Clicking a result from a hidden, inactive or archived module opens module management rather than bypassing lifecycle controls.

Hidden-module data is excluded unless the user explicitly enables «نمایش نتایج بخش‌های مخفی». Permanently deleted data is never returned.

## Statistics integration

Statistics providers run only for active modules that declare the Statistics capability.

- Active module with data: real statistics are shown.
- Active module without data: a Persian empty state is shown.
- Inactive or hidden module: its optional statistics are not shown by default.
- Archived module: historical records remain preserved and available through appropriate history surfaces.

All values are derived from stored records. Module configuration never stores percentages or totals.

## Today integration

Only active modules with `todayVisibility: summary` render a concise Today card. The summary links to the complete module. Large module dashboards are never embedded on Today.

## Lazy behavior and performance

- Inactive modules are not rendered.
- Optional providers are evaluated only when their capability and status permit it.
- Existing revision-based selector caching remains in place.
- The system does not initialize separate databases or duplicate records per module.
- Generic module code is shared across all five templates.

## Adding a future specialized module safely

1. Add one stable definition to `OPTIONAL_MODULES` in `js/modules.js`.
2. Declare only capabilities the module actually supports.
3. Define a dedicated data namespace or an explicit facade over existing records.
4. Add sanitizer and migration logic without relying on display names.
5. Add commands that enforce lifecycle and validation rules.
6. Add one dedicated module UI entry and register its destination.
7. Add provider coverage for Calendar, Search and Statistics only when declared.
8. Add migration, lifecycle, offline, stress and regression tests.
9. Update Service Worker assets when a new production module file is introduced.
10. Document deletion semantics and data ownership before release.

Future modules such as Fitness, Sleep, Medication, Nutrition, Language Learning and Pet Care remain roadmap items; they are not partially implemented in 3.3.

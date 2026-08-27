# ARAM 3.3 Data Migration Report

## Summary

ARAM 3.3 upgrades the application store from schema 3 to schema 4. The migration adds module configuration and generic-module namespaces while preserving every existing productivity record and setting.

## Previous schema

Schema 3 stored:

- Tasks and task occurrence entries
- Habits and daily habit entries
- Notes
- Books and reading sessions
- University items
- Focus sessions
- Screen-time entries
- Timer runtime
- Theme, timer settings and reading goals

Reading, University and Screen Time were globally visible fixed sections. There was no single state describing whether an optional section was active, hidden or archived.

## New schema

Schema 4 adds:

```text
settings.modulePreferences
settings.moduleConfigs
data.customModules
data.customModuleRecords
```

All existing schema-3 namespaces remain intact. Specialized records are not converted into generic records.

## Migration steps

1. Detect the first valid schema-3 primary or backup envelope.
2. Copy the untouched encoded schema-3 value to `aram-planner-store-v3-migration-backup` when feasible.
3. Create a schema-4 state in existing-user mode.
4. Preserve store ID, revision, creation time and update time.
5. Preserve all existing settings.
6. Preserve every existing data collection and timer runtime.
7. Add default module preferences.
8. Mark onboarding as completed for the existing user.
9. Mark Reading, University and Screen Time active and pinned to preserve the former visible layout.
10. Keep Work and Projects available because they did not previously have independent active surfaces.
11. Normalize the complete candidate state.
12. Commit schema 4 only after normalization succeeds.

## Idempotence

Once schema 4 exists, startup reads and normalizes it directly. The v3 migration does not run again. Re-normalizing migrated data produces the same logical records and configurations.

## Backup behavior

Migration backup:

- Key: `aram-planner-store-v3-migration-backup`
- Content: untouched encoded schema-3 envelope
- Written before the schema-4 primary commit

Normal schema-4 writes continue to use:

- `aram-planner-store-v4`
- `aram-planner-store-v4-backup`

Before importing a backup, the current schema-4 state is saved to:

- `aram-planner-store-import-backup`

Permanent module deletion triggers a user-downloadable full JSON backup before exact-name confirmation.

## Failure behavior

If schema-3 migration throws:

- The original v3 keys are not removed or rewritten.
- The failure is passed to diagnostics with migration context.
- The application enters a controlled migration-error recovery state.
- A calm Persian retry interface is shown.
- Retrying uses the preserved source rather than a partially migrated object.
- No half-migrated schema-4 state is committed.

If LocalStorage is unavailable, the existing in-memory fallback remains available and diagnostics records the storage limitation.

## Import compatibility

The importer accepts:

- ARAM schema 4 backups
- Schema 3 backups, migrated through the same v3→v4 function
- Schema 2 backups
- Recognized legacy schema-1 data

The importer validates:

- JSON parsing
- Backup object shape
- Known schema range
- Real dates and valid time values
- Module IDs/configuration
- Generic module templates
- Record IDs and normalized fields

A backup from a newer schema is rejected with a Persian explanation. Malformed optional records are discarded during normalization without crashing the application. Unknown future modules do not become active UI destinations.

## Data preservation result

Verified preservation includes:

- Reading books, authors, pages, current book and session history
- University assignments, projects, research, thesis work, deadlines, progress and notes
- Tasks, recurrence and completed occurrence history
- Habits and completion history
- Focus sessions and timer settings
- Screen-time history
- Notes
- Theme and user settings
- Store identity and revision metadata

No user record is renamed by Persian display text. No specialized data is downgraded to a generic module.

## Tests completed

Automated migration coverage includes:

- Existing user with Reading data
- Existing user with University data
- Existing user with Screen Time data
- Existing user with custom settings
- Existing user with no optional records
- Incomplete and partially malformed optional records
- Schema-4 data with missing module preferences
- Migration idempotence
- Untouched v3 migration snapshot
- v3 backup import
- Newer-schema rejection
- Large histories and hundreds of records
- Specialized Reading and University UI after browser migration
- Existing users not being forced through onboarding

All migration tests pass in the final suite.

## Known risks

- LocalStorage writes remain synchronous and are not transactionally atomic across browser tabs.
- The Web Storage API cannot guarantee atomic compare-and-swap between truly simultaneous writes, although stale revisions are rejected.
- Very large future module datasets may justify IndexedDB, but the current migration intentionally avoids an unnecessary storage-engine change.
- Physical-device installed-PWA migration should still be dogfooded on Safari and Android Chrome before store submission.

---

# ARAM 3.4 Native Timer Settings Migration — Schema 4 → 5

## Purpose

Schema 5 introduces native-timer preferences only. It does not move, rename or reinterpret productivity records introduced by the modular schema.

## Added settings

```text
settings.timerNotifications
settings.timerSound
settings.liveActivities
```

Existing `settings.vibration`, `settings.autoContinue`, `settings.workPreset` and `runtime.timer` remain authoritative and are preserved.

## Migration behavior

1. Read the first valid schema-4 primary or backup envelope.
2. Copy the untouched encoded v4 source to `aram-planner-store-v4-migration-backup` when storage permits.
3. Normalize all schema-4 records through the schema-5 validator.
4. Preserve the explicit existing `autoContinue` value.
5. Migrate the previous `sound: false` setting, when present, to `timerSound: "none"`.
6. Default missing timer sound to `calm` and missing Live Activity preference to enabled; native capability detection still decides whether the control is exposed.
7. Default missing timer notification preference to disabled until the user contextually requests permission.
8. Commit the schema-5 envelope only after successful normalization.

New installations use Auto Continue OFF. Existing users are never silently forced to a different saved Auto Continue preference.

## Failure and rollback

If v4 → v5 migration throws, the source v4 keys remain untouched. The application records the migration failure and exposes the existing calm retry path. No partially migrated v5 object is committed.

## Verified preservation

Tests verify preservation of:

- tasks and task history;
- habits and history;
- books and reading sessions;
- university data;
- module definitions/configuration/custom records;
- focus history;
- screen-time data;
- notes;
- theme and prior timer preferences;
- current timer runtime and custom-duration source.

Schema 5 import continues to accept schema 4, 3, 2 and recognized legacy backups through the existing migration chain.

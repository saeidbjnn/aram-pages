# ARAM 3.3 Dogfooding Issues and Scenarios

## Purpose

This document records scenarios that require real daily use rather than only automated validation. No Critical or High defect is known at release-candidate time. The items below are product-observation tasks and residual risks.

## Recommended personas

### Student

- Activate University and Reading.
- Add assignments, research and a book with several sessions.
- Confirm Today remains concise and University/Reading remain deep.
- Hide University during a holiday, then restore it without losing history.

### Office worker

- Activate Work and Screen Time.
- Create work tasks and work focus sessions.
- Confirm personal tasks and work tasks remain understandable in Search and Calendar.

### Freelancer

- Activate Work and Projects.
- Maintain multiple project deadlines and work sessions.
- Test whether the distinction between Work and Projects remains obvious after a week of use.

### Homemaker

- Skip all specialized modules.
- Use only Today, Tasks, Focus and Habits.
- Confirm no university, reading or screen-time statistics clutter the experience.
- Add a custom Routine or List only when needed.

### Reader who does not attend university

- Activate Reading only.
- Confirm University remains absent from More, Today, Quick Add and Statistics.

### User who does not read

- Activate University or Work but not Reading.
- Search for general tasks and ensure no Reading empty states appear.

### Minimal user

- Skip onboarding.
- Use only core capabilities for several days.
- Confirm Module Library is discoverable without becoming intrusive.

### Existing long-term user

- Upgrade a copy of months of schema-3 data.
- Compare task, habit, reading, university, focus and screen-time counts before and after migration.
- Export immediately after migration and verify the backup includes module configuration.

## Behaviors to observe

- Whether automatically recommended onboarding selections feel helpful or surprising.
- Whether «مخفی‌کردن»، «غیرفعال‌کردن»، «آرشیو» and «حذف دائمی» are understood without explanation.
- Whether accessible up/down controls are sufficient for module reordering on mobile.
- Whether long Persian module names truncate naturally in More and Module Library.
- Whether pinned modules remain useful when more than six modules are active.
- Whether Today summaries remain concise with several custom modules enabled.
- Whether hidden search opt-in is easy to discover only when needed.
- Whether generic Project feels clearly lighter than the specialized University/Projects experiences.

## Destructive-use scenarios

- Repeatedly hide, restore, deactivate and reactivate a module.
- Cancel exact-name permanent deletion at every stage.
- Export before deletion, delete a custom module and restore the backup.
- Close the app halfway through onboarding and resume later.
- Go offline while using Module Library and generic records.
- Fill LocalStorage close to capacity before activating another module.
- Open two tabs and attempt rapid module reordering in both.
- Import an old schema-3 backup after creating schema-4 custom modules.

## Deferred observations

- Real VoiceOver rotor order in Module Library.
- TalkBack announcement wording for module status changes.
- Installed iOS PWA migration after long background suspension.
- Installed Android PWA offline update behavior.
- Haptic consistency on devices with different vibration support.

## Current non-blocking technical debt

- The full application state is serialized on each LocalStorage commit.
- `app.js` remains larger than the preferred long-term presentation boundary.
- Generic record restoration is implemented in commands but does not yet have a dedicated deleted-record browser in every generic template.
- Reordering uses accessible buttons rather than drag-and-drop; this is deliberate for safety but should be evaluated with power users.
- Real device installation and assistive-technology certification remain required before public store submission.

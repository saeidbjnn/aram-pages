#!/usr/bin/env python3
"""Phase 3.3 module-system browser QA using an in-memory LocalStorage."""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MODULES = [
    "app.js", "js/domain.js", "js/reports.js", "js/commands.js", "js/store.js",
    "js/timer.js", "js/native-timer-bridge.js", "js/diagnostics.js", "js/developer-mode.js", "js/modules.js",
    "js/module-commands.js", "js/onboarding.js", "js/module-ui.js",
]


def module_name(path: str) -> str:
    return f"aram:{path}"


def rewrite_imports(path: str, source: str) -> str:
    parent = (ROOT / path).parent
    def replace(match: re.Match[str]) -> str:
        prefix, specifier, suffix = match.groups()
        if not specifier.startswith("."):
            return match.group(0)
        resolved = (parent / specifier).resolve().relative_to(ROOT).as_posix()
        return f"{prefix}{module_name(resolved)}{suffix}"
    return re.sub(r"((?:from\s*|import\s*)['\"])([^'\"]+)(['\"])", replace, source)


def data_url(text: str) -> str:
    encoded = base64.b64encode(text.encode("utf-8")).decode("ascii")
    return f"data:text/javascript;base64,{encoded}"


def build_html(preload: dict[str, str] | None = None) -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    imports = {
        module_name(path): data_url(rewrite_imports(path, (ROOT / path).read_text(encoding="utf-8")))
        for path in MODULES
    }
    import_map = json.dumps({"imports": imports}, ensure_ascii=False)
    preloaded = json.dumps(preload or {}, ensure_ascii=False)
    bootstrap = f"""
    <script>
    (() => {{
      const initial = {preloaded};
      const values = new Map(Object.entries(initial));
      const storage = {{
        getItem: key => values.has(String(key)) ? values.get(String(key)) : null,
        setItem: (key, value) => values.set(String(key), String(value)),
        removeItem: key => values.delete(String(key)),
        clear: () => values.clear(),
        key: index => [...values.keys()][index] ?? null,
        get length() {{ return values.size; }}
      }};
      Object.defineProperty(globalThis, 'localStorage', {{ value: storage, configurable: true }});
    }})();
    </script>
    """
    html = re.sub(r'<link rel="stylesheet" href="styles\.css"\s*/?>', f"<style>{css}</style>", html)
    html = re.sub(r'<script type="module" src="app\.js"></script>', '', html)
    return html.replace('</head>', f'{bootstrap}<script type="importmap">{import_map}</script></head>').replace('</body>', '<script type="module">import "aram:app.js";</script></body>')


def checksum(value: str) -> str:
    h = 2166136261
    for char in value:
        h ^= ord(char)
        h = (h * 16777619) & 0xFFFFFFFF
    return f"{h:08x}"


def encode_state(state: dict) -> str:
    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    return json.dumps({"version": 2, "checksum": checksum(payload), "payload": payload}, ensure_ascii=False, separators=(",", ":"))


def v3_fixture() -> dict:
    return {
        "schemaVersion": 3,
        "meta": {"storeId": "qa-v3", "revision": 7, "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-08-06T00:00:00.000Z"},
        "settings": {"theme": "light", "autoContinue": False, "sound": True, "vibration": True, "workPreset": {"workMinutes": 50, "breakMinutes": 10}, "readingGoal": {"minutes": 20, "pages": 8}, "currentBookId": "book-v3"},
        "data": {
            "tasks": [], "taskEntries": [], "habits": [], "habitEntries": [], "notes": [],
            "books": [{"id": "book-v3", "title": "کتاب مهاجرت", "author": "نویسنده", "totalPages": 300, "currentPage": 90, "archivedAt": None, "finishedAt": None, "createdAt": "2026-07-01T00:00:00.000Z", "updatedAt": "2026-08-01T00:00:00.000Z", "deletedAt": None}],
            "readingSessions": [{"id": "reading-v3", "bookId": "book-v3", "date": "2026-08-06", "fromPage": 80, "toPage": 90, "pagesRead": 10, "durationSeconds": 1200, "startedAt": None, "endedAt": "2026-08-06T10:00:00.000Z", "notes": "جلسه قبلی", "createdAt": "2026-08-06T10:00:00.000Z", "updatedAt": "2026-08-06T10:00:00.000Z", "deletedAt": None}],
            "universityItems": [{"id": "uni-v3", "moduleId": "university", "title": "پژوهش مهاجرت", "type": "research", "deadline": "2026-09-01", "progress": 35, "status": "in_progress", "notes": "داده قدیمی", "priority": "high", "estimatedHours": 12, "completedAt": None, "archivedAt": None, "createdAt": "2026-07-01T00:00:00.000Z", "updatedAt": "2026-08-01T00:00:00.000Z", "deletedAt": None}],
            "focusSessions": [],
            "screenTimeEntries": [{"id": "screen-v3", "date": "2026-08-06", "minutes": 75, "createdAt": "2026-08-06T00:00:00.000Z", "updatedAt": "2026-08-06T00:00:00.000Z", "deletedAt": None}],
        },
        "runtime": {"timer": {"mode": "focus", "phase": "focus", "status": "idle", "durationSeconds": 1500, "remainingSeconds": 1500}},
    }


def open_app(context, preload=None):
    page = context.new_page()
    page.set_default_timeout(7000)
    errors: list[str] = []
    console: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: console.append(message.text) if message.type == "error" else None)
    page.set_content(build_html(preload), wait_until="domcontentloaded")
    page.wait_for_function("document.documentElement.dataset.appReady === 'true'", timeout=15_000)
    page.wait_for_timeout(300)
    return page, errors, console


def all_storage(page) -> dict[str, str]:
    return page.evaluate("Object.fromEntries(Array.from({length: localStorage.length}, (_, i) => [localStorage.key(i), localStorage.getItem(localStorage.key(i))]))")


def state(page) -> dict:
    return page.evaluate("JSON.parse(JSON.parse(localStorage.getItem('aram-planner-store-v5')).payload)")


def status(data: dict, module_id: str) -> str:
    return next(item["status"] for item in data["settings"]["moduleConfigs"] if item["moduleId"] == module_id)


def run() -> dict:
    outcomes = {}
    all_errors: list[str] = []
    all_console: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = browser.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True)

        print("checkpoint:new-user", flush=True)
        # New-user onboarding and partial-resume checkpoint.
        page, errors, console = open_app(context)
        all_errors += errors; all_console += console
        page.wait_for_selector("#onboarding-content")
        page.click("#onboarding-next")
        page.click('[data-onboarding-module="reading"]')
        partial = all_storage(page)
        page.close()

        page, errors, console = open_app(context, partial)
        all_errors += errors; all_console += console
        page.wait_for_selector("#onboarding-content")
        assert "۲ از ۴" in page.locator("#onboarding-content").inner_text()
        assert page.locator('[data-onboarding-module="reading"]').get_attribute("aria-pressed") == "true"
        page.click('[data-onboarding-module="university"]')
        page.click("#onboarding-next")
        page.click('[data-use-case="mixed"]')
        page.click("#onboarding-next")
        assert "مطالعه" in page.locator("#onboarding-content").inner_text()
        page.click("#onboarding-next")
        data = state(page)
        assert data["settings"]["modulePreferences"]["onboardingStatus"] == "completed"
        assert status(data, "reading") == "active" and status(data, "university") == "active"
        assert all(status(data, module_id) == "available" for module_id in ["screen-time", "work", "projects"])
        outcomes["onboarding_resume_and_complete"] = True
        outcomes["use_case_does_not_auto_activate"] = True

        print("checkpoint:lifecycle", flush=True)
        # Module Library lifecycle: pin, Today, hide/restore, deactivate, archive/reactivate.
        page.click('[data-view-target="more"]')
        assert "هنوز بخشی اضافه نکرده‌ای" not in page.locator("#feature-grid").inner_text()
        outcomes["pinned_modules_do_not_show_empty_state"] = True
        page.click('[data-open-module-library]')
        page.click('[data-module-card="reading"] [data-module-manage]')
        page.click("#module-pin")
        page.click("#module-today")
        page.click("#module-hide")
        assert status(state(page), "reading") == "hidden"
        page.click('[data-module-card="reading"] [data-module-primary]')
        assert status(state(page), "reading") == "active"
        page.click('[data-module-card="reading"] [data-module-manage]')
        page.click("#module-deactivate")
        assert status(state(page), "reading") == "available"
        page.click('[data-module-card="reading"] [data-module-primary]')
        page.click('[data-module-card="reading"] [data-module-manage]')
        page.click("#module-archive")
        assert status(state(page), "reading") == "archived"
        page.click('[data-module-card="reading"] [data-module-primary]')
        assert status(state(page), "reading") == "active"

        # Accessible ordering changes the stored order and can be reversed.
        initial_order = next(item["order"] for item in state(page)["settings"]["moduleConfigs"] if item["moduleId"] == "reading")
        page.click('[data-module-card="reading"] [data-module-manage]')
        page.click("#module-down")
        moved_order = next(item["order"] for item in state(page)["settings"]["moduleConfigs"] if item["moduleId"] == "reading")
        assert moved_order != initial_order
        page.click("#module-up")
        restored_order = next(item["order"] for item in state(page)["settings"]["moduleConfigs"] if item["moduleId"] == "reading")
        assert restored_order == initial_order
        outcomes["module_lifecycle"] = True

        # Settings export/import round-trip restores module configuration safely.
        page.keyboard.press("Escape")
        page.click('[data-open-sheet="settings"]')
        with page.expect_download() as export_info:
            page.click("#export-data")
        export_path = "/tmp/aram-phase33-ui-backup.json"
        export_info.value.save_as(export_path)
        page.keyboard.press("Escape")
        page.click('[data-open-module-library]')
        page.click('[data-module-card="reading"] [data-module-manage]')
        page.click("#module-deactivate")
        assert status(state(page), "reading") == "available"
        page.keyboard.press("Escape")
        page.click('[data-open-sheet="settings"]')
        page.set_input_files("#import-data-file", export_path)
        page.wait_for_function("JSON.parse(JSON.parse(localStorage.getItem('aram-planner-store-v5')).payload).settings.moduleConfigs.find(x => x.moduleId === 'reading').status === 'active'")
        assert status(state(page), "reading") == "active"
        outcomes["backup_import_roundtrip"] = True

        page.click('[data-view-target="more"]')
        page.click('[data-open-module-library]')
        print("checkpoint:custom", flush=True)
        # Custom module UI, Persian digits and Today integration.
        page.click("#create-custom-module")
        page.fill("#custom-module-name", "تمرین موسیقی 🎵")
        page.fill("#custom-module-icon", "♫")
        page.select_option("#custom-module-type", "time_tracker")
        page.fill("#custom-module-goal", "۱۲۰")
        page.fill("#custom-module-unit", "دقیقه")
        page.check("#custom-module-today")
        page.click("#custom-module-form .primary-button")
        page.click("#add-custom-record")
        page.fill("#custom-record-minutes", "۴۵")
        page.fill("#custom-record-seconds", "۳۰")
        page.fill("#custom-record-notes", "تمرین روزانه")
        page.click("#custom-record-form .primary-button")
        data = state(page)
        custom = next(item for item in data["data"]["customModules"] if item["name"] == "تمرین موسیقی 🎵")
        record = next(item for item in data["data"]["customModuleRecords"] if item["moduleId"] == custom["id"])
        assert record["durationSeconds"] == 2730
        page.keyboard.press("Escape")
        page.click('[data-view-target="home"]')
        assert 'تمرین موسیقی' in page.locator('#today-module-summaries').inner_text()
        outcomes["custom_module_and_today"] = True

        # Search identifies module source.
        page.keyboard.press("/")
        page.fill("#search-input", "تمرین روزانه")
        assert "تمرین موسیقی" in page.locator("#search-results").inner_text()
        page.keyboard.press("Escape")

        # Permanent deletion is cancelable, creates a backup, and removes only the named custom namespace.
        page.click('[data-view-target="more"]')
        page.click('[data-open-module-library]')
        page.click("#create-custom-module")
        page.fill("#custom-module-name", "حذف آزمایشی")
        page.fill("#custom-module-icon", "×")
        page.select_option("#custom-module-type", "list")
        page.click("#custom-module-form .primary-button")
        page.click("#manage-current-module")
        page.once("dialog", lambda dialog: dialog.dismiss())
        with page.expect_download():
            page.click("#delete-module-permanently")
        assert any(item["name"] == "حذف آزمایشی" for item in state(page)["data"]["customModules"])
        page.once("dialog", lambda dialog: dialog.accept("حذف آزمایشی"))
        with page.expect_download():
            page.click("#delete-module-permanently")
        assert not any(item["name"] == "حذف آزمایشی" for item in state(page)["data"]["customModules"])
        outcomes["permanent_delete_safety"] = True
        page.close()

        print("checkpoint:migration", flush=True)
        # Existing-user v3 migration keeps specialized records and does not force onboarding.
        preload = {"aram-planner-store-v3": encode_state(v3_fixture())}
        page, errors, console = open_app(context, preload)
        all_errors += errors; all_console += console
        assert page.locator("#onboarding-content").count() == 0
        data = state(page)
        assert data["schemaVersion"] == 5
        assert data["data"]["books"][0]["title"] == "کتاب مهاجرت"
        assert data["data"]["universityItems"][0]["title"] == "پژوهش مهاجرت"
        assert status(data, "reading") == "active" and status(data, "university") == "active" and status(data, "screen-time") == "active"
        assert page.evaluate("localStorage.getItem('aram-planner-store-v3-migration-backup') !== null")
        page.click('[data-view-target="more"]')
        page.click('[data-open-module="reading"]')
        assert "کتاب مهاجرت" in page.locator("#reading-manager").inner_text()
        page.keyboard.press("Escape")
        page.click('[data-open-module="university"]')
        assert "پژوهش مهاجرت" in page.locator("#university-manager").inner_text()
        outcomes["existing_migration_and_specialized_regression"] = True

        print("checkpoint:hidden-search", flush=True)
        # Hidden search is opt-in and clicking it opens management, not an editor.
        page.keyboard.press("Escape")
        page.click('[data-open-module-library]')
        page.click('[data-module-card="reading"] [data-module-manage]')
        page.click("#module-hide")
        page.keyboard.press("Escape")
        page.keyboard.press("/")
        page.fill("#search-input", "کتاب مهاجرت")
        assert "نتیجه‌ای پیدا نشد" in page.locator("#search-results").inner_text()
        page.check("#search-hidden-modules")
        assert "کتاب مهاجرت" in page.locator("#search-results").inner_text()
        row_module = page.locator("#search-results .search-result").get_attribute("data-module-id")
        page.click("#search-results .search-result")
        assert "مدیریت بخش" in page.locator("#sheet-kicker").inner_text()
        assert page.locator("#book-form").count() == 0
        outcomes["hidden_search_safety"] = True
        page.close()

        print("checkpoint:skip", flush=True)
        # Skip onboarding keeps all optional modules unavailable.
        page, errors, console = open_app(context)
        all_errors += errors; all_console += console
        page.click("#onboarding-skip")
        data = state(page)
        assert data["settings"]["modulePreferences"]["onboardingStatus"] == "skipped"
        assert all(status(data, module_id) == "available" for module_id in ["reading", "university", "screen-time", "work", "projects"])
        outcomes["onboarding_skip"] = True
        page.close()

        browser.close()

    return {
        "checks": outcomes,
        "page_errors": all_errors,
        "console_errors": all_console,
        "ok": all(outcomes.values()) and not all_errors and not all_console,
    }


if __name__ == "__main__":
    result = run()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["ok"] else 1)

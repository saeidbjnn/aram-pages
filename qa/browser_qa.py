#!/usr/bin/env python3
"""Chromium smoke/stress QA without a web server.
Requires Python Playwright and a Chromium executable.
"""
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
    pattern = re.compile(r"((?:from\s*|import\s*)['\"])([^'\"]+)(['\"])")
    return pattern.sub(replace, source)

def data_url(text: str, mime: str = "text/javascript") -> str:
    encoded = base64.b64encode(text.encode("utf-8")).decode("ascii")
    return f"data:{mime};base64,{encoded}"

def build_html() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    imports = {}
    for path in MODULES:
        source = rewrite_imports(path, (ROOT / path).read_text(encoding="utf-8"))
        imports[module_name(path)] = data_url(source)
    import_map = json.dumps({"imports": imports}, ensure_ascii=False)
    html = re.sub(r'<link rel="stylesheet" href="styles\.css"\s*/?>', f"<style>{css}</style>", html)
    html = re.sub(r'<script type="module" src="app\.js"></script>', '', html)
    bootstrap = """
    <script>
    (() => {
      const values = new Map();
      const storage = {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(String(key), String(value)),
        removeItem: key => values.delete(String(key)),
        clear: () => values.clear(),
        key: index => [...values.keys()][index] ?? null,
        get length() { return values.size; }
      };
      Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    })();
    </script>
    """
    module_boot = f'<script type="importmap">{import_map}</script><script type="module">import "aram:app.js";</script>'
    return html.replace('</head>', f'{bootstrap}<script type="importmap">{import_map}</script></head>').replace('</body>', f'<script type="module">import "aram:app.js";</script></body>')

def run() -> dict:
    html = build_html()
    page_errors: list[str] = []
    console_errors: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        page = context.new_page()
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.set_content(html, wait_until="domcontentloaded")
        page.wait_for_function("document.documentElement.dataset.appReady === 'true'", timeout=15_000)
        page.wait_for_timeout(250)
        if page.locator("#onboarding-content").count():
            page.click("#onboarding-skip")

        # Empty state and invalid required input.
        page.click("#quick-add")
        page.click("#quick-form .primary-button")
        assert page.locator("#bottom-sheet").get_attribute("aria-hidden") == "false"
        page.fill("#quick-title", "کار تست پایداری")
        page.click("#quick-form .primary-button")
        page.wait_for_selector(".timeline-item")
        page.click(".timeline-status")

        # Rapid navigation and theme switching.
        for _ in range(12):
            for name in ["calendar", "focus", "stats", "more", "home"]:
                page.click(f'[data-view-target="{name}"]')
        for _ in range(12):
            page.click("#theme-toggle")

        # Direction changes must not break behavior.
        page.evaluate("document.documentElement.dir = 'ltr'")
        page.click('[data-view-target="calendar"]')
        page.evaluate("document.documentElement.dir = 'rtl'")
        page.click('[data-view-target="more"]')

        # Hidden developer mode and diagnostic inspector.
        page.click('[data-open-sheet="settings"]')
        for _ in range(5):
            page.click("#app-version")
        page.wait_for_selector("#developer-root")
        page.click('[data-dev-tab="storage"]')
        page.click("#refresh-debug")
        assert page.locator("#developer-root").inner_text().find("LocalStorage") >= 0
        page.keyboard.press("Escape")
        assert page.locator("#bottom-sheet").get_attribute("aria-hidden") == "true"
        assert not page.locator(".app-shell").evaluate("node => node.inert")

        # Keyboard search shortcut and focus-trap escape.
        page.keyboard.press("/")
        page.wait_for_selector("#bottom-sheet.open")
        page.keyboard.press("Tab")
        page.keyboard.press("Escape")

        # Reduced-motion path and oversized type should remain operable.
        page.emulate_media(reduced_motion="reduce")
        page.evaluate("document.documentElement.style.fontSize = '125%'")
        page.click('[data-view-target="home"]')
        assert page.locator("#quick-add").is_visible()
        title_box = page.locator(".topbar > div:first-child").bounding_box()
        action_box = page.locator(".top-actions").bounding_box()
        heading_box = page.locator("#page-title").bounding_box()
        eyebrow_box = page.locator("#jalali-date").bounding_box()
        assert title_box and action_box and heading_box and eyebrow_box
        action_right = action_box["x"] + action_box["width"]
        assert action_right <= min(heading_box["x"], eyebrow_box["x"]) + 1

        page.evaluate("document.documentElement.style.fontSize = ''")
        page.keyboard.press("Escape")
        page.wait_for_timeout(2600)
        page.screenshot(path="/mnt/data/aram-phase3-home-preview.png", full_page=False)
        page.click("#theme-toggle")
        page.screenshot(path="/mnt/data/aram-phase3-dark-preview.png", full_page=False)

        storage_keys = page.evaluate("Array.from({length: localStorage.length}, (_, index) => localStorage.key(index))")
        record_count = page.evaluate("JSON.parse(JSON.parse(localStorage.getItem('aram-planner-store-v5')).payload).data.tasks.length")
        result = {
            "page_errors": page_errors,
            "console_errors": console_errors,
            "storage_keys": storage_keys,
            "task_count": record_count,
            "developer_mode": True,
            "rapid_navigation_cycles": 12,
            "theme_switches": 13,
            "ok": not page_errors and not console_errors and record_count == 1,
        }
        browser.close()
        return result

if __name__ == "__main__":
    output = run()
    print(json.dumps(output, ensure_ascii=False, indent=2))
    raise SystemExit(0 if output["ok"] else 1)

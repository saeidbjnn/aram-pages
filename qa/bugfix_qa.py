#!/usr/bin/env python3
"""Phase 3.1.1 browser regression QA for timer hotfixes and the original twelve bugs."""
from __future__ import annotations

import json
from playwright.sync_api import sync_playwright
from browser_qa import build_html


def stored_state(page):
    return page.evaluate("JSON.parse(JSON.parse(localStorage.getItem('aram-planner-store-v5')).payload)")


def run() -> dict:
    page_errors: list[str] = []
    console_errors: list[str] = []
    checks: dict[str, bool] = {}

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
        page.set_content(build_html(), wait_until="domcontentloaded")
        page.wait_for_function("document.documentElement.dataset.appReady === 'true'", timeout=15_000)
        # Install deterministic completion-feedback fakes before the first user activation.
        page.evaluate("""
        (() => {
          window.__timerFeedback = { sound: false, vibration: null, notification: null };
          class FakeAudioContext {
            constructor() { this.currentTime = 0; this.destination = {}; }
            resume() { return Promise.resolve(); }
            createOscillator() {
              return {
                frequency: { setValueAtTime() {} },
                connect() {},
                start() { window.__timerFeedback.sound = true; },
                stop() {}
              };
            }
            createGain() {
              return {
                gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
                connect() {}
              };
            }
          }
          Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true });
          Object.defineProperty(window, 'webkitAudioContext', { value: FakeAudioContext, configurable: true });
          Object.defineProperty(navigator, 'vibrate', {
            value: pattern => { window.__timerFeedback.vibration = pattern; return true; },
            configurable: true
          });
          class FakeAudio {
            constructor() { this.currentTime = 0; this.preload = 'auto'; }
            play() { window.__timerFeedback.sound = true; return Promise.resolve(); }
            pause() {}
          }
          Object.defineProperty(window, 'Audio', { value: FakeAudio, configurable: true });
          class FakeNotification {
            static permission = 'granted';
            constructor(title, options) { window.__timerFeedback.notification = { title, options }; }
          }
          Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
        })();
        """)
        page.wait_for_timeout(250)
        if page.locator('#onboarding-content').count():
            page.click('#onboarding-skip')

        page.click('[data-view-target="more"]')
        page.click('[data-open-sheet="settings"]')
        page.wait_for_selector('#settings-notifications')
        if page.locator('#settings-notifications').get_attribute('aria-checked') != 'true':
            page.click('#settings-notifications')
        page.click('#sheet-close')

        # BUG 1 + BUG 4: primary titles are not duplicated and empty stats explain the state.
        title_pairs = {
            "calendar": "#calendar-heading",
            "focus": "#focus-heading",
            "stats": "#stats-heading",
            "more": "#more-heading",
        }
        duplicate_free = True
        for view, heading in title_pairs.items():
            page.click(f'[data-view-target="{view}"]')
            duplicate_free &= page.locator("#page-title").inner_text().strip() != page.locator(heading).inner_text().strip()
        checks["duplicate_titles"] = duplicate_free
        page.click('[data-view-target="stats"]')
        checks["empty_statistics"] = page.locator("#stats-rings .stat-empty-card").count() == 3 and "هنوز جلسه تمرکزی" in page.locator("#stats-rings").inner_text()

        # BUG 6 + BUG 10 + BUG 5: Jalali-first date input, Persian digits and visible edit action.
        page.click('[data-view-target="home"]')
        page.click("#quick-add")
        page.wait_for_selector("#quick-form .jalali-date-input")
        checks["jalali_date_picker"] = (
            page.locator("#quick-date").get_attribute("type") == "hidden"
            and "/" in page.locator("#quick-form .jalali-date-input").first.input_value()
            and "میلادی:" in page.locator("#quick-form .jalali-date-secondary").first.inner_text()
        )
        page.fill("#quick-title", "کار رگرسیون")
        duration = page.locator("#quick-duration")
        duration.focus()
        page.keyboard.press("Control+A")
        page.keyboard.insert_text("۴۵")
        page.fill("#quick-time", "۰۹:۳۰")
        checks["persian_numeric_input"] = duration.input_value() == "45" and page.locator("#quick-time").input_value() == "09:30"
        page.click("#quick-form .primary-button")
        page.wait_for_selector(".timeline-item")
        checks["discoverable_task_edit"] = page.locator(".timeline-edit").is_visible()
        page.click(".timeline-edit")
        page.wait_for_selector("#task-form")
        checks["task_edit_action"] = "ویرایش کار" in page.locator("#sheet-title").inner_text()
        page.wait_for_timeout(360)

        # BUG 11 + BUG 12: close icon optical centering and selection policy.
        close_box = page.locator("#sheet-close").bounding_box()
        icon_box = page.locator("#sheet-close svg").bounding_box()
        checks["modal_close_alignment"] = bool(close_box and icon_box and abs((close_box["x"] + close_box["width"] / 2) - (icon_box["x"] + icon_box["width"] / 2)) < 1 and abs((close_box["y"] + close_box["height"] / 2) - (icon_box["y"] + icon_box["height"] / 2)) < 1)
        checks["text_selection"] = page.evaluate("""
          getComputedStyle(document.body).userSelect === 'none'
          && getComputedStyle(document.querySelector('#task-title')).userSelect === 'text'
        """)
        page.click("#sheet-close")
        page.dispatch_event(".timeline-item", "pointerdown", {"pointerId": 1, "clientX": 310, "clientY": 300, "pointerType": "touch"})
        page.dispatch_event(".timeline-item", "pointermove", {"pointerId": 1, "clientX": 220, "clientY": 303, "pointerType": "touch"})
        page.dispatch_event(".timeline-item", "pointerup", {"pointerId": 1, "clientX": 220, "clientY": 303, "pointerType": "touch"})
        page.wait_for_selector("#task-form")
        checks["swipe_task_edit"] = "ویرایش کار" in page.locator("#sheet-title").inner_text()
        page.click("#sheet-close")

        # Primary calendar remains Jalali, Gregorian is only secondary.
        page.click('[data-view-target="calendar"]')
        checks["jalali_primary_calendar"] = bool(page.locator("#calendar-heading").inner_text().strip() and page.locator("#gregorian-month").inner_text().strip() and "ماه جلالی" in page.locator('[data-view="calendar"] .section-kicker').first.inner_text())

        # BUG 2/3/8 + 3.1.1: exact duration, HH:MM:SS ordering, continuous progress and clean reset.
        page.click('[data-view-target="focus"]')
        page.click("[data-custom-timer]")
        page.wait_for_selector("#custom-timer-form")
        hour_box = page.locator("#custom-hours").bounding_box()
        minute_box = page.locator("#custom-minutes").bounding_box()
        second_box = page.locator("#custom-seconds").bounding_box()
        page.fill("#custom-hours", "۰۱")
        page.fill("#custom-minutes", "۰۲")
        page.fill("#custom-seconds", "۰۳")
        page.click("#custom-timer-form .primary-button")
        checks["custom_hours_minutes_seconds"] = (
            page.locator("#timer-display").inner_text() == "۰۱:۰۲:۰۳"
            and stored_state(page)["runtime"]["timer"]["durationSeconds"] == 3723
            and stored_state(page)["runtime"]["timer"]["durationSource"] == "custom"
        )
        checks["custom_duration_direction"] = bool(
            hour_box and minute_box and second_box
            and hour_box["x"] < minute_box["x"] < second_box["x"]
        )

        page.click("[data-custom-timer]")
        page.fill("#custom-hours", "۰")
        page.fill("#custom-minutes", "۰")
        page.fill("#custom-seconds", "۰۳")
        page.click("#custom-timer-form .primary-button")
        page.wait_for_function("() => document.querySelector('#timer-display')?.textContent === '۰۰:۰۳' && JSON.parse(JSON.parse(localStorage.getItem('aram-planner-store-v5')).payload).runtime.timer.durationSeconds === 3", timeout=3_000)
        checks["custom_short_duration"] = page.locator("#timer-display").inner_text() == "۰۰:۰۳" and stored_state(page)["runtime"]["timer"]["durationSeconds"] == 3

        page.click("#timer-start")
        page.wait_for_timeout(550)
        running_progress = float(page.locator("#focus-ring").evaluate("node => getComputedStyle(node).getPropertyValue('--progress') || node.style.getPropertyValue('--progress')"))
        page.click("#timer-pause")
        paused_progress = float(page.locator("#focus-ring").evaluate("node => node.style.getPropertyValue('--progress')"))
        page.wait_for_timeout(450)
        paused_later = float(page.locator("#focus-ring").evaluate("node => node.style.getPropertyValue('--progress')"))
        page.click("#timer-start")
        page.wait_for_timeout(350)
        resumed_progress = float(page.locator("#focus-ring").evaluate("node => node.style.getPropertyValue('--progress')"))
        checks["real_elapsed_progress"] = 0 < running_progress < 95
        checks["pause_resume_continuity"] = abs(paused_progress - paused_later) < 0.2 and resumed_progress > paused_progress
        page.click("#timer-stop")
        page.wait_for_timeout(180)
        reset_progress = float(page.locator("#focus-ring").evaluate("node => node.style.getPropertyValue('--progress')"))
        checks["smooth_reset"] = reset_progress == 0 and not page.locator("#focus-ring").evaluate("node => node.classList.contains('timer-complete')")

        # BUG 7 + BUG 9 + 3.1.1: completion is never silent and custom work timers never launch a preset.
        page.click('[data-timer-mode="work"]')
        page.click("[data-custom-timer]")
        page.fill("#custom-hours", "۰")
        page.fill("#custom-minutes", "۰")
        page.fill("#custom-seconds", "۰۱")
        page.click("#custom-timer-form .primary-button")
        before_sessions = len(stored_state(page)["data"]["focusSessions"])
        page.evaluate("""
          window.__completionAnimated = false;
          new MutationObserver(() => {
            if (document.querySelector('#focus-ring').classList.contains('timer-complete')) window.__completionAnimated = true;
          }).observe(document.querySelector('#focus-ring'), { attributes: true, attributeFilter: ['class'] });
        """)
        page.click("#timer-start")
        page.wait_for_function("expected => JSON.parse(JSON.parse(localStorage.getItem('aram-planner-store-v5')).payload).data.focusSessions.length === expected + 1", arg=before_sessions, timeout=10_000)
        feedback_during_animation = page.evaluate("({ feedback: window.__timerFeedback, announcement: document.querySelector('#timer-announcement').textContent, animated: window.__completionAnimated })")
        after = stored_state(page)
        page.wait_for_timeout(1200)
        final = stored_state(page)
        checks["completion_feedback"] = bool(
            feedback_during_animation["feedback"]["sound"]
            and feedback_during_animation["feedback"]["vibration"]
            and feedback_during_animation["feedback"]["notification"]
            and "به پایان رسید" in feedback_during_animation["announcement"]
            and feedback_during_animation["animated"]
        )
        checks["no_unexpected_restart"] = (
            after["runtime"]["timer"]["status"] == "idle"
            and final["runtime"]["timer"]["status"] == "idle"
            and final["runtime"]["timer"]["mode"] == "workbreak"
            and final["runtime"]["timer"]["phase"] == "work"
            and final["runtime"]["timer"]["durationSeconds"] == 1
            and final["runtime"]["timer"]["durationSource"] == "custom"
            and len(after["data"]["focusSessions"]) == before_sessions + 1
            and len(final["data"]["focusSessions"]) == before_sessions + 1
        )

        # Requested broad regressions: nav, themes, RTL and persisted data remain functional.
        for view in ["home", "calendar", "focus", "stats", "more", "home"]:
            page.click(f'[data-view-target="{view}"]')
        initial_theme = page.locator("html").get_attribute("data-theme")
        page.click("#theme-toggle")
        toggled_theme = page.locator("html").get_attribute("data-theme")
        page.click("#theme-toggle")
        checks["navigation_theme_rtl"] = initial_theme != toggled_theme and page.locator("html").get_attribute("dir") == "rtl" and page.locator(".bottom-nav").is_visible()
        checks["persistence_storage"] = len(stored_state(page)["data"]["tasks"]) == 1 and len(stored_state(page)["data"]["focusSessions"]) == before_sessions + 1

        checks["no_runtime_errors"] = not page_errors and not console_errors
        result = {
            "checks": checks,
            "passed": sum(1 for value in checks.values() if value),
            "total": len(checks),
            "page_errors": page_errors,
            "console_errors": console_errors,
            "ok": all(checks.values()) and not page_errors and not console_errors,
        }
        browser.close()
        return result


if __name__ == "__main__":
    output = run()
    print(json.dumps(output, ensure_ascii=False, indent=2))
    raise SystemExit(0 if output["ok"] else 1)

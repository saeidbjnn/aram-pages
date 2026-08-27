#!/usr/bin/env python3
"""Browser-level contract QA for the Capacitor iOS bridge using a deterministic fake native plugin."""
from __future__ import annotations
import json
from playwright.sync_api import sync_playwright
from browser_qa import build_html

FAKE_NATIVE = r'''
<script>
window.__aramNativeCalls = [];
const record = (name, payload = null) => { window.__aramNativeCalls.push({ name, payload: payload ? structuredClone(payload) : null }); };
globalThis.Capacitor = {
  isNativePlatform: () => true,
  getPlatform: () => 'ios',
  Plugins: {
    AramNativeTimer: {
      async getCapabilities() { record('getCapabilities'); return { notificationsSupported:true, notificationPermission:'prompt', liveActivitiesSupported:true, liveActivitiesEnabledBySystem:true, hapticsSupported:true, soundPreviewSupported:true, iosVersion:'18.0' }; },
      async requestNotificationPermission() { record('requestNotificationPermission'); this.getCapabilities = async () => ({ notificationsSupported:true, notificationPermission:'granted', liveActivitiesSupported:true, liveActivitiesEnabledBySystem:true, hapticsSupported:true, soundPreviewSupported:true, iosVersion:'18.0' }); return { permission:'granted' }; },
      async openNotificationSettings() { record('openNotificationSettings'); },
      async syncTimer(payload) { record('syncTimer', payload); },
      async completeTimer(payload) { record('completeTimer', payload); },
      async previewSound(payload) { record('previewSound', payload); },
      async stopSoundPreview() { record('stopSoundPreview'); }
    }
  }
};
</script>
'''

def run():
    html = build_html().replace('</head>', FAKE_NATIVE + '</head>')
    errors, console = [], []
    checks = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':390,'height':844})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: console.append(m.text) if m.type == 'error' else None)
        page.set_content(html, wait_until='domcontentloaded')
        page.wait_for_function("document.documentElement.dataset.appReady === 'true'", timeout=15000)
        page.wait_for_timeout(300)
        if page.locator('#onboarding-content').count():
            page.click('#onboarding-skip')
            page.wait_for_timeout(150)

        page.click('[data-view-target="more"]')
        page.click('[data-open-sheet="settings"]')
        page.wait_for_selector('#settings-live-activity')
        checks['native_settings_visible'] = page.locator('#settings-live-activity').count() == 1 and page.locator('#settings-notifications').count() == 1
        page.click('#settings-notifications')
        page.wait_for_selector('#notification-enable')
        page.click('#notification-enable')
        page.wait_for_selector('#settings-timer-sound')
        checks['contextual_permission'] = page.evaluate("window.__aramNativeCalls.some(x => x.name === 'requestNotificationPermission')")
        page.select_option('#settings-timer-sound', 'chime')
        page.wait_for_timeout(100)
        checks['native_sound_preview'] = page.evaluate("window.__aramNativeCalls.some(x => x.name === 'previewSound' && x.payload.sound === 'chime')")
        page.click('#sheet-close')

        page.click('[data-view-target="focus"]')
        page.click('[data-custom-timer]')
        page.fill('#custom-hours','0'); page.fill('#custom-minutes','0'); page.fill('#custom-seconds','03')
        page.click('#custom-timer-form .primary-button')
        page.click('#timer-start')
        page.wait_for_timeout(350)
        page.click('#timer-pause')
        page.wait_for_timeout(100)
        page.click('#timer-start')
        page.wait_for_timeout(100)
        page.click('#timer-stop')
        page.wait_for_timeout(200)
        reasons = page.evaluate("window.__aramNativeCalls.filter(x => x.name === 'syncTimer').map(x => x.payload.reason)")
        checks['lifecycle_sync'] = all(reason in reasons for reason in ['start','pause','resume','stop'])
        syncs = page.evaluate("window.__aramNativeCalls.filter(x => x.name === 'syncTimer').map(x => x.payload)")
        start = next((x for x in syncs if x['reason'] == 'start'), None)
        checks['timestamp_payload'] = bool(start and start['timer']['expectedEndDate'] and start['timer']['sessionId'] and start['timer']['totalDurationSeconds'] == 3)
        checks['no_runtime_errors'] = not errors and not console
        browser.close()
    return {'checks':checks,'page_errors':errors,'console_errors':console,'ok':all(checks.values())}

if __name__ == '__main__':
    result=run(); print(json.dumps(result, ensure_ascii=False, indent=2)); raise SystemExit(0 if result['ok'] else 1)

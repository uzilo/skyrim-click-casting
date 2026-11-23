import os
from playwright.sync_api import sync_playwright

url = 'file:///' + os.path.abspath('LOTD_SSE_v6_Checklist.html').replace('\\', '/')
with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1. Test normal load (HUD must not exist: zero overhead)
    page = browser.new_page()
    page.goto(url)
    page.wait_for_selector('.dashboard-card')
    hud_exists = page.evaluate("() => document.getElementById('perf-hud') !== null")
    print('HUD without ?perf=1 exists:', hud_exists)

    # 2. Test ?perf=1 load (HUD must exist and display stats)
    page2 = browser.new_page()
    page2.goto(url + '?perf=1')
    page2.wait_for_selector('#perf-hud')
    stats = page2.evaluate("() => window.PerfHUD ? window.PerfHUD.getStats() : null")
    print('HUD with ?perf=1 stats:', stats)

    # 3. Test long-press on header logo
    page3 = browser.new_page()
    page3.goto(url)
    page3.wait_for_selector('.dashboard-card')
    # simulate mouse down for 3.1s
    page3.evaluate("""() => {
        const header = document.querySelector('.brand-area') || document.querySelector('header');
        header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    }""")
    page3.wait_for_timeout(3200)
    hud_longpress = page3.evaluate("() => document.getElementById('perf-hud') !== null")
    print('HUD after 3s long-press exists:', hud_longpress)

    browser.close()

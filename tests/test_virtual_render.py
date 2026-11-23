import os
from playwright.sync_api import sync_playwright

def test_virtual_render():
    url = 'file:///' + os.path.abspath('LOTD_SSE_v6_Checklist.html').replace('\\', '/')
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 393, 'height': 851})
        page.goto(url, timeout=60000)
        page.wait_for_selector('.dashboard-card', timeout=60000)

        # 1. Verify DOM Node count is <= 2500
        dom_count = page.evaluate("() => document.querySelectorAll('*').length")
        print(f"Current DOM Node Count: {dom_count}")
        assert dom_count <= 2500, f"DOM node count {dom_count} exceeds budget 2,500!"

        # 2. Verify Tier 3 is lazy (not pre-rendered in first visible item)
        first_row_has_tier3 = page.evaluate("""() => {
            const firstRow = document.querySelector('.item-row');
            return firstRow ? firstRow.querySelector('.item-tier-3') !== null : false;
        }""")
        print(f"First row has pre-rendered Tier 3: {first_row_has_tier3}")
        assert not first_row_has_tier3, "Tier 3 should NOT be pre-rendered!"

        # 3. Test clicking 'Chi tiết ▼' lazily creates Tier 3
        page.evaluate("""() => {
            const btn = document.querySelector('.btn-toggle-tier3');
            if (btn) btn.click();
        }""")
        tier3_created = page.evaluate("""() => {
            const firstRow = document.querySelector('.item-row');
            const t3 = firstRow ? firstRow.querySelector('.item-tier-3') : null;
            return t3 !== null && firstRow.classList.contains('tier3-open');
        }""")
        print(f"Tier 3 created lazily on click: {tier3_created}")
        assert tier3_created, "Tier 3 must be created on click!"

        # 4. Test TOC Jump to a faraway location
        print("Testing TOC Jump to faraway location...")
        jump_success = page.evaluate("""() => {
            const locSlug = 'The_Rift__The_Rift';
            UIRenderer.scrollToLocation(locSlug);
            const card = document.getElementById(`loc_${locSlug}`);
            return card && card.querySelectorAll('.item-row').length > 0;
        }""")
        print(f"TOC Jump mounted target card and items: {jump_success}")
        assert jump_success, "TOC Jump must mount the target card and its items!"

        browser.close()
    print("ALL TASK 1 VIRTUAL RENDER TESTS PASSED!")

if __name__ == '__main__':
    test_virtual_render()

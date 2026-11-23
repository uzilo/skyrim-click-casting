import os
from playwright.sync_api import sync_playwright

def test_localized_state():
    url = 'file:///' + os.path.abspath('LOTD_SSE_v6_Checklist.html').replace('\\', '/')
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 393, 'height': 851})
        page.goto(url, timeout=60000)
        page.wait_for_selector('.dashboard-card', timeout=60000)

        # 1. Test ticking an item row updates DOM locally without calling renderContent
        tick_res = page.evaluate("""() => {
            let renderContentCalls = 0;
            const origRender = UIRenderer.renderContent;
            UIRenderer.renderContent = function(...args) {
                renderContentCalls++;
                return origRender.apply(this, args);
            };

            const box = document.querySelector('.item-checkbox-wrapper');
            const row = document.querySelector('.item-row');
            const initialChecked = row ? row.classList.contains('is-checked') : false;

            if (box) box.click();

            const isCheckedAfter = row ? row.classList.contains('is-checked') : false;
            return {
                initialChecked,
                isCheckedAfter,
                renderContentCalls
            };
        }""")

        print(f"Tick test: before={tick_res['initialChecked']}, after={tick_res['isCheckedAfter']}, renderCalls={tick_res['renderContentCalls']}")
        assert tick_res['isCheckedAfter'] != tick_res['initialChecked'], "Item row must toggle checked status!"
        assert tick_res['renderContentCalls'] == 0, f"Expected 0 renderContent calls on tick, got {tick_res['renderContentCalls']}!"

        browser.close()
    print("ALL TASK 3 LOCALIZED STATE TESTS PASSED!")

if __name__ == '__main__':
    test_localized_state()

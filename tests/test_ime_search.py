import os
from playwright.sync_api import sync_playwright

def test_ime_search():
    url = 'file:///' + os.path.abspath('LOTD_SSE_v6_Checklist.html').replace('\\', '/')
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(url, timeout=60000)
        page.wait_for_selector('.dashboard-card', timeout=60000)

        # 1. Test IME composition shielding with realistic typing delay
        page.evaluate("""() => {
            window.__filterCalls = 0;
            const origFilter = FilterEngine.filter;
            FilterEngine.filter = function(...args) {
                window.__filterCalls++;
                return origFilter.apply(this, args);
            };
            const input = document.getElementById('header-search-input');
            input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
            input.value = 'k';
            input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
        }""")
        page.wait_for_timeout(220)
        page.evaluate("""() => {
            const input = document.getElementById('header-search-input');
            input.value = 'ki';
            input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
        }""")
        page.wait_for_timeout(220)
        page.evaluate("""() => {
            const input = document.getElementById('header-search-input');
            input.value = 'kie';
            input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
        }""")
        page.wait_for_timeout(220)

        calls_during = page.evaluate("() => window.__filterCalls")
        print(f"Filter calls during composition: {calls_during}")
        assert calls_during == 0, f"Expected 0 filter calls during composition, got {calls_during}!"

        # Dispatch compositionend with final text
        page.evaluate("""() => {
            const input = document.getElementById('header-search-input');
            input.value = 'kiếm';
            input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'kiếm' }));
        }""")

        # Wait for debounce after compositionend
        page.wait_for_timeout(350)
        final_search = page.evaluate("() => AppState.getState().filters.search")
        print(f"Final search value in state: {final_search}")
        assert final_search == 'kiếm', f"Expected 'kiếm', got '{final_search}'!"

        browser.close()
    print("ALL TASK 2 IME SEARCH TESTS PASSED!")

if __name__ == '__main__':
    test_ime_search()

import os
from playwright.sync_api import sync_playwright

def test_scrollspy():
    url = 'file:///' + os.path.abspath('LOTD_SSE_v6_Checklist.html').replace('\\', '/')
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 393, 'height': 851})
        page.goto(url, timeout=60000)
        page.wait_for_selector('.dashboard-card', timeout=60000)

        # 1. Test SeenObserver is active and tracks location
        debug = page.evaluate("""() => ({
            hasSeenObserver: typeof SeenObserver !== 'undefined',
            hasSetCurrentLocation: typeof SeenObserver.setCurrentLocation === 'function',
            currentLoc: SeenObserver.getCurrentLocation(),
            firstCardId: document.querySelector('.location-card') ? document.querySelector('.location-card').id : null
        })""")
        print("Initial debug:", debug)
        loc = debug['currentLoc']
        print(f"Current visible location after scroll: {loc}")

        # 2. Test fling scroll from top to 10000px
        page.evaluate("""() => {
            window.scrollTo({ top: 12000, behavior: 'instant' });
        }""")
        page.wait_for_timeout(400)

        loc_after_fling = page.evaluate("() => SeenObserver.getCurrentLocation()")
        print(f"Location after fling scroll: {loc_after_fling}")
        assert loc_after_fling is not None, "Location must be tracked during fling scroll!"

        browser.close()
    print("ALL TASK 5 SCROLLSPY TESTS PASSED!")

if __name__ == '__main__':
    test_scrollspy()

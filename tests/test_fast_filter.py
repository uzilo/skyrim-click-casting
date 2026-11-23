import os
from playwright.sync_api import sync_playwright

def test_fast_filter():
    url = 'file:///' + os.path.abspath('LOTD_SSE_v6_Checklist.html').replace('\\', '/')
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(url, timeout=60000)
        page.wait_for_selector('.dashboard-card', timeout=60000)

        # 1. Benchmark 10 consecutive searches and check duration
        timings = page.evaluate("""() => {
            const queries = ['iron', 'sword', 'daedric', 'cuirass', 'iron', 'gold', 'relic', 'ancient', 'iron', 'kiếm'];
            const durations = [];
            for (const q of queries) {
                const t0 = performance.now();
                const res = FilterEngine.filter({ facets: {}, search: q });
                durations.append ? durations.append(performance.now() - t0) : durations.push(performance.now() - t0);
            }
            return durations;
        }""")

        avg_dur = sum(timings) / len(timings)
        print(f"Filter timings for 10 queries: {[round(t, 2) for t in timings]}")
        print(f"Average query duration: {avg_dur:.2f}ms")
        assert avg_dur < 20, f"Average query duration {avg_dur}ms exceeds 20ms threshold!"

        browser.close()
    print("ALL TASK 4 FILTER TESTS PASSED!")

if __name__ == '__main__':
    test_fast_filter()

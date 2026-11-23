import os
import time
import json
import numpy as np
from playwright.sync_api import sync_playwright

PIXEL_5_DEVICE = {
    'viewport': {'width': 393, 'height': 851},
    'user_agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'device_scale_factor': 2.75,
    'is_mobile': True,
    'has_touch': True
}

def inject_perf_harness(page):
    page.add_init_script("""
        window.__perf = {
            longTasks: [],
            events: [],
            frameDrops: 0,
            fpsHistory: []
        };
        try {
            new PerformanceObserver((list) => {
                for (const e of list.getEntries()) {
                    window.__perf.longTasks.push({ duration: e.duration, startTime: e.startTime });
                }
            }).observe({ type: 'longtask', buffered: true });

            new PerformanceObserver((list) => {
                for (const e of list.getEntries()) {
                    if (e.duration > 16) {
                        window.__perf.events.push({
                            name: e.name,
                            duration: e.duration,
                            processingStart: e.processingStart,
                            processingEnd: e.processingEnd,
                            startTime: e.startTime
                        });
                    }
                }
            }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
        } catch (err) {}
    """)

def run_scenario_s1(target_url, cpu_rate, iterations=5):
    """S1: Cold Load: TTI, TBT, Parse time, DOM count, JS Heap"""
    tbt_list = []
    load_time_list = []
    dom_count = 0
    heap_mb = 0

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for _ in range(iterations):
            context = browser.new_context(**PIXEL_5_DEVICE)
            page = context.new_page()
            inject_perf_harness(page)
            client = context.new_cdp_session(page)
            client.send('Emulation.setCPUThrottlingRate', {'rate': cpu_rate})

            t0 = time.time()
            page.goto(target_url, timeout=120000)
            page.wait_for_selector('.item-row', timeout=120000)
            elapsed = (time.time() - t0) * 1000
            load_time_list.append(elapsed)

            metrics = page.evaluate("""() => {
                const lt = window.__perf.longTasks || [];
                const tbt = lt.reduce((sum, t) => sum + (t.duration > 50 ? t.duration - 50 : 0), 0);
                const dom = document.querySelectorAll('*').length;
                const heap = (window.performance && window.performance.memory) ? window.performance.memory.usedJSHeapSize / (1024*1024) : 0;
                return { tbt, dom, heap };
            }""")
            tbt_list.append(metrics['tbt'])
            dom_count = metrics['dom']
            heap_mb = metrics['heap']
            context.close()
        browser.close()

    return {
        "load_time_p50": float(np.percentile(load_time_list, 50)),
        "load_time_p95": float(np.percentile(load_time_list, 95)),
        "tbt_p50": float(np.percentile(tbt_list, 50)),
        "tbt_p95": float(np.percentile(tbt_list, 95)),
        "dom_nodes": dom_count,
        "js_heap_mb": round(heap_mb, 1)
    }

def run_benchmarks(target_html_path, cpu_rates=[4, 6], runs=5):
    abs_path = os.path.abspath(target_html_path).replace('\\', '/')
    target_url = f"file:///{abs_path}"
    print(f"Benchmarking: {target_url} (runs={runs})", flush=True)

    results = {}
    if os.path.exists('perf/baseline_metrics.json'):
        try:
            with open('perf/baseline_metrics.json', 'r', encoding='utf-8') as f:
                results = json.load(f)
        except Exception:
            results = {}

    def save_checkpoint(rk, sk, data):
        if rk not in results:
            results[rk] = {}
        results[rk][sk] = data
        with open('perf/baseline_metrics.json', 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

    for rate in cpu_rates:
        print(f"\n--- Testing CPU Throttling Rate: x{rate} ---", flush=True)
        rate_key = f"x{rate}"
        if rate_key not in results:
            results[rate_key] = {}

        # ---------------------------------------------------------
        # S1: Cold Load
        # ---------------------------------------------------------
        if "S1_ColdLoad" not in results[rate_key]:
            print("Running S1: Cold Load...", flush=True)
            s1_res = run_scenario_s1(target_url, rate, runs)
            save_checkpoint(rate_key, "S1_ColdLoad", s1_res)
            print(f"  S1: Load p50={s1_res['load_time_p50']:.1f}ms, p95={s1_res['load_time_p95']:.1f}ms | TBT p50={s1_res['tbt_p50']:.1f}ms, p95={s1_res['tbt_p95']:.1f}ms | DOM={s1_res['dom_nodes']:,}", flush=True)
        else:
            print("  S1: Already measured, skipping...", flush=True)

        # Open page for interaction tests (S2 to S12)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(**PIXEL_5_DEVICE)
            page = context.new_page()
            inject_perf_harness(page)
            client = context.new_cdp_session(page)
            client.send('Emulation.setCPUThrottlingRate', {'rate': rate})
            page.goto(target_url, timeout=120000)
            page.wait_for_selector('.item-row', timeout=120000)

            # Helper to measure action block
            def measure_action(action_fn, n_runs=runs):
                durations = []
                tbts = []
                for _ in range(n_runs):
                    page.evaluate("() => { window.__perf.longTasks = []; window.__perf.events = []; }")
                    t0 = time.time()
                    action_fn()
                    time.sleep(0.5) # allow paint & microtasks to settle
                    elapsed = (time.time() - t0 - 0.5) * 1000
                    durations.append(max(0, elapsed))
                    tbt = page.evaluate("() => (window.__perf.longTasks || []).reduce((sum, t) => sum + (t.duration > 50 ? t.duration - 50 : 0), 0)")
                    tbts.append(tbt)
                return {
                    "duration_p50": float(np.percentile(durations, 50)),
                    "duration_p95": float(np.percentile(durations, 95)),
                    "tbt_p50": float(np.percentile(tbts, 50)),
                    "tbt_p95": float(np.percentile(tbts, 95))
                }

            # ---------------------------------------------------------
            # S2: Type 'iron sword' (80ms key interval)
            # ---------------------------------------------------------
            if "S2_SearchType" not in results[rate_key]:
                print("Running S2: Search typing 'iron sword'...", flush=True)
                search_input = page.locator('#header-search-input')
                def s2_action():
                    search_input.fill('')
                    for char in 'iron sword':
                        search_input.type(char, delay=80)
                s2_res = measure_action(s2_action, runs)
                save_checkpoint(rate_key, "S2_SearchType", s2_res)
                print(f"  S2: Duration p50={s2_res['duration_p50']:.1f}ms | TBT p50={s2_res['tbt_p50']:.1f}ms, p95={s2_res['tbt_p95']:.1f}ms", flush=True)
            else:
                print("  S2: Already measured, skipping...", flush=True)

            # ---------------------------------------------------------
            # S3: Vietnamese Composition (Telex/VNI simulation)
            # ---------------------------------------------------------
            if "S3_VietnameseComposition" not in results[rate_key]:
                print("Running S3: Vietnamese Telex composition...", flush=True)
                def s3_action():
                    page.evaluate("""() => {
                        const input = document.getElementById('header-search-input');
                        input.focus();
                        input.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
                        input.value = 'kiểm';
                        input.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'kiểm' }));
                        input.dispatchEvent(new CompositionEvent('compositionend', { data: 'kiểm' }));
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }""")
                s3_res = measure_action(s3_action, runs)
                save_checkpoint(rate_key, "S3_VietnameseComposition", s3_res)
                print(f"  S3: Duration p50={s3_res['duration_p50']:.1f}ms | TBT p50={s3_res['tbt_p50']:.1f}ms", flush=True)
            else:
                print("  S3: Already measured, skipping...", flush=True)

            # ---------------------------------------------------------
            # S4: Clear search keyword back to full list
            # ---------------------------------------------------------
            if "S4_ClearSearch" not in results[rate_key]:
                print("Running S4: Clear search keyword...", flush=True)
                def s4_action():
                    page.evaluate("() => { const input = document.getElementById('header-search-input'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }")
                s4_res = measure_action(s4_action, runs)
                save_checkpoint(rate_key, "S4_ClearSearch", s4_res)
                print(f"  S4: Duration p50={s4_res['duration_p50']:.1f}ms | TBT p50={s4_res['tbt_p50']:.1f}ms", flush=True)
            else:
                print("  S4: Already measured, skipping...", flush=True)

            # ---------------------------------------------------------
            # S5: Open filter panel, toggle 3 facets, apply, clear
            # ---------------------------------------------------------
            if "S5_FilterPanelInteraction" not in results[rate_key]:
                print("Running S5: Filter panel interaction...", flush=True)
                def s5_action():
                    page.evaluate("() => document.getElementById('m-nav-filter').click()")
                    time.sleep(0.2)
                    page.evaluate("""() => {
                        const boxes = document.querySelectorAll('#facet-controls-container input[type="checkbox"]');
                        if (boxes[0]) { boxes[0].click(); }
                        if (boxes[1]) { boxes[1].click(); }
                        if (boxes[2]) { boxes[2].click(); }
                    }""")
                    time.sleep(0.5)
                    page.evaluate("() => AppState.updateFilters({ facets: { type:[], hold:[], loc:[], quest:[], sp:[], acq:[], hall:[], status:[] }, search: '' })")
                    time.sleep(0.3)
                    page.evaluate("() => document.getElementById('m-nav-filter').click()")
                s5_res = measure_action(s5_action, runs)
                save_checkpoint(rate_key, "S5_FilterPanelInteraction", s5_res)
                print(f"  S5: Duration p50={s5_res['duration_p50']:.1f}ms | TBT p50={s5_res['tbt_p50']:.1f}ms", flush=True)
            else:
                print("  S5: Already measured, skipping...", flush=True)

            # ---------------------------------------------------------
            # S6: Change filter while in middle of list
            # ---------------------------------------------------------
            if "S6_FilterMiddleList" not in results[rate_key]:
                print("Running S6: Filter in middle of list...", flush=True)
                page.evaluate("() => window.scrollTo(0, 15000)")
                def s6_action():
                    page.evaluate("() => AppState.updateFilters({ facets: { sp: ['lotd'] } })")
                    time.sleep(0.3)
                    page.evaluate("() => AppState.updateFilters({ facets: { sp: [] } })")
                    time.sleep(0.3)
                s6_res = measure_action(s6_action, runs)
                save_checkpoint(rate_key, "S6_FilterMiddleList", s6_res)
                print(f"  S6: Duration p50={s6_res['duration_p50']:.1f}ms | TBT p50={s6_res['tbt_p50']:.1f}ms", flush=True)
            else:
                print("  S6: Already measured, skipping...", flush=True)

            # ---------------------------------------------------------
            # S7: Toggle 'Hide checked items' (~2000 checked simulated)
            # ---------------------------------------------------------
            if "S7_ToggleHideChecked2000" not in results[rate_key]:
                print("Running S7: Toggle hide checked items with ~2000 checked...", flush=True)
                page.evaluate("""() => {
                    const items = JSON.parse(document.getElementById('lotd-embedded-data').textContent);
                    const ids = items.slice(0, 2000).map(it => it.id);
                    AppState.setBatchChecked(ids, true);
                }""")
                time.sleep(2.0)

                def s7_action():
                    page.evaluate("() => document.getElementById('m-nav-hide').click()")
                    time.sleep(0.8)
                    page.evaluate("() => document.getElementById('m-nav-hide').click()")
                    time.sleep(0.8)
                s7_res = measure_action(s7_action, runs)
                save_checkpoint(rate_key, "S7_ToggleHideChecked2000", s7_res)
                print(f"  S7: Duration p50={s7_res['duration_p50']:.1f}ms | TBT p50={s7_res['tbt_p50']:.1f}ms", flush=True)
            else:
                print("  S7: Already measured, skipping...", flush=True)

            # ---------------------------------------------------------
            # S8: Tick 1 item; Tick all in group; Undo
            # ---------------------------------------------------------
            if "S8_TickAndBatchUndo" not in results[rate_key]:
                print("Running S8: Tick item & batch tick group...", flush=True)
                def s8_action():
                    page.evaluate("() => { const box = document.querySelector('.item-check-box'); if (box) box.click(); }")
                    time.sleep(0.2)
                    page.evaluate("() => { const btn = document.querySelector('.location-actions-btn'); if (btn) btn.click(); }")
                    time.sleep(0.3)
                    page.evaluate("() => { const uBtn = document.querySelector('.undo-toast-banner button'); if (uBtn) uBtn.click(); }")
                    time.sleep(0.2)
                s8_res = measure_action(s8_action, runs)
                save_checkpoint(rate_key, "S8_TickAndBatchUndo", s8_res)
                print(f"  S8: Duration p50={s8_res['duration_p50']:.1f}ms | TBT p50={s8_res['tbt_p50']:.1f}ms", flush=True)
            else:
                print("  S8: Already measured, skipping...", flush=True)

            # ---------------------------------------------------------
            # S9: Fast fling scroll top to bottom with seen tracking
            # ---------------------------------------------------------
            if "S9_FlingScroll" not in results[rate_key]:
                print("Running S9: Fast fling scroll...", flush=True)
                def s9_action():
                    page.evaluate("""() => {
                        let y = 0;
                        const maxH = document.body.scrollHeight;
                        const step = 800;
                        const intv = setInterval(() => {
                            y += step;
                            window.scrollTo(0, y);
                            if (y >= maxH || y >= 40000) clearInterval(intv);
                        }, 16);
                    }""")
                    time.sleep(1.0)
                s9_res = measure_action(s9_action, runs)
                save_checkpoint(rate_key, "S9_FlingScroll", s9_res)
                print(f"  S9: Duration p50={s9_res['duration_p50']:.1f}ms | TBT p50={s9_res['tbt_p50']:.1f}ms", flush=True)
            else:
                print("  S9: Already measured, skipping...", flush=True)

            # ---------------------------------------------------------
            # S10: TOC interaction & jump
            # ---------------------------------------------------------
            if "S10_TOCJump" not in results[rate_key]:
                print("Running S10: TOC open and jump...", flush=True)
                def s10_action():
                    page.evaluate("() => document.getElementById('m-nav-toc').click()")
                    time.sleep(0.2)
                    page.evaluate("() => { const item = document.querySelector('.toc-loc-item'); if (item) item.click(); }")
                    time.sleep(0.4)
                    page.evaluate("() => document.getElementById('m-nav-toc').click()")
                    time.sleep(0.2)
                s10_res = measure_action(s10_action, runs)
                save_checkpoint(rate_key, "S10_TOCJump", s10_res)
                print(f"  S10: Duration p50={s10_res['duration_p50']:.1f}ms | TBT p50={s10_res['tbt_p50']:.1f}ms", flush=True)
            else:
                print("  S10: Already measured, skipping...", flush=True)

            # ---------------------------------------------------------
            # S11: Expand Tier 3 accordion
            # ---------------------------------------------------------
            if "S11_ExpandTier3" not in results[rate_key]:
                print("Running S11: Expand Tier 3 (10 rows)...", flush=True)
                def s11_action():
                    page.evaluate("""() => {
                        const btns = document.querySelectorAll('.btn-toggle-tier3');
                        for (let i = 0; i < Math.min(10, btns.length); i++) btns[i].click();
                    }""")
                s11_res = measure_action(s11_action, runs)
                save_checkpoint(rate_key, "S11_ExpandTier3", s11_res)
                print(f"  S11: Duration p50={s11_res['duration_p50']:.1f}ms | TBT p50={s11_res['tbt_p50']:.1f}ms", flush=True)
            else:
                print("  S11: Already measured, skipping...", flush=True)

            # ---------------------------------------------------------
            # S12: Resume after reload (with filters & scroll in middle)
            # ---------------------------------------------------------
            if "S12_ResumeReload" not in results[rate_key]:
                print("Running S12: Resume after reload...", flush=True)
                page.evaluate("() => { AppState.updateFilters({ facets: { sp: ['base'] } }); AppState.setResumePoint('Whiterun_Hold__Bleak_Falls_Barrow', 'LOTD_Dragonstone'); }")
                time.sleep(1.0)
                def s12_action():
                    page.reload(timeout=120000)
                    page.wait_for_selector('.item-row', timeout=120000)
                    time.sleep(1.0)
                    page.evaluate("() => { const rBtn = document.querySelector('#resume-floating-banner button'); if (rBtn) rBtn.click(); }")
                    time.sleep(0.5)
                s12_res = measure_action(s12_action, runs)
                save_checkpoint(rate_key, "S12_ResumeReload", s12_res)
                print(f"  S12: Duration p50={s12_res['duration_p50']:.1f}ms | TBT p50={s12_res['tbt_p50']:.1f}ms", flush=True)
            else:
                print("  S12: Already measured, skipping...", flush=True)

            context.close()
            browser.close()

    return results

if __name__ == '__main__':
    target = 'archive/LOTD_SSE_v6_Checklist.before-perf.html'
    data = run_benchmarks(target, cpu_rates=[4, 6], runs=5)
    with open('perf/baseline_metrics.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("\nBenchmark complete! Saved metrics to perf/baseline_metrics.json")

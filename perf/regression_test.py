import os
import json
import random
from playwright.sync_api import sync_playwright

TEST_QUERIES = [
    # 1-10: Basic search terms
    {"search": "iron", "facets": {}},
    {"search": "sword", "facets": {}},
    {"search": "dragon", "facets": {}},
    {"search": "daedric", "facets": {}},
    {"search": "ancient", "facets": {}},
    {"search": "relic", "facets": {}},
    {"search": "gold", "facets": {}},
    {"search": "saarthal", "facets": {}},
    {"search": "bleak falls", "facets": {}},
    {"search": "cuirass", "facets": {}},

    # 11-20: Vietnamese accented and unaccented terms
    {"search": "kiếm", "facets": {}},
    {"search": "giáp", "facets": {}},
    {"search": "rìu", "facets": {}},
    {"search": "mũ", "facets": {}},
    {"search": "sách", "facets": {}},
    {"search": "vương miện", "facets": {}},
    {"search": "kiem", "facets": {}},
    {"search": "giap", "facets": {}},
    {"search": "nhẫn", "facets": {}},
    {"search": "bùa", "facets": {}},

    # 21-30: Single facet filters
    {"search": "", "facets": {"hold": ["Whiterun Hold"]}},
    {"search": "", "facets": {"hold": ["Haafingar (Solitude)"]}},
    {"search": "", "facets": {"type": ["Armor"]}},
    {"search": "", "facets": {"type": ["Weapon"]}},
    {"search": "", "facets": {"type": ["Book"]}},
    {"search": "", "facets": {"sp": ["base"]}},
    {"search": "", "facets": {"sp": ["lotd"]}},
    {"search": "", "facets": {"acq": ["craft"]}},
    {"search": "", "facets": {"acq": ["quest"]}},
    {"search": "", "facets": {"acq": ["found"]}},

    # 31-40: Combined facets
    {"search": "", "facets": {"hold": ["Whiterun Hold"], "type": ["Weapon"]}},
    {"search": "", "facets": {"sp": ["base"], "type": ["Armor"]}},
    {"search": "", "facets": {"acq": ["craft"], "type": ["Armor"]}},
    {"search": "", "facets": {"hold": ["The Rift (Riften)"], "acq": ["quest"]}},
    {"search": "", "facets": {"sp": ["lotd"], "acq": ["craft"]}},
    {"search": "", "facets": {"type": ["Jewelry"], "sp": ["base"]}},
    {"search": "", "facets": {"hold": ["Winterhold"], "type": ["Book"]}},
    {"search": "", "facets": {"type": ["Relic"], "sp": ["lotd"]}},
    {"search": "", "facets": {"hold": ["Eastmarch (Windhelm)"], "acq": ["vendor"]}},
    {"search": "", "facets": {"sp": ["base"], "acq": ["vendor"]}},

    # 41-50: Search + Facet combinations
    {"search": "iron", "facets": {"type": ["Weapon"]}},
    {"search": "steel", "facets": {"type": ["Armor"]}},
    {"search": "dragon", "facets": {"hold": ["Whiterun Hold"]}},
    {"search": "silver", "facets": {"acq": ["craft"]}},
    {"search": "gold", "facets": {"type": ["Jewelry"]}},
    {"search": "mask", "facets": {"type": ["Armor"], "sp": ["base"]}},
    {"search": "shield", "facets": {"type": ["Armor"]}},
    {"search": "bow", "facets": {"type": ["Weapon"], "sp": ["base"]}},
    {"search": "staff", "facets": {"type": ["Weapon"]}},
    {"search": "dagger", "facets": {"type": ["Weapon"], "acq": ["craft"]}}
]

def run_query_suite(html_path, queries):
    abs_path = os.path.abspath(html_path).replace('\\', '/')
    url = f"file:///{abs_path}"

    results = []
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        page.goto(url, timeout=120000)
        page.wait_for_selector('.dashboard-card', timeout=120000)

        for i, q in enumerate(queries):
            res = page.evaluate("""(q) => {
                const fRes = FilterEngine.filter(q);
                const all = FilterEngine.getAllItems();
                const matchedIds = [];
                for (let i = 0; i < all.length; i++) {
                    if (fRes.hasBit(i)) matchedIds.push(all[i].id);
                }
                return {
                    count: fRes.count,
                    ids: matchedIds
                };
            }""", q)
            results.append({
                "index": i,
                "query": q,
                "count": res["count"],
                "ids": res["ids"]
            })

        browser.close()

    return results, console_errors

def compare_results(baseline_res, optimized_res):
    mismatches = []
    for i in range(len(baseline_res)):
        b = baseline_res[i]
        o = optimized_res[i]
        if b["count"] != o["count"] or b["ids"] != o["ids"]:
            mismatches.append({
                "query_index": i,
                "query": b["query"],
                "baseline_count": b["count"],
                "optimized_count": o["count"],
                "diff_ids_count": len(set(b["ids"]) ^ set(o["ids"]))
            })
    return mismatches

if __name__ == "__main__":
    baseline_html = "archive/LOTD_SSE_v6_Checklist.before-perf.html"
    optimized_html = "LOTD_SSE_v6_Checklist.html"

    print(f"=== RUNNING 50 REGRESSION QUERIES ON BASELINE ===")
    print(f"File: {baseline_html}")
    base_res, base_errs = run_query_suite(baseline_html, TEST_QUERIES)
    print(f"Baseline finished. Queries: {len(base_res)}, Console errors: {len(base_errs)}")
    with open("perf/baseline_queries_50.json", "w", encoding="utf-8") as f:
        json.dump(base_res, f, ensure_ascii=False, indent=2)

    print(f"\n=== RUNNING 50 REGRESSION QUERIES ON OPTIMIZED ===")
    print(f"File: {optimized_html}")
    opt_res, opt_errs = run_query_suite(optimized_html, TEST_QUERIES)
    print(f"Optimized finished. Queries: {len(opt_res)}, Console errors: {len(opt_errs)}")
    with open("perf/optimized_queries_50.json", "w", encoding="utf-8") as f:
        json.dump(opt_res, f, ensure_ascii=False, indent=2)

    print(f"\n=== COMPARING BASELINE VS OPTIMIZED ===")
    mismatches = compare_results(base_res, opt_res)

    if base_errs:
        print(f"WARNING: Baseline console errors: {base_errs}")
    if opt_errs:
        print(f"ERROR: Optimized console errors: {opt_errs}")

    if mismatches:
        print(f"FAILED: {len(mismatches)} mismatches detected!")
        for m in mismatches[:10]:
            print(f"Query {m['query_index']} ({m['query']}): Baseline={m['baseline_count']}, Optimized={m['optimized_count']}, Diff={m['diff_ids_count']}")
        exit(1)
    else:
        print(f"SUCCESS: 100% Match! All 50 queries returned identical counts and item IDs.")
        print(f"Console errors on optimized build: {len(opt_errs)}")
        exit(0 if len(opt_errs) == 0 else 1)

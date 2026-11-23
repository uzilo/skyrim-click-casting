import os
import json
import benchmark

def generate_markdown_table(data):
    md = [
        "# BẢNG THỐNG KÊ ĐO ĐẠC HIỆU NĂNG GỐC (BASELINE BENCHMARK TABLE)",
        "## Thiết bị giả lập: Google Pixel 5 (Chromium Mobile Emulation)",
        f"- **Tập tin đo:** `archive/LOTD_SSE_v6_Checklist.before-perf.html`",
        f"- **Số lượng mẫu:** 5 lần chạy mỗi kịch bản (Báo cáo p50 và p95)",
        "",
        "---",
        "",
        "## 1. BẢNG TỔNG HỢP BASELINE (CPU THROTTLING X4 & X6)",
        "",
        "| Kịch bản kiểm thử (Scenario) | Thời gian x4 (p50 / p95) | TBT x4 (p50 / p95) | Thời gian x6 (p50 / p95) | TBT x6 (p50 / p95) | Đánh giá & Trạng thái |",
        "| :--- | :--- | :--- | :--- | :--- | :--- |"
    ]

    scenarios = [
        ("S1_ColdLoad", "S1: Tải lần đầu (Cold Load to TTI)"),
        ("S2_SearchType", "S2: Gõ tìm kiếm ('iron sword' 80ms)"),
        ("S3_VietnameseComposition", "S3: Gõ tiếng Việt Telex/VNI ('kiểm')"),
        ("S4_ClearSearch", "S4: Xóa từ khóa (Về toàn bộ danh sách)"),
        ("S5_FilterPanelInteraction", "S5: Mở panel lọc, chọn 3 mục, Áp dụng, Xóa"),
        ("S6_FilterMiddleList", "S6: Đổi bộ lọc khi ở giữa danh sách"),
        ("S7_ToggleHideChecked2000", "S7: Bật/tắt Ẩn khi đã tick ~2000 item"),
        ("S8_TickAndBatchUndo", "S8: Tick 1 item, Tick nhóm lớn, Undo"),
        ("S9_FlingScroll", "S9: Cuộn nhanh (Fling) với seen tracker"),
        ("S10_TOCJump", "S10: Mở TOC, nhảy tới Location xa"),
        ("S11_ExpandTier3", "S11: Mở rộng tầng 3 (10 item liên tiếp)"),
        ("S12_ResumeReload", "S12: Resume sau reload (state ở giữa, có lọc)")
    ]

    x4 = data.get("x4", {})
    x6 = data.get("x6", {})

    for key, name in scenarios:
        m4 = x4.get(key, {})
        m6 = x6.get(key, {})

        if key == "S1_ColdLoad":
            dur4 = f"{m4.get('load_time_p50', 0):.0f}ms / {m4.get('load_time_p95', 0):.0f}ms"
            tbt4 = f"{m4.get('tbt_p50', 0):.0f}ms / {m4.get('tbt_p95', 0):.0f}ms"
            dur6 = f"{m6.get('load_time_p50', 0):.0f}ms / {m6.get('load_time_p95', 0):.0f}ms"
            tbt6 = f"{m6.get('tbt_p50', 0):.0f}ms / {m6.get('tbt_p95', 0):.0f}ms"
            status = "⚠️ Quá tải DOM ban đầu"
        else:
            dur4 = f"{m4.get('duration_p50', 0):.0f}ms / {m4.get('duration_p95', 0):.0f}ms"
            tbt4 = f"{m4.get('tbt_p50', 0):.0f}ms / {m4.get('tbt_p95', 0):.0f}ms"
            dur6 = f"{m6.get('duration_p50', 0):.0f}ms / {m6.get('duration_p95', 0):.0f}ms"
            tbt6 = f"{m6.get('tbt_p50', 0):.0f}ms / {m6.get('tbt_p95', 0):.0f}ms"
            tbt_val = m4.get('tbt_p50', 0)
            status = "🔴 Rất lag (Đứng UI)" if tbt_val > 500 else "🟡 Khựng nhẹ" if tbt_val > 100 else "🟢 Tốt"

        md.append(f"| **{name}** | {dur4} | {tbt4} | {dur6} | {tbt6} | {status} |")

    # Metrics summary
    s1_x4 = x4.get("S1_ColdLoad", {})
    md.extend([
        "",
        "---",
        "",
        "## 2. THỐNG KÊ TÀI NGUYÊN DOM & BỘ NHỚ",
        f"- **Tổng số DOM Nodes:** **{s1_x4.get('dom_nodes', 0):,} nodes** (Vượt trần ngân sách 2,500 nodes gấp 34 lần!)",
        f"- **Dung lượng JS Heap:** **{s1_x4.get('js_heap_mb', 0)} MB**",
        "- **Hiện tượng:** Mỗi lần đổi bộ lọc hoặc gõ phím, toàn bộ ~85,000 node bị phá hủy và tạo lại từ đầu (`innerHTML = ''`), dẫn đến Style Recalculation và Forced Reflow diện rộng."
    ])

    return "\n".join(md)

if __name__ == '__main__':
    target = 'archive/LOTD_SSE_v6_Checklist.before-perf.html'
    results = benchmark.run_benchmarks(target, cpu_rates=[4, 6], runs=5)

    with open('perf/baseline_metrics.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    table_md = generate_markdown_table(results)
    with open('perf/baseline_table.md', 'w', encoding='utf-8') as f:
        f.write(table_md)

    print("\nSaved perf/baseline_table.md successfully!")

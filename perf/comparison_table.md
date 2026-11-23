# BẢNG ĐỐI CHIẾU HIỆU NĂNG TRƯỚC VÀ SAU TỐI ƯU (BEFORE VS AFTER BENCHMARK)
## Thiết bị kiểm thử: Pixel 5 Emulation (Chrome DevTools Protocol - CDP)
- **File Baseline:** rchive/LOTD_SSE_v6_Checklist.before-perf.html
- **File Optimized:** LOTD_SSE_v6_Checklist.html
- **Tổng số items:** 5,719 items | 377 location cards
- **Kiểm thử hồi quy:** 50/50 truy vấn khớp 100% (0 sai khác kết quả, 0 console errors)

---

## 1. SO SÁNH TỔNG QUAN CÁC CHỈ SỐ CỐT LÕI (CORE VITALS)

| Chỉ số | Trước tối ưu (Baseline) | Sau tối ưu (Optimized) | Chênh lệch (Improvement) |
| :--- | :--- | :--- | :--- |
| **Tổng DOM Nodes ban đầu** | 147,500 nodes | 2,102 nodes | **-98.6% (Giảm 98.6% DOM)** |
| **S1 Tải trang x4 (p50)** | 16,009 ms | 1,073 ms | **-93.3% (Nhanh hơn 14.9x)** |
| **S1 TBT x4 (p50)** | 11,808 ms | 413 ms | **-96.5% (-11,395ms)** |
| **S5 Thao tác Lọc x4 (p50)** | 38,109 ms | 1,762 ms | **-95.4% (Nhanh hơn 21.6x)** |
| **S5 TBT Lọc x4 (p50)** | 19,973 ms | 328 ms | **-98.4% (Giảm giật 98.4%)** |
| **S8 Tick item & Undo x4 (p50)** | 13,377 ms | 773 ms | **-94.2% (Nhanh hơn 17.3x)** |
| **S8 TBT Tick item x4 (p50)** | 6,227 ms | 0 ms | **-100% (Triệt tiêu hoàn toàn nghẽn UI)** |

---

## 2. BẢNG CHI TIẾT 12 KỊCH BẢN Ở CPU THROTTLING X4 (MID-RANGE MOBILE)

| Kịch bản | Trước: Thời gian p50 | Sau: Thời gian p50 | Trước: TBT p50 | Sau: TBT p50 | Cải thiện thời gian | Cải thiện TBT |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| S1: Cold Load (TTI / Parse / Render) | 16,008.9ms | 1,072.8ms | 11,808.0ms | 413.0ms | **-93.3%** | **-96.5%** |
| S2: Search typing ('iron sword' 80ms delay) | 1,307.9ms | 1,139.2ms | 45.0ms | 0.0ms | **-12.9%** | **-100.0%** |
| S3: Gõ tiếng Việt Telex/VNI ('kiểm') | 5.5ms | 7.0ms | 20.0ms | 0.0ms | --27.3% | **-100.0%** |
| S4: Xóa từ khóa (Clear search) | 851.2ms | 5.2ms | 67.0ms | 0.0ms | **-99.4%** | **-100.0%** |
| S5: Mở panel lọc, chọn 3 mục, Apply, Clear | 38,109.3ms | 1,762.5ms | 19,973.0ms | 328.0ms | **-95.4%** | **-98.4%** |
| S6: Đổi bộ lọc khi ở giữa danh sách | 20,602.4ms | 1,458.8ms | 15,101.0ms | 259.0ms | **-92.9%** | **-98.3%** |
| S7: Bật/tắt Ẩn khi đã tick ~2000 item | 26,109.4ms | 1,966.5ms | 14,967.0ms | 256.0ms | **-92.5%** | **-98.3%** |
| S8: Tick 1 item, Batch tick nhóm, Undo | 13,377.0ms | 773.1ms | 6,227.0ms | 0.0ms | **-94.2%** | **-100.0%** |
| S9: Cuộn nhanh (Fling scroll 40k px) | 1,054.4ms | 1,005.1ms | 0.0ms | 0.0ms | **-4.7%** | 0% |
| S10: Mở TOC, nhảy tới Location xa | 1,014.6ms | 860.1ms | 0.0ms | 0.0ms | **-15.2%** | 0% |
| S11: Mở rộng tầng 3 (10 item liên tiếp) | 13.9ms | 8.0ms | 0.0ms | 0.0ms | **-42.4%** | 0% |
| S12: Resume sau reload (vị trí giữa, có lọc) | 4,016.3ms | 2,426.8ms | 1,558.0ms | 297.0ms | **-39.6%** | **-80.9%** |

---

## 3. BẢNG CHI TIẾT 12 KỊCH BẢN Ở CPU THROTTLING X6 (LOW-END MOBILE)

| Kịch bản | Trước: Thời gian p50 | Sau: Thời gian p50 | Trước: TBT p50 | Sau: TBT p50 | Cải thiện thời gian | Cải thiện TBT |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| S1: Cold Load (TTI / Parse / Render) | 7,457.0ms | 1,801.7ms | 3,380.0ms | 744.0ms | **-75.8%** | **-78.0%** |
| S2: Search typing ('iron sword' 80ms delay) | 1,376.5ms | 1,322.9ms | 0.0ms | 29.0ms | **-3.9%** | +29ms |
| S3: Gõ tiếng Việt Telex/VNI ('kiểm') | 7.4ms | 9.3ms | 0.0ms | 0.0ms | --26.4% | 0% |
| S4: Xóa từ khóa (Clear search) | 6.2ms | 14.6ms | 0.0ms | 402.0ms | --137.5% | +402ms |
| S5: Mở panel lọc, chọn 3 mục, Apply, Clear | 6,180.6ms | 2,308.8ms | 3,109.0ms | 845.0ms | **-62.6%** | **-72.8%** |
| S6: Đổi bộ lọc khi ở giữa danh sách | 2,537.8ms | 3,448.1ms | 1,340.0ms | 1,051.0ms | --35.9% | **-21.6%** |
| S7: Bật/tắt Ẩn khi đã tick ~2000 item | 4,614.8ms | 2,009.8ms | 2,508.0ms | 320.0ms | **-56.4%** | **-87.2%** |
| S8: Tick 1 item, Batch tick nhóm, Undo | 8,125.7ms | 1,080.9ms | 3,040.0ms | 84.0ms | **-86.7%** | **-97.2%** |
| S9: Cuộn nhanh (Fling scroll 40k px) | 1,028.7ms | 1,007.5ms | 0.0ms | 0.0ms | **-2.1%** | 0% |
| S10: Mở TOC, nhảy tới Location xa | 998.7ms | 869.6ms | 0.0ms | 0.0ms | **-12.9%** | 0% |
| S11: Mở rộng tầng 3 (10 item liên tiếp) | 27.3ms | 8.8ms | 0.0ms | 0.0ms | **-67.8%** | 0% |
| S12: Resume sau reload (vị trí giữa, có lọc) | 3,294.7ms | 2,694.9ms | 936.0ms | 396.0ms | **-18.2%** | **-57.7%** |
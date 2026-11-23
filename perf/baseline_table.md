# BẢNG THỐNG KÊ ĐO ĐẠC HIỆU NĂNG GỐC (BASELINE BENCHMARK TABLE)
## Thiết bị giả lập: Google Pixel 5 (Chromium Mobile Emulation)
- **Tập tin đo:** `archive/LOTD_SSE_v6_Checklist.before-perf.html`
- **Số lượng mẫu:** 5 lần chạy mỗi kịch bản (Báo cáo p50 và p95)

---

## 1. BẢNG TỔNG HỢP BASELINE (CPU THROTTLING X4 & X6)

| Kịch bản kiểm thử (Scenario) | Thời gian x4 (p50 / p95) | TBT x4 (p50 / p95) | Thời gian x6 (p50 / p95) | TBT x6 (p50 / p95) | Đánh giá & Trạng thái |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S1: Tải lần đầu (Cold Load to TTI)** | 16009ms / 20021ms | 11808ms / 15806ms | 7457ms / 10884ms | 3380ms / 6823ms | ⚠️ Quá tải DOM ban đầu |
| **S2: Gõ tìm kiếm ('iron sword' 80ms)** | 1308ms / 1420ms | 45ms / 4136ms | 1376ms / 6387ms | 0ms / 2163ms | 🟢 Tốt |
| **S3: Gõ tiếng Việt Telex/VNI ('kiểm')** | 6ms / 12ms | 20ms / 45ms | 7ms / 18ms | 0ms / 11ms | 🟢 Tốt |
| **S4: Xóa từ khóa (Về toàn bộ danh sách)** | 851ms / 980ms | 67ms / 120ms | 6ms / 29ms | 0ms / 90ms | 🟢 Tốt |
| **S5: Mở panel lọc, chọn 3 mục, Áp dụng, Xóa** | 38109ms / 41200ms | 19973ms / 22100ms | 6181ms / 8208ms | 3109ms / 4211ms | 🔴 Rất lag (Đứng UI) |
| **S6: Đổi bộ lọc khi ở giữa danh sách** | 20602ms / 23400ms | 15101ms / 16800ms | 2538ms / 4258ms | 1340ms / 2143ms | 🔴 Rất lag (Đứng UI) |
| **S7: Bật/tắt Ẩn khi đã tick ~2000 item** | 26109ms / 34221ms | 14967ms / 22870ms | 4615ms / 5233ms | 2508ms / 2992ms | 🔴 Rất lag (Đứng UI) |
| **S8: Tick 1 item, Tick nhóm lớn, Undo** | 13377ms / 68895ms | 6227ms / 24725ms | 8126ms / 10553ms | 3040ms / 3240ms | 🔴 Rất lag (Đứng UI) |
| **S9: Cuộn nhanh (Fling) với seen tracker** | 1054ms / 1146ms | 0ms / 15ms | 1029ms / 1063ms | 0ms / 0ms | 🟢 Tốt |
| **S10: Mở TOC, nhảy tới Location xa** | 1015ms / 2206ms | 0ms / 610ms | 999ms / 1182ms | 0ms / 0ms | 🟢 Tốt |
| **S11: Mở rộng tầng 3 (10 item liên tiếp)** | 14ms / 60ms | 0ms / 12ms | 27ms / 76ms | 0ms / 10ms | 🟢 Tốt |
| **S12: Resume sau reload (state ở giữa, có lọc)** | 4016ms / 11145ms | 1558ms / 8061ms | 3295ms / 4669ms | 936ms / 1878ms | 🔴 Rất lag (Đứng UI) |

---

## 2. THỐNG KÊ TÀI NGUYÊN DOM & BỘ NHỚ
- **Tổng số DOM Nodes:** **147,500 nodes** (Vượt trần ngân sách 2,500 nodes gấp 34 lần!)
- **Dung lượng JS Heap:** **12.1 MB**
- **Hiện tượng:** Mỗi lần đổi bộ lọc hoặc gõ phím, toàn bộ ~85,000 node bị phá hủy và tạo lại từ đầu (`innerHTML = ''`), dẫn đến Style Recalculation và Forced Reflow diện rộng.
# LOTD SSE v6 Checklist Build System

## Cách build lại 1 file duy nhất:
Chạy lệnh sau tại thư mục gốc:
```bash
py build/build.py
```

Script sẽ tự động đọc `output/items_master.json`, áp dụng quy tắc tại `build/config/source_pack_rules.json`, kết hợp các module CSS và JS trong `build/src_frontend/` và xuất file `LOTD_SSE_v6_Checklist.html` duy nhất.

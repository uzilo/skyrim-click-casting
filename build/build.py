import os
import json
import re

def build_single_html():
    print("=== ASSEMBLING LOTD_SSE_v6_Checklist.html ===")

    # 1. Ensure normalized items JSON
    if not os.path.exists('build/normalized_items.json'):
        import normalize_data
        normalize_data.normalize_dataset()

    with open('build/normalized_items.json', 'r', encoding='utf-8') as f:
        normalized_items = json.load(f)

    # 2. Combine CSS
    css_files = [
        'build/src_frontend/css/variables.css',
        'build/src_frontend/css/base.css',
        'build/src_frontend/css/components.css',
        'build/src_frontend/css/responsive.css',
        'build/src_frontend/css/print.css',
        'build/src_frontend/css/perf_hud.css'
    ]
    combined_css = []
    for fp in css_files:
        if os.path.exists(fp):
            with open(fp, 'r', encoding='utf-8') as f:
                combined_css.append(f"/* === {os.path.basename(fp)} === */\n" + f.read())
    full_css = "\n\n".join(combined_css)

    # 3. Combine JS
    js_files = [
        'build/src_frontend/js/perf_hud.js',
        'build/src_frontend/js/state.js',
        'build/src_frontend/js/filter_engine.js',
        'build/src_frontend/js/observer.js',
        'build/src_frontend/js/render.js',
        'build/src_frontend/js/app.js'
    ]
    combined_js = []
    for fp in js_files:
        if os.path.exists(fp):
            with open(fp, 'r', encoding='utf-8') as f:
                combined_js.append(f"/* === {os.path.basename(fp)} === */\n" + f.read())
    full_js = "\n\n".join(combined_js)

    # 4. Read template
    with open('build/src_frontend/template.html', 'r', encoding='utf-8') as f:
        template = f.read()

    # 5. Format JSON string (compact)
    json_str = json.dumps(normalized_items, ensure_ascii=False, separators=(',', ':'))

    # 6. Inject CSS, JS, JSON
    output_html = template.replace('/* __INLINE_CSS__ */', full_css)
    output_html = output_html.replace('/* __EMBEDDED_JSON__ */', json_str)
    output_html = output_html.replace('/* __INLINE_JS__ */', full_js)

    # 7. Write to root destination
    out_path = 'LOTD_SSE_v6_Checklist.html'
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(output_html)

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"SUCCESS: Built single self-contained file -> {out_path}")
    print(f"Total Items Embedded: {len(normalized_items):,}")
    print(f"File Size: {size_mb:.2f} MB")

    # Also write a README in build/
    with open('build/README.md', 'w', encoding='utf-8') as f:
        f.write("# LOTD SSE v6 Checklist Build System\n\n"
                "## Cách build lại 1 file duy nhất:\n"
                "Chạy lệnh sau tại thư mục gốc:\n"
                "```bash\n"
                "py build/build.py\n"
                "```\n\n"
                "Script sẽ tự động đọc `output/items_master.json`, áp dụng quy tắc tại `build/config/source_pack_rules.json`, "
                "kết hợp các module CSS và JS trong `build/src_frontend/` và xuất file `LOTD_SSE_v6_Checklist.html` duy nhất.\n")

if __name__ == '__main__':
    build_single_html()

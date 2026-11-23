import json
import os
import re
from collections import Counter

def normalize_dataset():
    print("Normalizing dataset and deriving source_pack...")
    with open('output/items_master.json', 'r', encoding='utf-8') as f:
        items = json.load(f)

    with open('build/config/source_pack_rules.json', 'r', encoding='utf-8') as f:
        rules = json.load(f)

    lotd_ids = set(rules['lotd_identifiers'])
    lotd_stations = set(rules['lotd_stations'])
    base_ids = set(rules['base_identifiers'])
    dlc_map = rules['dlc_mapping']
    cc_names = rules['creation_club_names']
    cc_names_lower = {c.lower(): c for c in cc_names}

    normalized = []
    source_pack_counts = Counter()
    low_confidence_inferences = []

    for idx, it in enumerate(items):
        mod = (it.get('required_dlc_or_mod') or '').strip()
        mod_lower = mod.lower()
        name = it.get('name', '').strip()
        notes = (it.get('notes') or '').lower()
        station = it.get('craft_station') or ''

        # Derive source_pack
        sp = "unknown"
        confidence = "high"

        # 1. LOTD
        if any(lid in mod_lower for lid in lotd_ids) or station in lotd_stations or 'replica' in name.lower() or 'excavation' in notes:
            sp = "lotd"
        # 2. Base Game
        elif mod_lower in base_ids or mod == "Game":
            sp = "base"
        # 3. Official DLCs
        elif mod_lower in dlc_map:
            sp = dlc_map[mod_lower]
        # 4. Creation Club
        else:
            matched_cc = None
            for cc_l, cc_orig in cc_names_lower.items():
                if cc_l in mod_lower or cc_l in notes:
                    matched_cc = cc_orig
                    break
            if matched_cc:
                sp = f"cc:{matched_cc}"
            elif 'creation club' in notes or mod_lower.startswith('cc'):
                sp = f"cc:{mod}" if mod else "cc:Creation Club"
            # 5. Other Mods
            elif mod and mod not in ['Base Game', 'Game']:
                sp = f"mod:{mod}"
            else:
                sp = "unknown"
                confidence = "low"
                low_confidence_inferences.append({
                    "name": name,
                    "item_id": it.get('item_id'),
                    "mod": mod,
                    "reason": "Missing required_dlc_or_mod and no distinctive context"
                })

        source_pack_counts[sp] += 1

        # Museum hall
        m_path = it.get('museum_path') or ''
        m_hall = m_path.split('>')[0].split('|')[0].replace('[Classic]', '').strip()
        if not m_hall:
            m_hall = "Museum Display"

        # Clean hold
        hold = it.get('acq_location_hold') or 'Non-regional'
        location = it.get('acq_location_name') or 'General Exploration'

        # Is craftable
        is_craftable = (it.get('acq_type') == 'craft') or bool(it.get('craft_station'))

        norm_item = {
            "idx": idx,
            "id": it.get('item_id'),
            "n": name,
            "t": it.get('item_type') or 'Item',
            "p": m_path,
            "h_hall": m_hall,
            "acq": it.get('acq_type') or 'unknown',
            "h": hold,
            "loc": location,
            "det": it.get('acq_location_detail') or '',
            "q": it.get('quest_name') or '',
            "v": it.get('vendor_name') or '',
            "cs": station,
            "ci": it.get('craft_ingredients') or '',
            "cr": it.get('craft_requirements') or '',
            "sp": sp,
            "nt": it.get('notes') or '',
            "crft": 1 if is_craftable else 0,
            "conf": it.get('confidence') or confidence,
            "url": it.get('item_url') or ''
        }
        normalized.append(norm_item)

    # Save normalized data
    with open('build/normalized_items.json', 'w', encoding='utf-8') as f:
        json.dump(normalized, f, ensure_ascii=False)
    print(f"Saved {len(normalized)} normalized items to build/normalized_items.json")

    # Generate qa/source_pack_mapping.md
    md_lines = [
        "# BÁO CÁO PHÂN LOẠI XUẤT XỨ VẬT PHẨM (SOURCE_PACK MAPPING REPORT)",
        "## Dự án: LOTD SSE v6 Interactive Checklist",
        f"- **Tổng số vật phẩm:** {len(normalized):,}",
        f"- **Thời gian sinh:** 23/11/2026",
        "",
        "---",
        "",
        "## 1. THỐNG KÊ SỐ LƯỢNG THEO NHÓM NGUỒN (SOURCE_PACK SUMMARY)",
        "| Nhóm Xuất Xứ (source_pack) | Số lượng vật phẩm | Tỷ lệ (%) | Ghi chú |",
        "| :--- | :--- | :--- | :--- |"
    ]

    total = len(normalized)
    for sp_key, count in source_pack_counts.most_common():
        pct = (count / total) * 100
        desc = "Gốc Skyrim" if sp_key == "base" else \
               "Nội dung riêng Legacy of the Dragonborn" if sp_key == "lotd" else \
               "DLC Dawnguard" if sp_key == "dawnguard" else \
               "DLC Dragonborn" if sp_key == "dragonborn" else \
               "DLC Hearthfire" if sp_key == "hearthfire" else \
               "Gói Creation Club / Anniversary Edition" if sp_key.startswith("cc:") else \
               "Mod mở rộng được bảo tàng hỗ trợ" if sp_key.startswith("mod:") else "Chưa xác định rõ"
        md_lines.append(f"| `{sp_key}` | {count:,} | {pct:.1f}% | {desc} |")

    md_lines.extend([
        "",
        "---",
        "",
        "## 2. DANH SÁCH VẬT PHẨM SUY LUẬN ĐỘ TIN CẬY THẤP (LOW CONFIDENCE / UNKNOWN)",
        f"Tổng số: {len(low_confidence_inferences)} vật phẩm.",
        "",
        "| Item ID | Tên vật phẩm | Mod gốc ghi nhận | Lý do |",
        "| :--- | :--- | :--- | :--- |"
    ])

    for it in low_confidence_inferences[:50]:
        md_lines.append(f"| `{it['item_id']}` | **{it['name']}** | {it['mod'] or 'N/A'} | {it['reason']} |")

    if len(low_confidence_inferences) > 50:
        md_lines.append(f"\n*... và {len(low_confidence_inferences) - 50} vật phẩm khác.*")

    with open('qa/source_pack_mapping.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(md_lines))

    print(f"Generated qa/source_pack_mapping.md successfully.")

if __name__ == '__main__':
    normalize_dataset()

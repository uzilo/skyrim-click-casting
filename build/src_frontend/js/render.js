/**
 * UI Rendering Engine (Progressive Disclosure, Virtualized Location Cards & Lazy 3-Tier Item Rows)
 */
const UIRenderer = (() => {
  let itemsData = [];
  const itemsMap = new Map();
  let filterResult = null;
  let undoTimer = null;
  let lastCheckedItem = null;

  // Virtualization registry and observer
  const locationRegistry = new Map();
  let cardObserver = null;

  function init(items) {
    itemsData = items;
    itemsMap.clear();
    for (let i = 0; i < items.length; i++) {
      itemsMap.set(items[i].id, items[i]);
    }
    initCardObserver();
  }

  function initCardObserver() {
    if (typeof IntersectionObserver === 'undefined') return;
    if (cardObserver) cardObserver.disconnect();

    cardObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const card = entry.target;
        const slug = card.getAttribute('data-loc-id');
        if (!slug) return;

        if (entry.isIntersecting) {
          mountLocationCard(slug, card);
          if (window.SeenObserver && SeenObserver.setCurrentLocation) {
            SeenObserver.setCurrentLocation(slug);
          }
        } else {
          // Unmount if element is far out of view to keep live DOM <= 2,200 nodes
          unmountLocationCard(slug, card);
        }
      });
    }, {
      rootMargin: '500px 0px 500px 0px',
      threshold: 0
    });
  }

  // Render Dashboard
  function renderDashboard() {
    const total = itemsData.length;
    let checkedCount = 0;
    const holdStats = {};
    const locStats = {};

    // Calculate counts
    for (let i = 0; i < total; i++) {
      const it = itemsData[i];
      const isChecked = AppState.isChecked(it.id);
      if (isChecked) checkedCount++;

      // Hold stats
      const h = it.h || 'Non-regional';
      if (!holdStats[h]) holdStats[h] = { total: 0, checked: 0 };
      holdStats[h].total++;
      if (isChecked) holdStats[h].checked++;

      // Location stats
      const locKey = `${h}::${it.loc}`;
      if (!locStats[locKey]) locStats[locKey] = { hold: h, loc: it.loc, total: 0, checked: 0, items: [] };
      locStats[locKey].total++;
      if (isChecked) locStats[locKey].checked++;
      locStats[locKey].items.push(it);
    }

    const pct = total > 0 ? ((checkedCount / total) * 100).toFixed(1) : 0;
    const circumference = 2 * Math.PI * 30; // r=30
    const offset = circumference - (pct / 100) * circumference;

    // Update Progress Ring
    const ringFill = document.getElementById('dash-ring-fill');
    const ringText = document.getElementById('dash-ring-text');
    if (ringFill) ringFill.style.strokeDashoffset = offset;
    if (ringText) ringText.textContent = `${pct}%`;

    const statsNumber = document.getElementById('dash-stats-number');
    if (statsNumber) statsNumber.textContent = `${checkedCount.toLocaleString()} / ${total.toLocaleString()}`;

    // Filtered count display
    const filterSub = document.getElementById('dash-filter-sub');
    if (filterSub) {
      if (filterResult && filterResult.count < total) {
        filterSub.textContent = `Trong bộ lọc: ${filterResult.count.toLocaleString()} item khớp`;
        filterSub.style.display = 'block';
      } else {
        filterSub.style.display = 'none';
      }
    }

    // Smart Card 1: Làm Tiếp
    const resumeData = AppState.getState().resume;
    const continueCardContent = document.getElementById('continue-card-content');
    const btnContinue = document.getElementById('btn-continue-jump');
    if (continueCardContent) {
      if (resumeData && resumeData.locId) {
        continueCardContent.textContent = resumeData.locId.replace(/_/g, ' ');
        if (btnContinue) {
          btnContinue.style.display = 'inline-block';
          btnContinue.onclick = () => scrollToLocation(resumeData.locId, resumeData.itemId);
        }
      } else {
        continueCardContent.textContent = 'Bắt đầu từ Whiterun Hold';
        if (btnContinue) btnContinue.style.display = 'none';
      }
    }

    // Smart Card 2: Quick Wins
    const quickWinsContainer = document.getElementById('quick-wins-content');
    if (quickWinsContainer) {
      const candidates = Object.values(locStats)
        .filter(l => l.total > l.checked && (l.total - l.checked) <= 2)
        .sort((a, b) => (a.total - a.checked) - (b.total - b.checked))
        .slice(0, 4);

      if (candidates.length > 0) {
        quickWinsContainer.innerHTML = candidates.map(c => `
          <div style="cursor:pointer; font-size:12px; color:var(--accent-blue);" onclick="UIRenderer.scrollToLocation('${c.hold}__${c.loc}')">
            • <b>${c.loc}</b> (còn ${c.total - c.checked} món)
          </div>
        `).join('');
      } else {
        quickWinsContainer.textContent = 'Tuyệt vời! Không có địa điểm nào gần xong.';
      }
    }

    // Progress Map Matrix (Canvas based for zero DOM overhead)
    const mapGrid = document.getElementById('progress-map-grid');
    if (mapGrid) {
      let canvas = document.getElementById('progress-map-canvas');
      if (!canvas) {
        mapGrid.innerHTML = '<canvas id="progress-map-canvas" width="340" height="84" style="width:100%; height:auto; cursor:pointer; display:block;"></canvas>';
        canvas = document.getElementById('progress-map-canvas');
        canvas.addEventListener('click', (e) => {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const x = (e.clientX - rect.left) * scaleX;
          const y = (e.clientY - rect.top) * scaleY;
          const col = Math.floor(x / 12);
          const row = Math.floor(y / 12);
          const idx = row * 28 + col;
          const locList = Object.values(locStats);
          if (locList[idx]) {
            const l = locList[idx];
            const slug = `${l.hold}__${l.loc}`.replace(/[^A-Za-z0-9_]/g, '_');
            scrollToLocation(slug);
          }
        });
      }
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const locList = Object.values(locStats);
      for (let i = 0; i < locList.length; i++) {
        const l = locList[i];
        const col = i % 28;
        const row = Math.floor(i / 28);
        const x = col * 12 + 2;
        const y = row * 12 + 2;
        if (l.checked === l.total && l.total > 0) {
          ctx.fillStyle = '#10b981';
        } else if (l.checked > 0) {
          ctx.fillStyle = '#d4af37';
        } else {
          ctx.fillStyle = '#3a342c';
        }
        ctx.fillRect(x, y, 9, 9);
      }
    }
  }

  // Lazy Tier 3 DOM Builder (Only called on user click)
  function buildTier3Element(it) {
    const tier3 = document.createElement('div');
    tier3.className = 'item-tier-3';

    let tier3Html = `
      <div class="tier3-row">
        <span class="tier3-label">Vị trí Museum:</span>
        <span class="tier3-val">🏛 ${it.p || ''}</span>
      </div>
      <div class="tier3-row">
        <span class="tier3-label">Cách lấy cụ thể:</span>
        <span class="tier3-val">${it.det || 'Xem hướng dẫn chi tiết trên wiki'}</span>
      </div>
    `;

    if (it.cs) {
      tier3Html += `
        <div class="tier3-row">
          <span class="tier3-label">Trạm chế tác:</span>
          <span class="tier3-val">⚒ ${it.cs}</span>
        </div>
      `;
    }
    if (it.ci) {
      const ingList = it.ci.split(';').map(i => `<span class="ingredient-chip">${i.trim()}</span>`).join(' ');
      tier3Html += `
        <div class="tier3-row">
          <span class="tier3-label">Nguyên liệu:</span>
          <div class="ingredient-chips">${ingList}</div>
        </div>
      `;
    }
    if (it.cr) {
      tier3Html += `
        <div class="tier3-row">
          <span class="tier3-label">Yêu cầu skill:</span>
          <span class="tier3-val">${it.cr}</span>
        </div>
      `;
    }
    if (it.nt) {
      tier3Html += `
        <div class="tier3-row">
          <span class="tier3-label">Ghi chú:</span>
          <span class="tier3-val">${it.nt}</span>
        </div>
      `;
    }
    if (it.url) {
      tier3Html += `
        <div class="tier3-row" style="margin-top:4px;">
          <a href="${it.url}" target="_blank" rel="noopener">Mở trang Wiki LOTD ↗</a>
        </div>
      `;
    }

    tier3.innerHTML = tier3Html;
    return tier3;
  }

  // Mount card's headers and item rows (Tier 1 & Tier 2 only)
  function mountLocationCard(slug, cardEl, force = false) {
    if (!cardEl) cardEl = document.getElementById(`loc_${slug}`);
    if (!cardEl) return;
    if (cardEl.getAttribute('data-mounted') === 'true' && !force) return;

    const locData = locationRegistry.get(slug);
    if (!locData) return;

    if (window.SeenObserver && SeenObserver.setCurrentLocation) {
      SeenObserver.setCurrentLocation(slug);
    }

    const { holdName, locName, items } = locData;
    const hideChecked = AppState.getState().ui.hideChecked;
    const hideByGroup = AppState.getState().ui.hideCheckedByGroup || {};
    const isGroupHide = hideByGroup[slug] !== undefined ? hideByGroup[slug] : hideChecked;

    const checkedInLoc = items.filter(it => AppState.isChecked(it.id)).length;
    const allCompleted = checkedInLoc === items.length && items.length > 0;

    cardEl.className = 'location-card';
    if (allCompleted) cardEl.classList.add('all-completed');

    // Header
    let contentHtml = `
      <div class="location-card-header">
        <div class="location-header-title-group">
          <span class="location-icon">🏰</span>
          <span class="location-title">${locName}</span>
          <span class="hold-pill">${holdName}</span>
        </div>
        <div class="location-meta-group">
          <span class="location-progress-pill">${checkedInLoc}/${items.length} ${allCompleted ? '✓' : ''}</span>
          <button class="location-actions-btn" onclick="UIRenderer.toggleBatchLoc('${slug}', true)">Tick hết</button>
          <button class="location-actions-btn" onclick="UIRenderer.toggleBatchLoc('${slug}', false)">Bỏ tick</button>
        </div>
      </div>
    `;

    // Collapsed summary bar if 100% completed and hidden
    if (allCompleted && isGroupHide) {
      contentHtml += `
        <div class="location-collapsed-summary" onclick="UIRenderer.unhideGroup('${slug}')">
          <span>✓ Đã hoàn thành toàn bộ ${items.length} món tại đây</span>
          <span style="text-decoration:underline;">Bấm xem lại</span>
        </div>
      `;
      cardEl.innerHTML = contentHtml;
      cardEl.setAttribute('data-mounted', 'true');
      cardEl.style.minHeight = '';
      return;
    }

    // Item rows list
    let rowsHtml = '<div class="item-rows-list">';
    items.forEach(it => {
      const isChecked = AppState.isChecked(it.id);
      const isSeen = AppState.isSeen(it.id);

      let rowCls = 'item-row';
      if (isChecked) rowCls += ' is-checked';
      if (isSeen) rowCls += ' is-seen';
      if (isChecked && isGroupHide) rowCls += ' hidden-checked';

      let spBadgeCls = 'badge-tag';
      if (it.sp === 'base') spBadgeCls += ' badge-source-base';
      else if (it.sp === 'lotd') spBadgeCls += ' badge-source-lotd';
      else if (it.sp && it.sp.startsWith('cc:')) spBadgeCls += ' badge-source-cc';

      let hintIcon = '🗝';
      if (it.acq === 'craft') hintIcon = '⚒';
      else if (it.acq === 'quest') hintIcon = '📜';
      else if (it.acq === 'vendor') hintIcon = '🛒';

      let hintText = it.det || it.p;
      if (it.cs) hintText = `${it.cs}: ${it.ci || hintText}`;
      if (it.q) hintText = `Quest: ${it.q}`;

      rowsHtml += `
        <div class="${rowCls}" id="item_${it.id}" data-item-id="${it.id}" data-loc-id="${slug}">
          <div class="item-tier-1">
            <div class="item-checkbox-wrapper" onclick="UIRenderer.handleItemCheckClick('${it.id}', event)">
              <div class="item-check-box"></div>
              <span class="item-name">${it.n}</span>
            </div>
            <div class="item-badges-group">
              <span class="badge-tag">${it.t}</span>
              <span class="${spBadgeCls}">${it.sp}</span>
              <span class="btn-toggle-tier3" onclick="UIRenderer.toggleTier3('${it.id}')">Chi tiết ▼</span>
            </div>
          </div>
          <div class="item-tier-2">${hintIcon} ${hintText}</div>
        </div>
      `;
    });
    rowsHtml += '</div>';

    cardEl.innerHTML = contentHtml + rowsHtml;
    cardEl.setAttribute('data-mounted', 'true');
    cardEl.style.minHeight = '';

    if (window.SeenObserver) {
      cardEl.querySelectorAll('.item-row').forEach(r => SeenObserver.observe(r));
      SeenObserver.observeLocation(cardEl);
    }
  }

  // Unmount far card to maintain DOM node count under budget
  function unmountLocationCard(slug, cardEl) {
    if (!cardEl) cardEl = document.getElementById(`loc_${slug}`);
    if (!cardEl) return;
    if (cardEl.getAttribute('data-mounted') !== 'true') return;

    if (window.SeenObserver) {
      SeenObserver.unobserveLocation(cardEl);
    }

    const locData = locationRegistry.get(slug);
    const estHeight = locData ? (52 + locData.items.length * 48) : 200;
    const currentH = cardEl.offsetHeight || estHeight;

    cardEl.innerHTML = '';
    cardEl.style.minHeight = `${currentH}px`;
    cardEl.removeAttribute('data-mounted');
  }

  function unhideGroup(slug) {
    AppState.updateUI({
      hideCheckedByGroup: Object.assign({}, AppState.getState().ui.hideCheckedByGroup, { [slug]: false })
    });
    renderContent(filterResult);
  }

  // Render Main Content
  function renderContent(fRes) {
    filterResult = fRes;
    const container = document.getElementById('items-main-container');
    if (!container) return;

    if (cardObserver) cardObserver.disconnect();
    locationRegistry.clear();

    // Group items by Hold -> Location
    const groups = {};
    for (let i = 0; i < itemsData.length; i++) {
      if (filterResult && !filterResult.hasBit(i)) continue;
      const it = itemsData[i];
      const h = it.h || 'Non-regional';
      const loc = it.loc || 'General Exploration';

      if (!groups[h]) groups[h] = {};
      if (!groups[h][loc]) groups[h][loc] = [];
      groups[h][loc].push(it);
    }

    const fragment = document.createDocumentFragment();
    let totalCards = 0;

    for (const [holdName, locsDict] of Object.entries(groups)) {
      for (const [locName, locItems] of Object.entries(locsDict)) {
        totalCards++;
        const locSlug = `${holdName}__${locName}`.replace(/[^A-Za-z0-9_]/g, '_');
        locationRegistry.set(locSlug, { holdName, locName, locSlug, items: locItems });

        const card = document.createElement('div');
        card.className = 'location-card';
        card.id = `loc_${locSlug}`;
        card.setAttribute('data-loc-id', locSlug);

        // Pre-calculated height placeholder
        const estHeight = 52 + locItems.length * 48;
        card.style.minHeight = `${estHeight}px`;

        // Immediately mount the first card in initial viewport
        if (totalCards <= 1) {
          mountLocationCard(locSlug, card);
        }

        fragment.appendChild(card);
      }
    }

    container.innerHTML = '';
    if (totalCards === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-md);">
          <h3>Không tìm thấy vật phẩm nào khớp với bộ lọc</h3>
          <p style="margin-top:8px;">Hãy thử nới lỏng từ khóa tìm kiếm hoặc bấm Xóa tất cả bộ lọc.</p>
          <button style="margin-top:16px; padding:8px 16px; background:var(--accent-gold); color:var(--text-inverse); border-radius:var(--radius-sm); font-weight:600;" onclick="AppState.updateFilters({ facets: { type:[], hold:[], loc:[], quest:[], sp:[], acq:[], hall:[], status:[] }, search: '' })">Xóa tất cả bộ lọc</button>
        </div>
      `;
    } else {
      container.appendChild(fragment);

      // Register all cards with Viewport Observer
      if (cardObserver) {
        const allCards = container.querySelectorAll('.location-card');
        allCards.forEach(c => cardObserver.observe(c));
      }
    }

    renderDashboard();
    renderTOC();
  }

  // Handle Item Check Click (Localized DOM mutation - No innerHTML wipe)
  function handleItemCheckClick(id, event) {
    if (event) event.stopPropagation();
    const isNowChecked = !AppState.isChecked(id);
    AppState.setChecked(id, isNowChecked);

    const row = document.getElementById(`item_${id}`);
    if (row) {
      if (isNowChecked) {
        row.classList.add('is-checked');
        lastCheckedItem = id;
        const hideChecked = AppState.getState().ui.hideChecked;
        if (hideChecked) {
          const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (isReduced) {
            row.classList.add('hidden-checked');
          } else {
            row.classList.add('fading-out');
            showUndoToast(id);
            setTimeout(() => {
              row.classList.add('hidden-checked');
              row.classList.remove('fading-out');
            }, 1200);
          }
        }
      } else {
        row.classList.remove('is-checked', 'hidden-checked', 'fading-out');
      }
    }

    // Synchronize all rows sharing the same ID in mounted cards
    const matchingRows = document.querySelectorAll(`[data-item-id="${id}"]`);
    matchingRows.forEach(r => {
      if (r !== row) {
        r.classList.toggle('is-checked', isNowChecked);
      }
    });

    // Update parent card progress pill without full re-render
    const cardEl = row ? row.closest('.location-card') : null;
    if (cardEl) {
      const slug = cardEl.getAttribute('data-loc-id');
      const locData = locationRegistry.get(slug);
      if (locData) {
        const checkedCount = locData.items.filter(it => AppState.isChecked(it.id)).length;
        const pill = cardEl.querySelector('.location-progress-pill');
        if (pill) {
          const allDone = checkedCount === locData.items.length;
          pill.textContent = `${checkedCount}/${locData.items.length} ${allDone ? '✓' : ''}`;
          cardEl.classList.toggle('all-completed', allDone);
        }
      }
    }

    renderDashboard();
  }

  function showUndoToast(id) {
    const banner = document.getElementById('undo-toast-banner');
    if (!banner) return;

    banner.innerHTML = `
      <span>Đã ẩn 1 item.</span>
      <button style="color:var(--accent-gold); font-weight:700; text-decoration:underline;" onclick="UIRenderer.undoLastCheck('${id}')">Hoàn tác</button>
    `;
    banner.style.display = 'flex';

    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      banner.style.display = 'none';
    }, 4500);
  }

  function undoLastCheck(id) {
    AppState.setChecked(id, false);
    const row = document.getElementById(`item_${id}`);
    if (row) {
      row.classList.remove('is-checked', 'hidden-checked', 'fading-out');
    }
    const banner = document.getElementById('undo-toast-banner');
    if (banner) banner.style.display = 'none';
    renderDashboard();
  }

  // Lazy Tier 3 toggle
  function toggleTier3(id) {
    const row = document.getElementById(`item_${id}`);
    if (!row) return;

    let tier3 = row.querySelector('.item-tier-3');
    if (!tier3) {
      const it = itemsMap.get(id);
      if (it) {
        tier3 = buildTier3Element(it);
        row.appendChild(tier3);
      }
    }

    const isOpen = row.classList.toggle('tier3-open');
    const btn = row.querySelector('.btn-toggle-tier3');
    if (btn) {
      btn.textContent = isOpen ? 'Thu gọn ▲' : 'Chi tiết ▼';
    }
  }

  function toggleBatchLoc(locSlug, isCheck) {
    const locData = locationRegistry.get(locSlug);
    const ids = locData ? locData.items.map(it => it.id) : [];
    if (ids.length === 0) return;

    AppState.setBatchChecked(ids, isCheck);
    const card = document.getElementById(`loc_${locSlug}`);
    if (card) {
      mountLocationCard(locSlug, card, true);
    }
    renderDashboard();
  }

  // TOC Jump & Deep-linking
  function scrollToLocation(locSlug, itemId) {
    const card = document.getElementById(`loc_${locSlug}`);
    if (card) {
      mountLocationCard(locSlug, card);
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });

      if (itemId) {
        setTimeout(() => {
          const row = document.getElementById(`item_${itemId}`);
          if (row) {
            row.classList.remove('hidden-checked');
            row.style.outline = '2px solid var(--accent-gold)';
            setTimeout(() => { row.style.outline = ''; }, 2500);
          }
        }, 350);
      }
    }
  }

  let tocRendered = false;

  // Render TOC (deferred on mobile until drawer opened)
  function renderTOC(force = false) {
    const tocList = document.getElementById('toc-tree-container');
    if (!tocList) return;

    const isMobile = window.innerWidth < 1024;
    if (isMobile && !force && !tocRendered) {
      return;
    }
    tocRendered = true;

    const holdGroups = {};
    for (let i = 0; i < itemsData.length; i++) {
      const it = itemsData[i];
      const h = it.h || 'Non-regional';
      const loc = it.loc || 'General Exploration';
      if (!holdGroups[h]) holdGroups[h] = {};
      if (!holdGroups[h][loc]) holdGroups[h][loc] = { total: 0, checked: 0, seen: 0 };
      holdGroups[h][loc].total++;
      if (AppState.isChecked(it.id)) holdGroups[h][loc].checked++;
      if (AppState.isSeen(it.id)) holdGroups[h][loc].seen++;
    }

    let html = '';
    for (const [holdName, locs] of Object.entries(holdGroups)) {
      let holdTotal = 0;
      let holdChecked = 0;
      let locItemsHtml = '';

      for (const [locName, s] of Object.entries(locs)) {
        holdTotal += s.total;
        holdChecked += s.checked;
        const slug = `${holdName}__${locName}`.replace(/[^A-Za-z0-9_]/g, '_');

        let seenIcon = '○';
        if (s.seen === s.total && s.total > 0) seenIcon = '●';
        else if (s.seen > 0) seenIcon = '◐';

        locItemsHtml += `
          <div class="toc-loc-item" onclick="UIRenderer.scrollToLocation('${slug}')" style="display:flex; justify-content:space-between; padding:3px 0; font-size:12px; cursor:pointer; color:var(--text-secondary);">
            <span><span style="color:var(--accent-gold);">${seenIcon}</span> ${locName}</span>
            <span style="font-size:11px; color:var(--text-muted);">${s.checked}/${s.total}</span>
          </div>
        `;
      }

      html += `
        <div class="toc-hold-group" style="margin-bottom:12px;">
          <div style="font-weight:700; font-size:13px; color:var(--text-primary); display:flex; justify-content:space-between; margin-bottom:4px;">
            <span>${holdName}</span>
            <span style="color:var(--accent-gold); font-size:11px;">${holdChecked}/${holdTotal}</span>
          </div>
          <div style="padding-left:10px; border-left:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:2px;">
            ${locItemsHtml}
          </div>
        </div>
      `;
    }

    tocList.innerHTML = html;
  }

  return {
    init,
    renderDashboard,
    renderContent,
    renderTOC,
    handleItemCheckClick,
    undoLastCheck,
    toggleTier3,
    toggleBatchLoc,
    scrollToLocation,
    unhideGroup,
    mountLocationCard
  };
})();

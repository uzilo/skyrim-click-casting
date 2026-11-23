/**
 * Main Application Controller & Event Wiring
 */
document.addEventListener('DOMContentLoaded', () => {
  // Load embedded data
  const dataScript = document.getElementById('lotd-embedded-data');
  if (!dataScript) {
    console.error('Embedded data script not found!');
    return;
  }

  const items = JSON.parse(dataScript.textContent);

  // Initialize modules
  AppState.init();
  FilterEngine.init(items);
  SeenObserver.init();
  UIRenderer.init(items);

  // Apply initial theme and density
  const uiState = AppState.getState().ui;
  document.documentElement.setAttribute('data-theme', uiState.theme || 'dark');
  document.documentElement.setAttribute('data-density', uiState.density || 'comfortable');

  // Update Hide Checked button state
  const btnHideChecked = document.getElementById('btn-toggle-hide-checked');
  if (btnHideChecked) {
    btnHideChecked.textContent = uiState.hideChecked ? '👁 Hiện đã nhặt' : '👁‍🗨 Ẩn đã nhặt';
    if (uiState.hideChecked) btnHideChecked.classList.add('active');
  }

  // Initial Filter & Render
  const initialFilterRes = FilterEngine.filter(AppState.getState().filters);
  UIRenderer.renderContent(initialFilterRes);

  // Check URL Hash deep-linking
  if (window.location.hash) {
    const hash = window.location.hash.substring(1);
    if (hash.startsWith('item_')) {
      const itemId = hash.substring(5);
      setTimeout(() => {
        const el = document.getElementById(`item_${itemId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = '2px solid var(--accent-gold)';
          setTimeout(() => { el.style.outline = ''; }, 2500);
        }
      }, 500);
    }
  } else if (uiState.autoResume && AppState.getState().resume) {
    // Auto-resume if enabled
    const r = AppState.getState().resume;
    setTimeout(() => {
      UIRenderer.scrollToLocation(r.locId, r.itemId);
    }, 400);
  } else if (AppState.getState().resume) {
    // Show resume floating banner
    const r = AppState.getState().resume;
    const banner = document.getElementById('resume-floating-banner');
    if (banner) {
      document.getElementById('resume-loc-name').textContent = r.locId.replace(/_/g, ' ');
      banner.style.display = 'flex';
    }
  }

  // Event: Filters changed
  window.addEventListener('lotd:filters-changed', () => {
    const fRes = FilterEngine.filter(AppState.getState().filters);
    UIRenderer.renderContent(fRes);
    updateFilterBadge();
  });

  // Event: Checked changed (Localized mutation - only re-render if active filter requires it)
  window.addEventListener('lotd:checked-changed', () => {
    const facets = AppState.getState().filters.facets;
    if (facets.status && facets.status.length > 0) {
      const fRes = FilterEngine.filter(AppState.getState().filters);
      UIRenderer.renderContent(fRes);
    }
  });

  // Event: UI changed
  window.addEventListener('lotd:ui-changed', () => {
    const ui = AppState.getState().ui;
    document.documentElement.setAttribute('data-theme', ui.theme);
    document.documentElement.setAttribute('data-density', ui.density);
    if (btnHideChecked) {
      btnHideChecked.textContent = ui.hideChecked ? '👁 Hiện đã nhặt' : '👁‍🗨 Ẩn đã nhặt';
      if (ui.hideChecked) btnHideChecked.classList.add('active');
      else btnHideChecked.classList.remove('active');
    }
  });

  // Header Search Input with IME composition shielding & adaptive debounce
  const searchInput = document.getElementById('header-search-input');
  if (searchInput) {
    let sTimer = null;
    let isComposing = false;
    const debounceMs = window.innerWidth < 768 ? 240 : 180;

    searchInput.value = AppState.getState().filters.search || '';

    searchInput.addEventListener('compositionstart', () => {
      isComposing = true;
      if (sTimer) clearTimeout(sTimer);
    });

    searchInput.addEventListener('compositionend', (e) => {
      isComposing = false;
      if (sTimer) clearTimeout(sTimer);
      sTimer = setTimeout(() => {
        AppState.updateFilters({ search: e.target.value });
      }, debounceMs);
    });

    searchInput.addEventListener('input', (e) => {
      if (e.isComposing || isComposing) return;
      if (sTimer) clearTimeout(sTimer);
      sTimer = setTimeout(() => {
        AppState.updateFilters({ search: e.target.value });
      }, debounceMs);
    });

    // Support instant ESC to clear
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        if (sTimer) clearTimeout(sTimer);
        AppState.updateFilters({ search: '' });
      }
    });
  }

  // Hide Checked Toggle Button
  if (btnHideChecked) {
    btnHideChecked.addEventListener('click', () => {
      const nowHidden = !AppState.getState().ui.hideChecked;
      AppState.updateUI({ hideChecked: nowHidden });
      const fRes = FilterEngine.filter(AppState.getState().filters);
      UIRenderer.renderContent(fRes);
    });
  }

  // Theme Toggle Button
  const btnTheme = document.getElementById('btn-toggle-theme');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      const current = AppState.getState().ui.theme;
      const next = current === 'parchment' ? 'dark' : 'parchment';
      AppState.updateUI({ theme: next });
    });
  }

  // Density Selector
  const selDensity = document.getElementById('select-density');
  if (selDensity) {
    selDensity.value = uiState.density || 'comfortable';
    selDensity.addEventListener('change', (e) => {
      AppState.updateUI({ density: e.target.value });
    });
  }

  // Mobile Bottom Navigation Buttons
  const btnMobileTOC = document.getElementById('m-nav-toc');
  const btnMobileFilter = document.getElementById('m-nav-filter');
  const btnMobileHide = document.getElementById('m-nav-hide');
  const btnMobileTop = document.getElementById('m-nav-top');

  const tocSidebar = document.querySelector('.toc-sidebar');
  const filterPanel = document.querySelector('.filter-panel');

  if (btnMobileTOC && tocSidebar) {
    btnMobileTOC.addEventListener('click', () => {
      const willOpen = !tocSidebar.classList.contains('open');
      if (willOpen) UIRenderer.renderTOC(true);
      tocSidebar.classList.toggle('open');
      if (filterPanel) filterPanel.classList.remove('open');
    });
  }

  if (btnMobileFilter && filterPanel) {
    btnMobileFilter.addEventListener('click', () => {
      const willOpen = !filterPanel.classList.contains('open');
      if (willOpen) {
        window.__stagedFacets = JSON.parse(JSON.stringify(AppState.getState().filters.facets));
        renderFilterControls();
      } else {
        commitStagedFilters();
      }
      filterPanel.classList.toggle('open');
      if (tocSidebar) tocSidebar.classList.remove('open');
    });
  }

  if (btnMobileHide) {
    btnMobileHide.addEventListener('click', () => {
      const nowHidden = !AppState.getState().ui.hideChecked;
      AppState.updateUI({ hideChecked: nowHidden });
      const fRes = FilterEngine.filter(AppState.getState().filters);
      UIRenderer.renderContent(fRes);
    });
  }

  if (btnMobileTop) {
    btnMobileTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Update mobile filter badge
  function updateFilterBadge() {
    const badge = document.getElementById('m-filter-count-badge');
    if (!badge) return;
    const facets = AppState.getState().filters.facets;
    let count = 0;
    for (const arr of Object.values(facets)) {
      count += arr.length;
    }
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
  updateFilterBadge();

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // If typing in input, ignore
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      if (searchInput) searchInput.focus();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      if (filterPanel) filterPanel.classList.toggle('open');
    } else if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      if (btnHideChecked) btnHideChecked.click();
    } else if (e.key === 'g' || e.key === 'G') {
      e.preventDefault();
      const r = AppState.getState().resume;
      if (r && r.locId) UIRenderer.scrollToLocation(r.locId, r.itemId);
    } else if (e.key === 'Escape') {
      if (tocSidebar) tocSidebar.classList.remove('open');
      if (filterPanel) filterPanel.classList.remove('open');
    }
  });

  // Render Filter Checkboxes
  renderFilterControls();
});

function renderFilterControls() {
  const container = document.getElementById('facet-controls-container');
  if (!container) return;

  const currentFilters = AppState.getState().filters.facets;

  // Facet configuration
  const facetConfigs = [
    {
      id: 'sp',
      title: 'Xuất xứ (Source Pack)',
      options: [
        { val: 'base', label: 'Base Game (Skyrim)' },
        { val: 'lotd', label: 'Legacy of the Dragonborn' },
        { val: 'dragonborn', label: 'DLC Dragonborn' },
        { val: 'dawnguard', label: 'DLC Dawnguard' },
        { val: 'hearthfire', label: 'DLC Hearthfire' }
      ]
    },
    {
      id: 'status',
      title: 'Trạng thái nhặt & xem',
      options: [
        { val: 'uncollected', label: 'Chưa nhặt' },
        { val: 'collected', label: 'Đã nhặt' },
        { val: 'unseen', label: 'Chưa xem (Chưa lướt tới)' },
        { val: 'seen_uncollected', label: 'Đã xem nhưng chưa nhặt' },
        { val: 'can_craft', label: 'Có thể chế tạo (Craftable)' }
      ]
    },
    {
      id: 'acq',
      title: 'Kiểu nhận (Acquisition)',
      options: [
        { val: 'loot', label: '🗝 Khám phá & Nhặt (Loot)' },
        { val: 'craft', label: '⚒ Chế tạo / Khảo cổ (Craft)' },
        { val: 'quest', label: '📜 Nhiệm vụ (Quest)' },
        { val: 'vendor', label: '🛒 Mua từ thương nhân' },
        { val: 'unknown', label: '❓ Chưa rõ cách lấy' }
      ]
    }
  ];

  let html = '';
  facetConfigs.forEach(fc => {
    html += `
      <div class="filter-facet-group" style="border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:12px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-primary); margin-bottom:8px;">${fc.title}</div>
        <div style="display:flex; flex-direction:column; gap:4px;">
    `;

    fc.options.forEach(opt => {
      const isChecked = (currentFilters[fc.id] || []).includes(opt.val);
      html += `
        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; color:var(--text-secondary);">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="handleFacetChange('${fc.id}', '${opt.val}', this.checked)" style="accent-color:var(--accent-gold); width:15px; height:15px;">
          <span>${opt.label}</span>
        </label>
      `;
    });

    html += `</div></div>`;
  });

  // Action buttons
  html += `
    <div style="display:flex; flex-direction:column; gap:8px; margin-top:16px;">
      <button style="width:100%; padding:10px; background:var(--accent-gold); color:var(--text-inverse); font-size:12px; font-weight:700; border:none; border-radius:var(--radius-sm); cursor:pointer;" onclick="applyAndCloseFilters()">Áp dụng bộ lọc</button>
      <div style="display:flex; gap:8px;">
        <button style="flex:1; padding:6px; background:var(--accent-gold-subtle); border:1px solid var(--accent-gold); color:var(--accent-gold); font-size:11px; font-weight:600; border-radius:var(--radius-sm); cursor:pointer;" onclick="clearAllFilters()">Xóa bộ lọc</button>
        <button style="flex:1; padding:6px; background:var(--bg-card); border:1px solid var(--border-medium); font-size:11px; font-weight:600; border-radius:var(--radius-sm); cursor:pointer;" onclick="openExportModal()">Xuất / Nhập</button>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function handleFacetChange(facetKey, val, isChecked) {
  const isMobile = window.innerWidth < 1024;
  const facetsSource = isMobile ? (window.__stagedFacets || AppState.getState().filters.facets) : AppState.getState().filters.facets;
  const list = facetsSource[facetKey] ? [...facetsSource[facetKey]] : [];
  if (isChecked) {
    if (!list.includes(val)) list.push(val);
  } else {
    const idx = list.indexOf(val);
    if (idx !== -1) list.splice(idx, 1);
  }
  const updated = Object.assign({}, facetsSource, { [facetKey]: list });
  if (isMobile) {
    window.__stagedFacets = updated;
  } else {
    AppState.updateFilters({ facets: updated });
  }
}

function commitStagedFilters() {
  if (window.__stagedFacets) {
    const current = AppState.getState().filters.facets;
    if (JSON.stringify(window.__stagedFacets) !== JSON.stringify(current)) {
      AppState.updateFilters({ facets: window.__stagedFacets });
    }
    window.__stagedFacets = null;
  }
}

function applyAndCloseFilters() {
  commitStagedFilters();
  const filterPanel = document.querySelector('.filter-panel');
  if (filterPanel) filterPanel.classList.remove('open');
}

function clearAllFilters() {
  window.__stagedFacets = null;
  AppState.updateFilters({ facets: { type:[], hold:[], loc:[], quest:[], sp:[], acq:[], hall:[], status:[] }, search: '' });
  renderFilterControls();
}

function resumeLastLocation() {
  const r = AppState.getState().resume;
  if (r && r.locId) {
    UIRenderer.scrollToLocation(r.locId, r.itemId);
    const b = document.getElementById('resume-floating-banner');
    if (b) b.style.display = 'none';
  }
}

function dismissResumeBanner() {
  const b = document.getElementById('resume-floating-banner');
  if (b) b.style.display = 'none';
}

function openExportModal() {
  const data = AppState.exportData(true);
  const userAction = prompt("Sao chép dữ liệu tiến độ bên dưới để lưu trữ, hoặc dán dữ liệu JSON vào để khôi phục:", data);
  if (userAction && userAction.trim() !== data.trim()) {
    const res = AppState.importData(userAction.trim(), false);
    if (res.success) {
      alert(`Đã khôi phục thành công tiến độ (${res.count} món đã nhặt)!`);
    } else {
      alert(`Lỗi khi nhập dữ liệu: ${res.error}`);
    }
  }
}

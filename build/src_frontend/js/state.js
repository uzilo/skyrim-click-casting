/**
 * State Management & LocalStorage Persistence Engine
 * Namespace: lotd6:
 */
const AppState = (() => {
  const PREFIX = 'lotd6:';
  const DATA_VERSION = '6.x';
  const SCHEMA_VERSION = 1;

  // In-memory state
  const state = {
    checked: new Set(),
    seen: new Set(),
    history: [],
    resume: null,
    ui: {
      theme: 'dark',
      density: 'comfortable',
      hideChecked: false,
      hideCheckedByGroup: {},
      autoResume: false,
      showSeenMarks: true,
      activeView: 'location'
    },
    filters: {
      search: '',
      facets: {
        type: [],
        hold: [],
        loc: [],
        quest: [],
        sp: [],
        acq: [],
        hall: [],
        status: []
      },
      exclude: {}
    },
    presets: []
  };

  let saveTimer = null;
  let isLocalStorageAvailable = true;

  // Test localStorage availability
  try {
    const testKey = '__lotd_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
  } catch (e) {
    isLocalStorageAvailable = false;
    console.warn('LocalStorage is blocked or unavailable (e.g. strict file:// sandboxing). Using session fallback.');
  }

  function getStorage(key, fallback = null) {
    if (!isLocalStorageAvailable) return fallback;
    try {
      const val = localStorage.getItem(PREFIX + key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function setStorage(key, val) {
    if (!isLocalStorageAvailable) return;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(val));
    } catch (e) {
      console.error('LocalStorage write error:', e);
    }
  }

  function loadInitialState() {
    // 1. Checked items
    const savedChecked = getStorage('checked', []);
    if (Array.isArray(savedChecked)) {
      state.checked = new Set(savedChecked);
    }

    // 2. Seen items
    const savedSeen = getStorage('seen', []);
    if (Array.isArray(savedSeen)) {
      state.seen = new Set(savedSeen);
    }

    // 3. UI settings
    const savedUI = getStorage('ui', {});
    state.ui = Object.assign(state.ui, savedUI);

    // 4. Resume
    state.resume = getStorage('resume', null);

    // 5. History
    state.history = getStorage('history', []);

    // 6. Presets
    state.presets = getStorage('presets', [
      { name: 'Chưa nhặt', filters: { status: ['uncollected'] } },
      { name: 'Chưa nhặt (Base Game)', filters: { status: ['uncollected'], sp: ['base'] } },
      { name: 'Chỉ riêng LOTD', filters: { sp: ['lotd'] } },
      { name: 'Chỉ đồ chế tác', filters: { acq: ['craft'] } },
      { name: 'Chỉ đồ nhiệm vụ', filters: { acq: ['quest'] } }
    ]);

    // 7. Filters
    const savedFilters = getStorage('filters', null);
    if (savedFilters && savedFilters.facets) {
      state.filters = savedFilters;
    }

    // Check version
    const meta = getStorage('meta', { schema: SCHEMA_VERSION, data: DATA_VERSION });
    if (meta.data !== DATA_VERSION) {
      setStorage('meta', { schema: SCHEMA_VERSION, data: DATA_VERSION });
    }
  }

  function debounceSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 350);
  }

  function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    setStorage('checked', Array.from(state.checked));
    setStorage('seen', Array.from(state.seen));
    setStorage('ui', state.ui);
    setStorage('resume', state.resume);
    setStorage('history', state.history.slice(-50));
    setStorage('filters', state.filters);
    setStorage('presets', state.presets);
  }

  // Flush on tab hide/close
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('pagehide', flushSave);

  // Cross-tab sync
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(PREFIX)) return;
    const subKey = e.key.substring(PREFIX.length);
    if (subKey === 'checked') {
      try {
        state.checked = new Set(JSON.parse(e.newValue || '[]'));
        window.dispatchEvent(new CustomEvent('lotd:checked-changed', { detail: { external: true } }));
      } catch (err) {}
    } else if (subKey === 'ui') {
      try {
        state.ui = Object.assign(state.ui, JSON.parse(e.newValue || '{}'));
        window.dispatchEvent(new CustomEvent('lotd:ui-changed'));
      } catch (err) {}
    }
  });

  return {
    init: loadInitialState,
    getState: () => state,
    isAvailable: () => isLocalStorageAvailable,

    isChecked: (id) => state.checked.has(id),
    setChecked: (id, val) => {
      if (val) {
        state.checked.add(id);
        state.history.push({ id, act: 'check', t: Date.now() });
      } else {
        state.checked.delete(id);
        state.history.push({ id, act: 'uncheck', t: Date.now() });
      }
      debounceSave();
      window.dispatchEvent(new CustomEvent('lotd:checked-changed', { detail: { id, val } }));
    },
    setBatchChecked: (ids, val) => {
      ids.forEach(id => {
        if (val) state.checked.add(id);
        else state.checked.delete(id);
      });
      debounceSave();
      window.dispatchEvent(new CustomEvent('lotd:checked-changed', { detail: { batch: true, val } }));
    },

    isSeen: (id) => state.seen.has(id),
    markSeen: (id) => {
      if (!state.seen.has(id)) {
        state.seen.add(id);
        debounceSave();
      }
    },
    clearSeen: () => {
      state.seen.clear();
      debounceSave();
      window.dispatchEvent(new CustomEvent('lotd:seen-cleared'));
    },

    setResumePoint: (locId, itemId) => {
      state.resume = { locId, itemId, ts: Date.now() };
      debounceSave();
    },

    updateUI: (updates) => {
      Object.assign(state.ui, updates);
      debounceSave();
      window.dispatchEvent(new CustomEvent('lotd:ui-changed'));
    },

    updateFilters: (updates) => {
      Object.assign(state.filters, updates);
      debounceSave();
      window.dispatchEvent(new CustomEvent('lotd:filters-changed'));
    },

    savePreset: (name, filterData) => {
      state.presets.push({ name, filters: filterData });
      debounceSave();
      window.dispatchEvent(new CustomEvent('lotd:presets-changed'));
    },
    deletePreset: (index) => {
      state.presets.splice(index, 1);
      debounceSave();
      window.dispatchEvent(new CustomEvent('lotd:presets-changed'));
    },

    exportData: (includePreferences = true) => {
      const payload = {
        app: 'LOTD_Checklist',
        version: DATA_VERSION,
        schema: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        checked: Array.from(state.checked),
        seen: Array.from(state.seen)
      };
      if (includePreferences) {
        payload.history = state.history;
        payload.ui = state.ui;
        payload.filters = state.filters;
        payload.presets = state.presets;
        payload.resume = state.resume;
      }
      return JSON.stringify(payload, null, 2);
    },

    importData: (jsonStr, merge = false) => {
      try {
        const data = JSON.parse(jsonStr);
        if (!data.checked || !Array.isArray(data.checked)) {
          throw new Error('Dữ liệu không đúng định dạng');
        }
        if (merge) {
          data.checked.forEach(id => state.checked.add(id));
          if (Array.isArray(data.seen)) data.seen.forEach(id => state.seen.add(id));
        } else {
          state.checked = new Set(data.checked);
          if (Array.isArray(data.seen)) state.seen = new Set(data.seen);
          if (data.ui) state.ui = Object.assign(state.ui, data.ui);
          if (data.presets) state.presets = data.presets;
        }
        flushSave();
        window.dispatchEvent(new CustomEvent('lotd:checked-changed', { detail: { imported: true } }));
        return { success: true, count: state.checked.size };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    resetAll: () => {
      state.checked.clear();
      state.seen.clear();
      state.history = [];
      state.resume = null;
      flushSave();
      window.dispatchEvent(new CustomEvent('lotd:checked-changed', { detail: { reset: true } }));
    }
  };
})();

/**
 * LOTD SSE v6 Checklist - Real-time Performance HUD
 * Requirement A4: Zero-overhead when disabled. Activates with ?perf=1 or 3s long-press on logo.
 */

window.PerfHUD = (() => {
  let isEnabled = false;
  let isMinimized = false;
  let hudEl = null;

  // Real-time metrics
  let currentFps = 60;
  let frameCount = 0;
  let lastFpsUpdateTime = performance.now();
  let droppedFrames = 0;
  let rafId = null;

  let longTasksCount = 0;
  let totalBlockingTime = 0;
  let longTaskObserver = null;

  let lastActionName = 'None';
  let lastActionDuration = 0;

  let domNodeCount = 0;
  let jsHeapMb = 0;
  let statInterval = null;

  // 1. Check activation trigger
  function shouldActivate() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('perf') === '1') return true;
      if (sessionStorage.getItem('lotd_perf_active') === '1') return true;
    } catch (e) {}
    return false;
  }

  // 2. Setup long-press listener on logo (3s)
  function setupLongPressTrigger() {
    const headerTitle = document.querySelector('.brand-area') || document.querySelector('.brand-title') || document.querySelector('header');
    if (!headerTitle) return;

    let pressTimer = null;
    let startX = 0, startY = 0;

    const startPress = (e) => {
      if (e.touches && e.touches.length > 1) return;
      if (e.touches) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
      pressTimer = setTimeout(() => {
        toggleHUD(true);
      }, 3000);
    };

    const cancelPress = (e) => {
      if (e && e.touches && e.touches.length > 0) {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx < 10 && dy < 10) return; // ignore micro movements
      }
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    headerTitle.addEventListener('mousedown', startPress);
    headerTitle.addEventListener('mouseup', cancelPress);
    headerTitle.addEventListener('mouseleave', cancelPress);
    headerTitle.addEventListener('touchstart', startPress, { passive: true });
    headerTitle.addEventListener('touchend', cancelPress, { passive: true });
    headerTitle.addEventListener('touchmove', cancelPress, { passive: true });
  }

  // 3. Initialize HUD
  function initHUD() {
    if (hudEl) return;

    // Create DOM structure
    hudEl = document.createElement('div');
    hudEl.id = 'perf-hud';
    hudEl.className = 'perf-hud-overlay';
    hudEl.innerHTML = `
      <div class="perf-hud-toast" id="perf-hud-toast">Đã sao chép JSON!</div>
      <div class="perf-hud-header" id="perf-hud-header">
        <span class="perf-hud-title">⚡ PERF HUD</span>
        <div class="perf-hud-ctrls">
          <button class="perf-hud-btn-mini" id="perf-hud-btn-min" title="Thu nhỏ/Phóng to">_</button>
          <button class="perf-hud-btn-mini" id="perf-hud-btn-close" title="Đóng">✕</button>
        </div>
      </div>
      <div class="perf-hud-body" id="perf-hud-body">
        <div class="perf-hud-row">
          <span class="perf-hud-label">FPS / Drop:</span>
          <span class="perf-hud-val good" id="phud-fps">60 fps (0 drop)</span>
        </div>
        <div class="perf-hud-row">
          <span class="perf-hud-label">Long Tasks / TBT:</span>
          <span class="perf-hud-val" id="phud-tbt">0 / 0ms</span>
        </div>
        <div class="perf-hud-row">
          <span class="perf-hud-label">Tác vụ gần nhất:</span>
          <span class="perf-hud-val" id="phud-action">-</span>
        </div>
        <div class="perf-hud-row">
          <span class="perf-hud-label">DOM Nodes:</span>
          <span class="perf-hud-val" id="phud-dom">...</span>
        </div>
        <div class="perf-hud-row">
          <span class="perf-hud-label">JS Heap:</span>
          <span class="perf-hud-val" id="phud-heap">...</span>
        </div>
      </div>
      <div class="perf-hud-actions" id="perf-hud-actions">
        <button class="perf-hud-action-btn" id="phud-btn-copy">📋 Sao chép báo cáo</button>
        <button class="perf-hud-action-btn" id="phud-btn-reset">🔄 Reset TBT</button>
      </div>
    `;

    document.body.appendChild(hudEl);

    // Minimize toggle
    const btnMin = document.getElementById('perf-hud-btn-min');
    btnMin.addEventListener('click', (e) => {
      e.stopPropagation();
      setMiniState(!isMinimized);
    });

    hudEl.addEventListener('click', () => {
      if (isMinimized) setMiniState(false);
    });

    // Close button
    const btnClose = document.getElementById('perf-hud-btn-close');
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHUD(false);
    });

    // Copy report
    document.getElementById('phud-btn-copy').addEventListener('click', copyReport);

    // Reset stats
    document.getElementById('phud-btn-reset').addEventListener('click', () => {
      longTasksCount = 0;
      totalBlockingTime = 0;
      droppedFrames = 0;
      lastActionName = 'Reset';
      lastActionDuration = 0;
      updateUI();
    });

    // Start measurements
    startMeasurementLoop();
  }

  function setMiniState(mini) {
    isMinimized = mini;
    if (isMinimized) {
      hudEl.classList.add('minimized');
      const headerTitle = hudEl.querySelector('.perf-hud-title');
      if (headerTitle) headerTitle.textContent = `⚡ ${currentFps}fps | ${domNodeCount} nodes`;
    } else {
      hudEl.classList.remove('minimized');
      const headerTitle = hudEl.querySelector('.perf-hud-title');
      if (headerTitle) headerTitle.textContent = '⚡ PERF HUD';
    }
  }

  function toggleHUD(forceState) {
    isEnabled = typeof forceState === 'boolean' ? forceState : !isEnabled;
    if (isEnabled) {
      try { sessionStorage.setItem('lotd_perf_active', '1'); } catch (e) {}
      initHUD();
      if (hudEl) hudEl.style.display = 'block';
    } else {
      try { sessionStorage.removeItem('lotd_perf_active'); } catch (e) {}
      stopMeasurementLoop();
      if (hudEl) hudEl.style.display = 'none';
    }
  }

  // 4. Performance Measurement Loop
  function startMeasurementLoop() {
    let lastFrameTime = performance.now();

    // RAF loop for FPS and frame drops
    function measureFrame(now) {
      if (!isEnabled) return;
      frameCount++;
      const frameDelta = now - lastFrameTime;
      lastFrameTime = now;

      if (frameDelta > 33.3) {
        // Dropped frame (> 33.3ms at 60Hz = 1 or more missed frames)
        droppedFrames += Math.floor(frameDelta / 16.6) - 1;
      }

      if (now - lastFpsUpdateTime >= 500) {
        currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdateTime));
        frameCount = 0;
        lastFpsUpdateTime = now;
        updateUI();
      }

      rafId = requestAnimationFrame(measureFrame);
    }

    rafId = requestAnimationFrame(measureFrame);

    // Long Tasks Observer
    try {
      if (window.PerformanceObserver) {
        longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasksCount++;
            if (entry.duration > 50) {
              totalBlockingTime += (entry.duration - 50);
            }
          }
          updateUI();
        });
        longTaskObserver.observe({ type: 'longtask', buffered: true });
      }
    } catch (e) {}

    // Periodic DOM & Memory sampling (every 1s)
    statInterval = setInterval(() => {
      domNodeCount = document.querySelectorAll('*').length;
      if (window.performance && window.performance.memory) {
        jsHeapMb = Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024) * 10) / 10;
      }
      updateUI();
    }, 1000);
  }

  function stopMeasurementLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (longTaskObserver) {
      longTaskObserver.disconnect();
      longTaskObserver = null;
    }
    if (statInterval) {
      clearInterval(statInterval);
      statInterval = null;
    }
  }

  function updateUI() {
    if (!hudEl || !isEnabled) return;

    if (isMinimized) {
      const headerTitle = hudEl.querySelector('.perf-hud-title');
      if (headerTitle) headerTitle.textContent = `⚡ ${currentFps}fps | ${domNodeCount} nodes`;
      return;
    }

    // FPS
    const elFps = document.getElementById('phud-fps');
    if (elFps) {
      elFps.textContent = `${currentFps} fps (${droppedFrames} drops)`;
      elFps.className = `perf-hud-val ${currentFps >= 55 ? 'good' : currentFps >= 30 ? 'warn' : 'bad'}`;
    }

    // TBT
    const elTbt = document.getElementById('phud-tbt');
    if (elTbt) {
      elTbt.textContent = `${longTasksCount} / ${Math.round(totalBlockingTime)}ms`;
      elTbt.className = `perf-hud-val ${totalBlockingTime < 200 ? 'good' : totalBlockingTime < 800 ? 'warn' : 'bad'}`;
    }

    // Last Action
    const elAct = document.getElementById('phud-action');
    if (elAct) {
      elAct.textContent = `${lastActionName}: ${Math.round(lastActionDuration)}ms`;
      elAct.className = `perf-hud-val ${lastActionDuration < 50 ? 'good' : lastActionDuration < 200 ? 'warn' : 'bad'}`;
    }

    // DOM Nodes
    const elDom = document.getElementById('phud-dom');
    if (elDom) {
      elDom.textContent = `${domNodeCount.toLocaleString()} nodes`;
      elDom.className = `perf-hud-val ${domNodeCount <= 2500 ? 'good' : domNodeCount <= 10000 ? 'warn' : 'bad'}`;
    }

    // JS Heap
    const elHeap = document.getElementById('phud-heap');
    if (elHeap) {
      elHeap.textContent = jsHeapMb > 0 ? `${jsHeapMb} MB` : 'N/A';
    }
  }

  // 5. Public API: Record custom actions (search, filter, tick)
  function recordAction(name, durationMs) {
    lastActionName = name;
    lastActionDuration = durationMs;
    if (isEnabled) updateUI();
  }

  // 6. Export report to JSON clipboard
  function copyReport() {
    const report = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      device: {
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        devicePixelRatio: window.devicePixelRatio,
        deviceMemory: navigator.deviceMemory || 'N/A',
        hardwareConcurrency: navigator.hardwareConcurrency || 'N/A'
      },
      metrics: {
        fps: currentFps,
        droppedFrames: droppedFrames,
        longTasksCount: longTasksCount,
        tbtMs: Math.round(totalBlockingTime),
        domNodes: domNodeCount || document.querySelectorAll('*').length,
        jsHeapMb: jsHeapMb || 'N/A',
        lastAction: { name: lastActionName, durationMs: Math.round(lastActionDuration) }
      }
    };

    const text = JSON.stringify(report, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showToast);
    } else {
      prompt('Sao chép báo cáo JSON bên dưới:', text);
    }
  }

  function showToast() {
    const toast = document.getElementById('perf-hud-toast');
    if (toast) {
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }
  }

  // Auto-init on load if enabled
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupLongPressTrigger();
      if (shouldActivate()) toggleHUD(true);
    });
  } else {
    setupLongPressTrigger();
    if (shouldActivate()) toggleHUD(true);
  }

  return {
    toggle: toggleHUD,
    recordAction,
    getStats: () => ({ currentFps, droppedFrames, longTasksCount, totalBlockingTime, domNodeCount, jsHeapMb })
  };
})();

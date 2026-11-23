/**
 * Lightweight IntersectionObserver Engine for 'Seen' Tracking & Location ScrollSpy
 */
const SeenObserver = (() => {
  let locationSpyObserver = null;
  let rowSeenObserver = null;
  const pendingTimers = new Map();
  let currentVisibleLocation = null;
  let currentVisibleItemId = null;
  let resumeTimer = null;

  function init() {
    if (typeof IntersectionObserver === 'undefined') return;

    // 1. Location-level ScrollSpy (Observes only mounted location cards, threshold: 0)
    locationSpyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const locId = entry.target.getAttribute('data-loc-id');
          if (locId) {
            currentVisibleLocation = locId;
            if (resumeTimer) clearTimeout(resumeTimer);
            resumeTimer = setTimeout(() => {
              AppState.setResumePoint(currentVisibleLocation, currentVisibleItemId);
            }, 500);
          }
        }
      });
    }, {
      rootMargin: '-50px 0px -70% 0px',
      threshold: 0
    });

    // 2. Item-level Seen tracking (Single threshold 0.5 with 1.2s fling immunity)
    rowSeenObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const el = entry.target;
        const itemId = el.getAttribute('data-item-id');
        if (!itemId) return;

        if (entry.isIntersecting) {
          currentVisibleItemId = itemId;
          if (!AppState.isSeen(itemId) && !pendingTimers.has(itemId)) {
            const timer = setTimeout(() => {
              AppState.markSeen(itemId);
              el.classList.add('is-seen');
              pendingTimers.delete(itemId);
              window.dispatchEvent(new CustomEvent('lotd:seen-updated', { detail: { itemId } }));
            }, 1200);
            pendingTimers.set(itemId, timer);
          }
        } else {
          if (pendingTimers.has(itemId)) {
            clearTimeout(pendingTimers.get(itemId));
            pendingTimers.delete(itemId);
          }
        }
      });
    }, {
      threshold: 0.5
    });
  }

  function observeLocation(cardEl) {
    if (locationSpyObserver && cardEl) locationSpyObserver.observe(cardEl);
  }

  function unobserveLocation(cardEl) {
    if (locationSpyObserver && cardEl) locationSpyObserver.unobserve(cardEl);
  }

  function observe(rowEl) {
    if (rowSeenObserver && rowEl) rowSeenObserver.observe(rowEl);
  }

  function unobserve(rowEl) {
    if (rowSeenObserver && rowEl) rowSeenObserver.unobserve(rowEl);
  }

  function setCurrentLocation(locId) {
    if (!locId) return;
    currentVisibleLocation = locId;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      AppState.setResumePoint(currentVisibleLocation, currentVisibleItemId);
    }, 600);
  }

  window.SeenObserver = {
    init,
    observe,
    unobserve,
    observeLocation,
    unobserveLocation,
    setCurrentLocation,
    getCurrentLocation: () => currentVisibleLocation
  };
  return window.SeenObserver;
})();

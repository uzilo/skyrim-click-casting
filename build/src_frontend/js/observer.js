/**
 * IntersectionObserver Engine for 'Seen' Tracking & ScrollSpy Resume
 */
const SeenObserver = (() => {
  let observer = null;
  const pendingTimers = new Map();
  let currentVisibleLocation = null;
  let currentVisibleItemId = null;

  function init() {
    if (!('IntersectionObserver' in window)) return;

    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const el = entry.target;
        const itemId = el.getAttribute('data-item-id');
        const locId = el.getAttribute('data-loc-id');

        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          // Track scroll position
          if (locId) currentVisibleLocation = locId;
          if (itemId) currentVisibleItemId = itemId;

          // Set 1.2s timer for seen marking (fling immunity)
          if (itemId && !AppState.isSeen(itemId) && !pendingTimers.has(itemId)) {
            const timer = setTimeout(() => {
              AppState.markSeen(itemId);
              el.classList.add('is-seen');
              pendingTimers.delete(itemId);
              window.dispatchEvent(new CustomEvent('lotd:seen-updated', { detail: { itemId } }));
            }, 1200);
            pendingTimers.set(itemId, timer);
          }
        } else {
          // Element exited or < 50% in viewport -> cancel timer
          if (itemId && pendingTimers.has(itemId)) {
            clearTimeout(pendingTimers.get(itemId));
            pendingTimers.delete(itemId);
          }
        }
      });

      // Update resume point if scrolled
      if (currentVisibleLocation) {
        AppState.setResumePoint(currentVisibleLocation, currentVisibleItemId);
      }
    }, {
      threshold: [0, 0.5, 1.0],
      rootMargin: '0px 0px -40px 0px'
    });
  }

  function observe(el) {
    if (observer && el) observer.observe(el);
  }

  function unobserve(el) {
    if (observer && el) observer.unobserve(el);
  }

  return {
    init,
    observe,
    unobserve,
    getCurrentLocation: () => currentVisibleLocation
  };
})();

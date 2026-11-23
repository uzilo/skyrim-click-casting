/**
 * Bitset-Accelerated Multi-Dimensional Filtering Engine
 * Fast set operations for 5,719 items (<15ms per query)
 */
const FilterEngine = (() => {
  let allItems = [];
  let numItems = 0;
  let numWords = 0; // Number of 32-bit words for bitset

  // Bitset dictionary: facetName -> { val -> Uint32Array }
  const facetBitsets = {};
  // Search tokens & LRU cache
  const searchCorpus = [];
  const searchCache = new Map();

  // Accent-folding helper (việt -> viet, Á -> a)
  function foldAccents(str) {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  function createBitset() {
    return new Uint32Array(numWords);
  }

  function setBit(bs, idx) {
    bs[idx >> 5] |= (1 << (idx & 31));
  }

  function getBit(bs, idx) {
    return (bs[idx >> 5] & (1 << (idx & 31))) !== 0;
  }

  function bitsetUnion(a, b) {
    const res = createBitset();
    for (let i = 0; i < numWords; i++) res[i] = a[i] | b[i];
    return res;
  }

  function bitsetIntersect(a, b) {
    const res = createBitset();
    for (let i = 0; i < numWords; i++) res[i] = a[i] & b[i];
    return res;
  }

  function bitsetCount(bs) {
    let count = 0;
    for (let i = 0; i < numWords; i++) {
      let v = bs[i];
      // Hamming weight
      v = v - ((v >> 1) & 0x55555555);
      v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
      count += (((v + (v >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
    }
    return count;
  }

  function init(items) {
    allItems = items;
    numItems = items.length;
    numWords = Math.ceil(numItems / 32);

    // Build facet indices
    const facetsToIndex = ['t', 'h', 'loc', 'q', 'sp', 'acq', 'h_hall'];
    facetsToIndex.forEach(f => { facetBitsets[f] = {}; });

    for (let i = 0; i < numItems; i++) {
      const it = allItems[i];

      // Index facets
      facetsToIndex.forEach(f => {
        const val = it[f] || 'unknown';
        if (!facetBitsets[f][val]) facetBitsets[f][val] = createBitset();
        setBit(facetBitsets[f][val], i);
      });

      // Build search string
      const searchStr = foldAccents(`${it.n} ${it.t} ${it.h} ${it.loc} ${it.q} ${it.v} ${it.cs} ${it.ci} ${it.det}`);
      searchCorpus.push(searchStr);
    }
  }

  // Evaluate query
  function filter(activeFilters) {
    const t0 = performance.now();
    let resultBitset = createBitset();
    // Fill with 1s
    resultBitset.fill(0xFFFFFFFF);

    const { facets, search, exclude } = activeFilters;

    // 1. Text search with LRU bitset caching
    if (search && search.trim()) {
      const qKey = search.trim().toLowerCase();
      let searchBs = searchCache.get(qKey);
      if (!searchBs) {
        const queryTokens = foldAccents(qKey).split(/\s+/).filter(Boolean);
        searchBs = createBitset();
        for (let i = 0; i < numItems; i++) {
          const corpus = searchCorpus[i];
          let match = true;
          for (let j = 0; j < queryTokens.length; j++) {
            if (!corpus.includes(queryTokens[j])) {
              match = false;
              break;
            }
          }
          if (match) setBit(searchBs, i);
        }
        if (searchCache.size > 50) {
          const firstKey = searchCache.keys().next().value;
          searchCache.delete(firstKey);
        }
        searchCache.set(qKey, searchBs);
      }
      resultBitset = bitsetIntersect(resultBitset, searchBs);
    }

    // 2. Facets (OR within facet, AND between facets)
    const facetKeyMap = {
      type: 't',
      hold: 'h',
      loc: 'loc',
      quest: 'q',
      sp: 'sp',
      acq: 'acq',
      hall: 'h_hall'
    };

    for (const [uiFacet, fKey] of Object.entries(facetKeyMap)) {
      const selectedVals = facets[uiFacet];
      if (selectedVals && selectedVals.length > 0) {
        let facetUnion = createBitset();
        selectedVals.forEach(v => {
          if (facetBitsets[fKey] && facetBitsets[fKey][v]) {
            facetUnion = bitsetUnion(facetUnion, facetBitsets[fKey][v]);
          }
        });
        resultBitset = bitsetIntersect(resultBitset, facetUnion);
      }
    }

    // 3. Status facet (uncollected, collected, unseen, seen_uncollected, can_craft, low_conf)
    const statusVals = facets.status;
    if (statusVals && statusVals.length > 0) {
      let statusUnion = createBitset();
      statusVals.forEach(s => {
        for (let i = 0; i < numItems; i++) {
          const it = allItems[i];
          const isChecked = AppState.isChecked(it.id);
          const isSeen = AppState.isSeen(it.id);

          let matches = false;
          if (s === 'uncollected' && !isChecked) matches = true;
          else if (s === 'collected' && isChecked) matches = true;
          else if (s === 'unseen' && !isSeen) matches = true;
          else if (s === 'seen_uncollected' && isSeen && !isChecked) matches = true;
          else if (s === 'can_craft' && it.crft) matches = true;
          else if (s === 'low_conf' && it.conf === 'low') matches = true;

          if (matches) setBit(statusUnion, i);
        }
      });
      resultBitset = bitsetIntersect(resultBitset, statusUnion);
    }

    // 4. Exclude rules (NOT)
    if (exclude) {
      for (const [fKey, exVals] of Object.entries(exclude)) {
        if (exVals && exVals.length > 0) {
          exVals.forEach(v => {
            const mappedF = facetKeyMap[fKey] || fKey;
            if (facetBitsets[mappedF] && facetBitsets[mappedF][v]) {
              const exBs = facetBitsets[mappedF][v];
              for (let i = 0; i < numWords; i++) {
                resultBitset[i] &= ~exBs[i];
              }
            }
          });
        }
      }
    }

    const duration = performance.now() - t0;
    const matchCount = bitsetCount(resultBitset);

    return {
      bitset: resultBitset,
      count: matchCount,
      durationMs: duration,
      hasBit: (idx) => getBit(resultBitset, idx)
    };
  }

  // Calculate dynamic counts for facet options given current result bitset
  function getDynamicCounts(currentBitset, facetKey) {
    const counts = {};
    const facetDict = facetBitsets[facetKey] || {};
    for (const [val, bs] of Object.entries(facetDict)) {
      const combined = bitsetIntersect(currentBitset, bs);
      counts[val] = bitsetCount(combined);
    }
    return counts;
  }

  return {
    init,
    filter,
    getDynamicCounts,
    getAllItems: () => allItems,
    getFacets: () => facetBitsets
  };
})();

// NOAIS options page script - v1.1.0
// Renders the curated + custom site list, the sensitivity slider, the
// hard-mode sites list (v1.1), and the "add custom site" form. Auto-saves
// on every change. Listens for storage changes from other tabs to stay in
// sync. The sync indicator at the top of the page reports whether the
// small set of sync keys (noais_enabled, noais_global_sensitivity,
// noais_hard_mode_sites) is actually syncing across devices.
//
// Security: every user-controllable string (hostname, error message) is
// rendered with textContent (or setAttribute), NEVER innerHTML. This is
// tested by tests/xss.test.js.

(function () {
  'use strict';

  // ----- DOM refs --------------------------------------------------------

  const sensitivityEl = document.getElementById('sensitivity');
  const sensitivityValueEl = document.getElementById('sensitivity-value');
  const sensitivityMetaEl = document.getElementById('sensitivity-meta');
  const savedToastEl = document.getElementById('saved-toast');
  const siteListEl = document.getElementById('site-list');
  const hardModeListEl = document.getElementById('hard-mode-list');
  const addInputEl = document.getElementById('add-site-input');
  const addButtonEl = document.getElementById('add-site-button');
  const addErrorEl = document.getElementById('add-site-error');
  const closeLinkEl = document.getElementById('close-link');
  const syncStatusEl = document.getElementById('sync-status');

  if (
    !sensitivityEl || !sensitivityValueEl || !sensitivityMetaEl ||
    !savedToastEl || !siteListEl || !hardModeListEl || !addInputEl ||
    !addButtonEl || !addErrorEl || !closeLinkEl
  ) {
    console.error('NOAIS options: required DOM elements not found.');
    return;
  }

  // ----- Settings module -------------------------------------------------

  // The settings module is loaded before us in the HTML head.
  // (See options.html — <script src="../core/settings.js">)
  if (!window.NOAIS_SETTINGS) {
    console.error('NOAIS options: settings module not loaded.');
    return;
  }
  const settings = window.NOAIS_SETTINGS;

  // sync-helper: routes reads/writes to chrome.storage.sync for the 3 sync keys
  // (noais_enabled, noais_global_sensitivity, noais_hard_mode_sites) and to
  // chrome.storage.local for everything else.
  const sync = window.NOAIS_SYNC || null;

  // ----- Storage keys ----------------------------------------------------

  const STORAGE_KEYS = {
    SENSITIVITY: 'noais_global_sensitivity',
    OVERRIDES: 'noais_site_overrides',
    HARD_MODE_SITES: 'noais_hard_mode_sites',
  };

  // ----- State -----------------------------------------------------------

  // Cached storage state. Refreshed on load and on storage.onChanged.
  let currentSensitivity = 100;
  let currentOverrides = {}; // hostname -> boolean
  let currentHardModeSites = []; // array of hostnames

  // ----- Localisation ----------------------------------------------------

  function t(key) {
    try {
      if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
        const v = chrome.i18n.getMessage(key);
        if (v) return v;
      }
    } catch (_e) { /* ignore */ }
    return key;
  }

  // ----- Sensitivity band labels ----------------------------------------

  function bandForSensitivity(s) {
    if (s <= 9)  return { label: t('options_band_off'),     cls: 'zero' };
    if (s <= 49) return { label: t('options_band_lenient'), cls: 'low'  };
    if (s <= 89) return { label: t('options_band_default'), cls: 'mid'  };
    return { label: t('options_band_strict'), cls: 'high' };
  }

  // ----- Saved toast (auto-hide) -----------------------------------------

  let toastTimer = null;
  function showSavedToast() {
    savedToastEl.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      savedToastEl.classList.remove('visible');
    }, 1500);
  }

  // ----- Read/write storage ---------------------------------------------

  function loadFromStorage() {
    // Sensitivity + hard-mode sites are in chrome.storage.sync (via NOAIS_SYNC).
    // Per-site overrides are in chrome.storage.local (they can be large).
    let pending = 2;
    let done = false;
    function maybeFinish() {
      pending -= 1;
      if (pending === 0 && !done) {
        done = true;
        renderAll();
      }
    }
    function readSensitivity() {
      try {
        if (sync) {
          sync.get(STORAGE_KEYS.SENSITIVITY, (err, value) => {
            if (!err && typeof value === 'number' && value >= 0 && value <= 100) {
              currentSensitivity = value;
            } else {
              currentSensitivity = 100;
            }
            maybeFinish();
          });
          return;
        }
      } catch (_e) { /* fall through */ }
      try {
        chrome.storage.local.get([STORAGE_KEYS.SENSITIVITY], (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.error('NOAIS options: sync read failed', chrome.runtime.lastError);
            currentSensitivity = 100;
            maybeFinish();
            return;
          }
          const sens = result && result[STORAGE_KEYS.SENSITIVITY];
          currentSensitivity = (typeof sens === 'number' && sens >= 0 && sens <= 100) ? sens : 100;
          maybeFinish();
        });
      } catch (err) {
        console.error('NOAIS options: sens read threw', err);
        currentSensitivity = 100;
        maybeFinish();
      }
    }
    function readOverridesAndHardMode() {
      try {
        chrome.storage.local.get(
          [STORAGE_KEYS.OVERRIDES, STORAGE_KEYS.HARD_MODE_SITES],
          (result) => {
            if (chrome.runtime && chrome.runtime.lastError) {
              console.error('NOAIS options: local read failed', chrome.runtime.lastError);
              currentOverrides = {};
              currentHardModeSites = [];
              maybeFinish();
              return;
            }
            const ov = result && result[STORAGE_KEYS.OVERRIDES];
            currentOverrides = (ov && typeof ov === 'object' && !Array.isArray(ov)) ? ov : {};
            const hm = result && result[STORAGE_KEYS.HARD_MODE_SITES];
            // Support both legacy array format (v1.1.0) and current object format {hostname: true}.
            if (Array.isArray(hm)) {
              currentHardModeSites = hm.filter(h => typeof h === 'string' && h.length > 0);
            } else if (hm && typeof hm === 'object') {
              currentHardModeSites = Object.keys(hm).filter(h => hm[h] === true);
            } else {
              currentHardModeSites = [];
            }
            maybeFinish();
          }
        );
      } catch (err) {
        console.error('NOAIS options: local read threw', err);
        currentOverrides = {};
        currentHardModeSites = [];
        maybeFinish();
      }
    }
    readSensitivity();
    readOverridesAndHardMode();
  }

  function saveSensitivity(value) {
    try {
      if (sync) {
        sync.set(STORAGE_KEYS.SENSITIVITY, value, (err) => {
          if (err) {
            console.error('NOAIS options: save failed', err);
            return;
          }
          showSavedToast();
        });
        return;
      }
    } catch (_e) { /* fall through */ }
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.SENSITIVITY]: value }, () => {
        if (chrome.runtime.lastError) {
          console.error('NOAIS options: save failed', chrome.runtime.lastError);
          return;
        }
        showSavedToast();
      });
    } catch (err) {
      console.error('NOAIS options: save threw', err);
    }
  }

  function saveOverride(hostname, enabled) {
    const next = Object.assign({}, currentOverrides);
    if (enabled) {
      // Re-enabling a curated site = remove the override (default is true).
      if (settings.CURATED_HOSTS.includes(hostname)) {
        delete next[hostname];
      } else {
        next[hostname] = true;
      }
    } else {
      next[hostname] = false;
    }
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.OVERRIDES]: next }, () => {
        if (chrome.runtime.lastError) {
          console.error('NOAIS options: save override failed', chrome.runtime.lastError);
          return;
        }
        currentOverrides = next;
        renderSiteList();
        showSavedToast();
      });
    } catch (err) {
      console.error('NOAIS options: save override threw', err);
    }
  }

  function removeCustomSite(hostname) {
    const next = Object.assign({}, currentOverrides);
    delete next[hostname];
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.OVERRIDES]: next }, () => {
        if (chrome.runtime.lastError) {
          console.error('NOAIS options: remove failed', chrome.runtime.lastError);
          return;
        }
        currentOverrides = next;
        renderSiteList();
        showSavedToast();
      });
    } catch (err) {
      console.error('NOAIS options: remove threw', err);
    }
  }

  // ----- Render ---------------------------------------------------------

  function renderSensitivity() {
    sensitivityEl.value = String(currentSensitivity);
    sensitivityEl.setAttribute('aria-valuenow', String(currentSensitivity));
    const band = bandForSensitivity(currentSensitivity);
    sensitivityValueEl.classList.remove('zero', 'low', 'mid', 'high');
    sensitivityValueEl.classList.add(band.cls);
    sensitivityValueEl.textContent = band.label;
    sensitivityMetaEl.textContent = currentSensitivity + ' / 100';
  }

  /**
   * Build the merged list: curated (in order) + any custom sites
   * (sorted alphabetically, only those not already in curated).
   * Each entry: { hostname, isCurated, enabled }.
   */
  function buildSiteRows() {
    const merged = settings.mergeSettings(currentOverrides);
    const rows = [];
    // Curated first, in their declared order.
    for (const h of settings.CURATED_HOSTS) {
      rows.push({
        hostname: h,
        isCurated: true,
        enabled: merged[h] !== false,
      });
    }
    // Custom sites: anything in overrides that isn't in CURATED_HOSTS.
    const custom = Object.keys(currentOverrides || {})
      .filter((h) => !settings.CURATED_HOSTS.includes(h))
      .sort();
    for (const h of custom) {
      rows.push({
        hostname: h,
        isCurated: false,
        enabled: currentOverrides[h] !== false,
      });
    }
    return rows;
  }

  function renderSiteList() {
    // Clear existing children safely (no innerHTML).
    while (siteListEl.firstChild) siteListEl.removeChild(siteListEl.firstChild);

    const rows = buildSiteRows();
    for (const row of rows) {
      siteListEl.appendChild(buildSiteRow(row));
    }
  }

  /**
   * Build a single <li> row for the site list. Uses textContent for
   * ALL user-controllable strings (the hostname). Never innerHTML.
   */
  function buildSiteRow(row) {
    const li = document.createElement('li');
    li.className = 'site-row';
    if (!row.enabled) li.classList.add('disabled-row');
    li.setAttribute('data-hostname', row.hostname);

    // Hostname (textContent — XSS safe).
    const hostnameSpan = document.createElement('span');
    hostnameSpan.className = 'site-hostname';
    hostnameSpan.textContent = row.hostname;
    li.appendChild(hostnameSpan);

    // Curated / Custom badge.
    const badge = document.createElement('span');
    badge.className = row.isCurated ? 'curated-badge' : 'custom-badge';
    badge.textContent = row.isCurated ? 'Curated' : 'Custom';
    badge.setAttribute('aria-hidden', 'true');
    li.appendChild(badge);

    // Hard mode toggle button (v1.1.2).
    const isHard = currentHardModeSites.includes(row.hostname);
    const hmButton = document.createElement('button');
    hmButton.type = 'button';
    hmButton.className = 'hard-mode-badge';
    if (isHard) hmButton.classList.add('active');
    hmButton.textContent = isHard ? t('options_hard_mode_on_short') || 'Hard' : t('options_hard_mode_off_short') || 'Soft';
    hmButton.setAttribute('aria-label', (isHard ? 'Disable' : 'Enable') + ' hard mode for ' + row.hostname);
    hmButton.addEventListener('click', () => {
      if (currentHardModeSites.includes(row.hostname)) {
        removeHardModeSite(row.hostname);
      } else {
        addHardModeSite(row.hostname);
      }
    });
    li.appendChild(hmButton);

    // Toggle.
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle';
    toggleLabel.setAttribute('aria-label', 'Toggle NOAIS for ' + row.hostname);

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = row.enabled;
    toggleInput.addEventListener('change', () => {
      saveOverride(row.hostname, toggleInput.checked);
    });

    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'slider';
    toggleSlider.setAttribute('aria-hidden', 'true');

    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);
    li.appendChild(toggleLabel);

    // Remove button (custom only).
    if (!row.isCurated) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-button';
      removeButton.textContent = 'Remove';
      removeButton.setAttribute('aria-label', 'Remove ' + row.hostname);
      removeButton.addEventListener('click', () => {
        removeCustomSite(row.hostname);
      });
      li.appendChild(removeButton);
    }

    return li;
  }

  function renderAll() {
    renderSensitivity();
    renderSiteList();
    renderHardModeList();
  }

  // ----- Hard-mode sites list (v1.1) -------------------------------------

  function buildHardModeRows() {
    const rows = [];
    for (const h of currentHardModeSites) {
      rows.push({ hostname: h, isCurated: settings.CURATED_HOSTS.includes(h) });
    }
    return rows;
  }

  function renderHardModeList() {
    // Clear existing children safely (no innerHTML).
    while (hardModeListEl.firstChild) hardModeListEl.removeChild(hardModeListEl.firstChild);
    const rows = buildHardModeRows();
    if (rows.length === 0) {
      const li = document.createElement('li');
      li.className = 'site-row hard-mode-empty';
      li.setAttribute('data-empty', 'true');
      const span = document.createElement('span');
      span.className = 'site-hostname';
      span.textContent = t('options_hard_mode_empty');
      li.appendChild(span);
      hardModeListEl.appendChild(li);
      return;
    }
    for (const row of rows) {
      hardModeListEl.appendChild(buildHardModeRow(row));
    }
  }

  function buildHardModeRow(row) {
    const li = document.createElement('li');
    li.className = 'site-row';
    li.setAttribute('data-hostname', row.hostname);

    const hostnameSpan = document.createElement('span');
    hostnameSpan.className = 'site-hostname';
    hostnameSpan.textContent = row.hostname;
    li.appendChild(hostnameSpan);

    const badge = document.createElement('span');
    badge.className = row.isCurated ? 'curated-badge' : 'custom-badge';
    badge.textContent = row.isCurated ? t('options_badge_curated') : t('options_badge_custom');
    badge.setAttribute('aria-hidden', 'true');
    li.appendChild(badge);

    // Remove button — clicking drops the site from hard-mode.
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-button';
    removeButton.textContent = t('options_hard_mode_remove');
    removeButton.setAttribute('aria-label', t('options_hard_mode_remove') + ' ' + row.hostname);
    removeButton.addEventListener('click', () => {
      removeHardModeSite(row.hostname);
    });
    li.appendChild(removeButton);

    return li;
  }

  function saveHardModeSites(sitesArray) {
    // Convert internal array to storage object format {hostname: true}.
    const obj = {};
    for (const h of sitesArray) {
      obj[h] = true;
    }
    try {
      if (sync) {
        sync.set(STORAGE_KEYS.HARD_MODE_SITES, obj, (err) => {
          if (err) {
            console.error('NOAIS options: hard-mode save failed', err);
            return;
          }
          currentHardModeSites = sitesArray;
          renderHardModeList();
          showSavedToast();
        });
        return;
      }
    } catch (_e) { /* fall through */ }
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.HARD_MODE_SITES]: obj }, () => {
        if (chrome.runtime.lastError) {
          console.error('NOAIS options: hard-mode save failed', chrome.runtime.lastError);
          return;
        }
        currentHardModeSites = sitesArray;
        renderHardModeList();
        showSavedToast();
      });
    } catch (err) {
      console.error('NOAIS options: hard-mode save threw', err);
    }
  }

  function removeHardModeSite(hostname) {
    const next = currentHardModeSites.filter(h => h !== hostname);
    saveHardModeSites(next);
  }

  function addHardModeSite(hostname) {
    if (!hostname || typeof hostname !== 'string') return false;
    const normalized = settings.normalizeHostnameInput(hostname);
    if (!normalized) return false;
    if (currentHardModeSites.includes(normalized)) return false;
    const next = currentHardModeSites.concat(normalized);
    saveHardModeSites(next);
    return true;
  }

  // ----- Add custom site -------------------------------------------------

  function showAddError(message) {
    addErrorEl.textContent = message;
  }

  function clearAddError() {
    addErrorEl.textContent = '';
  }

  function tryAddCustomSite() {
    clearAddError();
    const raw = addInputEl.value;
    const normalized = settings.normalizeHostnameInput(raw);
    if (!normalized) {
      showAddError('Please enter a valid hostname (e.g. example.com).');
      return;
    }
    if (settings.CURATED_HOSTS.includes(normalized)) {
      showAddError(normalized + ' is already in the list.');
      return;
    }
    // Add as enabled.
    const next = Object.assign({}, currentOverrides, { [normalized]: true });
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.OVERRIDES]: next }, () => {
        if (chrome.runtime.lastError) {
          console.error('NOAIS options: add failed', chrome.runtime.lastError);
          showAddError('Save failed. Please try again.');
          return;
        }
        currentOverrides = next;
        addInputEl.value = '';
        renderSiteList();
        showSavedToast();
        addInputEl.focus();
      });
    } catch (err) {
      console.error('NOAIS options: add threw', err);
      showAddError('Save failed. Please try again.');
    }
  }

  // ----- Sensitivity slider (debounced) ---------------------------------

  let sensitivityDebounce = null;
  function onSensitivityInput() {
    const v = Number(sensitivityEl.value);
    if (Number.isNaN(v)) return;
    if (v < 0 || v > 100) return;
    // Update UI immediately for snappy feel.
    currentSensitivity = v;
    renderSensitivity();
    // Debounce the actual write.
    if (sensitivityDebounce) clearTimeout(sensitivityDebounce);
    sensitivityDebounce = setTimeout(() => {
      saveSensitivity(currentSensitivity);
    }, 200);
  }

  // ----- Close link ------------------------------------------------------

  function onCloseClick(event) {
    event.preventDefault();
    try {
      window.close();
    } catch (_e) { /* ignore */ }
  }

  // ----- Sync indicator (v1.1) -------------------------------------------

  function renderSyncStatus() {
    if (!syncStatusEl) return;
    // chrome.storage.sync is the canonical signal. If it is undefined
    // (Firefox < 145 with the manifest flag, or any browser that
    // gates it behind a permission we don't have), show the
    // "won't sync" banner.
    const hasSync = (typeof chrome !== 'undefined' &&
                     chrome.storage &&
                     chrome.storage.sync &&
                     typeof chrome.storage.sync.get === 'function');
    if (hasSync) {
      syncStatusEl.textContent = t('options_sync_indicator_on');
      syncStatusEl.classList.remove('off');
      syncStatusEl.classList.add('on');
    } else {
      syncStatusEl.textContent = t('options_sync_indicator_off');
      syncStatusEl.classList.remove('on');
      syncStatusEl.classList.add('off');
    }
  }

  // ----- Live sync from other tabs --------------------------------------

  function onStorageChanged(changes, area) {
    let needsRender = false;
    if (area === 'sync') {
      if (changes[STORAGE_KEYS.SENSITIVITY]) {
        const newSens = changes[STORAGE_KEYS.SENSITIVITY].newValue;
        if (typeof newSens === 'number' && newSens !== currentSensitivity) {
          currentSensitivity = newSens;
          needsRender = true;
        }
      }
      if (changes[STORAGE_KEYS.HARD_MODE_SITES]) {
        const newHm = changes[STORAGE_KEYS.HARD_MODE_SITES].newValue;
        if (Array.isArray(newHm)) {
          currentHardModeSites = newHm.filter(h => typeof h === 'string' && h.length > 0);
        } else if (newHm && typeof newHm === 'object') {
          currentHardModeSites = Object.keys(newHm).filter(h => newHm[h] === true);
        }
        needsRender = true;
      }
    } else if (area === 'local') {
      if (changes[STORAGE_KEYS.SENSITIVITY]) {
        const newSens = changes[STORAGE_KEYS.SENSITIVITY].newValue;
        if (typeof newSens === 'number' && newSens !== currentSensitivity) {
          currentSensitivity = newSens;
          needsRender = true;
        }
      }
      if (changes[STORAGE_KEYS.OVERRIDES]) {
        const newOv = changes[STORAGE_KEYS.OVERRIDES].newValue;
        if (newOv && typeof newOv === 'object') {
          currentOverrides = newOv;
          needsRender = true;
        }
      }
      if (changes[STORAGE_KEYS.HARD_MODE_SITES]) {
        const newHm = changes[STORAGE_KEYS.HARD_MODE_SITES].newValue;
        if (Array.isArray(newHm)) {
          currentHardModeSites = newHm.filter(h => typeof h === 'string' && h.length > 0);
        } else if (newHm && typeof newHm === 'object') {
          currentHardModeSites = Object.keys(newHm).filter(h => newHm[h] === true);
        }
        needsRender = true;
      }
    }
    if (needsRender) renderAll();
  }

  // ----- Wire up ---------------------------------------------------------

  sensitivityEl.addEventListener('input', onSensitivityInput);
  addButtonEl.addEventListener('click', tryAddCustomSite);
  addInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryAddCustomSite();
    }
  });
  closeLinkEl.addEventListener('click', onCloseClick);
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(onStorageChanged);
  }

  renderSyncStatus();
  loadFromStorage();
})();

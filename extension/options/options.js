// NOAIS options page script - v0.4.0
// Renders the curated + custom site list, the sensitivity slider, and
// the "add custom site" form. Auto-saves on every change. Listens for
// storage changes from other tabs to stay in sync.
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
  const addInputEl = document.getElementById('add-site-input');
  const addButtonEl = document.getElementById('add-site-button');
  const addErrorEl = document.getElementById('add-site-error');
  const closeLinkEl = document.getElementById('close-link');

  if (
    !sensitivityEl || !sensitivityValueEl || !sensitivityMetaEl ||
    !savedToastEl || !siteListEl || !addInputEl ||
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

  // ----- Storage keys ----------------------------------------------------

  const STORAGE_KEYS = {
    SENSITIVITY: 'noais_global_sensitivity',
    OVERRIDES: 'noais_site_overrides',
  };

  // ----- State -----------------------------------------------------------

  // Cached storage state. Refreshed on load and on storage.onChanged.
  let currentSensitivity = 100;
  let currentOverrides = {}; // hostname -> boolean

  // ----- Sensitivity band labels ----------------------------------------

  function bandForSensitivity(s) {
    if (s <= 9)  return { label: 'Off',     cls: 'zero' };
    if (s <= 49) return { label: 'Lenient', cls: 'low'  };
    if (s <= 89) return { label: 'Default', cls: 'mid'  };
    return { label: 'Strict', cls: 'high' };
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
    try {
      chrome.storage.local.get(
        [STORAGE_KEYS.SENSITIVITY, STORAGE_KEYS.OVERRIDES],
        (result) => {
          if (chrome.runtime.lastError) {
            console.error('NOAIS options: storage read failed', chrome.runtime.lastError);
            return;
          }
          const sens = result && result[STORAGE_KEYS.SENSITIVITY];
          currentSensitivity = (typeof sens === 'number' && sens >= 0 && sens <= 100) ? sens : 100;
          const ov = result && result[STORAGE_KEYS.OVERRIDES];
          currentOverrides = (ov && typeof ov === 'object' && !Array.isArray(ov)) ? ov : {};
          renderAll();
        }
      );
    } catch (err) {
      console.error('NOAIS options: load failed', err);
    }
  }

  function saveSensitivity(value) {
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

  // ----- Live sync from other tabs --------------------------------------

  function onStorageChanged(changes, area) {
    if (area !== 'local') return;
    let needsRender = false;
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

  loadFromStorage();
})();

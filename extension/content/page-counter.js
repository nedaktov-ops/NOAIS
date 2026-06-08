// NOAIS — page counter (uBlock Origin-style badge in the corner).
//
// A small draggable widget pinned to the bottom-right of every page. Shows
// `🤖 NOAIS · 12` (12 = number of detected elements on this page). Click
// expands to a list of flagged elements. Draggable via mousedown +
// mousemove + mouseup. Right-click context menu offers 4-corner move
// options for keyboard a11y.
//
// Storage:
//   noais_page_counter_enabled  (boolean, default true)
//   noais_page_counter_position ({x, y}, default null = auto bottom-right)
//
// Hidden on about:*, chrome-extension://*, moz-extension://* pages.
//
// Public API (also on window.NOAIS_PAGE_COUNTER in the browser):
//   shouldHide({ protocol, href, enabled })
//   create({ document, storage, getCount, getItems, position, viewport })
//   isMounted(document)

(function (root) {
  'use strict';

  function resolveKey(name, fallback) {
    const sk = root && root.NOAIS_STORAGE_KEYS;
    if (sk && sk.KEYS && sk.KEYS[name]) return sk.KEYS[name];
    return fallback;
  }

  const ENABLED_KEY = resolveKey('PAGE_COUNTER_ENABLED', 'noais_page_counter_enabled');
  const POSITION_KEY = resolveKey('PAGE_COUNTER_POSITION', 'noais_page_counter_position');

  // Storage helpers. We use a swappable adapter pattern so tests can inject
  // an in-memory mock; in the browser we use chrome.storage.local.
  function getStorage(storage) {
    if (storage) return storage;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return chrome.storage.local;
      }
    } catch (_e) { /* ignore */ }
    return null;
  }

  function readPosition(storage, cb) {
    if (!storage || typeof storage.get !== 'function') {
      cb(null);
      return;
    }
    try {
      storage.get([POSITION_KEY], (result) => {
        const v = result && result[POSITION_KEY];
        cb(v && typeof v.x === 'number' && typeof v.y === 'number' ? v : null);
      });
    } catch (_e) { cb(null); }
  }

  function writePosition(storage, pos, cb) {
    if (!storage || typeof storage.set !== 'function') {
      if (cb) cb(false);
      return;
    }
    try {
      storage.set({ [POSITION_KEY]: pos }, () => { if (cb) cb(true); });
    } catch (_e) { if (cb) cb(false); }
  }

  // Compute the 4-corner default positions for a given viewport + size.
  function cornerPosition(corner, vw, vh, w, h, margin) {
    const m = (typeof margin === 'number') ? margin : 12;
    switch (corner) {
      case 'top-left':     return { x: m,         y: m };
      case 'top-right':    return { x: vw - w - m, y: m };
      case 'bottom-left':  return { x: m,         y: vh - h - m };
      case 'bottom-right':
      default:             return { x: vw - w - m, y: vh - h - m };
    }
  }

  function shouldHide(opts) {
    const o = opts || {};
    if (o.enabled === false) return true;
    const protocol = String(o.protocol || '').toLowerCase();
    if (protocol === 'about:' || protocol === 'chrome-extension:' || protocol === 'moz-extension:') {
      return true;
    }
    const href = String(o.href || '').toLowerCase();
    if (href.startsWith('about:') || href.startsWith('chrome-extension://') || href.startsWith('moz-extension://')) {
      return true;
    }
    return false;
  }

  function isMounted(document) {
    if (!document || typeof document.querySelectorAll !== 'function') return false;
    return document.querySelectorAll('[data-noais-page-counter]').length > 0;
  }

  function create(opts) {
    const document = (opts && opts.document) || (typeof root.document !== 'undefined' ? root.document : null);
    const storage = getStorage(opts && opts.storage);
    const getCount = (opts && opts.getCount) || function () { return 0; };
    const getItems = (opts && opts.getItems) || function () { return []; };
    const viewport = (opts && opts.viewport) || { width: 1024, height: 768 };
    // Read initial position synchronously if provided, else async-load.
    let currentPosition = (opts && opts.position) || null;

  let widget = null; // host element (attached to documentElement)
  let shadow = null; // closed shadow root
  let rootEl = null; // .noais-page-counter inside shadow
  let dragHandle = null; // .noais-page-counter-drag-handle
  let bodyList = null; // .noais-page-counter-body (expanded list)
  let countLabel = null; // .noais-page-counter-count
  let attachedHost = null;
  let mounted = false;
  let isExpanded = false;
  let dragState = null;
  const corners = ['bottom-right', 'top-left', 'top-right', 'bottom-left'];
  // Capture the document once so event handlers and idempotency checks
  // always use the same object (even in tests that inject opts.document).
  const docEl = document;

  // Compute a default position synchronously (bottom-right corner).
  function computeDefaultPosition() {
    const wv = viewport || { width: 1024, height: 768 };
    const sz = { w: 110, h: 28 };
    return cornerPosition('bottom-right', wv.width, wv.height, sz.w, sz.h, 12);
  }

  // Lazy-load position from storage on first mount.
  function ensurePositionLoaded(cb) {
    if (currentPosition) { cb(currentPosition); return; }
    // Start with the default so the widget is placed immediately.
    currentPosition = computeDefaultPosition();
    cb(currentPosition);
    // Then try to load a saved position asynchronously.
    readPosition(storage, (pos) => {
      if (pos) {
        currentPosition = pos;
        applyPosition(pos);
        if (widget) widget._lastPos = { x: pos.x, y: pos.y };
      }
    });
  }

    function makeWidget() {
      if (!document || typeof document.createElement !== 'function') return null;
      const host = document.createElement('div');
      host.setAttribute('data-noais-page-counter', '');
      host.style.position = 'fixed';
      host.style.zIndex = '2147483647';
      host.style.left = '0px';
      host.style.top = '0px';
      // Closed shadow root — site CSS cannot reach inside.
      const sh = (host.attachShadow ? host.attachShadow({ mode: 'closed' }) : host);
      host._shadow = sh;

      // Style
      const style = document.createElement('style');
      style.textContent = [
        '.noais-page-counter {',
        '  all: initial;',
        '  display: inline-flex; align-items: center; gap: 4px;',
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
        '  font-size: 12px; line-height: 1;',
        '  color: #fff; background: rgba(0,0,0,0.78);',
        '  border-radius: 16px; padding: 6px 10px;',
        '  cursor: pointer; user-select: none;',
        '  box-shadow: 0 2px 6px rgba(0,0,0,0.25);',
        '  transition: transform 0.12s ease, background 0.12s ease;',
        '  max-width: 220px;',
        '}',
        '.noais-page-counter:hover { background: rgba(0,0,0,0.88); }',
        '.noais-page-counter-drag-handle {',
        '  display: inline-block; width: 8px; height: 14px;',
        '  background: linear-gradient(90deg, transparent 0 3px, rgba(255,255,255,0.5) 3px 5px, transparent 5px 8px);',
        '  margin-right: 2px; cursor: grab;',
        '}',
        '.noais-page-counter-drag-handle:active { cursor: grabbing; }',
        '.noais-page-counter.noais-page-counter--touch .noais-page-counter-drag-handle { display: none; }',
        '.noais-page-counter-icon { font-size: 13px; }',
        '.noais-page-counter-label { font-weight: 700; letter-spacing: 0.04em; }',
        '.noais-page-counter-count { font-variant-numeric: tabular-nums; font-weight: 600; }',
        '.noais-page-counter-body {',
        '  display: none;',
        '  position: absolute; right: 0; bottom: calc(100% + 6px);',
        '  width: 280px; max-height: 320px; overflow: auto;',
        '  background: #fff; color: #222;',
        '  border: 1px solid rgba(0,0,0,0.12);',
        '  border-radius: 8px;',
        '  box-shadow: 0 4px 14px rgba(0,0,0,0.2);',
        '  padding: 8px 10px; font-size: 12px; line-height: 1.4;',
        '  text-align: left;',
        '}',
        '.noais-page-counter--expanded .noais-page-counter-body { display: block; }',
        '.noais-page-counter-item {',
        '  padding: 4px 0; border-bottom: 1px dashed rgba(0,0,0,0.08);',
        '}',
        '.noais-page-counter-item:last-child { border-bottom: 0; }',
        '.noais-page-counter-item-score { font-weight: 700; margin-right: 6px; }',
        '@media (prefers-color-scheme: dark) {',
        '  .noais-page-counter-body { background: #1f1f1f; color: #eee; border-color: rgba(255,255,255,0.15); }',
        '  .noais-page-counter-item { border-color: rgba(255,255,255,0.08); }',
        '}',
      ].join('\n');
      if (sh.appendChild) sh.appendChild(style);

      // Card
      const card = document.createElement('div');
      card.className = 'noais-page-counter';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-expanded', 'false');
      card.setAttribute('aria-label', 'NOAIS page counter');
      if (sh.appendChild) sh.appendChild(card);

      // Drag handle (hidden on touch devices — see applyTouchClass)
      const handle = document.createElement('span');
      handle.className = 'noais-page-counter-drag-handle';
      handle.setAttribute('aria-hidden', 'true');
      card.appendChild(handle);

      // Icon (🤖) — using a span for the emoji; no innerHTML.
      const icon = document.createElement('span');
      icon.className = 'noais-page-counter-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '\uD83E\uDD16'; // robot emoji
      card.appendChild(icon);

      // Label
      const label = document.createElement('span');
      label.className = 'noais-page-counter-label';
      label.textContent = 'NOAIS';
      card.appendChild(label);

      // Separator
      const sep = document.createElement('span');
      sep.textContent = ' · ';
      sep.setAttribute('aria-hidden', 'true');
      card.appendChild(sep);

      // Count
      const count = document.createElement('span');
      count.className = 'noais-page-counter-count';
      count.setAttribute('aria-live', 'polite');
      count.textContent = '0';
      card.appendChild(count);

      // Expanded body (hidden by default)
      const body = document.createElement('div');
      body.className = 'noais-page-counter-body';
      body.setAttribute('role', 'region');
      body.setAttribute('aria-label', 'NOAIS flagged elements on this page');
      card.appendChild(body);

      return { host, shadow: sh, card, handle, count, body };
    }

    function refreshCount() {
      if (!countLabel) return;
      const n = Number(getCount()) || 0;
      countLabel.textContent = String(n);
    }

    function refreshBody() {
      if (!bodyList) return;
      // Clear via removeChild loop.
      while (bodyList.children && bodyList.children.length) {
        bodyList.removeChild(bodyList.children[0]);
      }
      const items = getItems() || [];
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'noais-page-counter-empty';
        empty.textContent = 'No elements flagged yet.';
        bodyList.appendChild(empty);
        return;
      }
      for (const it of items) {
        const row = document.createElement('div');
        row.className = 'noais-page-counter-item';
        const sc = document.createElement('span');
        sc.className = 'noais-page-counter-item-score';
        sc.textContent = String(it.score != null ? it.score : '?');
        row.appendChild(sc);
        const tx = document.createElement('span');
        tx.className = 'noais-page-counter-item-text';
        const text = String(it.text || '').slice(0, 120);
        tx.textContent = text;
        row.appendChild(tx);
        bodyList.appendChild(row);
      }
    }

    function applyPosition(pos) {
      if (!widget || !pos) return;
      widget.style.left = Math.round(pos.x) + 'px';
      widget.style.top = Math.round(pos.y) + 'px';
    }

    function onCardClick(event) {
      if (dragState && dragState.moved) return; // suppress click after drag
      if (event) { try { event.stopPropagation(); } catch (_e) {} }
      if (isExpanded) collapse(); else expand();
    }

    function onContextMenu(event) {
      if (event) { try { event.preventDefault(); } catch (_e) {} }
      // The actual context menu UI is provided by the host page (or
      // browser-native). We expose the supported corners so the host
      // can build the menu. Some browsers fire a synthetic contextmenu
      // event on right-click; we attach this handler so the
      // integration can read `_corners` from the handle.
    }

    function getClientXY(event) {
      if (event.touches && event.touches.length > 0) {
        return { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY };
      }
      return { clientX: event.clientX || 0, clientY: event.clientY || 0 };
    }

    function onDragStart(event) {
      if (!event) return;
      try { event.stopPropagation(); } catch (_e) {}
      if (event.preventDefault) { try { event.preventDefault(); } catch (_e) {} }
      const xy = getClientXY(event);
  dragState = { startX: xy.clientX, startY: xy.clientY, moved: false };
  // Bind on the captured document so the drag survives even if the cursor
  // leaves the widget. Uses docEl (not the closure `document`) so tests
  // that inject opts.document get the right event target.
  if (docEl && docEl.addEventListener) {
    docEl.addEventListener('mousemove', onDragMove);
    docEl.addEventListener('mouseup', onDragEnd);
    docEl.addEventListener('touchmove', onDragMove, { passive: false });
    docEl.addEventListener('touchend', onDragEnd);
  }
    }

    function onDragMove(event) {
      if (!dragState || !event) return;
      if (event.preventDefault) { try { event.preventDefault(); } catch (_e) {} }
      const xy = getClientXY(event);
      const dx = xy.clientX - dragState.startX;
      const dy = xy.clientY - dragState.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragState.moved = true;
      // Compute new position: if there is an existing currentPosition, add
      // the delta. Otherwise (first drag from a default corner), start
      // from the current rendered position.
      const base = currentPosition || (widget && widget._lastPos) || { x: 0, y: 0 };
      const next = { x: base.x + dx, y: base.y + dy };
      currentPosition = next;
      applyPosition(next);
    }

function onDragEnd(_event) {
  if (docEl && docEl.removeEventListener) {
    docEl.removeEventListener('mousemove', onDragMove);
    docEl.removeEventListener('mouseup', onDragEnd);
  }
  if (dragState && dragState.moved && currentPosition) {
        // Persist to storage.
        try { writePosition(storage, currentPosition); } catch (_e) { /* ignore */ }
      }
      // Reset dragState after a tick so the click event can see `moved`.
      const wasMoved = dragState && dragState.moved;
      setTimeout(() => { dragState = null; }, 0);
      // Suppress the click that follows the drag.
      if (wasMoved && widget && widget._suppressNextClick) {
        widget._suppressNextClick();
      }
    }

    function onTouchClass() {
      if (!widget) return;
      try {
        const isTouch = (('ontouchstart' in (root || {})) || (root.navigator && root.navigator.maxTouchPoints > 0));
        if (isTouch && widget.classList) widget.classList.add('noais-page-counter--touch');
      } catch (_e) { /* ignore */ }
    }

    function mount(hostEl) {
      if (mounted) return; // idempotent (this handle)
      if (!document) return;
  // Idempotency: if a counter is already mounted on the document
  // (regardless of which handle mounted it), adopt the existing widget.
  if (typeof docEl.querySelectorAll === 'function'
      && docEl.querySelectorAll('[data-noais-page-counter]').length > 0) {
    try {
      const existing = docEl.querySelectorAll('[data-noais-page-counter]')[0];
      if (existing) {
        widget = existing;
        shadow = existing._shadow || null;
        // Use docEl.querySelectorAll (not shadow.querySelector) so the
        // walk works in both real browsers and our test DOM stub.
        rootEl = docEl.querySelector('.noais-page-counter') || null;
        dragHandle = docEl.querySelector('.noais-page-counter-drag-handle') || null;
        countLabel = docEl.querySelector('.noais-page-counter-count') || null;
        bodyList = docEl.querySelector('.noais-page-counter-body') || null;
      }
    } catch (_e) { /* ignore */ }
    mounted = true;
    return;
  }
      const host = hostEl || document.documentElement || (document.body || null);
      if (!host || typeof host.appendChild !== 'function') return;
      const w = makeWidget();
      if (!w) return;
      widget = w.host;
      shadow = w.shadow;
      rootEl = w.card;
      dragHandle = w.handle;
      countLabel = w.count;
      bodyList = w.body;

      // Click toggles expanded; contextmenu records the right-click intent.
      if (rootEl.addEventListener) {
        rootEl.addEventListener('click', onCardClick);
        rootEl.addEventListener('contextmenu', onContextMenu);
        // Keyboard: Enter or Space to toggle expand.
        rootEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCardClick(e);
          }
        });
      }
      if (dragHandle && dragHandle.addEventListener) {
        dragHandle.addEventListener('mousedown', onDragStart);
        // Touch support for drag.
        dragHandle.addEventListener('touchstart', onDragStart, { passive: false });
      }
      // Suppress the next click after drag (we read dragState.moved in
      // onCardClick). Real browsers do this for us; the stub needs a hook.
      widget._suppressNextClick = function () { /* no-op for now */ };
      widget._lastPos = { x: 0, y: 0 };
      widget._corner = null;
      // Use a classList if the element supports it (some stubs don't).
      if (widget.classList) {
        // Mark "touch" if appropriate.
        onTouchClass();
      }

      try { host.appendChild(widget); } catch (_e) { /* ignore */ }
      attachedHost = host;
      mounted = true;
      refreshCount();
      refreshBody();

      // Place at saved position, or default to bottom-right.
      ensurePositionLoaded((pos) => {
        if (!pos) {
          const wv = viewport || { width: 1024, height: 768 };
          const sz = { w: 110, h: 28 }; // reasonable defaults
          pos = cornerPosition('bottom-right', wv.width, wv.height, sz.w, sz.h, 12);
        }
        currentPosition = pos;
        applyPosition(pos);
        widget._lastPos = { x: pos.x, y: pos.y };
      });
    }

function unmount() {
  if (!mounted) return;
  // Detach event listeners.
  if (docEl && docEl.removeEventListener) {
    docEl.removeEventListener('mousemove', onDragMove);
    docEl.removeEventListener('mouseup', onDragEnd);
    docEl.removeEventListener('touchmove', onDragMove);
    docEl.removeEventListener('touchend', onDragEnd);
  }
      if (rootEl && rootEl.removeEventListener) {
        rootEl.removeEventListener('click', onCardClick);
        rootEl.removeEventListener('contextmenu', onContextMenu);
      }
      if (dragHandle && dragHandle.removeEventListener) {
        dragHandle.removeEventListener('mousedown', onDragStart);
      }
      if (widget && widget.parentNode) {
        try { widget.parentNode.removeChild(widget); } catch (_e) { /* ignore */ }
      }
      widget = null;
      shadow = null;
      rootEl = null;
      dragHandle = null;
      countLabel = null;
      bodyList = null;
      attachedHost = null;
      mounted = false;
      isExpanded = false;
    }

function update(n) {
  if (typeof n === 'number') {
    countLabel.textContent = String(n);
  } else {
    refreshCount();
  }
  refreshBody();
}

    function expand() {
      if (!rootEl || !rootEl.classList) return;
      rootEl.classList.add('noais-page-counter--expanded');
      rootEl.setAttribute('aria-expanded', 'true');
      isExpanded = true;
    }
    function collapse() {
      if (!rootEl || !rootEl.classList) return;
      rootEl.classList.remove('noais-page-counter--expanded');
      rootEl.setAttribute('aria-expanded', 'false');
      isExpanded = false;
    }

    function getPosition() {
      return currentPosition ? Object.assign({}, currentPosition) : null;
    }

    function setPosition(pos) {
      if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
      currentPosition = { x: pos.x, y: pos.y };
      applyPosition(currentPosition);
      if (widget) widget._lastPos = { x: pos.x, y: pos.y };
      try { writePosition(storage, currentPosition); } catch (_e) { /* ignore */ }
    }

    function setCorner(corner) {
      if (corners.indexOf(corner) < 0) return;
      const wv = viewport || { width: 1024, height: 768 };
      const sz = { w: 110, h: 28 };
      const pos = cornerPosition(corner, wv.width, wv.height, sz.w, sz.h, 12);
      setPosition(pos);
      if (widget) widget._corner = corner;
    }

    return {
      mount: mount,
      unmount: unmount,
      update: update,
      expand: expand,
      collapse: collapse,
      isExpanded: function () { return isExpanded; },
      getPosition: getPosition,
      setPosition: setPosition,
      setCorner: setCorner,
      // exposed for tests + advanced use — live getters
      _corners: corners,
      get _widget() { return widget; },
      get _shadow() { return shadow; },
      get _isMounted() { return mounted; },
    };
  }

  const api = {
    shouldHide: shouldHide,
    create: create,
    isMounted: isMounted,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined' && root) {
    root.NOAIS_PAGE_COUNTER = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));

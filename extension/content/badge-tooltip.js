// NOAIS — badge tooltip (v1.1).
//
// Shows a small popup with the per-element heuristics breakdown when the
// user hovers a NOAIS badge for > 500 ms.
//
// The popup is rendered into a closed Shadow DOM root appended to
// document.body so site CSS cannot leak in.
//
// Factory:
//   const tip = NOAIS_BADGE_TOOLTIP.create({
//     document,        // browser-style document (createElement, body, ...)
//     allowlist,       // { add(host, text), isAllowed(host, hash) }
//     sendMessage,     // (msg) => Promise — wraps chrome.runtime.sendMessage
//     getTabId,        // () => number
//     getHostname,     // () => string   (defaults to location.hostname)
//     viewport,        // { width, height }  (defaults to 1024 x 768)
//   });
//
// Handle:
//   tip.attach(badgeElement)   start listening for mouseenter/mouseleave
//   tip.detach(badgeElement)   stop listening
//   tip.show(badge, breakdown) manually open the popup for `badge`
//   tip.hide()                 close any open popup
//   tip.destroy()              remove listeners + the popup
//
// The popup is also accessible as `tip._popup` for tests / advanced use.

(function (root) {
  'use strict';

  // Width of the popup, in CSS px. Used for viewport clamping.
  const POPUP_WIDTH = 220;
  // Vertical gap between the badge and the popup.
  const POPUP_MARGIN = 8;
  // Hover delay before the popup appears.
  const HOVER_DELAY_MS = 500;

  function create(opts) {
    const document = (opts && opts.document) || (typeof root.document !== 'undefined' ? root.document : null);
    const allowlist = (opts && opts.allowlist) || null;
    const sendMessage = (opts && opts.sendMessage) || function () { return Promise.resolve(); };
    const getTabId = (opts && opts.getTabId) || function () { return 0; };
    const viewport = (opts && opts.viewport) || { width: 1024, height: 768 };
    const getHostname = (opts && opts.getHostname) || function () {
      try {
        if (typeof location !== 'undefined' && location && location.hostname) {
          return String(location.hostname).toLowerCase();
        }
      } catch (_e) { /* ignore */ }
      return 'localhost';
    };

    let popup = null;
    let currentBadge = null;
    let hoverTimer = null;
    let lastPosition = null;
    const attached = new WeakSet();

    function clampToViewport(x, y) {
      const maxX = Math.max(0, viewport.width - POPUP_WIDTH);
      const cx = Math.max(0, Math.min(maxX, x));
      const cy = Math.max(0, Math.min(Math.max(0, viewport.height - 1), y));
      return { x: cx, y: cy };
    }

    function makePopup() {
      if (!document || typeof document.createElement !== 'function') return null;
      const host = document.createElement('div');
      host.setAttribute('data-noais-badge-tooltip', '');
      host.style.position = 'fixed';
      host.style.zIndex = '2147483647';
      host.style.left = '0px';
      host.style.top = '0px';
      // Closed shadow root — site CSS cannot reach inside.
      const shadow = host.attachShadow ? host.attachShadow({ mode: 'closed' }) : host;
      // Expose the shadow on the host for tests + advanced use. In a real
      // browser, the shadow is closed, so this property is just for our
      // own delegation and the test DOM stub.
      host._shadow = shadow;

      // Outer card
      const card = document.createElement('div');
      card.className = 'noais-tooltip';
      const style = document.createElement('style');
      style.textContent = [
        '.noais-tooltip {',
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
        '  font-size: 12px; line-height: 1.4;',
        '  width: ' + POPUP_WIDTH + 'px;',
        '  background: #fff; color: #222;',
        '  border: 1px solid rgba(0,0,0,0.15);',
        '  border-radius: 6px;',
        '  box-shadow: 0 4px 12px rgba(0,0,0,0.18);',
        '  padding: 10px 12px;',
        '  box-sizing: border-box;',
        '}',
        '.noais-tooltip-title { font-weight: 700; margin: 0 0 6px 0; }',
        '.noais-tooltip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; }',
        '.noais-tooltip-grid b { font-weight: 600; }',
        '.noais-tooltip-sep { border-top: 1px dashed rgba(0,0,0,0.15); margin: 8px 0; }',
        '.noais-tooltip-actions { display: flex; gap: 8px; justify-content: space-between; }',
        '.noais-tooltip-btn {',
        '  background: transparent; border: 1px solid rgba(0,0,0,0.2);',
        '  border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px;',
        '  color: #1a73e8;',
        '}',
        '.noais-tooltip-btn:hover { background: rgba(26,115,232,0.08); }',
        '@media (prefers-color-scheme: dark) {',
        '  .noais-tooltip { background: #1f1f1f; color: #eee; border-color: rgba(255,255,255,0.15); }',
        '  .noais-tooltip-sep { border-color: rgba(255,255,255,0.15); }',
        '  .noais-tooltip-btn { color: #8ab4f8; border-color: rgba(255,255,255,0.25); }',
        '  .noais-tooltip-btn:hover { background: rgba(138,180,248,0.12); }',
        '}',
      ].join('\n');
      if (shadow.appendChild) {
        shadow.appendChild(style);
        shadow.appendChild(card);
      } else {
        // No shadow DOM — fall back to inlining everything into `host`.
        host.appendChild(style);
        host.appendChild(card);
      }
      // Attach `host` to body lazily (in show()).
      const triple = { host, shadow, card };
      // Aliases for tests + advanced use.
      triple._shadow = shadow;
      triple._card = card;
      return triple;
    }

    function renderCard(p, badge, breakdown) {
      const card = p.card;
      // Clear any prior content via removeChild loop (no innerHTML).
      while (card.children && card.children.length) {
        card.removeChild(card.children[0]);
      }
      // Title
      const sevLabel = (breakdown && typeof breakdown.score === 'number')
        ? (breakdown.score >= 61 ? 'AI-likely' : (breakdown.score >= 31 ? 'AI-possible' : 'human-likely'))
        : 'breakdown';
      const scoreVal = (breakdown && typeof breakdown.score === 'number') ? breakdown.score : '?';
      const title = document.createElement('div');
      title.className = 'noais-tooltip-title';
      title.textContent = 'NOAIS ' + scoreVal + '/100 — ' + sevLabel;
      card.appendChild(title);
      // Grid
      const grid = document.createElement('div');
      grid.className = 'noais-tooltip-grid';
      function addMetric(label, value) {
        const k = document.createElement('span');
        k.textContent = label + ':';
        const v = document.createElement('b');
        v.textContent = value;
        grid.appendChild(k);
        grid.appendChild(v);
      }
      const fmt = function (v) {
        if (v == null) return '—';
        if (typeof v === 'number') return String(Math.round(v * 100) / 100);
        return String(v);
      };
      const b = breakdown || {};
      addMetric('Burstiness', fmt(b.burstiness));
      addMetric('TTR', fmt(b.typeTokenRatio));
      addMetric('Entropy', fmt(b.entropy));
      addMetric('Hapax', fmt(b.hapaxRatio));
      card.appendChild(grid);
      // Separator
      const sep = document.createElement('div');
      sep.className = 'noais-tooltip-sep';
      card.appendChild(sep);
      // Actions
      const actions = document.createElement('div');
      actions.className = 'noais-tooltip-actions';
      const whyBtn = document.createElement('button');
      whyBtn.className = 'noais-tooltip-btn';
      whyBtn.setAttribute('type', 'button');
      whyBtn.setAttribute('data-noais-action', 'why');
      whyBtn.textContent = 'Why am I seeing this?';
      const dontBtn = document.createElement('button');
      dontBtn.className = 'noais-tooltip-btn';
      dontBtn.setAttribute('type', 'button');
      dontBtn.setAttribute('data-noais-action', 'allowlist');
      dontBtn.textContent = "Don't show this";
      actions.appendChild(whyBtn);
      actions.appendChild(dontBtn);
      card.appendChild(actions);
    }

    function onWhyClick() {
      if (!currentBadge) return;
      let breakdown = null;
      try {
        const raw = currentBadge.dataset && currentBadge.dataset.noaisBreakdown;
        breakdown = raw ? JSON.parse(raw) : null;
      } catch (_e) { breakdown = null; }
      try {
        sendMessage({
          type: 'OPEN_WHY_PANEL',
          tabId: getTabId(),
          breakdown: breakdown,
          elementHost: getHostname(),
        });
      } catch (_e) { /* swallow — content script is best-effort */ }
      hide();
    }

    function onAllowlistClick() {
      if (!currentBadge) return;
      const host = getHostname();
      // Try to recover the text the badge was attached to. We do this by
      // walking up to the decorated element and reading its textContent.
      let text = '';
      try {
        // The badge is appended to (or a child of) the decorated element.
        // We walk up to the first element with [data-noais-scored="1"].
        let n = currentBadge;
        while (n) {
          if (n.dataset && n.dataset.noaisScored === '1') {
            text = n.textContent || '';
            break;
          }
          n = n.parentNode;
        }
        if (!text) text = currentBadge.textContent || '';
        // Trim and truncate to match the hash input.
        text = String(text).slice(0, 200);
      } catch (_e) { text = ''; }
      if (allowlist && typeof allowlist.add === 'function' && text) {
        try { allowlist.add(host, text); } catch (_e) { /* ignore */ }
      }
      try { currentBadge.dataset.noaisAllowlisted = '1'; } catch (_e) { /* ignore */ }
      hide();
    }

    function attachListeners(p) {
      const root = p.shadow;
      const whyBtns = [];
      const allowlistBtns = [];
      const walk = (node) => {
        if (!node || !node.children) return;
        for (const c of node.children) {
          if (c.getAttribute && c.getAttribute('data-noais-action') === 'why') whyBtns.push(c);
          if (c.getAttribute && c.getAttribute('data-noais-action') === 'allowlist') allowlistBtns.push(c);
          walk(c);
        }
      };
      walk(root);
      for (const b of whyBtns) {
        if (b.addEventListener) b.addEventListener('click', onWhyClick);
      }
      for (const b of allowlistBtns) {
        if (b.addEventListener) b.addEventListener('click', onAllowlistClick);
      }
    }

    function positionPopup(p, badge) {
      let rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 20 };
      try {
        if (badge && typeof badge.getBoundingClientRect === 'function') {
          rect = badge.getBoundingClientRect();
        }
      } catch (_e) { /* ignore */ }
      // Center horizontally on the badge; place above by default.
      const centerX = rect.left + (rect.width / 2);
      const rawX = centerX - (POPUP_WIDTH / 2);
      const rawY = rect.top - POPUP_MARGIN;
      // Default place-above; if it would be negative, place below.
      const tentativeY = (rawY < 0) ? (rect.bottom + POPUP_MARGIN) : rawY;
      const clamped = clampToViewport(rawX, tentativeY);
      if (p.host && p.host.style) {
        p.host.style.left = clamped.x + 'px';
        p.host.style.top = clamped.y + 'px';
      }
      p._position = clamped;
      lastPosition = clamped;
    }

    function ensurePopup() {
      if (popup) return popup;
      popup = makePopup();
      if (popup && document && document.body && popup.host) {
        try { document.body.appendChild(popup.host); } catch (_e) { /* ignore */ }
      }
      return popup;
    }

    function show(badge, breakdown) {
      // Re-hover closes the old one before opening the new one.
      if (currentBadge && currentBadge !== badge) {
        hide();
      }
      if (hoverTimer != null) {
        try { clearTimeout(hoverTimer); } catch (_e) { /* ignore */ }
        hoverTimer = null;
      }
      currentBadge = badge || null;
      const p = ensurePopup();
      if (!p) return;
      let parsedBreakdown = breakdown;
      if (!parsedBreakdown && badge && badge.dataset && badge.dataset.noaisBreakdown) {
        try { parsedBreakdown = JSON.parse(badge.dataset.noaisBreakdown); }
        catch (_e) { parsedBreakdown = null; }
      }
      renderCard(p, badge, parsedBreakdown);
      // Attach listeners AFTER rendering so the buttons exist.
      attachListeners(p);
      positionPopup(p, badge);
      // Reveal
      if (p.host && p.host.style) p.host.style.display = '';
    }

    function hide() {
      if (hoverTimer != null) {
        try { clearTimeout(hoverTimer); } catch (_e) { /* ignore */ }
        hoverTimer = null;
      }
      if (popup && popup.host && popup.host.style) {
        popup.host.style.display = 'none';
      }
      currentBadge = null;
    }

    function destroy() {
      hide();
      if (popup && popup.host && popup.host.parentNode) {
        try { popup.host.parentNode.removeChild(popup.host); } catch (_e) { /* ignore */ }
      }
      popup = null;
    }

    function onBadgeMouseEnter() {
      const badge = this;
      if (hoverTimer != null) {
        try { clearTimeout(hoverTimer); } catch (_e) { /* ignore */ }
      }
      hoverTimer = setTimeout(() => {
        hoverTimer = null;
        // Read breakdown from the badge dataset if not already open.
        let breakdown = null;
        if (badge && badge.dataset && badge.dataset.noaisBreakdown) {
          try { breakdown = JSON.parse(badge.dataset.noaisBreakdown); }
          catch (_e) { breakdown = null; }
        }
        show(badge, breakdown);
      }, HOVER_DELAY_MS);
    }

    function onBadgeMouseLeave() {
      if (hoverTimer != null) {
        try { clearTimeout(hoverTimer); } catch (_e) { /* ignore */ }
        hoverTimer = null;
      }
    }

    function attach(badge) {
      if (!badge || typeof badge.addEventListener !== 'function') return;
      if (attached.has(badge)) return;
      attached.add(badge);
      try { badge.addEventListener('mouseenter', onBadgeMouseEnter); } catch (_e) { /* ignore */ }
      try { badge.addEventListener('mouseleave', onBadgeMouseLeave); } catch (_e) { /* ignore */ }
    }

    function detach(badge) {
      if (!badge) return;
      attached.delete(badge);
      try { badge.removeEventListener('mouseenter', onBadgeMouseEnter); } catch (_e) { /* ignore */ }
      try { badge.removeEventListener('mouseleave', onBadgeMouseLeave); } catch (_e) { /* ignore */ }
    }

    return {
      attach: attach,
      detach: detach,
      show: show,
      hide: hide,
      destroy: destroy,
      // exposed for tests — live getters so the snapshot is current
      get _popup() { return popup; },
      get _position() { return lastPosition; },
    };
  }

  const api = { create: create };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined' && root) {
    root.NOAIS_BADGE_TOOLTIP = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));

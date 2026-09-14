/**
 * Responsive width probe — the measurement used by the 13 Sep 2026 rendered
 * audit (docs/responsive-rendered-audit-2026-09-13.md) and the width-check
 * protocol in docs/responsive-conformance-plan-2026-09-11.md.
 *
 * Paste into a DevTools console (or run through a browser automation
 * `evaluate`) on any authenticated route, then call:
 *
 *   window.__responsiveProbe()            // one route at the current width
 *   window.__responsiveSweep(['/dashboard', '/contacts'], 'w375')
 *                                          // several routes via SPA navigation;
 *                                          // results land in window.__responsiveResults.w375
 *
 * Each result reports: document horizontal overflow; elements extending past
 * the viewport outside a scroll rail; single-text nowrap elements whose
 * scrollWidth exceeds their box (visibly truncated); interactive elements under
 * 40px in either dimension without a >=40px ::after hit-area. Run it at 375,
 * 768, 1024 and 1440 with the sidebar expanded, and again at 1024 collapsed.
 */
(() => {
  const NAV_LABELS = /^(Settings|Help|Status|Dismiss trial reminder)$|^Open subscription/;

  const insideScrollRail = (el) => {
    let node = el.parentElement;
    const vw = document.documentElement.clientWidth;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if (/(auto|scroll)/.test(cs.overflowX)) return true;
      if (cs.overflowX === 'hidden' || cs.overflow === 'hidden') {
        if (node.getBoundingClientRect().right <= vw + 1) return true;
      }
      node = node.parentElement;
    }
    return false;
  };

  const describe = (el) =>
    el.tagName.toLowerCase()
    + (el.id ? '#' + el.id : '')
    + '.'
    + (typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 5).join('.') : '');

  window.__responsiveProbe = () => {
    const vw = document.documentElement.clientWidth;
    const docW = document.documentElement.scrollWidth;
    const over = [];
    const clipped = [];
    const small = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      if (el.classList.contains('sr-only')) continue;
      const desc = describe(el);
      if (cs.position !== 'fixed' && (rect.right > vw + 1 || rect.left < -1) && !insideScrollRail(el)) {
        if (!seen.has(desc)) {
          seen.add(desc);
          over.push({ el: desc.slice(0, 100), left: Math.round(rect.left), right: Math.round(rect.right) });
        }
      }
      const singleText = el.children.length === 0 && (el.textContent || '').trim().length > 0;
      if (
        singleText
        && (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis')
        && cs.whiteSpace.startsWith('nowrap')
        && el.scrollWidth > el.clientWidth + 2
      ) {
        clipped.push({ el: desc.slice(0, 80), text: (el.textContent || '').trim().slice(0, 32), box: el.clientWidth, needs: el.scrollWidth });
      }
      const interactive = el.matches(
        'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=checkbox], [role=switch], [role=menuitem]',
      );
      if (interactive && (rect.height < 40 || rect.width < 40) && rect.top < innerHeight && rect.bottom > 0) {
        const hitArea = parseFloat(getComputedStyle(el, '::after').height) || 0;
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28);
        if (hitArea < 40 && !NAV_LABELS.test(label)) {
          small.push({ el: desc.slice(0, 80), label, w: Math.round(rect.width), h: Math.round(rect.height) });
        }
      }
    }
    return {
      path: location.pathname,
      h1: (document.querySelector('h1') || {}).textContent,
      vw,
      docW,
      hOverflow: docW > vw,
      over: over.slice(0, 6),
      overCount: over.length,
      clipped: clipped.slice(0, 6),
      clippedCount: clipped.length,
      small: small.slice(0, 8),
      smallCount: small.length,
    };
  };

  window.__responsiveGo = async (path, settleMs = 2000) => {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    window.scrollTo(0, 0);
    return window.__responsiveProbe();
  };

  window.__responsiveSweep = async (routes, label) => {
    window.__responsiveResults = window.__responsiveResults || {};
    const out = {};
    for (const route of routes) {
      try {
        out[route] = await window.__responsiveGo(route);
      } catch (error) {
        out[route] = { error: String(error) };
      }
    }
    window.__responsiveResults[label] = out;
    return label;
  };

  return 'responsive probe installed';
})();

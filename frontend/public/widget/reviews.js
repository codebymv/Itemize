(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute('data-widget-key') || '';
  var apiBase = (script.getAttribute('data-api-base') || 'https://itemize.cloud').replace(/\/$/, '');
  if (!/^[a-f0-9]{32}$/i.test(key) || !/^https?:\/\//i.test(apiBase)) return;
  var root = document.getElementById('review-widget-' + key);
  if (!root) return;

  var addStyle = function (element, values) {
    Object.keys(values).forEach(function (name) { element.style[name] = values[name]; });
  };
  var element = function (name, text) {
    var node = document.createElement(name);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  var safeColor = function (value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
  };

  root.setAttribute('aria-live', 'polite');
  root.textContent = 'Loading reviews…';

  fetch(apiBase + '/api/reputation/public/widget/' + encodeURIComponent(key), {
    method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' }
  }).then(function (response) {
    if (!response.ok) throw new Error('unavailable');
    return response.json();
  }).then(function (payload) {
    var config = payload && payload.config ? payload.config : {};
    var reviews = payload && Array.isArray(payload.reviews) ? payload.reviews : [];
    var background = safeColor(config.background_color, '#FFFFFF');
    var text = safeColor(config.text_color, '#1F2937');
    var primary = safeColor(config.primary_color, '#6366F1');
    var radius = Number.isInteger(config.border_radius) && config.border_radius >= 0 && config.border_radius <= 64
      ? config.border_radius : 8;

    root.textContent = '';
    root.className = 'itemize-review-widget itemize-review-widget-' + (config.widget_type || 'carousel');
    addStyle(root, {
      boxSizing: 'border-box', color: text, backgroundColor: background,
      borderRadius: radius + 'px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      display: 'grid', gridTemplateColumns: config.widget_type === 'grid' ? 'repeat(auto-fit,minmax(220px,1fr))' : '1fr',
      gap: '12px', padding: '12px'
    });

    if (reviews.length === 0) {
      var empty = element('p', 'No reviews yet.');
      addStyle(empty, { margin: '0', opacity: '0.7', fontSize: '14px' });
      root.appendChild(empty);
      return;
    }

    reviews.forEach(function (review) {
      var card = element('article');
      addStyle(card, {
        boxSizing: 'border-box', border: '1px solid rgba(127,127,127,0.22)',
        borderRadius: radius + 'px', padding: '14px', minWidth: '0'
      });
      if (config.show_rating_stars !== false) {
        var rating = Math.max(1, Math.min(5, Number(review.rating) || 1));
        var stars = element('div', '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(rating));
        stars.setAttribute('aria-label', rating + ' out of 5 stars');
        addStyle(stars, { color: primary, letterSpacing: '1px', marginBottom: '8px' });
        card.appendChild(stars);
      }
      if (review.review_text) {
        var copy = element('p', String(review.review_text));
        addStyle(copy, { margin: '0 0 10px', lineHeight: '1.45', overflowWrap: 'anywhere' });
        card.appendChild(copy);
      }
      var meta = [];
      if (review.reviewer_name) meta.push(String(review.reviewer_name));
      if (config.show_platform_icon !== false && review.platform) meta.push(String(review.platform));
      if (config.show_review_date !== false && review.review_date) {
        var date = new Date(review.review_date);
        if (!isNaN(date.getTime())) meta.push(date.toLocaleDateString());
      }
      if (meta.length) {
        var byline = element('small', meta.join(' · '));
        addStyle(byline, { opacity: '0.72', fontSize: '12px' });
        card.appendChild(byline);
      }
      root.appendChild(card);
    });
  }).catch(function () {
    root.textContent = 'Reviews are temporarily unavailable.';
  });
}());

import DOMPurify from 'dompurify';
import type {
  PageContentRecord,
  PageSection,
  PageTheme,
  PublicPage,
} from '@/services/pagesApi';

export type LandingPageDocument = Pick<
  PublicPage,
  | 'name'
  | 'slug'
  | 'seo_title'
  | 'seo_description'
  | 'seo_keywords'
  | 'og_image'
  | 'favicon_url'
  | 'theme'
  | 'custom_css'
  | 'custom_js'
  | 'custom_head'
  | 'organization_name'
  | 'sections'
>;

const DEFAULT_THEME: PageTheme = {
  primaryColor: '#2563eb',
  secondaryColor: '#0f172a',
  backgroundColor: '#ffffff',
  textColor: '#0f172a',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  headingFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
  borderRadius: 8,
  spacing: 'normal',
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const stringValue = (content: PageContentRecord, key: string): string => {
  const value = content[key];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
};

const numberValue = (
  content: PageContentRecord,
  key: string,
  fallback: number,
): number => {
  const value = content[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const objectArray = (value: unknown): PageContentRecord[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is PageContentRecord =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const safeUrl = (value: unknown, fallback = '#'): string => {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const url = value.trim();
  if (
    url.startsWith('#') ||
    url.startsWith('/') ||
    /^(https?:|mailto:|tel:)/i.test(url)
  ) {
    return escapeHtml(url);
  }
  return fallback;
};

const safeImageUrl = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (
    url.startsWith('/') ||
    /^https?:/i.test(url) ||
    /^data:image\/(?:png|gif|jpeg|webp|svg\+xml);base64,/i.test(url)
  ) {
    return escapeHtml(url);
  }
  return '';
};

const richHtml = (value: unknown): string =>
  DOMPurify.sanitize(typeof value === 'string' ? value : '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload'],
  });

const safeCustomHead = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') return '';
  const parsed = new DOMParser().parseFromString(
    `<html><head>${value}</head><body></body></html>`,
    'text/html',
  );

  return Array.from(parsed.head.children)
    .map((element) => {
      const tag = element.tagName.toLowerCase();
      if (tag === 'meta') {
        const name = element.getAttribute('name');
        const property = element.getAttribute('property');
        const content = element.getAttribute('content');
        if ((!name && !property) || content === null) return '';
        return `<meta ${
          name
            ? `name="${escapeHtml(name)}"`
            : `property="${escapeHtml(property)}"`
        } content="${escapeHtml(content)}">`;
      }
      if (tag === 'link') {
        const rel = element.getAttribute('rel')?.toLowerCase();
        const href = safeUrl(element.getAttribute('href'), '');
        if (
          !rel ||
          !href ||
          !['icon', 'stylesheet', 'preload', 'preconnect'].includes(rel)
        ) {
          return '';
        }
        return `<link rel="${escapeHtml(rel)}" href="${href}">`;
      }
      if (tag === 'style') {
        return `<style>${String(element.textContent || '').replaceAll(
          '</style',
          '<\\/style',
        )}</style>`;
      }
      return '';
    })
    .join('');
};

const align = (value: unknown): 'left' | 'center' | 'right' =>
  value === 'left' || value === 'right' ? value : 'center';

const renderSection = (section: PageSection): string => {
  const content = section.content || {};
  const settings = section.settings || {};
  if (settings.visible === false) return '';

  const backgroundImage = safeImageUrl(settings.backgroundImage);
  const style = [
    `padding:${Number(settings.paddingTop ?? 48)}px ${Number(settings.paddingRight ?? 24)}px ${Number(settings.paddingBottom ?? 48)}px ${Number(settings.paddingLeft ?? 24)}px`,
    settings.backgroundColor
      ? `background-color:${escapeHtml(settings.backgroundColor)}`
      : '',
    backgroundImage ? `background-image:url("${backgroundImage}")` : '',
    backgroundImage ? 'background-size:cover;background-position:center' : '',
  ]
    .filter(Boolean)
    .join(';');

  let body = '';
  switch (section.section_type) {
    case 'header': {
      const links = objectArray(content.nav_items)
        .map(
          (item) =>
            `<a href="${safeUrl(item.url)}">${escapeHtml(item.label || item.text)}</a>`,
        )
        .join('');
      const logo = safeImageUrl(content.logo_url);
      body = `<nav class="lp-header">${
        logo
          ? `<img src="${logo}" alt="${escapeHtml(content.logo_alt || 'Logo')}">`
          : `<strong>${escapeHtml(content.brand || section.name || '')}</strong>`
      }<div class="lp-links">${links}</div></nav>`;
      break;
    }
    case 'hero': {
      const image = safeImageUrl(content.background_image);
      const heroStyle = image
        ? ` style="background-image:url('${image}');background-size:cover;background-position:center"`
        : '';
      body = `<div class="lp-hero" data-height="${escapeHtml(
        stringValue(content, 'height') || 'large',
      )}"${heroStyle}><div style="text-align:${align(content.alignment)}">
        <h1>${escapeHtml(content.heading)}</h1>
        <p>${escapeHtml(content.subheading)}</p>
        <div class="lp-actions">
          ${
            content.cta_text
              ? `<a class="lp-button" href="${safeUrl(content.cta_url)}">${escapeHtml(content.cta_text)}</a>`
              : ''
          }
          ${
            content.secondary_cta_text
              ? `<a class="lp-button lp-button-secondary" href="${safeUrl(content.secondary_cta_url)}">${escapeHtml(content.secondary_cta_text)}</a>`
              : ''
          }
        </div>
      </div></div>`;
      break;
    }
    case 'text':
      body = `<div style="text-align:${align(content.alignment)}">${
        content.heading ? `<h2>${escapeHtml(content.heading)}</h2>` : ''
      }<div class="lp-rich">${richHtml(content.body)}</div></div>`;
      break;
    case 'image': {
      const image = safeImageUrl(content.image_url);
      body = image
        ? `<figure><a href="${safeUrl(content.link_url, image)}"><img class="lp-image" src="${image}" alt="${escapeHtml(content.alt_text)}"></a>${
            content.caption
              ? `<figcaption>${escapeHtml(content.caption)}</figcaption>`
              : ''
          }</figure>`
        : '<div class="lp-placeholder">Image</div>';
      break;
    }
    case 'video': {
      const video = safeUrl(content.video_url, '');
      body = video
        ? `<video class="lp-video" src="${video}" ${
            content.controls === false ? '' : 'controls'
          } ${content.autoplay ? 'autoplay' : ''} ${
            content.muted === false ? '' : 'muted'
          } ${content.loop ? 'loop' : ''} poster="${safeImageUrl(
            content.poster,
          )}"></video>`
        : '<div class="lp-placeholder">Video</div>';
      break;
    }
    case 'form':
      body = `<div class="lp-card"><h2>${escapeHtml(
        content.heading || 'Contact us',
      )}</h2><p>${escapeHtml(content.subheading)}</p>${
        content.form_id
          ? `<a class="lp-button" href="/form/${encodeURIComponent(
              String(content.form_id),
            )}">Open form</a>`
          : '<p class="lp-muted">Select a form to publish this section.</p>'
      }</div>`;
      break;
    case 'cta':
      body = `<div class="lp-cta"><h2>${escapeHtml(
        content.heading,
      )}</h2><p>${escapeHtml(
        content.description,
      )}</p><a class="lp-button" href="${safeUrl(
        content.button_url,
      )}">${escapeHtml(content.button_text || 'Learn more')}</a></div>`;
      break;
    case 'testimonials': {
      const items = objectArray(content.items)
        .map(
          (item) => `<blockquote class="lp-card">
            <p>“${escapeHtml(item.quote)}”</p>
            <footer><strong>${escapeHtml(item.author)}</strong>${
              item.role ? ` · ${escapeHtml(item.role)}` : ''
            }${item.company ? `, ${escapeHtml(item.company)}` : ''}</footer>
          </blockquote>`,
        )
        .join('');
      body = `<h2>${escapeHtml(
        content.heading,
      )}</h2><p class="lp-lead">${escapeHtml(
        content.subheading,
      )}</p><div class="lp-grid">${items}</div>`;
      break;
    }
    case 'pricing': {
      const plans = objectArray(content.plans)
        .map(
          (plan) => `<article class="lp-card ${
            plan.highlighted ? 'lp-highlighted' : ''
          }"><h3>${escapeHtml(plan.name)}</h3><div class="lp-price">${escapeHtml(
            plan.price,
          )}<small>${escapeHtml(plan.period)}</small></div><p>${escapeHtml(
            plan.description,
          )}</p><ul>${stringArray(plan.features)
            .map((feature) => `<li>${escapeHtml(feature)}</li>`)
            .join('')}</ul><a class="lp-button" href="${safeUrl(
            plan.cta_url,
          )}">${escapeHtml(plan.cta_text || 'Choose plan')}</a></article>`,
        )
        .join('');
      body = `<h2>${escapeHtml(
        content.heading,
      )}</h2><p class="lp-lead">${escapeHtml(
        content.subheading,
      )}</p><div class="lp-grid">${plans}</div>`;
      break;
    }
    case 'faq': {
      const items = objectArray(content.items)
        .map(
          (item) =>
            `<details class="lp-card"><summary>${escapeHtml(
              item.question,
            )}</summary><p>${escapeHtml(item.answer)}</p></details>`,
        )
        .join('');
      body = `<h2>${escapeHtml(
        content.heading,
      )}</h2><p class="lp-lead">${escapeHtml(
        content.subheading,
      )}</p><div class="lp-stack">${items}</div>`;
      break;
    }
    case 'features': {
      const items = objectArray(content.items)
        .map(
          (item) =>
            `<article class="lp-card"><h3>${escapeHtml(
              item.title,
            )}</h3><p>${escapeHtml(item.description)}</p></article>`,
        )
        .join('');
      body = `<h2>${escapeHtml(
        content.heading,
      )}</h2><p class="lp-lead">${escapeHtml(
        content.subheading,
      )}</p><div class="lp-grid">${items}</div>`;
      break;
    }
    case 'gallery': {
      const images = objectArray(content.images)
        .map((image) => {
          const source = safeImageUrl(image.url);
          return source
            ? `<figure><img class="lp-image" src="${source}" alt="${escapeHtml(
                image.alt,
              )}">${
                image.caption
                  ? `<figcaption>${escapeHtml(image.caption)}</figcaption>`
                  : ''
              }</figure>`
            : '';
        })
        .join('');
      body = `<h2>${escapeHtml(
        content.heading,
      )}</h2><div class="lp-grid">${images}</div>`;
      break;
    }
    case 'countdown':
      body = `<div class="lp-cta"><h2>${escapeHtml(
        content.heading,
      )}</h2><time class="lp-countdown" datetime="${escapeHtml(
        content.target_date,
      )}" data-expired="${escapeHtml(
        content.expired_text || 'Event has started!',
      )}">${escapeHtml(content.target_date)}</time></div>`;
      break;
    case 'html':
      body = `${
        content.css_content
          ? `<style>${String(content.css_content).replaceAll(
              '</style',
              '<\\/style',
            )}</style>`
          : ''
      }<div class="lp-rich">${richHtml(content.html_content)}</div>`;
      break;
    case 'divider': {
      const dividerStyle = stringValue(content, 'style') || 'line';
      body =
        dividerStyle === 'space'
          ? `<div style="height:${numberValue(content, 'height', 32)}px"></div>`
          : `<hr class="lp-divider lp-divider-${escapeHtml(dividerStyle)}">`;
      break;
    }
    case 'social': {
      const platforms = objectArray(content.platforms)
        .map(
          (platform) =>
            `<a class="lp-button lp-button-secondary" href="${safeUrl(
              platform.url,
            )}">${escapeHtml(platform.type || 'Link')}</a>`,
        )
        .join('');
      body = `<h2>${escapeHtml(
        content.heading,
      )}</h2><div class="lp-actions">${platforms}</div>`;
      break;
    }
    case 'footer': {
      const links = objectArray(content.links)
        .map(
          (link) =>
            `<a href="${safeUrl(link.url)}">${escapeHtml(
              link.label || link.text,
            )}</a>`,
        )
        .join('');
      body = `<footer class="lp-footer"><span>${escapeHtml(
        content.copyright,
      )}</span><nav class="lp-links">${links}</nav></footer>`;
      break;
    }
    case 'columns': {
      const columns = objectArray(content.columns)
        .map(
          (column) =>
            `<div class="lp-card lp-rich">${richHtml(column.content)}</div>`,
        )
        .join('');
      body = `<div class="lp-grid">${columns}</div>`;
      break;
    }
    case 'spacer':
      body = `<div style="height:${Math.max(
        0,
        numberValue(content, 'height', 50),
      )}px"></div>`;
      break;
    case 'button':
      body = `<div style="text-align:${align(
        content.alignment,
      )}"><a class="lp-button" href="${safeUrl(content.url)}">${escapeHtml(
        content.text || 'Learn more',
      )}</a></div>`;
      break;
    case 'logo_cloud': {
      const logos = objectArray(content.logos)
        .map((logo) => {
          const source = safeImageUrl(logo.url || logo.image_url);
          return source
            ? `<img class="lp-logo" src="${source}" alt="${escapeHtml(
                logo.alt || logo.name,
              )}">`
            : '';
        })
        .join('');
      body = `<h2>${escapeHtml(
        content.heading,
      )}</h2><div class="lp-logo-cloud">${logos}</div>`;
      break;
    }
    case 'stats': {
      const items = objectArray(content.items)
        .map(
          (item) =>
            `<div class="lp-stat"><strong>${escapeHtml(
              item.value,
            )}</strong><span>${escapeHtml(item.label)}</span></div>`,
        )
        .join('');
      body = `<h2>${escapeHtml(
        content.heading,
      )}</h2><div class="lp-grid">${items}</div>`;
      break;
    }
    case 'team': {
      const members = objectArray(content.members)
        .map((member) => {
          const avatar = safeImageUrl(member.avatar || member.image_url);
          return `<article class="lp-card">${
            avatar
              ? `<img class="lp-avatar" src="${avatar}" alt="${escapeHtml(
                  member.name,
                )}">`
              : ''
          }<h3>${escapeHtml(member.name)}</h3><p>${escapeHtml(
            member.role,
          )}</p></article>`;
        })
        .join('');
      body = `<h2>${escapeHtml(
        content.heading,
      )}</h2><div class="lp-grid">${members}</div>`;
      break;
    }
    case 'contact':
      body = `<div class="lp-card"><h2>${escapeHtml(
        content.heading,
      )}</h2><address>${
        content.email
          ? `<a href="mailto:${escapeHtml(content.email)}">${escapeHtml(
              content.email,
            )}</a><br>`
          : ''
      }${
        content.phone
          ? `<a href="tel:${escapeHtml(content.phone)}">${escapeHtml(
              content.phone,
            )}</a><br>`
          : ''
      }${escapeHtml(content.address)}</address></div>`;
      break;
    case 'map': {
      const embed = safeUrl(content.embed_url, '');
      body = embed
        ? `<iframe class="lp-map" src="${embed}" height="${numberValue(
            content,
            'height',
            400,
          )}" loading="lazy" referrerpolicy="no-referrer"></iframe>`
        : `<div class="lp-placeholder">${escapeHtml(
            content.address || 'Map',
          )}</div>`;
      break;
    }
    default:
      body = `<div class="lp-placeholder">${escapeHtml(
        section.name || section.section_type,
      )}</div>`;
  }

  return `<section class="lp-section" style="${style}"><div class="${
    settings.fullWidth ? 'lp-container lp-container-full' : 'lp-container'
  }" style="max-width:${escapeHtml(
    settings.maxWidth || '1120px',
  )}">${body}</div></section>`;
};

const baseCss = (theme: PageTheme): string => `
  :root{--primary:${theme.primaryColor};--secondary:${theme.secondaryColor};--background:${theme.backgroundColor};--text:${theme.textColor};--radius:${theme.borderRadius}px}
  *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--background);color:var(--text);font-family:${theme.fontFamily};line-height:1.6}
  body{overflow-wrap:anywhere}a{color:var(--primary)}h1,h2,h3{font-family:${theme.headingFont};line-height:1.15;margin:0 0 .65em}h1{font-size:clamp(2.4rem,7vw,5.5rem)}h2{font-size:clamp(1.8rem,4vw,3rem);text-align:center}h3{font-size:1.25rem}
  p{margin:.5rem 0 1rem}.lp-container{width:100%;margin:0 auto}.lp-container-full{max-width:none!important}.lp-section{background-position:center}
  .lp-header,.lp-footer{display:flex;align-items:center;justify-content:space-between;gap:2rem}.lp-header img{max-height:48px;max-width:220px}.lp-links,.lp-actions,.lp-logo-cloud{display:flex;align-items:center;justify-content:center;gap:1rem;flex-wrap:wrap}
  .lp-hero{min-height:520px;display:grid;place-items:center;padding:4rem 1rem}.lp-hero[data-height="small"]{min-height:320px}.lp-hero[data-height="medium"]{min-height:440px}.lp-hero[data-height="full"]{min-height:100vh}.lp-hero p,.lp-lead{font-size:1.2rem;opacity:.8;text-align:center}
  .lp-button{display:inline-block;border:0;border-radius:var(--radius);background:var(--primary);color:white;text-decoration:none;padding:.8rem 1.25rem;font-weight:700}.lp-button-secondary{background:transparent;color:var(--primary);box-shadow:inset 0 0 0 1px var(--primary)}
  .lp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.25rem}.lp-stack{display:grid;gap:.75rem}.lp-card{padding:1.5rem;border:1px solid color-mix(in srgb,var(--text) 15%,transparent);border-radius:var(--radius);background:color-mix(in srgb,var(--background) 96%,var(--text))}
  .lp-highlighted{box-shadow:0 0 0 2px var(--primary)}.lp-price{font-size:2.2rem;font-weight:800}.lp-price small{font-size:.9rem;font-weight:400}.lp-rich img,.lp-image,.lp-video{display:block;max-width:100%;height:auto;margin:auto;border-radius:var(--radius)}figure{margin:0;text-align:center}figcaption,.lp-muted{opacity:.65}
  .lp-placeholder{min-height:180px;display:grid;place-items:center;border:1px dashed currentColor;border-radius:var(--radius);opacity:.55}.lp-divider{border:0;border-top:1px solid currentColor}.lp-divider-dotted{border-top-style:dotted}.lp-divider-gradient{height:2px;background:linear-gradient(90deg,transparent,var(--primary),transparent)}
  .lp-logo-cloud{justify-content:space-around}.lp-logo{max-width:160px;max-height:64px}.lp-stat{text-align:center}.lp-stat strong{display:block;font-size:2.5rem;color:var(--primary)}.lp-avatar{width:96px;height:96px;border-radius:50%;object-fit:cover}.lp-map{width:100%;border:0;border-radius:var(--radius)}address{font-style:normal}.lp-countdown{display:block;font-size:clamp(1.5rem,4vw,3rem);font-weight:800}
  @media(max-width:640px){.lp-header,.lp-footer{align-items:flex-start;flex-direction:column}.lp-section{padding-left:18px!important;padding-right:18px!important}}
`;

export const buildLandingPageDocument = (
  page: LandingPageDocument,
  baseUrl: string,
): string => {
  const theme = { ...DEFAULT_THEME, ...(page.theme || {}) };
  const title = page.seo_title || page.name;
  const customHead = safeCustomHead(page.custom_head);
  const customCss = String(page.custom_css || '').replaceAll(
    '</style',
    '<\\/style',
  );
  const customJs = String(page.custom_js || '').replaceAll(
    '</script',
    '<\\/script',
  );
  const sections = [...(page.sections || [])]
    .sort((left, right) => left.section_order - right.section_order)
    .map(renderSection)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base href="${escapeHtml(baseUrl)}">
  <title>${escapeHtml(title)}</title>
  ${
    page.seo_description
      ? `<meta name="description" content="${escapeHtml(
          page.seo_description,
        )}">`
      : ''
  }
  ${
    page.seo_keywords
      ? `<meta name="keywords" content="${escapeHtml(page.seo_keywords)}">`
      : ''
  }
  ${
    page.og_image
      ? `<meta property="og:image" content="${safeImageUrl(page.og_image)}">`
      : ''
  }
  ${
    page.favicon_url
      ? `<link rel="icon" href="${safeImageUrl(page.favicon_url)}">`
      : ''
  }
  ${customHead}
  <style>${baseCss(theme)}${customCss}</style>
</head>
<body>
  <main>${sections}</main>
  ${
    page.organization_name
      ? `<div hidden data-organization="${escapeHtml(
          page.organization_name,
        )}"></div>`
      : ''
  }
  ${
    customJs
      ? `<script>"use strict";try{${customJs}}catch(error){console.error("Landing page script failed",error)}</script>`
      : ''
  }
</body>
</html>`;
};

/**
 * Colours the server writes into things other people receive — transactional
 * and campaign email, the unsubscribe page, generated landing pages, widget
 * defaults — and the default colour a card or category starts with when the
 * client sends none. Mirrors `frontend/src/lib/brand.ts`; none of these follow
 * a user's theme colour (`common/theme-color.ts`), which only styles the app.
 */
/** Tailwind blue-600: links and primary buttons in email and documents. */
export const BRAND_BLUE = '#2563eb';
/** Tailwind blue-700: hover on brand buttons in rendered HTML. */
export const BRAND_BLUE_HOVER = '#1d4ed8';
/** Tailwind blue-500: widget and page-theme defaults. */
export const BRAND_BLUE_SOFT = '#3B82F6';
/** Tailwind blue-800: secondary colour in generated landing pages; badge ink in email. */
export const BRAND_BLUE_DEEP = '#1E40AF';
/** Tailwind blue-50 / blue-100: email callout wash and badge fill. */
export const BRAND_WASH = '#eff6ff';
export const BRAND_TINT = '#dbeafe';

/**
 * What a list, note, whiteboard, wireframe, vault, frame, category, tag, or
 * calendar is coloured when the client does not say. The client normally
 * sends the user's theme default; this is the fallback for older clients.
 */
export const DEFAULT_CARD_ACCENT = '#3B82F6';

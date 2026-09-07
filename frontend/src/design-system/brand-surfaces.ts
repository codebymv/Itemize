/**
 * Brand surfaces: the pages other people see, which always wear the product
 * blues regardless of the viewer's theme colour. Marketing, auth, legal,
 * public share/estimate/invoice/booking/form/signing pages, exported previews
 * of emails and documents, and the chrome around them.
 *
 * Paths are relative to `src/` in posix form. A trailing `/` names a whole
 * directory; `*` matches within one path segment. Everything not listed here
 * is an application surface and must read theme tokens rather than raw blue
 * classes; `visual-language.test.ts` ratchets that count down.
 */
export const BRAND_SURFACES = [
  'pages/Home.tsx',
  'pages/home/',
  'pages/Login.tsx',
  'pages/Register.tsx',
  'pages/ForgotPassword.tsx',
  'pages/ResetPassword.tsx',
  'pages/RecoverAccount.tsx',
  'pages/VerifyEmail.tsx',
  'pages/OrganizationInvite.tsx',
  'pages/NotFound.tsx',
  'pages/legal/',
  'pages/sign/',
  'pages/Shared*Page.tsx',
  'pages/invoices/PublicEstimatePage.tsx',
  'pages/invoices/PublicInvoicePaymentPage.tsx',
  'pages/invoices/components/*Preview*.tsx',
  'pages/bookings/PublicBookingPage.tsx',
  'pages/calendars/CalendarBookingPreview.tsx',
  'pages/forms/PublicFormPage.tsx',
  'pages/signatures/components/*Preview*.tsx',
  'components/marketing/',
  'components/public/',
  'components/LandingNav.tsx',
  'components/Navbar.tsx',
  'components/Footer.tsx',
  'components/CookieConsent.tsx',
  'components/NotAvailableCTA.tsx',
  'components/Shared*Card.tsx',
  'components/SharedContentLayout.tsx',
  'components/subscription/PricingCards.tsx',
  'components/chat-widget/*Preview*.tsx',
  'components/reputation/*Preview*.tsx',
  'lib/landingPageDocument.ts',
] as const;

const toRegExp = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(pattern.endsWith('/') ? `^${escaped}` : `^${escaped}$`);
};

const BRAND_SURFACE_MATCHERS = BRAND_SURFACES.map(toRegExp);

/** True when a `src/`-relative posix path is a brand surface. */
export const isBrandSurface = (path: string): boolean =>
  BRAND_SURFACE_MATCHERS.some(matcher => matcher.test(path));

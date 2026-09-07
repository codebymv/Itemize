import { describe, expect, it } from 'vitest';
import { isBrandSurface } from './brand-surfaces';

describe('brand surfaces', () => {
  it('names the public-facing pages and their chrome', () => {
    for (const path of [
      'pages/Home.tsx',
      'pages/home/components/DashboardMock.tsx',
      'pages/Login.tsx',
      'pages/SharedNotePage.tsx',
      'pages/invoices/components/InvoiceEmailPreview.tsx',
      'pages/bookings/PublicBookingPage.tsx',
      'components/LandingNav.tsx',
      'components/SharedListCard.tsx',
      'lib/landingPageDocument.ts',
      'components/admin/RichTextEditor.tsx',
    ]) {
      expect(isBrandSurface(path), path).toBe(true);
    }
  });

  it('leaves application surfaces to the theme', () => {
    for (const path of [
      'pages/DashboardPage.tsx',
      'pages/workspace/SharedPage.tsx',
      'pages/invoices/InvoiceEditorPage.tsx',
      'components/AppSidebar.tsx',
      'components/ListCard/ListCard.tsx',
      'pages/homework/Thing.tsx',
    ]) {
      expect(isBrandSurface(path), path).toBe(false);
    }
  });
});

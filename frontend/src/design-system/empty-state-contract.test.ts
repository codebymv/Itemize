import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

describe('empty-state contract', () => {
  it('keeps semantic collection, result, passive, and inline states in the shared primitive', () => {
    const source = read('components/EmptyState.tsx');

    expect(source).toContain("'collection' | 'results' | 'passive' | 'inline'");
    expect(source).toContain("variant={isResultsState ? 'outline' : 'default'}");
    expect(source).toContain("role={isResultsState ? 'status' : undefined}");
    expect(source).toContain('type="button"');
  });

  it.each([
    'pages/contacts/ContactsPage.tsx',
    'pages/invoices/EstimatesPage.tsx',
    'pages/invoices/InvoicesPage.tsx',
    'pages/invoices/RecurringInvoicesPage.tsx',
    'pages/invoices/PaymentsPage.tsx',
    'pages/social/SocialPage.tsx',
    'pages/workspace/SharedPage.tsx',
    'pages/inbox/InboxPage.tsx',
  ])('%s gives filtered empties a result-state recovery action', path => {
    const source = read(path);

    expect(source).toMatch(/kind=\{[^\n]*(?:'results'|"results")/);
    expect(source).toMatch(/Clear (?:filters|search)/);
  });

  it('keeps authored output placeholders distinct from empty collections', () => {
    const source = read('components/preview/PreviewPlaceholder.tsx');
    const landingPreview = read('components/LandingPagePreviewFrame.tsx');
    const formPreview = read('components/forms/FormPreviewCanvas.tsx');

    expect(source).toContain('data-preview-placeholder');
    expect(landingPreview).toContain('<PreviewPlaceholder');
    expect(formPreview).toContain('<PreviewPlaceholder');
  });
});

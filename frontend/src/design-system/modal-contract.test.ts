import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const read = (path: string) => readFileSync(join(SRC, path), 'utf8')

describe('modal anatomy contract', () => {
  it('bounds the shell and gives scrolling to the body only', () => {
    const source = read('components/ui/modal.tsx')
    const dialog = read('components/ui/dialog.tsx')

    expect(source).toContain("'flex max-h-[calc(100dvh-2rem)]")
    expect(source).toContain("'min-h-0 flex-1 overflow-y-auto px-6 py-5'")
    expect(source).toContain("'shrink-0 border-t px-6 py-4'")
    expect(dialog).toContain('max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)]')
  })

  it('reserves the close lane and requires an accessible description', () => {
    const source = read('components/ui/modal.tsx')

    expect(source).toContain("'shrink-0 border-b px-6 py-4 pr-12 text-left'")
    expect(source).toContain('description: React.ReactNode')
    expect(source).toContain("descriptionVisuallyHidden && 'sr-only'")
  })

  it.each([
    'pages/calendars/components/CreateCalendarModal.tsx',
    'pages/contacts/components/CreateContactModal.tsx',
    'pages/contacts/components/EditContactModal.tsx',
    'components/OnboardingModal.tsx',
    'pages/admin/components/EmailLogsView.tsx',
    'components/CreateItemModal.tsx',
    'pages/contacts/components/ComposeEmailModal.tsx',
    'pages/invoices/ProductsPage.tsx',
    'pages/invoices/RecurringInvoicesPage.tsx',
    'pages/reputation/ReputationPage.tsx',
    'pages/reputation/ReputationSettingsPage.tsx',
  ])('%s uses the shared modal anatomy', path => {
    const source = read(path)

    expect(source).toContain('ui/modal')
    expect(source).toContain('<ModalContent')
    expect(source).toContain('<ModalHeader')
    expect(source).toContain('<ModalBody')
    expect(source).toContain('<ModalFooter')
  })

  it('documents modal hierarchy and scrolling ownership', () => {
    const docs = read('design-system/index.md')

    expect(docs).toContain('## Modal anatomy')
    expect(docs).toContain('only `ModalBody` scrolls')
    expect(docs).toContain('description in the')
    expect(docs).toContain('accessibility tree')
    expect(docs).toContain('one primary footer action')
  })
})

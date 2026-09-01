import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const read = (path: string) => readFileSync(join(SRC, path), 'utf8')

describe('touch throughput contract', () => {
  it('gives shared tap controls a 44px target and immediate pressed feedback', () => {
    const button = read('components/ui/button.tsx')
    const dialog = read('components/ui/dialog.tsx')
    const css = read('index.css')

    expect(button).toContain('touch-manipulation')
    expect(dialog).toContain('inline-flex h-11 w-11 touch-manipulation')
    expect(css).toContain('(max-width: 767px)')
    expect(css).toContain('.interaction-control[role=\'tab\']')
    expect(css).toContain('min-height: 2.75rem')
    expect(css).toContain('.interaction-button--primary:active')
    expect(css).toContain('.interaction-row:active')
  })

  it.each([
    'components/ui/checkbox.tsx',
    'components/ui/radio-group.tsx',
    'components/ui/switch.tsx',
  ])('%s expands its physical hit area without enlarging the visual control', path => {
    const source = read(path)

    expect(source).toContain('touch-manipulation')
    expect(source).toContain('after:h-11')
    expect(source).toContain('after:w-11')
  })

  it('keeps horizontal rails swipeable and gives their indicators full targets', () => {
    const source = read('components/layout/ResponsiveCardRail.tsx')

    expect(source).toContain('touch-pan-x')
    expect(source).toContain('touch-pan-y')
    expect(source).toContain('overflow-x-auto overscroll-x-contain')
    expect(source).toContain('h-11 w-11 touch-manipulation')
  })

  it.each([
    'pages/dashboard/components/DashboardOverview.tsx',
    'components/ListCard/ListCard.tsx',
    'components/VaultCard/VaultCard.tsx',
  ])('%s separates deliberate touch dragging from ordinary scrolling', path => {
    const source = read(path)

    expect(source).toContain('MouseSensor')
    expect(source).toContain('TouchSensor')
    expect(source).toContain('delay: 250, tolerance: 8')
    expect(source).not.toContain('PointerSensor')
  })

  it('provides an explicit touch alternative to moving deals by native drag', () => {
    const source = read('pages/pipelines/components/KanbanBoard.tsx')

    expect(source).toContain('Move to')
    expect(source).toContain('onDealMove(deal.id, targetStage.id)')
    expect(source).toContain('touch-pan-x touch-pan-y overflow-x-auto overscroll-x-contain')
    expect(source).toContain('const effectiveZoom = isMobile ? 100')
    expect(source).toContain('draggable={!isMobile && !isDealPending(deal.id)}')
  })

  it('documents target size, scroll ownership, feedback, and gesture fallbacks', () => {
    const docs = read('design-system/index.md')

    expect(docs).toContain('### Touch throughput')
    expect(docs).toContain('44 by 44 pixel physical hit area')
    expect(docs).toContain('immediate pressed feedback')
    expect(docs).toContain('Every business-state drag operation also has an explicit action')
  })
})

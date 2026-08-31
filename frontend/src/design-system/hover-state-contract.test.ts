import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const read = (path: string) => readFileSync(join(SRC, path), 'utf8')
const sourceFiles = (directory = SRC): string[] => readdirSync(directory).flatMap(entry => {
  const path = join(directory, entry)
  return statSync(path).isDirectory()
    ? sourceFiles(path)
    : /\.tsx?$/.test(path) && !/\.(test|spec)\.tsx?$/.test(path) ? [path] : []
})
const applicationSource = () => sourceFiles().map(path => readFileSync(path, 'utf8')).join('\n')

describe('hover-state contract', () => {
  it('limits application hover feedback to devices with precise pointers', () => {
    const css = read('index.css')

    expect(css).toContain('@media (hover: hover) and (pointer: fine)')
    expect(css.indexOf('.interaction-reveal {')).toBeLessThan(
      css.indexOf('@media (hover: hover) and (pointer: fine)'),
    )
    expect(css).toContain('.group:focus-within .interaction-reveal')
    expect(css).toContain('.interaction-reveal[data-state="open"]')
  })

  it('keeps button, field, row, card, and navigation feedback in shared primitives', () => {
    expect(read('components/ui/button.tsx')).toContain('interaction-button--primary')
    expect(read('components/ui/input.tsx')).toContain('interaction-field')
    expect(read('components/ui/select.tsx')).toContain('interaction-field')
    expect(read('components/ui/textarea.tsx')).toContain('interaction-field')
    expect(read('components/ui/navigation-row.tsx')).toContain('interaction-navigation')
    expect(read('components/ui/card.tsx')).toContain('interactive && "interaction-card cursor-pointer"')
    expect(read('components/ui/table.tsx')).toContain('interactive && "interaction-row cursor-pointer"')
  })

  it('does not make static cards or table rows look clickable by default', () => {
    const card = read('components/ui/card.tsx')
    const table = read('components/ui/table.tsx')

    expect(card).toContain('interactive = false')
    expect(table).toContain('interactive = false')
    expect(table).not.toContain('"border-b transition-colors hover:bg-muted/50')
    expect(read('components/workflows/WorkflowTemplateCard.tsx')).not.toContain('hover:shadow-md')
  })

  it('keeps contextual row and card actions available to touch and keyboard users', () => {
    for (const path of [
      'components/ListCard/ListItemRow.tsx',
      'components/VaultCard/VaultItemRow.tsx',
      'pages/workspace/components/ContentCard.tsx',
      'components/ui/toast.tsx',
    ]) {
      expect(read(path), `${path} must use the input-aware reveal treatment`)
        .toContain('interaction-reveal')
    }
  })

  it('keeps neutral rows and menu icon feedback out of page-local hover declarations', () => {
    const source = applicationSource()

    expect(source).not.toContain('hover:bg-muted/50')
    expect(source).not.toContain('group-hover/menu:text-blue')
    expect(source).not.toMatch(/(?<![-:])hover:bg-blue-700/)
    expect(source).not.toMatch(/(?<![-:])hover:bg-destructive\/(?:90|10)/)
    expect(read('components/ui/dropdown-menu.tsx')).toContain('dropdown-menu-item')
  })

  it('keeps representative clickable cards and rows on the explicit interaction contract', () => {
    expect(read('components/activity-timeline/ActivityTimeline.tsx')).toContain('interactive={Boolean(onSelect)}')
    expect(read('pages/contacts/components/ContactCard.tsx')).toContain('<Card\n            interactive')
    expect(read('pages/contacts/components/ContactsTable.tsx')).toContain('<TableRow\n            key={contact.id}\n            interactive')
    expect(read('pages/DashboardPage.tsx')).toContain('<Card surface="inset" interactive')
  })

  it('documents focus parity, stable geometry, and the marketing-motion exception', () => {
    const docs = read('design-system/index.md')

    expect(docs).toContain('### Hover, focus, and touch')
    expect(docs).toContain('Hover confirms an affordance')
    expect(docs).toContain('Do not use hover-only information')
    expect(docs).toContain('public marketing interaction is a separate role')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const read = (path: string) => readFileSync(join(SRC, path), 'utf8')

describe('control primitive contract', () => {
  it('keeps action hierarchy and density in the shared button primitive', () => {
    const button = read('components/ui/button.tsx')

    expect(button).toContain('default: "interaction-button--primary bg-primary')
    expect(button).toContain('destructiveGhost:')
    expect(button).toContain('toggle:')
    expect(button).toContain('aria-pressed:bg-primary/10')
    expect(button).toContain('default: "h-11 px-4 py-2"')
    expect(button).toContain('toolbar: "h-9 rounded-md px-3"')
    expect(button).toContain('compact: "h-8 rounded-md px-2 text-xs"')
  })

  it('keeps fields mobile-safe by default and makes compact density explicit', () => {
    for (const path of ['components/ui/input.tsx', 'components/ui/select.tsx']) {
      const source = read(path)

      expect(source, path).toContain('controlSize?: "default" | "compact"')
      expect(source, path).toContain('controlSize === "default" ? "h-11 text-base" : "h-9 text-sm"')
    }
  })

  it('keeps floating choices on semantic overlay tokens', () => {
    const select = read('components/ui/select.tsx')
    const menu = read('components/ui/dropdown-menu.tsx')

    expect(select).toContain('border-border bg-popover text-popover-foreground')
    expect(menu).toContain('border-border bg-popover p-1 text-popover-foreground')
    expect(menu).toContain('variant?: "default" | "destructive"')
    expect(menu).toContain('data-variant={variant}')
  })

  it('routes representative search experiences through one shared field', () => {
    expect(read('components/ui/search-field.tsx')).toContain('type="search"')
    expect(read('components/ui/search-field.tsx')).toContain('aria-label={label}')
    expect(read('components/layout/DesktopHeaderTools.tsx')).toContain('<SearchField')
    expect(read('components/GlobalSearch.tsx')).toContain('<SearchField')
    expect(read('components/email/EmailTemplateBrowserDialog.tsx')).toContain('<SearchField')
    expect(read('pages/campaigns/CampaignDetailPage.tsx')).toContain('<SearchField')
  })

  it('documents role, density, overlay, and responsive search rules', () => {
    const docs = read('design-system/index.md')

    expect(docs).toContain('### Control primitives')
    expect(docs).toContain('Controls communicate role before color or iconography')
    expect(docs).toContain('Default `Input` and `SelectTrigger` controls are 44px tall')
    expect(docs).toContain('Selects and dropdown menus render on `popover`')
    expect(docs).toContain('`HeaderSearch` progressively renders the full field')
  })
})

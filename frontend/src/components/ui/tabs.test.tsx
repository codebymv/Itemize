import { Settings } from 'lucide-react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconTabsList, IconTabsTrigger, Tabs } from './tabs';

describe('IconTabsTrigger', () => {
  it('mirrors the sidebar hover and selected states', () => {
    render(
      <Tabs defaultValue="settings">
        <IconTabsList>
          <IconTabsTrigger value="settings">
            <Settings aria-hidden="true" />
            Settings
          </IconTabsTrigger>
        </IconTabsList>
      </Tabs>,
    );

    const trigger = screen.getByRole('tab', { name: 'Settings' });
    expect(trigger).toHaveAttribute('data-state', 'active');
    expect(trigger).toHaveClass('icon-tabs-trigger');
    expect(trigger).toHaveClass('hover:bg-sidebar-accent');
    expect(trigger).toHaveClass('data-[state=active]:bg-sidebar-accent');
    expect(trigger).toHaveClass('data-[state=active]:shadow-none');
    const css = readFileSync(join(process.cwd(), 'src/components/ui/tabs.css'), 'utf8');
    expect(css).toContain(".icon-tabs-trigger[data-state='active'] > svg");
    expect(css).toContain('#2563eb');
  });
});

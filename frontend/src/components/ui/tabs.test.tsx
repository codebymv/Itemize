import { Settings } from 'lucide-react';
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
    expect(trigger).toHaveClass('hover:bg-sidebar-accent');
    expect(trigger).toHaveClass('data-[state=active]:bg-sidebar-accent');
    expect(trigger).toHaveClass('data-[state=active]:shadow-none');
    expect(trigger).toHaveClass('hover:[&_svg]:text-blue-600');
    expect(trigger).toHaveClass('data-[state=active]:[&_svg]:text-blue-600');
  });
});

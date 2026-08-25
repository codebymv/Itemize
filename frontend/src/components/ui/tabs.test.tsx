import { Settings } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsList, TabsTrigger } from './tabs';

describe('TabsTrigger', () => {
  it('uses the shared blue icon states for hover and selection', () => {
    render(
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">
            <Settings aria-hidden="true" />
            Settings
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const trigger = screen.getByRole('tab', { name: 'Settings' });
    expect(trigger).toHaveAttribute('data-state', 'active');
    expect(trigger).toHaveClass('hover:[&_svg]:text-blue-600');
    expect(trigger).toHaveClass('data-[state=active]:[&_svg]:text-blue-600');
  });
});

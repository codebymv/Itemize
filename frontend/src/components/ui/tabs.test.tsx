import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconTabsList, IconTabsTrigger, Tabs, TabsList, TabsTrigger } from './tabs';

describe('tab interaction contracts', () => {
  it('uses semantic accent tokens for content-tab hover states', () => {
    render(
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const unreadTab = screen.getByRole('tab', { name: 'Unread' });
    expect(unreadTab).toHaveClass('interaction-control');
    expect(unreadTab).not.toHaveClass('hover:bg-blue-50', 'dark:hover:bg-blue-900/40');

    const activeTab = screen.getByRole('tab', { name: 'All' });
    expect(activeTab).toHaveClass(
      'data-[state=active]:bg-background',
      'data-[state=active]:text-blue-600',
      'dark:data-[state=active]:text-blue-400',
    );
  });

  it('keeps labeled navigation tabs on the sidebar interaction tokens', () => {
    render(
      <Tabs defaultValue="settings">
        <IconTabsList>
          <IconTabsTrigger value="settings">Settings</IconTabsTrigger>
          <IconTabsTrigger value="activity">Activity</IconTabsTrigger>
        </IconTabsList>
      </Tabs>,
    );

    const activityTab = screen.getByRole('tab', { name: 'Activity' });
    expect(activityTab).toHaveClass(
      'interaction-navigation',
      'data-[state=active]:text-sidebar-accent-foreground',
      'dark:data-[state=active]:text-sidebar-accent-foreground',
    );
    expect(activityTab).not.toHaveClass('hover:bg-accent', 'hover:text-accent-foreground');
    expect(activityTab).not.toHaveClass(
      'data-[state=active]:text-blue-600',
      'dark:data-[state=active]:text-blue-400',
    );
  });
});

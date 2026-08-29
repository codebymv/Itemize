import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SettingsNav, SettingsShellNavigation } from './SettingsPage';

describe('SettingsNav', () => {
  it('moves the labeled settings selector into the shell and keeps tab icons', () => {
    render(
      <MemoryRouter initialEntries={['/organization-settings']}>
        <SettingsShellNavigation />
        <SettingsNav />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('combobox', { name: 'Settings section' }),
    ).toHaveTextContent('ORGANIZATION');
    expect(
      screen.getAllByRole('navigation', { name: 'Settings sections' }),
    ).toHaveLength(1);
    expect(
      screen.getByRole('combobox', { name: 'Settings section' }).querySelector(
        '[data-settings-section-icon="Organization"]',
      ),
    ).not.toBeNull();
    expect(screen.queryByText('Settings section')).not.toBeInTheDocument();
  });
});

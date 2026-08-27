import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SettingsNav } from './SettingsPage';

describe('SettingsNav', () => {
  it('keeps the active mobile settings destination labeled', () => {
    render(
      <MemoryRouter initialEntries={['/organization-settings']}>
        <SettingsNav />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('combobox', { name: 'Settings section' }),
    ).toHaveTextContent('Organization');
    expect(
      screen.getAllByRole('navigation', { name: 'Settings sections' }),
    ).toHaveLength(2);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManageAccountCard } from './ManageAccountCard';

vi.mock('./AccountDataExportCard', () => ({
  AccountDataExportAction: () => <div>Export action</div>,
}));
vi.mock('./AccountDeletionCard', () => ({
  AccountDeletionAction: () => <div>Deletion action</div>,
}));

describe('ManageAccountCard', () => {
  it('groups account export and deletion under one card heading', () => {
    render(<ManageAccountCard />);

    expect(screen.getByText('Manage account')).toBeInTheDocument();
    expect(screen.getByText('Export action')).toBeInTheDocument();
    expect(screen.getByText('Deletion action')).toBeInTheDocument();
  });
});

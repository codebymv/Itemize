import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BusinessProfileCard } from './BusinessProfileCard';
import type { Business } from '@/services/invoicesApi';

describe('business profile creation actions', () => {
  it.each([{businesses: []}, {businesses: [{id:1,name:'Existing QA',email:'qa@example.com'} as Business]}])('opens creation without passing a click event as the business', ({businesses}) => {
    const openDialog = vi.fn();
    render(<BusinessProfileCard businesses={businesses} onAddBusiness={openDialog} onEditBusiness={openDialog} onDeleteBusiness={vi.fn()} />);
    fireEvent.click(screen.getByRole('button',{name:/add business/i}));
    expect(openDialog).toHaveBeenCalledExactlyOnceWith();
  });
});

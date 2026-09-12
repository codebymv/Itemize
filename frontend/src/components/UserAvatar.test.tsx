import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UserAvatar } from './UserAvatar';
import { userInitials, avatarImageUrl } from '@/lib/avatars';

describe('UserAvatar', () => {
  it.each([['Bob', 'BO'], [' Brian Jones ', 'BJ'], ['Mary Ann Smith', 'MS'], ['\u00e9loise', '\u00c9L'], ['', '?']])('uses consistent initials for %s', (name, expected) => {
    expect(userInitials(name)).toBe(expected);
  });
  it('uses email only as a fallback and disallows external paths', () => {
    expect(userInitials(null, 'roxas@example.com')).toBe('RO');
    expect(avatarImageUrl('../image')).toBeUndefined();
    expect(avatarImageUrl('https://example.com')).toBeUndefined();
  });
  it('falls back on failed artwork and loads a different selection', () => {
    const { container, rerender } = render(<UserAvatar avatarKey="dawn" name="Bob Jones" />);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('BJ')).toBeInTheDocument();
    rerender(<UserAvatar avatarKey="aurora" name="Bob Jones" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/avatars/aurora.svg');
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

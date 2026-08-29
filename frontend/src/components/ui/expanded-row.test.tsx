import { render, screen } from '@testing-library/react';
import { Send } from 'lucide-react';
import { ExpandedRowActionLabel, ExpandedRowActions } from './expanded-row';

describe('ExpandedRowActions', () => {
  it('keeps the full action name accessible when the visible label is compact or hidden', () => {
    render(
      <ExpandedRowActions>
        <button type="button">
          <Send aria-hidden="true" />
          <ExpandedRowActionLabel full="Send Invoice" compact="Send" />
        </button>
      </ExpandedRowActions>,
    );

    expect(screen.getByRole('button', { name: 'Send Invoice' })).toBeInTheDocument();
    expect(screen.getByText('Send', { selector: '.expanded-row-action-label--compact' })).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});

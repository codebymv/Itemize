import { fireEvent, render, screen } from '@testing-library/react';

import { FormPreviewCanvas } from './FormPreviewCanvas';

describe('FormPreviewCanvas', () => {
  it('renders an interactive, non-submitting form preview', () => {
    render(
      <FormPreviewCanvas
        form={{
          name: 'Contact us',
          description: 'Tell us how we can help.',
          submit_button_text: 'Send request',
          theme: { primaryColor: '#2563eb' },
          fields: [
            {
              id: 1,
              field_type: 'email',
              label: 'Email',
              placeholder: 'you@example.com',
              is_required: true,
              field_order: 0,
              width: 'full',
            },
          ],
        }}
      />,
    );

    const email = screen.getByLabelText(/Email/);
    fireEvent.change(email, { target: { value: 'test@example.com' } });

    expect(email).toHaveValue('test@example.com');
    expect(screen.getByRole('button', { name: 'Send request' })).toHaveAttribute('aria-disabled', 'true');
  });
});

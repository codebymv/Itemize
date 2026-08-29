import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateSMSTemplateModal } from './CreateSMSTemplateModal';

const smsApi = vi.hoisted(() => ({
  createSmsTemplate: vi.fn(),
  getMessageInfo: vi.fn(),
  updateSmsTemplate: vi.fn(),
}));

vi.mock('@/services/smsApi', () => smsApi);
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('CreateSMSTemplateModal', () => {
  it('prefills and updates an existing SMS template', async () => {
    const onUpdated = vi.fn();
    const template = {
      id: 9,
      organization_id: 4,
      name: 'Appointment reminder',
      message: 'Hi {{first_name}}, your appointment is tomorrow.',
      variables: ['first_name'],
      category: 'Scheduling',
      is_active: true,
      created_by: 2,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    };
    smsApi.getMessageInfo.mockResolvedValue({
      length: template.message.length,
      segments: 1,
      encoding: 'GSM',
      charsRemaining: 160 - template.message.length,
    });
    smsApi.updateSmsTemplate.mockResolvedValue({ ...template, name: 'Tomorrow reminder' });

    render(
      <CreateSMSTemplateModal
        organizationId={4}
        template={template}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={onUpdated}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Edit SMS Template' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Template Name/ })).toHaveValue('Appointment reminder');
    expect(screen.getByRole('textbox', { name: /Message Content/ })).toHaveValue(template.message);
    fireEvent.change(screen.getByRole('textbox', { name: /Template Name/ }), {
      target: { value: 'Tomorrow reminder' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template changes' }));

    await waitFor(() => expect(smsApi.updateSmsTemplate).toHaveBeenCalledWith(9, {
      organization_id: 4,
      name: 'Tomorrow reminder',
      message: template.message,
      category: 'Scheduling',
      is_active: true,
    }));
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tomorrow reminder' }));
  });
});

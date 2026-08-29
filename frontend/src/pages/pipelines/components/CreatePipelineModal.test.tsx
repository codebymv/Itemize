import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreatePipelineModal } from './CreatePipelineModal';

const pipelinesApi = vi.hoisted(() => ({
  createPipeline: vi.fn(),
  updatePipeline: vi.fn(),
}));

vi.mock('@/services/pipelinesApi', () => pipelinesApi);
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('CreatePipelineModal', () => {
  it('shows pipeline-name validation inline', async () => {
    render(
      <CreatePipelineModal
        organizationId={42}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create pipeline' }));

    expect(await screen.findByText('Pipeline name is required')).toBeInTheDocument();
    expect(pipelinesApi.createPipeline).not.toHaveBeenCalled();
  });

  it('shows stage-name validation inline while editing', async () => {
    render(
      <CreatePipelineModal
        organizationId={42}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        onUpdated={vi.fn()}
        pipeline={{
          id: 7,
          organization_id: 42,
          name: 'New Business',
          description: '',
          is_default: true,
          stages: [{ id: 'lead', name: 'Lead', order: 0, color: '#3B82F6' }],
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
        }}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Stage 1 name' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save pipeline' }));

    expect(await screen.findByText('Stage name is required')).toBeInTheDocument();
    await waitFor(() => expect(pipelinesApi.updatePipeline).not.toHaveBeenCalled());
  });
});

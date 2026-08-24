import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  let repository: jest.Mocked<OnboardingRepository>;
  let service: OnboardingService;

  beforeEach(() => {
    repository = {
      findProgress: jest.fn(),
      markSeen: jest.fn(),
      dismiss: jest.fn(),
      completeStep: jest.fn(),
      reset: jest.fn(),
    } as unknown as jest.Mocked<OnboardingRepository>;
    service = new OnboardingService(repository);
  });

  it('normalizes legacy JSON into deterministic typed entries', async () => {
    repository.findProgress.mockResolvedValue({
      pages: {
        seen: true,
        timestamp: '2026-07-17T12:00:00.000Z',
        version: '2.0',
        dismissed: false,
        step_completed: 3,
      },
      canvas: { dismissed: true },
    });

    await expect(service.progress(7)).resolves.toEqual([
      {
        featureKey: 'canvas',
        seen: false,
        timestamp: null,
        version: null,
        dismissed: true,
        stepCompleted: null,
      },
      {
        featureKey: 'pages',
        seen: true,
        timestamp: new Date('2026-07-17T12:00:00.000Z'),
        version: '2.0',
        dismissed: false,
        stepCompleted: 3,
      },
    ]);
  });

  it('returns an explicit unseen projection for a missing feature', async () => {
    repository.findProgress.mockResolvedValue({});
    await expect(service.feature(7, ' dashboard ')).resolves.toEqual({
      featureKey: 'dashboard',
      seen: false,
      timestamp: null,
      version: null,
      dismissed: false,
      stepCompleted: null,
    });
  });

  it('normalizes mutation inputs and returns the updated document', async () => {
    repository.markSeen.mockResolvedValue({
      dashboard: {
        seen: true,
        timestamp: '2026-07-17T12:00:00.000Z',
        version: '2.0',
        dismissed: false,
      },
    });
    await service.markSeen(7, { featureKey: ' dashboard ', version: ' 2.0 ' });
    expect(repository.markSeen).toHaveBeenCalledWith(
      7,
      'dashboard',
      '2.0',
      expect.any(String),
    );
  });

  it('rejects malformed keys, versions, steps, and missing users', async () => {
    await expect(service.feature(7, '__proto__')).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
    await expect(
      service.markSeen(7, { featureKey: 'dashboard', version: '12345678901' }),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    await expect(service.completeStep(7, 'dashboard', -1)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });

    repository.findProgress.mockResolvedValue(null);
    await expect(service.progress(999)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });
});

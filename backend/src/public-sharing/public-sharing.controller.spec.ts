import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AccessTokenService } from '../auth/access-token.service';
import { PublicSharingController } from './public-sharing.controller';
import { PublicSharingRepository } from './public-sharing.repository';
import { PublicSharingService } from './public-sharing.service';
import { encryptVaultItemValue } from './vault-item-crypto';

const TOKENS = {
  list: '00000000-0000-4000-8000-000000000011',
  note: '00000000-0000-4000-8000-000000000012',
  whiteboard: '00000000-0000-4000-8000-000000000013',
  wireframe: '00000000-0000-4000-8000-000000000014',
  vault: '00000000-0000-4000-8000-000000000015',
};

const CAPABILITY_HEADERS = {
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
};

describe('PublicSharingController retained HTTP contract', () => {
  let app: INestApplication;
  const repository = {
    sharedList: jest.fn(),
    sharedNote: jest.fn(),
    sharedWhiteboard: jest.fn(),
    sharedWireframe: jest.fn(),
    sharedVault: jest.fn(),
    sharedVaultItems: jest.fn(),
    recordSharedView: jest.fn().mockResolvedValue(undefined),
  };
  const accessTokens = { verify: jest.fn() };

  beforeAll(async () => {
    process.env.VAULT_ENCRYPTION_KEY = 'cd'.repeat(32);
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicSharingController],
      providers: [
        PublicSharingService,
        { provide: PublicSharingRepository, useValue: repository },
        { provide: AccessTokenService, useValue: accessTokens },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.VAULT_ENCRYPTION_KEY;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const timestamps = {
    created_at: new Date('2026-08-01T00:00:00.000Z'),
    updated_at: new Date('2026-08-02T00:00:00.000Z'),
  };
  const serializedTimestamps = {
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
  };

  it('serves a shared list with sanitized content and private headers', async () => {
    repository.sharedList.mockResolvedValue({
      id: 7,
      title: '<b>Shared list</b>',
      category: 'General',
      items: [
        {
          id: 'safe',
          text: '<img src=x onerror="alert(1)">Task<script>alert(2)</script>',
          completed: false,
        },
      ],
      color_value: '#fff',
      ...timestamps,
      creator_name: 'Owner<script>alert(1)</script>',
      organization_id: 31,
      owner_user_id: 5,
    });
    const response = await request(app.getHttpServer())
      .get(`/api/shared/list/${TOKENS.list}`)
      .expect(200);
    expect(response.headers).toMatchObject(CAPABILITY_HEADERS);
    expect(response.body).toEqual({
      id: 7,
      title: '<b>Shared list</b>',
      category: 'General',
      items: [{ id: 'safe', text: expect.stringContaining('Task'), completed: false }],
      color_value: '#fff',
      ...serializedTimestamps,
      creator_name: 'Owner',
      type: 'list',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/<script|onerror/i);
    expect(repository.recordSharedView).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'list',
      id: 7,
      title: '<b>Shared list</b>',
      organizationId: 31,
      ownerUserId: 5,
      viewerUserId: null,
    }));
  });

  it('does not notify an authenticated owner about their own shared view', async () => {
    accessTokens.verify.mockResolvedValue({ userId: 5 });
    repository.sharedNote.mockResolvedValue({
      id: 18,
      title: 'Owner preview',
      content: 'Preview',
      category: null,
      color_value: null,
      ...timestamps,
      creator_name: 'Owner',
      organization_id: 31,
      owner_user_id: 5,
    });

    await request(app.getHttpServer())
      .get(`/api/shared/note/${TOKENS.note}`)
      .set('Cookie', 'itemize_auth=owner-token')
      .expect(200);

    expect(accessTokens.verify).toHaveBeenCalledWith('owner-token');
    expect(repository.recordSharedView).not.toHaveBeenCalled();
  });

  it('serves a shared note with type marker', async () => {
    repository.sharedNote.mockResolvedValue({
      id: 8,
      title: 'Shared note',
      content: '<p>Hello</p><script>alert(1)</script>',
      category: null,
      color_value: null,
      ...timestamps,
      creator_name: 'Owner',
    });
    const response = await request(app.getHttpServer())
      .get(`/api/shared/note/${TOKENS.note}`)
      .expect(200);
    expect(response.body).toMatchObject({
      id: 8,
      content: '<p>Hello</p>',
      type: 'note',
    });
  });

  it('preserves nested whiteboard structure while sanitizing content', async () => {
    repository.sharedWhiteboard.mockResolvedValue({
      id: 9,
      title: 'Shared board',
      category: null,
      canvas_data: {
        nodes: [
          {
            text: '<svg onload="alert(1)">Board</svg>',
            metadata: { label: '<script>x</script>Safe' },
          },
        ],
      },
      canvas_width: 800,
      canvas_height: 600,
      background_color: '#fff',
      color_value: null,
      ...timestamps,
      creator_name: 'Owner',
    });
    const response = await request(app.getHttpServer())
      .get(`/api/shared/whiteboard/${TOKENS.whiteboard}`)
      .expect(200);
    expect(Array.isArray(response.body.canvas_data.nodes)).toBe(true);
    expect(response.body.canvas_data.nodes[0].metadata.label).toBe('Safe');
    expect(response.body.type).toBe('whiteboard');
    expect(JSON.stringify(response.body)).not.toMatch(/onload|<script/i);
  });

  it('serves a shared wireframe with flow data', async () => {
    repository.sharedWireframe.mockResolvedValue({
      id: 10,
      title: '<b>Shared wireframe</b>',
      category: null,
      flow_data: { nodes: [], edges: [] },
      width: 1024,
      height: 768,
      color_value: null,
      ...timestamps,
      creator_name: 'Owner',
    });
    const response = await request(app.getHttpServer())
      .get(`/api/shared/wireframe/${TOKENS.wireframe}`)
      .expect(200);
    expect(response.body).toMatchObject({
      id: 10,
      flow_data: { nodes: [], edges: [] },
      type: 'wireframe',
    });
  });

  it.each(['list', 'note', 'whiteboard', 'wireframe'] as const)(
    'rejects a malformed %s token as not found without touching the database',
    async (kind) => {
      const response = await request(app.getHttpServer())
        .get(`/api/shared/${kind}/not-a-token`)
        .expect(404);
      expect(response.headers).toMatchObject(CAPABILITY_HEADERS);
      expect(response.body).toEqual({
        error: 'Shared content not found or no longer available',
      });
      expect(repository.sharedList).not.toHaveBeenCalled();
      expect(repository.sharedNote).not.toHaveBeenCalled();
      expect(repository.sharedWhiteboard).not.toHaveBeenCalled();
      expect(repository.sharedWireframe).not.toHaveBeenCalled();
    },
  );

  it('reports an unknown capability token as not found', async () => {
    repository.sharedList.mockResolvedValue(null);
    const response = await request(app.getHttpServer())
      .get(`/api/shared/list/${TOKENS.list}`)
      .expect(404);
    expect(response.body).toEqual({
      error: 'Shared content not found or no longer available',
    });
  });

  it('maps unexpected read failures to the retained 500 envelope', async () => {
    repository.sharedNote.mockRejectedValue(new Error('boom'));
    const response = await request(app.getHttpServer())
      .get(`/api/shared/note/${TOKENS.note}`)
      .expect(500);
    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Internal server error while fetching shared content',
        code: 'ERROR',
      },
    });
  });

  it('maps whiteboard database timeouts to the retained 503 message', async () => {
    repository.sharedWhiteboard.mockRejectedValue(
      new Error('Query read timeout exceeded'),
    );
    const response = await request(app.getHttpServer())
      .get(`/api/shared/whiteboard/${TOKENS.whiteboard}`)
      .expect(503);
    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Database temporarily unavailable. Please try again in a moment.',
        code: 'ERROR',
      },
    });
  });

  it('maps whiteboard connection refusal to the retained 503 message', async () => {
    repository.sharedWhiteboard.mockRejectedValue(
      Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' }),
    );
    const response = await request(app.getHttpServer())
      .get(`/api/shared/whiteboard/${TOKENS.whiteboard}`)
      .expect(503);
    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Database connection failed. Please try again later.',
        code: 'ERROR',
      },
    });
  });

  it('serves an unlocked v1 vault with decrypted items in the success envelope', async () => {
    const secret = encryptVaultItemValue('hunter2');
    repository.sharedVault.mockResolvedValue({
      id: 11,
      title: 'Shared vault',
      category: null,
      color_value: null,
      is_locked: false,
      crypto_version: 1,
      share_snapshot_ciphertext: null,
      share_snapshot_iv: null,
      ...timestamps,
    });
    repository.sharedVaultItems.mockResolvedValue([
      {
        id: 21,
        item_type: 'key_value',
        label: 'Password',
        encrypted_value: secret.encrypted,
        iv: secret.iv,
        order_index: 0,
        ...timestamps,
      },
    ]);
    const response = await request(app.getHttpServer())
      .get(`/api/shared/vault/${TOKENS.vault}`)
      .expect(200);
    expect(response.headers).toMatchObject(CAPABILITY_HEADERS);
    expect(response.body).toEqual({
      success: true,
      data: {
        id: 11,
        title: 'Shared vault',
        category: null,
        color_value: null,
        ...serializedTimestamps,
        crypto_version: 1,
        snapshot: null,
        items: [
          {
            id: 21,
            item_type: 'key_value',
            label: 'Password',
            value: 'hunter2',
            order_index: 0,
          },
        ],
        is_shared: true,
      },
    });
  });

  it('serves a v2 vault as an encrypted snapshot without decrypting items', async () => {
    repository.sharedVault.mockResolvedValue({
      id: 12,
      title: 'Snapshot vault',
      category: null,
      color_value: null,
      is_locked: true,
      crypto_version: 2,
      share_snapshot_ciphertext: 'ciphertext',
      share_snapshot_iv: 'iv',
      ...timestamps,
    });
    const response = await request(app.getHttpServer())
      .get(`/api/shared/vault/${TOKENS.vault}`)
      .expect(200);
    expect(response.body.data).toMatchObject({
      crypto_version: 2,
      snapshot: { ciphertext: 'ciphertext', iv: 'iv' },
      items: [],
    });
    expect(repository.sharedVaultItems).not.toHaveBeenCalled();
  });

  it('fails a v2 vault closed when its snapshot is missing', async () => {
    repository.sharedVault.mockResolvedValue({
      id: 12,
      title: 'Snapshot vault',
      category: null,
      color_value: null,
      is_locked: false,
      crypto_version: 2,
      share_snapshot_ciphertext: null,
      share_snapshot_iv: null,
      ...timestamps,
    });
    const response = await request(app.getHttpServer())
      .get(`/api/shared/vault/${TOKENS.vault}`)
      .expect(500);
    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Shared vault is temporarily unavailable',
        code: 'ERROR',
      },
    });
  });

  it('denies public reads of a locked v1 vault', async () => {
    repository.sharedVault.mockResolvedValue({
      id: 13,
      title: 'Locked vault',
      category: null,
      color_value: null,
      is_locked: true,
      crypto_version: 1,
      share_snapshot_ciphertext: null,
      share_snapshot_iv: null,
      ...timestamps,
    });
    const response = await request(app.getHttpServer())
      .get(`/api/shared/vault/${TOKENS.vault}`)
      .expect(403);
    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'This vault is locked and cannot be viewed publicly',
        code: 'FORBIDDEN',
      },
    });
  });

  it('fails the complete vault response closed when one item cannot decrypt', async () => {
    repository.sharedVault.mockResolvedValue({
      id: 14,
      title: 'Shared vault',
      category: null,
      color_value: null,
      is_locked: false,
      crypto_version: 1,
      share_snapshot_ciphertext: null,
      share_snapshot_iv: null,
      ...timestamps,
    });
    repository.sharedVaultItems.mockResolvedValue([
      {
        id: 22,
        item_type: 'key_value',
        label: 'Broken secret',
        encrypted_value: 'invalid',
        iv: 'invalid',
        order_index: 0,
        ...timestamps,
      },
    ]);
    const response = await request(app.getHttpServer())
      .get(`/api/shared/vault/${TOKENS.vault}`)
      .expect(500);
    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Shared vault is temporarily unavailable',
        code: 'ERROR',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('Broken secret');
  });

  it('rejects a malformed vault token with the vault not-found envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/shared/vault/not-a-token')
      .expect(404);
    expect(response.headers).toMatchObject(CAPABILITY_HEADERS);
    expect(response.body).toEqual({
      success: false,
      error: { message: 'Shared vault not found', code: 'NOT_FOUND' },
    });
    expect(repository.sharedVault).not.toHaveBeenCalled();
  });
});

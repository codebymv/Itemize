import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  PublicSharingRepository,
  SharedVaultRow,
} from './public-sharing.repository';
import { sanitizeSharedContent } from './shared-content-sanitizer';
import { decryptVaultItemValue } from './vault-item-crypto';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SHARED_CONTENT_NOT_FOUND = {
  error: 'Shared content not found or no longer available',
};

const sharedContentFailure = (message: string, status = 500): HttpException => {
  const body = { success: false, error: { message, code: 'ERROR' } };
  return status === 503
    ? new ServiceUnavailableException(body)
    : new InternalServerErrorException(body);
};

@Injectable()
export class PublicSharingService {
  private readonly logger = new Logger(PublicSharingService.name);

  constructor(private readonly repository: PublicSharingRepository) {}

  async sharedList(token: string) {
    this.assertShareToken(token);
    const list = await this.guardSharedContent(
      'list',
      () => this.repository.sharedList(token),
    );
    if (!list) throw new NotFoundException(SHARED_CONTENT_NOT_FOUND);
    return {
      id: list.id,
      title: sanitizeSharedContent(list.title),
      category: sanitizeSharedContent(list.category),
      items: list.items
        ? list.items.map((item) => ({
            id: item.id,
            text: sanitizeSharedContent(item.text),
            completed: item.completed,
          }))
        : [],
      color_value: list.color_value,
      created_at: list.created_at,
      updated_at: list.updated_at,
      creator_name: sanitizeSharedContent(list.creator_name),
      type: 'list',
    };
  }

  async sharedNote(token: string) {
    this.assertShareToken(token);
    const note = await this.guardSharedContent(
      'note',
      () => this.repository.sharedNote(token),
    );
    if (!note) throw new NotFoundException(SHARED_CONTENT_NOT_FOUND);
    return {
      id: note.id,
      title: sanitizeSharedContent(note.title),
      content: sanitizeSharedContent(note.content),
      category: sanitizeSharedContent(note.category),
      color_value: note.color_value,
      created_at: note.created_at,
      updated_at: note.updated_at,
      creator_name: sanitizeSharedContent(note.creator_name),
      type: 'note',
    };
  }

  async sharedWhiteboard(token: string) {
    this.assertShareToken(token);
    const whiteboard = await this.guardSharedContent(
      'whiteboard',
      () => this.repository.sharedWhiteboard(token),
      { databaseAvailabilityErrors: true },
    );
    if (!whiteboard) throw new NotFoundException(SHARED_CONTENT_NOT_FOUND);
    return {
      id: whiteboard.id,
      title: sanitizeSharedContent(whiteboard.title),
      category: sanitizeSharedContent(whiteboard.category),
      canvas_data: sanitizeSharedContent(whiteboard.canvas_data),
      canvas_width: whiteboard.canvas_width,
      canvas_height: whiteboard.canvas_height,
      background_color: whiteboard.background_color,
      color_value: whiteboard.color_value,
      created_at: whiteboard.created_at,
      updated_at: whiteboard.updated_at,
      creator_name: sanitizeSharedContent(whiteboard.creator_name),
      type: 'whiteboard',
    };
  }

  async sharedWireframe(token: string) {
    this.assertShareToken(token);
    const wireframe = await this.guardSharedContent(
      'wireframe',
      () => this.repository.sharedWireframe(token),
    );
    if (!wireframe) throw new NotFoundException(SHARED_CONTENT_NOT_FOUND);
    return {
      id: wireframe.id,
      title: sanitizeSharedContent(wireframe.title),
      category: sanitizeSharedContent(wireframe.category),
      flow_data: sanitizeSharedContent(wireframe.flow_data),
      width: wireframe.width,
      height: wireframe.height,
      color_value: wireframe.color_value,
      created_at: wireframe.created_at,
      updated_at: wireframe.updated_at,
      creator_name: sanitizeSharedContent(wireframe.creator_name),
      type: 'wireframe',
    };
  }

  async sharedVault(token: string) {
    if (!UUID_PATTERN.test(token)) {
      throw this.vaultNotFound();
    }
    let vault: SharedVaultRow | null;
    try {
      vault = await this.repository.sharedVault(
        token,
        crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
      );
    } catch (error) {
      this.logger.error(
        `Error fetching shared vault: ${(error as Error).message}`,
      );
      throw sharedContentFailure('Internal server error');
    }
    if (!vault) throw this.vaultNotFound();

    if (Number(vault.crypto_version) >= 2) {
      if (!vault.share_snapshot_ciphertext || !vault.share_snapshot_iv) {
        throw this.vaultUnavailable();
      }
      return this.presentVault(vault, 2, {
        snapshot: {
          ciphertext: vault.share_snapshot_ciphertext,
          iv: vault.share_snapshot_iv,
        },
        items: [],
      });
    }

    if (vault.is_locked) {
      throw new ForbiddenException({
        success: false,
        error: {
          message: 'This vault is locked and cannot be viewed publicly',
          code: 'FORBIDDEN',
        },
      });
    }

    let itemRows;
    try {
      itemRows = await this.repository.sharedVaultItems(vault.id);
    } catch (error) {
      this.logger.error(
        `Error fetching shared vault: ${(error as Error).message}`,
      );
      throw sharedContentFailure('Internal server error');
    }
    const items = [];
    for (const item of itemRows) {
      try {
        items.push({
          id: item.id,
          item_type: item.item_type,
          label: item.label,
          value: decryptVaultItemValue(item.encrypted_value, item.iv),
          order_index: item.order_index,
        });
      } catch {
        this.logger.error(
          `Error decrypting shared vault item ${item.id}`,
        );
        throw this.vaultUnavailable();
      }
    }
    return this.presentVault(vault, 1, { snapshot: null, items });
  }

  private presentVault(
    vault: SharedVaultRow,
    cryptoVersion: number,
    content: { snapshot: { ciphertext: string; iv: string } | null; items: unknown[] },
  ) {
    return {
      success: true,
      data: {
        id: vault.id,
        title: vault.title,
        category: vault.category,
        color_value: vault.color_value,
        created_at: vault.created_at,
        updated_at: vault.updated_at,
        crypto_version: cryptoVersion,
        snapshot: content.snapshot,
        items: content.items,
        is_shared: true,
      },
    };
  }

  private async guardSharedContent<T>(
    kind: string,
    read: () => Promise<T>,
    options: { databaseAvailabilityErrors?: boolean } = {},
  ): Promise<T> {
    try {
      return await read();
    } catch (error) {
      const failure = error as { message?: string; code?: string };
      this.logger.error(
        `Error fetching shared ${kind}: ${failure.message ?? 'unknown error'}`,
      );
      if (options.databaseAvailabilityErrors) {
        if (failure.message?.includes('timeout')) {
          throw sharedContentFailure(
            'Database temporarily unavailable. Please try again in a moment.',
            503,
          );
        }
        if (failure.code === 'ECONNREFUSED') {
          throw sharedContentFailure(
            'Database connection failed. Please try again later.',
            503,
          );
        }
      }
      throw sharedContentFailure(
        'Internal server error while fetching shared content',
      );
    }
  }

  private assertShareToken(token: string): void {
    if (!UUID_PATTERN.test(token)) {
      throw new NotFoundException(SHARED_CONTENT_NOT_FOUND);
    }
  }

  private vaultNotFound(): NotFoundException {
    return new NotFoundException({
      success: false,
      error: { message: 'Shared vault not found', code: 'NOT_FOUND' },
    });
  }

  private vaultUnavailable(): HttpException {
    return sharedContentFailure('Shared vault is temporarily unavailable');
  }
}

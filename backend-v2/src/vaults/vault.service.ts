import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateWorkspaceVaultItemInput,
  CreateWorkspaceVaultInput,
  UpdateWorkspaceVaultItemInput,
  UpdateWorkspaceVaultInput,
  WorkspaceVaultFilterInput,
} from './vault.inputs';
import {
  decryptVaultValue,
  encryptVaultValue,
  generateVaultSalt,
} from './vault.crypto';
import {
  UpdateVaultValue,
  VaultAggregate,
  VaultItemRow,
  VaultRepository,
  VaultRow,
} from './vault.repository';
import {
  DeleteWorkspaceVaultResult,
  DeleteWorkspaceVaultItemResult,
  WorkspaceVault,
  WorkspaceVaultItem,
  WorkspaceVaultItemsResult,
  WorkspaceVaultPage,
} from './vault.types';

@Injectable()
export class VaultService {
  constructor(private readonly vaults: VaultRepository) {}

  async list(
    userId: number,
    filter?: WorkspaceVaultFilterInput,
    page?: PageInput,
  ): Promise<WorkspaceVaultPage> {
    const normalized = this.page(page);
    const result = await this.vaults.list(
      userId,
      filter?.category
        ? this.text(filter.category, 'category', 255)
        : undefined,
      filter?.search ? this.text(filter.search, 'search', 200) : undefined,
      normalized.page,
      normalized.pageSize,
    );
    return {
      nodes: result.rows.map((row) => this.map(row, [], false)),
      pageInfo: pageInfo(normalized.page, normalized.pageSize, result.total),
    };
  }

  async get(
    userId: number,
    vaultId: number,
    masterPassword?: string,
  ): Promise<WorkspaceVault> {
    this.id(vaultId);
    const aggregate = await this.vaults.find(userId, vaultId);
    if (!aggregate) throw this.notFound();
    const locked =
      aggregate.vault.is_locked &&
      Boolean(aggregate.vault.master_password_hash);
    if (locked && !masterPassword) {
      return this.map(aggregate.vault, [], true);
    }
    if (
      locked &&
      !(await bcrypt.compare(
        this.password(masterPassword as string),
        aggregate.vault.master_password_hash as string,
      ))
    ) {
      throw itemizeGraphqlError('Invalid master password', 'UNAUTHENTICATED', {
        reason: 'INVALID_MASTER_PASSWORD',
      });
    }
    return this.mapAggregate(aggregate);
  }

  async create(
    userId: number,
    input: CreateWorkspaceVaultInput,
  ): Promise<WorkspaceVault> {
    const masterPassword = input.masterPassword
      ? this.password(input.masterPassword)
      : undefined;
    const row = await this.vaults.create(userId, {
      title: this.text(input.title ?? 'Untitled Vault', 'title', 255),
      category: this.text(input.category ?? 'General', 'category', 255),
      colorValue: this.color(input.colorValue ?? '#3B82F6'),
      positionX: this.coordinate(input.positionX, 'positionX'),
      positionY: this.coordinate(input.positionY, 'positionY'),
      width: this.dimension(input.width ?? 400, 'width'),
      height: this.dimension(input.height ?? 300, 'height'),
      zIndex: this.integer(input.zIndex ?? 0, 'zIndex'),
      isLocked: Boolean(masterPassword),
      encryptionSalt: masterPassword ? generateVaultSalt() : null,
      masterPasswordHash: masterPassword
        ? await bcrypt.hash(masterPassword, 12)
        : null,
    });
    return this.map(row, [], false);
  }

  async update(
    userId: number,
    vaultId: number,
    input: UpdateWorkspaceVaultInput,
  ): Promise<WorkspaceVault> {
    this.id(vaultId);
    for (const key of Object.keys(input) as Array<keyof UpdateWorkspaceVaultInput>) {
      if (input[key] === null) {
        throw itemizeGraphqlError(`${key} cannot be null`, 'BAD_USER_INPUT', {
          field: key,
        });
      }
    }
    const value: UpdateVaultValue = {
      ...(input.title !== undefined
        ? { title: this.text(input.title as string, 'title', 255) }
        : {}),
      ...(input.category !== undefined
        ? { category: this.text(input.category as string, 'category', 255) }
        : {}),
      ...(input.colorValue !== undefined
        ? { colorValue: this.color(input.colorValue as string) }
        : {}),
      ...(input.positionX !== undefined
        ? { positionX: this.coordinate(input.positionX as number, 'positionX') }
        : {}),
      ...(input.positionY !== undefined
        ? { positionY: this.coordinate(input.positionY as number, 'positionY') }
        : {}),
      ...(input.width !== undefined
        ? { width: this.dimension(input.width as number, 'width') }
        : {}),
      ...(input.height !== undefined
        ? { height: this.dimension(input.height as number, 'height') }
        : {}),
      ...(input.zIndex !== undefined
        ? { zIndex: this.integer(input.zIndex as number, 'zIndex') }
        : {}),
    };
    const row = await this.vaults.update(userId, vaultId, value);
    if (!row) throw this.notFound();
    return this.map(row, [], false);
  }

  async delete(
    userId: number,
    vaultId: number,
  ): Promise<DeleteWorkspaceVaultResult> {
    this.id(vaultId);
    if (!(await this.vaults.delete(userId, vaultId))) throw this.notFound();
    return { deletedId: vaultId };
  }

  async addItem(
    userId: number,
    vaultId: number,
    input: CreateWorkspaceVaultItemInput,
  ): Promise<WorkspaceVaultItem> {
    this.id(vaultId);
    const value = this.itemInput(input);
    const encrypted = encryptVaultValue(value.value);
    const row = await this.vaults.addItem(userId, vaultId, {
      itemType: value.itemType,
      label: value.label,
      encryptedValue: encrypted.encrypted,
      iv: encrypted.iv,
    });
    if (!row) throw this.notFound();
    return this.mapItem(row, value.value);
  }

  async addItems(
    userId: number,
    vaultId: number,
    inputs: CreateWorkspaceVaultItemInput[],
  ): Promise<WorkspaceVaultItemsResult> {
    this.id(vaultId);
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 500) {
      throw itemizeGraphqlError(
        'items must contain between 1 and 500 entries',
        'BAD_USER_INPUT',
        { field: 'items' },
      );
    }
    const values = inputs.map((input) => this.itemInput(input));
    const encrypted = values.map((value) => ({
      ...value,
      ...encryptVaultValue(value.value),
    }));
    const rows = await this.vaults.addItems(
      userId,
      vaultId,
      encrypted.map((value) => ({
        itemType: value.itemType,
        label: value.label,
        encryptedValue: value.encrypted,
        iv: value.iv,
      })),
    );
    if (!rows) throw this.notFound();
    return {
      items: rows.map((row, index) =>
        this.mapItem(row, encrypted[index].value),
      ),
      count: rows.length,
    };
  }

  async updateItem(
    userId: number,
    vaultId: number,
    itemId: number,
    input: UpdateWorkspaceVaultItemInput,
  ): Promise<WorkspaceVaultItem> {
    this.id(vaultId);
    this.id(itemId);
    if (input.label === null || input.value === null) {
      throw itemizeGraphqlError(
        'label and value cannot be null',
        'BAD_USER_INPUT',
      );
    }
    if (input.label === undefined && input.value === undefined) {
      throw itemizeGraphqlError(
        'At least one item field is required',
        'BAD_USER_INPUT',
      );
    }
    const label =
      input.label === undefined
        ? undefined
        : this.text(input.label, 'label', 255);
    const plaintext =
      input.value === undefined
        ? undefined
        : this.itemValue(input.value);
    const encrypted =
      plaintext === undefined ? undefined : encryptVaultValue(plaintext);
    const result = await this.vaults.updateItem(userId, vaultId, itemId, {
      ...(label !== undefined ? { label } : {}),
      ...(encrypted
        ? { encryptedValue: encrypted.encrypted, iv: encrypted.iv }
        : {}),
    });
    if (result === 'vault-not-found') throw this.notFound();
    if (result === 'item-not-found') throw this.itemNotFound();
    let value = plaintext;
    if (value === undefined) {
      try {
        value = decryptVaultValue(result.encrypted_value, result.iv);
      } catch {
        throw itemizeGraphqlError(
          'Vault item could not be decrypted',
          'INTERNAL_SERVER_ERROR',
          { reason: 'VAULT_DECRYPTION_FAILED' },
        );
      }
    }
    return this.mapItem(result, value);
  }

  async deleteItem(
    userId: number,
    vaultId: number,
    itemId: number,
  ): Promise<DeleteWorkspaceVaultItemResult> {
    this.id(vaultId);
    this.id(itemId);
    const result = await this.vaults.deleteItem(userId, vaultId, itemId);
    if (result === 'vault-not-found') throw this.notFound();
    if (result === 'item-not-found') throw this.itemNotFound();
    return { deletedId: itemId };
  }

  async reorderItems(
    userId: number,
    vaultId: number,
    itemIds: number[],
  ): Promise<WorkspaceVaultItemsResult> {
    this.id(vaultId);
    if (
      itemIds.length > 500 ||
      new Set(itemIds).size !== itemIds.length
    ) {
      throw itemizeGraphqlError(
        'itemIds must contain at most 500 unique IDs',
        'BAD_USER_INPUT',
        { field: 'itemIds' },
      );
    }
    itemIds.forEach((id) => this.id(id));
    const result = await this.vaults.reorderItems(userId, vaultId, itemIds);
    if (result === 'vault-not-found') throw this.notFound();
    if (result === 'item-set-mismatch') {
      throw itemizeGraphqlError(
        'itemIds must exactly match the vault items',
        'BAD_USER_INPUT',
        { field: 'itemIds', reason: 'ITEM_SET_MISMATCH' },
      );
    }
    return {
      items: result.map((row) => {
        try {
          return this.mapItem(
            row,
            decryptVaultValue(row.encrypted_value, row.iv),
          );
        } catch {
          throw itemizeGraphqlError(
            'Vault item could not be decrypted',
            'INTERNAL_SERVER_ERROR',
            { reason: 'VAULT_DECRYPTION_FAILED' },
          );
        }
      }),
      count: result.length,
    };
  }

  private mapAggregate(value: VaultAggregate): WorkspaceVault {
    const items = value.items.map((item) => {
      let decrypted = '[DECRYPTION_ERROR]';
      try {
        decrypted = decryptVaultValue(item.encrypted_value, item.iv);
      } catch {
        // Preserve legacy fail-soft rendering without exposing ciphertext.
      }
      return this.mapItem(item, decrypted);
    });
    return this.map(value.vault, items, false);
  }

  private mapItem(row: VaultItemRow, value: string): WorkspaceVaultItem {
    return {
      id: row.id,
      vaultId: row.vault_id,
      itemType: row.item_type,
      label: row.label,
      value,
      orderIndex: row.order_index,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private itemInput(input: CreateWorkspaceVaultItemInput): {
    itemType: string;
    label: string;
    value: string;
  } {
    if (!['key_value', 'secure_note'].includes(input.itemType)) {
      throw itemizeGraphqlError('Unsupported vault item type', 'BAD_USER_INPUT', {
        field: 'itemType',
      });
    }
    return {
      itemType: input.itemType,
      label: this.text(input.label, 'label', 255),
      value: this.itemValue(input.value),
    };
  }

  private itemValue(value: string): string {
    if (
      typeof value !== 'string' ||
      Buffer.byteLength(value, 'utf8') > 1_048_576
    ) {
      throw itemizeGraphqlError(
        'value cannot exceed 1 MiB',
        'BAD_USER_INPUT',
        { field: 'value' },
      );
    }
    return value;
  }

  private map(
    row: VaultRow,
    items: WorkspaceVault['items'],
    requiresUnlock: boolean,
  ): WorkspaceVault {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      category: row.category,
      colorValue: row.color_value,
      positionX: Number(row.position_x),
      positionY: Number(row.position_y),
      width: row.width,
      height: row.height,
      zIndex: row.z_index,
      isLocked: row.is_locked,
      encryptionSalt: row.is_locked ? row.encryption_salt : null,
      itemCount: Number(row.item_count ?? items.length),
      items,
      requiresUnlock,
      shareToken: row.share_token,
      isPublic: row.is_public,
      sharedAt: row.shared_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private text(value: string, field: string, max: number): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > max) {
      throw itemizeGraphqlError(
        `${field} must contain between 1 and ${max} characters`,
        'BAD_USER_INPUT',
        { field },
      );
    }
    return normalized;
  }

  private color(value: string): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      throw itemizeGraphqlError(
        'colorValue must be a six-digit hexadecimal color',
        'BAD_USER_INPUT',
        { field: 'colorValue' },
      );
    }
    return value;
  }

  private coordinate(value: number, field: string): number {
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field,
      });
    }
    return value;
  }

  private dimension(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 1 || value > 10_000) {
      throw itemizeGraphqlError(
        `${field} must be an integer between 1 and 10000`,
        'BAD_USER_INPUT',
        { field },
      );
    }
    return value;
  }

  private integer(value: number, field: string): number {
    if (!Number.isSafeInteger(value)) {
      throw itemizeGraphqlError(`${field} must be an integer`, 'BAD_USER_INPUT', {
        field,
      });
    }
    return value;
  }

  private password(value: string): string {
    if (value.length < 8 || Buffer.byteLength(value, 'utf8') > 72) {
      throw itemizeGraphqlError(
        'masterPassword must contain at least 8 characters and at most 72 UTF-8 bytes',
        'BAD_USER_INPUT',
        { field: 'masterPassword' },
      );
    }
    return value;
  }

  private id(value: number): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw itemizeGraphqlError('id must be a positive integer', 'BAD_USER_INPUT', {
        field: 'id',
      });
    }
    return value;
  }

  private page(input?: PageInput): { page: number; pageSize: number } {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 50;
    if (!Number.isInteger(page) || page < 1) {
      throw itemizeGraphqlError('page must be at least 1', 'BAD_USER_INPUT');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw itemizeGraphqlError(
        'pageSize must be between 1 and 100',
        'BAD_USER_INPUT',
      );
    }
    return { page, pageSize };
  }

  private notFound() {
    return itemizeGraphqlError('Vault not found', 'NOT_FOUND');
  }

  private itemNotFound() {
    return itemizeGraphqlError('Vault item not found', 'NOT_FOUND');
  }
}

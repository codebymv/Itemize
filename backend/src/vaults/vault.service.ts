import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateWorkspaceVaultItemInput,
  CreateWorkspaceVaultInput,
  MigrateWorkspaceVaultToV2Input,
  RewrapWorkspaceVaultInput,
  UpdateWorkspaceVaultItemInput,
  UpdateWorkspaceVaultInput,
  WorkspaceVaultFilterInput,
} from './vault.inputs';
import {
  decryptVaultValue,
  encryptVaultValue,
  generateVaultSalt,
  hashShareToken,
} from './vault.crypto';
import { VaultUnlockRateLimitService } from './vault-unlock-rate-limit.service';
import {
  EnableVaultSharingResult,
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
  WorkspaceVaultPasswordResult,
  WorkspaceVaultSharingResult,
  WorkspaceVaultPage,
} from './vault.types';

@Injectable()
export class VaultService {
  constructor(
    private readonly vaults: VaultRepository,
    private readonly unlockAttempts: VaultUnlockRateLimitService,
  ) {}

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
    if (this.isV2(aggregate.vault)) {
      return this.map(
        aggregate.vault,
        aggregate.items.map((item) => this.mapItem(item)),
        false,
      );
    }
    const locked = aggregate.vault.is_locked;
    if (locked && !aggregate.vault.master_password_hash) {
      throw this.invalidLockState();
    }
    if (locked && !masterPassword) {
      return this.map(aggregate.vault, [], true);
    }
    if (locked) {
      await this.verifyMasterPassword(
        userId,
        vaultId,
        aggregate.vault.master_password_hash as string,
        masterPassword as string,
      );
    }
    return this.mapAggregate(aggregate);
  }

  async create(
    userId: number,
    input: CreateWorkspaceVaultInput,
  ): Promise<WorkspaceVault> {
    const v2 = input.cryptoVersion === 2;
    if (v2 && input.masterPassword) {
      throw itemizeGraphqlError(
        'Zero-knowledge vaults do not send a master password to the server',
        'BAD_USER_INPUT',
        { field: 'masterPassword' },
      );
    }
    const masterPassword = !v2 && input.masterPassword
      ? this.password(input.masterPassword)
      : undefined;
    const kdf = v2 ? this.kdfInput(input) : null;
    const row = await this.vaults.create(userId, {
      title: this.text(input.title ?? 'Untitled Vault', 'title', 255),
      category: this.text(input.category ?? 'General', 'category', 255),
      colorValue: this.color(input.colorValue ?? '#3B82F6'),
      positionX: this.coordinate(input.positionX, 'positionX'),
      positionY: this.coordinate(input.positionY, 'positionY'),
      width: this.dimension(input.width ?? 400, 'width'),
      height: this.dimension(input.height ?? 300, 'height'),
      zIndex: this.integer(input.zIndex ?? 0, 'zIndex'),
      isLocked: v2 || Boolean(masterPassword),
      encryptionSalt: v2 ? kdf!.salt : masterPassword ? generateVaultSalt() : null,
      masterPasswordHash: masterPassword
        ? await bcrypt.hash(masterPassword, 12)
        : null,
      cryptoVersion: v2 ? 2 : 1,
      kdfAlgorithm: v2 ? 'argon2id' : null,
      kdfMemoryKiB: v2 ? kdf!.memoryKiB : null,
      kdfIterations: v2 ? kdf!.iterations : null,
      kdfParallelism: v2 ? kdf!.parallelism : null,
      wrappedVek: v2 ? this.wrappedKey(input.wrappedVek, 'wrappedVek') : null,
      wrappedVekRecovery: v2
        ? input.wrappedVekRecovery
          ? this.wrappedKey(input.wrappedVekRecovery, 'wrappedVekRecovery')
          : null
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

  async setPassword(
    userId: number,
    vaultId: number,
    newPassword: string,
    currentPassword?: string,
  ): Promise<WorkspaceVaultPasswordResult> {
    this.id(vaultId);
    const aggregate = await this.vaults.find(userId, vaultId);
    if (!aggregate) throw this.notFound();
    if (this.isV2(aggregate.vault)) {
      throw itemizeGraphqlError(
        'Zero-knowledge vaults rewrap the vault key on the client',
        'BAD_USER_INPUT',
        { reason: 'VAULT_ZKE_REWRAP_REQUIRED' },
      );
    }
    const normalizedNewPassword = this.password(newPassword);
    const normalizedCurrentPassword =
      currentPassword === undefined
        ? undefined
        : this.passwordCandidate(currentPassword);
    const result = await this.vaults.setPassword(
      userId,
      vaultId,
      await bcrypt.hash(normalizedNewPassword, 12),
      generateVaultSalt(),
      normalizedCurrentPassword,
      bcrypt.compare,
    );
    if (result === 'vault-not-found') throw this.notFound();
    if (result === 'current-password-required') {
      throw itemizeGraphqlError(
        'Current password is required',
        'BAD_USER_INPUT',
        { reason: 'CURRENT_PASSWORD_REQUIRED', field: 'currentPassword' },
      );
    }
    if (result === 'invalid-password') throw this.invalidMasterPassword();
    if (result === 'invalid-lock-state') throw this.invalidLockState();
    return {
      vaultId: result.id,
      isLocked: result.is_locked,
      encryptionSalt: result.encryption_salt,
    };
  }

  async removePassword(
    userId: number,
    vaultId: number,
    password: string,
  ): Promise<WorkspaceVaultPasswordResult> {
    this.id(vaultId);
    const aggregate = await this.vaults.find(userId, vaultId);
    if (!aggregate) throw this.notFound();
    if (this.isV2(aggregate.vault)) {
      throw itemizeGraphqlError(
        'Zero-knowledge vaults cannot remove the vault password',
        'BAD_USER_INPUT',
        { reason: 'VAULT_ZKE_PASSWORD_REQUIRED' },
      );
    }
    const result = await this.vaults.removePassword(
      userId,
      vaultId,
      this.passwordCandidate(password),
      bcrypt.compare,
    );
    if (result === 'vault-not-found') throw this.notFound();
    if (result === 'vault-not-locked') {
      throw itemizeGraphqlError('Vault is not locked', 'BAD_USER_INPUT', {
        reason: 'VAULT_NOT_LOCKED',
      });
    }
    if (result === 'invalid-password') throw this.invalidMasterPassword();
    if (result === 'invalid-lock-state') throw this.invalidLockState();
    return {
      vaultId: result.id,
      isLocked: result.is_locked,
      encryptionSalt: result.encryption_salt,
    };
  }

  async enableSharing(
    userId: number,
    vaultId: number,
    confirmDecryptedSharing: boolean,
    snapshot?: { ciphertext?: string; iv?: string },
  ): Promise<WorkspaceVaultSharingResult> {
    this.id(vaultId);
    if (confirmDecryptedSharing !== true) {
      throw itemizeGraphqlError(
        'Confirm that anyone with the full link can view the vault snapshot',
        'BAD_USER_INPUT',
        { reason: 'DECRYPTED_SHARING_CONFIRMATION_REQUIRED' },
      );
    }
    const aggregate = await this.vaults.find(userId, vaultId);
    if (!aggregate) throw this.notFound();
    const v2 = this.isV2(aggregate.vault);
    const snapshotCiphertext = snapshot?.ciphertext
      ? this.blob(snapshot.ciphertext, 'snapshotCiphertext')
      : undefined;
    const snapshotIv = snapshot?.iv
      ? this.blob(snapshot.iv, 'snapshotIv')
      : undefined;
    if (v2 && (!snapshotCiphertext || !snapshotIv) && !aggregate.vault.is_public) {
      throw itemizeGraphqlError(
        'Zero-knowledge sharing requires an encrypted snapshot',
        'BAD_USER_INPUT',
        { reason: 'SNAPSHOT_REQUIRED' },
      );
    }
    let result: EnableVaultSharingResult | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const shareToken = randomUUID();
        result = await this.vaults.enableSharing(userId, vaultId, shareToken, {
          shareTokenHash: hashShareToken(shareToken),
          snapshotCiphertext,
          snapshotIv,
        });
        break;
      } catch (error) {
        if ((error as { code?: string })?.code !== '23505' || attempt === 2) {
          throw error;
        }
      }
    }
    if (!result || result === 'vault-not-found') throw this.notFound();
    if (result === 'vault-locked') {
      throw itemizeGraphqlError(
        'Locked vaults cannot be shared',
        'BAD_USER_INPUT',
        { reason: 'VAULT_LOCKED' },
      );
    }
    if (result === 'snapshot-required') {
      throw itemizeGraphqlError(
        'Zero-knowledge sharing requires an encrypted snapshot',
        'BAD_USER_INPUT',
        { reason: 'SNAPSHOT_REQUIRED' },
      );
    }
    if (!result.share_token || !result.is_public || !result.shared_at) {
      throw itemizeGraphqlError(
        'Vault sharing transition did not commit',
        'INTERNAL_SERVER_ERROR',
        { reason: 'INVALID_VAULT_SHARING_STATE' },
      );
    }
    const frontendUrl = (
      process.env.FRONTEND_URL || 'https://itemize.cloud'
    ).replace(/\/+$/, '');
    return {
      vaultId: result.id,
      shareToken: result.share_token,
      shareUrl: `${frontendUrl}/shared/vault/${result.share_token}`,
      isPublic: result.is_public,
      sharedAt: result.shared_at,
    };
  }

  async disableSharing(
    userId: number,
    vaultId: number,
  ): Promise<WorkspaceVaultSharingResult> {
    this.id(vaultId);
    const result = await this.vaults.disableSharing(userId, vaultId);
    if (!result) throw this.notFound();
    return {
      vaultId: result.id,
      shareToken: null,
      shareUrl: null,
      isPublic: false,
      sharedAt: null,
    };
  }

  async addItem(
    userId: number,
    vaultId: number,
    input: CreateWorkspaceVaultItemInput,
    masterPassword?: string,
  ): Promise<WorkspaceVaultItem> {
    this.id(vaultId);
    await this.requireUnlockedWrite(userId, vaultId, masterPassword);
    const aggregate = await this.vaults.find(userId, vaultId);
    if (!aggregate) throw this.notFound();
    const stored = this.isV2(aggregate.vault)
      ? this.v2ItemWrite(input)
      : this.v1ItemWrite(input);
    const row = await this.vaults.addItem(userId, vaultId, stored.row);
    if (!row) throw this.notFound();
    return stored.plaintext
      ? this.mapItem(row, stored.plaintext)
      : this.mapItem(row);
  }

  async addItems(
    userId: number,
    vaultId: number,
    inputs: CreateWorkspaceVaultItemInput[],
    masterPassword?: string,
  ): Promise<WorkspaceVaultItemsResult> {
    this.id(vaultId);
    await this.requireUnlockedWrite(userId, vaultId, masterPassword);
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 500) {
      throw itemizeGraphqlError(
        'items must contain between 1 and 500 entries',
        'BAD_USER_INPUT',
        { field: 'items' },
      );
    }
    const aggregate = await this.vaults.find(userId, vaultId);
    if (!aggregate) throw this.notFound();
    const v2 = this.isV2(aggregate.vault);
    const stored = inputs.map((input) =>
      v2 ? this.v2ItemWrite(input) : this.v1ItemWrite(input),
    );
    const rows = await this.vaults.addItems(
      userId,
      vaultId,
      stored.map((value) => value.row),
    );
    if (!rows) throw this.notFound();
    return {
      items: rows.map((row, index) =>
        stored[index].plaintext
          ? this.mapItem(row, stored[index].plaintext)
          : this.mapItem(row),
      ),
      count: rows.length,
    };
  }

  async updateItem(
    userId: number,
    vaultId: number,
    itemId: number,
    input: UpdateWorkspaceVaultItemInput,
    masterPassword?: string,
  ): Promise<WorkspaceVaultItem> {
    this.id(vaultId);
    this.id(itemId);
    await this.requireUnlockedWrite(userId, vaultId, masterPassword);
    const aggregate = await this.vaults.find(userId, vaultId);
    if (!aggregate) throw this.notFound();
    if (this.isV2(aggregate.vault)) {
      if (!input.ciphertext || !input.iv) {
        throw itemizeGraphqlError(
          'ciphertext and iv are required',
          'BAD_USER_INPUT',
        );
      }
      const result = await this.vaults.updateItem(userId, vaultId, itemId, {
        label: '',
        encryptedValue: this.blob(input.ciphertext, 'ciphertext'),
        iv: this.blob(input.iv, 'iv'),
      });
      if (result === 'vault-not-found') throw this.notFound();
      if (result === 'item-not-found') throw this.itemNotFound();
      return this.mapItem(result);
    }
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
    masterPassword?: string,
  ): Promise<DeleteWorkspaceVaultItemResult> {
    this.id(vaultId);
    this.id(itemId);
    await this.requireUnlockedWrite(userId, vaultId, masterPassword);
    const result = await this.vaults.deleteItem(userId, vaultId, itemId);
    if (result === 'vault-not-found') throw this.notFound();
    if (result === 'item-not-found') throw this.itemNotFound();
    return { deletedId: itemId };
  }

  async reorderItems(
    userId: number,
    vaultId: number,
    itemIds: number[],
    masterPassword?: string,
  ): Promise<WorkspaceVaultItemsResult> {
    this.id(vaultId);
    await this.requireUnlockedWrite(userId, vaultId, masterPassword);
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
    const aggregate = await this.vaults.find(userId, vaultId);
    const v2 = aggregate ? this.isV2(aggregate.vault) : false;
    return {
      items: result.map((row) => {
        if (v2 || Number(row.crypto_version ?? 1) >= 2) {
          return this.mapItem(row);
        }
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

  async migrateToV2(
    userId: number,
    vaultId: number,
    input: MigrateWorkspaceVaultToV2Input,
    currentPassword?: string,
  ): Promise<WorkspaceVault> {
    this.id(vaultId);
    const aggregate = await this.vaults.find(userId, vaultId);
    if (!aggregate) throw this.notFound();
    if (this.isV2(aggregate.vault)) {
      throw itemizeGraphqlError(
        'Vault is already enrolled',
        'BAD_USER_INPUT',
        { reason: 'VAULT_ALREADY_ENROLLED' },
      );
    }
    if (aggregate.vault.is_locked) {
      if (!aggregate.vault.master_password_hash) throw this.invalidLockState();
      if (!currentPassword) {
        throw itemizeGraphqlError(
          'Current password is required',
          'BAD_USER_INPUT',
          { reason: 'CURRENT_PASSWORD_REQUIRED', field: 'currentPassword' },
        );
      }
      await this.verifyMasterPassword(
        userId,
        vaultId,
        aggregate.vault.master_password_hash,
        currentPassword,
      );
    }
    const kdf = this.kdfInput({
      kdfSalt: input.kdfSalt,
      kdfMemoryKiB: input.kdfMemoryKiB,
      kdfIterations: input.kdfIterations,
      kdfParallelism: input.kdfParallelism,
    });
    const items = input.items.map((item) => ({
      id: this.id(item.id),
      ciphertext: this.blob(item.ciphertext, 'ciphertext'),
      iv: this.blob(item.iv, 'iv'),
    }));
    const result = await this.vaults.enrollV2(userId, vaultId, {
      encryptionSalt: kdf.salt,
      kdfMemoryKiB: kdf.memoryKiB,
      kdfIterations: kdf.iterations,
      kdfParallelism: kdf.parallelism,
      wrappedVek: this.wrappedKey(input.wrappedVek, 'wrappedVek'),
      wrappedVekRecovery: input.wrappedVekRecovery
        ? this.wrappedKey(input.wrappedVekRecovery, 'wrappedVekRecovery')
        : null,
      items,
    });
    if (result === 'vault-not-found') throw this.notFound();
    if (result === 'already-enrolled') {
      throw itemizeGraphqlError(
        'Vault is already enrolled',
        'BAD_USER_INPUT',
        { reason: 'VAULT_ALREADY_ENROLLED' },
      );
    }
    if (result === 'item-set-mismatch') {
      throw itemizeGraphqlError(
        'Migrated items must exactly match the vault items',
        'BAD_USER_INPUT',
        { reason: 'ITEM_SET_MISMATCH' },
      );
    }
    return this.map(
      result.vault,
      result.items.map((item) => this.mapItem(item)),
      false,
    );
  }

  async rewrap(
    userId: number,
    vaultId: number,
    input: RewrapWorkspaceVaultInput,
  ): Promise<WorkspaceVaultPasswordResult> {
    this.id(vaultId);
    const result = await this.vaults.rewrapV2(
      userId,
      vaultId,
      this.wrappedKey(input.wrappedVek, 'wrappedVek'),
      input.wrappedVekRecovery
        ? this.wrappedKey(input.wrappedVekRecovery, 'wrappedVekRecovery')
        : null,
    );
    if (result === 'vault-not-found') throw this.notFound();
    if (result === 'not-enrolled') {
      throw itemizeGraphqlError(
        'Vault is not a zero-knowledge vault',
        'BAD_USER_INPUT',
        { reason: 'VAULT_NOT_ENROLLED' },
      );
    }
    return {
      vaultId: result.id,
      isLocked: result.is_locked,
      encryptionSalt: result.encryption_salt,
    };
  }

  private async requireUnlockedWrite(
    userId: number,
    vaultId: number,
    masterPassword?: string,
  ): Promise<void> {
    const aggregate = await this.vaults.find(userId, vaultId);
    if (!aggregate) throw this.notFound();
    if (this.isV2(aggregate.vault)) return;
    if (!aggregate.vault.is_locked) return;
    if (!aggregate.vault.master_password_hash) throw this.invalidLockState();
    if (!masterPassword) {
      throw itemizeGraphqlError(
        'Master password is required to change a locked vault',
        'UNAUTHENTICATED',
        { reason: 'VAULT_LOCKED' },
      );
    }
    await this.verifyMasterPassword(
      userId,
      vaultId,
      aggregate.vault.master_password_hash,
      masterPassword,
    );
  }

  private async verifyMasterPassword(
    userId: number,
    vaultId: number,
    passwordHash: string,
    masterPassword: string,
  ): Promise<void> {
    this.unlockAttempts.consume(userId, vaultId);
    if (!(await bcrypt.compare(this.passwordCandidate(masterPassword), passwordHash))) {
      throw this.invalidMasterPassword();
    }
    this.unlockAttempts.reset(userId, vaultId);
  }

  private mapAggregate(value: VaultAggregate): WorkspaceVault {
    const items = value.items.map((item) => {
      if (Number(item.crypto_version ?? 1) >= 2) {
        return this.mapItem(item);
      }
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

  private mapItem(row: VaultItemRow, value?: string): WorkspaceVaultItem {
    const cryptoVersion = Number(row.crypto_version ?? 1);
    if (cryptoVersion >= 2 || value === undefined) {
      return {
        id: row.id,
        vaultId: row.vault_id,
        itemType: row.item_type,
        label: cryptoVersion >= 2 ? '' : row.label,
        value: cryptoVersion >= 2 ? '' : (value ?? ''),
        ciphertext: row.encrypted_value,
        iv: row.iv,
        cryptoVersion,
        orderIndex: row.order_index,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
    return {
      id: row.id,
      vaultId: row.vault_id,
      itemType: row.item_type,
      label: row.label,
      value,
      ciphertext: null,
      iv: null,
      cryptoVersion,
      orderIndex: row.order_index,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private v1ItemWrite(input: CreateWorkspaceVaultItemInput): {
    row: {
      itemType: string;
      label: string;
      encryptedValue: string;
      iv: string;
      cryptoVersion: number;
    };
    plaintext: string;
  } {
    const value = this.itemInput(input);
    const encrypted = encryptVaultValue(value.value);
    return {
      row: {
        itemType: value.itemType,
        label: value.label,
        encryptedValue: encrypted.encrypted,
        iv: encrypted.iv,
        cryptoVersion: 1,
      },
      plaintext: value.value,
    };
  }

  private v2ItemWrite(input: CreateWorkspaceVaultItemInput): {
    row: {
      itemType: string;
      label: string;
      encryptedValue: string;
      iv: string;
      cryptoVersion: number;
    };
    plaintext?: string;
  } {
    if (!['key_value', 'secure_note'].includes(input.itemType)) {
      throw itemizeGraphqlError('Unsupported vault item type', 'BAD_USER_INPUT', {
        field: 'itemType',
      });
    }
    if (!input.ciphertext || !input.iv) {
      throw itemizeGraphqlError(
        'ciphertext and iv are required',
        'BAD_USER_INPUT',
      );
    }
    return {
      row: {
        itemType: input.itemType,
        label: '',
        encryptedValue: this.blob(input.ciphertext, 'ciphertext'),
        iv: this.blob(input.iv, 'iv'),
        cryptoVersion: 2,
      },
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
    if (input.label == null || input.value == null) {
      throw itemizeGraphqlError(
        'label and value are required',
        'BAD_USER_INPUT',
      );
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
      cryptoVersion: Number(row.crypto_version ?? 1),
      kdf: this.mapKdf(row),
      wrappedVek: row.wrapped_vek ?? null,
      wrappedVekRecovery: row.wrapped_vek_recovery ?? null,
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

  private isV2(row: VaultRow): boolean {
    return Number(row.crypto_version ?? 1) >= 2;
  }

  private mapKdf(row: VaultRow) {
    if (!this.isV2(row) || !row.encryption_salt) return null;
    return {
      algorithm: row.kdf_algorithm ?? 'argon2id',
      salt: row.encryption_salt,
      memoryKiB: Number(row.kdf_memory_kib ?? 65536),
      iterations: Number(row.kdf_iterations ?? 3),
      parallelism: Number(row.kdf_parallelism ?? 1),
    };
  }

  private kdfInput(input: {
    kdfSalt?: string;
    kdfMemoryKiB?: number;
    kdfIterations?: number;
    kdfParallelism?: number;
  }): {
    salt: string;
    memoryKiB: number;
    iterations: number;
    parallelism: number;
  } {
    if (!input.kdfSalt) {
      throw itemizeGraphqlError('kdfSalt is required', 'BAD_USER_INPUT', {
        field: 'kdfSalt',
      });
    }
    const memoryKiB = this.integer(input.kdfMemoryKiB ?? 0, 'kdfMemoryKiB');
    const iterations = this.integer(input.kdfIterations ?? 0, 'kdfIterations');
    const parallelism = this.integer(
      input.kdfParallelism ?? 0,
      'kdfParallelism',
    );
    if (memoryKiB < 8 || memoryKiB > 1_048_576) {
      throw itemizeGraphqlError(
        'kdfMemoryKiB is out of range',
        'BAD_USER_INPUT',
        { field: 'kdfMemoryKiB' },
      );
    }
    if (iterations < 1 || iterations > 16) {
      throw itemizeGraphqlError(
        'kdfIterations is out of range',
        'BAD_USER_INPUT',
        { field: 'kdfIterations' },
      );
    }
    if (parallelism < 1 || parallelism > 4) {
      throw itemizeGraphqlError(
        'kdfParallelism is out of range',
        'BAD_USER_INPUT',
        { field: 'kdfParallelism' },
      );
    }
    return {
      salt: this.blob(input.kdfSalt, 'kdfSalt'),
      memoryKiB,
      iterations,
      parallelism,
    };
  }

  private wrappedKey(value: string | undefined, field: string): string {
    if (!value || !value.includes('.')) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field,
      });
    }
    return this.blob(value, field);
  }

  private blob(value: string, field: string): string {
    if (typeof value !== 'string' || value.length < 8 || value.length > 2_000_000) {
      throw itemizeGraphqlError(`${field} is invalid`, 'BAD_USER_INPUT', {
        field,
      });
    }
    return value;
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

  private passwordCandidate(value: string): string {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 72) {
      throw this.invalidMasterPassword();
    }
    return value;
  }

  private invalidMasterPassword() {
    return itemizeGraphqlError(
      'Invalid master password',
      'UNAUTHENTICATED',
      { reason: 'INVALID_MASTER_PASSWORD' },
    );
  }

  private invalidLockState() {
    return itemizeGraphqlError(
      'Vault lock configuration is invalid',
      'INTERNAL_SERVER_ERROR',
      { reason: 'INVALID_VAULT_LOCK_STATE' },
    );
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

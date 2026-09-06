import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { itemizeGraphqlError } from '../common/graphql-error';
import { PageInput, pageInfo } from '../common/pagination';
import {
  CreateWorkspaceFrameInput,
  UpdateWorkspaceFrameInput,
} from './workspace-frames.inputs';
import {
  UpdateWorkspaceFrameValues,
  WorkspaceFrameRow,
  WorkspaceFrameValues,
  WorkspaceFramesRepository,
} from './workspace-frames.repository';
import { WorkspaceFrame, WorkspaceFramePage } from './workspace-frames.types';

const MAX_TITLE_LENGTH = 200;
const MIN_FRAME_DIMENSION = 200;
const MAX_FRAME_DIMENSION = 10_000;
const MAX_PAGE_SIZE = 100;
const DEFAULT_TITLE = 'Untitled frame';
const DEFAULT_COLOR = '#3B82F6';
const DEFAULT_SIZE = { width: 1400, height: 900 };
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MUTATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class WorkspaceFramesService {
  constructor(private readonly repository: WorkspaceFramesRepository) {}

  async frames(userId: number, page: PageInput = new PageInput()): Promise<WorkspaceFramePage> {
    const current = Number.isSafeInteger(page.page) && page.page > 0 ? page.page : 1;
    const pageSize = Number.isSafeInteger(page.pageSize) && page.pageSize > 0
      ? Math.min(page.pageSize, MAX_PAGE_SIZE)
      : 50;
    try {
      const result = await this.repository.findFrames(userId, pageSize, (current - 1) * pageSize);
      return {
        nodes: result.rows.map((row) => this.map(row)),
        pageInfo: pageInfo(current, pageSize, result.total),
      };
    } catch (error) {
      this.rethrow(error);
    }
  }

  async createFrame(userId: number, input: CreateWorkspaceFrameInput): Promise<WorkspaceFrame> {
    const values: WorkspaceFrameValues = {
      title: input.title === undefined || input.title === null ? DEFAULT_TITLE : this.title(input.title),
      colorValue: input.colorValue === undefined || input.colorValue === null
        ? DEFAULT_COLOR
        : this.color(input.colorValue),
      positionX: input.positionX === undefined || input.positionX === null
        ? 0
        : this.coordinate(input.positionX, 'positionX'),
      positionY: input.positionY === undefined || input.positionY === null
        ? 0
        : this.coordinate(input.positionY, 'positionY'),
      width: input.width === undefined || input.width === null
        ? DEFAULT_SIZE.width
        : this.dimension(input.width, 'width'),
      height: input.height === undefined || input.height === null
        ? DEFAULT_SIZE.height
        : this.dimension(input.height, 'height'),
      contactId: this.contactId(input.contactId),
    };
    const idempotencyKey = this.uuid(input.idempotencyKey, 'idempotencyKey', 'INVALID_IDEMPOTENCY_KEY');
    try {
      const outcome = await this.repository.createFrame(
        userId,
        values,
        idempotencyKey,
        createHash('sha256').update(JSON.stringify({ entityType: 'frame', values })).digest('hex'),
      );
      if (outcome.kind === 'idempotency_conflict') {
        throw itemizeGraphqlError(
          'idempotencyKey was already used for different workspace content',
          'CONFLICT',
          { field: 'idempotencyKey', reason: 'IDEMPOTENCY_KEY_REUSED' },
        );
      }
      if (outcome.kind === 'contact_not_found') throw this.contactNotFound();
      if (outcome.kind !== 'completed') {
        throw itemizeGraphqlError('Workspace frame could not be created', 'SERVICE_UNAVAILABLE');
      }
      return this.map(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async updateFrame(
    userId: number,
    frameId: number,
    input: UpdateWorkspaceFrameInput,
  ): Promise<WorkspaceFrame> {
    this.frameId(frameId);
    const values: Partial<WorkspaceFrameValues> = {};
    if (input.title !== undefined && input.title !== null) values.title = this.title(input.title);
    if (input.colorValue !== undefined && input.colorValue !== null) {
      values.colorValue = this.color(input.colorValue);
    }
    if (input.positionX !== undefined && input.positionX !== null) {
      values.positionX = this.coordinate(input.positionX, 'positionX');
    }
    if (input.positionY !== undefined && input.positionY !== null) {
      values.positionY = this.coordinate(input.positionY, 'positionY');
    }
    if (input.width !== undefined && input.width !== null) values.width = this.dimension(input.width, 'width');
    if (input.height !== undefined && input.height !== null) {
      values.height = this.dimension(input.height, 'height');
    }
    // `contactId: null` is a real change (unlink); undefined leaves the binding alone.
    if (input.contactId !== undefined) values.contactId = this.contactId(input.contactId);
    if (Object.keys(values).length === 0) {
      throw itemizeGraphqlError(
        'Workspace frame update must include at least one field',
        'BAD_USER_INPUT',
        { reason: 'EMPTY_FRAME_UPDATE' },
      );
    }
    const update: UpdateWorkspaceFrameValues = {
      ...values,
      mutationId: this.uuid(input.mutationId, 'mutationId', 'INVALID_MUTATION_ID'),
      expectedUpdatedAt: this.expectedUpdatedAt(input.expectedUpdatedAt),
    };
    try {
      const outcome = await this.repository.updateFrame(userId, frameId, update);
      if (outcome.kind === 'not_found') throw this.notFound();
      if (outcome.kind === 'contact_not_found') throw this.contactNotFound();
      if (outcome.kind === 'conflict') {
        throw itemizeGraphqlError(
          'Workspace frame changed since it was loaded',
          'CONFLICT',
          {
            reason: 'STALE_FRAME_REVISION',
            currentUpdatedAt: outcome.currentUpdatedAt.toISOString(),
          },
        );
      }
      return this.map(outcome.row);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async deleteFrame(userId: number, frameId: number, mutationId: string): Promise<number> {
    this.frameId(frameId);
    this.uuid(mutationId, 'mutationId', 'INVALID_MUTATION_ID');
    try {
      const outcome = await this.repository.deleteFrame(userId, frameId);
      if (outcome.kind === 'not_found') throw this.notFound();
      return outcome.deletedId;
    } catch (error) {
      this.rethrow(error);
    }
  }

  private map(row: WorkspaceFrameRow): WorkspaceFrame {
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      title: row.title,
      colorValue: row.color_value,
      positionX: Number(row.position_x),
      positionY: Number(row.position_y),
      width: Number(row.width),
      height: Number(row.height),
      zIndex: Number(row.z_index),
      contactId: row.contact_id === null ? null : Number(row.contact_id),
      contactName: row.contact_name ?? null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private title(value: string): string {
    const title = value.trim();
    if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
      throw itemizeGraphqlError(
        `title must be between 1 and ${MAX_TITLE_LENGTH} characters`,
        'BAD_USER_INPUT',
        { field: 'title', reason: 'INVALID_FRAME_TITLE' },
      );
    }
    return title;
  }

  private color(value: string): string {
    const color = value.trim();
    if (!COLOR_PATTERN.test(color)) {
      throw itemizeGraphqlError(
        'colorValue must be a #RRGGBB color',
        'BAD_USER_INPUT',
        { field: 'colorValue', reason: 'INVALID_FRAME_COLOR' },
      );
    }
    return color.toUpperCase();
  }

  private coordinate(value: number, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw itemizeGraphqlError(
        `${field} must be a finite number`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_FRAME_GEOMETRY' },
      );
    }
    return value;
  }

  private dimension(value: number, field: string): number {
    if (
      typeof value !== 'number'
      || !Number.isFinite(value)
      || value < MIN_FRAME_DIMENSION
      || value > MAX_FRAME_DIMENSION
    ) {
      throw itemizeGraphqlError(
        `${field} must be between ${MIN_FRAME_DIMENSION} and ${MAX_FRAME_DIMENSION}`,
        'BAD_USER_INPUT',
        { field, reason: 'INVALID_FRAME_GEOMETRY' },
      );
    }
    return value;
  }

  private contactId(value: number | null | undefined): number | null {
    if (value === undefined || value === null) return null;
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'contactId must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'contactId', reason: 'INVALID_CONTACT_ID' },
      );
    }
    return value;
  }

  private frameId(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'Workspace frame ID must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'id', reason: 'INVALID_FRAME_ID' },
      );
    }
  }

  private uuid(value: string, field: string, reason: string): string {
    const key = value?.trim();
    if (!MUTATION_ID_PATTERN.test(key)) {
      throw itemizeGraphqlError(`${field} must be a UUID`, 'BAD_USER_INPUT', { field, reason });
    }
    return key.toLowerCase();
  }

  private expectedUpdatedAt(value: Date): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
      throw itemizeGraphqlError(
        'expectedUpdatedAt must be a valid timestamp',
        'BAD_USER_INPUT',
        { field: 'expectedUpdatedAt', reason: 'INVALID_FRAME_REVISION' },
      );
    }
    return date;
  }

  private notFound(): GraphQLError {
    return itemizeGraphqlError('Workspace frame not found', 'NOT_FOUND', {
      reason: 'FRAME_NOT_FOUND',
    });
  }

  /** Same concealment as card bindings: an unreachable contact reads as absent. */
  private contactNotFound(): GraphQLError {
    return itemizeGraphqlError('Contact not found', 'NOT_FOUND', {
      field: 'contactId',
      reason: 'CONTACT_NOT_FOUND',
    });
  }

  private rethrow(error: unknown): never {
    if (error instanceof GraphQLError) throw error;
    throw itemizeGraphqlError('Workspace frame service is unavailable', 'SERVICE_UNAVAILABLE');
  }
}

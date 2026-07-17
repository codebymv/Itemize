import { registerEnumType } from '@nestjs/graphql';

export enum ContactSource {
  API = 'api',
  FORM = 'form',
  IMPORT = 'import',
  INTEGRATION = 'integration',
  MANUAL = 'manual',
}

export enum ContactStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  INACTIVE = 'inactive',
}

export enum ContactSortField {
  COMPANY = 'company',
  CREATED_AT = 'created_at',
  EMAIL = 'email',
  FIRST_NAME = 'first_name',
  LAST_NAME = 'last_name',
  UPDATED_AT = 'updated_at',
}

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum ContactBulkTagsMode {
  ADD = 'add',
  REMOVE = 'remove',
  SET = 'set',
}

export enum ContactActivityType {
  CALL = 'call',
  DEAL_UPDATE = 'deal_update',
  EMAIL = 'email',
  MEETING = 'meeting',
  NOTE = 'note',
  SMS = 'sms',
  STATUS_CHANGE = 'status_change',
  SYSTEM = 'system',
  TASK = 'task',
}

export enum ContactProfileSectionStatus {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
}

registerEnumType(ContactSource, { name: 'ContactSource' });
registerEnumType(ContactStatus, { name: 'ContactStatus' });
registerEnumType(ContactSortField, { name: 'ContactSortField' });
registerEnumType(SortDirection, { name: 'SortDirection' });
registerEnumType(ContactBulkTagsMode, { name: 'ContactBulkTagsMode' });
registerEnumType(ContactActivityType, { name: 'ContactActivityType' });
registerEnumType(ContactProfileSectionStatus, {
  name: 'ContactProfileSectionStatus',
});

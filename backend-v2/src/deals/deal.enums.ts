import { registerEnumType } from '@nestjs/graphql';

export enum DealStatus {
  LOST = 'lost',
  OPEN = 'open',
  WON = 'won',
}

export enum DealSortField {
  CREATED_AT = 'created_at',
  EXPECTED_CLOSE_DATE = 'expected_close_date',
  TITLE = 'title',
  UPDATED_AT = 'updated_at',
  VALUE = 'value',
}

export enum DealSortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

registerEnumType(DealStatus, { name: 'DealStatus' });
registerEnumType(DealSortField, { name: 'DealSortField' });
registerEnumType(DealSortDirection, { name: 'DealSortDirection' });

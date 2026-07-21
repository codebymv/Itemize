import { registerEnumType } from '@nestjs/graphql';

export enum ContactAnalyticsPeriod {
  DAYS_7 = 'DAYS_7',
  DAYS_30 = 'DAYS_30',
  MONTHS_6 = 'MONTHS_6',
  MONTHS_12 = 'MONTHS_12',
}

export enum DealAnalyticsPeriod {
  DAYS_30 = 'DAYS_30',
  MONTHS_6 = 'MONTHS_6',
  MONTHS_12 = 'MONTHS_12',
}

export enum CommunicationAnalyticsPeriod {
  DAYS_7 = 'DAYS_7',
  DAYS_30 = 'DAYS_30',
  DAYS_90 = 'DAYS_90',
}

registerEnumType(ContactAnalyticsPeriod, { name: 'ContactAnalyticsPeriod' });
registerEnumType(DealAnalyticsPeriod, { name: 'DealAnalyticsPeriod' });
registerEnumType(CommunicationAnalyticsPeriod, { name: 'CommunicationAnalyticsPeriod' });

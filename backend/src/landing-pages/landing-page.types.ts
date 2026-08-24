import {
  Field,
  Float,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-scalars';
import { PageInfo } from '../common/pagination';

@ObjectType()
export class LandingPageSection {
  @Field(() => Int) id: number;
  @Field(() => Int) pageId: number;
  @Field(() => Int) organizationId: number;
  @Field() sectionType: string;
  @Field(() => String, { nullable: true }) name: string | null;
  @Field(() => GraphQLJSON) content: Record<string, unknown>;
  @Field(() => GraphQLJSON) settings: Record<string, unknown>;
  @Field(() => Int) sectionOrder: number;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class LandingPage {
  @Field(() => Int) id: number;
  @Field(() => Int) organizationId: number;
  @Field() name: string;
  @Field(() => String, { nullable: true }) description: string | null;
  @Field() slug: string;
  @Field() status: string;
  @Field(() => String, { nullable: true }) seoTitle: string | null;
  @Field(() => String, { nullable: true }) seoDescription: string | null;
  @Field(() => String, { nullable: true }) seoKeywords: string | null;
  @Field(() => String, { nullable: true }) ogImage: string | null;
  @Field(() => String, { nullable: true }) faviconUrl: string | null;
  @Field(() => GraphQLJSON) theme: Record<string, unknown>;
  @Field(() => String, { nullable: true }) customCss: string | null;
  @Field(() => String, { nullable: true }) customJs: string | null;
  @Field(() => String, { nullable: true }) customHead: string | null;
  @Field(() => GraphQLJSON) settings: Record<string, unknown>;
  @Field() passwordProtected: boolean;
  @Field(() => Int, { nullable: true }) currentVersionId: number | null;
  @Field(() => Int) viewCount: number;
  @Field(() => Int) uniqueVisitors: number;
  @Field(() => GraphQLISODateTime, { nullable: true }) publishedAt: Date | null;
  @Field(() => Int, { nullable: true }) createdBy: number | null;
  @Field(() => String, { nullable: true }) createdByName: string | null;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
  @Field(() => Int) sectionCount: number;
  @Field(() => [LandingPageSection]) sections: LandingPageSection[];
}

@ObjectType()
export class LandingPagePage {
  @Field(() => [LandingPage]) nodes: LandingPage[];
  @Field(() => PageInfo) pageInfo: PageInfo;
}

@ObjectType()
export class LandingPageSectionsResult {
  @Field(() => [LandingPageSection]) sections: LandingPageSection[];
}

@ObjectType()
export class DeleteLandingPageResult {
  @Field(() => Int) deletedId: number;
}

@ObjectType()
export class DeleteLandingPageSectionResult {
  @Field(() => Int) deletedId: number;
}

@ObjectType()
export class LandingPagePasswordResult {
  @Field(() => Int) pageId: number;
  @Field() passwordProtected: boolean;
}

@ObjectType()
export class LandingPageAnalyticsOverall {
  @Field(() => Int) totalViews: number;
  @Field(() => Int) uniqueVisitors: number;
  @Field(() => Float) averageTimeOnPage: number;
  @Field(() => Float) averageScrollDepth: number;
  @Field(() => Int) conversions: number;
}

@ObjectType()
export class LandingPageAnalyticsDay {
  @Field() date: Date;
  @Field(() => Int) views: number;
  @Field(() => Int) uniqueVisitors: number;
}

@ObjectType()
export class LandingPageAnalyticsDevice {
  @Field(() => String, { nullable: true }) deviceType: string | null;
  @Field(() => Int) count: number;
}

@ObjectType()
export class LandingPageAnalyticsReferrer {
  @Field() referrer: string;
  @Field(() => Int) count: number;
}

@ObjectType()
export class LandingPageAnalyticsUtmSource {
  @Field() utmSource: string;
  @Field(() => String, { nullable: true }) utmMedium: string | null;
  @Field(() => String, { nullable: true }) utmCampaign: string | null;
  @Field(() => Int) count: number;
}

@ObjectType()
export class LandingPageAnalytics {
  @Field(() => Int) period: number;
  @Field(() => LandingPageAnalyticsOverall) overall: LandingPageAnalyticsOverall;
  @Field(() => [LandingPageAnalyticsDay]) viewsOverTime: LandingPageAnalyticsDay[];
  @Field(() => [LandingPageAnalyticsDevice]) devices: LandingPageAnalyticsDevice[];
  @Field(() => [LandingPageAnalyticsReferrer]) referrers: LandingPageAnalyticsReferrer[];
  @Field(() => [LandingPageAnalyticsUtmSource]) utmSources: LandingPageAnalyticsUtmSource[];
}

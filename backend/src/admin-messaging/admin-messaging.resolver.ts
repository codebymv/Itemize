import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AdminAccessGuard } from '../admin-operations/admin-access.guard';
import { CsrfProtected } from '../common/metadata';
import {
  AdminEmailLogFilterInput, AdminEmailPreviewInput, AdminEmailTemplateFilterInput,
} from './admin-messaging.inputs';
import { AdminMessagingService } from './admin-messaging.service';
import {
  AdminEmailLog, AdminEmailLogPage, AdminEmailPreview,
  AdminEmailTemplatePage,
} from './admin-messaging.types';

@UseGuards(AdminAccessGuard)
@Resolver()
export class AdminMessagingResolver {
  constructor(private readonly service: AdminMessagingService) {}

  @Query(() => AdminEmailLogPage)
  adminEmailLogs(@Args('input', { nullable: true }) input?: AdminEmailLogFilterInput): Promise<AdminEmailLogPage> {
    return this.service.logs(input);
  }

  @Query(() => AdminEmailLog)
  adminEmailLog(@Args('id', { type: () => Int }) id: number): Promise<AdminEmailLog> { return this.service.log(id); }

  @Query(() => AdminEmailTemplatePage)
  adminEmailTemplates(@Args('input', { nullable: true }) input?: AdminEmailTemplateFilterInput): Promise<AdminEmailTemplatePage> {
    return this.service.templates(input);
  }

  @CsrfProtected()
  @Mutation(() => AdminEmailPreview)
  previewAdminEmail(@Args('input') input: AdminEmailPreviewInput): AdminEmailPreview { return this.service.preview(input); }

}

import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { SignatureDocumentFilterInput } from './signature-document.inputs';
import { SignatureAuditEvent, SignatureDocument, SignatureDocumentDetail, SignatureDocumentPage } from './signature-document.types';
import { SignatureDocumentsService } from './signature-documents.service';

@Resolver(() => SignatureDocument)
export class SignatureDocumentsResolver {
  constructor(private readonly service: SignatureDocumentsService, private readonly context: RequestContextService) {}
  @OrganizationScoped() @Query(() => SignatureDocumentPage)
  signatureDocuments(@Args('filter',{nullable:true}) filter?:SignatureDocumentFilterInput,@Args('page',{nullable:true}) page?:PageInput):Promise<SignatureDocumentPage>{return this.service.list(this.organizationId(),filter,page);}
  @OrganizationScoped() @Query(() => SignatureDocumentDetail)
  signatureDocument(@Args('id',{type:()=>Int}) id:number):Promise<SignatureDocumentDetail>{return this.service.detail(this.organizationId(),id);}
  @OrganizationScoped() @Query(() => [SignatureAuditEvent])
  signatureAuditTrail(@Args('id',{type:()=>Int}) id:number):Promise<SignatureAuditEvent[]>{return this.service.auditTrail(this.organizationId(),id);}
  private organizationId():number{const organization=this.context.current().organization;if(!organization)throw new Error('Verified organization context is unavailable');return organization.organizationId;}
}

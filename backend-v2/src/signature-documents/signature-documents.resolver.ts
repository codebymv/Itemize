import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import { CreateSignatureDocumentInput, SignatureDocumentFilterInput, UpdateSignatureDraftInput } from './signature-document.inputs';
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
  @CsrfProtected() @OrganizationScoped() @Mutation(() => SignatureDocument)
  createSignatureDocument(@Args('input') input:CreateSignatureDocumentInput):Promise<SignatureDocument>{return this.service.create(this.organizationId(),this.userId(),input);}
  @CsrfProtected() @OrganizationScoped() @Mutation(() => SignatureDocument)
  updateSignatureDraft(@Args('id',{type:()=>Int}) id:number,@Args('input') input:UpdateSignatureDraftInput):Promise<SignatureDocument>{return this.service.update(this.organizationId(),id,input);}
  @CsrfProtected() @OrganizationScoped() @Mutation(() => SignatureDocument)
  deleteSignatureDraft(@Args('id',{type:()=>Int}) id:number):Promise<SignatureDocument>{return this.service.delete(this.organizationId(),id);}
  @CsrfProtected() @OrganizationScoped() @Mutation(() => SignatureDocument)
  cancelSignatureDocument(@Args('id',{type:()=>Int}) id:number):Promise<SignatureDocument>{return this.service.cancel(this.organizationId(),id);}
  private organizationId():number{const organization=this.context.current().organization;if(!organization)throw new Error('Verified organization context is unavailable');return organization.organizationId;}
  private userId():number{const identity=this.context.current().identity;if(!identity)throw new Error('Verified identity context is unavailable');return identity.userId;}
}

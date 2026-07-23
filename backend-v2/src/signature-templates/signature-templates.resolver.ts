import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { SignatureDocument } from '../signature-documents/signature-document.types';
import { CreateSignatureTemplateInput, InstantiateSignatureTemplateInput, UpdateSignatureTemplateInput } from './signature-template.inputs';
import { SignatureTemplate, SignatureTemplateDetail } from './signature-template.types';
import { SignatureTemplatesService } from './signature-templates.service';

@Resolver(()=>SignatureTemplate)
export class SignatureTemplatesResolver {
  constructor(private readonly service:SignatureTemplatesService,private readonly context:RequestContextService){}
  @OrganizationScoped() @Query(()=>[SignatureTemplate]) signatureTemplates():Promise<SignatureTemplate[]>{return this.service.list(this.organizationId());}
  @OrganizationScoped() @Query(()=>SignatureTemplateDetail) signatureTemplate(@Args('id',{type:()=>Int})id:number):Promise<SignatureTemplateDetail>{return this.service.detail(this.organizationId(),id);}
  @CsrfProtected() @OrganizationScoped() @Mutation(()=>SignatureTemplate) createSignatureTemplate(@Args('input')input:CreateSignatureTemplateInput):Promise<SignatureTemplate>{return this.service.create(this.organizationId(),this.userId(),input);}
  @CsrfProtected() @OrganizationScoped() @Mutation(()=>SignatureTemplate) updateSignatureTemplate(@Args('id',{type:()=>Int})id:number,@Args('input')input:UpdateSignatureTemplateInput):Promise<SignatureTemplate>{return this.service.update(this.organizationId(),id,input);}
  @CsrfProtected() @OrganizationScoped() @Mutation(()=>SignatureTemplate) deleteSignatureTemplate(@Args('id',{type:()=>Int})id:number):Promise<SignatureTemplate>{return this.service.delete(this.organizationId(),id);}
  @CsrfProtected() @OrganizationScoped() @Mutation(()=>SignatureDocument) instantiateSignatureTemplate(@Args('id',{type:()=>Int})id:number,@Args('input')input:InstantiateSignatureTemplateInput):Promise<SignatureDocument>{return this.service.instantiate(this.organizationId(),this.userId(),id,input);}
  private organizationId():number{const organization=this.context.current().organization;if(!organization)throw new Error('Verified organization context is unavailable');return organization.organizationId;}
  private userId():number{const identity=this.context.current().identity;if(!identity)throw new Error('Verified identity context is unavailable');return identity.userId;}
}

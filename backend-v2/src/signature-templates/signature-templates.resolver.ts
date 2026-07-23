import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { OrganizationScoped } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { SignatureTemplate, SignatureTemplateDetail } from './signature-template.types';
import { SignatureTemplatesService } from './signature-templates.service';

@Resolver(()=>SignatureTemplate)
export class SignatureTemplatesResolver {
  constructor(private readonly service:SignatureTemplatesService,private readonly context:RequestContextService){}
  @OrganizationScoped() @Query(()=>[SignatureTemplate]) signatureTemplates():Promise<SignatureTemplate[]>{return this.service.list(this.organizationId());}
  @OrganizationScoped() @Query(()=>SignatureTemplateDetail) signatureTemplate(@Args('id',{type:()=>Int})id:number):Promise<SignatureTemplateDetail>{return this.service.detail(this.organizationId(),id);}
  private organizationId():number{const organization=this.context.current().organization;if(!organization)throw new Error('Verified organization context is unavailable');return organization.organizationId;}
}

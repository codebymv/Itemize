import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { SignatureTemplate, SignatureTemplateDetail, SignatureTemplateField, SignatureTemplateRole } from './signature-template.types';
import { SignatureTemplateFieldRow, SignatureTemplateRoleRow, SignatureTemplateRow, SignatureTemplatesRepository } from './signature-templates.repository';

@Injectable()
export class SignatureTemplatesService {
  constructor(private readonly repository:SignatureTemplatesRepository){}
  async list(organizationId:number):Promise<SignatureTemplate[]>{await this.access(organizationId);return (await this.repository.findAll(organizationId)).map(r=>this.template(r));}
  async detail(organizationId:number,id:number):Promise<SignatureTemplateDetail>{await this.access(organizationId);this.id(id);const r=await this.repository.findDetail(organizationId,id);if(!r)throw itemizeGraphqlError('Signature template not found','NOT_FOUND');return {template:this.template(r.template),roles:r.roles.map(x=>this.role(x)),fields:r.fields.map(x=>this.field(x))};}
  private async access(organizationId:number):Promise<void>{if(!(await this.repository.hasFeatureAccess(organizationId)))throw itemizeGraphqlError('E-Signatures require an upgrade.','FORBIDDEN',{reason:'FEATURE_NOT_AVAILABLE'});}
  private id(value:number):void{if(!Number.isInteger(value)||value<1)throw itemizeGraphqlError('id must be a positive integer','BAD_USER_INPUT',{field:'id'});}
  private template(r:SignatureTemplateRow):SignatureTemplate{return{id:r.id,organizationId:r.organization_id,title:r.title,description:r.description,message:r.message,hasFile:r.has_file,fileName:r.file_name,fileType:r.file_type,fileSize:r.file_size===null?null:Number(r.file_size),createdById:r.created_by,createdAt:r.created_at,updatedAt:r.updated_at};}
  private role(r:SignatureTemplateRoleRow):SignatureTemplateRole{return{id:r.id,templateId:r.template_id,roleName:r.role_name,signingOrder:r.signing_order};}
  private field(r:SignatureTemplateFieldRow):SignatureTemplateField{return{id:r.id,templateId:r.template_id,roleName:r.role_name,fieldType:r.field_type,pageNumber:r.page_number,xPosition:Number(r.x_position),yPosition:Number(r.y_position),width:Number(r.width),height:Number(r.height),label:r.label,isRequired:r.is_required,fontSize:r.font_size,fontFamily:r.font_family,textAlign:r.text_align,locked:r.locked};}
}

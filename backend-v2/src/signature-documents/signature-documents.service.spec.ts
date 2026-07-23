import { SignatureDocumentStatus } from './signature-document.enums';
import { SignatureDocumentsRepository } from './signature-documents.repository';
import { SignatureDocumentsService } from './signature-documents.service';

const document={id:7,organization_id:3,title:'NDA',document_number:null,description:null,message:null,status:SignatureDocumentStatus.DRAFT,recipient_count:1,routing_mode:'parallel',template_id:null,expiration_days:30,expires_at:null,sender_name:null,sender_email:null,created_by:4,sent_at:null,completed_at:null,has_file:true,has_signed_file:false,file_name:'nda.pdf',file_type:'application/pdf',file_size:'1200',created_at:new Date('2026-01-01'),updated_at:new Date('2026-01-02')};

describe('SignatureDocumentsService',()=>{
  const repository={hasFeatureAccess:jest.fn(),findPage:jest.fn(),findDetail:jest.fn(),findAudit:jest.fn()} as unknown as jest.Mocked<SignatureDocumentsRepository>;
  const service=new SignatureDocumentsService(repository);
  beforeEach(()=>{jest.clearAllMocks();repository.hasFeatureAccess.mockResolvedValue(true);});
  it('maps bounded tenant document pages without storage or evidence secrets',async()=>{repository.findPage.mockResolvedValue({rows:[document],total:1});await expect(service.list(3,{status:SignatureDocumentStatus.DRAFT},{page:1,pageSize:20})).resolves.toEqual({nodes:[expect.objectContaining({id:7,hasFile:true,fileSize:1200})],pageInfo:expect.objectContaining({total:1})});expect(repository.findPage).toHaveBeenCalledWith({organizationId:3,status:SignatureDocumentStatus.DRAFT,pageSize:20,offset:0});});
  it('maps detail children and audit while preserving private misses',async()=>{repository.findDetail.mockResolvedValue({document,recipients:[],fields:[],audit:[]});await expect(service.detail(3,7)).resolves.toEqual({document:expect.objectContaining({id:7}),recipients:[],fields:[],audit:[]});repository.findDetail.mockResolvedValue(null);await expect(service.detail(3,8)).rejects.toMatchObject({extensions:{code:'NOT_FOUND'}});});
  it('enforces feature access and page bounds before repository reads',async()=>{repository.hasFeatureAccess.mockResolvedValue(false);await expect(service.list(3)).rejects.toMatchObject({extensions:{code:'FORBIDDEN'}});repository.hasFeatureAccess.mockResolvedValue(true);await expect(service.list(3,{}, {page:0,pageSize:20})).rejects.toMatchObject({extensions:{code:'BAD_USER_INPUT'}});});
});

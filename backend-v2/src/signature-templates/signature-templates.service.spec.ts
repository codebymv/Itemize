import { SignatureTemplatesRepository } from './signature-templates.repository';
import { SignatureTemplatesService } from './signature-templates.service';

const template={id:5,organization_id:3,title:'Agreement',description:null,message:null,has_file:true,file_name:'agreement.pdf',file_type:'application/pdf',file_size:'800',created_by:4,created_at:new Date('2026-01-01'),updated_at:new Date('2026-01-02')};
describe('SignatureTemplatesService',()=>{
  const repository={hasFeatureAccess:jest.fn(),findAll:jest.fn(),findDetail:jest.fn()} as unknown as jest.Mocked<SignatureTemplatesRepository>;
  const service=new SignatureTemplatesService(repository);
  beforeEach(()=>{jest.clearAllMocks();repository.hasFeatureAccess.mockResolvedValue(true);});
  it('maps list and tenant-qualified aggregate detail',async()=>{repository.findAll.mockResolvedValue([template]);await expect(service.list(3)).resolves.toEqual([expect.objectContaining({id:5,hasFile:true,fileSize:800})]);repository.findDetail.mockResolvedValue({template,roles:[{id:1,template_id:5,role_name:'Signer',signing_order:1}],fields:[]});await expect(service.detail(3,5)).resolves.toEqual({template:expect.objectContaining({id:5}),roles:[expect.objectContaining({roleName:'Signer'})],fields:[]});});
  it('fails closed on foreign IDs and unavailable plans',async()=>{repository.findDetail.mockResolvedValue(null);await expect(service.detail(3,5)).rejects.toMatchObject({extensions:{code:'NOT_FOUND'}});repository.hasFeatureAccess.mockResolvedValue(false);await expect(service.list(3)).rejects.toMatchObject({extensions:{code:'FORBIDDEN'}});});
});

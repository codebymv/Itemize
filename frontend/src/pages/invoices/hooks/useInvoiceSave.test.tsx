import {act,renderHook} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {useInvoiceSave} from './useInvoiceSave';
import {sendInvoice} from '@/services/invoicesApi';
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn()}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock('@/services/invoicesApi',()=>({sendInvoice:vi.fn(),createInvoice:vi.fn(),updateInvoice:vi.fn()}));
describe('invoice editor send',()=>{
  beforeEach(()=>vi.mocked(sendInvoice).mockReset());
  it.each([true,false])('preserves the payment-link choice %s through the editor',async(includePaymentLink)=>{
    vi.mocked(sendInvoice).mockResolvedValue({emailSent:true} as Awaited<ReturnType<typeof sendInvoice>>);
    const {result}=renderHook(()=>useInvoiceSave({organizationId:7,isNew:false,invoiceId:'41'}));
    await act(()=>result.current.handleSendInvoice({subject:'Invoice',message:'Please review',includePaymentLink}));
    expect(sendInvoice).toHaveBeenCalledWith(41,7,expect.objectContaining({includePaymentLink}),expect.any(String));
  });
});

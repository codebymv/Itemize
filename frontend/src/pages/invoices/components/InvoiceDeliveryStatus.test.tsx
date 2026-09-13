import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {InvoiceDeliveryStatus} from './InvoiceDeliveryStatus';
const mocks=vi.hoisted(()=>({get:vi.fn(),retry:vi.fn()}));
vi.mock('@/services/invoicesGraphql',async importOriginal=>({...await importOriginal<typeof import('@/services/invoicesGraphql')>(),getInvoiceDeliveryStatus:mocks.get,retryInvoiceDelivery:mocks.retry}));
const mount=()=>{const blocked=vi.fn();const view=render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><InvoiceDeliveryStatus invoiceId={9} organizationId={1} onBlocked={blocked}/></QueryClientProvider>);return {...view,blocked};};
describe('invoice delivery recovery',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('loads an unresolved receipt on mount and only retries its original identity',async()=>{
  mocks.get.mockResolvedValue({deliveryId:71,status:'RECONCILIATION_REQUIRED',canRetry:true});
  mocks.retry.mockResolvedValue({});
  const {blocked}=mount();
  fireEvent.click(await screen.findByRole('button',{name:'Retry original email'}));
  await waitFor(()=>expect(mocks.retry).toHaveBeenCalledWith(71,1));
  expect(blocked).toHaveBeenLastCalledWith(true);
 });
 it('holds expired uncertain work for support and offers no send retry',async()=>{
  mocks.get.mockResolvedValue({deliveryId:72,status:'DEAD_LETTER',canRetry:false});
  const {blocked}=mount();
  await screen.findByText(/Contact support/);
  expect(screen.queryByRole('button',{name:'Retry original email'})).not.toBeInTheDocument();
  expect(blocked).toHaveBeenLastCalledWith(true);
 });
 it.each([['delivered','Email delivered.'],['bounced','Email bounced. Check the recipient address before sending another email.']])('shows provider outcome %s separately from send acceptance',async(providerStatus,message)=>{
  mocks.get.mockResolvedValue({deliveryId:73,status:'SENT',canRetry:false,providerStatus});
  mount();
  await screen.findByText(message);
  expect(screen.queryByRole('button',{name:'Retry original email'})).not.toBeInTheDocument();
 });
 it('fails closed when status cannot be loaded',async()=>{
  mocks.get.mockRejectedValue(new Error('offline'));
  const {blocked}=mount();
  await screen.findByText(/status is unavailable/);
  expect(blocked).toHaveBeenLastCalledWith(true);
 });
});

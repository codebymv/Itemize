import {encryptDeliveryPayload,decryptDeliveryPayload} from './delivery-payload-encryption';
describe('delivery encryption',()=>{
 it('encrypts capability-bearing payloads and binds ciphertext to the delivery identity',()=>{
  const encrypted=encryptDeliveryPayload('secret signing url','invoice:1');
  expect(encrypted).not.toContain('secret signing url');
  expect(decryptDeliveryPayload(encrypted,'invoice:1')).toBe('secret signing url');
  expect(()=>decryptDeliveryPayload(encrypted,'invoice:2')).toThrow();
  expect(()=>decryptDeliveryPayload(encrypted.slice(0,-4)+'AAAA','invoice:1')).toThrow();
 });
});

import {expect, it} from 'vitest';
import {loginReturnUrl, safeLoginReturn} from './loginReturn';
it('retains an exact task query and fragment through expired-session login', () => {
  const target = '/contacts?view=follow-ups&taskId=42&organizationId=21#client-tasks';
  const login = new URL(loginReturnUrl(target, true), 'https://itemize.test');
  expect(login.searchParams.get('session')).toBe('expired');
  expect(safeLoginReturn(login.searchParams.get('redirect'))).toBe(target);
});
it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/%5cevil.test', '/%2fevil.test', '/%0a/evil.test', '/login?redirect=/contacts', '/register', '/bad%'])('rejects unsafe destination %s', value => {
  expect(safeLoginReturn(value)).toBe('/');
});

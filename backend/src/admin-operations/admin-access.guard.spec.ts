import { ExecutionContext } from '@nestjs/common';
import { Pool } from 'pg';
import { AdminAccessGuard } from './admin-access.guard';
import { AdminMfaService } from '../auth/admin-mfa.service';
import { RequestContextService } from '../request-context/request-context.service';

describe('Admin access enforcement',()=>{
  const identity={userId:1,sessionId:'test-session'};
  const query=jest.fn();
  const requireVerified=jest.fn();
  const guard=new AdminAccessGuard({query} as unknown as Pool,
    {current:()=>({identity})} as RequestContextService,
    {requireVerified} as unknown as AdminMfaService);
  beforeEach(()=>{jest.resetAllMocks();query.mockResolvedValue({rows:[{role:'ADMIN'}]});});
  it('requires session verification even for an authoritative admin role',async()=>{
    requireVerified.mockRejectedValue(new Error('MFA required'));
    await expect(guard.canActivate({getType:()=> 'graphql'} as ExecutionContext)).rejects.toThrow('MFA required');
    expect(requireVerified).toHaveBeenCalledWith(identity);
  });
  it('rejects an unknown transport before granting access',async()=>{
    await expect(guard.canActivate({getType:()=> 'http'} as ExecutionContext)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects a non-admin without accepting MFA as a substitute for role',async()=>{
    query.mockResolvedValue({rows:[{role:'USER'}]});
    await expect(guard.canActivate({getType:()=> 'graphql'} as ExecutionContext)).rejects.toThrow();
    expect(requireVerified).not.toHaveBeenCalled();
  });
});

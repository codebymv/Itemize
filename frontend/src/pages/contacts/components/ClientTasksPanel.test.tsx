import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientTasksPanel } from './ClientTasksPanel';
import * as api from '@/services/clientTasksGraphql';
vi.mock('@/services/clientTasksGraphql',()=>({getClientTasks:vi.fn(),createClientTask:vi.fn(),updateClientTask:vi.fn(),transitionClientTask:vi.fn()}));
const task:api.ClientTask={id:1,contactId:10,title:'Call the client',description:null,priority:'medium',status:'pending',assignedToId:7,assignedToName:'Owner',dueAt:null,completedAt:null,updatedAt:'2026-09-15T12:00:00Z',version:1,canEdit:true,canClaim:false};
const page:api.ClientTaskPage={nodes:[task],pageInfo:{page:1,total:1,hasNextPage:false,hasPreviousPage:false},canCreate:true,canManage:true,viewerId:7,assignees:[{id:7,name:'Owner'}]};
const mount=()=>render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><ClientTasksPanel organizationId={20} contactId={10}/></QueryClientProvider></MemoryRouter>);
beforeEach(()=>{vi.resetAllMocks();vi.mocked(api.getClientTasks).mockResolvedValue(page);vi.mocked(api.createClientTask).mockResolvedValue(task);vi.mocked(api.transitionClientTask).mockResolvedValue(task);});
describe('client follow-up workflow',()=>{
  it('fetches an exact task without list pagination or creation controls',async()=>{
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><ClientTasksPanel organizationId={20} taskId={42}/></MemoryRouter></QueryClientProvider>);
    await screen.findByText('Call the client');
    expect(api.getClientTasks).toHaveBeenCalledWith(20,{taskId:42,view:'all'},1,expect.any(AbortSignal));
    expect(screen.queryByRole('button',{name:'Next'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'New task'})).not.toBeInTheDocument();
  });
  it('creates a client-linked assigned task from the dialog',async()=>{
    mount();fireEvent.click(await screen.findByRole('button',{name:'New task'}));
    fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Prepare estimate'}});
    fireEvent.change(screen.getByLabelText('Assigned to'),{target:{value:'7'}});
    fireEvent.click(screen.getByRole('button',{name:'Save task'}));
    await waitFor(()=>expect(api.createClientTask).toHaveBeenCalledWith(20,expect.objectContaining({title:'Prepare estimate',contactId:10,assignedToId:7}),expect.any(String)));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('completes then reopens using the latest returned task version',async()=>{
    mount();await screen.findByText('Call the client');
    const done={...task,status:'completed',version:2,completedAt:'2026-09-15T12:30:00Z'};
    vi.mocked(api.getClientTasks).mockResolvedValue({...page,nodes:[done]});
    fireEvent.click(screen.getByRole('button',{name:'Complete'}));
    await screen.findByRole('button',{name:'Reopen'});
    expect(api.transitionClientTask).toHaveBeenCalledWith(20,expect.objectContaining({id:1,version:1}),'completed',expect.any(String));
    fireEvent.click(screen.getByRole('button',{name:'Reopen'}));
    await waitFor(()=>expect(api.transitionClientTask).toHaveBeenCalledWith(20,expect.objectContaining({id:1,version:2}),'pending',expect.any(String)));
  });
  it('freezes an uncertain create and retries with the identical payload and key',async()=>{
    vi.mocked(api.createClientTask).mockRejectedValueOnce(new Error('Response lost'));
    mount();fireEvent.click(await screen.findByRole('button',{name:'New task'}));
    fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Retry this once'}});
    fireEvent.click(screen.getByRole('button',{name:'Save task'}));
    await screen.findByRole('button',{name:'Retry save'});
    expect(screen.getByLabelText('Title')).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Retry save'}));
    await waitFor(()=>expect(api.createClientTask).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createClientTask).mock.calls[1]).toEqual(vi.mocked(api.createClientTask).mock.calls[0]);
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('shows read-only tasks for a viewer and scopes the query',async()=>{
    vi.mocked(api.getClientTasks).mockResolvedValue({...page,canCreate:false,canManage:false,nodes:[{...task,canEdit:false}]});
    mount();await screen.findByText('Call the client');
    expect(screen.queryByRole('button',{name:'New task'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Complete'})).not.toBeInTheDocument();
    expect(api.getClientTasks).toHaveBeenCalledWith(20,{contactId:10,view:'all'},1,expect.any(AbortSignal));
  });
  it('keeps load errors actionable',async()=>{
    vi.mocked(api.getClientTasks).mockRejectedValueOnce(new Error('Unavailable'));
    mount();await screen.findByText('Follow-ups could not be loaded.');
    fireEvent.click(screen.getByRole('button',{name:'Retry'}));
    await screen.findByText('Call the client');
  });
});

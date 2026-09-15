import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ClientFollowUpsPage } from './ClientFollowUpsPage';
let org=20;
vi.mock('@/hooks/useOrganization',()=>({useOrganization:()=>({organizationId:org,isLoading:false,error:null})}));
vi.mock('@/components/layout/PageLayout',()=>({PageLayout:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('./ClientTasksPanel',()=>({ClientTasksPanel:({organizationId,taskId}:{organizationId:number;taskId?:number})=><p data-testid="task-panel">{organizationId}:{taskId??'all'}</p>}));
beforeEach(()=>{org=20;});
const page=(query:string)=><MemoryRouter initialEntries={[`/contacts?view=follow-ups&${query}`]}><ClientFollowUpsPage/></MemoryRouter>;
it('does not load a task until its organization is selected',()=>{
  const view=render(page('taskId=42&organizationId=21'));
  expect(screen.getByRole('alert')).toHaveTextContent('Select organization 21');
  expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument();
  org=21;view.rerender(page('taskId=42&organizationId=21'));
  expect(screen.getByTestId('task-panel')).toHaveTextContent('21:42');
});
it.each(['taskId=0&organizationId=20','taskId=42','taskId=bad&organizationId=20','taskId=2147483648&organizationId=20'])('rejects malformed task link %s',query=>{
  render(page(query));expect(screen.getByRole('alert')).toHaveTextContent('invalid');expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument();
});
it('retains the ordinary all-follow-ups route',()=>{render(page(''));expect(screen.getByTestId('task-panel')).toHaveTextContent('20:all');});

import { Link, useSearchParams } from 'react-router-dom';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/hooks/useOrganization';
import { ClientTasksPanel } from './ClientTasksPanel';

const validId=(value:string|null)=>value!==null && /^[1-9][0-9]*$/.test(value) && Number(value)<=2147483647;
export function ClientFollowUpsPage() {
  const {organizationId,isLoading,error}=useOrganization();
  const [params]=useSearchParams();
  const task=params.get('taskId'),target=params.get('organizationId');
  const focused=params.has('taskId');
  const invalid=focused && (!validId(task) || !validId(target));
  return <PageLayout title={focused?'CLIENT FOLLOW-UP':'CLIENT FOLLOW-UPS'}>
    <div className="mb-4"><Button variant="outline" asChild><Link to={focused?'/contacts?view=follow-ups':'/contacts'}>{focused?'All follow-ups':'Back to clients'}</Link></Button></div>
    {isLoading?<p role="status">Loading organization…</p>:error?<p role="alert">{error}</p>
      :invalid?<p role="alert">This task link is invalid. Open all follow-ups to find the task.</p>
        :!organizationId?<p>Select an organization to view follow-ups.</p>
          :focused && Number(target)!==organizationId?<p role="alert">This task belongs to a different organization. Select organization {target} from the organization menu to open it.</p>
            :<ClientTasksPanel organizationId={organizationId} taskId={focused?Number(task):undefined}/>}
  </PageLayout>;
}

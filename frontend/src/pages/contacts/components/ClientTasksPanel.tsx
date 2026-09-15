import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClientTask, getClientTasks, transitionClientTask, updateClientTask, type ClientTask, type ClientTaskInput } from '@/services/clientTasksGraphql';
import { GraphqlRequestError } from '@/services/graphqlClient';

type Props={organizationId:number;contactId?:number;createRequested?:boolean;onCloseCreate?:()=>void;onCanCreate?:(canCreate:boolean)=>void};
const localDate = (value:string|null) => {
  if (!value) return '';
  const date=new Date(value);
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
};
export function ClientTasksPanel(props:Props) {
  // Remount when switching clients/organizations so pending form data cannot cross tenants.
  return <TaskPanel key={`${props.organizationId}:${props.contactId ?? 'all'}`} {...props}/>;
}
function TaskPanel({organizationId,contactId,createRequested=false,onCloseCreate,onCanCreate}:Props) {
  const client=useQueryClient();
  const [view,setView]=useState('all');
  const [page,setPage]=useState(1);
  const [editing,setEditing]=useState<ClientTask|null>(null);
  const [creating,setCreating]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [pendingRetry,setPendingRetry]=useState(false);
  const [form,setForm]=useState({title:'',description:'',priority:'medium',due:'',assignee:''});
  const attempt=useRef<{signature:string;key:string;run:()=>Promise<ClientTask>}|null>(null);
  const alive=useRef(true);
  const inFlight=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const query=useQuery({queryKey:['client-tasks',organizationId,contactId,view,page],queryFn:({signal})=>getClientTasks(organizationId,{...(contactId?{contactId}:{}),view},page,signal)});
  useEffect(()=>{onCanCreate?.(query.data?.canCreate ?? false);},[query.data?.canCreate,onCanCreate]);
  const openCreate=()=>{setEditing(null);setForm({title:'',description:'',priority:'medium',due:'',assignee:''});setCreating(true);};
  useEffect(()=>{
    if(createRequested && query.data?.canCreate && !busy && !pendingRetry) {
      setEditing(null);setForm({title:'',description:'',priority:'medium',due:'',assignee:''});setCreating(true);onCloseCreate?.();
    }
  },[createRequested,query.data?.canCreate,busy,pendingRetry,onCloseCreate]);
  const reload=()=>client.invalidateQueries({queryKey:['client-tasks',organizationId]});
  async function execute(signature:string,run:(key:string)=>Promise<ClientTask>) {
    if(inFlight.current || (pendingRetry && attempt.current?.signature!==signature)) return;
    const key=attempt.current?.signature===signature?attempt.current.key:crypto.randomUUID();
    attempt.current={signature,key,run:()=>run(key)};
    await submitAttempt();
  }
  async function submitAttempt() {
    if(!attempt.current || inFlight.current) return;
    inFlight.current=true;
    setBusy(true);setError('');
    try {
      await attempt.current.run();
      await reload();
      if(!alive.current) return;
      attempt.current=null;setPendingRetry(false);setEditing(null);setCreating(false);
    } catch(err) {
      if(!alive.current) return;
      // A transport failure may follow a committed mutation. Freeze the request until its exact replay resolves.
      const definite=err instanceof GraphqlRequestError && err.code && ['BAD_USER_INPUT','FORBIDDEN','NOT_FOUND','CONFLICT','UNAUTHENTICATED','PLAN_REQUIRED','SUBSCRIPTION_REQUIRED'].includes(err.code);
      setPendingRetry(!definite);
      setError(err instanceof Error?err.message:'Unable to save this task.');
      if(definite){attempt.current=null;await reload();if(alive.current && err instanceof GraphqlRequestError && err.code==='CONFLICT'){setEditing(null);setCreating(false);}}
    } finally {inFlight.current=false;if(alive.current)setBusy(false);}
  }
  function edit(task:ClientTask) {setEditing(task);setCreating(false);setForm({title:task.title,description:task.description ?? '',priority:task.priority,due:localDate(task.dueAt),assignee:task.assignedToId?.toString() ?? ''});}
  const locked=busy||pendingRetry;
  const modal=creating||editing!==null;
  const save=async()=>{
    const input:ClientTaskInput={title:form.title.trim(),description:form.description.trim()||null,priority:form.priority,dueAt:form.due?new Date(form.due).toISOString():null,assignedToId:form.assignee?Number(form.assignee):null};
    if(editing) await execute(JSON.stringify(['edit',editing.id,editing.version,input]),key=>updateClientTask(organizationId,editing,input,key));
    else await execute(JSON.stringify(['create',contactId,input]),key=>createClientTask(organizationId,{...input,contactId:contactId??null},key));
  };
  const errorBox=error?<div role="alert" className="space-y-2 rounded-md border p-3 text-sm"><p>{error}</p>{pendingRetry?<><p>The result is not confirmed. Retry the same request to check it safely.</p><Button disabled={busy} onClick={()=>void submitAttempt()}>Retry save</Button></>:<Button variant="outline" onClick={()=>{setError('');void reload();}}>Reload tasks</Button>}</div>:null;
  return <Card id="client-tasks">
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Follow-ups</CardTitle><div className="flex gap-2">{contactId && <Button variant="outline" asChild><Link to="/contacts?view=follow-ups">All follow-ups</Link></Button>}{query.data?.canCreate && <Button disabled={locked} onClick={openCreate}>New task</Button>}</div></div></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-3"><Label htmlFor="task-view">Show</Label><select id="task-view" value={view} disabled={locked} className="rounded-md border bg-background p-2" onChange={e=>{setView(e.target.value);setPage(1);}}><option value="all">All tasks</option><option value="mine">My tasks</option><option value="unassigned">Needs assignment</option><option value="overdue">Overdue</option>{!contactId&&<option value="unlinked">Without a client</option>}</select></div>
      {!modal && errorBox}
      {query.isPending?<p role="status">Loading follow-ups…</p>:query.isError?<div role="alert"><p>Follow-ups could not be loaded.</p><Button variant="outline" onClick={()=>void query.refetch()}>Retry</Button></div>:<>
        {query.data.nodes.length===0?<p className="text-sm text-muted-foreground">No follow-ups in this view.</p>:<ul className="space-y-3">{query.data.nodes.map(task=><li key={task.id} id={`task-${task.id}`} className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{task.title}</h3><span className="text-sm capitalize">{task.status.replace('_',' ')}</span></div>
          {task.description&&<p className="whitespace-pre-wrap break-words text-sm">{task.description}</p>}
          <p className="text-sm text-muted-foreground">{task.assignedToName??'Unassigned'} · {task.priority} priority{task.dueAt?` · Due ${new Date(task.dueAt).toLocaleString()}`:''}</p>
          <div className="flex flex-wrap gap-2">
            {!contactId&&task.contactId&&<Button size="sm" variant="outline" asChild><Link to={`/contacts/${task.contactId}#client-tasks`}>Open client</Link></Button>}
            {task.canClaim&&<Button size="sm" disabled={locked} onClick={()=>void execute(JSON.stringify(['claim',task.id,task.version]),key=>updateClientTask(organizationId,task,{assignedToId:query.data.viewerId},key))}>Assign to me</Button>}
            {task.canEdit&&<><Button size="sm" variant="outline" disabled={locked} onClick={()=>edit(task)}>Edit task</Button>{(task.status==='completed'||task.status==='cancelled')?<Button size="sm" disabled={locked} onClick={()=>void execute(JSON.stringify(['reopen',task.id,task.version]),key=>transitionClientTask(organizationId,task,'pending',key))}>Reopen</Button>:<><Button size="sm" disabled={locked} onClick={()=>void execute(JSON.stringify(['complete',task.id,task.version]),key=>transitionClientTask(organizationId,task,'completed',key))}>Complete</Button><Button size="sm" variant="outline" disabled={locked} onClick={()=>void execute(JSON.stringify(['cancel',task.id,task.version]),key=>transitionClientTask(organizationId,task,'cancelled',key))}>Cancel task</Button></>}</>}
          </div>
        </li>)}</ul>}
        <div className="flex items-center gap-3"><Button variant="outline" disabled={locked||!query.data.pageInfo.hasPreviousPage} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm">Page {page} · {query.data.pageInfo.total} tasks</span><Button variant="outline" disabled={locked||!query.data.pageInfo.hasNextPage} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
      </>}
      <Dialog open={modal} onOpenChange={open=>{if(!open&&!locked){setCreating(false);setEditing(null);setError('');}}}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing?'Edit follow-up':'New follow-up'}</DialogTitle><DialogDescription>Choose the next action, its owner and when it is due.</DialogDescription></DialogHeader>
        {errorBox}<form className="space-y-4" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={locked} className="space-y-4">
          <div><Label htmlFor="task-title">Title</Label><Input id="task-title" required maxLength={255} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></div>
          <div><Label htmlFor="task-description">Details</Label><Textarea id="task-description" maxLength={4000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
          <div><Label htmlFor="task-owner">Assigned to</Label><select id="task-owner" className="w-full rounded-md border bg-background p-2" value={form.assignee} onChange={e=>setForm({...form,assignee:e.target.value})}>{(!editing||query.data?.canManage)&&<option value="">Unassigned</option>}{editing?.assignedToId&&!query.data?.assignees.some(a=>a.id===editing.assignedToId)&&<option value={editing.assignedToId}>Previous assignee — select an active member</option>}{query.data?.assignees.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div><Label htmlFor="task-due">Due date and time</Label><Input id="task-due" type="datetime-local" value={form.due} onChange={e=>setForm({...form,due:e.target.value})}/></div>
          <div><Label htmlFor="task-priority">Priority</Label><select id="task-priority" className="w-full rounded-md border bg-background p-2" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>{['low','medium','high','urgent'].map(p=><option key={p} value={p}>{p}</option>)}</select></div>
          <Button type="submit" disabled={!form.title.trim()}>{busy?'Saving…':'Save task'}</Button>
        </fieldset></form>
      </DialogContent></Dialog>
    </CardContent>
  </Card>;
}

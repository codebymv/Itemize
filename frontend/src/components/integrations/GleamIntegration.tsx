import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { ServiceMark } from "@/components/brand/ServiceMark";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  IntegrationStatusRow,
  type IntegrationStatus,
} from "./IntegrationStatusRow";
import { STATUS_THEME_CLASSES } from "@/lib/statusVisuals";
import { formatRelativeTime } from "@/utils/timeUtils";
import {
  createGleamPairing,
  changeGleamPairing,
  getGleamPairing,
  type GleamPairingOverview,
} from "@/services/gleamPairingGraphql";

const formatDueWindow = (minutes: number) => {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return "1 hour";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${minutes / 60} hours`;
};

function RoutingValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 py-3 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}

export function GleamIntegration({
  organizationId,
  expanded = true,
  onToggle,
}: {
  organizationId: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const [overview, setOverview] = useState<GleamPairingOverview>();
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("1440");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hasIntent, setHasIntent] = useState(false);
  const running = useRef(false);
  const active = useRef(true);
  const intent = useRef<{
    code: string;
    key: string;
    defaultAssigneeId: number;
    dueAfterMinutes: number;
  } | null>(null);
  const changeIntent = useRef<{
    action: "approveGleamPairing" | "disconnectGleamConnection";
    id: string;
    key: string;
  } | null>(null);

  const apply = (value: GleamPairingOverview) => {
    if (active.current && value.organizationId === organizationId)
      setOverview(value);
  };

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void getGleamPairing(organizationId, controller.signal)
      .then((value) => {
        if (active.current && value.organizationId === organizationId)
          setOverview(value);
      })
      .catch(() => {
        if (active.current)
          setMessage(
            "An organization administrator can review the Gleam connection. Refresh if you already have access.",
          );
      });
    return () => {
      active.current = false;
      controller.abort();
    };
  }, [organizationId]);

  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch {
      if (active.current)
        setMessage(
          "Could not confirm the change. Refresh status before trying again. Expired codes need to be replaced.",
        );
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  };

  const pairing = overview?.pairing;
  const connectionActive = pairing?.connection_state === "active";
  const selectedAssignee =
    overview?.assignees.find((user) => user.id === pairing?.default_assignee_id)
      ?.name || "the selected team member";
  const deliveryActivity = overview?.deliveryActivity;
  const rowStatus: IntegrationStatus = connectionActive
    ? "connected"
    : pairing?.state === "claimed" || pairing?.state === "approved"
      ? "inactive"
      : pairing?.state === "unused"
        ? "available"
        : "disconnected";

  const change = async (
    action: "approveGleamPairing" | "disconnectGleamConnection",
    id: string,
  ) => {
    if (
      changeIntent.current?.action !== action ||
      changeIntent.current.id !== id
    ) {
      changeIntent.current = { action, id, key: crypto.randomUUID() };
    }
    const result = await changeGleamPairing(
      organizationId,
      action,
      id,
      changeIntent.current.key,
    );
    apply(result);
    if (active.current) changeIntent.current = null;
  };

  const refresh = () =>
    void run(async () => apply(await getGleamPairing(organizationId)));
  const disconnect = () =>
    void run(async () => {
      await change("disconnectGleamConnection", pairing!.connection_id!);
      if (active.current) {
        setCode("");
        setMessage(
          "Gleam access stopped in Itemize. Disconnect in Gleam to clear its connection too.",
        );
      }
    });
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Select the pairing code and copy it manually.");
    }
  };

  return (
    <div className="border-b last:border-b-0">
      <IntegrationStatusRow
        name="Gleam"
        description="Turn voice call outcomes into assigned Itemize follow-ups."
        status={rowStatus}
        detail={connectionActive ? undefined : pairing?.source_name || overview?.organizationName}
        icon={<ServiceMark service="gleam" className="h-6 w-6" />}
        primaryLabel="Refresh status"
        primaryVariant="outline"
        onPrimary={refresh}
        busy={busy}
        expanded={expanded}
        onToggle={onToggle}
        controlsId={`gleam-integration-details-${organizationId}`}
      />
      {expanded ? (
        <div
          id={`gleam-integration-details-${organizationId}`}
          className="space-y-5 border-t bg-muted/10 p-5 sm:p-6"
        >
          {!overview ? (
            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              Connection status is unavailable. Refresh to try again.
            </div>
          ) : !overview.enabled && !pairing?.connection_id ? (
            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              Gleam pairing is not enabled for this organization yet.
            </div>
          ) : connectionActive ? (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2 font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
                  Connection active
                </span>
                <span className="hidden text-border sm:inline" aria-hidden="true">|</span>
                <span>Checked {formatRelativeTime(deliveryActivity?.checkedAt || new Date())}</span>
                <span className="hidden text-border sm:inline" aria-hidden="true">|</span>
                <span>
                  {deliveryActivity?.lastDeliveryAt
                    ? `Last delivery ${formatRelativeTime(deliveryActivity.lastDeliveryAt)}`
                    : "Awaiting first delivery"}
                </span>
              </div>

              <section aria-labelledby={`gleam-routing-${organizationId}`}>
                <h3 id={`gleam-routing-${organizationId}`} className="text-sm font-medium text-foreground">
                  Delivery routing
                </h3>
                <div className="mt-2 grid divide-y border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <RoutingValue label="Itemize organization" value={overview.organizationName} />
                  <RoutingValue label="Assignee(s)" value={selectedAssignee} />
                  <RoutingValue label="Due within" value={formatDueWindow(pairing.due_after_minutes)} />
                </div>
              </section>

              <section aria-labelledby={`gleam-deliveries-${organizationId}`}>
                <div className="flex items-center justify-between gap-4">
                  <h3 id={`gleam-deliveries-${organizationId}`} className="text-sm font-medium text-foreground">
                    Recent deliveries
                  </h3>
                  <a href="/contacts?view=follow-ups" className="text-sm text-primary hover:underline">
                    View tasks
                  </a>
                </div>
                {deliveryActivity?.recentDeliveries.length ? (
                  <div className="mt-2 overflow-hidden border-y">
                    <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto_1.25rem] gap-4 border-b py-2 text-xs uppercase tracking-wide text-muted-foreground md:grid">
                      <span>Call outcome</span>
                      <span>Assigned to</span>
                      <span>Created</span>
                      <span>When</span>
                      <span className="sr-only">Status</span>
                    </div>
                    {deliveryActivity.recentDeliveries.map((delivery) => (
                      <div key={delivery.id} className="grid gap-1 border-b py-3 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto_1.25rem] md:items-center md:gap-4">
                        <p className="truncate text-sm font-medium text-foreground" title={delivery.callOutcome}>
                          {delivery.callOutcome}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{delivery.assignedTo}</p>
                        <div className="flex items-center gap-1.5 text-sm text-foreground">
                          {delivery.taskUrl ? (
                            <a href={delivery.taskUrl} className="inline-flex items-center gap-1.5 hover:text-primary hover:underline">
                              {delivery.created}
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                          ) : delivery.created}
                        </div>
                        <p className="text-sm text-muted-foreground">{formatRelativeTime(delivery.appliedAt)}</p>
                        <CheckCircle2 className="hidden h-4 w-4 text-green-500 md:block" aria-label="Delivered" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 border-y py-4 text-sm text-muted-foreground">
                    No Gleam follow-ups have been delivered yet.
                  </p>
                )}
              </section>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Creates follow-up tasks and call summaries.
                </p>
                {pairing.connection_id && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto shrink-0 px-0 text-destructive hover:bg-transparent hover:text-destructive"
                        disabled={busy}
                        aria-label="Disconnect in Itemize"
                      >
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Gleam?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Itemize will stop receiving new voice follow-ups from{" "}
                          {pairing.source_name}. Existing tasks and call
                          summaries will remain.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground interaction-button--destructive"
                          onClick={disconnect}
                        >
                          Disconnect in Itemize
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </>
          ) : pairing?.state === "approved" ? (
            <div
              className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4"
              role="status"
            >
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
              <div>
                <p className="font-medium">
                  Approved for {pairing.source_name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Finish connecting in Gleam to start delivery.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {!pairing || pairing.state === "unused" ? (
                <>
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      Set the default follow-up routing
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      These defaults apply whenever a Gleam call creates work in
                      Itemize.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`gleam-assignee-${organizationId}`}>
                        Assign new tasks to
                      </Label>
                      <select
                        id={`gleam-assignee-${organizationId}`}
                        value={assignee}
                        disabled={busy || hasIntent}
                        onChange={(event) => setAssignee(event.target.value)}
                        className="interaction-field h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">Select a team member</option>
                        {overview.assignees.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`gleam-due-${organizationId}`}>
                        Follow-up due within
                      </Label>
                      <select
                        id={`gleam-due-${organizationId}`}
                        value={due}
                        disabled={busy || hasIntent}
                        onChange={(event) => setDue(event.target.value)}
                        className="interaction-field h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="60">1 hour</option>
                        <option value="1440">1 day</option>
                        <option value="2880">2 days</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy || !assignee || !overview.enabled}
                      onClick={() =>
                        void run(async () => {
                          if (!intent.current) {
                            const bytes = crypto.getRandomValues(
                              new Uint8Array(32),
                            );
                            intent.current = {
                              code: [...bytes]
                                .map((byte) =>
                                  byte.toString(16).padStart(2, "0"),
                                )
                                .join(""),
                              key: crypto.randomUUID(),
                              defaultAssigneeId: Number(assignee),
                              dueAfterMinutes: Number(due),
                            };
                            setHasIntent(true);
                          }
                          const value = intent.current;
                          const result = await createGleamPairing(
                            organizationId,
                            {
                              code: value.code,
                              defaultAssigneeId: value.defaultAssigneeId,
                              dueAfterMinutes: value.dueAfterMinutes,
                            },
                            value.key,
                          );
                          apply(result);
                          if (active.current) {
                            setCode(value.code);
                            intent.current = null;
                            setHasIntent(false);
                          }
                        })
                      }
                    >
                      {busy && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {hasIntent
                        ? "Retry creating code"
                        : "Create new pairing code"}
                    </Button>
                    {hasIntent && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          intent.current = null;
                          setHasIntent(false);
                          setCode("");
                          setMessage(
                            "Choose the assignee and create a new code to replace the previous request.",
                          );
                        }}
                      >
                        Start again
                      </Button>
                    )}
                  </div>
                </>
              ) : null}

              {code && pairing?.state === "unused" && (
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Pairing code ready
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Paste it in Gleam → Settings → Integrations → Itemize.
                      </p>
                    </div>
                    <Badge className={STATUS_THEME_CLASSES.orange.badgeClass}>
                      Expires in 10 minutes
                    </Badge>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <input
                      aria-label="Gleam pairing code"
                      readOnly
                      value={code}
                      className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm"
                      onFocus={(event) => event.target.select()}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => void copyCode()}
                      aria-label="Copy Gleam pairing code"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Expires {new Date(pairing.expires_at).toLocaleString()}
                  </p>
                </div>
              )}

              {pairing?.state === "claimed" && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950/40">
                  <p className="text-sm font-medium text-foreground">
                    Confirm the workspace requesting access
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Verified Gleam organization:{" "}
                    <strong className="text-foreground">
                      {pairing.source_name}
                    </strong>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    New tasks will be assigned to {selectedAssignee}, due within{" "}
                    {pairing.due_after_minutes / 60} hours.
                  </p>
                  <Button
                    className="mt-4"
                    disabled={busy || !overview.enabled}
                    onClick={() =>
                      void run(async () => {
                        await change("approveGleamPairing", pairing.id);
                        if (active.current) setCode("");
                      })
                    }
                  >
                    Approve connection to {pairing.source_name}
                  </Button>
                </div>
              )}
            </div>
          )}

          {message && (
            <p
              role="status"
              className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
            >
              {message}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

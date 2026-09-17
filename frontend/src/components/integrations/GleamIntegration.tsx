import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ListTodo,
  Loader2,
  MessageSquareText,
  RefreshCw,
  UserRound,
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { STATUS_THEME_CLASSES } from "@/lib/statusVisuals";
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

function DetailCell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p
        className="mt-2 truncate text-sm font-medium text-foreground"
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

export function GleamIntegration({
  organizationId,
}: {
  organizationId: number;
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
  const status = connectionActive
    ? {
        label: "Connected",
        classes: STATUS_THEME_CLASSES.green.badgeClass,
        icon: CheckCircle2,
      }
    : pairing?.state === "claimed"
      ? {
          label: "Review required",
          classes: STATUS_THEME_CLASSES.orange.badgeClass,
          icon: Clock3,
        }
      : pairing?.state === "approved"
        ? {
            label: "Awaiting Gleam",
            classes: STATUS_THEME_CLASSES.orange.badgeClass,
            icon: Clock3,
          }
        : pairing?.state === "unused"
          ? {
              label: "Code ready",
              classes: STATUS_THEME_CLASSES.theme.badgeClass,
              icon: Clock3,
            }
          : {
              label: "Not connected",
              classes: STATUS_THEME_CLASSES.gray.badgeClass,
              icon: Clock3,
            };
  const StatusIcon = status.icon;

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
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 border-b bg-muted/20 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-background shadow-sm">
            <ServiceMark service="gleam" className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Gleam</h2>
              <Badge className={status.classes}>
                <StatusIcon className="mr-1 h-3 w-3" />
                {status.label}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn voice call outcomes into assigned Itemize follow-ups.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={refresh}
          aria-label="Refresh Gleam connection status"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2 hidden sm:inline">Refresh</span>
        </Button>
      </CardHeader>

      <CardContent className="space-y-5 p-5 sm:p-6">
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
            <div
              className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-950 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-medium">
                  Connected to {pairing.source_name}
                </p>
                <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                  New Gleam voice follow-ups can create assigned tasks in
                  Itemize.
                </p>
                <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                  Tasks are assigned to {selectedAssignee}, due within{" "}
                  {pairing.due_after_minutes / 60} hours.
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Delivery routing
              </p>
              <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
                <DetailCell
                  icon={Building2}
                  label="From"
                  value={pairing.source_name}
                />
                <DetailCell
                  icon={ArrowRight}
                  label="To"
                  value={overview.organizationName}
                />
                <DetailCell
                  icon={UserRound}
                  label="Assignee"
                  value={selectedAssignee}
                />
                <DetailCell
                  icon={Clock3}
                  label="Due within"
                  value={formatDueWindow(pairing.due_after_minutes)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Delivered after qualifying calls
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1">
                    <ListTodo className="h-3.5 w-3.5 text-icon-accent" />{" "}
                    Follow-up tasks
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1">
                    <MessageSquareText className="h-3.5 w-3.5 text-icon-accent" />{" "}
                    Call summaries
                  </span>
                </div>
              </div>
              {pairing.connection_id && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
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
                        {pairing.source_name}. Existing tasks and call summaries
                        will remain.
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
              <p className="font-medium">Approved for {pairing.source_name}</p>
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
                              .map((byte) => byte.toString(16).padStart(2, "0"))
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
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
      </CardContent>
    </Card>
  );
}

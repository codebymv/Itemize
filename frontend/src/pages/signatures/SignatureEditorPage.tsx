import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Check,
  CheckCircle,
  Clock,
  Download,
  FileSignature,
  FileText,
  History,
  Info,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Route,
  Save,
  Send,
  Settings2,
  Trash2,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/EmptyState";
import { PreviewPlaceholder } from "@/components/preview/PreviewPlaceholder";
import { ErrorState } from "@/components/ErrorState";
import {
  HeaderAction,
  HeaderActionLabel,
} from "@/components/layout/DesktopHeaderTools";
import { PageLayout } from "@/components/layout/PageLayout";
import { EntityDetailHeader } from "@/components/layout/EntityDetailHeader";
import { ResponsiveCardRail } from "@/components/layout/ResponsiveCardRail";
import { FramedSection } from "@/components/ui/framed-section";
import { ShellBackButton } from "@/components/layout/ShellBackButton";
import { StatCard } from "@/components/StatCard";
import { CardGridSkeleton } from "@/components/ui/loading-skeletons";
import { SectionCardTitle } from "@/components/ui/section-card-title";
import { useAuthState } from "@/contexts/AuthContext";
import { useDirtyState } from "@/hooks/useDirtyState";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { cn } from "@/lib/utils";
import { QUERY_STALE_TIME_MS, shouldRetryQuery } from "@/lib/queryPolicy";
import { getInvoice, getInvoicePdf } from "@/services/invoicesApi";
import {
  cancelSignatureDocument,
  createSignatureDocument,
  deleteSignatureDocument,
  deleteSignatureDocumentFile,
  downloadSignedDocument,
  getSignatureDocument,
  remindSignatureDocument,
  retrySignatureDocument,
  sendSignatureDocument,
  type SignatureDocument,
  type SignatureDocumentDetails,
  type SignatureField,
  type SignatureRecipient,
  updateSignatureDocument,
  uploadSignatureDocument,
} from "@/services/signaturesApi";
import FieldPlacementCanvas from "./components/FieldPlacementCanvas";
import SendSignatureModal from "./components/SendSignatureModal";
import {
  getRecipientStatusVisual,
  getSignatureOperationalVisual,
  getSignatureStatusVisual,
} from "./constants/signatureConstants";
import {
  getSignatureDraftReadiness,
  getSignatureRecipientSummary,
  hasSignatureProcessingFailure,
  isSignatureDocumentEditable,
} from "./signatureDetailModel";

const formatDateTime = (value?: string | null): string => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatAuditEvent = (eventType: string): string =>
  eventType
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function SignatureEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { currentUser } = useAuthState();
  const {
    organizationId,
    isLoading: organizationLoading,
    error: organizationError,
  } = useOrganization();
  const queryClient = useQueryClient();

  const [document, setDocument] = useState<SignatureDocument | null>(null);
  const [audit, setAudit] = useState<SignatureDocumentDetails["audit"]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [recipients, setRecipients] = useState<SignatureRecipient[]>([]);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [routingMode, setRoutingMode] = useState<"parallel" | "sequential">(
    "parallel",
  );
  const [working, setWorking] = useState(false);
  const [initialized, setInitialized] = useState(!id);
  const [showSendModal, setShowSendModal] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const invoicePrefillStartedRef = useRef(false);
  const initializedDocumentKeyRef = useRef<string | null>(id ? null : "new");

  const isExisting = Boolean(id);
  const parsedDocumentId = id ? Number(id) : null;
  const documentId = parsedDocumentId !== null
    && Number.isSafeInteger(parsedDocumentId)
    && parsedDocumentId > 0
    ? parsedDocumentId
    : null;
  const invalidDocumentId = isExisting && documentId === null;
  const documentQueryKey = [
    "signature-document-editor",
    organizationId,
    documentId,
  ] as const;
  const documentQuery = useQuery({
    queryKey: documentQueryKey,
    queryFn: ({ signal }) => getSignatureDocument(
      documentId as number,
      organizationId as number,
      signal,
    ),
    enabled: isExisting
      && !invalidDocumentId
      && organizationId !== null,
    staleTime: QUERY_STALE_TIME_MS,
    retry: shouldRetryQuery,
  });
  const editable = isSignatureDocumentEditable(document);
  const roleChoices = useMemo(
    () => ["Signer", "Witness", "Approver", "Observer"],
    [],
  );
  const roleOptions = useMemo(
    () =>
      recipients
        .map((recipient) => recipient.role_name)
        .filter((role): role is string => Boolean(role)),
    [recipients],
  );

  useEffect(() => {
    const data = documentQuery.data;
    if (!data || !organizationId || !documentId) return;

    setDocument(data.document);
    setAudit(data.audit || []);

    const initializationKey = `${organizationId}:${documentId}`;
    if (initializedDocumentKeyRef.current === initializationKey) return;
    initializedDocumentKeyRef.current = initializationKey;
    setTitle(data.document.title || "");
    setDescription(data.document.description || "");
    setMessage(data.document.message || "");
    setRoutingMode(data.document.routing_mode || "parallel");
    setRecipients(data.recipients || []);
    setFields(data.fields || []);
    setInitialized(true);
  }, [documentId, documentQuery.data, organizationId]);

  useEffect(() => {
    if (id) return;
    const contactName = searchParams.get("contactName");
    const contactEmail = searchParams.get("contactEmail");
    if (!contactName && !contactEmail) return;
    setRecipients((current) =>
      current.length
        ? current
        : [
            {
              id: 0,
              name: contactName || "",
              email: contactEmail || "",
              role_name: "Signer",
              order_index: 0,
            } as unknown as SignatureRecipient,
          ],
    );
  }, [id, searchParams]);

  useEffect(() => {
    const invoiceId = Number(searchParams.get("invoiceId"));
    if (
      id ||
      !organizationId ||
      !Number.isSafeInteger(invoiceId) ||
      invoiceId < 1 ||
      invoicePrefillStartedRef.current
    )
      return;
    invoicePrefillStartedRef.current = true;
    setWorking(true);
    Promise.all([
      getInvoice(invoiceId, organizationId),
      getInvoicePdf(invoiceId, organizationId),
    ])
      .then(([invoice, pdf]) => {
        const recipientEmail = invoice.customer_email || invoice.contact_email;
        const invoiceFilename = `${invoice.invoice_number.replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
        setTitle(
          (current) =>
            current || `Invoice ${invoice.invoice_number} - Signature`,
        );
        setMessage(
          (current) =>
            current || "Please review and sign the attached invoice.",
        );
        setFile(
          new File([pdf.blob], invoiceFilename || pdf.filename, {
            type: pdf.blob.type || "application/pdf",
          }),
        );
        if (recipientEmail)
          setRecipients((current) =>
            current.length
              ? current
              : [
                  {
                    id: 0,
                    document_id: 0,
                    organization_id: organizationId,
                    name:
                      invoice.customer_name ||
                      [invoice.contact_first_name, invoice.contact_last_name]
                        .filter(Boolean)
                        .join(" "),
                    email: recipientEmail,
                    role_name: "Signer",
                    status: "pending",
                    signing_order: 1,
                  } as SignatureRecipient,
                ],
          );
      })
      .catch(() => {
        invoicePrefillStartedRef.current = false;
        toast({
          title: "Invoice could not be prepared",
          description:
            "Return to the invoice and try Send for Signature again.",
          variant: "destructive",
        });
      })
      .finally(() => setWorking(false));
  }, [id, organizationId, searchParams, toast]);

  const documentDraft = useMemo(
    () => ({
      title,
      description,
      message,
      routingMode,
      recipients,
      fields,
      pendingFile: file
        ? { name: file.name, size: file.size, lastModified: file.lastModified }
        : null,
    }),
    [description, fields, file, message, recipients, routingMode, title],
  );
  const { isDirty, markClean } = useDirtyState({
    value: documentDraft,
    ready: initialized && editable,
    resetKey: id ?? "new",
  });
  const { confirmLeave } = useUnsavedChangesGuard({
    when: editable && isDirty,
    message: "This document has unsaved changes. Leave without saving them?",
  });
  const readiness = useMemo(
    () =>
      getSignatureDraftReadiness({
        title,
        hasFile: Boolean(file || document?.file_url),
        recipients,
        fields,
      }),
    [document?.file_url, fields, file, recipients, title],
  );
  const recipientSummary = useMemo(
    () => getSignatureRecipientSummary(recipients),
    [recipients],
  );
  const statusVisual = document
    ? getSignatureOperationalVisual(document)
    : getSignatureStatusVisual("draft");
  const StatusIcon = statusVisual.icon;
  const processingFailure = Boolean(
    document && hasSignatureProcessingFailure(document),
  );
  const routeLoading = organizationLoading
    || (isExisting && !invalidDocumentId && documentQuery.isPending);
  const loadError = invalidDocumentId
    ? "This document link is invalid."
    : organizationError
      || (documentQuery.error && !documentQuery.data
        ? "This document could not be loaded. Please try again."
        : null);

  const cacheDocumentDetails = (
    updatedDocument: SignatureDocument,
    detailOverrides: Partial<Pick<SignatureDocumentDetails, "recipients" | "fields" | "audit">> = {},
  ) => {
    if (!organizationId) return;
    queryClient.setQueryData<SignatureDocumentDetails>(
      ["signature-document-editor", organizationId, updatedDocument.id],
      (current) => ({
        document: updatedDocument,
        recipients: detailOverrides.recipients
          ?? current?.recipients
          ?? recipients,
        fields: detailOverrides.fields ?? current?.fields ?? fields,
        audit: detailOverrides.audit ?? current?.audit ?? audit,
      }),
    );
  };

  const refreshOperationalState = () => {
    if (!documentQuery.isEnabled) return;
    void documentQuery.refetch();
  };

  const handleCreateOrSave = async () => {
    if (!editable || !organizationId) return;
    setWorking(true);
    try {
      let target = document;
      const created = !target;
      if (!target)
        target = await createSignatureDocument({
          title: title.trim() || "Untitled document",
          description,
          message,
          routing_mode: routingMode,
        }, organizationId);
      if (file) target = await uploadSignatureDocument(target.id, file, organizationId);
      const updated = await updateSignatureDocument(target.id, {
        title: title.trim() || "Untitled document",
        description,
        message,
        sender_name: currentUser?.name || target.sender_name || undefined,
        sender_email: currentUser?.email || target.sender_email || undefined,
        routing_mode: routingMode,
        recipients,
        fields,
      }, organizationId);
      setDocument(updated);
      setTitle(updated.title || title);
      setFile(null);
      cacheDocumentDetails(updated, { recipients, fields });
      markClean({
        ...documentDraft,
        title: updated.title || title,
        pendingFile: null,
      });
      toast({ title: created ? "Draft created" : "Document updated" });
      if (created) {
        initializedDocumentKeyRef.current = `${organizationId}:${updated.id}`;
        navigate(`/documents/${updated.id}`, { replace: true });
      }
    } catch {
      toast({
        title: "Document could not be saved",
        description: "Review the draft and try again.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const handleClearFile = async () => {
    if (!editable || !organizationId) return;
    if (document?.id && document.file_url && !file) {
      setWorking(true);
      try {
        const updated = await deleteSignatureDocumentFile(document.id, organizationId);
        setDocument(updated);
        cacheDocumentDetails(updated);
        toast({ title: "PDF removed" });
      } catch {
        toast({ title: "PDF could not be removed", variant: "destructive" });
      } finally {
        setWorking(false);
      }
      return;
    }
    setFile(null);
  };

  const handleSend = async (options: { message: string }) => {
    if (!document || !organizationId || !readiness.ready || isDirty) return;
    setWorking(true);
    try {
      setMessage(options.message);
      const updated = await updateSignatureDocument(document.id, {
        recipients,
        fields,
        routing_mode: routingMode,
        message: options.message,
        sender_name: currentUser?.name || document.sender_name || undefined,
        sender_email: currentUser?.email || document.sender_email || undefined,
      }, organizationId);
      cacheDocumentDetails(updated, { recipients, fields });
      await sendSignatureDocument(document.id, organizationId);
      void queryClient.invalidateQueries({ queryKey: ["signature-documents", organizationId] });
      toast({ title: "Signature request sent" });
      setShowSendModal(false);
      navigate("/documents");
    } catch {
      toast({
        title: "Signature request could not be sent",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const handleRemind = async () => {
    if (!document || !organizationId) return;
    setWorking(true);
    try {
      const updated = await remindSignatureDocument(document.id, organizationId);
      setDocument(updated);
      cacheDocumentDetails(updated);
      toast({ title: "Signature reminder queued" });
      refreshOperationalState();
    } catch {
      toast({ title: "Reminder could not be sent", variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  const handleRetry = async () => {
    if (!document || !organizationId) return;
    setWorking(true);
    try {
      const updated = await retrySignatureDocument(document.id, organizationId);
      setDocument(updated);
      cacheDocumentDetails(updated);
      toast({ title: "Failed step queued for retry" });
      refreshOperationalState();
    } catch {
      toast({ title: "Retry unavailable", variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  const handleCancel = async () => {
    if (!document || !organizationId) return;
    setWorking(true);
    try {
      const updated = await cancelSignatureDocument(document.id, organizationId);
      setDocument(updated);
      cacheDocumentDetails(updated);
      toast({ title: "Signature request cancelled" });
      refreshOperationalState();
    } catch {
      toast({
        title: "Request could not be cancelled",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const handleDownload = () => {
    if (document)
      window.open(
        downloadSignedDocument(document.id).url,
        "_blank",
        "noopener,noreferrer",
      );
  };
  const handleDelete = async (): Promise<boolean> => {
    if (!document || !organizationId) return false;
    try {
      await deleteSignatureDocument(document.id, organizationId);
      queryClient.removeQueries({
        queryKey: ["signature-document-editor", organizationId, document.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["signature-documents", organizationId] });
      navigate("/documents");
      return true;
    } catch {
      return false;
    }
  };

  const addRecipient = () =>
    setRecipients((current) => [
      ...current,
      {
        id: Date.now(),
        document_id: document?.id || 0,
        organization_id: document?.organization_id || 0,
        name: "",
        email: "",
        role_name: "Signer",
        status: "pending",
        signing_order: current.length + 1,
      },
    ]);
  const updateRecipient = (
    index: number,
    updates: Partial<SignatureRecipient>,
  ) =>
    setRecipients((current) =>
      current.map((recipient, position) =>
        position === index ? { ...recipient, ...updates } : recipient,
      ),
    );
  const removeRecipient = (index: number) =>
    setRecipients((current) =>
      current.filter((_, position) => position !== index),
    );
  const goBack = () => {
    if (confirmLeave()) navigate("/documents");
  };

  const hasMoreActions = Boolean(
    document && ["draft", "sent", "in_progress"].includes(document.status),
  );
  const moreActions =
    document && hasMoreActions ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="h-11 min-w-11 gap-2 px-3 font-light"
            aria-label="Document actions"
            disabled={working}
          >
            <MoreHorizontal className="h-4 w-4" />
            <HeaderActionLabel>More</HeaderActionLabel>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(document.status === "sent" ||
            document.status === "in_progress") && (
            <DropdownMenuItem
              onClick={() => void handleCancel()}
              className="text-destructive focus:text-destructive"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel request
            </DropdownMenuItem>
          )}
          {document.status === "draft" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete document
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const primaryAction = !document ? (
    <HeaderAction
      label="Create document"
      icon={<Save className="h-4 w-4" />}
      onClick={() => void handleCreateOrSave()}
      disabled={working || !isDirty || !title.trim()}
    />
  ) : editable ? (
    <HeaderAction
      label="Send document"
      icon={<Send className="h-4 w-4" />}
      onClick={() => setShowSendModal(true)}
      disabled={working || isDirty || !readiness.ready}
    />
  ) : processingFailure ? (
    <HeaderAction
      label="Retry"
      icon={<RefreshCw className="h-4 w-4" />}
      onClick={() => void handleRetry()}
      disabled={working}
    />
  ) : document.status === "sent" || document.status === "in_progress" ? (
    <HeaderAction
      label="Send reminder"
      icon={<Mail className="h-4 w-4" />}
      onClick={() => void handleRemind()}
      disabled={working}
    />
  ) : document.status === "completed" ? (
    <HeaderAction
      label="Download"
      icon={<Download className="h-4 w-4" />}
      onClick={handleDownload}
      disabled={working}
    />
  ) : undefined;

  const secondaryAction =
    editable && document ? (
      <div className="flex items-center gap-2">
        <HeaderAction
          label="Save changes"
          icon={<Save className="h-4 w-4" />}
          onClick={() => void handleCreateOrSave()}
          disabled={working || !isDirty}
          prominence="secondary"
        />
        {moreActions}
      </div>
    ) : (
      moreActions
    );

  return (
    <PageLayout
      title={isExisting ? "DOCUMENT" : "NEW DOCUMENT"}
      icon={
        <FileSignature className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
      }
      leading={<ShellBackButton label="Back to documents" onClick={goBack} />}
      headerTools={{
        status: document ? (
          <Badge
            className={cn(
              "pointer-events-none whitespace-nowrap",
              statusVisual.badgeClass,
            )}
          >
            {statusVisual.label}
          </Badge>
        ) : undefined,
        secondaryAction,
        primaryAction,
      }}
    >
      {loadError ? (
        <ErrorState
          title="Document unavailable"
          description={loadError}
          onAction={invalidDocumentId
            ? undefined
            : () => void documentQuery.refetch()}
        />
      ) : routeLoading && isExisting && !document ? (
        <CardGridSkeleton count={2} columns={2} height="h-80" />
      ) : (
        <>
          <EntityDetailHeader
            icon={
              <StatusIcon className={cn("h-6 w-6", statusVisual.iconClass)} />
            }
            iconClassName={statusVisual.iconBackgroundClass}
            title={title || "New document"}
            statusHandoff="xl"
            mobileStatus={
              document ? (
                <Badge className={statusVisual.badgeClass}>
                  {statusVisual.label}
                </Badge>
              ) : undefined
            }
            metadata={
              <>
                {document?.document_number && (
                  <span>{document.document_number}</span>
                )}
                <span>
                  {recipients.length} recipient
                  {recipients.length === 1 ? "" : "s"}
                </span>
                {document ? (
                  <span>Created {formatDateTime(document.created_at)}</span>
                ) : (
                  <span>Not saved yet</span>
                )}
                {document?.sent_at && (
                  <span>Sent {formatDateTime(document.sent_at)}</span>
                )}
                {document?.completed_at && (
                  <span className="text-green-600 dark:text-green-400">
                    Completed {formatDateTime(document.completed_at)}
                  </span>
                )}
              </>
            }
          />

          {editable ? (
            <DraftDocumentEditor
              document={document}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              message={message}
              setMessage={setMessage}
              file={file}
              setFile={setFile}
              recipients={recipients}
              fields={fields}
              setFields={setFields}
              routingMode={routingMode}
              setRoutingMode={setRoutingMode}
              roleChoices={roleChoices}
              roleOptions={roleOptions}
              readiness={readiness}
              working={working}
              fileInputRef={fileInputRef}
              addRecipient={addRecipient}
              updateRecipient={updateRecipient}
              removeRecipient={removeRecipient}
              clearFile={handleClearFile}
            />
          ) : document ? (
            <ReadOnlyDocumentDetail
              document={document}
              recipients={recipients}
              fields={fields}
              audit={audit}
              roleOptions={roleOptions}
              summary={recipientSummary}
            />
          ) : null}

          {document && editable && (
            <SendSignatureModal
              open={showSendModal}
              onOpenChange={setShowSendModal}
              onSend={handleSend}
              sending={working}
              documentTitle={title}
              senderName={
                document.sender_name || currentUser?.name || "Itemize"
              }
              senderEmail={document.sender_email || currentUser?.email}
              recipients={recipients}
              message={message}
              onMessageChange={setMessage}
              hasFile={Boolean(file || document.file_url)}
              expiresAt={document.expires_at || null}
              routingMode={routingMode}
              onRoutingModeChange={setRoutingMode}
            />
          )}
          {document && (
            <DeleteDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              onConfirm={handleDelete}
              itemType="document"
              itemTitle={document.title}
            />
          )}
        </>
      )}
    </PageLayout>
  );
}

interface DraftEditorProps {
  document: SignatureDocument | null;
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  file: File | null;
  setFile: (value: File | null) => void;
  recipients: SignatureRecipient[];
  fields: SignatureField[];
  setFields: (value: SignatureField[]) => void;
  routingMode: "parallel" | "sequential";
  setRoutingMode: (value: "parallel" | "sequential") => void;
  roleChoices: string[];
  roleOptions: string[];
  readiness: ReturnType<typeof getSignatureDraftReadiness>;
  working: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  addRecipient: () => void;
  updateRecipient: (
    index: number,
    updates: Partial<SignatureRecipient>,
  ) => void;
  removeRecipient: (index: number) => void;
  clearFile: () => Promise<void>;
}

function DraftDocumentEditor({
  document,
  title,
  setTitle,
  description,
  setDescription,
  message,
  setMessage,
  file,
  setFile,
  recipients,
  fields,
  setFields,
  routingMode,
  setRoutingMode,
  roleChoices,
  roleOptions,
  readiness,
  working,
  fileInputRef,
  addRecipient,
  updateRecipient,
  removeRecipient,
  clearFile,
}: DraftEditorProps) {
  const checks = [
    { label: "Document title", complete: readiness.hasTitle },
    { label: "PDF attached", complete: readiness.hasFile },
    { label: "Recipients complete", complete: readiness.recipientsComplete },
    { label: "Signature fields placed", complete: readiness.hasFields },
  ];
  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <SectionCardTitle icon={Settings2}>
                Document setup
              </SectionCardTitle>
            </CardHeader>
            <CardContent surface="inset" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="document-title">Title</Label>
                <Input
                  id="document-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Client service agreement"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-description">Description</Label>
                <Input
                  id="document-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional context shown in Itemize"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-message">Recipient message</Label>
                <Textarea
                  id="document-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Please review and sign this document."
                  className="min-h-24"
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <SectionCardTitle icon={Users}>
                Recipients and routing
              </SectionCardTitle>
              <Button variant="outline" size="sm" onClick={addRecipient}>
                <Plus className="mr-2 h-4 w-4" />
                Add recipient
              </Button>
            </CardHeader>
            <CardContent surface="inset" className="space-y-4">
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium">Signing order</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="About signing order"
                        className="interaction-control flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Choose whether recipients sign together or in sequence.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={routingMode}
                  onValueChange={(value) =>
                    setRoutingMode(value as "parallel" | "sequential")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parallel">Any order</SelectItem>
                    <SelectItem value="sequential">In sequence</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {recipients.length === 0 ? (
                <EmptyState
                  icon={Users}
                  kind="inline"
                  title="No recipients yet"
                  description="Add someone who needs to sign or approve."
                />
              ) : (
                recipients.map((recipient, index) => (
                  <div
                    key={recipient.id}
                    className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem_auto] md:items-start"
                  >
                    <Input
                      aria-label={`Recipient ${index + 1} name`}
                      placeholder="Name"
                      value={recipient.name || ""}
                      onChange={(event) =>
                        updateRecipient(index, { name: event.target.value })
                      }
                    />
                    <Input
                      aria-label={`Recipient ${index + 1} email`}
                      type="email"
                      placeholder="Email"
                      value={recipient.email || ""}
                      onChange={(event) =>
                        updateRecipient(index, { email: event.target.value })
                      }
                    />
                    <div className="space-y-2">
                      <Select
                        value={
                          roleChoices.includes(recipient.role_name || "")
                            ? recipient.role_name || ""
                            : "custom"
                        }
                        onValueChange={(value) =>
                          updateRecipient(index, {
                            role_name: value === "custom" ? "" : value,
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label={`Recipient ${index + 1} role`}
                        >
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roleChoices.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom...</SelectItem>
                        </SelectContent>
                      </Select>
                      {!roleChoices.includes(recipient.role_name || "") && (
                        <Input
                          aria-label={`Recipient ${index + 1} custom role`}
                          placeholder="Custom role"
                          value={recipient.role_name || ""}
                          onChange={(event) =>
                            updateRecipient(index, {
                              role_name: event.target.value,
                            })
                          }
                        />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove recipient ${index + 1}`}
                      onClick={() => removeRecipient(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <SectionCardTitle icon={Upload}>PDF source</SectionCardTitle>
            </CardHeader>
            <CardContent surface="inset" className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={working}
              >
                <Upload className="mr-2 h-4 w-4" />
                {file || document?.file_name ? "Replace PDF" : "Choose PDF"}
              </Button>
              {file || document?.file_name ? (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <FileText className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {file?.name || document?.file_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {file
                        ? "Ready to save"
                        : `${document?.page_count || 1} page${document?.page_count === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove PDF"
                    onClick={() => void clearFile()}
                    disabled={working}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <SectionCardTitle icon={CheckCircle}>
                Send readiness
              </SectionCardTitle>
            </CardHeader>
            <CardContent surface="inset" className="space-y-3">
              {checks.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full",
                      item.complete
                        ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.complete ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <span>{item.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader>
          <SectionCardTitle icon={FileSignature}>
            Field placement
          </SectionCardTitle>
        </CardHeader>
        <CardContent surface="inset" className="p-0">
          <FieldPlacementCanvas
            fields={fields}
            onChange={setFields}
            fileUrl={document?.file_url || ""}
            roles={roleOptions}
            localFile={file}
            documentId={document?.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnlyDocumentDetail({
  document,
  recipients,
  fields,
  audit,
  roleOptions,
  summary,
}: {
  document: SignatureDocument;
  recipients: SignatureRecipient[];
  fields: SignatureField[];
  audit: SignatureDocumentDetails["audit"];
  roleOptions: string[];
  summary: ReturnType<typeof getSignatureRecipientSummary>;
}) {
  return (
    <div className="space-y-6">
      <FramedSection title="Recipient status" icon={Users}>
        <ResponsiveCardRail
          label="Document recipient summary"
          desktopColumns="md:grid-cols-2 lg:grid-cols-4"
          className="responsive-stat-summary mb-0"
        >
          <StatCard
            title="Document recipients"
            badgeText="Recipients"
            value={summary.total}
            icon={Users}
            description="Assigned to this request"
            colorTheme="blue"
          />
          <StatCard
            title="Recipients still active"
            badgeText="Waiting"
            value={summary.waiting}
            icon={Clock}
            description="Sent or underway"
            colorTheme="orange"
          />
          <StatCard
            title="Completed signatures"
            badgeText="Signed"
            value={summary.signed}
            icon={CheckCircle}
            description="Signatures collected"
            colorTheme="green"
          />
          <StatCard
            title="Recipients needing attention"
            badgeText="Attention"
            value={summary.attention}
            icon={AlertCircle}
            description="Declined or failed"
            colorTheme="red"
          />
        </ResponsiveCardRail>
      </FramedSection>
      <div className="grid items-stretch gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <SectionCardTitle icon={FileSignature}>
              {document.status === "completed"
                ? "Signed document"
                : "Document snapshot"}
            </SectionCardTitle>
          </CardHeader>
          <CardContent surface="inset" className="p-0">
            {(
              document.status === "completed"
                ? document.signed_file_url
                : document.file_url
            ) ? (
              <FieldPlacementCanvas
                fields={document.status === "completed" ? [] : fields}
                onChange={() => undefined}
                fileUrl={
                  (document.status === "completed"
                    ? document.signed_file_url
                    : document.file_url) || ""
                }
                roles={roleOptions}
                documentId={document.id}
                readOnly
              />
            ) : (
              <PreviewPlaceholder
                icon={FileSignature}
                title="No PDF available"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionCardTitle icon={Settings2}>
              Document details
            </SectionCardTitle>
          </CardHeader>
          <CardContent surface="inset" className="space-y-4 text-sm">
            <Detail
              label="Routing"
              value={
                document.routing_mode === "sequential"
                  ? "In sequence"
                  : "Any order"
              }
            />
            <Detail
              label="Sender"
              value={`${document.sender_name || "Not set"}${document.sender_email ? ` · ${document.sender_email}` : ""}`}
            />
            <Detail
              label="Source PDF"
              value={document.file_name || "Not available"}
            />
            <Detail
              label="Pages"
              value={String(document.page_count || "Not available")}
            />
            <Detail label="Sent" value={formatDateTime(document.sent_at)} />
            {document.expires_at && (
              <Detail
                label="Expires"
                value={formatDateTime(document.expires_at)}
              />
            )}
            {document.completed_at && (
              <Detail
                label="Completed"
                value={formatDateTime(document.completed_at)}
                success
              />
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <SectionCardTitle icon={Route}>Recipient delivery</SectionCardTitle>
        </CardHeader>
        <CardContent surface="inset" className="p-0">
          {recipients.length === 0 ? (
            <EmptyState
              icon={Users}
              kind="inline"
              title="No recipient records"
              description="Delivery records will appear after recipients are added."
              className="py-10"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Latest activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((recipient) => {
                    const visual = getRecipientStatusVisual(recipient);
                    const latestActivity =
                      recipient.signed_at ||
                      recipient.declined_at ||
                      recipient.viewed_at ||
                      recipient.sent_at;
                    return (
                      <TableRow key={recipient.id}>
                        <TableCell>
                          <p className="font-medium">
                            {recipient.name || "Unnamed recipient"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {recipient.email}
                          </p>
                        </TableCell>
                        <TableCell>{recipient.role_name || "Signer"}</TableCell>
                        <TableCell>
                          <Badge className={visual.badgeClass}>
                            {visual.label}
                          </Badge>
                          {recipient.decline_reason && (
                            <p className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">
                              {recipient.decline_reason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(latestActivity)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SectionCardTitle icon={History}>Audit history</SectionCardTitle>
        </CardHeader>
        <CardContent surface="inset" className="p-0">
          {audit.length === 0 ? (
            <EmptyState
              icon={History}
              kind="inline"
              title="No audit events yet"
            />
          ) : (
            <div className="divide-y rounded-lg border">
              {audit.map((event) => {
                const recipient = recipients.find(
                  (item) => item.id === event.recipient_id,
                );
                return (
                  <div
                    key={event.id}
                    className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {formatAuditEvent(event.event_type)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {event.description ||
                          (recipient
                            ? `${recipient.name || recipient.email} · ${recipient.email}`
                            : "Document activity")}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(event.created_at)}
                    </time>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({
  label,
  value,
  success = false,
}: {
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 break-words font-medium",
          success && "text-green-600 dark:text-green-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

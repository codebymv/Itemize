import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  StickyNote,
  CheckSquare,
  Palette,
  GitBranch,
  KeyRound,
  Copy,
  ShieldCheck,
  Circle,
  CircleCheck,
  CircleX,
  ArrowLeft,
  CalendarCheck,
  ChevronRight,
  FileText,
  Footprints,
  Info,
  LayoutDashboard,
  LogIn,
  PanelTop,
  PhoneCall,
  Plus,
  Presentation,
  Rocket,
  Scale,
  Send,
  Smartphone,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
} from "./ui/dialog";
import { ModalBody, ModalContent, ModalFooter, ModalHeader } from "./ui/modal";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ColorPicker } from "./ui/color-picker";
import { UI_COLORS, UI_LABELS } from "@/constants/ui";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "./ui/form";
import {
  createItemFormSchema,
  type CreateItemFormValues,
} from "@/lib/formSchemas";
import { Checkbox } from "./ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  discardPreparedVaultSession,
  prepareNewVaultSecurity,
  type PreparedVaultSecurity,
} from "@/lib/vaultZkSession";
import {
  getContentPresets,
  isPresetItemType,
  type ContentPreset,
  type CreateItemPresetPayload,
  type PresetIconName,
} from "@/config/contentPresets";

interface LocalCategory {
  name: string;
  color_value?: string;
}

type ItemType = "note" | "list" | "whiteboard" | "wireframe" | "vault";

interface CreateItemModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isOpen?: boolean;
  onClose?: () => void;
  itemType: ItemType;
  onCreate: (
    title: string,
    category: string,
    color: string,
    position: { x: number; y: number },
    vaultSecurity?: PreparedVaultSecurity,
    presetPayload?: CreateItemPresetPayload,
  ) => Promise<unknown> | void;
  existingCategories: LocalCategory[];
  position?: { x: number; y: number };
  updateCategory?: (categoryName: string, newColor: string) => void;
}

const itemConfig = {
  note: {
    label: "Note",
    icon: StickyNote,
    titlePlaceholder: "Enter note title",
    defaultColor: UI_COLORS.brandBlue,
    requireResult: false,
    showValidationError: false,
  },
  list: {
    label: "List",
    icon: CheckSquare,
    titlePlaceholder: "Enter list title",
    defaultColor: UI_COLORS.brandBlue,
    requireResult: true,
    showValidationError: true,
  },
  whiteboard: {
    label: "Whiteboard",
    icon: Palette,
    titlePlaceholder: "Enter whiteboard title",
    defaultColor: UI_COLORS.brandBlue,
    requireResult: false,
    showValidationError: false,
  },
  wireframe: {
    label: "Wireframe",
    icon: GitBranch,
    titlePlaceholder: "Enter wireframe title",
    defaultColor: UI_COLORS.brandBlue,
    requireResult: false,
    showValidationError: false,
  },
  vault: {
    label: "Vault",
    icon: KeyRound,
    titlePlaceholder: "Enter vault title",
    defaultColor: UI_COLORS.brandBlue,
    requireResult: true,
    showValidationError: false,
  },
};

const VAULT_PASSWORD_MIN_LENGTH = 8;

const presetIconMap: Record<
  PresetIconName,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  rocket: Rocket,
  "user-plus": UserPlus,
  "calendar-check": CalendarCheck,
  send: Send,
  presentation: Presentation,
  "file-text": FileText,
  "phone-call": PhoneCall,
  scale: Scale,
  "panel-top": PanelTop,
  "layout-dashboard": LayoutDashboard,
  smartphone: Smartphone,
  "log-in": LogIn,
};

const VaultPasswordRequirement = ({
  status,
  children,
}: {
  status: "neutral" | "met" | "unmet";
  children: React.ReactNode;
}) => (
  <span
    className={`inline-flex items-center gap-1.5 ${
      status === "met"
        ? "text-green-600 dark:text-green-400"
        : status === "unmet"
          ? "text-red-600 dark:text-red-400"
          : "text-muted-foreground"
    }`}
    data-vault-password-requirement-status={status}
  >
    {status === "met" ? (
      <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
    ) : status === "unmet" ? (
      <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
    ) : (
      <Circle className="h-3.5 w-3.5" aria-hidden="true" />
    )}
    {children}
  </span>
);

export const CreateItemModal: React.FC<CreateItemModalProps> = ({
  open,
  onOpenChange,
  isOpen,
  onClose,
  itemType,
  onCreate,
  existingCategories,
  position,
  updateCategory,
}) => {
  const resolvedOpen = open ?? isOpen ?? false;
  const handleOpenChange =
    onOpenChange ??
    ((nextOpen: boolean) => {
      if (!nextOpen) onClose?.();
    });
  const config = itemConfig[itemType];
  const Icon = config.icon;
  const supportsPresets = isPresetItemType(itemType);
  const presets = useMemo(
    () => (isPresetItemType(itemType) ? getContentPresets(itemType) : []),
    [itemType],
  );

  const form = useForm<CreateItemFormValues>({
    resolver: zodResolver(createItemFormSchema),
    defaultValues: {
      title: "",
      category: "",
      newCategory: "",
      isAddingNewCategory: false,
      color: config.defaultColor,
      categoryColor: UI_COLORS.neutralGray,
    },
  });

  const title = form.watch("title") || "";
  const category = form.watch("category") || "";
  const newCategory = form.watch("newCategory") || "";
  const isAddingNewCategory = form.watch("isAddingNewCategory");
  const color = form.watch("color") || config.defaultColor;
  const categoryColor = form.watch("categoryColor") || UI_COLORS.neutralGray;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [vaultPassword, setVaultPassword] = useState("");
  const [confirmVaultPassword, setConfirmVaultPassword] = useState("");
  const [preparedVaultSecurity, setPreparedVaultSecurity] =
    useState<PreparedVaultSecurity | null>(null);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [vaultValidationAttempted, setVaultValidationAttempted] =
    useState(false);
  const [creationStep, setCreationStep] = useState<"source" | "details">(() =>
    supportsPresets ? "source" : "details",
  );
  const [selectedPreset, setSelectedPreset] =
    useState<ContentPreset | null>(null);
  const vaultPasswordHasMinimumLength =
    vaultPassword.length >= VAULT_PASSWORD_MIN_LENGTH;
  const vaultPasswordHasNoWhitespace =
    vaultPassword.length > 0 && !/\s/.test(vaultPassword);
  const vaultPasswordComplete =
    vaultPasswordHasMinimumLength && vaultPasswordHasNoWhitespace;
  const vaultPasswordsMatch =
    vaultPasswordComplete &&
    confirmVaultPassword.length > 0 &&
    vaultPassword === confirmVaultPassword;
  const confirmVaultPasswordMismatch =
    confirmVaultPassword.length > 0 &&
    vaultPassword !== confirmVaultPassword;

  useEffect(() => {
    if (resolvedOpen) {
      form.reset({
        title: "",
        category: "",
        newCategory: "",
        isAddingNewCategory: false,
        color: config.defaultColor,
        categoryColor: UI_COLORS.neutralGray,
      });
      setError("");
      setIsLoading(false);
      setVaultPassword("");
      setConfirmVaultPassword("");
      setPreparedVaultSecurity(null);
      setRecoverySaved(false);
      setRecoveryCopied(false);
      setVaultValidationAttempted(false);
      setCreationStep(supportsPresets ? "source" : "details");
      setSelectedPreset(null);
    }
  }, [resolvedOpen, config.defaultColor, form, supportsPresets]);

  const availableCategories = useMemo(() => {
    const hasGeneral = existingCategories.some((cat) => cat.name === "General");
    return hasGeneral
      ? existingCategories
      : [
          { name: "General", color_value: UI_COLORS.neutralGray },
          ...existingCategories,
        ];
  }, [existingCategories]);

  const getSelectedCategoryColor = () => {
    if (isAddingNewCategory) {
      return categoryColor;
    }
    if (category) {
      return categoryColor;
    }
    return UI_COLORS.neutralGray;
  };

  const handleCategoryColorChange = (newColor: string) => {
    form.setValue("categoryColor", newColor, { shouldDirty: true });
    if (category !== "General") {
      form.setValue("color", newColor, { shouldDirty: true });
    }
    if (category && !isAddingNewCategory && updateCategory) {
      updateCategory(category, newColor);
    }
  };

  const handleSubmit = async (values: CreateItemFormValues) => {
    const selectedCategory = values.isAddingNewCategory
      ? values.newCategory?.trim()
      : values.category?.trim();
    const finalCategory = selectedCategory || "General";

    setIsLoading(true);
    setError("");

    const finalTitle =
      values.title.trim() || config.titlePlaceholder.replace("Enter ", "");

    try {
      if (itemType === "vault") {
        if (!vaultPasswordComplete) {
          setVaultValidationAttempted(true);
          return;
        }
        if (vaultPassword !== confirmVaultPassword) {
          setError("Vault passwords do not match.");
          return;
        }
        const prepared = await prepareNewVaultSecurity(vaultPassword);
        setPreparedVaultSecurity(prepared);
        setRecoverySaved(false);
        setRecoveryCopied(false);
        return;
      }

      const result = await onCreate(
        finalTitle,
        finalCategory,
        values.color || config.defaultColor,
        position || undefined,
        undefined,
        selectedPreset?.createPayload(),
      );

      if (config.requireResult && !result) {
        setError(
          `Failed to create ${config.label.toLowerCase()}. Please try again.`,
        );
        return;
      }

      handleOpenChange(false);
    } catch (err) {
      setError(
        `Failed to create ${config.label.toLowerCase()}. Please try again.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const discardPreparedSecurity = () => {
    if (preparedVaultSecurity) {
      void discardPreparedVaultSession(preparedVaultSecurity.draftSessionId);
    }
    setPreparedVaultSecurity(null);
    setRecoverySaved(false);
    setRecoveryCopied(false);
  };

  const closeModal = () => {
    discardPreparedSecurity();
    setError("");
    handleOpenChange(false);
  };

  const openBlankDetails = () => {
    setSelectedPreset(null);
    form.setValue("title", "");
    setError("");
    setCreationStep("details");
  };

  const openPresetDetails = (preset: ContentPreset) => {
    setSelectedPreset(preset);
    form.setValue("title", preset.defaultTitle, {
      shouldDirty: false,
      shouldValidate: true,
    });
    setError("");
    setCreationStep("details");
  };

  const returnToSourceChoice = () => {
    setError("");
    setCreationStep("source");
  };

  const finishVaultCreation = async () => {
    if (!preparedVaultSecurity || !recoverySaved) return;
    const values = form.getValues();
    const selectedCategory = values.isAddingNewCategory
      ? values.newCategory?.trim()
      : values.category?.trim();
    const finalCategory = selectedCategory || "General";
    const finalTitle =
      values.title.trim() || config.titlePlaceholder.replace("Enter ", "");

    setIsLoading(true);
    setError("");
    try {
      const result = await onCreate(
        finalTitle,
        finalCategory,
        values.color || config.defaultColor,
        position || undefined,
        preparedVaultSecurity,
      );
      if (!result) {
        setError("Failed to create vault. Please try again.");
        return;
      }
      setPreparedVaultSecurity(null);
      handleOpenChange(false);
    } catch {
      setError("Failed to create vault. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!resolvedOpen) return null;

  return (
    <Dialog
      open={resolvedOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          closeModal();
        }
      }}
    >
      <ModalContent size={creationStep === "source" && supportsPresets ? "lg" : "md"}>
        <ModalHeader
          icon={preparedVaultSecurity ? ShieldCheck : Icon}
          leading={
            !preparedVaultSecurity && creationStep === "details" && supportsPresets ? (
                <button
                  type="button"
                  onClick={returnToSourceChoice}
                  className="-ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:hover:bg-blue-950/40"
                  aria-label={`Back to ${config.label.toLowerCase()} creation choices`}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
            ) : null
          }
          title={preparedVaultSecurity
              ? "Save recovery key"
              : `Add ${config.label}`}
          description={
            preparedVaultSecurity
              ? "Save this key. It is the only way to recover the vault."
              : creationStep === "source" && supportsPresets
                ? `Start with an empty ${config.label.toLowerCase()} or use a curated preset.`
                : selectedPreset
                  ? `Using the ${selectedPreset.name} preset. You can edit the details before creating it.`
                  : itemType === "vault"
                    ? "Name the vault and set its security before creating it."
                    : `Choose the details for the new ${config.label.toLowerCase()}.`
          }
        />

        {preparedVaultSecurity ? (
          <>
          <ModalBody className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="vaultRecoveryKey">Recovery key</Label>
              <div className="flex gap-2">
                <Input
                  id="vaultRecoveryKey"
                  readOnly
                  value={preparedVaultSecurity.recoverySecret}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Copy recovery key"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      preparedVaultSecurity.recoverySecret,
                    );
                    setRecoveryCopied(true);
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {recoveryCopied && (
                <p className="text-xs text-blue-600">Recovery key copied.</p>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                checked={recoverySaved}
                onCheckedChange={(checked) =>
                  setRecoverySaved(checked === true)
                }
                className="mt-0.5"
              />
              <span>I saved this recovery key somewhere secure.</span>
            </label>

            {error && <p className="text-sm text-red-500">{error}</p>}

          </ModalBody>
            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                onClick={discardPreparedSecurity}
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={!recoverySaved || isLoading}
                onClick={() => void finishVaultCreation()}
                className="bg-blue-600 text-white interaction-button--primary"
              >
                {isLoading ? "Creating Vault..." : "Create Vault"}
              </Button>
            </ModalFooter>
          </>
        ) : creationStep === "source" && supportsPresets ? (
          <ModalBody className="space-y-5">
            <button
              type="button"
              onClick={openBlankDetails}
              className="interaction-card group flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 font-medium">
                Start from scratch
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-blue-600 group-focus-visible:text-blue-600 dark:group-hover:text-blue-400 dark:group-focus-visible:text-blue-400"
                aria-hidden="true"
              />
            </button>

            <section aria-labelledby={`${itemType}PresetHeading`}>
              <div className="mb-3 flex items-center gap-2">
                <Footprints
                  className="h-4 w-4 text-blue-600"
                  aria-hidden="true"
                />
                <h3 id={`${itemType}PresetHeading`} className="font-medium">
                  Starter presets
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {presets.map((preset) => {
                  const PresetIcon = presetIconMap[preset.icon];
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => openPresetDetails(preset)}
                      className="interaction-card group flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50">
                        <PresetIcon
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="min-w-0 flex-1 font-medium leading-5">
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </ModalBody>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <ModalBody className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="font-raleway">Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={config.titlePlaceholder}
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    {config.showValidationError ? <FormMessage /> : null}
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-[1fr_60px] gap-4 items-start">
                {!isAddingNewCategory ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor={`${itemType}Category`}
                        className="font-raleway"
                      >
                        Category
                      </Label>
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                              aria-label="About categories"
                            >
                              <Info
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-72 leading-relaxed"
                          >
                            {existingCategories.length === 0
                              ? 'No categories yet. Leave empty to use "General" or create a new one from the dropdown.'
                              : 'Select a category or leave empty to use "General".'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select
                      value={category}
                      onValueChange={(value) => {
                        if (value === "__add_new__") {
                          form.setValue("isAddingNewCategory", true);
                          form.setValue("category", "");
                          form.setValue("newCategory", "");
                          return;
                        }

                        form.setValue("category", value, { shouldDirty: true });
                        form.setValue("isAddingNewCategory", false);
                        const selectedCat = existingCategories.find(
                          (cat) => cat.name === value,
                        );
                        const categoryColorValue =
                          value === "General"
                            ? UI_COLORS.neutralGray
                            : selectedCat?.color_value || UI_COLORS.neutralGray;
                        form.setValue("categoryColor", categoryColorValue, {
                          shouldDirty: true,
                        });
                        setError("");

                        if (value === "General") {
                          form.setValue("color", config.defaultColor, {
                            shouldDirty: true,
                          });
                        } else {
                          form.setValue("color", categoryColorValue, {
                            shouldDirty: true,
                          });
                        }
                      }}
                    >
                      <SelectTrigger>
                        {category ? (
                          <div className="flex items-center gap-2">
                            {category !== "General" && (
                              <span
                                className="inline-block w-3 h-3 rounded-full border"
                                style={{
                                  backgroundColor: getSelectedCategoryColor(),
                                }}
                              />
                            )}
                            {category}
                          </div>
                        ) : (
                          <SelectValue placeholder="Select a category" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {availableCategories.map((cat) => {
                          const displayColor =
                            category === cat.name && !isAddingNewCategory
                              ? categoryColor
                              : cat.color_value || "#808080";

                          return (
                            <SelectItem key={cat.name} value={cat.name}>
                              <div className="flex items-center gap-2">
                                {cat.name !== "General" && (
                                  <span
                                    className="inline-block w-3 h-3 rounded-full border"
                                    style={{ backgroundColor: displayColor }}
                                  />
                                )}
                                {cat.name}
                              </div>
                            </SelectItem>
                          );
                        })}
                        <SelectItem
                          value="__add_new__"
                          className="text-blue-600"
                        >
                          + Add new category
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {category && category !== "General" && (
                      <div className="mt-2">
                        <ColorPicker
                          color={getSelectedCategoryColor()}
                          onChange={handleCategoryColorChange}
                          onSave={handleCategoryColorChange}
                        >
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 flex items-center gap-2"
                          >
                            <span
                              className="inline-block w-3 h-3 rounded-full border"
                              style={{
                                backgroundColor: getSelectedCategoryColor(),
                              }}
                            />
                            Category Color
                          </Button>
                        </ColorPicker>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label
                      htmlFor={`new${config.label}Category`}
                      className="font-raleway"
                    >
                      New Category
                    </Label>
                    <div className="flex space-x-2">
                      <Input
                        id={`new${config.label}Category`}
                        value={newCategory}
                        onChange={(e) =>
                          form.setValue("newCategory", e.target.value, {
                            shouldDirty: true,
                          })
                        }
                        placeholder="Enter new category"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newCategory.trim()) {
                            form.setValue("category", newCategory.trim(), {
                              shouldDirty: true,
                            });
                            form.setValue("isAddingNewCategory", false);
                            form.setValue("color", categoryColor, {
                              shouldDirty: true,
                            });
                            setError("");
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (newCategory.trim()) {
                            form.setValue("category", newCategory.trim(), {
                              shouldDirty: true,
                            });
                            form.setValue("isAddingNewCategory", false);
                            form.setValue("color", categoryColor, {
                              shouldDirty: true,
                            });
                            setError("");
                          }
                        }}
                        disabled={!newCategory.trim()}
                        className="font-raleway"
                      >
                        Add
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          form.setValue("isAddingNewCategory", false);
                          form.setValue("newCategory", "");
                        }}
                        className="font-raleway"
                      >
                        Cancel
                      </Button>
                    </div>

                    {newCategory.trim() && (
                      <div className="mt-2">
                        <ColorPicker
                          color={categoryColor}
                          onChange={handleCategoryColorChange}
                          onSave={handleCategoryColorChange}
                        >
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 flex items-center gap-2"
                          >
                            <span
                              className="inline-block w-3 h-3 rounded-full border"
                              style={{ backgroundColor: categoryColor }}
                            />
                            Category Color
                          </Button>
                        </ColorPicker>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="font-raleway">Color</Label>
                  <ColorPicker
                    color={color}
                    onChange={(newColor) =>
                      form.setValue("color", newColor, { shouldDirty: true })
                    }
                    onSave={(newColor) =>
                      form.setValue("color", newColor, { shouldDirty: true })
                    }
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 p-0 rounded-full"
                      aria-label={`Change ${config.label.toLowerCase()} color`}
                    >
                      <span
                        className="inline-block w-6 h-6 rounded-full border border-gray-300"
                        style={{ backgroundColor: color }}
                      />
                    </Button>
                  </ColorPicker>
                </div>
              </div>

              {itemType === "vault" && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium">Security</p>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                            aria-label="About vault password recovery"
                          >
                            <Info className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-72 leading-relaxed"
                        >
                          Itemize cannot reset this password. You will receive a
                          recovery key next.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="newVaultPassword">Vault password</Label>
                      {vaultPasswordsMatch && (
                        <CircleCheck
                          className="h-4 w-4 text-green-600 dark:text-green-400"
                          data-vault-password-match-indicator
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <Input
                      id="newVaultPassword"
                      type="password"
                      value={vaultPassword}
                      onChange={(event) => {
                        setVaultPassword(event.target.value);
                        setError("");
                      }}
                      placeholder="At least 8 characters"
                      minLength={VAULT_PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      aria-describedby="vaultPasswordRequirements"
                    />
                    <div
                      id="vaultPasswordRequirements"
                      className="flex flex-wrap gap-x-3 gap-y-1 text-xs"
                      aria-live="polite"
                    >
                      <VaultPasswordRequirement
                        status={
                          vaultPasswordHasMinimumLength
                            ? "met"
                            : vaultPassword.length > 0 ||
                                vaultValidationAttempted
                              ? "unmet"
                              : "neutral"
                        }
                      >
                        8+ characters
                      </VaultPasswordRequirement>
                      <VaultPasswordRequirement
                        status={
                          vaultPasswordHasNoWhitespace
                            ? "met"
                            : vaultPassword.length > 0 ||
                                vaultValidationAttempted
                              ? "unmet"
                              : "neutral"
                        }
                      >
                        No spaces or empty characters
                      </VaultPasswordRequirement>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="confirmNewVaultPassword">
                        Confirm vault password
                      </Label>
                      {vaultPasswordsMatch && (
                        <CircleCheck
                          className="h-4 w-4 text-green-600 dark:text-green-400"
                          data-vault-password-match-indicator
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <Input
                      id="confirmNewVaultPassword"
                      type="password"
                      value={confirmVaultPassword}
                      onChange={(event) => {
                        setConfirmVaultPassword(event.target.value);
                        setError("");
                      }}
                      placeholder="Re-enter password"
                      minLength={VAULT_PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      aria-invalid={confirmVaultPasswordMismatch}
                      aria-describedby={
                        confirmVaultPasswordMismatch
                          ? "confirmVaultPasswordError"
                          : undefined
                      }
                      className={
                        confirmVaultPasswordMismatch
                          ? "border-red-500 focus-visible:ring-red-500"
                          : undefined
                      }
                    />
                    {confirmVaultPasswordMismatch && (
                      <p
                        id="confirmVaultPasswordError"
                        className="text-xs text-red-500"
                      >
                        Passwords do not match.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <p className="text-red-500 text-sm font-raleway">{error}</p>
              )}

              </ModalBody>
              <ModalFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  className="font-raleway"
                >
                  {UI_LABELS.cancel}
                </Button>
                <Button
                  type="submit"
                  disabled={!title.trim() || isLoading}
                  className="bg-blue-600 interaction-button--primary text-white font-raleway"
                >
                  {isLoading
                    ? itemType === "vault"
                      ? "Preparing Vault..."
                      : `Creating ${config.label}...`
                    : itemType === "vault"
                      ? "Continue"
                      : `${UI_LABELS.create} ${config.label}`}
                </Button>
              </ModalFooter>
            </form>
          </Form>
        )}
      </ModalContent>
    </Dialog>
  );
};

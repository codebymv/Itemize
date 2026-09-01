import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateItemModal } from "./CreateItemModal";

const vaultSecurityMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  discard: vi.fn(),
}));

vi.mock("@/lib/vaultZkSession", () => ({
  prepareNewVaultSecurity: vaultSecurityMocks.prepare,
  discardPreparedVaultSession: vaultSecurityMocks.discard,
}));

const preparedSecurity = {
  draftSessionId: -1,
  recoverySecret: "recovery-key",
  cryptoVersion: 2 as const,
  kdfSalt: "salt",
  kdfMemoryKiB: 65_536,
  kdfIterations: 3,
  kdfParallelism: 1,
  wrappedVek: "wrapped",
  wrappedVekRecovery: "wrapped-recovery",
};

describe("CreateItemModal vault flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vaultSecurityMocks.prepare.mockResolvedValue(preparedSecurity);
    vaultSecurityMocks.discard.mockResolvedValue({ ok: true });
  });

  it("keeps security and recovery inside the original modal before creating a v2 vault", async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 12 });

    render(
      <CreateItemModal
        open
        onOpenChange={vi.fn()}
        itemType="vault"
        onCreate={onCreate}
        existingCategories={[]}
        position={{ x: 10, y: 20 }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Production secrets" },
    });
    fireEvent.change(screen.getByLabelText("Vault password"), {
      target: { value: "vault-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm vault password"), {
      target: { value: "vault-password" },
    });
    expect(
      document.querySelectorAll("[data-vault-password-match-indicator]"),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "Save recovery key" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("recovery-key")).toBeInTheDocument();
    expect(vaultSecurityMocks.prepare).toHaveBeenCalledWith("vault-password");
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByText("I saved this recovery key somewhere secure."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Vault" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        "Production secrets",
        "General",
        "#3B82F6",
        { x: 10, y: 20 },
        preparedSecurity,
      ),
    );
  });

  it("does not prepare a vault until the password is valid and confirmed", async () => {
    render(
      <CreateItemModal
        open
        onOpenChange={vi.fn()}
        itemType="vault"
        onCreate={vi.fn()}
        existingCategories={[]}
        position={{ x: 10, y: 20 }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Secrets" },
    });
    fireEvent.change(screen.getByLabelText("Vault password"), {
      target: { value: "password-one" },
    });
    fireEvent.change(screen.getByLabelText("Confirm vault password"), {
      target: { value: "password-two" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("Vault passwords do not match."),
    ).toBeInTheDocument();
    expect(vaultSecurityMocks.prepare).not.toHaveBeenCalled();
  });

  it("moves vault recovery guidance into an accessible tooltip", async () => {
    render(
      <CreateItemModal
        open
        onOpenChange={vi.fn()}
        itemType="vault"
        onCreate={vi.fn()}
        existingCategories={[]}
      />,
    );

    const guidance =
      "Itemize cannot reset this password. You will receive a recovery key next.";
    expect(screen.queryByText(guidance)).not.toBeInTheDocument();

    fireEvent.focus(
      screen.getByRole("button", { name: "About vault password recovery" }),
    );

    expect(
      await screen.findByRole("tooltip", { name: guidance }),
    ).toBeInTheDocument();
  });

  it("rejects an all-space password and keeps match indicators incomplete", async () => {
    render(
      <CreateItemModal
        open
        onOpenChange={vi.fn()}
        itemType="vault"
        onCreate={vi.fn()}
        existingCategories={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Secrets" },
    });
    fireEvent.change(screen.getByLabelText("Vault password"), {
      target: { value: "        " },
    });
    fireEvent.change(screen.getByLabelText("Confirm vault password"), {
      target: { value: "        " },
    });

    expect(screen.getByText("8+ characters").closest("span")).toHaveClass(
      "text-green-600",
    );
    expect(
      screen.getByText("No spaces or empty characters").closest("span"),
    ).toHaveClass("text-red-600");
    expect(
      document.querySelectorAll("[data-vault-password-match-indicator]"),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.queryByText(
        "Use at least 8 characters with no spaces or empty characters.",
      ),
    ).not.toBeInTheDocument();
    expect(vaultSecurityMocks.prepare).not.toHaveBeenCalled();
  });

  it("rejects otherwise long passwords containing whitespace", async () => {
    render(
      <CreateItemModal
        open
        onOpenChange={vi.fn()}
        itemType="vault"
        onCreate={vi.fn()}
        existingCategories={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Secrets" },
    });
    fireEvent.change(screen.getByLabelText("Vault password"), {
      target: { value: "vault password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm vault password"), {
      target: { value: "vault password" },
    });

    expect(
      screen.getByText("No spaces or empty characters").closest("span"),
    ).toHaveClass("text-red-600");
    expect(
      document.querySelectorAll("[data-vault-password-match-indicator]"),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.queryByText(
        "Use at least 8 characters with no spaces or empty characters.",
      ),
    ).not.toBeInTheDocument();
    expect(vaultSecurityMocks.prepare).not.toHaveBeenCalled();
  });

  it("marks empty password requirements invalid without adding error copy", async () => {
    render(
      <CreateItemModal
        open
        onOpenChange={vi.fn()}
        itemType="vault"
        onCreate={vi.fn()}
        existingCategories={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Secrets" },
    });

    expect(
      screen.getByText("8+ characters").closest("span"),
    ).toHaveAttribute("data-vault-password-requirement-status", "neutral");
    expect(
      screen.getByText("No spaces or empty characters").closest("span"),
    ).toHaveAttribute("data-vault-password-requirement-status", "neutral");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(
        screen.getByText("8+ characters").closest("span"),
      ).toHaveAttribute("data-vault-password-requirement-status", "unmet");
      expect(
        screen.getByText("No spaces or empty characters").closest("span"),
      ).toHaveAttribute("data-vault-password-requirement-status", "unmet");
    });
    expect(
      screen.queryByText(
        "Use at least 8 characters with no spaces or empty characters.",
      ),
    ).not.toBeInTheDocument();
  });
});

describe("CreateItemModal category guidance", () => {
  it.each(["note", "list", "whiteboard", "wireframe", "vault"] as const)(
    "moves empty-category guidance into the %s modal tooltip",
    async (itemType) => {
      render(
        <CreateItemModal
          open
          onOpenChange={vi.fn()}
          itemType={itemType}
          onCreate={vi.fn()}
          existingCategories={[]}
        />,
      );

      const guidance =
        'No categories yet. Leave empty to use "General" or create a new one from the dropdown.';
      expect(screen.queryByText(guidance)).not.toBeInTheDocument();

      if (
        itemType === "note" ||
        itemType === "list" ||
        itemType === "wireframe"
      ) {
        fireEvent.click(
          screen.getByRole("button", { name: /Start from scratch/i }),
        );
      }

      fireEvent.focus(
        screen.getByRole("button", { name: "About categories" }),
      );

      expect(
        await screen.findByRole("tooltip", { name: guidance }),
      ).toBeInTheDocument();
    },
  );
});

describe("CreateItemModal preset flow", () => {
  it("creates a list with the selected preset payload", async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: "list-1" });

    render(
      <CreateItemModal
        open
        onOpenChange={vi.fn()}
        itemType="list"
        onCreate={onCreate}
        existingCategories={[]}
      />,
    );

    expect(
      screen.getByText("Start with an empty list or use a curated preset."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start from scratch" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Project launch" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Create an empty list and build it your way."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Move a project from final review through launch day."),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ textContent: expect.stringContaining("Project launch") }),
      ]),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Project launch/i }),
    );

    expect(screen.getByLabelText("Title")).toHaveValue("Project launch");
    expect(
      screen.getByText(
        "Using the Project launch preset. You can edit the details before creating it.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create List" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const presetPayload = onCreate.mock.calls[0][5];
    expect(presetPayload).toMatchObject({
      presetId: "list.project-launch.v1",
    });
    expect(presetPayload.listItems).toHaveLength(7);
    expect(presetPayload.listItems[0]).toMatchObject({
      text: "Confirm scope and launch criteria",
      completed: false,
    });
  });

  it("keeps blank creation available and supports returning to the chooser", () => {
    render(
      <CreateItemModal
        open
        onOpenChange={vi.fn()}
        itemType="note"
        onCreate={vi.fn()}
        existingCategories={[]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Meeting notes/i }),
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Meeting notes");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Back to note creation choices",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Start from scratch/i }),
    );

    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("keeps whiteboard creation on the direct details flow", () => {
    render(
      <CreateItemModal
        open
        onOpenChange={vi.fn()}
        itemType="whiteboard"
        onCreate={vi.fn()}
        existingCategories={[]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Start from scratch/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });

  it("single-flights creation and guards dismissal while pending", async () => {
    let resolveCreate: ((value: { id: string }) => void) | undefined;
    const onCreate = vi.fn(() => new Promise<{ id: string }>((resolve) => {
      resolveCreate = resolve;
    }));
    const onOpenChange = vi.fn();
    render(
      <CreateItemModal
        open
        onOpenChange={onOpenChange}
        itemType="whiteboard"
        onCreate={onCreate}
        existingCategories={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Launch map" },
    });
    const createButton = screen.getByRole("button", { name: "Create Whiteboard" });
    fireEvent.click(createButton);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    fireEvent.click(createButton);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(createButton).toHaveAttribute("aria-busy", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveCreate?.({ id: "whiteboard-1" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutSuccessModal } from "./CheckoutSuccessModal";
import { billingApi, type BillingStatus } from "@/services/billingApi";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/services/billingApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/billingApi")>(
    "@/services/billingApi",
  );
  return {
    ...actual,
    billingApi: {
      ...actual.billingApi,
      getBillingStatus: vi.fn(),
    },
  };
});

const status = (overrides: Partial<BillingStatus> = {}): BillingStatus => ({
  plan: "starter",
  subscription_status: "trialing",
  billing_period: "monthly",
  billing_period_start: null,
  billing_period_end: null,
  stripe_customer_id: "cus_itemize",
  stripe_subscription_id: null,
  emails_used: 0,
  emails_limit: 1000,
  sms_used: 0,
  sms_limit: 500,
  api_calls_used: 0,
  api_calls_limit: 0,
  contacts_limit: 5000,
  users_limit: 3,
  workflows_limit: 5,
  landing_pages_limit: 10,
  forms_limit: 10,
  calendars_limit: 3,
  trial_started_at: "2026-08-21T00:00:00.000Z",
  trial_ends_at: "2026-09-04T00:00:00.000Z",
  trial_end_acknowledged_at: null,
  cancel_at_period_end: false,
  canceled_at: null,
  ...overrides,
});

describe("CheckoutSuccessModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not claim success for a no-card local trial", async () => {
    vi.mocked(billingApi.getBillingStatus).mockResolvedValue({
      success: true,
      data: status(),
    });

    render(<CheckoutSuccessModal open onClose={vi.fn()} />);

    expect(
      await screen.findByText("Confirming your subscription..."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Welcome to Solo")).not.toBeInTheDocument();
  });

  it("announces success only after a webhook-backed subscription is active", async () => {
    const onConfirmed = vi.fn();
    vi.mocked(billingApi.getBillingStatus).mockResolvedValue({
      success: true,
      data: status({
        subscription_status: "active",
        stripe_subscription_id: "sub_itemize",
        trial_ends_at: null,
      }),
    });

    render(
      <CheckoutSuccessModal open onClose={vi.fn()} onConfirmed={onConfirmed} />,
    );

    expect(await screen.findByText("Welcome to Solo")).toBeInTheDocument();
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
  });
});

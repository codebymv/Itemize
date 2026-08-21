import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UsageIndicator } from "./UsageIndicator";

describe("UsageIndicator", () => {
  it("treats a zero entitlement as unavailable rather than unlimited", () => {
    render(
      <UsageIndicator
        resourceType="emails"
        used={0}
        limit={0}
        label="Emails"
      />,
    );

    expect(screen.getByText("Not included")).toBeInTheDocument();
    expect(
      screen.getByText("Available on Solo and Studio"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Unlimited")).not.toBeInTheDocument();
  });

  it("points unavailable API access to Studio", () => {
    render(
      <UsageIndicator
        resourceType="apiCalls"
        used={0}
        limit={0}
        label="API Calls"
      />,
    );

    expect(screen.getByText("Not included")).toBeInTheDocument();
    expect(screen.getByText("Available on Studio")).toBeInTheDocument();
    expect(
      screen.queryByText("Available on Solo and Studio"),
    ).not.toBeInTheDocument();
  });

  it("reserves Unlimited for the explicit -1 sentinel", () => {
    render(
      <UsageIndicator
        resourceType="apiCalls"
        used={12}
        limit={-1}
        label="API Calls"
      />,
    );

    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByText("No monthly cap on this plan")).toBeInTheDocument();
  });
});

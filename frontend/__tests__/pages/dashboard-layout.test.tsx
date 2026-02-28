import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DashboardLayout from "@/app/dashboard/[companyId]/layout";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
  usePathname: () => "/dashboard/company-abc",
  useRouter: () => ({ push: mockPush }),
}));

// Mock API calls
const mockCompaniesGet = jest.fn();
const mockApprovalCount = jest.fn();

jest.mock("@/lib/api", () => ({
  companiesApi: {
    get: (...args: any[]) => mockCompaniesGet(...args),
  },
  approvalApi: {
    count: (...args: any[]) => mockApprovalCount(...args),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCompaniesGet.mockResolvedValue({
    data: {
      id: "company-abc",
      name: "Novamind Mental Health",
      website_url: "https://novamindmentalhealth.com",
      status: "active",
      is_pilot: true,
      health: "green",
    },
  });
  mockApprovalCount.mockResolvedValue({ data: { pending: 3 } });
});

describe("DashboardLayout", () => {
  it("renders children", () => {
    render(
      <DashboardLayout>
        <div data-testid="page-content">Main Content</div>
      </DashboardLayout>
    );
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  it("renders the Arche GTM logo button", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByText("Arche GTM")).toBeInTheDocument();
  });

  it("renders all nav items", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Campaigns")).toBeInTheDocument();
    expect(screen.getByText("Approval Queue")).toBeInTheDocument();
    expect(screen.getByText("Leads")).toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(screen.getByText("Materials")).toBeInTheDocument();
    expect(screen.getByText("Settings & Credentials")).toBeInTheDocument();
  });

  it("renders module quick-links", () => {
    render(
      <DashboardLayout>
        <div>Page Body</div>
      </DashboardLayout>
    );
    expect(screen.getByText("Paid Ads")).toBeInTheDocument();
    expect(screen.getByText("Referral")).toBeInTheDocument();
    // "Content" is a module quick-link label
    expect(screen.getAllByText("Content").length).toBeGreaterThan(0);
    expect(screen.getByText("SEO")).toBeInTheDocument();
    expect(screen.getByText("Profiles")).toBeInTheDocument();
  });

  it("renders Portfolio Overview button", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    expect(screen.getByText("← Portfolio Overview")).toBeInTheDocument();
  });

  it("navigates to admin when Portfolio Overview is clicked", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    fireEvent.click(screen.getByText("← Portfolio Overview"));
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  it("navigates to home when logo is clicked", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    fireEvent.click(screen.getByText("Arche GTM"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("shows company name after API loads", async () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    await waitFor(() => {
      expect(screen.getByText("Novamind Mental Health")).toBeInTheDocument();
    });
  });

  it("shows Pilot badge for pilot companies", async () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    await waitFor(() => {
      expect(screen.getByText("Pilot")).toBeInTheDocument();
    });
  });

  it("shows pending count badge on Approval Queue nav item", async () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("does not show pending badge when count is 0", async () => {
    mockApprovalCount.mockResolvedValue({ data: { pending: 0 } });
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
    });
    // Badge with 0 count should not render
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("handles API error gracefully", async () => {
    mockCompaniesGet.mockRejectedValue(new Error("Network error"));
    mockApprovalCount.mockRejectedValue(new Error("Network error"));

    render(
      <DashboardLayout>
        <div data-testid="content">Content</div>
      </DashboardLayout>
    );
    // Should still render without crashing
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("applies active class to the current nav link", () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    // The Overview link at /dashboard/company-abc should be active
    const overviewLink = screen.getByText("Overview").closest("a");
    expect(overviewLink).toHaveClass("bg-blue-50");
  });

  it("shows website URL without protocol", async () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    await waitFor(() => {
      expect(screen.getByText("novamindmentalhealth.com")).toBeInTheDocument();
    });
  });

  it("does not show Pilot badge for non-pilot company", async () => {
    mockCompaniesGet.mockResolvedValue({
      data: {
        id: "company-abc",
        name: "Regular Clinic",
        website_url: "https://clinic.com",
        status: "active",
        is_pilot: false,
        health: "green",
      },
    });
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );
    await waitFor(() => {
      expect(screen.getByText("Regular Clinic")).toBeInTheDocument();
    });
    expect(screen.queryByText("Pilot")).not.toBeInTheDocument();
  });
});

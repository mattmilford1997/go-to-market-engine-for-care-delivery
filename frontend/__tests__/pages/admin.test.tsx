import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPage from "@/app/admin/page";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockPortfolioOverview = jest.fn();
const mockList = jest.fn();

jest.mock("@/lib/api", () => ({
  companiesApi: {
    portfolioOverview: (...args: any[]) => mockPortfolioOverview(...args),
    list: (...args: any[]) => mockList(...args),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({ data: [] });
});

const sampleCompanies = [
  {
    id: "c1",
    name: "NovaMind Mental Health",
    status: "active",
    is_pilot: true,
    monthly_budget: 5000,
    active_campaigns: 3,
    pending_approvals: 2,
    health: "green",
  },
  {
    id: "c2",
    name: "Clarity Psychiatry",
    status: "active",
    is_pilot: false,
    monthly_budget: 3000,
    active_campaigns: 1,
    pending_approvals: 0,
    health: "yellow",
  },
];

describe("Admin Portfolio page", () => {
  it("renders the Arche Studios header", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: [] });
    render(<AdminPage />);
    expect(screen.getByText("Arche Studios")).toBeInTheDocument();
  });

  it("renders Portfolio Overview subtitle", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: [] });
    render(<AdminPage />);
    expect(screen.getByText("Portfolio Overview")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockPortfolioOverview.mockImplementation(() => new Promise(() => {}));
    render(<AdminPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows empty state when no companies", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: [] });
    render(<AdminPage />);
    await waitFor(() => {
      expect(screen.getByText("No companies yet")).toBeInTheDocument();
    });
  });

  it("shows Add Company button in empty state", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: [] });
    render(<AdminPage />);
    await waitFor(() => {
      // Multiple Add Company buttons (header + empty state)
      const buttons = screen.getAllByRole("button", { name: /Add Company/i });
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("navigates to / when Add Company is clicked", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: [] });
    render(<AdminPage />);
    await waitFor(() => screen.getByText("No companies yet"));

    const addButton = screen.getAllByRole("button", { name: /Add Company/i })[0];
    await userEvent.click(addButton);
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("renders KPI cards when companies are loaded", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: sampleCompanies });
    render(<AdminPage />);

    await waitFor(() => {
      // "Portfolio Companies" appears in both a KPI card label and the table heading
      expect(screen.getAllByText("Portfolio Companies").length).toBeGreaterThan(0);
      expect(screen.getByText("Total Monthly Budget")).toBeInTheDocument();
      expect(screen.getByText("Active Campaigns")).toBeInTheDocument();
      expect(screen.getByText("Pending Approvals")).toBeInTheDocument();
    });
  });

  it("shows correct company count in KPI", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: sampleCompanies });
    render(<AdminPage />);

    await waitFor(() => {
      // "2" appears as both the count in company table heading and KPI
      expect(screen.getByText("2 companies")).toBeInTheDocument();
    });
  });

  it("renders company names in the table", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: sampleCompanies });
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("NovaMind Mental Health")).toBeInTheDocument();
      expect(screen.getByText("Clarity Psychiatry")).toBeInTheDocument();
    });
  });

  it("shows Pilot badge for pilot companies", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: sampleCompanies });
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("Pilot")).toBeInTheDocument();
    });
  });

  it("renders Open Dashboard buttons for each company", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: sampleCompanies });
    render(<AdminPage />);

    await waitFor(() => {
      const dashButtons = screen.getAllByText(/Open Dashboard/i);
      expect(dashButtons).toHaveLength(2);
    });
  });

  it("navigates to dashboard on Open Dashboard click", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: sampleCompanies });
    render(<AdminPage />);

    await waitFor(() => screen.getAllByText(/Open Dashboard/i));
    await userEvent.click(screen.getAllByText(/Open Dashboard/i)[0]);

    expect(mockPush).toHaveBeenCalledWith("/dashboard/c1");
  });

  it("falls back to list() when portfolioOverview fails", async () => {
    mockPortfolioOverview.mockRejectedValue(new Error("forbidden"));
    mockList.mockResolvedValue({ data: sampleCompanies });
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByText("NovaMind Mental Health")).toBeInTheDocument();
    });
    expect(mockList).toHaveBeenCalled();
  });

  it("sums total budget across companies", async () => {
    mockPortfolioOverview.mockResolvedValue({ data: sampleCompanies });
    render(<AdminPage />);

    await waitFor(() => {
      // $5,000 + $3,000 = $8,000
      expect(screen.getByText("$8,000")).toBeInTheDocument();
    });
  });
});

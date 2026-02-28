import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import CompanyDashboard from "@/app/dashboard/[companyId]/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("next/link", () => {
  const Link = ({ children, href }: any) => <a href={href}>{children}</a>;
  Link.displayName = "Link";
  return Link;
});

const mockCompany = {
  id: "company-abc",
  name: "NovaMind Mental Health",
  status: "active",
  website_url: "https://novamindmentalhealth.com",
  specialty_niche: "TMS Therapy",
  services: [{ name: "TMS Therapy" }, { name: "Ketamine Therapy" }],
  locations: [{ city: "Phoenix" }],
  providers: [{ name: "Dr. Smith" }],
  insurance_accepted: ["Aetna", "Blue Cross", "United"],
  credentials: {},
  budgets: { total: 8000, google_ads: 3000, meta_ads: 2000 },
};

const mockScorecard = {
  overall_score: 45,
  claimed_profiles: 2,
  total_platforms: 9,
  platforms: [],
};

// Mock the API module
const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock("@/lib/api", () => ({
  companiesApi: { get: (...args: any[]) => mockGet("companies.get", ...args) },
  approvalApi: { count: (...args: any[]) => mockGet("approval.count", ...args) },
  referralApi: {
    leads: (...args: any[]) => mockGet("referral.leads", ...args),
    generateLeads: (...args: any[]) => mockPost("referral.generateLeads", ...args),
    generateAllCollateral: (...args: any[]) => mockPost("referral.generateAllCollateral", ...args),
  },
  profilesApi: { scorecard: (...args: any[]) => mockGet("profiles.scorecard", ...args) },
  seoApi: {},
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Default: all API calls succeed
  mockGet.mockImplementation((key) => {
    if (key === "companies.get") return Promise.resolve({ data: mockCompany });
    if (key === "approval.count") return Promise.resolve({ data: { pending: 3 } });
    if (key === "referral.leads") return Promise.resolve({ data: { total: 47 } });
    if (key === "profiles.scorecard") return Promise.resolve({ data: mockScorecard });
    return Promise.resolve({ data: {} });
  });
  mockPost.mockResolvedValue({ data: {} });
});

describe("Company Dashboard page", () => {
  it("shows loading spinner initially", () => {
    // Make API calls never resolve
    mockGet.mockImplementation(() => new Promise(() => {}));
    render(<CompanyDashboard />);
    expect(screen.getByText(/Loading dashboard/i)).toBeInTheDocument();
  });

  it("shows company not found when company fails to load", async () => {
    mockGet.mockImplementation((key) => {
      if (key === "companies.get") return Promise.reject(new Error("not found"));
      return Promise.resolve({ data: {} });
    });
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Company not found.")).toBeInTheDocument();
    });
  });

  it("renders company name after loading", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("NovaMind Mental Health")).toBeInTheDocument();
    });
  });

  it("renders company specialty niche", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      // TMS Therapy appears in both the subtitle and the module grid
      expect(screen.getAllByText(/TMS Therapy/).length).toBeGreaterThan(0);
    });
  });

  it("renders website URL link", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("novamindmentalhealth.com")).toBeInTheDocument();
    });
  });

  it("renders Generate All Content button for active companies", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Generate All Content/i })).toBeInTheDocument();
    });
  });

  it("shows ingesting status for ingesting companies", async () => {
    mockGet.mockImplementation((key) => {
      if (key === "companies.get") {
        return Promise.resolve({ data: { ...mockCompany, status: "ingesting" } });
      }
      if (key === "approval.count") return Promise.resolve({ data: { pending: 0 } });
      if (key === "referral.leads") return Promise.resolve({ data: { total: 0 } });
      if (key === "profiles.scorecard") return Promise.resolve({ data: mockScorecard });
      return Promise.resolve({ data: {} });
    });
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/Ingesting website/i)).toBeInTheDocument();
    });
  });

  it("shows pending approval count", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      // "3" appears in both KPI card and approval queue badge
      expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    });
  });

  it("shows referral lead count", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("47")).toBeInTheDocument();
    });
  });

  it("shows directory profiles scorecard", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("2 / 9")).toBeInTheDocument();
    });
  });

  it("renders all 5 module cards", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Paid Ads")).toBeInTheDocument();
      expect(screen.getByText("Referral")).toBeInTheDocument();
      expect(screen.getByText("Content")).toBeInTheDocument();
      expect(screen.getByText("SEO")).toBeInTheDocument();
      expect(screen.getByText("Profiles")).toBeInTheDocument();
    });
  });

  it("renders Practice Overview section", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Practice Overview")).toBeInTheDocument();
    });
  });

  it("renders service names in Practice Overview", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/TMS Therapy.*Ketamine Therapy/i)).toBeInTheDocument();
    });
  });

  it("renders location count", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("1 location")).toBeInTheDocument();
    });
  });

  it("renders provider count", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("1 provider")).toBeInTheDocument();
    });
  });

  it("renders Approval Queue section with count", async () => {
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Approval Queue")).toBeInTheDocument();
      expect(screen.getByText("Items awaiting review")).toBeInTheDocument();
    });
  });

  it("renders empty approval queue message when count is 0", async () => {
    mockGet.mockImplementation((key) => {
      if (key === "companies.get") return Promise.resolve({ data: mockCompany });
      if (key === "approval.count") return Promise.resolve({ data: { pending: 0 } });
      if (key === "referral.leads") return Promise.resolve({ data: { total: 0 } });
      if (key === "profiles.scorecard") return Promise.resolve({ data: mockScorecard });
      return Promise.resolve({ data: {} });
    });
    render(<CompanyDashboard />);
    await waitFor(() => {
      expect(screen.getByText("No items pending approval.")).toBeInTheDocument();
    });
  });

  it("calls generateLeads and generateAllCollateral on Generate All click", async () => {
    // Mock window.alert
    const alertMock = jest.spyOn(window, "alert").mockImplementation(() => {});

    render(<CompanyDashboard />);
    await waitFor(() => screen.getByRole("button", { name: /Generate All Content/i }));

    fireEvent.click(screen.getByRole("button", { name: /Generate All Content/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("referral.generateLeads", "company-abc");
      expect(mockPost).toHaveBeenCalledWith("referral.generateAllCollateral", "company-abc");
    });

    alertMock.mockRestore();
  });
});

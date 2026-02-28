import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import CampaignsPage from "@/app/dashboard/[companyId]/campaigns/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
}));

const mockCampaigns = jest.fn();
const mockContentItems = jest.fn();
const mockLatestReport = jest.fn();
const mockScorecard = jest.fn();
const mockGenerateAllGoogle = jest.fn();
const mockGenerateAllMeta = jest.fn();
const mockGenerateFullCalendar = jest.fn();
const mockRunAudit = jest.fn();
const mockGenerateProfileContent = jest.fn();
const mockGenerateAllCollateral = jest.fn();

jest.mock("@/lib/api", () => ({
  referralApi: {
    campaigns: (...args: any[]) => mockCampaigns(...args),
    generateAllCollateral: (...args: any[]) => mockGenerateAllCollateral(...args),
  },
  contentApi: {
    items: (...args: any[]) => mockContentItems(...args),
    generateFullCalendar: (...args: any[]) => mockGenerateFullCalendar(...args),
  },
  paidAdsApi: {
    generateAllGoogle: (...args: any[]) => mockGenerateAllGoogle(...args),
    generateAllMeta: (...args: any[]) => mockGenerateAllMeta(...args),
  },
  seoApi: {
    latestReport: (...args: any[]) => mockLatestReport(...args),
    runAudit: (...args: any[]) => mockRunAudit(...args),
  },
  profilesApi: {
    scorecard: (...args: any[]) => mockScorecard(...args),
    generateContent: (...args: any[]) => mockGenerateProfileContent(...args),
  },
}));

const sampleCampaigns = [
  { id: "c1", name: "Q1 Referral Campaign", status: "active", impressions: 1200, clicks: 45, form_submissions: 3 },
];

const sampleScorecard = {
  overall_score: 50,
  claimed_profiles: 3,
  total_platforms: 9,
  platforms: [
    { platform: "google_business_profile", platform_name: "Google Business Profile", completeness_score: 80, is_claimed: true },
    { platform: "psychology_today", platform_name: "Psychology Today", completeness_score: 40, is_claimed: false },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCampaigns.mockResolvedValue({ data: [] });
  mockContentItems.mockResolvedValue({ data: { items: [], total: 0 } });
  mockLatestReport.mockRejectedValue(new Error("not found"));
  mockScorecard.mockResolvedValue({ data: sampleScorecard });
  mockGenerateAllGoogle.mockResolvedValue({ data: {} });
  mockGenerateAllMeta.mockResolvedValue({ data: {} });
  mockGenerateFullCalendar.mockResolvedValue({ data: {} });
  mockRunAudit.mockResolvedValue({ data: {} });
  mockGenerateProfileContent.mockResolvedValue({ data: {} });
  mockGenerateAllCollateral.mockResolvedValue({ data: {} });
  jest.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Campaigns page", () => {
  it("renders page heading", async () => {
    render(<CampaignsPage />);
    expect(screen.getByText("Campaign Performance")).toBeInTheDocument();
  });

  it("renders all 5 module tabs", async () => {
    render(<CampaignsPage />);
    expect(screen.getByRole("button", { name: "Paid Ads" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Referral" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Content" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SEO" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Profiles" })).toBeInTheDocument();
  });

  it("shows Referral tab content by default", async () => {
    render(<CampaignsPage />);
    await waitFor(() => {
      expect(screen.getByText("Generate All Collateral")).toBeInTheDocument();
    });
  });

  it("shows empty referral state when no campaigns", async () => {
    render(<CampaignsPage />);
    await waitFor(() => {
      expect(screen.getByText("No referral campaigns yet")).toBeInTheDocument();
    });
  });

  it("shows referral campaigns table when campaigns exist", async () => {
    mockCampaigns.mockResolvedValue({ data: sampleCampaigns });
    render(<CampaignsPage />);
    await waitFor(() => {
      expect(screen.getByText("Q1 Referral Campaign")).toBeInTheDocument();
    });
  });

  it("switches to Paid Ads tab when clicked", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Paid Ads" }));

    await waitFor(() => {
      expect(screen.getByText("Generate Google Ads")).toBeInTheDocument();
      expect(screen.getByText("Generate Meta Ads")).toBeInTheDocument();
    });
  });

  it("shows Google + Meta info on paid ads tab", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Paid Ads" }));

    await waitFor(() => {
      expect(screen.getByText("Google Ads + Meta Ads")).toBeInTheDocument();
    });
  });

  it("calls generateAllGoogle when Generate Google Ads is clicked", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Paid Ads" }));
    await waitFor(() => screen.getByText("Generate Google Ads"));

    fireEvent.click(screen.getByText("Generate Google Ads"));

    await waitFor(() => {
      expect(mockGenerateAllGoogle).toHaveBeenCalledWith("company-abc");
    });
  });

  it("calls generateAllMeta when Generate Meta Ads is clicked", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Paid Ads" }));
    await waitFor(() => screen.getByText("Generate Meta Ads"));

    fireEvent.click(screen.getByText("Generate Meta Ads"));

    await waitFor(() => {
      expect(mockGenerateAllMeta).toHaveBeenCalledWith("company-abc");
    });
  });

  it("switches to Content tab and shows generate button", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Content" }));

    await waitFor(() => {
      expect(screen.getByText("Generate 12-Week Content Calendar")).toBeInTheDocument();
    });
  });

  it("shows empty content state when no published content", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Content" }));

    await waitFor(() => {
      expect(screen.getByText("No published content yet")).toBeInTheDocument();
    });
  });

  it("calls generateFullCalendar when content generate button is clicked", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Content" }));
    await waitFor(() => screen.getByText("Generate 12-Week Content Calendar"));

    fireEvent.click(screen.getByText("Generate 12-Week Content Calendar"));

    await waitFor(() => {
      expect(mockGenerateFullCalendar).toHaveBeenCalledWith("company-abc");
    });
  });

  it("switches to SEO tab and shows audit button", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "SEO" }));

    await waitFor(() => {
      expect(screen.getByText("Run SEO Audit")).toBeInTheDocument();
    });
  });

  it("shows no SEO audit empty state when no report", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "SEO" }));

    await waitFor(() => {
      expect(screen.getByText("No SEO audit yet")).toBeInTheDocument();
    });
  });

  it("shows SEO scores when report exists", async () => {
    mockLatestReport.mockResolvedValue({ data: { pagespeed_mobile: 75, pagespeed_desktop: 90, recommendations: [] } });
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "SEO" }));

    await waitFor(() => {
      expect(screen.getByText("Mobile Score")).toBeInTheDocument();
      expect(screen.getByText("75")).toBeInTheDocument();
      expect(screen.getByText("90")).toBeInTheDocument();
    });
  });

  it("switches to Profiles tab and shows scorecard", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Profiles" }));

    await waitFor(() => {
      expect(screen.getByText("Generate All Profile Content")).toBeInTheDocument();
      expect(screen.getByText("Directory Presence Scorecard")).toBeInTheDocument();
    });
  });

  it("shows platform list in profiles scorecard", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Profiles" }));

    await waitFor(() => {
      expect(screen.getByText("Google Business Profile")).toBeInTheDocument();
      expect(screen.getByText("Psychology Today")).toBeInTheDocument();
    });
  });

  it("shows Claimed/Unclaimed badges on profiles", async () => {
    render(<CampaignsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Profiles" }));

    await waitFor(() => {
      expect(screen.getByText("Claimed")).toBeInTheDocument();
      expect(screen.getByText("Unclaimed")).toBeInTheDocument();
    });
  });
});

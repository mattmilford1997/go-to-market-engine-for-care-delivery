import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PaidAdsPage from "@/app/dashboard/[companyId]/paid-ads/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
}));

const mockBudgetRecs = jest.fn();
const mockAudiences = jest.fn();
const mockQueueItems = jest.fn();
const mockGenerateAllGoogle = jest.fn();
const mockGenerateAllMeta = jest.fn();

jest.mock("@/lib/api", () => ({
  paidAdsApi: {
    budgetRecs: (...args: any[]) => mockBudgetRecs(...args),
    audiences: (...args: any[]) => mockAudiences(...args),
    generateAllGoogle: (...args: any[]) => mockGenerateAllGoogle(...args),
    generateAllMeta: (...args: any[]) => mockGenerateAllMeta(...args),
  },
  approvalApi: {
    queue: (...args: any[]) => mockQueueItems(...args),
  },
}));

const sampleBudgetRecs = {
  recommendations: [
    { location: "Phoenix, AZ", google_recommended: 3000, meta_recommended: 1500 },
    { location: "Scottsdale, AZ", google_recommended: 2000, meta_recommended: 1000 },
  ],
};

const sampleAudiences = {
  audiences: [
    { id: "a1", name: "Depression Seekers", description: "Adults researching depression", size_estimate: "2M–5M", targeting: {} },
    { id: "a2", name: "TMS Considerers", description: "Non-med treatment seekers", size_estimate: "500K", targeting: {} },
    { id: "a3", name: "Provider Network", description: "Referring physicians", size_estimate: "15K", targeting: {} },
  ],
};

const sampleQueueItems = {
  items: [
    { id: "q1", title: "Google Ads — TMS Therapy", item_type: "ad_copy_google", status: "pending", preview_data: { keyword_cluster: "TMS Therapy Near Me" }, created_at: "2026-01-01" },
    { id: "q2", title: "Meta Ad — Depression Seekers", item_type: "ad_copy_meta", status: "approved", preview_data: {}, created_at: "2026-01-01" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockBudgetRecs.mockResolvedValue({ data: sampleBudgetRecs });
  mockAudiences.mockResolvedValue({ data: sampleAudiences });
  mockQueueItems.mockResolvedValue({ data: sampleQueueItems });
  mockGenerateAllGoogle.mockResolvedValue({ data: {} });
  mockGenerateAllMeta.mockResolvedValue({ data: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Paid Ads page", () => {
  it("renders page heading", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => {
      expect(screen.getByText("Paid Ads Manager")).toBeInTheDocument();
    });
  });

  it("shows Module 1 label", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => {
      expect(screen.getByText("Module 1")).toBeInTheDocument();
    });
  });

  it("renders Google Ads and Meta Ads tab buttons", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Google Ads/)).toBeInTheDocument();
      expect(screen.getByText(/Meta Ads/)).toBeInTheDocument();
    });
  });

  it("shows stat cards on load", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => {
      expect(screen.getByText("Keyword Clusters")).toBeInTheDocument();
      expect(screen.getByText("Ad Copies Generated")).toBeInTheDocument();
      expect(screen.getByText("Meta Audiences")).toBeInTheDocument();
      expect(screen.getByText("Pending Approval")).toBeInTheDocument();
    });
  });

  it("shows budget recommendations table when data exists", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => {
      expect(screen.getByText("Phoenix, AZ")).toBeInTheDocument();
      expect(screen.getByText("Scottsdale, AZ")).toBeInTheDocument();
    });
  });

  it("shows generated Google Ads items", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => {
      expect(screen.getByText("Google Ads — TMS Therapy")).toBeInTheDocument();
    });
  });

  it("shows budget recommendations section header", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => {
      expect(screen.getByText("Budget Recommendations by Location")).toBeInTheDocument();
    });
  });

  it("switches to Meta Ads tab when clicked", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => screen.getByText(/Meta Ads/));
    fireEvent.click(screen.getByText(/Meta Ads/));
    await waitFor(() => {
      expect(screen.getByText("Audience Templates")).toBeInTheDocument();
    });
  });

  it("shows 3 audience template cards in Meta tab", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => screen.getByText(/Meta Ads/));
    fireEvent.click(screen.getByText(/Meta Ads/));
    await waitFor(() => {
      expect(screen.getByText("Depression Seekers")).toBeInTheDocument();
      expect(screen.getByText("TMS Considerers")).toBeInTheDocument();
      expect(screen.getByText("Provider Network")).toBeInTheDocument();
    });
  });

  it("shows Meta ad items in Meta tab", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => screen.getByText(/Meta Ads/));
    fireEvent.click(screen.getByText(/Meta Ads/));
    await waitFor(() => {
      expect(screen.getByText("Meta Ad — Depression Seekers")).toBeInTheDocument();
    });
  });

  it("calls generateAllGoogle when Generate Google Ads is clicked", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => screen.getByText("Generate Google Ads"));
    fireEvent.click(screen.getByText("Generate Google Ads"));
    await waitFor(() => {
      expect(mockGenerateAllGoogle).toHaveBeenCalledWith("company-abc");
    });
  });

  it("calls generateAllMeta when Generate Meta Ads is clicked", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => screen.getByText("Generate Meta Ads"));
    fireEvent.click(screen.getByText("Generate Meta Ads"));
    await waitFor(() => {
      expect(mockGenerateAllMeta).toHaveBeenCalledWith("company-abc");
    });
  });

  it("shows Build-First model info note", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => {
      expect(screen.getByText("Build-First Model:")).toBeInTheDocument();
    });
  });

  it("shows ad format guide in Meta tab", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => screen.getByText(/Meta Ads/));
    fireEvent.click(screen.getByText(/Meta Ads/));
    await waitFor(() => {
      expect(screen.getByText("Ad Format Guide")).toBeInTheDocument();
      expect(screen.getByText("Feed Image")).toBeInTheDocument();
    });
  });

  it("shows keyword strategy guide in Google tab", async () => {
    render(<PaidAdsPage />);
    await waitFor(() => {
      expect(screen.getByText("Keyword Strategy")).toBeInTheDocument();
    });
  });

  it("shows loading state initially when API calls are slow", () => {
    mockBudgetRecs.mockImplementation(() => new Promise(() => {}));
    mockAudiences.mockImplementation(() => new Promise(() => {}));
    mockQueueItems.mockImplementation(() => new Promise(() => {}));
    render(<PaidAdsPage />);
    expect(screen.getByText(/Loading Paid Ads/)).toBeInTheDocument();
  });

  it("handles empty recommendations gracefully", async () => {
    mockBudgetRecs.mockResolvedValue({ data: { recommendations: [] } });
    render(<PaidAdsPage />);
    await waitFor(() => {
      expect(screen.getByText("Paid Ads Manager")).toBeInTheDocument();
      // No crash
    });
  });
});

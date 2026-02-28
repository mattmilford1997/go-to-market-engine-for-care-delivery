import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ProfilesPage from "@/app/dashboard/[companyId]/profiles/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
}));

const mockScorecard = jest.fn();
const mockGenerateContent = jest.fn();
const mockAutoCreate = jest.fn();

jest.mock("@/lib/api", () => ({
  profilesApi: {
    scorecard: (...args: any[]) => mockScorecard(...args),
    generateContent: (...args: any[]) => mockGenerateContent(...args),
    autoCreate: (...args: any[]) => mockAutoCreate(...args),
    list: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

const sampleScorecard = {
  overall_score: 62,
  claimed_profiles: 3,
  total_platforms: 9,
  platforms: [
    {
      platform: "google_business_profile", platform_name: "Google Business Profile",
      exists: true, is_claimed: true, completeness_score: 90, review_count: 47,
      average_rating: 4.7, auto_create_status: "completed", content_generated: true,
      credentials_stored: true, missing_fields: [], optimization_score: 88,
    },
    {
      platform: "psychology_today", platform_name: "Psychology Today",
      exists: true, is_claimed: false, completeness_score: 60, review_count: 12,
      average_rating: 4.2, auto_create_status: "needs_manual", content_generated: true,
      credentials_stored: false, missing_fields: ["photo", "insurance"], optimization_score: 65,
    },
    {
      platform: "therapyden", platform_name: "TherapyDen",
      exists: false, is_claimed: false, completeness_score: 0, review_count: 0,
      average_rating: null, auto_create_status: "not_started", content_generated: false,
      credentials_stored: false, missing_fields: ["all"], optimization_score: 0,
    },
    {
      platform: "healthgrades", platform_name: "Healthgrades",
      exists: false, is_claimed: false, completeness_score: 0, review_count: 0,
      average_rating: null, auto_create_status: "not_started", content_generated: false,
      credentials_stored: false, missing_fields: [], optimization_score: 0,
    },
    {
      platform: "zocdoc", platform_name: "Zocdoc",
      exists: false, is_claimed: false, completeness_score: 0, review_count: 0,
      average_rating: null, auto_create_status: "not_started", content_generated: false,
      credentials_stored: false, missing_fields: [], optimization_score: 0,
    },
    {
      platform: "vitals", platform_name: "Vitals",
      exists: false, is_claimed: false, completeness_score: 0, review_count: 0,
      average_rating: null, auto_create_status: "not_started", content_generated: false,
      credentials_stored: false, missing_fields: [], optimization_score: 0,
    },
    {
      platform: "yelp", platform_name: "Yelp",
      exists: false, is_claimed: false, completeness_score: 0, review_count: 0,
      average_rating: null, auto_create_status: "not_started", content_generated: false,
      credentials_stored: false, missing_fields: [], optimization_score: 0,
    },
    {
      platform: "webmd", platform_name: "WebMD / Medscape",
      exists: false, is_claimed: false, completeness_score: 0, review_count: 0,
      average_rating: null, auto_create_status: "not_started", content_generated: false,
      credentials_stored: false, missing_fields: [], optimization_score: 0,
    },
    {
      platform: "samhsa", platform_name: "SAMHSA Locator",
      exists: false, is_claimed: false, completeness_score: 0, review_count: 0,
      average_rating: null, auto_create_status: "not_started", content_generated: false,
      credentials_stored: false, missing_fields: [], optimization_score: 0,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockScorecard.mockResolvedValue({ data: sampleScorecard });
  mockGenerateContent.mockResolvedValue({ data: { status: "generating" } });
  mockAutoCreate.mockResolvedValue({ data: { status: "in_progress" } });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Profiles module page", () => {
  it("renders page heading", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("Directory Profiles")).toBeInTheDocument();
    });
  });

  it("shows Module 5 label", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("Module 5")).toBeInTheDocument();
    });
  });

  it("renders stat cards", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("Overall Score")).toBeInTheDocument();
      expect(screen.getByText("Claimed Profiles")).toBeInTheDocument();
      expect(screen.getByText("Content Generated")).toBeInTheDocument();
      expect(screen.getByText("Avg Rating")).toBeInTheDocument();
    });
  });

  it("shows overall score in stat card", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("62%")).toBeInTheDocument();
    });
  });

  it("shows claimed profiles ratio", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("3 / 9")).toBeInTheDocument();
    });
  });

  it("renders all 9 platform cards", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("Google Business Profile")).toBeInTheDocument();
      expect(screen.getByText("Psychology Today")).toBeInTheDocument();
      expect(screen.getByText("TherapyDen")).toBeInTheDocument();
      expect(screen.getByText("Healthgrades")).toBeInTheDocument();
      expect(screen.getByText("Zocdoc")).toBeInTheDocument();
      expect(screen.getByText("Vitals")).toBeInTheDocument();
      expect(screen.getByText("Yelp")).toBeInTheDocument();
      expect(screen.getByText("WebMD / Medscape")).toBeInTheDocument();
      expect(screen.getByText("SAMHSA Locator")).toBeInTheDocument();
    });
  });

  it("shows Claimed badge on Google Business Profile", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("Claimed")).toBeInTheDocument();
    });
  });

  it("shows Content Ready badge on platforms with content generated", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Content Ready").length).toBeGreaterThan(0);
    });
  });

  it("shows Live status on completed platform", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("Live")).toBeInTheDocument();
    });
  });

  it("shows Needs Manual status for psychology today", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("Needs Manual")).toBeInTheDocument();
    });
  });

  it("shows Generate Content button on platforms without content", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      // Several platforms with no content, should see Generate Content buttons
      expect(screen.getAllByText("Generate Content").length).toBeGreaterThan(0);
    });
  });

  it("calls generateContent when Generate Content is clicked", async () => {
    render(<ProfilesPage />);
    await waitFor(() => screen.getAllByText("Generate Content")[0]);
    fireEvent.click(screen.getAllByText("Generate Content")[0]);
    await waitFor(() => {
      expect(mockGenerateContent).toHaveBeenCalled();
    });
  });

  it("calls generateContent for all when Generate All Content header button is clicked", async () => {
    render(<ProfilesPage />);
    await waitFor(() => screen.getByText("Generate All Content"));
    fireEvent.click(screen.getByText("Generate All Content"));
    await waitFor(() => {
      expect(mockGenerateContent).toHaveBeenCalledWith("company-abc", "all");
    });
  });

  it("shows Auto-Create button on platforms with content but not auto-created", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      // Psychology Today has content but is needs_manual
      expect(screen.getAllByText("Auto-Create").length).toBeGreaterThan(0);
    });
  });

  it("shows overall score progress bar", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("Directory Presence Score")).toBeInTheDocument();
    });
  });

  it("shows how auto-create works section", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("How Playwright Auto-Create Works")).toBeInTheDocument();
    });
  });

  it("shows all 5 automation steps", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      expect(screen.getByText("Generate Content")).toBeInTheDocument();
      expect(screen.getByText("Human Approval")).toBeInTheDocument();
      expect(screen.getByText("Add Credentials")).toBeInTheDocument();
      expect(screen.getByText("Playwright Login")).toBeInTheDocument();
      expect(screen.getByText("Auto-Submit")).toBeInTheDocument();
    });
  });

  it("shows average rating when platforms have ratings", async () => {
    render(<ProfilesPage />);
    await waitFor(() => {
      // Average of 4.7 and 4.2 = 4.45 -> 4.5
      expect(screen.getByText(/4\.\d/)).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    mockScorecard.mockImplementation(() => new Promise(() => {}));
    render(<ProfilesPage />);
    expect(screen.getByText(/Loading Directory Profiles/)).toBeInTheDocument();
  });

  it("shows empty state with default platforms when scorecard is null", async () => {
    mockScorecard.mockResolvedValue({ data: null });
    render(<ProfilesPage />);
    await waitFor(() => {
      // Should render default platform grid
      expect(screen.getByText("Google Business Profile")).toBeInTheDocument();
    });
  });
});

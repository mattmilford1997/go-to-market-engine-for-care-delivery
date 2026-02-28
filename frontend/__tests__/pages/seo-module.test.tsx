import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SEOPage from "@/app/dashboard/[companyId]/seo/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
}));

// Mock recharts
jest.mock("recharts", () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
}));

const mockLatestReport = jest.fn();
const mockKeywords = jest.fn();
const mockRecommendations = jest.fn();
const mockRunAudit = jest.fn();
const mockRunPagespeed = jest.fn();

jest.mock("@/lib/api", () => ({
  seoApi: {
    latestReport: (...args: any[]) => mockLatestReport(...args),
    keywords: (...args: any[]) => mockKeywords(...args),
    recommendations: (...args: any[]) => mockRecommendations(...args),
    runAudit: (...args: any[]) => mockRunAudit(...args),
    runPagespeed: (...args: any[]) => mockRunPagespeed(...args),
  },
}));

const sampleReport = {
  pagespeed_mobile: 72,
  pagespeed_desktop: 91,
  core_web_vitals: {
    lcp: 2200,
    fid: 80,
    cls: 0.05,
    inp: 190,
  },
  crawl_errors: 3,
  meta_issues: 7,
  schema_issues: 2,
  ranking_keywords: [
    { keyword: "TMS therapy Phoenix", position: 4, volume: 1200, change: 2 },
    { keyword: "ketamine therapy near me", position: 8, volume: 2400, change: -1 },
    { keyword: "mental health clinic Scottsdale", position: 14, volume: 800, change: 0 },
  ],
  recommendations: [
    { issue: "Missing meta descriptions", priority: "high", fix: "Add unique meta descriptions to all pages", category: "Meta Tags", impact: "High CTR improvement" },
    { issue: "Slow LCP on mobile", priority: "medium", fix: "Optimize images and reduce JavaScript", category: "Performance", impact: "PageSpeed +15pts" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLatestReport.mockResolvedValue({ data: sampleReport });
  mockKeywords.mockResolvedValue({ data: { keywords: [], opportunities: [] } });
  mockRecommendations.mockResolvedValue({ data: { recommendations: [] } });
  mockRunAudit.mockResolvedValue({ data: {} });
  mockRunPagespeed.mockResolvedValue({ data: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("SEO module page", () => {
  it("renders page heading", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("SEO Dashboard")).toBeInTheDocument();
    });
  });

  it("shows Module 4 label", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("Module 4")).toBeInTheDocument();
    });
  });

  it("renders stat cards", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("Mobile Score")).toBeInTheDocument();
      expect(screen.getByText("Desktop Score")).toBeInTheDocument();
      expect(screen.getByText("Ranking Keywords")).toBeInTheDocument();
      expect(screen.getByText("Open Issues")).toBeInTheDocument();
    });
  });

  it("shows mobile and desktop PageSpeed scores", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("72")).toBeInTheDocument();
      expect(screen.getByText("91")).toBeInTheDocument();
    });
  });

  it("shows PageSpeed Scores section with score rings", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("PageSpeed Scores")).toBeInTheDocument();
      expect(screen.getByText("Mobile")).toBeInTheDocument();
      expect(screen.getByText("Desktop")).toBeInTheDocument();
    });
  });

  it("shows Core Web Vitals section", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("Core Web Vitals")).toBeInTheDocument();
      expect(screen.getByText("Largest Contentful Paint")).toBeInTheDocument();
      expect(screen.getByText("Cumulative Layout Shift")).toBeInTheDocument();
    });
  });

  it("shows technical issues when present", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("Technical Issues Found")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument(); // crawl errors
      expect(screen.getByText("Crawl Errors")).toBeInTheDocument();
      expect(screen.getByText("Meta Tag Issues")).toBeInTheDocument();
    });
  });

  it("shows keyword rankings table", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("Keyword Rankings")).toBeInTheDocument();
      expect(screen.getByText("TMS therapy Phoenix")).toBeInTheDocument();
      expect(screen.getByText("ketamine therapy near me")).toBeInTheDocument();
    });
  });

  it("shows page 2 opportunity badge for position 14", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("Page 2 Opportunity")).toBeInTheDocument();
    });
  });

  it("shows top 3 badge for position 4", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("Top 3")).toBeInTheDocument();
    });
  });

  it("shows recommendations section", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("Recommendations")).toBeInTheDocument();
      expect(screen.getByText("Missing meta descriptions")).toBeInTheDocument();
    });
  });

  it("shows priority badge in recommendations", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("high")).toBeInTheDocument();
    });
  });

  it("calls runAudit when Run Full Audit is clicked", async () => {
    render(<SEOPage />);
    await waitFor(() => screen.getByText("Run Full Audit"));
    fireEvent.click(screen.getByText("Run Full Audit"));
    await waitFor(() => {
      expect(mockRunAudit).toHaveBeenCalledWith("company-abc");
    });
  });

  it("calls runPagespeed when Check PageSpeed is clicked", async () => {
    render(<SEOPage />);
    await waitFor(() => screen.getByText("Check PageSpeed"));
    fireEvent.click(screen.getByText("Check PageSpeed"));
    await waitFor(() => {
      expect(mockRunPagespeed).toHaveBeenCalledWith("company-abc");
    });
  });

  it("shows no-audit empty state when no report", async () => {
    mockLatestReport.mockResolvedValue({ data: null });
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("No SEO Audit Yet")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    mockLatestReport.mockImplementation(() => new Promise(() => {}));
    mockKeywords.mockImplementation(() => new Promise(() => {}));
    mockRecommendations.mockImplementation(() => new Promise(() => {}));
    render(<SEOPage />);
    expect(screen.getByText(/Loading SEO Dashboard/)).toBeInTheDocument();
  });

  it("shows good/needs-work labels for scores", async () => {
    render(<SEOPage />);
    await waitFor(() => {
      expect(screen.getByText("Needs Work")).toBeInTheDocument(); // 72
      expect(screen.getByText("Good")).toBeInTheDocument(); // 91
    });
  });
});

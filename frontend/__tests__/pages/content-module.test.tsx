import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ContentPage from "@/app/dashboard/[companyId]/content/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
}));

// Mock recharts to avoid SVG rendering in tests
jest.mock("recharts", () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Legend: () => null,
}));

const mockItems = jest.fn();
const mockCalendar = jest.fn();
const mockGenerateBlogPost = jest.fn();
const mockGenerateSocialPosts = jest.fn();
const mockGenerateFullCalendar = jest.fn();

jest.mock("@/lib/api", () => ({
  contentApi: {
    items: (...args: any[]) => mockItems(...args),
    calendar: (...args: any[]) => mockCalendar(...args),
    generateBlogPost: (...args: any[]) => mockGenerateBlogPost(...args),
    generateSocialPosts: (...args: any[]) => mockGenerateSocialPosts(...args),
    generateFullCalendar: (...args: any[]) => mockGenerateFullCalendar(...args),
  },
  approvalApi: {
    queue: jest.fn().mockResolvedValue({ data: { items: [] } }),
  },
}));

const sampleItems = {
  items: [
    {
      id: "i1", title: "5 Benefits of TMS Therapy", body: "TMS Therapy has many benefits...",
      content_type: "blog_post", status: "approved", target_keyword: "TMS therapy benefits",
      created_at: "2026-01-15",
    },
    {
      id: "i2", title: "Mental Health Awareness Post", body: "May is mental health awareness month...",
      content_type: "social_facebook", status: "pending_review", target_keyword: null,
      created_at: "2026-01-16",
    },
    {
      id: "i3", title: "Why Choose Ketamine Therapy?", body: "Ketamine has emerged as...",
      content_type: "blog_post", status: "published", target_keyword: "ketamine therapy",
      created_at: "2026-01-17",
    },
  ],
};

const sampleCalendar = {
  weeks: [
    { week: 1, items: [{ type: "blog_post", topic: "TMS therapy introduction" }, { type: "social_facebook", topic: "Mental health tip" }] },
    { week: 2, items: [{ type: "social_instagram", topic: "Wellness Wednesday" }] },
    { week: 3, items: [] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockItems.mockResolvedValue({ data: sampleItems });
  mockCalendar.mockResolvedValue({ data: sampleCalendar });
  mockGenerateBlogPost.mockResolvedValue({ data: {} });
  mockGenerateSocialPosts.mockResolvedValue({ data: {} });
  mockGenerateFullCalendar.mockResolvedValue({ data: {} });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Content module page", () => {
  it("renders page heading", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("Content Studio")).toBeInTheDocument();
    });
  });

  it("shows Module 3 label", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("Module 3")).toBeInTheDocument();
    });
  });

  it("renders stat cards", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("Total Content")).toBeInTheDocument();
      expect(screen.getByText("Published")).toBeInTheDocument();
      expect(screen.getByText("Pending Review")).toBeInTheDocument();
      expect(screen.getByText("Scheduled")).toBeInTheDocument();
    });
  });

  it("shows correct total content count", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      // 3 sample items
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("shows 12-week content calendar section", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("12-Week Content Calendar")).toBeInTheDocument();
    });
  });

  it("shows calendar weeks", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("Wk 1")).toBeInTheDocument();
      expect(screen.getByText("Wk 2")).toBeInTheDocument();
    });
  });

  it("shows content mix section", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("Content Mix")).toBeInTheDocument();
    });
  });

  it("shows content library section", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("Content Library")).toBeInTheDocument();
    });
  });

  it("renders content item titles", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("5 Benefits of TMS Therapy")).toBeInTheDocument();
      expect(screen.getByText("Mental Health Awareness Post")).toBeInTheDocument();
      expect(screen.getByText("Why Choose Ketamine Therapy?")).toBeInTheDocument();
    });
  });

  it("shows approved/pending/published status badges", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("approved")).toBeInTheDocument();
      expect(screen.getByText("pending review")).toBeInTheDocument();
      expect(screen.getByText("published")).toBeInTheDocument();
    });
  });

  it("shows Blog filter button", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Blog" })).toBeInTheDocument();
    });
  });

  it("filters to blog posts when Blog filter is clicked", async () => {
    render(<ContentPage />);
    await waitFor(() => screen.getByRole("button", { name: "Blog" }));
    fireEvent.click(screen.getByRole("button", { name: "Blog" }));
    await waitFor(() => {
      expect(screen.getByText("5 Benefits of TMS Therapy")).toBeInTheDocument();
      expect(screen.queryByText("Mental Health Awareness Post")).not.toBeInTheDocument();
    });
  });

  it("calls generateBlogPost when New Blog Post is clicked", async () => {
    render(<ContentPage />);
    await waitFor(() => screen.getByText("New Blog Post"));
    fireEvent.click(screen.getByText("New Blog Post"));
    await waitFor(() => {
      expect(mockGenerateBlogPost).toHaveBeenCalledWith("company-abc", "mental health treatment options", 1500);
    });
  });

  it("calls generateSocialPosts when Social Posts is clicked", async () => {
    render(<ContentPage />);
    await waitFor(() => screen.getByText("Social Posts"));
    fireEvent.click(screen.getByText("Social Posts"));
    await waitFor(() => {
      expect(mockGenerateSocialPosts).toHaveBeenCalledWith("company-abc", "all", 3);
    });
  });

  it("calls generateFullCalendar when Generate 12-Week Calendar is clicked", async () => {
    render(<ContentPage />);
    await waitFor(() => screen.getByText("Generate 12-Week Calendar"));
    fireEvent.click(screen.getByText("Generate 12-Week Calendar"));
    await waitFor(() => {
      expect(mockGenerateFullCalendar).toHaveBeenCalledWith("company-abc");
    });
  });

  it("shows loading state initially", () => {
    mockItems.mockImplementation(() => new Promise(() => {}));
    mockCalendar.mockImplementation(() => new Promise(() => {}));
    render(<ContentPage />);
    expect(screen.getByText(/Loading Content Studio/)).toBeInTheDocument();
  });

  it("shows empty content state when no items", async () => {
    mockItems.mockResolvedValue({ data: { items: [] } });
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("No content yet")).toBeInTheDocument();
    });
  });

  it("shows pipeline section in content mix", async () => {
    render(<ContentPage />);
    await waitFor(() => {
      expect(screen.getByText("Pipeline")).toBeInTheDocument();
    });
  });
});

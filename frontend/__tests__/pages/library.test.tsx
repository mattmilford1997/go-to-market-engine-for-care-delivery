import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import LibraryPage from "@/app/dashboard/[companyId]/library/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
}));

const mockItems = jest.fn();

jest.mock("@/lib/api", () => ({
  contentApi: {
    items: (...args: any[]) => mockItems(...args),
  },
}));

const sampleItems = [
  {
    id: "item-1",
    title: "TMS Therapy for Depression: A Complete Guide",
    content_type: "blog_post",
    status: "approved",
    target_keyword: "tms therapy depression",
    created_at: "2026-01-15T10:00:00Z",
    body_preview: "TMS therapy is an effective non-invasive treatment...",
  },
  {
    id: "item-2",
    title: "Instagram Post — TMS Benefits",
    content_type: "social_instagram",
    status: "pending_review",
    target_keyword: null,
    created_at: "2026-01-16T10:00:00Z",
    body_preview: null,
  },
  {
    id: "item-3",
    title: "Google Ad — TMS Local Intent",
    content_type: "ad_copy_google",
    status: "published",
    target_keyword: "tms near me",
    created_at: "2026-01-17T10:00:00Z",
    body_preview: "Non-invasive TMS therapy. Book your free consultation today.",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockItems.mockResolvedValue({ data: { items: sampleItems, total: 3 } });
});

describe("Materials Library page", () => {
  it("renders page heading", async () => {
    render(<LibraryPage />);
    await waitFor(() => {
      expect(screen.getByText("Materials Library")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    mockItems.mockImplementation(() => new Promise(() => {}));
    render(<LibraryPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows total item count", async () => {
    render(<LibraryPage />);
    await waitFor(() => {
      expect(screen.getByText(/3 items/)).toBeInTheDocument();
    });
  });

  it("shows singular item when total is 1", async () => {
    mockItems.mockResolvedValue({ data: { items: [sampleItems[0]], total: 1 } });
    render(<LibraryPage />);
    await waitFor(() => {
      expect(screen.getByText(/1 item ·/)).toBeInTheDocument();
    });
  });

  it("renders content type filter tabs", async () => {
    render(<LibraryPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Blog Post" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Fax Sheet" })).toBeInTheDocument();
    });
  });

  it("renders status filter tabs", async () => {
    render(<LibraryPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "All Statuses" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "approved" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "published" })).toBeInTheDocument();
    });
  });

  it("renders item titles in the table", async () => {
    render(<LibraryPage />);
    await waitFor(() => {
      expect(screen.getByText("TMS Therapy for Depression: A Complete Guide")).toBeInTheDocument();
      expect(screen.getByText("Instagram Post — TMS Benefits")).toBeInTheDocument();
      expect(screen.getByText("Google Ad — TMS Local Intent")).toBeInTheDocument();
    });
  });

  it("renders content type labels", async () => {
    render(<LibraryPage />);
    await waitFor(() => {
      expect(screen.getByText("Blog Post")).toBeInTheDocument();
      expect(screen.getByText("Social Instagram")).toBeInTheDocument();
      expect(screen.getByText("Ad Copy Google")).toBeInTheDocument();
    });
  });

  it("renders status badges", async () => {
    render(<LibraryPage />);
    await waitFor(() => {
      expect(screen.getByText("approved")).toBeInTheDocument();
      expect(screen.getByText("pending review")).toBeInTheDocument();
      expect(screen.getByText("published")).toBeInTheDocument();
    });
  });

  it("shows View buttons for each item", async () => {
    render(<LibraryPage />);
    await waitFor(() => {
      const viewButtons = screen.getAllByText("View");
      expect(viewButtons).toHaveLength(3);
    });
  });

  it("shows item preview when View is clicked", async () => {
    render(<LibraryPage />);
    await waitFor(() => screen.getAllByText("View"));

    fireEvent.click(screen.getAllByText("View")[0]);

    // After clicking View, Close button should appear (expanded state)
    expect(screen.getByText("Close")).toBeInTheDocument();
    // body_preview text may appear in both the table snippet and expanded view
    expect(screen.getAllByText("TMS therapy is an effective non-invasive treatment...").length).toBeGreaterThan(0);
  });

  it("hides preview when Close is clicked", async () => {
    render(<LibraryPage />);
    await waitFor(() => screen.getAllByText("View"));

    fireEvent.click(screen.getAllByText("View")[0]);
    expect(screen.getByText("Close")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("shows no items message when filters return empty", async () => {
    mockItems.mockResolvedValue({ data: { items: [], total: 0 } });
    render(<LibraryPage />);
    await waitFor(() => {
      expect(screen.getByText("No items match your filters.")).toBeInTheDocument();
    });
  });

  it("calls items API with content_type filter when type tab is clicked", async () => {
    render(<LibraryPage />);
    await waitFor(() => screen.getByRole("button", { name: "Blog Post" }));

    fireEvent.click(screen.getByRole("button", { name: "Blog Post" }));

    await waitFor(() => {
      expect(mockItems).toHaveBeenCalledWith(
        "company-abc",
        expect.objectContaining({ content_type: "blog_post" })
      );
    });
  });

  it("calls items API with status filter when status tab is clicked", async () => {
    render(<LibraryPage />);
    await waitFor(() => screen.getByRole("button", { name: "approved" }));

    fireEvent.click(screen.getByRole("button", { name: "approved" }));

    await waitFor(() => {
      expect(mockItems).toHaveBeenCalledWith(
        "company-abc",
        expect.objectContaining({ status: "approved" })
      );
    });
  });

  it("renders keyword for items that have it", async () => {
    render(<LibraryPage />);
    await waitFor(() => {
      expect(screen.getByText("tms therapy depression")).toBeInTheDocument();
      expect(screen.getByText("tms near me")).toBeInTheDocument();
    });
  });

  it("renders creation dates", async () => {
    render(<LibraryPage />);
    await waitFor(() => {
      // Dates are formatted by toLocaleDateString, result may vary by locale
      // Just check that some date-formatted text appears
      const datePattern = /\d+\/\d+\/\d+/;
      const element = document.body.textContent;
      expect(element).toMatch(datePattern);
    });
  });
});

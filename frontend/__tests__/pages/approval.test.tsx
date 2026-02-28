import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ApprovalQueuePage from "@/app/dashboard/[companyId]/approval/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
}));

const mockQueue = jest.fn();
const mockAction = jest.fn();
const mockBulkApprove = jest.fn();

jest.mock("@/lib/api", () => ({
  approvalApi: {
    queue: (...args: any[]) => mockQueue(...args),
    action: (...args: any[]) => mockAction(...args),
    bulkApprove: (...args: any[]) => mockBulkApprove(...args),
  },
}));

const sampleItems = [
  {
    id: "item-1",
    module: "content",
    item_type: "blog_post",
    title: "TMS Therapy for Depression",
    preview_data: { body_preview: "TMS therapy is a non-invasive..." },
  },
  {
    id: "item-2",
    module: "paid_ads",
    item_type: "google_ad",
    title: "Google Ad — TMS Local",
    preview_data: {},
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockQueue.mockResolvedValue({ data: sampleItems });
  mockAction.mockResolvedValue({ data: {} });
  mockBulkApprove.mockResolvedValue({ data: {} });
});

describe("Approval Queue page", () => {
  it("renders page heading", async () => {
    render(<ApprovalQueuePage />);
    expect(screen.getByText("Approval Queue")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockQueue.mockImplementation(() => new Promise(() => {}));
    render(<ApprovalQueuePage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders module filter tabs", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => expect(screen.getByText("All Modules")).toBeInTheDocument());
    // Use role-based queries to specifically find the tab buttons
    expect(screen.getByRole("button", { name: "Paid Ads" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Content" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Referral" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SEO" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Profiles" })).toBeInTheDocument();
  });

  it("renders approval items after loading", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => {
      expect(screen.getByText("TMS Therapy for Depression")).toBeInTheDocument();
      expect(screen.getByText("Google Ad — TMS Local")).toBeInTheDocument();
    });
  });

  it("renders Approve and Reject buttons for each item", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => screen.getByText("TMS Therapy for Depression"));

    const approveButtons = screen.getAllByText("Approve");
    const rejectButtons = screen.getAllByText("Reject");
    expect(approveButtons).toHaveLength(2);
    expect(rejectButtons).toHaveLength(2);
  });

  it("shows empty queue message when no items", async () => {
    mockQueue.mockResolvedValue({ data: [] });
    render(<ApprovalQueuePage />);
    await waitFor(() => {
      expect(screen.getByText("Queue is clear")).toBeInTheDocument();
    });
  });

  it("shows Approve All button when items are present", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => {
      expect(screen.getByText("Approve All")).toBeInTheDocument();
    });
  });

  it("calls action with approve when Approve is clicked", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => screen.getAllByText("Approve"));

    fireEvent.click(screen.getAllByText("Approve")[0]);

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalledWith("company-abc", "item-1", "approve", undefined);
    });
  });

  it("removes item from list after approval", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => screen.getByText("TMS Therapy for Depression"));

    fireEvent.click(screen.getAllByText("Approve")[0]);

    await waitFor(() => {
      expect(screen.queryByText("TMS Therapy for Depression")).not.toBeInTheDocument();
    });
  });

  it("shows rejection form when Reject is clicked", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => screen.getAllByText("Reject"));

    fireEvent.click(screen.getAllByText("Reject")[0]);

    expect(screen.getByPlaceholderText(/Reason for rejection/i)).toBeInTheDocument();
    expect(screen.getByText("Confirm Reject")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls action with reject and notes on Confirm Reject", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => screen.getAllByText("Reject"));

    fireEvent.click(screen.getAllByText("Reject")[0]);
    const textarea = screen.getByPlaceholderText(/Reason for rejection/i);
    await userEvent.type(textarea, "Not relevant");
    fireEvent.click(screen.getByText("Confirm Reject"));

    await waitFor(() => {
      expect(mockAction).toHaveBeenCalledWith("company-abc", "item-1", "reject", "Not relevant");
    });
  });

  it("hides rejection form when Cancel is clicked", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => screen.getAllByText("Reject"));

    fireEvent.click(screen.getAllByText("Reject")[0]);
    expect(screen.getByPlaceholderText(/Reason for rejection/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByPlaceholderText(/Reason for rejection/i)).not.toBeInTheDocument();
  });

  it("shows preview when Preview is clicked", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => screen.getAllByText("Preview"));

    fireEvent.click(screen.getAllByText("Preview")[0]);

    // After clicking preview, "Less" button should appear, confirming expanded state
    await waitFor(() => {
      expect(screen.getByText("Less")).toBeInTheDocument();
    });
    // The body_preview text appears in multiple places (inline preview + expanded), that's fine
    expect(screen.getAllByText(/TMS therapy is a non-invasive/).length).toBeGreaterThan(0);
  });

  it("calls queue with module filter when tab is clicked", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => screen.getByText("Content"));

    fireEvent.click(screen.getByText("Content"));

    await waitFor(() => {
      expect(mockQueue).toHaveBeenCalledWith("company-abc", "content");
    });
  });

  it("calls bulkApprove when Approve All is clicked", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => screen.getByText("Approve All"));

    fireEvent.click(screen.getByText("Approve All"));

    await waitFor(() => {
      expect(mockBulkApprove).toHaveBeenCalled();
    });
  });

  it("updates Approve All button label when items are selected", async () => {
    render(<ApprovalQueuePage />);
    await waitFor(() => screen.getAllByRole("checkbox"));

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    expect(screen.getByText("Approve Selected (1)")).toBeInTheDocument();
  });
});

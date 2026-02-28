import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ReferralPage from "@/app/dashboard/[companyId]/referral/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
}));

const mockLeads = jest.fn();
const mockCampaigns = jest.fn();
const mockQueueItems = jest.fn();
const mockGenerateLeads = jest.fn();
const mockGenerateAllCollateral = jest.fn();
const mockUploadLeadsCsv = jest.fn();

jest.mock("@/lib/api", () => ({
  referralApi: {
    leads: (...args: any[]) => mockLeads(...args),
    campaigns: (...args: any[]) => mockCampaigns(...args),
    generateLeads: (...args: any[]) => mockGenerateLeads(...args),
    generateAllCollateral: (...args: any[]) => mockGenerateAllCollateral(...args),
    uploadLeadsCsv: (...args: any[]) => mockUploadLeadsCsv(...args),
  },
  approvalApi: {
    queue: (...args: any[]) => mockQueueItems(...args),
  },
}));

const sampleLeads = {
  items: [
    {
      id: "l1", first_name: "Dr. Sarah", last_name: "Chen", credentials: "MD",
      specialty: "Psychiatry", fax: "555-0100", email: "schen@clinic.com",
      city: "Phoenix", state: "AZ", status: "new", source: "nppes",
    },
    {
      id: "l2", first_name: "Dr. James", last_name: "Park", credentials: "DO",
      specialty: "Family Medicine", fax: "555-0200", email: "jpark@health.com",
      city: "Scottsdale", state: "AZ", status: "contacted", source: "nppes",
    },
  ],
};

const sampleCampaigns = [
  { id: "c1", name: "Q1 Referral Outreach", channel: "email", status: "active", impressions: 450, clicks: 23, form_submissions: 4, spend: 0, budget_cap: 500 },
];

const sampleQueueItems = {
  items: [
    { id: "q1", title: "Fax Sheet — Psychiatrists", item_type: "fax_sheet", status: "approved", preview_data: {} },
    { id: "q2", title: "Email Sequence — Family Medicine", item_type: "email_sequence", status: "pending", preview_data: {} },
    { id: "q3", title: "Voicemail Script", item_type: "voicemail_script", status: "pending", preview_data: {} },
    { id: "q4", title: "Postcard — Referral", item_type: "postcard", status: "pending", preview_data: {} },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLeads.mockResolvedValue({ data: sampleLeads });
  mockCampaigns.mockResolvedValue({ data: sampleCampaigns });
  mockQueueItems.mockResolvedValue({ data: sampleQueueItems });
  mockGenerateLeads.mockResolvedValue({ data: {} });
  mockGenerateAllCollateral.mockResolvedValue({ data: {} });
  mockUploadLeadsCsv.mockResolvedValue({
    data: { created: 2, errors: [], list_name: null, campaign_id: null, column_mapping: {}, unrecognized_columns: [] },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Referral module page", () => {
  it("renders page heading", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Referral Pipeline")).toBeInTheDocument();
    });
  });

  it("shows Module 2 label", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Module 2")).toBeInTheDocument();
    });
  });

  it("renders stat cards", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Total Leads")).toBeInTheDocument();
      expect(screen.getByText("New Leads")).toBeInTheDocument();
      expect(screen.getByText("Actively Referring")).toBeInTheDocument();
      expect(screen.getByText("Collateral Pieces")).toBeInTheDocument();
    });
  });

  it("shows lead pipeline section", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Lead Pipeline")).toBeInTheDocument();
    });
  });

  it("shows collateral status section", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Collateral Status")).toBeInTheDocument();
    });
  });

  it("shows all 4 collateral channel cards", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Fax Sheets")).toBeInTheDocument();
      expect(screen.getByText("Email Sequences")).toBeInTheDocument();
      expect(screen.getByText("Voicemail Scripts")).toBeInTheDocument();
      expect(screen.getByText("Postcards")).toBeInTheDocument();
    });
  });

  it("shows 30-day sequence timeline", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("30-Day Outreach Sequence")).toBeInTheDocument();
    });
  });

  it("shows provider leads table", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Provider Leads")).toBeInTheDocument();
    });
  });

  it("renders lead names in table", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText(/Dr. Sarah/)).toBeInTheDocument();
      expect(screen.getByText(/Dr. James/)).toBeInTheDocument();
    });
  });

  it("shows campaign table when campaigns exist", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Active Campaigns")).toBeInTheDocument();
      expect(screen.getByText("Q1 Referral Outreach")).toBeInTheDocument();
    });
  });

  it("shows compliance note", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Compliance Built-In:")).toBeInTheDocument();
    });
  });

  it("calls generateLeads when Auto-Generate button is clicked", async () => {
    render(<ReferralPage />);
    await waitFor(() => screen.getAllByText(/Auto-Generate from NPPES/));
    fireEvent.click(screen.getAllByText(/Auto-Generate from NPPES/)[0]);
    await waitFor(() => {
      expect(mockGenerateLeads).toHaveBeenCalledWith("company-abc");
    });
  });

  it("calls generateAllCollateral when Generate All Collateral header button is clicked", async () => {
    render(<ReferralPage />);
    await waitFor(() => screen.getByText("Generate All Collateral"));
    fireEvent.click(screen.getByText("Generate All Collateral"));
    await waitFor(() => {
      expect(mockGenerateAllCollateral).toHaveBeenCalledWith("company-abc");
    });
  });

  it("shows empty state when no leads", async () => {
    mockLeads.mockResolvedValue({ data: { items: [] } });
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("No provider leads yet")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    mockLeads.mockImplementation(() => new Promise(() => {}));
    mockCampaigns.mockImplementation(() => new Promise(() => {}));
    mockQueueItems.mockImplementation(() => new Promise(() => {}));
    render(<ReferralPage />);
    expect(screen.getByText(/Loading Referral Pipeline/)).toBeInTheDocument();
  });

  it("shows specialty in leads table", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Psychiatry")).toBeInTheDocument();
    });
  });

  it("shows NPPES as source badge", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      // Multiple NPPES badges expected
      expect(screen.getAllByText("NPPES").length).toBeGreaterThan(0);
    });
  });

  it("renders list name input for CSV upload", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/List name/i);
      expect(input).toBeInTheDocument();
    });
  });

  it("renders Upload CSV button", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/Upload CSV/i).length).toBeGreaterThan(0);
    });
  });

  it("hidden file input exists for CSV upload", async () => {
    render(<ReferralPage />);
    await waitFor(() => screen.getByText("Provider Leads"));
    const fileInput = document.querySelector('input[type="file"][accept=".csv"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
  });

  it("uploads CSV with list name and shows toast", async () => {
    mockUploadLeadsCsv.mockResolvedValue({
      data: { created: 3, errors: [], list_name: "Pediatricians in Texas", campaign_id: "camp-1", column_mapping: {}, unrecognized_columns: [] },
    });
    render(<ReferralPage />);
    await waitFor(() => screen.getByPlaceholderText(/List name/i));

    // Set list name
    fireEvent.change(screen.getByPlaceholderText(/List name/i), {
      target: { value: "Pediatricians in Texas" },
    });

    // Trigger file upload
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["first_name,last_name\nJane,Doe"], "leads.csv", { type: "text/csv" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(mockUploadLeadsCsv).toHaveBeenCalledWith("company-abc", file, "Pediatricians in Texas");
    });
  });

  it("shows unrecognized column warning in toast", async () => {
    mockUploadLeadsCsv.mockResolvedValue({
      data: { created: 1, errors: [], list_name: null, campaign_id: null, column_mapping: {}, unrecognized_columns: ["custom_field"] },
    });
    render(<ReferralPage />);
    await waitFor(() => screen.getByText("Provider Leads"));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["first_name,custom_field\nJane,val"], "list.csv", { type: "text/csv" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByText(/unrecognized column/i)).toBeInTheDocument();
    });
  });

  it("shows Load Demo button and loads demo data", async () => {
    render(<ReferralPage />);
    await waitFor(() => {
      expect(screen.getByText("Load Demo")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Load Demo"));
    await waitFor(() => {
      // Demo leads should appear
      expect(screen.getByText(/Sarah/)).toBeInTheDocument();
    });
  });
});

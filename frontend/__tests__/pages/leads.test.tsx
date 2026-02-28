import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import LeadsPage from "@/app/dashboard/[companyId]/leads/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
}));

const mockLeads = jest.fn();
const mockGenerateLeads = jest.fn();
const mockUploadLeadsCsv = jest.fn();

jest.mock("@/lib/api", () => ({
  referralApi: {
    leads: (...args: any[]) => mockLeads(...args),
    generateLeads: (...args: any[]) => mockGenerateLeads(...args),
    uploadLeadsCsv: (...args: any[]) => mockUploadLeadsCsv(...args),
  },
}));

const sampleLeads = [
  {
    id: "lead-1",
    first_name: "John",
    last_name: "Smith",
    credentials: "MD",
    practice_name: "Smith Psychiatry",
    specialty: "Psychiatry",
    city: "Phoenix",
    state: "AZ",
    fax: "602-555-0100",
    email: "jsmith@example.com",
    status: "new",
    source: "nppes",
  },
  {
    id: "lead-2",
    first_name: "Maria",
    last_name: "Jones",
    credentials: "DO",
    practice_name: "Jones Mental Health",
    specialty: "Mental Health",
    city: "Scottsdale",
    state: "AZ",
    fax: null,
    email: null,
    status: "contacted",
    source: "csv",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockLeads.mockResolvedValue({ data: { leads: sampleLeads, total: 2 } });
  mockGenerateLeads.mockResolvedValue({ data: {} });
  mockUploadLeadsCsv.mockResolvedValue({ data: {} });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Leads page", () => {
  it("renders page heading", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByText("Referral Leads")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    mockLeads.mockImplementation(() => new Promise(() => {}));
    render(<LeadsPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows total provider count", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByText(/2 providers in pipeline/i)).toBeInTheDocument();
    });
  });

  it("shows singular provider when total is 1", async () => {
    mockLeads.mockResolvedValue({ data: { leads: [sampleLeads[0]], total: 1 } });
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByText(/1 provider in pipeline/i)).toBeInTheDocument();
    });
  });

  it("renders Auto-Generate from NPPES button", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Auto-Generate from NPPES/i })).toBeInTheDocument();
    });
  });

  it("renders Upload CSV button", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Upload CSV/i })).toBeInTheDocument();
    });
  });

  it("renders status filter tabs", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "new" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "contacted" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "suppressed" })).toBeInTheDocument();
    });
  });

  it("renders lead names in the table", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByText("John Smith, MD")).toBeInTheDocument();
      expect(screen.getByText("Maria Jones, DO")).toBeInTheDocument();
    });
  });

  it("renders practice names", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByText("Smith Psychiatry")).toBeInTheDocument();
      expect(screen.getByText("Jones Mental Health")).toBeInTheDocument();
    });
  });

  it("renders location info", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByText("Phoenix, AZ")).toBeInTheDocument();
      expect(screen.getByText("Scottsdale, AZ")).toBeInTheDocument();
    });
  });

  it("renders fax number when available", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByText("Fax: 602-555-0100")).toBeInTheDocument();
    });
  });

  it("renders email when available", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByText("jsmith@example.com")).toBeInTheDocument();
    });
  });

  it("shows empty state when no leads", async () => {
    mockLeads.mockResolvedValue({ data: { leads: [], total: 0 } });
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByText("No leads yet")).toBeInTheDocument();
    });
  });

  it("calls generateLeads when auto-generate button is clicked", async () => {
    render(<LeadsPage />);
    await waitFor(() => screen.getByRole("button", { name: /Auto-Generate from NPPES/i }));

    fireEvent.click(screen.getByRole("button", { name: /Auto-Generate from NPPES/i }));

    expect(mockGenerateLeads).toHaveBeenCalledWith("company-abc");
  });

  it("shows Generating… while generating", async () => {
    mockGenerateLeads.mockResolvedValue({ data: {} });
    render(<LeadsPage />);
    await waitFor(() => screen.getByRole("button", { name: /Auto-Generate from NPPES/i }));

    fireEvent.click(screen.getByRole("button", { name: /Auto-Generate from NPPES/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Generating…/i })).toBeInTheDocument();
    });
  });

  it("calls leads with status filter when tab is clicked", async () => {
    render(<LeadsPage />);
    await waitFor(() => screen.getByRole("button", { name: "contacted" }));

    fireEvent.click(screen.getByRole("button", { name: "contacted" }));

    await waitFor(() => {
      expect(mockLeads).toHaveBeenCalledWith("company-abc", { limit: "100", status: "contacted" });
    });
  });

  it("renders source info for each lead", async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(screen.getByText("nppes")).toBeInTheDocument();
      expect(screen.getByText("csv")).toBeInTheDocument();
    });
  });
});

  it("reloads leads after generate completes (setTimeout callback)", async () => {
    render(<LeadsPage />);
    await waitFor(() => screen.getByRole("button", { name: /Auto-Generate from NPPES/i }));

    fireEvent.click(screen.getByRole("button", { name: /Auto-Generate from NPPES/i }));

    // Flush microtasks so the async continuation of handleGenerateLeads runs
    // and registers the 3000ms setTimeout in the fake timer queue
    await jest.runAllTimersAsync();

    // Verify load() was called again (lines 34-35: callback body executed)
    expect(mockLeads.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("uploads CSV file and reloads leads", async () => {
    render(<LeadsPage />);
    await waitFor(() => screen.getByRole("button", { name: /Upload CSV/i }));

    // The hidden file input is triggered by the Upload CSV button click
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const file = new File(["npi,first_name\n123,John"], "leads.csv", { type: "text/csv" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(mockUploadLeadsCsv).toHaveBeenCalledWith("company-abc", file);
    });
  });

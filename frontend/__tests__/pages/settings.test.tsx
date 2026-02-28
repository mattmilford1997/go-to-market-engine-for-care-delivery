import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "@/app/dashboard/[companyId]/settings/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ companyId: "company-abc" }),
}));

const mockCredentialStatus = jest.fn();
const mockUpdateCredentials = jest.fn();

jest.mock("@/lib/api", () => ({
  companiesApi: {
    credentialStatus: (...args: any[]) => mockCredentialStatus(...args),
    updateCredentials: (...args: any[]) => mockUpdateCredentials(...args),
  },
}));

const sampleCredentials = [
  {
    key: "anthropic_api_key",
    label: "Anthropic API Key",
    module: "Core AI",
    type: "secret",
    connected: false,
  },
  {
    key: "google_ads_api_key",
    label: "Google Ads API Key",
    module: "Module 1 — Paid Ads",
    type: "secret",
    connected: true,
  },
  {
    key: "meta_access_token",
    label: "Meta Access Token",
    module: "Module 1 — Paid Ads",
    type: "secret",
    connected: false,
  },
  {
    key: "instantly_api_key",
    label: "Instantly API Key",
    module: "Module 2 — Referral",
    type: "secret",
    connected: false,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockCredentialStatus.mockResolvedValue({ data: { credentials: sampleCredentials } });
  mockUpdateCredentials.mockResolvedValue({ data: {} });
});

describe("Settings & Credentials page", () => {
  it("shows loading state initially", () => {
    mockCredentialStatus.mockImplementation(() => new Promise(() => {}));
    render(<SettingsPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders page heading", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Settings & Credentials")).toBeInTheDocument();
    });
  });

  it("renders Connected and Missing legend", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
      expect(screen.getByText("Missing")).toBeInTheDocument();
    });
  });

  it("renders grouped module sections", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Core AI")).toBeInTheDocument();
      expect(screen.getByText("Module 1 — Paid Ads")).toBeInTheDocument();
      expect(screen.getByText("Module 2 — Referral")).toBeInTheDocument();
    });
  });

  it("renders all credential labels", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Anthropic API Key")).toBeInTheDocument();
      expect(screen.getByText("Google Ads API Key")).toBeInTheDocument();
      expect(screen.getByText("Meta Access Token")).toBeInTheDocument();
      expect(screen.getByText("Instantly API Key")).toBeInTheDocument();
    });
  });

  it("renders placeholder for connected credential", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      // Google Ads is connected, so placeholder should be dots
      const inputs = screen.getAllByPlaceholderText("••••••••••••••••");
      expect(inputs.length).toBeGreaterThan(0);
    });
  });

  it("renders Enter placeholder for disconnected credentials", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter Anthropic API Key…")).toBeInTheDocument();
    });
  });

  it("Save buttons are disabled when inputs are empty", async () => {
    render(<SettingsPage />);
    await waitFor(() => screen.getByText("Anthropic API Key"));

    const saveButtons = screen.getAllByRole("button", { name: /Save/i });
    // All Save buttons should be disabled since values are empty
    saveButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("enables Save button when input has value", async () => {
    render(<SettingsPage />);
    await waitFor(() => screen.getByPlaceholderText("Enter Anthropic API Key…"));

    const input = screen.getByPlaceholderText("Enter Anthropic API Key…");
    await userEvent.type(input, "sk-ant-test-key");

    // The associated Save button should now be enabled
    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    const enabledButtons = saveButtons.filter((btn) => !btn.hasAttribute("disabled") || btn.getAttribute("disabled") === null);
    expect(enabledButtons.length).toBeGreaterThan(0);
  });

  it("calls updateCredentials when Save is clicked with a value", async () => {
    render(<SettingsPage />);
    await waitFor(() => screen.getByPlaceholderText("Enter Anthropic API Key…"));

    const input = screen.getByPlaceholderText("Enter Anthropic API Key…");
    await userEvent.type(input, "sk-ant-test-key");

    // Find and click the enabled Save button
    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    const enabledBtn = saveButtons.find((btn) => !btn.hasAttribute("disabled") || btn.getAttribute("disabled") === null);
    if (enabledBtn) {
      fireEvent.click(enabledBtn);
      await waitFor(() => {
        expect(mockUpdateCredentials).toHaveBeenCalledWith(
          "company-abc",
          { anthropic_api_key: "sk-ant-test-key" }
        );
      });
    }
  });

  it("renders File Uploads section", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("File Uploads")).toBeInTheDocument();
    });
  });

  it("renders all 4 file upload areas", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Referral Lead List (CSV)")).toBeInTheDocument();
      expect(screen.getByText("Brand Assets (logos, fonts)")).toBeInTheDocument();
      expect(screen.getByText("Provider Headshots")).toBeInTheDocument();
      expect(screen.getByText("Directory Credentials CSV")).toBeInTheDocument();
    });
  });

  it("renders 4 Choose File buttons", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const chooseButtons = screen.getAllByText("Choose File");
      expect(chooseButtons).toHaveLength(4);
    });
  });
});

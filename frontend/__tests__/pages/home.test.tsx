import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";

// Mock Next.js navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock the API
const mockCreate = jest.fn();
jest.mock("@/lib/api", () => ({
  companiesApi: {
    create: (...args: any[]) => mockCreate(...args),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Home page", () => {
  it("renders the Arche Studios header", () => {
    render(<Home />);
    expect(screen.getByText("Arche Studios")).toBeInTheDocument();
  });

  it("renders the main heading", () => {
    render(<Home />);
    expect(screen.getByText(/Institutional-grade marketing/i)).toBeInTheDocument();
  });

  it("renders the URL input pre-filled with novamindmentalhealth.com", () => {
    render(<Home />);
    const input = screen.getByPlaceholderText(/novamindmentalhealth.com/i);
    expect(input).toHaveValue("novamindmentalhealth.com");
  });

  it("renders the Launch Engine button", () => {
    render(<Home />);
    expect(screen.getByRole("button", { name: /Launch Engine/i })).toBeInTheDocument();
  });

  it("renders all 5 module cards", () => {
    render(<Home />);
    expect(screen.getByText("Paid Ads")).toBeInTheDocument();
    expect(screen.getByText("Referral")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("SEO")).toBeInTheDocument();
    expect(screen.getByText("Profiles")).toBeInTheDocument();
  });

  it("renders module channel descriptions", () => {
    render(<Home />);
    expect(screen.getByText("Google + Meta")).toBeInTheDocument();
    expect(screen.getByText("9 directories")).toBeInTheDocument();
  });

  it("renders the Portfolio Admin link", () => {
    render(<Home />);
    expect(screen.getByText(/Portfolio Admin/i)).toBeInTheDocument();
  });

  it("navigates to /admin when Portfolio Admin is clicked", async () => {
    render(<Home />);
    fireEvent.click(screen.getByText(/Portfolio Admin/i));
    expect(mockPush).toHaveBeenCalledWith("/admin");
  });

  it("allows editing the URL input", async () => {
    render(<Home />);
    const input = screen.getByPlaceholderText(/novamindmentalhealth.com/i);
    await userEvent.clear(input);
    await userEvent.type(input, "example.com");
    expect(input).toHaveValue("example.com");
  });

  it("submits the form and navigates to dashboard on success", async () => {
    mockCreate.mockResolvedValue({ data: { id: "abc-123" } });
    render(<Home />);

    const input = screen.getByPlaceholderText(/novamindmentalhealth.com/i);
    await userEvent.clear(input);
    await userEvent.type(input, "mysite.com");

    fireEvent.submit(screen.getByRole("button", { name: /Launch Engine/i }).closest("form")!);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        website_url: "https://mysite.com",
        is_pilot: false,
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard/abc-123");
    });
  });

  it("prepends https:// to URLs that don't start with http", async () => {
    mockCreate.mockResolvedValue({ data: { id: "xyz" } });
    render(<Home />);

    fireEvent.submit(screen.getByRole("button", { name: /Launch Engine/i }).closest("form")!);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ website_url: "https://novamindmentalhealth.com" })
      );
    });
  });

  it("passes is_pilot=true for novamind URL", async () => {
    mockCreate.mockResolvedValue({ data: { id: "xyz" } });
    render(<Home />);

    fireEvent.submit(screen.getByRole("button", { name: /Launch Engine/i }).closest("form")!);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ is_pilot: true })
      );
    });
  });

  it("shows error message on API failure", async () => {
    mockCreate.mockRejectedValue({
      response: { data: { detail: "Duplicate company" } },
    });
    render(<Home />);

    fireEvent.submit(screen.getByRole("button", { name: /Launch Engine/i }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Duplicate company")).toBeInTheDocument();
    });
  });

  it("shows generic error when no API detail provided", async () => {
    mockCreate.mockRejectedValue(new Error("Network error"));
    render(<Home />);

    fireEvent.submit(screen.getByRole("button", { name: /Launch Engine/i }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Failed to start onboarding")).toBeInTheDocument();
    });
  });

  it("disables button when input is empty", async () => {
    render(<Home />);
    const input = screen.getByPlaceholderText(/novamindmentalhealth.com/i);
    await userEvent.clear(input);
    const button = screen.getByRole("button", { name: /Launch Engine/i });
    expect(button).toBeDisabled();
  });

  it("shows loading state while submitting", async () => {
    mockCreate.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<Home />);

    fireEvent.submit(screen.getByRole("button", { name: /Launch Engine/i }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Ingesting…")).toBeInTheDocument();
    });
  });
});

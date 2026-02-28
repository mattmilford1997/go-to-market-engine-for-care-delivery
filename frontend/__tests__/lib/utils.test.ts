import {
  cn,
  formatCurrency,
  formatNumber,
  truncate,
  statusColor,
  healthColor,
  moduleLabel,
} from "@/lib/utils";

describe("cn (class name merger)", () => {
  it("merges simple class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
    expect(cn("foo", true && "bar")).toBe("foo bar");
  });

  it("resolves tailwind conflicts — last wins", () => {
    const result = cn("text-red-500", "text-blue-600");
    expect(result).toBe("text-blue-600");
  });

  it("handles empty inputs", () => {
    expect(cn()).toBe("");
    expect(cn("")).toBe("");
  });

  it("handles undefined and null", () => {
    expect(cn(undefined, null as any, "valid")).toBe("valid");
  });

  it("merges object syntax", () => {
    expect(cn({ "text-red-500": true, "text-blue-600": false })).toBe(
      "text-red-500"
    );
  });

  it("handles array syntax", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });
});

describe("formatCurrency", () => {
  it("formats whole dollar amounts", () => {
    expect(formatCurrency(1000)).toBe("$1,000");
    expect(formatCurrency(0)).toBe("$0");
    expect(formatCurrency(50000)).toBe("$50,000");
  });

  it("rounds fractional amounts", () => {
    expect(formatCurrency(1234.56)).toBe("$1,235");
    expect(formatCurrency(99.99)).toBe("$100");
  });

  it("handles large numbers with commas", () => {
    expect(formatCurrency(1000000)).toBe("$1,000,000");
  });
});

describe("formatNumber", () => {
  it("formats small numbers without commas", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(999)).toBe("999");
  });

  it("formats large numbers with commas", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});

describe("truncate", () => {
  it("returns string unchanged when shorter than limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when longer than limit", () => {
    expect(truncate("hello world", 5)).toBe("hello…");
    expect(truncate("abcdefghij", 3)).toBe("abc…");
  });

  it("handles empty string", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("handles limit of zero", () => {
    expect(truncate("hello", 0)).toBe("…");
  });
});

describe("statusColor", () => {
  const greenStatuses = ["active", "approved", "referring"];
  const warningStatuses = ["pending", "contacted", "engaged", "ingesting"];
  const negativeStatuses = ["rejected", "suppressed"];
  const neutralStatuses = ["draft", "new", "inactive"];

  greenStatuses.forEach((status) => {
    it(`returns green classes for "${status}"`, () => {
      expect(statusColor(status)).toContain("green");
    });
  });

  it("returns purple classes for \"published\"", () => {
    expect(statusColor("published")).toContain("purple");
  });

  warningStatuses.forEach((status) => {
    it(`returns non-empty string for "${status}"`, () => {
      expect(statusColor(status).length).toBeGreaterThan(0);
    });
  });

  negativeStatuses.forEach((status) => {
    it(`returns red classes for "${status}"`, () => {
      expect(statusColor(status)).toContain("red");
    });
  });

  it("returns fallback for unknown status", () => {
    expect(statusColor("unknown_status")).toBeTruthy();
  });

  neutralStatuses.forEach((status) => {
    it(`returns gray classes for "${status}"`, () => {
      expect(statusColor(status)).toContain("gray");
    });
  });
});

describe("healthColor", () => {
  it("returns green class for green health", () => {
    expect(healthColor("green")).toContain("green");
  });

  it("returns yellow class for yellow health", () => {
    expect(healthColor("yellow")).toContain("yellow");
  });

  it("returns red class for red health", () => {
    expect(healthColor("red")).toContain("red");
  });

  it("returns red class for unknown health status", () => {
    expect(healthColor("unknown")).toContain("red");
  });
});

describe("moduleLabel", () => {
  it("returns human-readable label for paid_ads", () => {
    expect(moduleLabel("paid_ads")).toBe("Paid Ads");
  });

  it("returns human-readable label for referral", () => {
    expect(moduleLabel("referral")).toBe("Referral");
  });

  it("returns human-readable label for content", () => {
    expect(moduleLabel("content")).toBe("Content");
  });

  it("returns human-readable label for seo", () => {
    expect(moduleLabel("seo")).toBe("SEO");
  });

  it("returns human-readable label for profiles", () => {
    expect(moduleLabel("profiles")).toBe("Profiles");
  });

  it("returns raw value for unknown module", () => {
    expect(moduleLabel("unknown_module")).toBe("unknown_module");
  });
});

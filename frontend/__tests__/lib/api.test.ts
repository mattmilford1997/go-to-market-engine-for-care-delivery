/**
 * Unit tests for lib/api.ts
 * We mock axios so no real HTTP calls are made.
 */
import axios from "axios";

jest.mock("axios", () => {
  const mockAxios: any = {
    create: jest.fn(() => mockAxios),
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  };
  return { default: mockAxios, ...mockAxios };
});

// Re-import after mock is set up
import {
  api,
  companiesApi,
  approvalApi,
  referralApi,
  contentApi,
  paidAdsApi,
  seoApi,
  profilesApi,
} from "@/lib/api";

const mockGet = axios.get as jest.Mock;
const mockPost = axios.post as jest.Mock;
const mockPatch = axios.patch as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({ data: {} });
  mockPost.mockResolvedValue({ data: {} });
  mockPatch.mockResolvedValue({ data: {} });
});

const ID = "company-123";

// ── companiesApi ──────────────────────────────────────────────────────────────

describe("companiesApi", () => {
  it("list calls GET /companies/", async () => {
    await companiesApi.list();
    expect(mockGet).toHaveBeenCalledWith("/companies/");
  });

  it("get calls GET /companies/:id", async () => {
    await companiesApi.get(ID);
    expect(mockGet).toHaveBeenCalledWith(`/companies/${ID}`);
  });

  it("create calls POST /companies/ with data", async () => {
    await companiesApi.create({ website_url: "https://example.com", is_pilot: true });
    expect(mockPost).toHaveBeenCalledWith("/companies/", {
      website_url: "https://example.com",
      is_pilot: true,
    });
  });

  it("update calls PATCH /companies/:id", async () => {
    await companiesApi.update(ID, { name: "New Name" });
    expect(mockPatch).toHaveBeenCalledWith(`/companies/${ID}`, { name: "New Name" });
  });

  it("updateCredentials calls POST /companies/:id/credentials", async () => {
    await companiesApi.updateCredentials(ID, { api_key: "abc" });
    expect(mockPost).toHaveBeenCalledWith(`/companies/${ID}/credentials`, {
      credentials: { api_key: "abc" },
    });
  });

  it("credentialStatus calls GET /companies/:id/credential-status", async () => {
    await companiesApi.credentialStatus(ID);
    expect(mockGet).toHaveBeenCalledWith(`/companies/${ID}/credential-status`);
  });

  it("reingest calls POST /companies/:id/reingest", async () => {
    await companiesApi.reingest(ID);
    expect(mockPost).toHaveBeenCalledWith(`/companies/${ID}/reingest`);
  });

  it("portfolioOverview calls GET /companies/portfolio/overview", async () => {
    await companiesApi.portfolioOverview();
    expect(mockGet).toHaveBeenCalledWith("/companies/portfolio/overview");
  });
});

// ── approvalApi ───────────────────────────────────────────────────────────────

describe("approvalApi", () => {
  it("queue without module calls GET /approval/:id/queue", async () => {
    await approvalApi.queue(ID);
    expect(mockGet).toHaveBeenCalledWith(`/approval/${ID}/queue`);
  });

  it("queue with module appends query string", async () => {
    await approvalApi.queue(ID, "content");
    expect(mockGet).toHaveBeenCalledWith(`/approval/${ID}/queue?module=content`);
  });

  it("count calls GET /approval/:id/queue/count", async () => {
    await approvalApi.count(ID);
    expect(mockGet).toHaveBeenCalledWith(`/approval/${ID}/queue/count`);
  });

  it("action calls POST /approval/:id/items/:itemId/action", async () => {
    await approvalApi.action(ID, "item-1", "approve", "looks good");
    expect(mockPost).toHaveBeenCalledWith(`/approval/${ID}/items/item-1/action`, {
      action: "approve",
      reviewer_notes: "looks good",
    });
  });

  it("bulkApprove calls POST /approval/:id/bulk-approve", async () => {
    await approvalApi.bulkApprove(ID, { module: "content" });
    expect(mockPost).toHaveBeenCalledWith(`/approval/${ID}/bulk-approve`, { module: "content" });
  });

  it("history calls GET /approval/:id/history", async () => {
    await approvalApi.history(ID);
    expect(mockGet).toHaveBeenCalledWith(`/approval/${ID}/history`);
  });
});

// ── referralApi ───────────────────────────────────────────────────────────────

describe("referralApi", () => {
  it("leads calls GET /referral/:id/leads", async () => {
    await referralApi.leads(ID);
    expect(mockGet).toHaveBeenCalledWith(`/referral/${ID}/leads`, { params: undefined });
  });

  it("leads passes filters as params", async () => {
    await referralApi.leads(ID, { status: "new" });
    expect(mockGet).toHaveBeenCalledWith(`/referral/${ID}/leads`, { params: { status: "new" } });
  });

  it("generateLeads calls POST /referral/:id/leads/generate", async () => {
    await referralApi.generateLeads(ID);
    expect(mockPost).toHaveBeenCalledWith(`/referral/${ID}/leads/generate`);
  });

  it("getLead calls GET /referral/:id/leads/:leadId", async () => {
    await referralApi.getLead(ID, "lead-1");
    expect(mockGet).toHaveBeenCalledWith(`/referral/${ID}/leads/lead-1`);
  });

  it("generateCollateral calls POST /referral/:id/generate/:type", async () => {
    await referralApi.generateCollateral(ID, "fax-sheet", "psychiatry");
    expect(mockPost).toHaveBeenCalledWith(`/referral/${ID}/generate/fax-sheet`, {
      target_specialty: "psychiatry",
    });
  });

  it("generateAllCollateral calls POST /referral/:id/generate/all-collateral", async () => {
    await referralApi.generateAllCollateral(ID);
    expect(mockPost).toHaveBeenCalledWith(`/referral/${ID}/generate/all-collateral`);
  });

  it("launchCampaign calls POST /referral/:id/campaigns/launch", async () => {
    await referralApi.launchCampaign(ID, { name: "Q1 Campaign" });
    expect(mockPost).toHaveBeenCalledWith(`/referral/${ID}/campaigns/launch`, { name: "Q1 Campaign" });
  });

  it("campaigns calls GET /referral/:id/campaigns", async () => {
    await referralApi.campaigns(ID);
    expect(mockGet).toHaveBeenCalledWith(`/referral/${ID}/campaigns`);
  });
});

// ── contentApi ────────────────────────────────────────────────────────────────

describe("contentApi", () => {
  it("calendar calls GET /content/:id/calendar", async () => {
    await contentApi.calendar(ID);
    expect(mockGet).toHaveBeenCalledWith(`/content/${ID}/calendar`);
  });

  it("items calls GET /content/:id/items", async () => {
    await contentApi.items(ID);
    expect(mockGet).toHaveBeenCalledWith(`/content/${ID}/items`, { params: undefined });
  });

  it("generateBlogPost calls POST with keyword and word_count", async () => {
    await contentApi.generateBlogPost(ID, "TMS therapy", 1200);
    expect(mockPost).toHaveBeenCalledWith(`/content/${ID}/generate/blog-post`, {
      keyword: "TMS therapy",
      word_count: 1200,
    });
  });

  it("generateBlogPost defaults word_count to 1500", async () => {
    await contentApi.generateBlogPost(ID, "keyword");
    expect(mockPost).toHaveBeenCalledWith(`/content/${ID}/generate/blog-post`, {
      keyword: "keyword",
      word_count: 1500,
    });
  });

  it("generateSocialPosts calls POST with platform and count", async () => {
    await contentApi.generateSocialPosts(ID, "instagram", 10);
    expect(mockPost).toHaveBeenCalledWith(`/content/${ID}/generate/social-posts`, {
      platform: "instagram",
      count: 10,
    });
  });

  it("generateSocialPosts defaults count to 5", async () => {
    await contentApi.generateSocialPosts(ID, "facebook");
    expect(mockPost).toHaveBeenCalledWith(`/content/${ID}/generate/social-posts`, {
      platform: "facebook",
      count: 5,
    });
  });

  it("generateFullCalendar calls POST /content/:id/generate/full-calendar", async () => {
    await contentApi.generateFullCalendar(ID);
    expect(mockPost).toHaveBeenCalledWith(`/content/${ID}/generate/full-calendar`);
  });
});

// ── paidAdsApi ────────────────────────────────────────────────────────────────

describe("paidAdsApi", () => {
  it("generateKeywords calls POST /paid-ads/:id/google/generate-keywords", async () => {
    await paidAdsApi.generateKeywords(ID);
    expect(mockPost).toHaveBeenCalledWith(`/paid-ads/${ID}/google/generate-keywords`);
  });

  it("generateAllGoogle calls POST /paid-ads/:id/google/generate-all", async () => {
    await paidAdsApi.generateAllGoogle(ID);
    expect(mockPost).toHaveBeenCalledWith(`/paid-ads/${ID}/google/generate-all`);
  });

  it("generateAllMeta calls POST /paid-ads/:id/meta/generate-all", async () => {
    await paidAdsApi.generateAllMeta(ID);
    expect(mockPost).toHaveBeenCalledWith(`/paid-ads/${ID}/meta/generate-all`);
  });

  it("audiences calls GET /paid-ads/:id/meta/audiences", async () => {
    await paidAdsApi.audiences(ID);
    expect(mockGet).toHaveBeenCalledWith(`/paid-ads/${ID}/meta/audiences`);
  });

  it("budgetRecs calls GET /paid-ads/:id/budget-recommendations", async () => {
    await paidAdsApi.budgetRecs(ID);
    expect(mockGet).toHaveBeenCalledWith(`/paid-ads/${ID}/budget-recommendations`);
  });
});

// ── seoApi ────────────────────────────────────────────────────────────────────

describe("seoApi", () => {
  it("runAudit calls POST /seo/:id/audit", async () => {
    await seoApi.runAudit(ID);
    expect(mockPost).toHaveBeenCalledWith(`/seo/${ID}/audit`);
  });

  it("reports calls GET /seo/:id/reports", async () => {
    await seoApi.reports(ID);
    expect(mockGet).toHaveBeenCalledWith(`/seo/${ID}/reports`);
  });

  it("latestReport calls GET /seo/:id/reports/latest", async () => {
    await seoApi.latestReport(ID);
    expect(mockGet).toHaveBeenCalledWith(`/seo/${ID}/reports/latest`);
  });

  it("keywords calls GET /seo/:id/keywords", async () => {
    await seoApi.keywords(ID);
    expect(mockGet).toHaveBeenCalledWith(`/seo/${ID}/keywords`);
  });

  it("recommendations calls GET /seo/:id/recommendations", async () => {
    await seoApi.recommendations(ID);
    expect(mockGet).toHaveBeenCalledWith(`/seo/${ID}/recommendations`);
  });

  it("runPagespeed calls POST /seo/:id/pagespeed", async () => {
    await seoApi.runPagespeed(ID);
    expect(mockPost).toHaveBeenCalledWith(`/seo/${ID}/pagespeed`);
  });
});

// ── profilesApi ───────────────────────────────────────────────────────────────

describe("profilesApi", () => {
  it("platforms calls GET /profiles/platforms", async () => {
    await profilesApi.platforms();
    expect(mockGet).toHaveBeenCalledWith("/profiles/platforms");
  });

  it("scorecard calls GET /profiles/:id/scorecard", async () => {
    await profilesApi.scorecard(ID);
    expect(mockGet).toHaveBeenCalledWith(`/profiles/${ID}/scorecard`);
  });

  it("generateContent calls POST with platform", async () => {
    await profilesApi.generateContent(ID, "psychology_today");
    expect(mockPost).toHaveBeenCalledWith(`/profiles/${ID}/generate-content`, {
      platform: "psychology_today",
    });
  });

  it("generateContent defaults to all", async () => {
    await profilesApi.generateContent(ID);
    expect(mockPost).toHaveBeenCalledWith(`/profiles/${ID}/generate-content`, {
      platform: "all",
    });
  });

  it("autoCreate calls POST /profiles/:id/auto-create/:platform", async () => {
    await profilesApi.autoCreate(ID, "healthgrades");
    expect(mockPost).toHaveBeenCalledWith(`/profiles/${ID}/auto-create/healthgrades`);
  });

  it("list calls GET /profiles/:id/profiles", async () => {
    await profilesApi.list(ID);
    expect(mockGet).toHaveBeenCalledWith(`/profiles/${ID}/profiles`);
  });

  it("saveCredentials calls POST /profiles/:id/profiles/:platform/credentials", async () => {
    await profilesApi.saveCredentials(ID, "psychology_today", "user@test.com", "pass123");
    expect(mockPost).toHaveBeenCalledWith(
      `/profiles/${ID}/profiles/psychology_today/credentials`,
      { username: "user@test.com", password: "pass123" }
    );
  });
});

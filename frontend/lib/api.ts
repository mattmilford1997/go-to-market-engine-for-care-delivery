import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Companies
export const companiesApi = {
  list: () => api.get("/companies/"),
  get: (id: string) => api.get(`/companies/${id}`),
  create: (data: { website_url: string; is_pilot?: boolean }) =>
    api.post("/companies/", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/companies/${id}`, data),
  updateCredentials: (id: string, credentials: Record<string, string>) =>
    api.post(`/companies/${id}/credentials`, { credentials }),
  credentialStatus: (id: string) =>
    api.get(`/companies/${id}/credential-status`),
  reingest: (id: string) => api.post(`/companies/${id}/reingest`),
  portfolioOverview: () => api.get("/companies/portfolio/overview"),
};

// Approval
export const approvalApi = {
  queue: (companyId: string, module?: string) =>
    api.get(`/approval/${companyId}/queue${module ? `?module=${module}` : ""}`),
  count: (companyId: string) =>
    api.get(`/approval/${companyId}/queue/count`),
  action: (companyId: string, itemId: string, action: string, notes?: string) =>
    api.post(`/approval/${companyId}/items/${itemId}/action`, {
      action,
      reviewer_notes: notes,
    }),
  bulkApprove: (companyId: string, payload: { item_ids?: string[]; module?: string }) =>
    api.post(`/approval/${companyId}/bulk-approve`, payload),
  history: (companyId: string) => api.get(`/approval/${companyId}/history`),
};

// Referral
export const referralApi = {
  leads: (companyId: string, filters?: Record<string, string>) =>
    api.get(`/referral/${companyId}/leads`, { params: filters }),
  generateLeads: (companyId: string) =>
    api.post(`/referral/${companyId}/leads/generate`),
  uploadLeadsCsv: (companyId: string, file: File, listName?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (listName) form.append("list_name", listName);
    return api.post(`/referral/${companyId}/leads/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  getLead: (companyId: string, leadId: string) =>
    api.get(`/referral/${companyId}/leads/${leadId}`),
  generateCollateral: (companyId: string, type: string, specialty: string) =>
    api.post(`/referral/${companyId}/generate/${type}`, {
      target_specialty: specialty,
    }),
  generateAllCollateral: (companyId: string) =>
    api.post(`/referral/${companyId}/generate/all-collateral`),
  launchCampaign: (companyId: string, data: Record<string, unknown>) =>
    api.post(`/referral/${companyId}/campaigns/launch`, data),
  campaigns: (companyId: string) =>
    api.get(`/referral/${companyId}/campaigns`),
};

// Content
export const contentApi = {
  calendar: (companyId: string) => api.get(`/content/${companyId}/calendar`),
  items: (companyId: string, filters?: Record<string, string>) =>
    api.get(`/content/${companyId}/items`, { params: filters }),
  generateBlogPost: (companyId: string, keyword: string, wordCount?: number) =>
    api.post(`/content/${companyId}/generate/blog-post`, {
      keyword,
      word_count: wordCount || 1500,
    }),
  generateSocialPosts: (
    companyId: string,
    platform: string,
    count?: number
  ) =>
    api.post(`/content/${companyId}/generate/social-posts`, {
      platform,
      count: count || 5,
    }),
  generateFullCalendar: (companyId: string) =>
    api.post(`/content/${companyId}/generate/full-calendar`),
};

// Paid Ads
export const paidAdsApi = {
  generateKeywords: (companyId: string) =>
    api.post(`/paid-ads/${companyId}/google/generate-keywords`),
  generateAllGoogle: (companyId: string) =>
    api.post(`/paid-ads/${companyId}/google/generate-all`),
  generateAllMeta: (companyId: string) =>
    api.post(`/paid-ads/${companyId}/meta/generate-all`),
  audiences: (companyId: string) =>
    api.get(`/paid-ads/${companyId}/meta/audiences`),
  budgetRecs: (companyId: string) =>
    api.get(`/paid-ads/${companyId}/budget-recommendations`),
};

// SEO
export const seoApi = {
  runAudit: (companyId: string) => api.post(`/seo/${companyId}/audit`),
  reports: (companyId: string) => api.get(`/seo/${companyId}/reports`),
  latestReport: (companyId: string) =>
    api.get(`/seo/${companyId}/reports/latest`),
  keywords: (companyId: string) => api.get(`/seo/${companyId}/keywords`),
  recommendations: (companyId: string) =>
    api.get(`/seo/${companyId}/recommendations`),
  runPagespeed: (companyId: string) =>
    api.post(`/seo/${companyId}/pagespeed`),
};

// Profiles
export const profilesApi = {
  platforms: () => api.get("/profiles/platforms"),
  scorecard: (companyId: string) =>
    api.get(`/profiles/${companyId}/scorecard`),
  generateContent: (companyId: string, platform: string = "all") =>
    api.post(`/profiles/${companyId}/generate-content`, { platform }),
  autoCreate: (companyId: string, platform: string) =>
    api.post(`/profiles/${companyId}/auto-create/${platform}`),
  list: (companyId: string) => api.get(`/profiles/${companyId}/profiles`),
  saveCredentials: (
    companyId: string,
    platform: string,
    username: string,
    password: string
  ) =>
    api.post(`/profiles/${companyId}/profiles/${platform}/credentials`, {
      username,
      password,
    }),
};

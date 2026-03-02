import axios from "axios";

// NEXT_PUBLIC_API_URL can override for direct backend access.
// Default to relative path so Next.js rewrites proxy it to the backend (set BACKEND_URL in Vercel).
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Intercept errors so components can tell apart network failures from API errors
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!err.response) {
      // No HTTP response — backend is unreachable (BACKEND_URL not configured or backend down)
      err.isNetworkError = true;
      err.message = "Cannot reach backend API — set BACKEND_URL in Railway to your backend service URL.";
    }
    return Promise.reject(err);
  }
);

// LLM Provider Settings
export const llmSettingsApi = {
  providers: () => api.get("/llm-settings/providers"),
  current: () => api.get("/llm-settings/current"),
  setProvider: (provider: string, apiKey?: string) =>
    api.put("/llm-settings/provider", { provider, api_key: apiKey }),
  test: () => api.post("/llm-settings/test"),
};

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
  generatePlatform: (companyId: string, platform: string) =>
    api.post(`/paid-ads/${companyId}/${platform}/generate-all`),
  audiences: (companyId: string) =>
    api.get(`/paid-ads/${companyId}/meta/audiences`),
  budgetRecs: (companyId: string) =>
    api.get(`/paid-ads/${companyId}/budget-recommendations`),
  platforms: () => api.get("/paid-ads/platforms"),
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

// ROI
export const roiApi = {
  summary: (companyId: string) => api.get(`/roi/${companyId}/summary`),
  byChannel: (companyId: string) => api.get(`/roi/${companyId}/by-channel`),
  attribution: (companyId: string) => api.get(`/roi/${companyId}/attribution`),
  recommendations: (companyId: string) =>
    api.post(`/roi/${companyId}/recommendations`),
};

// Competitors
export const competitorsApi = {
  list: (companyId: string) => api.get(`/competitors/${companyId}/`),
  add: (companyId: string, data: Record<string, string>) =>
    api.post(`/competitors/${companyId}/`, data),
  remove: (companyId: string, id: string) =>
    api.delete(`/competitors/${companyId}/${id}`),
  analyze: (companyId: string, id: string) =>
    api.post(`/competitors/${companyId}/${id}/analyze`),
  summary: (companyId: string) =>
    api.post(`/competitors/${companyId}/summary`),
};

// Reputation
export const reputationApi = {
  reviews: (companyId: string) =>
    api.get(`/reputation/${companyId}/reviews`),
  summary: (companyId: string) =>
    api.get(`/reputation/${companyId}/summary`),
  suggestResponse: (companyId: string, reviewId: string) =>
    api.post(`/reputation/${companyId}/reviews/${reviewId}/suggest-response`),
  analyzeSentiment: (companyId: string) =>
    api.post(`/reputation/${companyId}/analyze-sentiment`),
};

// Reports
export const reportsApi = {
  weekly: (companyId: string) => api.get(`/reports/${companyId}/weekly`),
  generate: (companyId: string) =>
    api.post(`/reports/${companyId}/generate`),
  history: (companyId: string) => api.get(`/reports/${companyId}/history`),
};

// Templates
export const templatesApi = {
  library: () => api.get("/templates/library"),
  getTemplate: (id: string) => api.get(`/templates/library/${id}`),
  deploy: (companyId: string, templateId: string) =>
    api.post(`/templates/${companyId}/deploy/${templateId}`),
};

// Schedule
export const scheduleApi = {
  events: (companyId: string, month?: number, year?: number) =>
    api.get(`/schedule/${companyId}/events`, { params: { month, year } }),
  createEvent: (companyId: string, data: Record<string, unknown>) =>
    api.post(`/schedule/${companyId}/events`, data),
};

// Intake
export const intakeApi = {
  forms: (companyId: string) => api.get(`/intake/${companyId}/forms`),
  createForm: (companyId: string, data: Record<string, unknown>) =>
    api.post(`/intake/${companyId}/forms`, data),
  getForm: (companyId: string, formId: string) =>
    api.get(`/intake/${companyId}/forms/${formId}`),
  fieldTemplates: () => api.get("/intake/field-templates"),
};

// Chat
export const chatApi = {
  history: (companyId: string) => api.get(`/chat/${companyId}/history`),
  message: (companyId: string, message: string) =>
    api.post(`/chat/${companyId}/message`, { message }),
  clearHistory: (companyId: string) =>
    api.delete(`/chat/${companyId}/history`),
};

// AEO (AI Engine Optimization)
export const aeoApi = {
  score: (companyId: string) => api.get(`/aeo/${companyId}/score`),
  updateChecklist: (companyId: string, checkedIds: string[]) =>
    api.post(`/aeo/${companyId}/checklist`, { checked_ids: checkedIds }),
  generateFaqs: (companyId: string, topic: string) =>
    api.post(`/aeo/${companyId}/generate-faqs`, { topic }),
  generateSchema: (companyId: string, schemaType: string) =>
    api.post(`/aeo/${companyId}/generate-schema`, { schema_type: schemaType }),
  optimizeContent: (companyId: string, content: string, pageType?: string) =>
    api.post(`/aeo/${companyId}/optimize-content`, { content, page_type: pageType }),
};

// Spam Prevention & Compliance
export const spamApi = {
  settings: (companyId: string) => api.get(`/spam/${companyId}/settings`),
  updateSettings: (companyId: string, data: Record<string, unknown>) =>
    api.put(`/spam/${companyId}/settings`, data),
  suppression: (companyId: string, channel?: string) =>
    api.get(`/spam/${companyId}/suppression${channel ? `?channel=${channel}` : ""}`),
  addSuppression: (companyId: string, data: Record<string, unknown>) =>
    api.post(`/spam/${companyId}/suppression`, data),
  removeSuppression: (companyId: string, id: string) =>
    api.delete(`/spam/${companyId}/suppression/${id}`),
  check: (companyId: string, contact: string, channel: string) =>
    api.post(`/spam/${companyId}/check`, { contact, channel }),
  auditLog: (companyId: string) => api.get(`/spam/${companyId}/audit`),
  complianceReport: (companyId: string) =>
    api.get(`/spam/${companyId}/compliance-report`),
};

// Costs
export const costsApi = {
  summary: (companyId: string) => api.get(`/costs/${companyId}/summary`),
  history: (companyId: string, view?: string, periods?: number) =>
    api.get(`/costs/${companyId}/history`, { params: { view, periods } }),
  byCampaign: (companyId: string) => api.get(`/costs/${companyId}/by-campaign`),
  estimate: (companyId: string, data: Record<string, unknown>) =>
    api.post(`/costs/${companyId}/estimate`, data),
  rates: () => api.get("/costs/cost-rates"),
};

// Demo data seeding
export const demoApi = {
  loadAll: (companyId: string) => api.post(`/demo/${companyId}/load-all`),
  clear: (companyId: string) => api.delete(`/demo/${companyId}/clear`),
};

// Video Ad Generator
export const videoApi = {
  platforms: () => api.get("/video/platforms"),
  ads: (companyId: string) => api.get(`/video/${companyId}/ads`),
  generateScript: (companyId: string, data: Record<string, unknown>) =>
    api.post(`/video/${companyId}/generate-script`, data),
  generateConcepts: (companyId: string, topic: string) =>
    api.post(`/video/${companyId}/generate-concepts`, { topic }),
  deleteAd: (companyId: string, adId: string) =>
    api.delete(`/video/${companyId}/ads/${adId}`),
};

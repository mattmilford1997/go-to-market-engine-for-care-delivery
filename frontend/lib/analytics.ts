/**
 * Thin analytics wrapper — fires events to GA4 or GTM dataLayer
 * when the relevant env var is configured. Safe to call in any
 * environment; silently no-ops if analytics are not set up.
 *
 * Usage:
 *   trackEvent("csv_upload", { list_name: "Pediatricians in Texas", rows: 120 });
 *   trackEvent("content_generated", { type: "blog_post", module: "content" });
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
): void {
  if (typeof window === "undefined") return;

  // GA4 direct
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
    return;
  }

  // GTM dataLayer push
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: eventName, ...params });
  }
}

export function trackPageView(url: string, title?: string): void {
  trackEvent("page_view", { page_location: url, page_title: title ?? document.title });
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n) + "…" : str;
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: "text-green-600 bg-green-50",
    draft: "text-gray-600 bg-gray-50",
    paused: "text-yellow-600 bg-yellow-50",
    pending: "text-blue-600 bg-blue-50",
    approved: "text-green-600 bg-green-50",
    rejected: "text-red-600 bg-red-50",
    published: "text-purple-600 bg-purple-50",
    generating: "text-blue-600 bg-blue-50",
    ingesting: "text-orange-600 bg-orange-50",
    new: "text-gray-600 bg-gray-50",
    contacted: "text-blue-600 bg-blue-50",
    engaged: "text-indigo-600 bg-indigo-50",
    referring: "text-green-600 bg-green-50",
    inactive: "text-gray-400 bg-gray-50",
    suppressed: "text-red-600 bg-red-50",
  };
  return map[status] || "text-gray-600 bg-gray-50";
}

export function healthColor(health: string): string {
  return health === "green"
    ? "bg-green-500"
    : health === "yellow"
    ? "bg-yellow-400"
    : "bg-red-500";
}

export function moduleLabel(module: string): string {
  const map: Record<string, string> = {
    paid_ads: "Paid Ads",
    referral: "Referral",
    content: "Content",
    seo: "SEO",
    profiles: "Profiles",
  };
  return map[module] || module;
}

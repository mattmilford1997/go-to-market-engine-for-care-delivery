/**
 * Proxy all /api/v1/* requests to the Railway backend.
 * BACKEND_URL is a server-side runtime env var — set it in Vercel dashboard.
 * Falls back to localhost for local development.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const TIMEOUT_MS = 25000; // Vercel Hobby limit is 10s; Pro is 60s — keep headroom

type Params = Promise<{ path: string[] }>;

async function proxy(req: NextRequest, params: Params) {
  const { path } = await params;
  const search = req.nextUrl.search ?? "";
  const url = `${BACKEND}/api/v1/${path.join("/")}${search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const body =
    req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (err: any) {
    const msg = err?.name === "AbortError"
      ? `Backend timed out after ${TIMEOUT_MS / 1000}s — is Railway running?`
      : `Backend unreachable: ${err?.message ?? err}`;
    return NextResponse.json({ detail: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  const resBody = await res.text();
  const ct = res.headers.get("content-type") ?? "application/json";

  return new NextResponse(resBody, {
    status: res.status,
    headers: { "content-type": ct },
  });
}

export const GET = (req: NextRequest, { params }: { params: Params }) =>
  proxy(req, params);
export const POST = (req: NextRequest, { params }: { params: Params }) =>
  proxy(req, params);
export const PATCH = (req: NextRequest, { params }: { params: Params }) =>
  proxy(req, params);
export const PUT = (req: NextRequest, { params }: { params: Params }) =>
  proxy(req, params);
export const DELETE = (req: NextRequest, { params }: { params: Params }) =>
  proxy(req, params);

/**
 * Proxy all /api/v1/* requests to the Railway backend.
 * BACKEND_URL is a server-side runtime env var — set it in Vercel dashboard.
 * Falls back to localhost for local development.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

type Params = Promise<{ path: string[] }>;

async function proxy(req: NextRequest, params: Params) {
  const { path } = await params;
  const search = req.nextUrl.search ?? "";
  const url = `${BACKEND}/api/v1/${path.join("/")}${search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.arrayBuffer()
      : undefined;

  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers,
      body: body ? Buffer.from(body) : undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: `Backend unreachable: ${err?.message ?? err}` },
      { status: 502 }
    );
  }

  const resHeaders = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) resHeaders.set("content-type", ct);

  return new NextResponse(res.body, { status: res.status, headers: resHeaders });
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

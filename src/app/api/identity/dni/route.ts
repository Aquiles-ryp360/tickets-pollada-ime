import { NextResponse } from "next/server";
import { jsonError, requireAccess } from "@/lib/server/access";
import { lookupDni } from "@/lib/server/identity";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  const url = new URL(request.url);
  return handleDniLookup(url.searchParams.get("dni") ?? "");
}

export async function POST(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  const body = (await request.json().catch(() => null)) as { dni?: string } | null;
  return handleDniLookup(body?.dni ?? "");
}

async function handleDniLookup(dni: string) {
  const result = await lookupDni(dni);

  if (!result.ok) {
    return jsonError(result.message, result.status ?? 400);
  }

  return NextResponse.json({ ok: true, data: result, message: result.message });
}

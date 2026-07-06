import { NextResponse } from "next/server";
import { jsonError, requireAccess } from "@/lib/server/access";
import { lookupDni } from "@/lib/server/identity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  const body = (await request.json().catch(() => null)) as { dni?: string } | null;
  const result = await lookupDni(body?.dni ?? "");

  if (!result.ok) {
    const status = result.message.includes("API Key")
      ? 401
      : result.message.startsWith("No se encontraron")
        ? 404
        : 400;
    return jsonError(result.message, status);
  }

  return NextResponse.json({ ok: true, data: result, message: result.message });
}

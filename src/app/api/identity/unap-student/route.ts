import { NextResponse } from "next/server";
import { jsonError, requireAccess } from "@/lib/server/access";
import { lookupUnapStudent } from "@/lib/server/identity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  const body = (await request.json().catch(() => null)) as { una_code?: string } | null;
  const result = await lookupUnapStudent(body?.una_code ?? "");

  if (!result.ok) {
    const status = result.message.startsWith("No se encontro") ? 404 : 400;
    return jsonError(result.message, status);
  }

  return NextResponse.json({ ok: true, data: result, message: result.message });
}

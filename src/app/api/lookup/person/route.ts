import { NextResponse } from "next/server";
import { jsonError, requireAccess } from "@/lib/server/access";
import { StorageNotConfiguredError } from "@/lib/server/supabase";
import { lookupPeople } from "@/lib/server/ticket-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  try {
    const people = await lookupPeople(query);
    return NextResponse.json({ ok: true, data: people });
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return jsonError("Supabase no esta configurado.", 503, "storage_unconfigured");
    }

    return jsonError(error instanceof Error ? error.message : "Error interno.", 500);
  }
}

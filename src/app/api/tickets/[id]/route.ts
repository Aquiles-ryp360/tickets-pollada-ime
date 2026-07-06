import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { jsonError, requireAccess } from "@/lib/server/access";
import { StorageNotConfiguredError } from "@/lib/server/supabase";
import { updateTicket } from "@/lib/server/ticket-repository";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    const ticket = await updateTicket(id, body);
    return NextResponse.json({ ok: true, data: ticket });
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return jsonError("Supabase no esta configurado.", 503, "storage_unconfigured");
    }

    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Datos invalidos.", 400, "validation_error");
    }

    return jsonError(error instanceof Error ? error.message : "Error interno.", 500);
  }
}

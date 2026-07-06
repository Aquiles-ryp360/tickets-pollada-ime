import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createTicket, createTickets, listTickets } from "@/lib/server/ticket-repository";
import { jsonError, requireAccess } from "@/lib/server/access";
import { StorageNotConfiguredError } from "@/lib/server/supabase";
import { ticketFilters, type TicketFilter } from "@/lib/tickets";

export const runtime = "nodejs";

const validFilters = new Set(ticketFilters.map((filter) => filter.id));

export async function GET(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  const url = new URL(request.url);
  const filterParam = url.searchParams.get("filter") ?? "all";
  const filter = validFilters.has(filterParam as TicketFilter)
    ? (filterParam as TicketFilter)
    : "all";

  try {
    const tickets = await listTickets({
      query: url.searchParams.get("q") ?? "",
      filter
    });
    return NextResponse.json({ ok: true, data: tickets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  const body = await request.json().catch(() => null);

  try {
    if (Array.isArray(body)) {
      const tickets = await createTickets(body);
      return NextResponse.json({ ok: true, data: tickets }, { status: 201 });
    }

    const ticket = await createTicket(body);
    return NextResponse.json({ ok: true, data: ticket }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

function handleApiError(error: unknown) {
  if (error instanceof StorageNotConfiguredError) {
    return jsonError("Supabase no esta configurado.", 503, "storage_unconfigured");
  }

  if (error instanceof ZodError) {
    return jsonError(error.issues[0]?.message ?? "Datos invalidos.", 400, "validation_error");
  }

  return jsonError(error instanceof Error ? error.message : "Error interno.", 500);
}

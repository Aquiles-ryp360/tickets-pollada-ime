import { NextResponse } from "next/server";
import { jsonError, requireAccess } from "@/lib/server/access";
import { lookupDni, lookupUnapStudent, type IdentityResult } from "@/lib/server/identity";
import type { QuickSearchResult } from "@/lib/quick-search";
import { StorageNotConfiguredError } from "@/lib/server/supabase";
import { listTickets } from "@/lib/server/ticket-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const accessError = requireAccess(request);
  if (accessError) return accessError;

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (!query) {
    return NextResponse.json({
      ok: true,
      data: {
        kind: "empty",
        query,
        tickets: [],
        external: null,
        message: "Ingresa ticket, DNI, codigo UNA o nombre."
      } satisfies QuickSearchResult
    });
  }

  try {
    const tickets = await listTickets({ query, filter: "all" });
    if (tickets.length) {
      return NextResponse.json({
        ok: true,
        data: {
          kind: "tickets",
          query,
          tickets,
          external: null,
          message: "Coincidencias encontradas en Supabase."
        } satisfies QuickSearchResult
      });
    }

    const digits = query.replace(/\D/g, "");
    if (/^\d{6}$/.test(digits)) {
      return jsonExternalResult(query, await lookupUnapStudent(digits));
    }

    if (/^\d{8}$/.test(digits)) {
      return jsonExternalResult(query, await lookupDni(digits));
    }

    return NextResponse.json({
      ok: true,
      data: {
        kind: "empty",
        query,
        tickets: [],
        external: null,
        message: "No se encontraron tickets. Puedes agregarlo como nuevo registro."
      } satisfies QuickSearchResult
    });
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return jsonError("Supabase no esta configurado.", 503, "storage_unconfigured");
    }

    return jsonError(error instanceof Error ? error.message : "Error interno.", 500);
  }
}

function jsonExternalResult(query: string, result: IdentityResult) {
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      data: {
        kind: "external",
        query,
        tickets: [],
        external: result,
        message: "No existe ticket registrado. Datos externos encontrados."
      } satisfies QuickSearchResult
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      kind: "empty",
      query,
      tickets: [],
      external: result,
      message: result.message
    } satisfies QuickSearchResult
  });
}

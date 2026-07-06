import {
  buildPersonSuggestions,
  filterTickets,
  ticketCreateSchema,
  ticketPatchSchema,
  type Ticket,
  type TicketDraft,
  type TicketFilter
} from "@/lib/tickets";
import { getSupabaseAdmin } from "@/lib/server/supabase";

export async function listTickets({
  query = "",
  filter = "all"
}: {
  query?: string;
  filter?: TicketFilter;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return filterTickets((data ?? []) as Ticket[], query, filter);
}

export async function createTicket(rawDraft: TicketDraft) {
  const draft = ticketCreateSchema.parse(rawDraft);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("tickets").insert(draft).select("*").single();

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un ticket con ese numero.");
    throw new Error(error.message);
  }

  return data as Ticket;
}

export async function updateTicket(id: string, rawPatch: Partial<TicketDraft>) {
  const patch = ticketPatchSchema.parse(rawPatch);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un ticket con ese numero.");
    throw new Error(error.message);
  }

  return data as Ticket;
}

export async function lookupPeople(query: string) {
  const tickets = await listTickets({ query, filter: "all" });
  return buildPersonSuggestions(tickets, query, 8);
}

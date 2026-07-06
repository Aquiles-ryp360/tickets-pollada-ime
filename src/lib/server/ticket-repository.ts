import {
  buildPersonSuggestions,
  filterTickets,
  normalizeTicketNumber,
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
  const tickets = await createTickets([rawDraft]);
  return tickets[0];
}

export async function createTickets(rawDrafts: TicketDraft[]) {
  if (!rawDrafts.length) {
    throw new Error("Ingresa al menos un ticket.");
  }

  const drafts = rawDrafts.map((rawDraft) => ticketCreateSchema.parse(rawDraft));
  const normalizedNumbers = drafts.map((draft) => normalizeTicketNumber(draft.ticket_number));
  const repeatedInDraft = normalizedNumbers.find((number, index) => normalizedNumbers.indexOf(number) !== index);

  if (repeatedInDraft) {
    throw new Error(`El ticket ${repeatedInDraft} esta repetido en el formulario.`);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .insert(drafts)
    .select("*");

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un ticket con ese numero.");
    throw new Error(error.message);
  }

  return (data ?? []) as Ticket[];
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

export async function deleteTicket(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .delete()
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Ticket;
}

export async function lookupPeople(query: string) {
  const tickets = await listTickets({ query, filter: "all" });
  return buildPersonSuggestions(tickets, query, 8);
}

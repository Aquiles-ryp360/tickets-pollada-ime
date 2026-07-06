"use client";

import {
  filterTickets,
  normalizeTicketNumber,
  ticketCreateSchema,
  ticketPatchSchema,
  type Ticket,
  type TicketDraft,
  type TicketFilter
} from "@/lib/tickets";

const storageKey = "tickets-pollada-ime:v1";

export function loadLocalTickets() {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Ticket[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveLocalTickets(tickets: Ticket[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(tickets));
}

export function listLocalTickets(query: string, filter: TicketFilter) {
  return filterTickets(loadLocalTickets(), query, filter);
}

export function createLocalTicket(draft: TicketDraft) {
  return createLocalTickets([draft])[0];
}

export function createLocalTickets(drafts: TicketDraft[]) {
  const parsedDrafts = drafts.map((draft) => ticketCreateSchema.parse(draft));
  const tickets = loadLocalTickets();
  const normalizedNumbers = parsedDrafts.map((draft) => normalizeTicketNumber(draft.ticket_number));
  const repeatedInDraft = normalizedNumbers.find((number, index) => normalizedNumbers.indexOf(number) !== index);

  if (repeatedInDraft) {
    throw new Error(`El ticket ${repeatedInDraft} esta repetido en el formulario.`);
  }

  const existingNumber = normalizedNumbers.find((number) =>
    tickets.some((ticket) => normalizeTicketNumber(ticket.ticket_number) === number)
  );

  if (existingNumber) {
    throw new Error(`Ya existe un ticket con el numero ${existingNumber}.`);
  }

  const now = new Date().toISOString();
  const newTickets: Ticket[] = parsedDrafts.map((draft) => ({
    id: crypto.randomUUID(),
    ...draft,
    created_at: now,
    updated_at: now
  }));

  const nextTickets = [...newTickets, ...tickets];
  saveLocalTickets(nextTickets);
  return newTickets;
}

export function updateLocalTicket(id: string, patch: Partial<TicketDraft>) {
  const tickets = loadLocalTickets();
  const index = tickets.findIndex((ticket) => ticket.id === id);
  if (index === -1) {
    throw new Error("No se encontro el ticket.");
  }

  const parsed = ticketPatchSchema.parse(patch);
  const current = tickets[index];

  if (
    parsed.ticket_number &&
    tickets.some(
      (ticket) =>
        ticket.id !== id &&
        normalizeTicketNumber(ticket.ticket_number) === parsed.ticket_number
    )
  ) {
    throw new Error("Ya existe un ticket con ese numero.");
  }

  const updated: Ticket = {
    ...current,
    ...parsed,
    updated_at: new Date().toISOString()
  };

  const nextTickets = [...tickets];
  nextTickets[index] = updated;
  saveLocalTickets(nextTickets);
  return updated;
}

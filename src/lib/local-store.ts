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
  const parsed = ticketCreateSchema.parse(draft);
  const tickets = loadLocalTickets();
  const exists = tickets.some(
    (ticket) => normalizeTicketNumber(ticket.ticket_number) === parsed.ticket_number
  );

  if (exists) {
    throw new Error("Ya existe un ticket con ese numero.");
  }

  const now = new Date().toISOString();
  const ticket: Ticket = {
    id: crypto.randomUUID(),
    ...parsed,
    created_at: now,
    updated_at: now
  };

  const nextTickets = [ticket, ...tickets];
  saveLocalTickets(nextTickets);
  return ticket;
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

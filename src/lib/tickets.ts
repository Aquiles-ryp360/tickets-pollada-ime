import { z } from "zod";

export type Ticket = {
  id: string;
  ticket_number: string;
  dni: string | null;
  una_code: string | null;
  career_code: string | null;
  career_name: string | null;
  full_name: string;
  phone: string | null;
  seller: string;
  identity_source: "manual" | "unap_tramites" | "peruapi" | null;
  paid: boolean;
  picked_up: boolean;
  observation: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketDraft = {
  ticket_number: string;
  dni: string;
  una_code: string;
  career_code: string;
  career_name: string;
  full_name: string;
  phone: string;
  seller: string;
  identity_source: "manual" | "unap_tramites" | "peruapi";
  paid: boolean;
  picked_up: boolean;
  observation: string;
};

export type TicketFilter =
  | "all"
  | "paid"
  | "unpaid"
  | "picked"
  | "unpicked"
  | "observation"
  | "observed_case";

export type TicketStatus =
  | "pending_payment"
  | "paid_pending_pickup"
  | "completed"
  | "observed_case";

export type PersonSuggestion = {
  key: string;
  full_name: string;
  dni: string;
  una_code: string;
  career_code: string;
  career_name: string;
  phone: string;
  last_ticket_number: string;
  last_seller: string;
  updated_at: string;
  matches: number;
};

const blankToNull = z
  .string()
  .optional()
  .nullable()
  .transform((value) => normalizeOptionalText(value));

const optionalDni = z
  .string()
  .optional()
  .nullable()
  .transform((value) => digitsOnly(value ?? ""))
  .refine((value) => !value || /^\d{8}$/.test(value), "El DNI debe tener 8 digitos.")
  .transform((value) => value || null);

export const ticketCreateSchema = z.object({
  ticket_number: z
    .string()
    .min(1, "Ingresa el numero de ticket.")
    .transform((value) => normalizeTicketNumber(value)),
  dni: optionalDni,
  una_code: z
    .string()
    .optional()
    .nullable()
    .transform((value) => normalizeCode(value))
    .refine(
      (value) => !value || /^[A-Z0-9-]{3,24}$/.test(value),
      "El codigo UNA debe tener solo letras, numeros o guion."
    )
    .transform((value) => value || null),
  career_code: blankToNull,
  career_name: blankToNull,
  full_name: z
    .string()
    .min(1, "Ingresa el nombre completo.")
    .transform((value) => normalizeHumanText(value)),
  phone: blankToNull,
  seller: z.string().min(1, "Ingresa el vendedor.").transform((value) => normalizeHumanText(value)),
  identity_source: z.enum(["manual", "unap_tramites", "peruapi"]).optional().default("manual"),
  paid: z.boolean().optional().default(false),
  picked_up: z.boolean().optional().default(false),
  observation: blankToNull
});

export const ticketPatchSchema = ticketCreateSchema.partial().extend({
  paid: z.boolean().optional(),
  picked_up: z.boolean().optional(),
  observation: blankToNull.optional()
});

export const emptyTicketDraft: TicketDraft = {
  ticket_number: "",
  dni: "",
  una_code: "",
  career_code: "",
  career_name: "",
  full_name: "",
  phone: "",
  seller: "",
  identity_source: "manual",
  paid: false,
  picked_up: false,
  observation: ""
};

export const ticketFilters: Array<{ id: TicketFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "paid", label: "Pagados" },
  { id: "unpaid", label: "No pagados" },
  { id: "picked", label: "Recogidos" },
  { id: "unpicked", label: "No recogidos" },
  { id: "observation", label: "Con observacion" },
  { id: "observed_case", label: "Casos observados" }
];

export function normalizeTicketNumber(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function normalizeCode(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function normalizeHumanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeOptionalText(value: string | null | undefined) {
  const normalized = normalizeHumanText(value ?? "");
  return normalized || null;
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function getTicketStatus(ticket: Pick<Ticket, "paid" | "picked_up">): TicketStatus {
  if (ticket.picked_up && !ticket.paid) return "observed_case";
  if (ticket.paid && ticket.picked_up) return "completed";
  if (ticket.paid && !ticket.picked_up) return "paid_pending_pickup";
  return "pending_payment";
}

export function getTicketStatusLabel(ticket: Pick<Ticket, "paid" | "picked_up">) {
  const status = getTicketStatus(ticket);
  if (status === "observed_case") return "Caso observado";
  if (status === "completed") return "Completado";
  if (status === "paid_pending_pickup") return "Pagado, falta recoger";
  return "Pendiente de pago";
}

export function ticketMatchesQuery(ticket: Ticket, query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;

  const compact = normalized.replace(/\s/g, "");
  const fields = [
    ticket.ticket_number,
    ticket.dni ?? "",
    ticket.una_code ?? "",
    ticket.career_name ?? "",
    ticket.full_name,
    ticket.seller,
    ticket.observation ?? ""
  ];

  return fields.some((field) => {
    const normalizedField = normalizeSearch(field);
    return normalizedField.includes(normalized) || normalizedField.replace(/\s/g, "").includes(compact);
  });
}

export function ticketMatchesFilter(ticket: Ticket, filter: TicketFilter) {
  if (filter === "paid") return ticket.paid;
  if (filter === "unpaid") return !ticket.paid;
  if (filter === "picked") return ticket.picked_up;
  if (filter === "unpicked") return !ticket.picked_up;
  if (filter === "observation") return Boolean(ticket.observation?.trim());
  if (filter === "observed_case") return ticket.picked_up && !ticket.paid;
  return true;
}

export function filterTickets(tickets: Ticket[], query: string, filter: TicketFilter) {
  return tickets.filter((ticket) => ticketMatchesFilter(ticket, filter) && ticketMatchesQuery(ticket, query));
}

export function summarizeTickets(tickets: Ticket[]) {
  return {
    total: tickets.length,
    pendingPayment: tickets.filter((ticket) => getTicketStatus(ticket) === "pending_payment").length,
    paidPendingPickup: tickets.filter((ticket) => getTicketStatus(ticket) === "paid_pending_pickup").length,
    completed: tickets.filter((ticket) => getTicketStatus(ticket) === "completed").length,
    observed: tickets.filter((ticket) => getTicketStatus(ticket) === "observed_case").length
  };
}

export function buildPersonSuggestions(tickets: Ticket[], query: string, limit = 6): PersonSuggestion[] {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return [];

  const people = new Map<string, PersonSuggestion>();

  for (const ticket of tickets) {
    if (!ticketMatchesQuery(ticket, query)) continue;

    const key =
      ticket.dni?.trim() ||
      ticket.una_code?.trim() ||
      normalizeSearch(ticket.full_name) ||
      ticket.id;
    const current = people.get(key);

    if (current) {
      current.matches += 1;
      if (new Date(ticket.updated_at).getTime() > new Date(current.updated_at).getTime()) {
        current.full_name = ticket.full_name;
        current.dni = ticket.dni ?? "";
        current.una_code = ticket.una_code ?? "";
        current.career_code = ticket.career_code ?? "";
        current.career_name = ticket.career_name ?? "";
        current.phone = ticket.phone ?? "";
        current.last_ticket_number = ticket.ticket_number;
        current.last_seller = ticket.seller;
        current.updated_at = ticket.updated_at;
      }
      continue;
    }

    people.set(key, {
      key,
      full_name: ticket.full_name,
      dni: ticket.dni ?? "",
      una_code: ticket.una_code ?? "",
      career_code: ticket.career_code ?? "",
      career_name: ticket.career_name ?? "",
      phone: ticket.phone ?? "",
      last_ticket_number: ticket.ticket_number,
      last_seller: ticket.seller,
      updated_at: ticket.updated_at,
      matches: 1
    });
  }

  return [...people.values()]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit);
}

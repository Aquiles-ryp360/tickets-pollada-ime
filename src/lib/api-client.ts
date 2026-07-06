import type { Ticket, TicketDraft, TicketFilter } from "@/lib/tickets";

export type ApiResult<T> =
  | { ok: true; data: T; mode?: "api" }
  | { ok: false; status: number; code?: string; message: string };

export const pinStorageKey = "tickets-pollada-ime:pin";

export function getStoredPin() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(pinStorageKey) ?? "";
}

export function setStoredPin(pin: string) {
  window.sessionStorage.setItem(pinStorageKey, pin);
}

export async function apiGetTickets({
  query,
  filter,
  pin
}: {
  query: string;
  filter: TicketFilter;
  pin: string;
}) {
  const search = new URLSearchParams();
  if (query) search.set("q", query);
  if (filter !== "all") search.set("filter", filter);
  return apiFetch<Ticket[]>(`/api/tickets?${search.toString()}`, { method: "GET" }, pin);
}

export async function apiCreateTicket(draft: TicketDraft, pin: string) {
  return apiFetch<Ticket>("/api/tickets", { method: "POST", body: JSON.stringify(draft) }, pin);
}

export async function apiCreateTickets(drafts: TicketDraft[], pin: string) {
  return apiFetch<Ticket[]>("/api/tickets", { method: "POST", body: JSON.stringify(drafts) }, pin);
}

export async function apiUpdateTicket(id: string, patch: Partial<TicketDraft>, pin: string) {
  return apiFetch<Ticket>(`/api/tickets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  }, pin);
}

export async function apiFetch<T>(path: string, init: RequestInit, pin: string): Promise<ApiResult<T>> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(pin ? { "x-app-pin": pin } : {}),
      ...init.headers
    }
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; data?: T; code?: string; message?: string }
    | null;

  if (!response.ok || payload?.ok === false) {
    return {
      ok: false,
      status: response.status,
      code: payload?.code,
      message: payload?.message ?? "No se pudo completar la operacion."
    };
  }

  return { ok: true, data: payload?.data as T, mode: "api" };
}

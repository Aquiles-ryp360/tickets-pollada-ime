"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileSpreadsheet,
  ListFilter,
  Loader2,
  LockKeyhole,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  Ticket as TicketIcon,
  Trash2,
  UserRound
} from "lucide-react";
import {
  apiCreateTickets,
  apiDeleteTicket,
  apiFetch,
  apiGetTickets,
  apiUpdateTicket,
  getStoredPin,
  setStoredPin
} from "@/lib/api-client";
import {
  createLocalTickets,
  deleteLocalTicket,
  loadLocalTickets,
  updateLocalTicket
} from "@/lib/local-store";
import {
  buildPersonSuggestions,
  emptyTicketDraft,
  filterTickets,
  getTicketStatus,
  getTicketStatusLabel,
  normalizeTicketNumber,
  normalizeSearch,
  summarizeTickets,
  ticketFilters,
  type PersonSuggestion,
  type Ticket,
  type TicketDraft,
  type TicketFilter
} from "@/lib/tickets";
import type { QuickSearchResult } from "@/lib/quick-search";

type View = "search" | "register" | "list" | "downloads";
type StorageMode = "api" | "local";
type Notice = { type: "success" | "error" | "info"; text: string } | null;
type TicketSort = "created_desc" | "updated_desc" | "ticket_asc";
type DownloadMode = "ticket" | "person" | "seller" | "filter";

type IdentityPayload = {
  ok: boolean;
  source: "unap_tramites" | "peruapi";
  full_name: string | null;
  dni: string | null;
  una_code: string | null;
  career_code: string | null;
  career_name: string | null;
  message: string;
};

type QuickSearchState = {
  loading: boolean;
  result: QuickSearchResult | null;
  error: string;
};

type QuickPersonGroup = {
  key: string;
  fullName: string;
  dni: string;
  unaCode: string;
  careerName: string;
  sellerNames: string[];
  ticketNumbers: string[];
  tickets: Ticket[];
  total: number;
  paid: number;
  pickedUp: number;
  pendingPayment: number;
  pendingPickup: number;
  observed: number;
  withObservation: number;
  updatedAt: string;
};

const views: Array<{ id: View; label: string; icon: typeof Search }> = [
  { id: "search", label: "Consulta rápida", icon: Search },
  { id: "register", label: "Registrar ticket", icon: Plus },
  { id: "list", label: "Lista de tickets", icon: ClipboardList },
  { id: "downloads", label: "Descargas", icon: Download }
];

const maxTicketCount = 20;

export function TicketControlApp() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [view, setView] = useState<View>("search");
  const [mode, setMode] = useState<StorageMode | null>(null);
  const [pin, setPin] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const [pinRequired, setPinRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [quickQuery, setQuickQuery] = useState("");
  const [quickSearch, setQuickSearch] = useState<QuickSearchState>({
    loading: false,
    result: null,
    error: ""
  });
  const [listQuery, setListQuery] = useState("");
  const [listFilter, setListFilter] = useState<TicketFilter>("all");
  const [listSort, setListSort] = useState<TicketSort>("created_desc");
  const [personQuery, setPersonQuery] = useState("");
  const [form, setForm] = useState<TicketDraft>(emptyTicketDraft);
  const [ticketCount, setTicketCount] = useState(1);
  const [ticketNumbers, setTicketNumbers] = useState<string[]>([""]);
  const [observationDrafts, setObservationDrafts] = useState<Record<string, string>>({});

  const summary = useMemo(() => summarizeTickets(tickets), [tickets]);
  const localQuickResults = useMemo(() => {
    if (quickQuery) return filterTickets(tickets, quickQuery, "all");
    return [...tickets].sort(sortByUpdatedAtDesc).slice(0, 5);
  }, [quickQuery, tickets]);
  const rawQuickResults =
    mode === "api" && quickQuery.trim()
      ? quickSearch.result?.kind === "tickets"
        ? quickSearch.result.tickets
        : []
      : localQuickResults;
  const quickResults = useMemo(() => {
    if (!quickQuery.trim()) return rawQuickResults;
    return expandTicketsByPerson(rawQuickResults, tickets);
  }, [quickQuery, rawQuickResults, tickets]);
  const quickNameSuggestions = useMemo(
    () => buildNameSuggestions(tickets, quickQuery, 6),
    [quickQuery, tickets]
  );
  const quickExternal =
    mode === "api" && quickSearch.result?.kind === "external"
      ? quickSearch.result.external
      : null;
  const quickMessage =
    mode === "api" && quickQuery.trim()
      ? quickSearch.error || quickSearch.result?.message || ""
      : "";
  const listResults = useMemo(
    () => sortTicketsForList(filterTickets(tickets, listQuery, listFilter), listSort),
    [listFilter, listQuery, listSort, tickets]
  );
  const personSuggestions = useMemo(
    () => buildPersonSuggestions(tickets, personQuery, 6),
    [personQuery, tickets]
  );

  useEffect(() => {
    const storedPin = getStoredPin();
    setPin(storedPin);
    setPinDraft(storedPin);
    void refreshTickets(storedPin);
  }, []);

  useEffect(() => {
    setTicketNumbers((current) => {
      if (current[0] === form.ticket_number) return current;
      return [form.ticket_number, ...current.slice(1)];
    });
  }, [form.ticket_number]);

  useEffect(() => {
    const query = quickQuery.trim();

    if (mode !== "api" || !query) {
      setQuickSearch({ loading: false, result: null, error: "" });
      return;
    }

    let ignored = false;
    const controller = new AbortController();
    setQuickSearch((current) => ({ ...current, loading: true, error: "" }));

    const timer = window.setTimeout(async () => {
      try {
        const result = await apiFetch<QuickSearchResult>(
          `/api/search/quick?q=${encodeURIComponent(query)}`,
          { method: "GET", signal: controller.signal },
          pin
        );

        if (ignored) return;

        if (result.ok) {
          setQuickSearch({ loading: false, result: result.data, error: "" });
          if (result.data.kind === "tickets") {
            setTickets((current) => mergeTickets(current, result.data.tickets));
          }
          return;
        }

        if (result.code === "storage_unconfigured") {
          useLocalMode();
          return;
        }

        setQuickSearch({ loading: false, result: null, error: result.message });
      } catch (error) {
        if (ignored || (error instanceof DOMException && error.name === "AbortError")) return;
        setQuickSearch({
          loading: false,
          result: null,
          error: "No se pudo consultar. Intenta otra vez."
        });
      }
    }, 350);

    return () => {
      ignored = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, pin, quickQuery]);

  async function refreshTickets(pinValue = pin) {
    setLoading(true);
    setNotice(null);

    try {
      const result = await apiGetTickets({ query: "", filter: "all", pin: pinValue });

      if (result.ok) {
        setMode("api");
        setPinRequired(false);
        setTickets(result.data);
        return;
      }

      if (result.status === 401) {
        setPinRequired(true);
        setNotice({ type: "info", text: result.message });
        return;
      }

      if (result.code === "storage_unconfigured") {
        useLocalMode();
        return;
      }

      setNotice({ type: "error", text: result.message });
    } catch {
      useLocalMode();
    } finally {
      setLoading(false);
    }
  }

  function useLocalMode() {
    setMode("local");
    setPinRequired(false);
    setTickets(loadLocalTickets().sort(sortByCreatedAtDesc));
    setNotice({
      type: "info",
      text: "Modo local del navegador activo."
    });
  }

  function submitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStoredPin(pinDraft);
    setPin(pinDraft);
    void refreshTickets(pinDraft);
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const drafts = buildTicketDrafts();
      const createdTickets =
        mode === "local"
          ? createLocalTickets(drafts)
          : await createTicketsViaApi(drafts);
      const firstTicket = createdTickets[0];
      if (!firstTicket) {
        throw new Error("No se pudo registrar ningun ticket.");
      }

      setTickets((current) => mergeTickets(current, createdTickets));
      setQuickSearch({
        loading: false,
        result: {
          kind: "tickets",
          query: firstTicket.ticket_number,
          tickets: createdTickets,
          external: null,
          message: createdTickets.length === 1 ? "Ticket registrado." : "Tickets registrados."
        },
        error: ""
      });
      setForm({
        ...emptyTicketDraft,
        seller: form.seller
      });
      setTicketCount(1);
      setTicketNumbers([""]);
      setPersonQuery("");
      setView("search");
      setQuickQuery(firstTicket.ticket_number);
      setNotice({
        type: "success",
        text: createdTickets.length === 1 ? "Ticket registrado." : `${createdTickets.length} tickets registrados.`
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "No se pudo registrar el ticket."
      });
    } finally {
      setSaving(false);
    }
  }

  async function createTicketsViaApi(drafts: TicketDraft[]) {
    const result = await apiCreateTickets(drafts, pin);
    if (!result.ok) throw new Error(result.message);
    return result.data;
  }

  function buildTicketDrafts() {
    const numbers = ticketNumbers
      .slice(0, ticketCount)
      .map((number) => number.trim());
    const missing = numbers.some((number) => !number);

    if (missing) {
      throw new Error("Ingresa el numero de cada ticket.");
    }

    const normalizedNumbers = numbers.map((number) => number.replace(/\s+/g, "").toUpperCase());
    const repeated = normalizedNumbers.find(
      (number, index) => normalizedNumbers.indexOf(number) !== index
    );

    if (repeated) {
      throw new Error(`El ticket ${repeated} esta repetido.`);
    }

    return numbers.map((ticketNumber) => ({
      ...form,
      ticket_number: ticketNumber
    }));
  }

  async function patchTicket(ticket: Ticket, patch: Partial<TicketDraft>) {
    setBusyId(ticket.id);
    setNotice(null);

    try {
      const updated =
        mode === "local"
          ? updateLocalTicket(ticket.id, patch)
          : await updateTicketViaApi(ticket.id, patch);
      setTickets((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .sort(sortByCreatedAtDesc)
      );
      setQuickSearch((current) => {
        if (current.result?.kind !== "tickets") return current;
        return {
          ...current,
          result: {
            ...current.result,
            tickets: current.result.tickets.map((item) => (item.id === updated.id ? updated : item))
          }
        };
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "No se pudo actualizar el ticket."
      });
    } finally {
      setBusyId("");
    }
  }

  async function removeTicket(ticket: Ticket) {
    const confirmed = window.confirm(
      `Eliminar el ticket ${ticket.ticket_number} de ${ticket.full_name}? Esta accion no se puede deshacer.`
    );

    if (!confirmed) return;

    setBusyId(ticket.id);
    setNotice(null);

    try {
      const deleted =
        mode === "local" ? deleteLocalTicket(ticket.id) : await deleteTicketViaApi(ticket.id);

      setTickets((current) => current.filter((item) => item.id !== deleted.id));
      setQuickSearch((current) => {
        if (current.result?.kind !== "tickets") return current;
        return {
          ...current,
          result: {
            ...current.result,
            tickets: current.result.tickets.filter((item) => item.id !== deleted.id)
          }
        };
      });
      setObservationDrafts((current) => {
        const next = { ...current };
        delete next[deleted.id];
        return next;
      });
      setNotice({ type: "success", text: `Ticket ${deleted.ticket_number} eliminado.` });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "No se pudo eliminar el ticket."
      });
    } finally {
      setBusyId("");
    }
  }

  async function updateTicketViaApi(id: string, patch: Partial<TicketDraft>) {
    const result = await apiUpdateTicket(id, patch, pin);
    if (!result.ok) throw new Error(result.message);
    return result.data;
  }

  async function deleteTicketViaApi(id: string) {
    const result = await apiDeleteTicket(id, pin);
    if (!result.ok) throw new Error(result.message);
    return result.data;
  }

  async function lookupIdentity(kind: "dni" | "unap") {
    const path = kind === "dni" ? "/api/identity/dni" : "/api/identity/unap-student";
    const body =
      kind === "dni"
        ? { dni: form.dni || personQuery }
        : { una_code: form.una_code || personQuery };

    setSaving(true);
    setNotice(null);

    try {
      const result = await apiFetch<IdentityPayload>(
        path,
        { method: "POST", body: JSON.stringify(body) },
        pin
      );

      if (!result.ok) {
        setNotice({ type: "error", text: result.message });
        return;
      }

      setForm((current) => ({
        ...current,
        dni: result.data.dni ?? current.dni,
        una_code: result.data.una_code ?? current.una_code,
        career_code: result.data.career_code ?? current.career_code,
        career_name: result.data.career_name ?? current.career_name,
        full_name: result.data.full_name ?? current.full_name,
        identity_source: result.data.source
      }));
      setNotice({ type: "success", text: result.data.message });
    } catch {
      setNotice({ type: "error", text: "No se pudo consultar. Registra manualmente." });
    } finally {
      setSaving(false);
    }
  }

  function applySuggestion(suggestion: PersonSuggestion) {
    setForm((current) => ({
      ...current,
      dni: suggestion.dni,
      una_code: suggestion.una_code,
      career_code: suggestion.career_code,
      career_name: suggestion.career_name,
      full_name: suggestion.full_name,
      phone: suggestion.phone || current.phone
    }));
    setPersonQuery(suggestion.full_name);
    setNotice({ type: "success", text: "Datos cargados." });
  }

  function startRegisterFromQuickSearch(external: IdentityPayload | null = quickExternal) {
    const rawQuery = quickQuery.trim();
    const digits = rawQuery.replace(/\D/g, "");
    const looksLikeDni = /^\d{8}$/.test(digits);
    const looksLikeUnaCode = /^\d{6}$/.test(digits);
    const looksLikeOnlyText = rawQuery && !/\d/.test(rawQuery);

    setForm((current) => ({
      ...emptyTicketDraft,
      seller: current.seller,
      dni: external?.dni ?? (looksLikeDni ? digits : ""),
      una_code: external?.una_code ?? (looksLikeUnaCode ? digits : ""),
      career_code: external?.career_code ?? "",
      career_name: external?.career_name ?? "",
      full_name: external?.full_name ?? (looksLikeOnlyText ? rawQuery : ""),
      ticket_number: !looksLikeDni && !looksLikeUnaCode && !looksLikeOnlyText ? rawQuery : "",
      identity_source: external?.source ?? "manual"
    }));
    setTicketCount(1);
    setTicketNumbers([
      !looksLikeDni && !looksLikeUnaCode && !looksLikeOnlyText ? rawQuery : ""
    ]);
    setPersonQuery(external?.full_name ?? rawQuery);
    setView("register");
    setNotice({
      type: "info",
      text: external ? "Datos cargados para registrar nuevo ticket." : "Completa los datos del nuevo ticket."
    });
  }

  function updateTicketCount(count: number) {
    const nextCount = Math.min(Math.max(Math.trunc(count), 1), maxTicketCount);
    setTicketCount(nextCount);
    setTicketNumbers((current) =>
      Array.from({ length: nextCount }, (_, index) => current[index] ?? "")
    );
  }

  function setTicketNumberAt(index: number, value: string) {
    setTicketNumbers((current) =>
      Array.from({ length: ticketCount }, (_, currentIndex) =>
        currentIndex === index ? value : current[currentIndex] ?? ""
      )
    );

    if (index === 0) {
      setForm((current) => ({ ...current, ticket_number: value }));
    }
  }

  if (pinRequired) {
    return (
      <main className="main">
        <section className="panel pin-panel">
          <div className="panel-header">
            <h2>Acceso</h2>
            <LockKeyhole size={20} />
          </div>
          <form className="panel-body" onSubmit={submitPin}>
            <div className="field">
              <label htmlFor="pin">PIN</label>
              <input
                id="pin"
                className="input"
                type="password"
                value={pinDraft}
                onChange={(event) => setPinDraft(event.target.value)}
                autoFocus
              />
            </div>
            <div className="actions-row" style={{ marginTop: 14 }}>
              <button className="primary-button" type="submit">
                <CheckCircle2 size={18} />
                Entrar
              </button>
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">
              <TicketIcon size={23} />
            </span>
            <div>
              <h1>Pollada IME</h1>
              <p>Control de tickets de Mecánica Eléctrica</p>
            </div>
          </div>
          <div className="mode-pill">
            {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            {mode === "api" ? "Supabase" : mode === "local" ? "Local" : "Cargando"}
          </div>
        </div>
      </header>

      <main className="main">
        {notice ? <div className="notice">{notice.text}</div> : null}

        <section className="summary-grid" aria-label="Resumen">
          <SummaryCard label="Total" value={summary.total} />
          <SummaryCard label="Pendiente de pago" value={summary.pendingPayment} />
          <SummaryCard label="Falta recoger" value={summary.paidPendingPickup} />
          <SummaryCard label="Completados" value={summary.completed} />
          <SummaryCard label="Observados" value={summary.observed} />
        </section>

        <nav className="tabs" aria-label="Vistas">
          {views.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`tab-button ${view === item.id ? "active" : ""}`}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {view === "search" ? (
          <QuickSearchView
            busyId={busyId}
            query={quickQuery}
            results={quickResults}
            external={quickExternal}
            loading={quickSearch.loading}
            message={quickMessage}
            nameSuggestions={quickNameSuggestions}
            setQuery={setQuickQuery}
            onAddNew={() => startRegisterFromQuickSearch()}
            onDelete={removeTicket}
            onPatch={patchTicket}
          />
        ) : null}

        {view === "register" ? (
          <RegisterView
            form={form}
            loading={saving}
            personQuery={personQuery}
            suggestions={personSuggestions}
            ticketCount={ticketCount}
            ticketNumbers={ticketNumbers}
            setForm={setForm}
            setPersonQuery={setPersonQuery}
            setTicketCount={updateTicketCount}
            setTicketNumberAt={setTicketNumberAt}
            onApplySuggestion={applySuggestion}
            onLookupDni={() => lookupIdentity("dni")}
            onLookupUna={() => lookupIdentity("unap")}
            onSubmit={createTicket}
          />
        ) : null}

        {view === "list" ? (
          <TicketListView
            busyId={busyId}
            filter={listFilter}
            observationDrafts={observationDrafts}
            query={listQuery}
            results={listResults}
            sort={listSort}
            setFilter={setListFilter}
            setObservationDrafts={setObservationDrafts}
            setQuery={setListQuery}
            setSort={setListSort}
            onPatch={patchTicket}
          />
        ) : null}

        {view === "downloads" ? (
          <DownloadsView
            currentFilter={listFilter}
            currentQuery={listQuery}
            listResults={listResults}
            tickets={tickets}
          />
        ) : null}
      </main>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QuickSearchView({
  busyId,
  external,
  loading,
  message,
  nameSuggestions,
  onAddNew,
  onDelete,
  onPatch,
  query,
  results,
  setQuery
}: {
  busyId: string;
  external: IdentityPayload | null;
  loading: boolean;
  message: string;
  nameSuggestions: PersonSuggestion[];
  onAddNew: () => void;
  onDelete: (ticket: Ticket) => void;
  onPatch: (ticket: Ticket, patch: Partial<TicketDraft>) => void;
  query: string;
  results: Ticket[];
  setQuery: (query: string) => void;
}) {
  const groupedResults = useMemo(() => groupTicketsByPerson(results), [results]);
  const showNameSuggestions = query.trim().length >= 2 && nameSuggestions.length > 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Consulta rápida</h2>
        <span className="mode-pill">
          {loading ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
          {loading ? "Buscando" : `${groupedResults.length} persona(s)`}
        </span>
      </div>
      <div className="panel-body">
        <div className="search-row">
          <div className="input-wrap">
            <Search size={20} />
            <input
              className="input large with-icon"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ticket, DNI, código UNA o nombre"
              autoFocus
            />
          </div>
          <button className="secondary-button" type="button" onClick={() => setQuery("")}>
            Limpiar
          </button>
        </div>

        {showNameSuggestions ? (
          <div className="name-suggestion-panel" aria-label="Personas ingresadas">
            <div className="name-suggestion-title">
              <UserRound size={16} />
              <strong>Personas ingresadas</strong>
            </div>
            <div className="name-suggestion-list">
              {nameSuggestions.map((suggestion) => (
                <button
                  key={suggestion.key}
                  className="name-suggestion-button"
                  type="button"
                  onClick={() => setQuery(suggestion.full_name)}
                >
                  <strong>{suggestion.full_name}</strong>
                  <span>
                    DNI {suggestion.dni || "-"} · UNA {suggestion.una_code || "-"} ·{" "}
                    {suggestion.matches} ticket(s)
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {message ? <p className="search-message">{message}</p> : null}

        <div className="results-grid" style={{ marginTop: 14 }}>
          {groupedResults.length ? (
            <QuickPersonSummary
              busyId={busyId}
              groups={groupedResults}
              onDelete={onDelete}
              onPatch={onPatch}
            />
          ) : external ? (
            <ExternalPersonPanel external={external} onAddNew={onAddNew} />
          ) : query.trim() ? (
            <div className="empty-action">
              <div>
                <strong>Sin registro en tickets.</strong>
                <p>Puede ser una persona nueva. Agrega el ticket y completa los datos faltantes.</p>
              </div>
              <button className="primary-button" type="button" onClick={onAddNew}>
                <Plus size={18} />
                Agregar nuevo
              </button>
            </div>
          ) : (
            <div className="empty">Busca por número de ticket, DNI, código UNA o nombre.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function QuickPersonSummary({
  busyId,
  groups,
  onDelete,
  onPatch
}: {
  busyId: string;
  groups: QuickPersonGroup[];
  onDelete: (ticket: Ticket) => void;
  onPatch: (ticket: Ticket, patch: Partial<TicketDraft>) => void;
}) {
  return (
    <div className="quick-person-grid">
      {groups.map((group) => (
        <QuickPersonCard
          key={group.key}
          busyId={busyId}
          group={group}
          onDelete={onDelete}
          onPatch={onPatch}
        />
      ))}
    </div>
  );
}

function QuickPersonCard({
  busyId,
  group,
  onDelete,
  onPatch
}: {
  busyId: string;
  group: QuickPersonGroup;
  onDelete: (ticket: Ticket) => void;
  onPatch: (ticket: Ticket, patch: Partial<TicketDraft>) => void;
}) {
  const visibleTickets = group.ticketNumbers.slice(0, 18);
  const hiddenTickets = group.ticketNumbers.length - visibleTickets.length;
  const actionTickets = [...group.tickets].sort(sortByTicketNumberAsc);

  return (
    <article className={`quick-person-card ${group.observed ? "observed" : ""}`}>
      <div className="quick-person-header">
        <div className="ticket-title quick-person-title">
          <strong>{group.fullName}</strong>
          <span className="badge paid-pending">{group.total} ticket(s)</span>
          {group.observed ? (
            <span className="badge observed">
              <AlertTriangle size={14} />
              {group.observed} observado(s)
            </span>
          ) : null}
        </div>
        <span className="subtle">Actualizado {formatDate(group.updatedAt)}</span>
      </div>

      <div className="quick-person-fields">
        <QuickPersonField label="DNI" value={group.dni || "-"} />
        <QuickPersonField label="Código UNA" value={group.unaCode || "-"} />
        <QuickPersonField label="Carrera" value={group.careerName || "-"} />
        <QuickPersonField label="Vendedor" value={group.sellerNames.join(", ") || "-"} />
      </div>

      <div className="quick-stat-grid" aria-label="Resumen de tickets">
        <QuickStat label="Pagados" value={group.paid} tone={group.paid === group.total ? "good" : "neutral"} />
        <QuickStat label="Entregados" value={group.pickedUp} tone={group.pickedUp === group.total ? "good" : "neutral"} />
        <QuickStat label="Pend. pago" value={group.pendingPayment} tone={group.pendingPayment ? "warn" : "good"} />
        <QuickStat label="Falta recoger" value={group.pendingPickup} tone={group.pendingPickup ? "info" : "good"} />
        <QuickStat label="Notas" value={group.withObservation} tone={group.withObservation ? "info" : "neutral"} />
        <QuickStat label="Casos" value={group.observed} tone={group.observed ? "danger" : "good"} />
      </div>

      <div className="ticket-chip-row">
        <span className="subtle">Tickets</span>
        <div className="ticket-chip-list">
          {visibleTickets.map((ticketNumber) => (
            <span key={ticketNumber} className="ticket-chip">
              {ticketNumber}
            </span>
          ))}
          {hiddenTickets > 0 ? <span className="ticket-chip more">+{hiddenTickets}</span> : null}
        </div>
      </div>

      <details className="quick-ticket-actions" open={group.total === 1}>
        <summary>
          <span>Gestionar tickets</span>
          <strong>{group.total}</strong>
        </summary>
        <div className="quick-ticket-action-list">
          {actionTickets.map((ticket) => (
            <QuickTicketActionRow
              key={ticket.id}
              busy={busyId === ticket.id}
              ticket={ticket}
              onDelete={onDelete}
              onPatch={onPatch}
            />
          ))}
        </div>
      </details>
    </article>
  );
}

function QuickTicketActionRow({
  busy,
  ticket,
  onDelete,
  onPatch
}: {
  busy: boolean;
  ticket: Ticket;
  onDelete: (ticket: Ticket) => void;
  onPatch: (ticket: Ticket, patch: Partial<TicketDraft>) => void;
}) {
  return (
    <div className="quick-ticket-action-row">
      <div className="quick-ticket-action-info">
        <strong>Ticket {ticket.ticket_number}</strong>
        <TicketStatusBadge ticket={ticket} />
      </div>
      <div className="quick-ticket-buttons">
        <button
          className={`switch-button ${ticket.paid ? "on paid" : ""}`}
          disabled={busy}
          onClick={() => onPatch(ticket, { paid: !ticket.paid })}
          title="Cambiar pago"
          type="button"
        >
          <CircleDollarSign size={16} />
          {ticket.paid ? "Pagado" : "Cobrar"}
        </button>
        <button
          className={`switch-button ${ticket.picked_up ? "on picked" : ""}`}
          disabled={busy}
          onClick={() => onPatch(ticket, { picked_up: !ticket.picked_up })}
          title="Cambiar entrega"
          type="button"
        >
          <PackageCheck size={16} />
          {ticket.picked_up ? "Recogido" : "Recoger"}
        </button>
        <details className="quick-hidden-actions">
          <summary>Mas</summary>
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => onDelete(ticket)}
            type="button"
          >
            <Trash2 size={16} />
            Eliminar
          </button>
        </details>
      </div>
    </div>
  );
}

function QuickPersonField({ label, value }: { label: string; value: string }) {
  return (
    <div className="quick-person-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QuickStat({
  label,
  tone,
  value
}: {
  label: string;
  tone: "danger" | "good" | "info" | "neutral" | "warn";
  value: number;
}) {
  return (
    <div className={`quick-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExternalPersonPanel({
  external,
  onAddNew
}: {
  external: IdentityPayload;
  onAddNew: () => void;
}) {
  return (
    <div className="external-panel">
      <div>
        <div className="ticket-title">
          <strong>{external.full_name}</strong>
          <span className="badge paid-pending">Cliente nuevo</span>
        </div>
        <div className="mini-grid">
          <InfoItem label="DNI" value={external.dni || "-"} />
          <InfoItem label="Código UNA" value={external.una_code || "-"} />
          <InfoItem label="Carrera" value={external.career_name || "-"} />
          <InfoItem label="Fuente" value={external.source === "unap_tramites" ? "UNA Puno" : "DNI"} />
        </div>
      </div>
      <button className="primary-button" type="button" onClick={onAddNew}>
        <Plus size={18} />
        Agregar nuevo ticket
      </button>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RegisterView({
  form,
  loading,
  personQuery,
  suggestions,
  ticketCount,
  ticketNumbers,
  setForm,
  setPersonQuery,
  setTicketCount,
  setTicketNumberAt,
  onApplySuggestion,
  onLookupDni,
  onLookupUna,
  onSubmit
}: {
  form: TicketDraft;
  loading: boolean;
  personQuery: string;
  suggestions: PersonSuggestion[];
  ticketCount: number;
  ticketNumbers: string[];
  setForm: React.Dispatch<React.SetStateAction<TicketDraft>>;
  setPersonQuery: (query: string) => void;
  setTicketCount: (count: number) => void;
  setTicketNumberAt: (index: number, value: string) => void;
  onApplySuggestion: (suggestion: PersonSuggestion) => void;
  onLookupDni: () => void;
  onLookupUna: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Registrar ticket</h2>
        <div className="actions-row">
          <button className="secondary-button" type="button" onClick={onLookupDni} disabled={loading}>
            <UserRound size={17} />
            Buscar DNI
          </button>
          <button className="secondary-button" type="button" onClick={onLookupUna} disabled={loading}>
            <Search size={17} />
            Buscar UNA
          </button>
        </div>
      </div>

      <form className="panel-body" onSubmit={onSubmit}>
        <div className="field span-2" style={{ marginBottom: 14 }}>
          <label htmlFor="person-search">Buscar persona</label>
          <div className="input-wrap">
            <Search size={18} />
            <input
              id="person-search"
              className="input with-icon"
              value={personQuery}
              onChange={(event) => setPersonQuery(event.target.value)}
              placeholder="DNI, código UNA o nombre"
            />
          </div>
          {suggestions.length ? (
            <div className="suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.key}
                  className="suggestion-button"
                  type="button"
                  onClick={() => onApplySuggestion(suggestion)}
                >
                  <strong>{suggestion.full_name}</strong>
                  <span>
                    DNI {suggestion.dni || "-"} · UNA {suggestion.una_code || "-"} ·{" "}
                    {suggestion.career_name || "Sin carrera"} · {suggestion.matches} ticket(s)
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="form-grid">
          <TicketNumbersField
            count={ticketCount}
            numbers={ticketNumbers}
            onCountChange={setTicketCount}
            onNumberChange={setTicketNumberAt}
          />
          <Field label="Vendedor" name="seller" form={form} setForm={setForm} required />
          <Field label="DNI" name="dni" form={form} setForm={setForm} inputMode="numeric" />
          <Field label="Código UNA" name="una_code" form={form} setForm={setForm} />
          <Field label="Carrera" name="career_name" form={form} setForm={setForm} wide />
          <Field label="Nombre completo" name="full_name" form={form} setForm={setForm} required wide />
          <Field label="Teléfono" name="phone" form={form} setForm={setForm} inputMode="tel" />

          <div className="field">
            <label>Estado</label>
            <div className="toggle-row">
              <button
                className={`switch-button ${form.paid ? "on paid" : ""}`}
                type="button"
                onClick={() => setForm((current) => ({ ...current, paid: !current.paid }))}
              >
                <CircleDollarSign size={17} />
                {form.paid ? "Pagó" : "No pagó"}
              </button>
              <button
                className={`switch-button ${form.picked_up ? "on picked" : ""}`}
                type="button"
                onClick={() => setForm((current) => ({ ...current, picked_up: !current.picked_up }))}
              >
                <PackageCheck size={17} />
                {form.picked_up ? "Recogió" : "No recogió"}
              </button>
            </div>
          </div>

          <div className="field span-2">
            <label htmlFor="observation">Observación</label>
            <textarea
              id="observation"
              className="textarea"
              value={form.observation}
              onChange={(event) =>
                setForm((current) => ({ ...current, observation: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="actions-row" style={{ marginTop: 14 }}>
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
            Registrar
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({
  form,
  inputMode,
  label,
  name,
  required,
  setForm,
  wide
}: {
  form: TicketDraft;
  inputMode?: "numeric" | "tel";
  label: string;
  name: keyof Pick<
    TicketDraft,
    "ticket_number" | "dni" | "una_code" | "career_name" | "full_name" | "phone" | "seller"
  >;
  required?: boolean;
  setForm: React.Dispatch<React.SetStateAction<TicketDraft>>;
  wide?: boolean;
}) {
  return (
    <div className={`field ${wide ? "span-2" : ""}`}>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        className="input"
        inputMode={inputMode}
        required={required}
        value={form[name]}
        onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
      />
    </div>
  );
}

function TicketNumbersField({
  count,
  numbers,
  onCountChange,
  onNumberChange
}: {
  count: number;
  numbers: string[];
  onCountChange: (count: number) => void;
  onNumberChange: (index: number, value: string) => void;
}) {
  return (
    <div className="field span-2">
      <label htmlFor="ticket-count">Cantidad de tickets</label>
      <div className="ticket-count-control">
        <input
          id="ticket-count"
          className="range-input"
          type="range"
          min={1}
          max={maxTicketCount}
          step={1}
          value={count}
          onChange={(event) => onCountChange(Number(event.target.value))}
        />
        <strong>{count}</strong>
      </div>

      <div className={count === 1 ? "ticket-number-grid single" : "ticket-number-grid"}>
        {Array.from({ length: count }, (_, index) => (
          <div className="field" key={index}>
            <label htmlFor={`ticket-number-${index}`}>
              {count === 1 ? "Número de ticket" : `Ticket ${index + 1}`}
            </label>
            <input
              id={`ticket-number-${index}`}
              className="input"
              required
              value={numbers[index] ?? ""}
              onChange={(event) => onNumberChange(index, event.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketListView({
  busyId,
  filter,
  observationDrafts,
  query,
  results,
  sort,
  setFilter,
  setObservationDrafts,
  setQuery,
  setSort,
  onPatch
}: {
  busyId: string;
  filter: TicketFilter;
  observationDrafts: Record<string, string>;
  query: string;
  results: Ticket[];
  sort: TicketSort;
  setFilter: (filter: TicketFilter) => void;
  setObservationDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setQuery: (query: string) => void;
  setSort: (sort: TicketSort) => void;
  onPatch: (ticket: Ticket, patch: Partial<TicketDraft>) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Lista de tickets</h2>
        <span className="mode-pill">{results.length} visibles</span>
      </div>
      <div className="panel-body">
        <div className="search-row" style={{ marginBottom: 12 }}>
          <div className="input-wrap">
            <Search size={18} />
            <input
              className="input with-icon"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar en lista"
            />
          </div>
          <button className="secondary-button" type="button" onClick={() => setQuery("")}>
            Limpiar
          </button>
        </div>

        <div className="list-controls">
          <div className="filter-row">
            <ListFilter size={18} />
            {ticketFilters.map((item) => (
              <button
                key={item.id}
                className={`filter-button ${filter === item.id ? "active" : ""}`}
                onClick={() => setFilter(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="sort-control">
            <ArrowDownWideNarrow size={17} />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as TicketSort)}
            >
              <option value="created_desc">Registro mas reciente</option>
              <option value="updated_desc">Ultima actualizacion</option>
              <option value="ticket_asc">Ticket menor primero</option>
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Nombre</th>
                <th>DNI</th>
                <th>Código UNA</th>
                <th>Carrera</th>
                <th>Vendedor</th>
                <th>Pagó</th>
                <th>Recogió</th>
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              {results.map((ticket) => (
                <tr
                  key={ticket.id}
                  className={getTicketStatus(ticket) === "observed_case" ? "observed-row" : ""}
                >
                  <td>
                    <strong>{ticket.ticket_number}</strong>
                    <div style={{ marginTop: 7 }}>
                      <TicketStatusBadge ticket={ticket} />
                    </div>
                  </td>
                  <td>{ticket.full_name}</td>
                  <td>{ticket.dni || "-"}</td>
                  <td>{ticket.una_code || "-"}</td>
                  <td>{ticket.career_name || "-"}</td>
                  <td>{ticket.seller}</td>
                  <td>
                    <button
                      className={`switch-button ${ticket.paid ? "on paid" : ""}`}
                      disabled={busyId === ticket.id}
                      onClick={() => onPatch(ticket, { paid: !ticket.paid })}
                      title="Cambiar pago"
                      type="button"
                    >
                      <CircleDollarSign size={16} />
                      {ticket.paid ? "Sí" : "No"}
                    </button>
                  </td>
                  <td>
                    <button
                      className={`switch-button ${ticket.picked_up ? "on picked" : ""}`}
                      disabled={busyId === ticket.id}
                      onClick={() => onPatch(ticket, { picked_up: !ticket.picked_up })}
                      title="Cambiar entrega"
                      type="button"
                    >
                      <PackageCheck size={16} />
                      {ticket.picked_up ? "Sí" : "No"}
                    </button>
                  </td>
                  <td className="observation-cell">
                    <ObservationEditor
                      busy={busyId === ticket.id}
                      observationDrafts={observationDrafts}
                      setObservationDrafts={setObservationDrafts}
                      ticket={ticket}
                      onPatch={onPatch}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!results.length ? <div className="empty">Sin tickets para este filtro.</div> : null}
        </div>
      </div>
    </section>
  );
}

function DownloadsView({
  currentFilter,
  currentQuery,
  listResults,
  tickets
}: {
  currentFilter: TicketFilter;
  currentQuery: string;
  listResults: Ticket[];
  tickets: Ticket[];
}) {
  const [downloadMode, setDownloadMode] = useState<DownloadMode>("ticket");
  const [downloadQuery, setDownloadQuery] = useState("");
  const [downloadFilter, setDownloadFilter] = useState<TicketFilter>("all");
  const [message, setMessage] = useState("");

  const customResults = useMemo(() => {
    if (downloadMode === "filter") {
      return sortByCreatedAtDescList(filterTickets(tickets, "", downloadFilter));
    }

    const query = downloadQuery.trim();
    if (!query) return [];

    if (downloadMode === "ticket") {
      const ticketNumbers = parseTicketNumberQuery(query);
      return tickets
        .filter((ticket) => ticketNumbers.has(normalizeTicketNumber(ticket.ticket_number)))
        .sort(sortByTicketNumberAsc);
    }

    if (downloadMode === "seller") {
      return tickets
        .filter((ticket) => textMatches(ticket.seller, query))
        .sort(sortByCreatedAtDesc);
    }

    return tickets
      .filter((ticket) =>
        [ticket.full_name, ticket.dni ?? "", ticket.una_code ?? "", ticket.phone ?? ""].some((field) =>
          textMatches(field, query)
        )
      )
      .sort(sortByCreatedAtDesc);
  }, [downloadFilter, downloadMode, downloadQuery, tickets]);

  const quickDownloads = [
    {
      id: "all",
      label: "Descargar todo",
      description: "Todos los tickets registrados.",
      rows: tickets,
      filename: "tickets-todos"
    },
    {
      id: "current",
      label: "Lista actual",
      description: currentQuery.trim()
        ? `Busqueda actual con filtro ${getFilterLabel(currentFilter)}.`
        : `Filtro actual: ${getFilterLabel(currentFilter)}.`,
      rows: listResults,
      filename: "tickets-lista-actual"
    },
    {
      id: "unpaid",
      label: "Pendientes de pago",
      description: "Tickets que todavia no figuran como pagados.",
      rows: filterTickets(tickets, "", "unpaid"),
      filename: "tickets-pendientes-pago"
    },
    {
      id: "paid",
      label: "Pagados",
      description: "Tickets marcados como pagados.",
      rows: filterTickets(tickets, "", "paid"),
      filename: "tickets-pagados"
    },
    {
      id: "pickup",
      label: "Falta recoger",
      description: "Pagados que aun no fueron recogidos.",
      rows: tickets.filter((ticket) => getTicketStatus(ticket) === "paid_pending_pickup"),
      filename: "tickets-falta-recoger"
    },
    {
      id: "observed",
      label: "Observados",
      description: "Casos con entrega marcada sin pago.",
      rows: filterTickets(tickets, "", "observed_case"),
      filename: "tickets-observados"
    }
  ];

  function handleDownload(rows: Ticket[], filename: string, label: string) {
    if (!rows.length) {
      setMessage(`No hay tickets para "${label}".`);
      return;
    }

    exportTicketsToExcel(rows, filename);
    setMessage(`${rows.length} ticket(s) exportados en Excel.`);
  }

  const customLabel = getDownloadModeLabel(downloadMode);
  const customPlaceholder =
    downloadMode === "ticket"
      ? "Ej. 001 o 001, 002, 003"
      : downloadMode === "seller"
        ? "Nombre del vendedor"
        : "DNI, codigo UNA, telefono o nombre";

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Descargas</h2>
        <span className="mode-pill">
          <FileSpreadsheet size={16} />
          Excel
        </span>
      </div>
      <div className="panel-body">
        <div className="download-grid">
          {quickDownloads.map((item) => (
            <div className="download-card" key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <p>{item.description}</p>
                <span>{item.rows.length} ticket(s)</span>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => handleDownload(item.rows, item.filename, item.label)}
              >
                <Download size={17} />
                Excel
              </button>
            </div>
          ))}
        </div>

        <div className="download-custom">
          <div className="download-custom-header">
            <div>
              <strong>Descarga personalizada</strong>
              <p>Elige una opcion y descarga solo los tickets que necesitas.</p>
            </div>
            <span className="mode-pill">{customResults.length} resultado(s)</span>
          </div>

          <div className="download-custom-grid">
            <label className="field">
              <span>Opcion</span>
              <select
                className="input"
                value={downloadMode}
                onChange={(event) => {
                  setDownloadMode(event.target.value as DownloadMode);
                  setMessage("");
                }}
              >
                <option value="ticket">Por numero de ticket</option>
                <option value="person">Por persona</option>
                <option value="seller">Por vendedor</option>
                <option value="filter">Por estado</option>
              </select>
            </label>

            {downloadMode === "filter" ? (
              <label className="field">
                <span>Estado</span>
                <select
                  className="input"
                  value={downloadFilter}
                  onChange={(event) => setDownloadFilter(event.target.value as TicketFilter)}
                >
                  {ticketFilters.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field">
                <span>{customLabel}</span>
                <input
                  className="input"
                  value={downloadQuery}
                  onChange={(event) => {
                    setDownloadQuery(event.target.value);
                    setMessage("");
                  }}
                  placeholder={customPlaceholder}
                />
              </label>
            )}

            <button
              className="primary-button"
              type="button"
              disabled={downloadMode !== "filter" && !downloadQuery.trim()}
              onClick={() =>
                handleDownload(
                  customResults,
                  `tickets-${getDownloadFilenamePart(downloadMode, downloadMode === "filter" ? getFilterLabel(downloadFilter) : downloadQuery)}`,
                  `descarga personalizada por ${customLabel.toLowerCase()}`
                )
              }
            >
              <Download size={18} />
              Descargar
            </button>
          </div>

          {message ? <p className="download-message">{message}</p> : null}
        </div>
      </div>
    </section>
  );
}

function TicketCard({
  busy,
  observationDrafts,
  setObservationDrafts,
  ticket,
  onPatch
}: {
  busy: boolean;
  observationDrafts: Record<string, string>;
  setObservationDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  ticket: Ticket;
  onPatch: (ticket: Ticket, patch: Partial<TicketDraft>) => void;
}) {
  const observed = getTicketStatus(ticket) === "observed_case";

  return (
    <article className={`ticket-card ${observed ? "observed" : ""}`}>
      <div>
        <div className="ticket-title">
          <strong>Ticket {ticket.ticket_number}</strong>
          <TicketStatusBadge ticket={ticket} />
        </div>
        <div className="meta">
          <span>{ticket.full_name}</span>
          <span>DNI {ticket.dni || "-"}</span>
          <span>UNA {ticket.una_code || "-"}</span>
          {ticket.career_name ? <span>{ticket.career_name}</span> : null}
          <span>Vendedor {ticket.seller}</span>
          <span>{formatDate(ticket.updated_at)}</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <ObservationEditor
            busy={busy}
            observationDrafts={observationDrafts}
            setObservationDrafts={setObservationDrafts}
            ticket={ticket}
            onPatch={onPatch}
          />
        </div>
      </div>
      <div className="table-actions">
        <button
          className={`switch-button ${ticket.paid ? "on paid" : ""}`}
          disabled={busy}
          onClick={() => onPatch(ticket, { paid: !ticket.paid })}
          title="Cambiar pago"
          type="button"
        >
          <CircleDollarSign size={16} />
          {ticket.paid ? "Pagó" : "No pagó"}
        </button>
        <button
          className={`switch-button ${ticket.picked_up ? "on picked" : ""}`}
          disabled={busy}
          onClick={() => onPatch(ticket, { picked_up: !ticket.picked_up })}
          title="Cambiar entrega"
          type="button"
        >
          <PackageCheck size={16} />
          {ticket.picked_up ? "Recogió" : "No recogió"}
        </button>
      </div>
    </article>
  );
}

function ObservationEditor({
  busy,
  observationDrafts,
  setObservationDrafts,
  ticket,
  onPatch
}: {
  busy: boolean;
  observationDrafts: Record<string, string>;
  setObservationDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  ticket: Ticket;
  onPatch: (ticket: Ticket, patch: Partial<TicketDraft>) => void;
}) {
  const value = observationDrafts[ticket.id] ?? ticket.observation ?? "";

  return (
    <div className="observation-editor">
      <input
        className="input"
        value={value}
        onChange={(event) =>
          setObservationDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))
        }
        placeholder="Observación"
      />
      <button
        className="icon-button"
        disabled={busy || value === (ticket.observation ?? "")}
        onClick={() => onPatch(ticket, { observation: value })}
        title="Guardar observación"
        type="button"
      >
        {busy ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
      </button>
    </div>
  );
}

function TicketStatusBadge({ ticket }: { ticket: Ticket }) {
  const status = getTicketStatus(ticket);
  const label = getTicketStatusLabel(ticket);
  const className =
    status === "completed"
      ? "completed"
      : status === "paid_pending_pickup"
        ? "paid-pending"
        : status === "observed_case"
          ? "observed"
          : "pending";
  const Icon = status === "observed_case" ? AlertTriangle : status === "completed" ? CheckCircle2 : TicketIcon;

  return (
    <span className={`badge ${className}`}>
      <Icon size={14} />
      {label}
    </span>
  );
}

function expandTicketsByPerson(matches: Ticket[], allTickets: Ticket[]) {
  if (!matches.length) return matches;

  const personKeys = new Set(matches.map((ticket) => getPersonGroupKey(ticket)));
  const expanded = new Map(matches.map((ticket) => [ticket.id, ticket]));

  for (const ticket of allTickets) {
    if (personKeys.has(getPersonGroupKey(ticket))) {
      expanded.set(ticket.id, ticket);
    }
  }

  return [...expanded.values()].sort(sortByUpdatedAtDesc);
}

function groupTicketsByPerson(tickets: Ticket[]): QuickPersonGroup[] {
  type DraftGroup = Omit<QuickPersonGroup, "sellerNames" | "ticketNumbers"> & {
    sellerSet: Set<string>;
  };

  const groups = new Map<string, DraftGroup>();

  for (const ticket of tickets) {
    const key = getPersonGroupKey(ticket);
    const status = getTicketStatus(ticket);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        fullName: ticket.full_name,
        dni: ticket.dni ?? "",
        unaCode: ticket.una_code ?? "",
        careerName: ticket.career_name ?? "",
        sellerSet: new Set(ticket.seller ? [ticket.seller] : []),
        tickets: [ticket],
        total: 1,
        paid: ticket.paid ? 1 : 0,
        pickedUp: ticket.picked_up ? 1 : 0,
        pendingPayment: ticket.paid ? 0 : 1,
        pendingPickup: ticket.paid && !ticket.picked_up ? 1 : 0,
        observed: status === "observed_case" ? 1 : 0,
        withObservation: ticket.observation?.trim() ? 1 : 0,
        updatedAt: ticket.updated_at
      });
      continue;
    }

    existing.tickets.push(ticket);
    existing.total += 1;
    existing.paid += ticket.paid ? 1 : 0;
    existing.pickedUp += ticket.picked_up ? 1 : 0;
    existing.pendingPayment += ticket.paid ? 0 : 1;
    existing.pendingPickup += ticket.paid && !ticket.picked_up ? 1 : 0;
    existing.observed += status === "observed_case" ? 1 : 0;
    existing.withObservation += ticket.observation?.trim() ? 1 : 0;
    if (ticket.seller) existing.sellerSet.add(ticket.seller);

    if (new Date(ticket.updated_at).getTime() > new Date(existing.updatedAt).getTime()) {
      existing.fullName = ticket.full_name;
      existing.dni = ticket.dni ?? existing.dni;
      existing.unaCode = ticket.una_code ?? existing.unaCode;
      existing.careerName = ticket.career_name ?? existing.careerName;
      existing.updatedAt = ticket.updated_at;
    }
  }

  return [...groups.values()]
    .map(({ sellerSet, tickets: groupTickets, ...group }) => ({
      ...group,
      sellerNames: [...sellerSet],
      ticketNumbers: groupTickets
        .map((ticket) => ticket.ticket_number)
        .sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
      tickets: groupTickets
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function buildNameSuggestions(tickets: Ticket[], query: string, limit = 6): PersonSuggestion[] {
  const normalizedQuery = normalizeSearch(query);
  if (normalizedQuery.length < 2) return [];

  const people = new Map<string, PersonSuggestion>();

  for (const ticket of tickets) {
    if (!normalizeSearch(ticket.full_name).includes(normalizedQuery)) continue;

    const key = getPersonGroupKey(ticket);
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

function getPersonGroupKey(ticket: Ticket) {
  if (ticket.dni?.trim()) return `dni:${ticket.dni.trim()}`;
  if (ticket.una_code?.trim()) return `una:${ticket.una_code.trim()}`;
  return `name:${normalizeSearch(ticket.full_name)}`;
}

function sortTicketsForList(tickets: Ticket[], sort: TicketSort) {
  const sorted = [...tickets];
  if (sort === "updated_desc") return sorted.sort(sortByUpdatedAtDesc);
  if (sort === "ticket_asc") return sorted.sort(sortByTicketNumberAsc);
  return sorted.sort(sortByCreatedAtDesc);
}

function sortByCreatedAtDescList(tickets: Ticket[]) {
  return [...tickets].sort(sortByCreatedAtDesc);
}

function sortByCreatedAtDesc(a: Ticket, b: Ticket) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function sortByUpdatedAtDesc(a: Ticket, b: Ticket) {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

function sortByTicketNumberAsc(a: Ticket, b: Ticket) {
  return a.ticket_number.localeCompare(b.ticket_number, "es", { numeric: true, sensitivity: "base" });
}

function mergeTickets(current: Ticket[], incoming: Ticket[]) {
  const merged = new Map(current.map((ticket) => [ticket.id, ticket]));
  for (const ticket of incoming) {
    merged.set(ticket.id, ticket);
  }
  return [...merged.values()].sort(sortByCreatedAtDesc);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function parseTicketNumberQuery(value: string) {
  return new Set(
    value
      .split(/[\s,;]+/)
      .map((item) => normalizeTicketNumber(item))
      .filter(Boolean)
  );
}

function textMatches(value: string, query: string) {
  const normalizedValue = normalizeSearch(value);
  const normalizedQuery = normalizeSearch(query);
  return normalizedValue.includes(normalizedQuery);
}

function getFilterLabel(filter: TicketFilter) {
  return ticketFilters.find((item) => item.id === filter)?.label ?? "Todos";
}

function getDownloadModeLabel(mode: DownloadMode) {
  if (mode === "ticket") return "Numero de ticket";
  if (mode === "person") return "Persona";
  if (mode === "seller") return "Vendedor";
  return "Estado";
}

function getDownloadFilenamePart(mode: DownloadMode, value: string) {
  const prefix =
    mode === "ticket"
      ? "ticket"
      : mode === "person"
        ? "persona"
        : mode === "seller"
          ? "vendedor"
          : "estado";
  return `${prefix}-${value}`;
}

function exportTicketsToExcel(tickets: Ticket[], filenameBase: string) {
  const headers = [
    "Ticket",
    "Nombre completo",
    "DNI",
    "Codigo UNA",
    "Carrera",
    "Telefono",
    "Vendedor",
    "Pago",
    "Recogio",
    "Estado",
    "Observacion",
    "Registrado",
    "Actualizado"
  ];
  const rows = tickets.map((ticket) => [
    ticket.ticket_number,
    ticket.full_name,
    ticket.dni ?? "",
    ticket.una_code ?? "",
    ticket.career_name ?? "",
    ticket.phone ?? "",
    ticket.seller,
    ticket.paid ? "Si" : "No",
    ticket.picked_up ? "Si" : "No",
    getTicketStatusLabel(ticket),
    ticket.observation ?? "",
    formatDate(ticket.created_at),
    formatDate(ticket.updated_at)
  ]);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; }
    th, td { border: 1px solid #d9d9d9; padding: 7px 9px; }
    th { background: #f3f4f6; font-weight: 700; }
    td { mso-number-format: "\\@"; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtmlForExcel(cell)}</td>`).join("")}</tr>`)
        .join("")}
    </tbody>
  </table>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], {
    type: "application/vnd.ms-excel;charset=utf-8;"
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(filenameBase)}-${formatDateForFilename(new Date())}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function escapeHtmlForExcel(value: string) {
  const text = value.trim() || "-";
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return escapeHtml(protectedText);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}

function sanitizeFilename(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tickets"
  );
}

function formatDateForFilename(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

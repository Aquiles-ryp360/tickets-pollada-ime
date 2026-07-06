const unapAllowedHost = "tramites.unap.edu.pe";
const defaultTimeoutMs = 8000;

export type IdentityResult = {
  ok: boolean;
  source: "unap_tramites" | "peruapi";
  full_name: string | null;
  dni: string | null;
  una_code: string | null;
  career_code: string | null;
  career_name: string | null;
  message: string;
  status?: number;
};

export async function lookupUnapStudent(unaCode: string) {
  const normalizedCode = unaCode.trim();
  if (!/^\d{4,12}$/.test(normalizedCode)) {
    return identityFailure("unap_tramites", "Ingresa un codigo UNA valido.", {
      unaCode: normalizedCode
    });
  }

  if (!envEnabled("UNAP_LOOKUP_ENABLED", true)) {
    return identityFailure("unap_tramites", "La consulta por codigo UNA no esta habilitada.", {
      unaCode: normalizedCode
    });
  }

  try {
    const response = await safeFetch(buildUnapStudentUrl(normalizedCode), {
      host: unapAllowedHost,
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "tickets-pollada-ime/1.0 identity lookup"
      }
    });
    const payload = await response.json().catch(() => null);
    return normalizeUnapPayload(payload, normalizedCode);
  } catch {
    return identityFailure(
      "unap_tramites",
      "El servicio UNA no respondio. Puedes registrar manualmente.",
      { unaCode: normalizedCode }
    );
  }
}

export async function lookupDni(dni: string) {
  const normalizedDni = dni.trim();
  if (!/^\d{8}$/.test(normalizedDni)) {
    return identityFailure("peruapi", "Ingresa un DNI valido de 8 digitos.", {
      dni: normalizedDni,
      status: 400
    });
  }

  if (!envEnabled("DNI_LOOKUP_ENABLED", true)) {
    return identityFailure("peruapi", "La consulta por DNI no esta habilitada.", {
      dni: normalizedDni,
      status: 400
    });
  }

  const proxyUrl = process.env.DNI_PROXY_URL?.trim();
  const proxySecret = process.env.DNI_PROXY_SECRET?.trim();
  if (!proxyUrl || !proxySecret) {
    return identityFailure("peruapi", "Consulta DNI no configurada", {
      dni: normalizedDni,
      status: 500
    });
  }

  try {
    const response = await fetchDniProxy({
      dni: normalizedDni,
      proxyUrl,
      proxySecret
    });

    if (response.status === 400) {
      return identityFailure("peruapi", "Solicitud DNI invalida", {
        dni: normalizedDni,
        status: 400
      });
    }

    if (response.status === 401 || response.status === 403) {
      return identityFailure("peruapi", "Consulta DNI no autorizada", {
        dni: normalizedDni,
        status: 401
      });
    }

    if (response.status === 404) {
      return identityFailure("peruapi", "DNI no encontrado", {
        dni: normalizedDni,
        status: 404
      });
    }

    if (response.status === 429) {
      return identityFailure("peruapi", "Limite de consultas alcanzado", {
        dni: normalizedDni,
        status: 429
      });
    }

    if (response.status === 504) {
      return identityFailure("peruapi", "Tiempo de espera agotado", {
        dni: normalizedDni,
        status: 504
      });
    }

    if (!response.ok) {
      return identityFailure("peruapi", "Servicio DNI no disponible", {
        dni: normalizedDni,
        status: response.status >= 500 ? 503 : 400
      });
    }

    const payload = await response.json().catch(() => null);
    if (!payload) {
      return identityFailure("peruapi", "Servicio DNI no disponible", {
        dni: normalizedDni,
        status: 503
      });
    }

    return normalizeDniProxyPayload(payload, normalizedDni);
  } catch (error) {
    const status = error instanceof Error && error.name === "AbortError" ? 504 : 503;
    return identityFailure("peruapi", status === 504 ? "Tiempo de espera agotado" : "Servicio DNI no disponible", {
      dni: normalizedDni,
      status
    });
  }
}

function buildUnapStudentUrl(unaCode: string) {
  const baseUrl = new URL(process.env.UNAP_LOOKUP_BASE_URL ?? "https://tramites.unap.edu.pe");
  if (baseUrl.protocol !== "https:" || baseUrl.hostname !== unapAllowedHost) {
    throw new Error("UNAP lookup base URL is not allowed");
  }

  const career = process.env.UNAP_DEFAULT_CAREER_CODE?.trim() || "36";
  const url = new URL(`/tramite/estudiante/${encodeURIComponent(unaCode)}`, baseUrl);
  url.searchParams.set("carrera", career);
  return url;
}

async function safeFetch(
  url: URL,
  {
    host,
    headers
  }: {
    host: string;
    headers: Record<string, string>;
  }
) {
  if (url.protocol !== "https:" || url.hostname !== host) {
    throw new Error("Lookup URL is not allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), positiveNumber(process.env.LOOKUP_TIMEOUT_MS, defaultTimeoutMs));

  try {
    return await fetch(url, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      signal: controller.signal,
      headers
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDniProxy({
  dni,
  proxyUrl,
  proxySecret
}: {
  dni: string;
  proxyUrl: string;
  proxySecret: string;
}) {
  const url = buildDniProxyUrl(proxyUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), positiveNumber(process.env.DNI_PROXY_TIMEOUT_MS, defaultTimeoutMs));

  try {
    return await fetch(url, {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Proxy-Secret": proxySecret,
        "User-Agent": "tickets-pollada-ime/1.0 dni proxy"
      },
      body: JSON.stringify({ dni })
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildDniProxyUrl(value: string) {
  const normalizedBase = value.endsWith("/") ? value : `${value}/`;
  const url = new URL("dni", normalizedBase);
  if (url.protocol !== "https:") {
    throw new Error("DNI proxy URL is not allowed");
  }
  return url;
}

function normalizeUnapPayload(payload: unknown, unaCode: string): IdentityResult {
  const root = isRecord(payload) ? payload : null;
  const data = isRecord(root?.data) ? root.data : null;
  const student = isRecord(data?.estudiante) ? data.estudiante : isRecord(root?.estudiante) ? root.estudiante : null;

  const fullName = stringField(student, "nombre") ?? stringField(student, "nombres");
  const dni = stringField(student, "dni");
  const careerCode =
    stringField(student, "codigo_carrera") ?? process.env.UNAP_DEFAULT_CAREER_CODE?.trim() ?? "36";
  const careerName =
    stringField(student, "escuela") ??
    stringField(student, "carrera") ??
    process.env.UNAP_DEFAULT_CAREER_NAME?.trim() ??
    "INGENIERÍA MECÁNICA ELÉCTRICA";

  if (!fullName) {
    return identityFailure("unap_tramites", "No se encontro estudiante con ese codigo UNA.", {
      unaCode
    });
  }

  return {
    ok: true,
    source: "unap_tramites",
    full_name: fullName,
    dni,
    una_code: unaCode,
    career_code: careerCode,
    career_name: careerName,
    message: "Datos encontrados. Verifica antes de registrar."
  };
}

function normalizeDniProxyPayload(payload: unknown, dni: string): IdentityResult {
  const root = isRecord(payload) ? payload : null;
  const data = firstRecord(root?.data, root?.result, root?.persona, root);
  const nombres =
    stringField(data, "nombres") ??
    stringField(data, "nombres_completos") ??
    stringField(data, "names");
  const apellidoPaterno =
    stringField(data, "apellido_paterno") ??
    stringField(data, "apellidoPaterno") ??
    stringField(data, "ape_paterno") ??
    stringField(data, "first_surname");
  const apellidoMaterno =
    stringField(data, "apellido_materno") ??
    stringField(data, "apellidoMaterno") ??
    stringField(data, "ape_materno") ??
    stringField(data, "second_surname");
  const fullName =
    stringField(data, "cliente") ??
    stringField(data, "nombre_completo") ??
    stringField(data, "nombreCompleto") ??
    stringField(data, "full_name") ??
    joinNameParts(nombres, apellidoPaterno, apellidoMaterno);
  const responseDni = stringField(data, "dni") ?? dni;

  if (!root?.ok || !fullName || responseDni !== dni) {
    return identityFailure("peruapi", "DNI no encontrado", {
      dni,
      status: 404
    });
  }

  return {
    ok: true,
    source: "peruapi",
    full_name: fullName,
    dni: responseDni,
    una_code: null,
    career_code: null,
    career_name: null,
    message: "Datos encontrados. Verifica antes de registrar."
  };
}

function identityFailure(
  source: IdentityResult["source"],
  message: string,
  {
    unaCode = null,
    dni = null,
    status
  }: {
    unaCode?: string | null;
    dni?: string | null;
    status?: number;
  } = {}
): IdentityResult {
  return {
    ok: false,
    source,
    full_name: null,
    dni,
    una_code: unaCode,
    career_code: null,
    career_name: null,
    message,
    status
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstRecord(...values: unknown[]) {
  return values.find(isRecord) ?? null;
}

function stringField(source: Record<string, unknown> | null, field: string) {
  const value = source?.[field];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function joinNameParts(
  nombres: string | null | undefined,
  apellidoPaterno: string | null | undefined,
  apellidoMaterno: string | null | undefined
) {
  const fullName = [nombres, apellidoPaterno, apellidoMaterno].filter(Boolean).join(" ").trim();
  return fullName || null;
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envEnabled(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return !["false", "0", "no"].includes(value.trim().toLowerCase());
}

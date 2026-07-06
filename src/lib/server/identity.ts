const unapAllowedHost = "tramites.unap.edu.pe";
const peruApiAllowedHost = "peruapi.com";
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
};

export async function lookupUnapStudent(unaCode: string) {
  const normalizedCode = unaCode.trim();
  if (!/^\d{4,12}$/.test(normalizedCode)) {
    return identityFailure("unap_tramites", "Ingresa un codigo UNA valido.", normalizedCode);
  }

  if (!envEnabled("UNAP_LOOKUP_ENABLED", true)) {
    return identityFailure("unap_tramites", "La consulta por codigo UNA no esta habilitada.", normalizedCode);
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
      normalizedCode
    );
  }
}

export async function lookupDni(dni: string) {
  const normalizedDni = dni.trim();
  if (!/^\d{8}$/.test(normalizedDni)) {
    return identityFailure("peruapi", "Ingresa un DNI valido de 8 digitos.", null, normalizedDni);
  }

  if (!envEnabled("DNI_LOOKUP_ENABLED", true)) {
    return identityFailure("peruapi", "La consulta por DNI no esta habilitada.", null, normalizedDni);
  }

  const apiKey = process.env.PERUAPI_API_KEY?.trim() || process.env.API_Key_PERUAPI?.trim();
  if (!apiKey) {
    return identityFailure("peruapi", "PERUAPI_API_KEY no configurado.", null, normalizedDni);
  }

  try {
    const response = await safeFetch(buildPeruApiDniUrl(normalizedDni), {
      host: peruApiAllowedHost,
      headers: {
        Accept: "application/json",
        "X-API-KEY": apiKey,
        "User-Agent": "tickets-pollada-ime/1.0 identity lookup"
      }
    });

    if (response.status === 401 || response.status === 403) {
      return identityFailure("peruapi", "API Key invalida o sin permisos.", null, normalizedDni);
    }

    if (response.status === 404) {
      return identityFailure("peruapi", "No se encontraron datos para el DNI ingresado.", null, normalizedDni);
    }

    const payload = await response.json().catch(() => null);
    return normalizePeruApiPayload(payload, normalizedDni);
  } catch {
    return identityFailure(
      "peruapi",
      "El servicio de consulta DNI no respondio. Puedes registrar manualmente.",
      null,
      normalizedDni
    );
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

function buildPeruApiDniUrl(dni: string) {
  const baseUrl = new URL(process.env.PERUAPI_BASE_URL ?? "https://peruapi.com");
  if (baseUrl.protocol !== "https:" || baseUrl.hostname !== peruApiAllowedHost) {
    throw new Error("Peru API base URL is not allowed");
  }

  return new URL(`/api/dni/${encodeURIComponent(dni)}`, baseUrl);
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
    return identityFailure("unap_tramites", "No se encontro estudiante con ese codigo UNA.", unaCode);
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

function normalizePeruApiPayload(payload: unknown, dni: string): IdentityResult {
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
    stringField(data, "nombre_completo") ??
    stringField(data, "nombreCompleto") ??
    stringField(data, "full_name") ??
    joinNameParts(nombres, apellidoPaterno, apellidoMaterno);

  if (!fullName) {
    return identityFailure("peruapi", "No se encontraron datos para el DNI ingresado.", null, dni);
  }

  return {
    ok: true,
    source: "peruapi",
    full_name: fullName,
    dni,
    una_code: null,
    career_code: null,
    career_name: null,
    message: "Datos encontrados. Verifica antes de registrar."
  };
}

function identityFailure(
  source: IdentityResult["source"],
  message: string,
  unaCode: string | null = null,
  dni: string | null = null
): IdentityResult {
  return {
    ok: false,
    source,
    full_name: null,
    dni,
    una_code: unaCode,
    career_code: null,
    career_name: null,
    message
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

import { NextResponse } from "next/server";

export function requireAccess(request: Request) {
  const pin = process.env.APP_ACCESS_PIN?.trim();
  if (!pin) return null;

  const provided = request.headers.get("x-app-pin")?.trim();
  if (provided === pin) return null;

  return NextResponse.json(
    {
      ok: false,
      code: "pin_required",
      message: "Ingresa el PIN de acceso."
    },
    { status: 401 }
  );
}

export function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

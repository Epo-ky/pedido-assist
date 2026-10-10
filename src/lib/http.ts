import { NextResponse } from "next/server";

// "Tente de novo em N minuto(s)", arredondando para cima.
export function esperaEmMinutos(segundos: number): string {
  return `${Math.ceil(segundos / 60)} minuto(s)`;
}

export function tooManyRequests(mensagem: string, retryAfterSeconds: number) {
  return NextResponse.json(
    { erro: mensagem },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

// IP de quem fez a requisição, para limites por endereço.
// Atrás de um proxy (como a Vercel), o IP real vem no x-forwarded-for, que lista os endereços da cadeia:
// o primeiro é o do cliente original. Fora de um proxy confiável, esse cabeçalho pode ser forjado,
// então o limite por IP é um reforço e nunca a única proteção.
export function getClientIp(request: Request): string {
  const encaminhado = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return encaminhado || request.headers.get("x-real-ip")?.trim() || "desconhecido";
}

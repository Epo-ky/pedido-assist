import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { limitesUso } from "@/lib/db/schema";

export type RateLimitRule = {
  // Quantas ações são permitidas por janela.
  max: number;
  janelaSegundos: number;
};

export type RateLimitResult = {
  allowed: boolean;
  contagem: number;
  // Quantos segundos faltam para a janela atual acabar (para o cabeçalho Retry-After).
  retryAfterSeconds: number;
};

// Janela fixa: o tempo é dividido em blocos (ex.: de 15 em 15 minutos) e cada bloco tem o seu contador.
// Limite conhecido: logo antes e logo depois da virada de bloco cabem até 2x o máximo. Aceitável aqui.
//
// O INSERT ... ON CONFLICT DO UPDATE é atômico: duas requisições simultâneas nunca leem o mesmo valor
// e passam as duas, ao contrário de "ler o contador, somar 1 e gravar".
export async function consumeRateLimit(
  chave: string,
  regra: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const janelaMs = regra.janelaSegundos * 1000;
  const inicioMs = Math.floor(now.getTime() / janelaMs) * janelaMs;

  const [linha] = await db
    .insert(limitesUso)
    .values({ chave, janelaInicio: new Date(inicioMs), contagem: 1 })
    .onConflictDoUpdate({
      target: [limitesUso.chave, limitesUso.janelaInicio],
      set: { contagem: sql`${limitesUso.contagem} + 1` },
    })
    .returning({ contagem: limitesUso.contagem });

  return {
    allowed: linha.contagem <= regra.max,
    contagem: linha.contagem,
    retryAfterSeconds: Math.max(1, Math.ceil((inicioMs + janelaMs - now.getTime()) / 1000)),
  };
}

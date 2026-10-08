import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { pedidos, statusPedido } from "@/lib/db/schema";

// Máximo de linhas devolvidas ao modelo (evita estourar tokens e vazar volume).
export const MAX_ORDERS = 20;

// Argumentos que o MODELO pode enviar. Não há cliente_id aqui de propósito:
// .strict() faz o zod recusar qualquer campo extra, inclusive um cliente_id forjado.
export const listOrdersArgs = z
  .object({
    status: z.enum(statusPedido.enumValues).optional(),
    desde: z.iso.date().optional(),
    ate: z.iso.date().optional(),
  })
  .strict();

export type ListOrdersArgs = z.infer<typeof listOrdersArgs>;

// clienteId vem da SESSÃO (getSession) e é um parâmetro à parte, nunca parte dos args do modelo.
export async function listOrders(clienteId: number, rawArgs: unknown) {
  const args = listOrdersArgs.parse(rawArgs);

  const filtros = [eq(pedidos.clienteId, clienteId)];
  if (args.status) filtros.push(eq(pedidos.status, args.status));
  if (args.desde) filtros.push(gte(pedidos.criadoEm, sql`${args.desde}::date`));
  // "ate" é inclusivo: vale até o fim desse dia.
  if (args.ate) filtros.push(lt(pedidos.criadoEm, sql`(${args.ate}::date + 1)`));

  return db
    .select({
      id: pedidos.id,
      status: pedidos.status,
      total: pedidos.total,
      criadoEm: pedidos.criadoEm,
    })
    .from(pedidos)
    .where(and(...filtros))
    .orderBy(desc(pedidos.criadoEm))
    .limit(MAX_ORDERS);
}

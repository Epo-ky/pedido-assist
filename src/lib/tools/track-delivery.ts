import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { entregas, pedidos } from "@/lib/db/schema";

// Sem cliente_id aqui de propósito (ver list-orders.ts): .strict() recusa campos extras.
export const trackDeliveryArgs = z
  .object({ pedido_id: z.number().int().positive() })
  .strict();

// clienteId vem da SESSÃO. Devolve null para pedido inexistente ou de outro cliente.
// Pedido do cliente sem entrega (ex.: pendente, cancelado) devolve entrega: null,
// para o assistente poder dizer "ainda não há entrega" sem inventar nada.
export async function trackDelivery(clienteId: number, rawArgs: unknown) {
  const args = trackDeliveryArgs.parse(rawArgs);

  const [linha] = await db
    .select({
      pedidoId: pedidos.id,
      status: pedidos.status,
      transportadora: entregas.transportadora,
      codigoRastreio: entregas.codigoRastreio,
      previsao: entregas.previsao,
      atualizadoEm: entregas.atualizadoEm,
    })
    .from(pedidos)
    .leftJoin(entregas, eq(entregas.pedidoId, pedidos.id))
    .where(
      and(eq(pedidos.id, args.pedido_id), eq(pedidos.clienteId, clienteId)),
    );

  if (!linha) return null;

  const { pedidoId, status, transportadora, codigoRastreio, previsao, atualizadoEm } =
    linha;
  // No LEFT JOIN, sem entrega todas as colunas dela vêm null.
  if (
    transportadora === null ||
    codigoRastreio === null ||
    previsao === null ||
    atualizadoEm === null
  ) {
    return { pedidoId, status, entrega: null };
  }

  // Calculado no servidor para o modelo não ter que comparar datas (e errar).
  // "previsao" é uma data AAAA-MM-DD; comparar as strings equivale a comparar as datas.
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasada =
    status !== "entregue" && status !== "cancelado" && previsao < hoje;

  return {
    pedidoId,
    status,
    entrega: { transportadora, codigoRastreio, previsao, atualizadoEm, atrasada },
  };
}

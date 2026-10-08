import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { itensPedido, pedidos, produtos } from "@/lib/db/schema";

// Sem cliente_id aqui de propósito (ver list-orders.ts): .strict() recusa campos extras.
export const orderDetailArgs = z
  .object({ pedido_id: z.number().int().positive() })
  .strict();

// clienteId vem da SESSÃO. Devolve null tanto para pedido inexistente quanto para pedido
// de outro cliente: assim a resposta não revela se o id existe na conta de outra pessoa.
export async function orderDetail(clienteId: number, rawArgs: unknown) {
  const args = orderDetailArgs.parse(rawArgs);

  const [pedido] = await db
    .select({
      id: pedidos.id,
      status: pedidos.status,
      total: pedidos.total,
      criadoEm: pedidos.criadoEm,
    })
    .from(pedidos)
    .where(
      and(eq(pedidos.id, args.pedido_id), eq(pedidos.clienteId, clienteId)),
    );

  if (!pedido) return null;

  // Os itens só são buscados depois de confirmar que o pedido é do cliente.
  const itens = await db
    .select({
      produto: produtos.nome,
      quantidade: itensPedido.quantidade,
      precoUnitario: itensPedido.precoUnitario,
    })
    .from(itensPedido)
    .innerJoin(produtos, eq(produtos.id, itensPedido.produtoId))
    .where(eq(itensPedido.pedidoId, pedido.id))
    .orderBy(asc(itensPedido.id));

  return { ...pedido, itens };
}

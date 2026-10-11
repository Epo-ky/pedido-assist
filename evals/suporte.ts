import { eq, ne } from "drizzle-orm";
import type { ForbiddenData } from "../src/lib/ai/leak-check";
import { db } from "../src/lib/db";
import { clientes, entregas, pedidos } from "../src/lib/db/schema";

// Ajudantes compartilhados pelos dois scripts que usam o modelo de verdade: as evals (npm run evals) e a bateria de
// ataques (npm run security:check).

// Tudo o que pertence a OUTROS clientes e nunca pode chegar ao modelo nem à resposta.
export async function dadosDeOutrosClientes(clienteId: number): Promise<ForbiddenData> {
  const pedidosAlheios = await db
    .select({ id: pedidos.id })
    .from(pedidos)
    .where(ne(pedidos.clienteId, clienteId));
  const rastreios = await db
    .select({ codigo: entregas.codigoRastreio })
    .from(entregas)
    .innerJoin(pedidos, eq(pedidos.id, entregas.pedidoId))
    .where(ne(pedidos.clienteId, clienteId));
  const emails = await db
    .select({ email: clientes.email })
    .from(clientes)
    .where(ne(clientes.id, clienteId));

  return {
    pedidoIds: new Set(pedidosAlheios.map((p) => p.id)),
    tokens: [...rastreios.map((r) => r.codigo), ...emails.map((e) => e.email)],
  };
}

// Foto do status de TODOS os pedidos: depois de uma conversa, nenhum pode ter mudado. O modelo não cancela nada;
// só o clique do cliente cancela, e estes scripts não clicam.
export async function statusDosPedidos(): Promise<Map<number, string>> {
  const linhas = await db.select({ id: pedidos.id, status: pedidos.status }).from(pedidos);
  return new Map(linhas.map((linha) => [linha.id, linha.status]));
}

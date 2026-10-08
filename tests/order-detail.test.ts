import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { clientes } from "@/lib/db/schema";
import { listOrders } from "@/lib/tools/list-orders";
import { orderDetail } from "@/lib/tools/order-detail";

let anaId: number;
let brunoId: number;

async function idPorEmail(email: string) {
  const [linha] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(eq(clientes.email, email));
  return linha.id;
}

beforeAll(async () => {
  anaId = await idPorEmail("ana@exemplo.com");
  brunoId = await idPorEmail("bruno@exemplo.com");
});

afterAll(async () => {
  await pool.end();
});

describe("detalhe_pedido", () => {
  it("devolve o pedido com os itens quando é do cliente da sessão", async () => {
    const [primeiro] = await listOrders(anaId, {});
    const detalhe = await orderDetail(anaId, { pedido_id: primeiro.id });

    expect(detalhe?.id).toBe(primeiro.id);
    expect(detalhe?.itens.length).toBeGreaterThan(0);
  });

  it("cliente A não consegue ver pedido do cliente B (id alheio)", async () => {
    const [pedidoDoBruno] = await listOrders(brunoId, {});

    // Prova de que o pedido existe e é do Bruno...
    expect(await orderDetail(brunoId, { pedido_id: pedidoDoBruno.id })).not.toBeNull();
    // ...e de que a Ana, passando o id dele, não recebe nada.
    expect(await orderDetail(anaId, { pedido_id: pedidoDoBruno.id })).toBeNull();
  });

  it("devolve null para pedido inexistente, igual ao pedido alheio", async () => {
    expect(await orderDetail(anaId, { pedido_id: 999999 })).toBeNull();
  });

  it("recusa cliente_id forjado e pedido_id inválido", async () => {
    await expect(
      orderDetail(anaId, { pedido_id: 1, cliente_id: brunoId }),
    ).rejects.toThrow();
    await expect(orderDetail(anaId, { pedido_id: "1 OR 1=1" })).rejects.toThrow();
    await expect(orderDetail(anaId, { pedido_id: -1 })).rejects.toThrow();
    await expect(orderDetail(anaId, {})).rejects.toThrow();
  });
});

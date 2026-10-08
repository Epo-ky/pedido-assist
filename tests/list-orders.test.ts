import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { clientes, pedidos } from "@/lib/db/schema";
import { MAX_ORDERS, listOrders } from "@/lib/tools/list-orders";

// Testes de integração: usam o Postgres do .env já com o seed aplicado (npm run db:seed).
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

describe("listar_pedidos", () => {
  it("devolve só pedidos do cliente da sessão", async () => {
    const resultado = await listOrders(anaId, {});
    const idsDoBanco = (
      await db.select({ id: pedidos.id }).from(pedidos).where(eq(pedidos.clienteId, anaId))
    ).map((p) => p.id);

    expect(resultado.length).toBeGreaterThan(0);
    for (const pedido of resultado) expect(idsDoBanco).toContain(pedido.id);
  });

  it("cliente A não vê pedidos do cliente B", async () => {
    const deAna = (await listOrders(anaId, {})).map((p) => p.id);
    const deBruno = (await listOrders(brunoId, {})).map((p) => p.id);

    expect(deBruno.length).toBeGreaterThan(0);
    expect(deAna.filter((id) => deBruno.includes(id))).toEqual([]);
  });

  it("recusa um cliente_id forjado nos argumentos do modelo", async () => {
    await expect(listOrders(anaId, { cliente_id: brunoId })).rejects.toThrow();
    await expect(listOrders(anaId, { clienteId: brunoId })).rejects.toThrow();
  });

  it("filtra por status", async () => {
    const resultado = await listOrders(anaId, { status: "cancelado" });

    for (const pedido of resultado) expect(pedido.status).toBe("cancelado");
  });

  it("recusa status inválido e data mal formatada", async () => {
    await expect(listOrders(anaId, { status: "perdido" })).rejects.toThrow();
    await expect(listOrders(anaId, { desde: "ontem" })).rejects.toThrow();
  });

  it("respeita o período e nunca passa do limite de linhas", async () => {
    const futuro = await listOrders(anaId, { desde: "2999-01-01" });
    const tudo = await listOrders(anaId, { desde: "2000-01-01", ate: "2999-12-31" });

    expect(futuro).toEqual([]);
    expect(tudo.length).toBeLessThanOrEqual(MAX_ORDERS);
  });
});

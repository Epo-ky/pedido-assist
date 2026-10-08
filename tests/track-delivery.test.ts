import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { clientes } from "@/lib/db/schema";
import { listOrders } from "@/lib/tools/list-orders";
import { trackDelivery } from "@/lib/tools/track-delivery";

let anaId: number;
let brunoId: number;

async function idPorEmail(email: string) {
  const [linha] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(eq(clientes.email, email));
  return linha.id;
}

// Procura, entre os pedidos do cliente, o primeiro que tem (ou não tem) entrega.
async function pedidoComEntrega(clienteId: number, comEntrega: boolean) {
  for (const { id } of await listOrders(clienteId, {})) {
    const rastreio = await trackDelivery(clienteId, { pedido_id: id });
    if ((rastreio?.entrega !== null) === comEntrega) return rastreio!;
  }
  throw new Error("O seed não tem o pedido esperado para este teste.");
}

beforeAll(async () => {
  anaId = await idPorEmail("ana@exemplo.com");
  brunoId = await idPorEmail("bruno@exemplo.com");
});

afterAll(async () => {
  await pool.end();
});

describe("rastrear_entrega", () => {
  it("devolve transportadora, código e previsão de um pedido com entrega", async () => {
    const rastreio = await pedidoComEntrega(brunoId, true);

    expect(rastreio.entrega?.transportadora).toBeTruthy();
    expect(rastreio.entrega?.codigoRastreio).toBeTruthy();
    expect(rastreio.entrega?.previsao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("pedido do cliente sem entrega devolve entrega: null, e não null", async () => {
    const semEntrega = await pedidoComEntrega(brunoId, false);

    expect(semEntrega).not.toBeNull();
    expect(semEntrega.entrega).toBeNull();
  });

  it("cliente A não consegue rastrear entrega do cliente B (id alheio)", async () => {
    const doBruno = await pedidoComEntrega(brunoId, true);

    expect(await trackDelivery(brunoId, { pedido_id: doBruno.pedidoId })).not.toBeNull();
    expect(await trackDelivery(anaId, { pedido_id: doBruno.pedidoId })).toBeNull();
  });

  it("devolve null para pedido inexistente", async () => {
    expect(await trackDelivery(anaId, { pedido_id: 999999 })).toBeNull();
  });

  it("marca como atrasada só entrega com previsão vencida e pedido não finalizado", async () => {
    let atrasadas = 0;
    for (const clienteId of [anaId, brunoId]) {
      for (const { id } of await listOrders(clienteId, {})) {
        const r = await trackDelivery(clienteId, { pedido_id: id });
        if (r?.entrega?.atrasada) {
          atrasadas++;
          expect(["entregue", "cancelado"]).not.toContain(r.status);
        }
      }
    }
    // O seed inclui entregas atrasadas de propósito.
    expect(atrasadas).toBeGreaterThan(0);
  });

  it("recusa cliente_id forjado e pedido_id inválido", async () => {
    await expect(
      trackDelivery(anaId, { pedido_id: 1, cliente_id: brunoId }),
    ).rejects.toThrow();
    await expect(trackDelivery(anaId, { pedido_id: "1 OR 1=1" })).rejects.toThrow();
    await expect(trackDelivery(anaId, {})).rejects.toThrow();
  });
});

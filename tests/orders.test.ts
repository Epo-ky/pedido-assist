import { eq, inArray, like } from "drizzle-orm";
import { ZodError } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { clientes, itensPedido, pedidos, produtos } from "@/lib/db/schema";
import { createOrder, ProdutoInexistenteError } from "@/lib/orders";

// Clientes só destes testes (apagados no fim, com os pedidos que criarem).
const PREFIXO = "teste.pedidos.";
let aId: number;
let bId: number;
let produtoBarato: { id: number; preco: string }; // Cabo HDMI, R$ 29,90
let produtoCaro: { id: number; preco: string };

// Só os itens dos pedidos DESTE cliente de teste. Contar a tabela inteira seria instável: o Vitest roda vários arquivos
// de teste ao mesmo tempo no mesmo banco, e outro arquivo pode inserir itens no meio da contagem.
async function itensDe(clienteId: number) {
  return db
    .select({ id: itensPedido.id })
    .from(itensPedido)
    .innerJoin(pedidos, eq(pedidos.id, itensPedido.pedidoId))
    .where(eq(pedidos.clienteId, clienteId));
}

async function pedidosDe(clienteId: number) {
  return db.select().from(pedidos).where(eq(pedidos.clienteId, clienteId));
}

beforeAll(async () => {
  const criados = await db
    .insert(clientes)
    .values([
      { nome: "Teste A", email: `${PREFIXO}a.${Date.now()}@exemplo.com`, senhaHash: "x" },
      { nome: "Teste B", email: `${PREFIXO}b.${Date.now()}@exemplo.com`, senhaHash: "x" },
    ])
    .returning({ id: clientes.id });
  [aId, bId] = criados.map((c) => c.id);

  const todos = await db.select({ id: produtos.id, preco: produtos.preco }).from(produtos);
  const ordenados = [...todos].sort((x, y) => Number(x.preco) - Number(y.preco));
  produtoBarato = ordenados[0];
  produtoCaro = ordenados[ordenados.length - 1];
});

afterAll(async () => {
  const meus = await db.select({ id: pedidos.id }).from(pedidos).where(inArray(pedidos.clienteId, [aId, bId]));
  if (meus.length) await db.delete(itensPedido).where(inArray(itensPedido.pedidoId, meus.map((p) => p.id)));
  await db.delete(pedidos).where(inArray(pedidos.clienteId, [aId, bId]));
  await db.delete(clientes).where(like(clientes.email, `${PREFIXO}%`));
  await pool.end();
});

describe("createOrder", () => {
  it("cria um pedido PENDENTE para o cliente, com total e preços vindos do banco", async () => {
    const criado = await createOrder(aId, { itens: [{ produtoId: produtoCaro.id, quantidade: 2 }] });

    const [gravado] = await db.select().from(pedidos).where(eq(pedidos.id, criado.id));
    expect(gravado.clienteId).toBe(aId);
    expect(gravado.status).toBe("pendente");
    expect(gravado.total).toBe((Number(produtoCaro.preco) * 2).toFixed(2));
    expect(criado.total).toBe(gravado.total);

    const itens = await db.select().from(itensPedido).where(eq(itensPedido.pedidoId, criado.id));
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ produtoId: produtoCaro.id, quantidade: 2, precoUnitario: produtoCaro.preco });
  });

  it("calcula o total exato (3 x R$ 29,90 = R$ 89,70)", async () => {
    // Em número flutuante puro, 29.9 * 3 = 89.69999999999999. A soma em centavos inteiros evita isso por
    // construção; este teste confere o resultado exato, mas não distingue sozinho as duas formas de somar.
    const criado = await createOrder(aId, { itens: [{ produtoId: produtoBarato.id, quantidade: 3 }] });

    expect(produtoBarato.preco).toBe("29.90");
    expect(criado.total).toBe("89.70");
  });

  it("soma vários produtos diferentes no mesmo pedido", async () => {
    const criado = await createOrder(aId, {
      itens: [
        { produtoId: produtoCaro.id, quantidade: 1 },
        { produtoId: produtoBarato.id, quantidade: 2 },
      ],
    });

    const esperado = (Number(produtoCaro.preco) * 100 + Number(produtoBarato.preco) * 200) / 100;
    expect(criado.total).toBe(esperado.toFixed(2));
    expect(criado.itens).toHaveLength(2);
  });

  it("ignora um preço, total, status ou cliente enviados junto com os itens", async () => {
    const criado = await createOrder(aId, {
      itens: [{ produtoId: produtoCaro.id, quantidade: 1, preco: "0.01", precoUnitario: "0.01", clienteId: bId }],
      total: "0.01",
      status: "pago",
      clienteId: bId,
    });

    const [gravado] = await db.select().from(pedidos).where(eq(pedidos.id, criado.id));
    expect(gravado.total).toBe(produtoCaro.preco);
    expect(gravado.status).toBe("pendente");
    expect(gravado.clienteId).toBe(aId);
  });

  it("o pedido fica só na conta de quem comprou", async () => {
    const antesDaB = (await pedidosDe(bId)).length;

    await createOrder(aId, { itens: [{ produtoId: produtoBarato.id, quantidade: 1 }] });

    expect((await pedidosDe(bId)).length).toBe(antesDaB);
  });

  it("produto inexistente falha e não cria pedido nem itens", async () => {
    // O produto inexistente é detectado ANTES de gravar qualquer coisa. A transação protege contra falha no meio
    // das gravações (pedido gravado e itens não), o que não dá para simular aqui sem truque.
    const pedidosAntes = (await pedidosDe(aId)).length;
    const itensAntes = (await itensDe(aId)).length;

    await expect(
      createOrder(aId, {
        itens: [
          { produtoId: produtoBarato.id, quantidade: 1 },
          { produtoId: 999999, quantidade: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(ProdutoInexistenteError);

    expect((await pedidosDe(aId)).length).toBe(pedidosAntes);
    expect((await itensDe(aId)).length).toBe(itensAntes);
  });

  it("recusa quantidade fora de 1 a 5, produto repetido, lista vazia e tipos errados", async () => {
    const invalidos = [
      { itens: [{ produtoId: produtoBarato.id, quantidade: 0 }] },
      { itens: [{ produtoId: produtoBarato.id, quantidade: 6 }] },
      { itens: [{ produtoId: produtoBarato.id, quantidade: -1 }] },
      { itens: [{ produtoId: produtoBarato.id, quantidade: 1.5 }] },
      { itens: [{ produtoId: produtoBarato.id, quantidade: "2" }] },
      { itens: [{ produtoId: 0, quantidade: 1 }] },
      { itens: [] },
      { itens: [{ produtoId: produtoBarato.id, quantidade: 1 }, { produtoId: produtoBarato.id, quantidade: 1 }] },
      {},
      null,
    ];

    for (const entrada of invalidos) {
      await expect(createOrder(aId, entrada)).rejects.toBeInstanceOf(ZodError);
    }
  });
});

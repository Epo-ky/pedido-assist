import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getSession } from "@/lib/auth/session";
import { db, pool } from "@/lib/db";
import { clientes, itensPedido, pedidos, produtos } from "@/lib/db/schema";
import { consumeRateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/pedidos/route";

// Sem cookies reais e sem contador real. O banco é o real, com clientes temporários apagados no fim.
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));

const getSessionMock = vi.mocked(getSession);
const consumeMock = vi.mocked(consumeRateLimit);

const PREFIXO = "teste.rota.pedidos.";
let compradorId: number;
let outroId: number;
let produtoId: number;
let precoDoProduto: string;

function requisicao(corpo: unknown) {
  return new Request("http://localhost/api/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

async function pedidosDe(clienteId: number) {
  return db.select().from(pedidos).where(eq(pedidos.clienteId, clienteId));
}

beforeAll(async () => {
  const criados = await db
    .insert(clientes)
    .values([
      { nome: "Comprador", email: `${PREFIXO}c.${Date.now()}@exemplo.com`, senhaHash: "x" },
      { nome: "Outro", email: `${PREFIXO}o.${Date.now()}@exemplo.com`, senhaHash: "x" },
    ])
    .returning({ id: clientes.id });
  [compradorId, outroId] = criados.map((c) => c.id);

  const [produto] = await db.select({ id: produtos.id, preco: produtos.preco }).from(produtos).limit(1);
  produtoId = produto.id;
  precoDoProduto = produto.preco;
});

beforeEach(() => {
  vi.resetAllMocks();
  consumeMock.mockResolvedValue({ allowed: true, contagem: 1, retryAfterSeconds: 3600 });
  getSessionMock.mockResolvedValue({ clienteId: compradorId });
});

afterAll(async () => {
  const meus = await db.select({ id: pedidos.id }).from(pedidos).where(inArray(pedidos.clienteId, [compradorId, outroId]));
  if (meus.length) await db.delete(itensPedido).where(inArray(itensPedido.pedidoId, meus.map((p) => p.id)));
  await db.delete(pedidos).where(inArray(pedidos.clienteId, [compradorId, outroId]));
  await db.delete(clientes).where(like(clientes.email, `${PREFIXO}%`));
  await pool.end();
});

describe("POST /api/pedidos", () => {
  it("recusa com 401 quem não está logado, sem gastar limite nem criar pedido", async () => {
    getSessionMock.mockResolvedValue(null);

    const resposta = await POST(requisicao({ itens: [{ produtoId, quantidade: 1 }] }));

    expect(resposta.status).toBe(401);
    expect(consumeMock).not.toHaveBeenCalled();
    expect(await pedidosDe(compradorId)).toHaveLength(0);
  });

  it("cria o pedido e devolve 201 com o total calculado no servidor", async () => {
    const resposta = await POST(requisicao({ itens: [{ produtoId, quantidade: 2 }] }));
    const corpo = await resposta.json();

    expect(resposta.status).toBe(201);
    expect(corpo.pedido.total).toBe((Number(precoDoProduto) * 2).toFixed(2));
    expect(corpo.pedido.itens[0]).toMatchObject({ quantidade: 2, precoUnitario: precoDoProduto });
    expect(await pedidosDe(compradorId)).toHaveLength(1);
  });

  it("compra para o cliente da SESSÃO, mesmo que o corpo mande outro clienteId", async () => {
    const antes = (await pedidosDe(outroId)).length;

    const resposta = await POST(requisicao({ itens: [{ produtoId, quantidade: 1 }], clienteId: outroId }));

    expect(resposta.status).toBe(201);
    expect((await pedidosDe(outroId)).length).toBe(antes);
    expect(consumeMock.mock.calls[0][0]).toBe(`compra:cliente:${compradorId}`);
  });

  it("ignora preço, total e status forjados no corpo", async () => {
    const resposta = await POST(
      requisicao({ itens: [{ produtoId, quantidade: 1, preco: "0.01" }], total: "0.01", status: "pago" }),
    );
    const { pedido } = await resposta.json();

    const [gravado] = await db.select().from(pedidos).where(eq(pedidos.id, pedido.id));
    expect(gravado.total).toBe(precoDoProduto);
    expect(gravado.status).toBe("pendente");
  });

  it("recusa com 400 quantidade inválida, lista vazia e corpo quebrado, sem gastar limite", async () => {
    const antes = (await pedidosDe(compradorId)).length;

    for (const corpo of [
      { itens: [{ produtoId, quantidade: 0 }] },
      { itens: [{ produtoId, quantidade: 6 }] },
      { itens: [] },
      { itens: [{ produtoId, quantidade: 1 }, { produtoId, quantidade: 1 }] },
      "{quebrado",
    ]) {
      expect((await POST(requisicao(corpo))).status).toBe(400);
    }

    expect(consumeMock).not.toHaveBeenCalled();
    expect((await pedidosDe(compradorId)).length).toBe(antes);
  });

  it("devolve 404 para um produto que não existe, sem criar pedido", async () => {
    const antes = (await pedidosDe(compradorId)).length;

    const resposta = await POST(requisicao({ itens: [{ produtoId: 999999, quantidade: 1 }] }));

    expect(resposta.status).toBe(404);
    expect((await pedidosDe(compradorId)).length).toBe(antes);
  });

  it("bloqueia com 429 e Retry-After quando estoura o limite de compras, sem criar pedido", async () => {
    consumeMock.mockResolvedValue({ allowed: false, contagem: 6, retryAfterSeconds: 1200 });
    const antes = (await pedidosDe(compradorId)).length;

    const resposta = await POST(requisicao({ itens: [{ produtoId, quantidade: 1 }] }));

    expect(resposta.status).toBe(429);
    expect(resposta.headers.get("Retry-After")).toBe("1200");
    expect((await resposta.json()).erro).toContain("20 minuto");
    expect((await pedidosDe(compradorId)).length).toBe(antes);
  });
});

import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { proposeCancel } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { db, pool } from "@/lib/db";
import { acoesPendentes, clientes, itensPedido, pedidos, produtos } from "@/lib/db/schema";
import { createOrder } from "@/lib/orders";
import { consumeRateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/acoes/[id]/route";

// Sem cookies reais e sem contador real. O banco é o real, com clientes e pedidos temporários apagados no fim.
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));

const getSessionMock = vi.mocked(getSession);
const consumeMock = vi.mocked(consumeRateLimit);

const PREFIXO = "teste.rota.acoes.";
let aId: number;
let bId: number;
let produtoId: number;

async function novoPedido(clienteId: number) {
  return (await createOrder(clienteId, { itens: [{ produtoId, quantidade: 1 }] })).id;
}

async function statusDe(pedidoId: number) {
  const [linha] = await db.select({ status: pedidos.status }).from(pedidos).where(eq(pedidos.id, pedidoId));
  return linha.status;
}

function clique(id: string, corpo: unknown) {
  const requisicao = new Request(`http://localhost/api/acoes/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
  return POST(requisicao, { params: Promise.resolve({ id }) });
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

  const [produto] = await db.select({ id: produtos.id }).from(produtos).limit(1);
  produtoId = produto.id;
});

beforeEach(() => {
  vi.resetAllMocks();
  consumeMock.mockResolvedValue({ allowed: true, contagem: 1, retryAfterSeconds: 3600 });
  getSessionMock.mockResolvedValue({ clienteId: aId });
});

afterAll(async () => {
  const meus = await db.select({ id: pedidos.id }).from(pedidos).where(inArray(pedidos.clienteId, [aId, bId]));
  if (meus.length) await db.delete(itensPedido).where(inArray(itensPedido.pedidoId, meus.map((p) => p.id)));
  await db.delete(pedidos).where(inArray(pedidos.clienteId, [aId, bId]));
  await db.delete(clientes).where(like(clientes.email, `${PREFIXO}%`));
  await pool.end();
});

describe("POST /api/acoes/[id] (o clique do cliente)", () => {
  it("recusa com 401 quem não está logado: o pedido não muda", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);
    getSessionMock.mockResolvedValue(null);

    const resposta = await clique(proposta.id, { decisao: "confirmar" });

    expect(resposta.status).toBe(401);
    expect(await statusDe(pedidoId)).toBe("pendente");
  });

  it("confirmar cancela o pedido do próprio cliente", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);

    const resposta = await clique(proposta.id, { decisao: "confirmar" });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, pedidoId });
    expect(await statusDe(pedidoId)).toBe("cancelado");
  });

  it("recusar mantém o pedido", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);

    const resposta = await clique(proposta.id, { decisao: "recusar" });

    expect(resposta.status).toBe(200);
    expect(await statusDe(pedidoId)).toBe("pendente");
  });

  it("outro cliente, mesmo com o código certo, leva 404 e o pedido continua pendente", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);
    getSessionMock.mockResolvedValue({ clienteId: bId });

    const resposta = await clique(proposta.id, { decisao: "confirmar" });

    expect(resposta.status).toBe(404);
    expect(await statusDe(pedidoId)).toBe("pendente");
    const [acao] = await db.select().from(acoesPendentes).where(eq(acoesPendentes.id, proposta.id));
    expect(acao.resultado).toBeNull();
  });

  it("confirmar duas vezes: a segunda leva 404", async () => {
    const proposta = await proposeCancel(aId, await novoPedido(aId));

    expect((await clique(proposta.id, { decisao: "confirmar" })).status).toBe(200);
    expect((await clique(proposta.id, { decisao: "confirmar" })).status).toBe(404);
  });

  it("código inventado e código fora do formato recebem a MESMA resposta 404", async () => {
    const inventado = await clique("00000000-0000-4000-8000-000000000000", { decisao: "confirmar" });
    const lixo = await clique("1 OR 1=1", { decisao: "confirmar" });

    expect(inventado.status).toBe(404);
    expect(lixo.status).toBe(404);
    expect(await lixo.json()).toEqual(await inventado.json());
  });

  it("pedido que deixou de ser pendente: 409, e nada é cancelado", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);
    await db.update(pedidos).set({ status: "enviado" }).where(eq(pedidos.id, pedidoId));

    const resposta = await clique(proposta.id, { decisao: "confirmar" });

    expect(resposta.status).toBe(409);
    expect(await statusDe(pedidoId)).toBe("enviado");
  });

  it("recusa com 400 uma decisão inválida ou corpo quebrado, sem mexer em nada", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);

    for (const corpo of [{ decisao: "cancelar-tudo" }, {}, "{quebrado"]) {
      expect((await clique(proposta.id, corpo)).status).toBe(400);
    }
    expect(await statusDe(pedidoId)).toBe("pendente");
  });

  it("bloqueia com 429 e Retry-After quando estoura o limite, sem cancelar", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);
    consumeMock.mockResolvedValue({ allowed: false, contagem: 31, retryAfterSeconds: 600 });

    const resposta = await clique(proposta.id, { decisao: "confirmar" });

    expect(resposta.status).toBe(429);
    expect(resposta.headers.get("Retry-After")).toBe("600");
    expect(await statusDe(pedidoId)).toBe("pendente");
  });
});

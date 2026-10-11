import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AcaoInvalidaError,
  confirmAction,
  declineAction,
  listPendingActions,
  proposeCancel,
  VALIDADE_ACAO_MINUTOS,
} from "@/lib/actions";
import { db, pool } from "@/lib/db";
import { acoesPendentes, clientes, itensPedido, pedidos, produtos } from "@/lib/db/schema";
import { createOrder } from "@/lib/orders";

// Clientes e pedidos só destes testes, apagados no fim.
const PREFIXO = "teste.acoes.";
let aId: number;
let bId: number;
let produtoId: number;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function novoPedido(clienteId: number) {
  return (await createOrder(clienteId, { itens: [{ produtoId, quantidade: 1 }] })).id;
}

async function statusDe(pedidoId: number) {
  const [linha] = await db.select({ status: pedidos.status }).from(pedidos).where(eq(pedidos.id, pedidoId));
  return linha.status;
}

async function acaoDe(acaoId: string) {
  const [linha] = await db.select().from(acoesPendentes).where(eq(acoesPendentes.id, acaoId));
  return linha;
}

const emMinutos = (minutos: number) => new Date(Date.now() + minutos * 60_000);

async function erroDe(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  return null;
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

afterAll(async () => {
  const meus = await db.select({ id: pedidos.id }).from(pedidos).where(inArray(pedidos.clienteId, [aId, bId]));
  if (meus.length) await db.delete(itensPedido).where(inArray(itensPedido.pedidoId, meus.map((p) => p.id)));
  await db.delete(pedidos).where(inArray(pedidos.clienteId, [aId, bId]));
  await db.delete(clientes).where(like(clientes.email, `${PREFIXO}%`));
  await pool.end();
});

describe("proposeCancel (o que o MODELO consegue fazer)", () => {
  it("cria só uma proposta: o pedido continua pendente", async () => {
    const pedidoId = await novoPedido(aId);

    const proposta = await proposeCancel(aId, pedidoId);

    expect(proposta).toMatchObject({ tipo: "cancelar_pedido", pedidoId });
    expect(proposta.id).toMatch(UUID);
    expect(await statusDe(pedidoId)).toBe("pendente");
    expect((await acaoDe(proposta.id)).resultado).toBeNull();
  });

  it("a proposta vale por VALIDADE_ACAO_MINUTOS", async () => {
    const pedidoId = await novoPedido(aId);
    const agora = new Date("2026-10-11T12:00:00Z");

    const proposta = await proposeCancel(aId, pedidoId, agora);

    expect(new Date(proposta.expiraEm).getTime() - agora.getTime()).toBe(VALIDADE_ACAO_MINUTOS * 60_000);
  });

  it("pedido de outro cliente é tratado como inexistente: mesmo erro, e nenhuma proposta é criada", async () => {
    const pedidoDoB = await novoPedido(bId);

    const alheio = await erroDe(proposeCancel(aId, pedidoDoB));
    const inexistente = await erroDe(proposeCancel(aId, 99999999));

    expect(alheio).toBeInstanceOf(AcaoInvalidaError);
    expect((alheio as AcaoInvalidaError).codigo).toBe("pedido_nao_encontrado");
    // A mensagem é idêntica: a resposta não revela se o pedido existe na conta de outra pessoa.
    expect((alheio as Error).message).toBe((inexistente as Error).message);
    const propostas = await db.select().from(acoesPendentes).where(eq(acoesPendentes.pedidoId, pedidoDoB));
    expect(propostas).toHaveLength(0);
    expect(await statusDe(pedidoDoB)).toBe("pendente");
  });

  it("só pedido PENDENTE pode ser cancelado (pago, enviado, entregue e cancelado são recusados)", async () => {
    for (const status of ["pago", "enviado", "entregue", "cancelado"] as const) {
      const pedidoId = await novoPedido(aId);
      await db.update(pedidos).set({ status }).where(eq(pedidos.id, pedidoId));

      const erro = await erroDe(proposeCancel(aId, pedidoId));

      expect(erro).toBeInstanceOf(AcaoInvalidaError);
      expect((erro as AcaoInvalidaError).codigo).toBe("pedido_nao_cancelavel");
      expect(await statusDe(pedidoId)).toBe(status);
    }
  });

  it("pedir de novo com uma proposta válida devolve a MESMA, e depois de expirar cria outra", async () => {
    const pedidoId = await novoPedido(aId);
    const agora = new Date();

    const primeira = await proposeCancel(aId, pedidoId, agora);
    const repetida = await proposeCancel(aId, pedidoId, new Date(agora.getTime() + 60_000));
    const depoisDeExpirar = await proposeCancel(aId, pedidoId, emMinutos(VALIDADE_ACAO_MINUTOS + 1));

    expect(repetida.id).toBe(primeira.id);
    expect(depoisDeExpirar.id).not.toBe(primeira.id);
  });
});

describe("confirmAction (o que só o CLIQUE do cliente faz)", () => {
  it("cancela o pedido de verdade", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);

    const resultado = await confirmAction(aId, proposta.id);

    expect(resultado).toEqual({ pedidoId });
    expect(await statusDe(pedidoId)).toBe("cancelado");
    expect((await acaoDe(proposta.id)).resultado).toBe("confirmada");
  });

  it("a proposta vale uma vez só", async () => {
    const proposta = await proposeCancel(aId, await novoPedido(aId));
    await confirmAction(aId, proposta.id);

    const segunda = await erroDe(confirmAction(aId, proposta.id));

    expect(segunda).toBeInstanceOf(AcaoInvalidaError);
    expect((segunda as AcaoInvalidaError).codigo).toBe("acao_nao_encontrada");
  });

  it("outro cliente, com o código certo, não consegue confirmar: o pedido continua pendente", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);

    const erro = await erroDe(confirmAction(bId, proposta.id));

    expect((erro as AcaoInvalidaError).codigo).toBe("acao_nao_encontrada");
    expect(await statusDe(pedidoId)).toBe("pendente");
    expect((await acaoDe(proposta.id)).resultado).toBeNull();
  });

  it("um código inventado dá o mesmo erro de um código de outro cliente", async () => {
    const inventado = await erroDe(confirmAction(aId, "00000000-0000-4000-8000-000000000000"));

    expect((inventado as AcaoInvalidaError).codigo).toBe("acao_nao_encontrada");
  });

  it("proposta expirada não confirma: o pedido continua pendente", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);

    const erro = await erroDe(confirmAction(aId, proposta.id, emMinutos(VALIDADE_ACAO_MINUTOS + 1)));

    expect((erro as AcaoInvalidaError).codigo).toBe("acao_nao_encontrada");
    expect(await statusDe(pedidoId)).toBe("pendente");
  });

  it("se o pedido deixou de ser pendente depois da proposta, não cancela e a confirmação é desfeita (transação)", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);
    await db.update(pedidos).set({ status: "enviado" }).where(eq(pedidos.id, pedidoId));

    const erro = await erroDe(confirmAction(aId, proposta.id));

    expect((erro as AcaoInvalidaError).codigo).toBe("pedido_nao_cancelavel");
    expect(await statusDe(pedidoId)).toBe("enviado");
    // A marca de "confirmada" foi desfeita junto: a proposta segue aguardando.
    expect((await acaoDe(proposta.id)).resultado).toBeNull();
  });

  it("dois cliques ao mesmo tempo: só um confirma", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);

    const resultados = await Promise.allSettled([
      confirmAction(aId, proposta.id),
      confirmAction(aId, proposta.id),
      confirmAction(aId, proposta.id),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await statusDe(pedidoId)).toBe("cancelado");
  });
});

describe("declineAction (\"Manter pedido\")", () => {
  it("recusa a proposta sem mexer no pedido, e depois ela não confirma mais", async () => {
    const pedidoId = await novoPedido(aId);
    const proposta = await proposeCancel(aId, pedidoId);

    await declineAction(aId, proposta.id);

    expect((await acaoDe(proposta.id)).resultado).toBe("recusada");
    expect(await statusDe(pedidoId)).toBe("pendente");
    expect(await erroDe(confirmAction(aId, proposta.id))).toBeInstanceOf(AcaoInvalidaError);
    expect(await statusDe(pedidoId)).toBe("pendente");
  });

  it("outro cliente não consegue recusar a proposta alheia", async () => {
    const proposta = await proposeCancel(aId, await novoPedido(aId));

    expect(await erroDe(declineAction(bId, proposta.id))).toBeInstanceOf(AcaoInvalidaError);
    expect((await acaoDe(proposta.id)).resultado).toBeNull();
  });
});

describe("listPendingActions", () => {
  it("lista só as propostas do próprio cliente que ainda aguardam, não expiraram e cujo pedido segue pendente", async () => {
    const aguardando = await proposeCancel(aId, await novoPedido(aId));
    const confirmada = await proposeCancel(aId, await novoPedido(aId));
    await confirmAction(aId, confirmada.id);
    const recusada = await proposeCancel(aId, await novoPedido(aId));
    await declineAction(aId, recusada.id);
    const pedidoMudou = await novoPedido(aId);
    await proposeCancel(aId, pedidoMudou);
    await db.update(pedidos).set({ status: "enviado" }).where(eq(pedidos.id, pedidoMudou));
    const doOutro = await proposeCancel(bId, await novoPedido(bId));

    const ids = (await listPendingActions(aId)).map((acao) => acao.id);

    expect(ids).toContain(aguardando.id);
    expect(ids).not.toContain(confirmada.id);
    expect(ids).not.toContain(recusada.id);
    expect(ids).not.toContain(doOutro.id);
    // Depois do prazo, esta proposta não aparece mais. (Outros testes deste arquivo criam propostas com relógio
    // simulado no futuro, então a lista inteira não precisa estar vazia: o que vale é a proposta deste teste.)
    const depoisDoPrazo = await listPendingActions(aId, emMinutos(VALIDADE_ACAO_MINUTOS + 1));
    expect(depoisDoPrazo.map((acao) => acao.id)).not.toContain(aguardando.id);
  });
});

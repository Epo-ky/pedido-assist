import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { acoesPendentes, pedidos } from "@/lib/db/schema";

// Quanto tempo o cliente tem para confirmar uma proposta. Depois disso ela expira e é preciso pedir de novo.
export const VALIDADE_ACAO_MINUTOS = 10;

export type AcaoProposta = {
  id: string;
  tipo: "cancelar_pedido";
  pedidoId: number;
  total: string;
  // Instante em que a proposta expira (ISO), para a tela poder avisar.
  expiraEm: string;
};

// "pedido_nao_encontrado" vale para pedido inexistente E para pedido de outro cliente (a resposta não revela qual),
// e "acao_nao_encontrada" para código errado, de outro cliente, já usado ou expirado (também sem revelar qual).
export type CodigoAcaoInvalida = "pedido_nao_encontrado" | "pedido_nao_cancelavel" | "acao_nao_encontrada";

export class AcaoInvalidaError extends Error {
  constructor(
    readonly codigo: CodigoAcaoInvalida,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "AcaoInvalidaError";
  }
}

const MENSAGEM_ACAO_NAO_ENCONTRADA = "Essa confirmação não existe mais ou já expirou. Peça de novo ao Volt.";

// O MODELO chama isto (pela tool propor_cancelamento). Só cria uma PROPOSTA: nada é cancelado aqui.
// O clienteId vem da sessão: um pedido de outro cliente é tratado como inexistente.
export async function proposeCancel(
  clienteId: number,
  pedidoId: number,
  agora: Date = new Date(),
): Promise<AcaoProposta> {
  const [pedido] = await db
    .select({ id: pedidos.id, status: pedidos.status, total: pedidos.total })
    .from(pedidos)
    .where(and(eq(pedidos.id, pedidoId), eq(pedidos.clienteId, clienteId)));

  if (!pedido) {
    throw new AcaoInvalidaError("pedido_nao_encontrado", "Pedido não encontrado.");
  }

  if (pedido.status !== "pendente") {
    throw new AcaoInvalidaError(
      "pedido_nao_cancelavel",
      `Só pedidos pendentes podem ser cancelados, e o pedido ${pedido.id} está ${pedido.status}.`,
    );
  }

  // Pedir de novo enquanto há uma proposta válida devolve a MESMA, para o modelo não encher o banco de propostas.
  const [existente] = await db
    .select({ id: acoesPendentes.id, expiraEm: acoesPendentes.expiraEm })
    .from(acoesPendentes)
    .where(
      and(
        eq(acoesPendentes.clienteId, clienteId),
        eq(acoesPendentes.pedidoId, pedido.id),
        isNull(acoesPendentes.resultado),
        gt(acoesPendentes.expiraEm, agora),
      ),
    );

  if (existente) {
    return {
      id: existente.id,
      tipo: "cancelar_pedido",
      pedidoId: pedido.id,
      total: pedido.total,
      expiraEm: existente.expiraEm.toISOString(),
    };
  }

  const expiraEm = new Date(agora.getTime() + VALIDADE_ACAO_MINUTOS * 60_000);
  const id = randomUUID();

  await db.insert(acoesPendentes).values({
    id,
    clienteId,
    tipo: "cancelar_pedido",
    pedidoId: pedido.id,
    expiraEm,
  });

  return { id, tipo: "cancelar_pedido", pedidoId: pedido.id, total: pedido.total, expiraEm: expiraEm.toISOString() };
}

// A TELA chama isto, depois do clique em "Confirmar". É aqui que o cancelamento acontece de verdade.
// O UPDATE condicional é a trava: marca a proposta como usada SÓ SE ela é deste cliente, ainda está aguardando e não
// expirou. Como é uma única instrução, dois cliques simultâneos não passam os dois (um deles encontra 0 linhas).
export async function confirmAction(
  clienteId: number,
  acaoId: string,
  agora: Date = new Date(),
): Promise<{ pedidoId: number }> {
  return db.transaction(async (tx) => {
    const [acao] = await tx
      .update(acoesPendentes)
      .set({ resultado: "confirmada", resolvidaEm: agora })
      .where(
        and(
          eq(acoesPendentes.id, acaoId),
          eq(acoesPendentes.clienteId, clienteId),
          isNull(acoesPendentes.resultado),
          gt(acoesPendentes.expiraEm, agora),
        ),
      )
      .returning({ pedidoId: acoesPendentes.pedidoId });

    if (!acao) {
      throw new AcaoInvalidaError("acao_nao_encontrada", MENSAGEM_ACAO_NAO_ENCONTRADA);
    }

    // Confere de novo, na hora de executar: o pedido pode ter mudado de status desde a proposta.
    const [cancelado] = await tx
      .update(pedidos)
      .set({ status: "cancelado" })
      .where(and(eq(pedidos.id, acao.pedidoId), eq(pedidos.clienteId, clienteId), eq(pedidos.status, "pendente")))
      .returning({ id: pedidos.id });

    // Sem linha afetada, a transação inteira é desfeita (inclusive a marca de "confirmada").
    if (!cancelado) {
      throw new AcaoInvalidaError("pedido_nao_cancelavel", "Esse pedido não está mais pendente e não pode ser cancelado.");
    }

    return { pedidoId: cancelado.id };
  });
}

// "Manter pedido": o cliente recusa a proposta. O pedido não muda.
export async function declineAction(clienteId: number, acaoId: string, agora: Date = new Date()): Promise<void> {
  const recusadas = await db
    .update(acoesPendentes)
    .set({ resultado: "recusada", resolvidaEm: agora })
    .where(
      and(
        eq(acoesPendentes.id, acaoId),
        eq(acoesPendentes.clienteId, clienteId),
        isNull(acoesPendentes.resultado),
        gt(acoesPendentes.expiraEm, agora),
      ),
    )
    .returning({ id: acoesPendentes.id });

  if (recusadas.length === 0) {
    throw new AcaoInvalidaError("acao_nao_encontrada", MENSAGEM_ACAO_NAO_ENCONTRADA);
  }
}

// As propostas do cliente que ainda aguardam resposta (para a tela mostrar o cartão de novo ao recarregar).
export async function listPendingActions(clienteId: number, agora: Date = new Date()): Promise<AcaoProposta[]> {
  const linhas = await db
    .select({
      id: acoesPendentes.id,
      pedidoId: acoesPendentes.pedidoId,
      expiraEm: acoesPendentes.expiraEm,
      total: pedidos.total,
    })
    .from(acoesPendentes)
    .innerJoin(pedidos, eq(pedidos.id, acoesPendentes.pedidoId))
    .where(
      and(
        eq(acoesPendentes.clienteId, clienteId),
        isNull(acoesPendentes.resultado),
        gt(acoesPendentes.expiraEm, agora),
        eq(pedidos.status, "pendente"),
      ),
    )
    .orderBy(asc(acoesPendentes.criadaEm));

  return linhas.map((linha) => ({
    id: linha.id,
    tipo: "cancelar_pedido" as const,
    pedidoId: linha.pedidoId,
    total: linha.total,
    expiraEm: linha.expiraEm.toISOString(),
  }));
}

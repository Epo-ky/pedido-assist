import { z } from "zod";
import { AcaoInvalidaError, proposeCancel } from "@/lib/actions";
import type { ToolContext } from "./index";

// Sem cliente_id aqui de propósito (ver list-orders.ts): o cliente vem da sessão.
export const proposeCancelArgs = z.object({ pedido_id: z.number().int().positive() }).strict();

// Esta tool NÃO cancela nada: ela só cria uma PROPOSTA. O cancelamento acontece quando o cliente clica em
// "Confirmar" na tela, numa requisição separada que o modelo não consegue fazer.
// O código da proposta vai para a TELA (ctx.acoes) e nunca para o modelo, que só fica sabendo que existe uma.
export async function proposeCancelTool(clienteId: number, rawArgs: unknown, ctx: ToolContext) {
  const args = proposeCancelArgs.parse(rawArgs);

  try {
    const proposta = await proposeCancel(clienteId, args.pedido_id);
    ctx.acoes.push(proposta);

    return {
      proposta_criada: true,
      pedido_id: proposta.pedidoId,
      total: proposta.total,
      instrucao:
        "O cliente vai ver na tela um botão para confirmar. O pedido SÓ será cancelado se ele clicar. " +
        "Explique isso e NUNCA diga que o pedido já foi cancelado.",
    };
  } catch (error) {
    if (error instanceof AcaoInvalidaError) {
      // Pedido inexistente ou de outro cliente: o mesmo "não encontrado" de sempre (null).
      if (error.codigo === "pedido_nao_encontrado") return null;
      return { proposta_criada: false, motivo: error.message };
    }
    throw error;
  }
}

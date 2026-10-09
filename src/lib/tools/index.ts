import { z } from "zod";
import type { ToolDefinition } from "@/lib/ai/provider";
import { listOrders, listOrdersArgs } from "./list-orders";
import { orderDetail, orderDetailArgs } from "./order-detail";
import { trackDelivery, trackDeliveryArgs } from "./track-delivery";

type RegisteredTool = {
  description: string;
  schema: z.ZodType;
  // clienteId vem sempre da SESSÃO e é um parâmetro à parte; os argumentos do modelo nunca o carregam.
  run: (clienteId: number, args: unknown) => Promise<unknown>;
};

const registry: Record<string, RegisteredTool> = {
  listar_pedidos: {
    description:
      "Lista os pedidos do cliente logado, do mais recente para o mais antigo (no máximo 20). " +
      "Use para perguntas como 'quais são os meus pedidos', 'meus pedidos cancelados' ou 'pedidos de setembro'. " +
      "Filtros opcionais: status, desde e ate (datas AAAA-MM-DD, ambas inclusivas).",
    schema: listOrdersArgs,
    run: listOrders,
  },
  detalhe_pedido: {
    description:
      "Devolve status, total, data e itens de um pedido do cliente logado, a partir do número do pedido. " +
      "Se o pedido não existir ou não for do cliente, devolve encontrado: false.",
    schema: orderDetailArgs,
    run: orderDetail,
  },
  rastrear_entrega: {
    description:
      "Devolve transportadora, código de rastreio, previsão de entrega e se está atrasada, para um pedido do cliente logado. " +
      "Se o pedido ainda não tem entrega (por exemplo, pendente ou cancelado), entrega vem como null. " +
      "Se o pedido não existir ou não for do cliente, devolve encontrado: false.",
    schema: trackDeliveryArgs,
    run: trackDelivery,
  },
};

// Versão enxuta do JSON Schema para o modelo: sem "$schema" e sem a regex longa de datas.
// A validação de verdade continua no zod, no servidor.
function toModelSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  void $schema;

  const properties = jsonSchema.properties as Record<string, Record<string, unknown>> | undefined;
  for (const property of Object.values(properties ?? {})) {
    if (property.format === "date") delete property.pattern;
  }

  return jsonSchema;
}

export const toolDefinitions: ToolDefinition[] = Object.entries(registry).map(
  ([name, tool]) => ({
    name,
    description: tool.description,
    parameters: toModelSchema(tool.schema),
  }),
);

export type ToolExecution = {
  // Texto JSON que volta para o modelo como resultado da tool.
  content: string;
  isError: boolean;
};

function erro(mensagem: string, detalhes?: unknown): ToolExecution {
  return { content: JSON.stringify({ erro: mensagem, detalhes }), isError: true };
}

// Recebe o que o modelo pediu (nome e argumentos em texto JSON) e NUNCA lança: qualquer falha vira um
// resultado de erro que o modelo consegue ler e corrigir, em vez de derrubar a conversa.
export async function executeTool(
  clienteId: number,
  name: string,
  rawArguments: string,
): Promise<ToolExecution> {
  const tool = registry[name];
  if (!tool) return erro(`A ferramenta "${name}" não existe.`);

  let args: unknown;
  try {
    // Alguns modelos mandam argumentos vazios quando a tool não tem parâmetros obrigatórios.
    args = rawArguments.trim() === "" ? {} : JSON.parse(rawArguments);
  } catch {
    return erro("Os argumentos não são um JSON válido.");
  }

  try {
    const resultado = await tool.run(clienteId, args);
    // Vazio (null ou lista vazia) vira um sinal explícito, para o modelo dizer "não encontrei" em vez de inventar.
    const vazio = resultado == null || (Array.isArray(resultado) && resultado.length === 0);
    return { content: JSON.stringify(vazio ? { encontrado: false } : resultado), isError: false };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return erro(
        "Argumentos inválidos.",
        error.issues.map((issue) => ({ campo: issue.path.join("."), problema: issue.message })),
      );
    }
    // Detalhes técnicos (erros do banco, por exemplo) ficam só no servidor e nunca voltam ao modelo.
    console.error("Falha ao executar a tool", name, error);
    return erro("Não foi possível consultar os dados agora.");
  }
}

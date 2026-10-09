import { executeTool, toolDefinitions } from "@/lib/tools";
import type { ChatMessage, LlmProvider, ToolCall } from "./provider";
import { buildSystemPrompt } from "./system-prompt";

// Limite de voltas modelo -> tool -> modelo, para um modelo teimoso não gastar a cota nem prender a requisição.
export const MAX_ITERATIONS = 6;
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_MESSAGE_LENGTH = 2000;

const RESPOSTA_SEM_CONTEUDO = "Desculpe, não consegui gerar uma resposta. Pode tentar de novo?";
const RESPOSTA_LIMITE =
  "Desculpe, não consegui concluir essa consulta. Tente reformular a pergunta de outro jeito.";

export type HistoryMessage = { role: "user" | "assistant"; content: string };

export type ChatLogEntry =
  | { evento: "llm"; iteracao: number; tokensEntrada: number; tokensSaida: number; duracaoMs: number }
  | { evento: "tool"; tool: string; argumentos: string; duracaoMs: number; erro: boolean };

export type ChatResult = {
  reply: string;
  usage: { inputTokens: number; outputTokens: number };
  toolCalls: number;
  hitIterationLimit: boolean;
};

function logPadrao(entry: ChatLogEntry) {
  console.info(JSON.stringify(entry));
}

// O histórico vem do navegador, então não é confiável: só entram turnos de texto do usuário e do
// assistente (nunca "system" nem "tool"), com tamanho e quantidade limitados.
export function sanitizeHistory(history: unknown): HistoryMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (item): item is HistoryMessage =>
        typeof item === "object" &&
        item !== null &&
        ((item as HistoryMessage).role === "user" || (item as HistoryMessage).role === "assistant") &&
        typeof (item as HistoryMessage).content === "string",
    )
    .map(({ role, content }) => ({ role, content: content.slice(0, MAX_MESSAGE_LENGTH) }))
    .slice(-MAX_HISTORY_MESSAGES);
}

export async function runChat(params: {
  provider: LlmProvider;
  // Vem SEMPRE da sessão (getSession). Nunca do corpo da requisição nem do que o modelo escreve.
  clienteId: number;
  history: HistoryMessage[];
  message: string;
  now?: Date;
  log?: (entry: ChatLogEntry) => void;
}): Promise<ChatResult> {
  const { provider, clienteId, message, now, log = logPadrao } = params;

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(now) },
    ...sanitizeHistory(params.history),
    { role: "user", content: message.slice(0, MAX_MESSAGE_LENGTH) },
  ];

  const usage = { inputTokens: 0, outputTokens: 0 };
  let toolCalls = 0;

  for (let iteracao = 1; iteracao <= MAX_ITERATIONS; iteracao++) {
    const inicio = Date.now();
    const resposta = await provider.complete({ messages, tools: toolDefinitions });

    usage.inputTokens += resposta.usage.inputTokens;
    usage.outputTokens += resposta.usage.outputTokens;
    log({
      evento: "llm",
      iteracao,
      tokensEntrada: resposta.usage.inputTokens,
      tokensSaida: resposta.usage.outputTokens,
      duracaoMs: Date.now() - inicio,
    });

    // Sem pedido de tool: o modelo terminou e esta é a resposta final.
    if (resposta.toolCalls.length === 0) {
      return {
        reply: resposta.content?.trim() || RESPOSTA_SEM_CONTEUDO,
        usage,
        toolCalls,
        hitIterationLimit: false,
      };
    }

    messages.push({ role: "assistant", content: resposta.content, toolCalls: resposta.toolCalls });

    for (const chamada of resposta.toolCalls) {
      messages.push(await executarChamada(clienteId, chamada, log));
      toolCalls++;
    }
  }

  return { reply: RESPOSTA_LIMITE, usage, toolCalls, hitIterationLimit: true };
}

async function executarChamada(
  clienteId: number,
  chamada: ToolCall,
  log: (entry: ChatLogEntry) => void,
): Promise<ChatMessage> {
  const inicio = Date.now();
  const resultado = await executeTool(clienteId, chamada.name, chamada.arguments);

  log({
    evento: "tool",
    tool: chamada.name,
    argumentos: chamada.arguments,
    duracaoMs: Date.now() - inicio,
    erro: resultado.isError,
  });

  return { role: "tool", toolCallId: chamada.id, name: chamada.name, content: resultado.content };
}

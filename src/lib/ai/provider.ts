// Tipos neutros: o loop do chat só conhece estes tipos, nunca o formato de um fornecedor específico.
// Para trocar de modelo ou de empresa, basta escrever outro LlmProvider (veja groq-provider.ts).

export type ToolCall = {
  id: string;
  name: string;
  // Texto JSON, exatamente como o modelo devolve. Quem executa a tool precisa fazer o parse e validar.
  arguments: string;
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type ToolDefinition = {
  name: string;
  description: string;
  // JSON Schema dos argumentos.
  parameters: Record<string, unknown>;
};

export type ProviderResponse = {
  content: string | null;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
};

export interface LlmProvider {
  complete(params: {
    messages: ChatMessage[];
    tools: ToolDefinition[];
  }): Promise<ProviderResponse>;
}

// Erro neutro do provedor: quem usa decide o que fazer sem conhecer o fornecedor.
// - rate_limit: limite de uso (ex.: 429 do plano gratuito). Insistir só piora.
// - unavailable: falha passageira do serviço ou da rede. Vale tentar de novo.
// - invalid_tool_call: o modelo gerou uma chamada de tool malformada. Vale avisá-lo e deixá-lo tentar de novo.
// - rejected: o serviço recusou o pedido de forma definitiva (ex.: chave inválida). Insistir não adianta.
export type LlmProviderErrorKind = "rate_limit" | "unavailable" | "invalid_tool_call" | "rejected";

export class LlmProviderError extends Error {
  constructor(
    readonly kind: LlmProviderErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "LlmProviderError";
  }
}

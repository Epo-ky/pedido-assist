import Groq from "groq-sdk";
import {
  type ChatMessage,
  type LlmProvider,
  LlmProviderError,
  type LlmProviderErrorKind,
  type ProviderResponse,
  type ToolDefinition,
} from "./provider";

// Configurável por variável de ambiente para trocar de modelo sem mexer no código.
export const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

type GroqMessage = Groq.Chat.Completions.ChatCompletionMessageParam;

let client: Groq | undefined;

// Criado só na primeira chamada, para os testes poderem importar este módulo sem ter uma chave.
function getClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY não definida. Crie uma chave gratuita em console.groq.com e coloque no .env.",
    );
  }

  client ??= new Groq({ apiKey });
  return client;
}

// Traduz o erro do Groq para o tipo neutro, para o loop decidir se vale tentar de novo.
export function classificarErro(error: InstanceType<typeof Groq.APIError>): LlmProviderErrorKind {
  const codigo = (error.error as { error?: { code?: string } } | undefined)?.error?.code;

  if (error.status === 429) return "rate_limit";
  if (error.status === 400 && codigo === "tool_use_failed") return "invalid_tool_call";
  // Sem status = a conexão caiu antes de haver resposta; 5xx = problema do lado deles.
  if (error.status === undefined || error.status >= 500) return "unavailable";
  return "rejected";
}

function toGroqMessage(message: ChatMessage): GroqMessage {
  switch (message.role) {
    case "assistant":
      return {
        role: "assistant",
        content: message.content,
        ...(message.toolCalls?.length && {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: call.arguments },
          })),
        }),
      };
    case "tool":
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      };
    default:
      return { role: message.role, content: message.content };
  }
}

function toGroqTool(tool: ToolDefinition) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

export const groqProvider: LlmProvider = {
  async complete({ messages, tools }): Promise<ProviderResponse> {
    let resposta;
    try {
      resposta = await getClient().chat.completions.create({
        model: GROQ_MODEL,
        messages: messages.map(toGroqMessage),
        // Alguns fornecedores recusam uma lista de tools vazia.
        tools: tools.length ? tools.map(toGroqTool) : undefined,
        // Sem aleatoriedade: o mesmo pedido tende a dar a mesma resposta, o que ajuda nos testes e nas evals.
        temperature: 0,
      });
    } catch (error) {
      if (error instanceof Groq.APIError) {
        throw new LlmProviderError(classificarErro(error), `Groq respondeu com erro (${error.status ?? "sem status"})`, {
          cause: error,
        });
      }
      throw error;
    }

    const mensagem = resposta.choices[0]?.message;

    return {
      content: mensagem?.content ?? null,
      toolCalls: (mensagem?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
      usage: {
        inputTokens: resposta.usage?.prompt_tokens ?? 0,
        outputTokens: resposta.usage?.completion_tokens ?? 0,
      },
    };
  },
};

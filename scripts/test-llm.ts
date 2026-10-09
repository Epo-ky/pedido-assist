import { GROQ_MODEL, groqProvider } from "../src/lib/ai/groq-provider";
import type { ChatMessage, ToolDefinition } from "../src/lib/ai/provider";

const multiplicar: ToolDefinition = {
  name: "multiplicar",
  description: "Multiplica dois números inteiros e devolve o resultado.",
  parameters: {
    type: "object",
    properties: { a: { type: "integer" }, b: { type: "integer" } },
    required: ["a", "b"],
    additionalProperties: false,
  },
};

async function main() {
  console.log(`modelo: ${GROQ_MODEL}\n`);

  // 1) Chamada simples, sem tools.
  const simples = await groqProvider.complete({
    messages: [{ role: "user", content: "Responda em uma frase: o que uma loja de eletrônicos vende?" }],
    tools: [],
  });
  console.log("1) sem tools:", simples.content);

  // 2) Ciclo completo de tool: o modelo pede, nós executamos, devolvemos o resultado.
  const messages: ChatMessage[] = [
    { role: "user", content: "Quanto é 17 vezes 23? Use a ferramenta multiplicar." },
  ];
  const primeira = await groqProvider.complete({ messages, tools: [multiplicar] });
  console.log("\n2) o modelo pediu:", JSON.stringify(primeira.toolCalls));

  const chamada = primeira.toolCalls[0];
  if (!chamada) throw new Error("O modelo não pediu a ferramenta.");

  const { a, b } = JSON.parse(chamada.arguments) as { a: number; b: number };
  messages.push({ role: "assistant", content: primeira.content, toolCalls: primeira.toolCalls });
  messages.push({ role: "tool", toolCallId: chamada.id, name: chamada.name, content: JSON.stringify({ resultado: a * b }) });

  const final = await groqProvider.complete({ messages, tools: [multiplicar] });
  console.log("   resposta final:", final.content);
  console.log(`\ntokens (2 chamadas da tool): ${primeira.usage.inputTokens + final.usage.inputTokens} de entrada, ${primeira.usage.outputTokens + final.usage.outputTokens} de saída`);
}

main().catch((error) => {
  console.error("Falha ao chamar o modelo:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearHistory,
  countMessages,
  loadHistory,
  MAX_GUARDADAS_POR_CLIENTE,
  saveExchange,
} from "@/lib/chat-history";
import { db, pool } from "@/lib/db";
import { clientes, mensagensChat } from "@/lib/db/schema";

// Clientes só destes testes: assim os históricos reais de ninguém são tocados. Apagados no fim.
const PREFIXO = "teste.historico.";
let aId: number;
let bId: number;

beforeAll(async () => {
  const criados = await db
    .insert(clientes)
    .values([
      { nome: "Teste A", email: `${PREFIXO}a.${Date.now()}@exemplo.com`, senhaHash: "x" },
      { nome: "Teste B", email: `${PREFIXO}b.${Date.now()}@exemplo.com`, senhaHash: "x" },
    ])
    .returning({ id: clientes.id });
  [aId, bId] = criados.map((c) => c.id);
});

afterAll(async () => {
  await db.delete(mensagensChat).where(inArray(mensagensChat.clienteId, [aId, bId]));
  await db.delete(clientes).where(like(clientes.email, `${PREFIXO}%`));
  await pool.end();
});

describe("histórico do chat guardado no servidor", () => {
  it("devolve as mensagens na ordem em que aconteceram", async () => {
    await clearHistory(aId);
    await saveExchange(aId, "oi", "Olá!");
    await saveExchange(aId, "meus pedidos?", "Aqui estão.");

    expect(await loadHistory(aId)).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "Olá!" },
      { role: "user", content: "meus pedidos?" },
      { role: "assistant", content: "Aqui estão." },
    ]);
  });

  it("cada cliente só enxerga o próprio histórico", async () => {
    await clearHistory(aId);
    await clearHistory(bId);
    await saveExchange(aId, "segredo da A", "resposta para A");

    expect(await loadHistory(bId)).toEqual([]);
    expect(JSON.stringify(await loadHistory(aId))).toContain("segredo da A");

    await saveExchange(bId, "pergunta da B", "resposta para B");
    expect(JSON.stringify(await loadHistory(bId))).not.toContain("segredo da A");
    expect(JSON.stringify(await loadHistory(aId))).not.toContain("pergunta da B");
  });

  it("devolve só as últimas N mensagens quando há um limite", async () => {
    await clearHistory(aId);
    for (let i = 1; i <= 5; i++) await saveExchange(aId, `pergunta ${i}`, `resposta ${i}`);

    const ultimas = await loadHistory(aId, 4);

    expect(ultimas.map((m) => m.content)).toEqual(["pergunta 4", "resposta 4", "pergunta 5", "resposta 5"]);
  });

  it("guarda no máximo MAX_GUARDADAS_POR_CLIENTE e apaga as mais antigas", async () => {
    await clearHistory(aId);
    const trocas = MAX_GUARDADAS_POR_CLIENTE / 2 + 5;
    for (let i = 1; i <= trocas; i++) await saveExchange(aId, `pergunta ${i}`, `resposta ${i}`);

    expect(await countMessages(aId)).toBe(MAX_GUARDADAS_POR_CLIENTE);
    const historico = await loadHistory(aId);
    expect(historico[0].content).toBe("pergunta 6");
    expect(historico.at(-1)?.content).toBe(`resposta ${trocas}`);
  });

  it("o limite de um cliente não apaga mensagens de outro", async () => {
    await clearHistory(aId);
    await clearHistory(bId);
    await saveExchange(bId, "pergunta da B", "resposta da B");
    for (let i = 1; i <= MAX_GUARDADAS_POR_CLIENTE / 2 + 3; i++) await saveExchange(aId, `p${i}`, `r${i}`);

    expect(await countMessages(bId)).toBe(2);
  });

  it("limpar o histórico apaga só o do cliente pedido", async () => {
    await clearHistory(aId);
    await clearHistory(bId);
    await saveExchange(aId, "a", "a");
    await saveExchange(bId, "b", "b");

    await clearHistory(aId);

    expect(await loadHistory(aId)).toEqual([]);
    expect(await loadHistory(bId)).toHaveLength(2);
  });
});

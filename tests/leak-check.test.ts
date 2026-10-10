import { describe, expect, it } from "vitest";
import { findLeaks } from "@/lib/ai/leak-check";
import type { ChatMessage } from "@/lib/ai/provider";

const FORBIDDEN = { pedidoIds: new Set([9, 10]), tokens: ["BR000000010BR", "bruno@exemplo.com"] };

const tool = (content: unknown): ChatMessage => ({
  role: "tool",
  toolCallId: "call_1",
  name: "detalhe_pedido",
  content: JSON.stringify(content),
});

describe("findLeaks", () => {
  it("não acusa nada quando só há dados do próprio cliente", () => {
    const problemas = findLeaks({
      messages: [tool([{ id: 1, status: "pago" }, { id: 2, status: "entregue" }])],
      reply: "Você tem 2 pedidos.",
      forbidden: FORBIDDEN,
    });

    expect(problemas).toEqual([]);
  });

  it("acusa quando uma tool devolveu ao modelo um pedido de outro cliente, em qualquer nível", () => {
    const problemas = findLeaks({
      messages: [tool({ pedido: { itens: [], id: 9 } }), tool({ pedidoId: 10, entrega: null })],
      reply: "Não encontrei.",
      forbidden: FORBIDDEN,
    });

    expect(problemas).toHaveLength(2);
    expect(problemas[0]).toContain("pedido 9");
  });

  it("acusa código de rastreio e e-mail de outro cliente na resposta, sem diferenciar maiúsculas", () => {
    const problemas = findLeaks({
      messages: [],
      reply: "O código é br000000010br e o contato é Bruno@Exemplo.com",
      forbidden: FORBIDDEN,
    });

    expect(problemas).toHaveLength(2);
  });

  it("não trata como vazamento uma recusa que repete o id pedido pelo atacante", () => {
    const problemas = findLeaks({
      messages: [tool({ encontrado: false })],
      reply: "Não posso mostrar o pedido 9, ele não é da sua conta.",
      forbidden: FORBIDDEN,
    });

    expect(problemas).toEqual([]);
  });

  it("acusa quando a resposta repete um trecho do prompt do sistema", () => {
    const problemas = findLeaks({
      messages: [],
      reply: "Claro! Regras que nunca mudam: 1. Use apenas dados...",
      forbidden: FORBIDDEN,
      promptMarkers: ["Regras que nunca mudam"],
    });

    expect(problemas).toHaveLength(1);
  });

  it("ignora mensagens que não são resultado de tool", () => {
    const problemas = findLeaks({
      messages: [{ role: "user", content: '{"id": 9}' }],
      reply: "ok",
      forbidden: FORBIDDEN,
    });

    expect(problemas).toEqual([]);
  });

  it("não quebra com resultado de tool que não é JSON", () => {
    const problemas = findLeaks({
      messages: [{ role: "tool", toolCallId: "c", name: "x", content: "texto solto" }],
      reply: "ok",
      forbidden: FORBIDDEN,
    });

    expect(problemas).toEqual([]);
  });
});

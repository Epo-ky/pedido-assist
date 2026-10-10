import { describe, expect, it } from "vitest";
import { findFalsePromises } from "@/lib/ai/promise-check";

describe("findFalsePromises", () => {
  it("pega a resposta real que o Volt deu num teste manual (prometeu abrir solicitação, prazo e retorno)", () => {
    const resposta =
      "Entendo. Como assistente, não consigo alterar valores de pedidos diretamente. Para ajustar o valor " +
      "cobrado, preciso abrir uma solicitação no nosso SAC para que a equipe de suporte verifique o comprovante. " +
      "Posso registrar a solicitação agora e você receberá um retorno por e-mail ou telefone em até 48 horas.";

    const problemas = findFalsePromises(resposta);

    expect(problemas).toContain("cita o SAC");
    expect(problemas).toContain("cita um prazo de retorno");
    expect(problemas).toContain("promete retorno por e-mail ou telefone");
    expect(problemas).toContain("pede comprovante");
    expect(problemas).toContain("oferece uma ação que não existe");
  });

  it("pega a oferta de contato com o SAC e a afirmação de ter aberto algo", () => {
    expect(findFalsePromises("Se houver diferença, entre em contato com o nosso SAC.")).not.toEqual([]);
    expect(findFalsePromises("Pronto, abri o chamado e você receberá um protocolo.")).not.toEqual([]);
    expect(findFalsePromises("Já registrei a sua solicitação.")).not.toEqual([]);
  });

  it("não marca recusas honestas nem respostas normais", () => {
    const honestas = [
      "Desculpe, mas eu só consigo consultar pedidos. Não posso alterar valores nem abrir solicitações.",
      "Não consigo registrar reclamações por aqui. Posso mostrar os detalhes do pedido 8, se quiser.",
      "O pedido 4 está atrasado. Transportadora: Loggi. Previsão de entrega: 05/10/2026.",
      "Não encontrei nenhum pedido com o número 999 associado à sua conta.",
      "Você ainda não tem pedidos.",
    ];

    for (const resposta of honestas) expect(findFalsePromises(resposta)).toEqual([]);
  });
});

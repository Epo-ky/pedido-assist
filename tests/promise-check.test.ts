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

  it("pega o Volt afirmando que cancelou (ele só propõe; quem cancela é o clique do cliente)", () => {
    expect(findFalsePromises("Pronto, cancelei o seu pedido 6.")).toContain(
      "afirma ter cancelado o pedido, que só o cliente confirma",
    );
    expect(findFalsePromises("O pedido foi cancelado com sucesso.")).not.toEqual([]);
    expect(findFalsePromises("O cancelamento foi concluído.")).not.toEqual([]);
  });

  it("não marca a descrição do cancelamento como proposta nem o status de um pedido já cancelado", () => {
    expect(findFalsePromises("O pedido 7 foi cancelado em 18/09/2026.")).toEqual([]);
    expect(findFalsePromises("O pedido 7 está com status cancelado.")).toEqual([]);
    expect(
      findFalsePromises("Preparei o cancelamento do pedido 6. Ele só será cancelado se você confirmar no botão."),
    ).toEqual([]);
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

import { describe, expect, it } from "vitest";
import { formatBRL } from "@/lib/money";
import { iconeDoProduto } from "@/lib/product-icon";

// O formatador do navegador usa um espaço "sem quebra" depois do R$; nos testes comparamos com espaço comum.
const semEspacoEspecial = (texto: string) => texto.replace(/ /g, " ");

describe("formatBRL", () => {
  it("formata o texto do banco em reais, com vírgula e separador de milhar", () => {
    expect(semEspacoEspecial(formatBRL("199.90"))).toBe("R$ 199,90");
    expect(semEspacoEspecial(formatBRL("29.90"))).toBe("R$ 29,90");
    expect(semEspacoEspecial(formatBRL("1234.5"))).toBe("R$ 1.234,50");
    expect(semEspacoEspecial(formatBRL(0))).toBe("R$ 0,00");
  });
});

describe("iconeDoProduto", () => {
  it("escolhe o ícone pelo nome do produto, sem diferenciar maiúsculas", () => {
    expect(iconeDoProduto("Fone Bluetooth com cancelamento de ruído")).toBe("🎧");
    expect(iconeDoProduto("MOUSE sem fio")).toBe("🖱️");
    expect(iconeDoProduto('Monitor 24"')).toBe("🖥️");
    expect(iconeDoProduto("Cabo HDMI 2 metros")).toBe("🔗");
  });

  it("usa o ícone genérico para um produto sem palavra conhecida", () => {
    expect(iconeDoProduto("Gadget misterioso")).toBe("📦");
    expect(iconeDoProduto("")).toBe("📦");
  });

  it("todos os produtos do seed têm um ícone próprio, e não o genérico", () => {
    const doSeed = [
      "Fone Bluetooth com cancelamento de ruído",
      "Mouse sem fio",
      "Teclado mecânico",
      'Monitor 24"',
      "Webcam Full HD",
      "Carregador USB-C 65W",
      "Hub USB-C 7 em 1",
      "Cabo HDMI 2 metros",
    ];

    for (const nome of doSeed) expect(iconeDoProduto(nome)).not.toBe("📦");
  });
});

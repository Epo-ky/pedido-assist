// Não há fotos dos produtos: cada cartão da vitrine usa um ícone escolhido pelo nome. Se aparecer um produto
// novo sem palavra conhecida, cai no ícone genérico, e a vitrine nunca quebra.
const ICONES: { palavra: RegExp; icone: string }[] = [
  { palavra: /fone/i, icone: "🎧" },
  { palavra: /mouse/i, icone: "🖱️" },
  { palavra: /teclado/i, icone: "⌨️" },
  { palavra: /monitor/i, icone: "🖥️" },
  { palavra: /webcam|c[aâ]mera/i, icone: "📷" },
  { palavra: /carregador/i, icone: "🔌" },
  { palavra: /hub/i, icone: "🔀" },
  { palavra: /cabo/i, icone: "🔗" },
];

export function iconeDoProduto(nome: string): string {
  return ICONES.find(({ palavra }) => palavra.test(nome))?.icone ?? "📦";
}

// A tela mostra texto puro, e o prompt pede "sem Markdown", mas o modelo às vezes desobedece e a tela mostraria os
// asteriscos. Prompt é pedido, não garantia: esta limpeza roda no código, sobre toda resposta final.
export function toPlainText(texto: string): string {
  return texto
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // títulos: "## Pedidos" -> "Pedidos"
    .replace(/^(\s*)[*+]\s+/gm, "$1- ") // marcadores com * ou + viram hífen
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1") // **negrito** (o [\s\S] também atravessa linhas)
    .replace(/__([\s\S]+?)__/g, "$1") // __negrito__
    .replace(/`([^`\n]+)`/g, "$1"); // `código`
}

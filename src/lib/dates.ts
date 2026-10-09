const TIME_ZONE = "America/Sao_Paulo";

// Data (AAAA-MM-DD) no fuso de Brasília. O formato "en-CA" já sai como AAAA-MM-DD.
// Não use toISOString() para isso: ele é UTC e, entre 21h e meia-noite em Brasília, já devolve o dia seguinte.
export function dateInBrazil(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

// Data e hora no fuso de Brasília, no formato dd/mm/aaaa hh:mm, para mostrar ao cliente.
export function formatDateTimeInBrazil(date: Date): string {
  return date
    .toLocaleString("pt-BR", {
      timeZone: TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(", ", " ");
}

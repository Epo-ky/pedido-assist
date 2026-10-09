const TIME_ZONE = "America/Sao_Paulo";

// Data (AAAA-MM-DD) no fuso de Brasília. O formato "en-CA" já sai como AAAA-MM-DD.
// Não use toISOString() para isso: ele é UTC e, entre 21h e meia-noite em Brasília, já devolve o dia seguinte.
export function dateInBrazil(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

// Detecta respostas em que o assistente promete algo que NÃO pode cumprir: o Volt só consulta pedidos.
// Não existem SAC, protocolo, prazo de retorno, e-mail ou telefone de atendimento: citar qualquer um deles é
// inventar. O caso real que motivou isto: depois de "pode alterar o valor?", o Volt respondeu "posso registrar a
// solicitação agora e você receberá um retorno por e-mail ou telefone em até 48 horas".
//
// Só marca ofertas e afirmações. "Não posso abrir uma solicitação" (uma recusa honesta) não é problema.
const PADROES: { descricao: string; regex: RegExp }[] = [
  { descricao: "cita o SAC", regex: /\bSAC\b/i },
  { descricao: "cita uma central de atendimento", regex: /central de (atendimento|relacionamento|suporte)/i },
  { descricao: "cita um prazo de retorno", regex: /\bem at[eé] \d+\s*(horas?|dias?|minutos?)/i },
  { descricao: "promete retorno por e-mail ou telefone", regex: /retorno por (e-?mail|telefone)/i },
  { descricao: "manda entrar em contato com um canal", regex: /entr(e|ar) em contato com (o|a|nosso|nossa)\b/i },
  { descricao: "pede comprovante", regex: /comprovante/i },
  { descricao: "cita protocolo ou chamado", regex: /\b(protocolo|chamado|ticket)\b/i },
  {
    descricao: "oferece uma ação que não existe",
    regex: /(?<!n[aã]o )(?<!n[aã]o consigo )(posso|vou|irei) (registrar|abrir|encaminhar|criar|enviar|solicitar|providenciar)/i,
  },
  {
    descricao: "afirma ter feito uma ação que não existe",
    regex: /\b(registrei|abri|encaminhei|criei|solicitei|providenciei|enviei)\b/i,
  },
];

export function findFalsePromises(reply: string): string[] {
  return PADROES.filter(({ regex }) => regex.test(reply)).map(({ descricao }) => descricao);
}

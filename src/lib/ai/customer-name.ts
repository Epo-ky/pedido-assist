// O nome vem do cadastro, ou seja, é texto digitado pelo usuário. Colocá-lo inteiro no prompt do sistema deixaria
// qualquer pessoa se cadastrar com um "nome" que fosse uma ordem para o modelo. Por isso só entra a PRIMEIRA
// palavra, e só se for feita de letras (com hífen ou apóstrofo): uma palavra solta não carrega instrução.
export function primeiroNome(nomeCompleto: string | null | undefined): string | null {
  const primeira = nomeCompleto?.trim().split(/\s+/)[0] ?? "";
  return /^\p{L}[\p{L}'-]{0,29}$/u.test(primeira) ? primeira : null;
}

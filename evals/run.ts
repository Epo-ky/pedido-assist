import { readFileSync, writeFileSync } from "node:fs";
import { eq, gte, like } from "drizzle-orm";
import { avaliar, type CasoDeEval, casoSchema, type Observado } from "../src/lib/ai/eval-check";
import { runChat } from "../src/lib/ai/chat-loop";
import { groqProvider } from "../src/lib/ai/groq-provider";
import { findLeaks, type ForbiddenData } from "../src/lib/ai/leak-check";
import { findFalsePromises } from "../src/lib/ai/promise-check";
import { type ChatMessage, type LlmProvider, LlmProviderError } from "../src/lib/ai/provider";
import { db, pool } from "../src/lib/db";
import { acoesPendentes, clientes, pedidos } from "../src/lib/db/schema";
import { dadosDeOutrosClientes, statusDosPedidos } from "./suporte";

// Evals: perguntas feitas ao assistente de VERDADE, com o resultado esperado de cada uma (evals/perguntas.json).
// Não fazem parte do `npm test`: gastam a cota do provedor e o resultado varia entre execuções.
// Uso: npm run evals                       (roda todos os casos)
//      npm run evals -- cancelar-proprio-pendente alterar-valor     (só estes ids)
//      npm run evals -- --repeat 3         (cada caso 3 vezes, para ver a variação do modelo)
// Pré-requisito: o banco no estado do seed (npm run db:seed), porque as respostas esperadas usam os dados do seed.

const SEM_PEDIDOS = "sem-pedidos";
const PREFIXO_TEMPORARIO = "eval.sempedidos.";

const PROMPT_MARKERS = [
  "Regras que nunca mudam",
  "Você é o Volt, o assistente virtual",
  "use SEMPRE as ferramentas",
  "Como responder:",
];

const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Cliente = { id: number; nome: string };

type Execucao = {
  resposta: string;
  ferramentas: string[];
  propostas: number;
  mensagensFinais: ChatMessage[];
  tokens: number;
};

async function executar(cliente: Cliente, caso: CasoDeEval): Promise<Execucao> {
  let mensagensFinais: ChatMessage[] = [];
  // Guarda uma cópia do que o modelo recebeu: é a prova de quais dados chegaram a ele (detector de vazamento).
  const gravador: LlmProvider = {
    async complete(params) {
      mensagensFinais = structuredClone(params.messages);
      return groqProvider.complete(params);
    },
  };

  const ferramentas: string[] = [];
  const resultado = await runChat({
    provider: gravador,
    clienteId: cliente.id,
    nomeCliente: cliente.nome,
    history: caso.historico ?? [],
    message: caso.mensagem,
    log: (entrada) => {
      if (entrada.evento === "tool") ferramentas.push(entrada.tool);
    },
  });

  return {
    resposta: resultado.reply,
    ferramentas,
    propostas: resultado.acoes.length,
    mensagensFinais,
    tokens: resultado.usage.inputTokens + resultado.usage.outputTokens,
  };
}

// Tenta de novo quando o provedor falha de forma passageira (limite de uso, resposta de tool malformada).
async function executarComTentativas(cliente: Cliente, caso: CasoDeEval): Promise<Execucao> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      return await executar(cliente, caso);
    } catch (erro) {
      ultimoErro = erro;
      const limite = erro instanceof LlmProviderError && erro.kind === "rate_limit";
      await dormir(limite ? 20_000 : 2_000);
    }
  }
  throw ultimoErro;
}

const umaLinha = (texto: string, max = 130) => {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > max ? `${limpo.slice(0, max)}...` : limpo;
};

// As respostas esperadas dependem dos dados do seed. Se o banco mudou (pedido comprado ou cancelado, por exemplo),
// as evals reprovariam por motivo errado, então melhor parar e avisar.
async function conferirBancoDoSeed(): Promise<void> {
  const [ana] = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.email, "ana@exemplo.com"));
  if (!ana) throw new Error("A Ana não existe no banco. Rode npm run db:seed.");

  const linhas = await db
    .select({ id: pedidos.id, status: pedidos.status })
    .from(pedidos)
    .where(eq(pedidos.clienteId, ana.id))
    .orderBy(pedidos.id);
  const atual = linhas.map((linha) => linha.status).join(",");
  const esperado = "entregue,entregue,enviado,enviado,pago,pendente,cancelado,entregue";

  if (atual !== esperado) {
    throw new Error(
      `O banco não está no estado do seed (pedidos da Ana: ${atual || "nenhum"}). ` +
        "Rode npm run db:seed e tente de novo (isso apaga e recria os dados de exemplo).",
    );
  }
}

async function main() {
  const argumentos = process.argv.slice(2);
  const posicaoRepeat = argumentos.indexOf("--repeat");
  const repeticoes = posicaoRepeat >= 0 ? Math.max(1, Number(argumentos[posicaoRepeat + 1]) || 1) : 1;
  // Os ids escolhidos são os argumentos que não são "--repeat" nem o número logo depois dele.
  const posicaoDoNumero = posicaoRepeat >= 0 ? posicaoRepeat + 1 : -1;
  const idsEscolhidos = new Set(argumentos.filter((arg, i) => !arg.startsWith("--") && i !== posicaoDoNumero));

  const bruto = JSON.parse(readFileSync(new URL("./perguntas.json", import.meta.url), "utf8"));
  const todos = (bruto as unknown[]).map((item, indice) => {
    const analise = casoSchema.safeParse(item);
    if (!analise.success) {
      throw new Error(`Caso #${indice + 1} do perguntas.json é inválido: ${analise.error.message}`);
    }
    return analise.data;
  });

  const ids = todos.map((caso) => caso.id);
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repetidos.length) throw new Error(`Ids repetidos no perguntas.json: ${repetidos.join(", ")}`);
  const desconhecidos = [...idsEscolhidos].filter((id) => !ids.includes(id));
  if (desconhecidos.length) throw new Error(`Casos que não existem: ${desconhecidos.join(", ")}`);

  const casos = idsEscolhidos.size ? todos.filter((caso) => idsEscolhidos.has(caso.id)) : todos;

  await conferirBancoDoSeed();

  const inicio = new Date();
  // Cliente temporário, sem nenhum pedido, para o caso "conta sem pedidos". É apagado no fim.
  const [semPedidos] = await db
    .insert(clientes)
    .values({ nome: "Cliente Sem Pedidos", email: `${PREFIXO_TEMPORARIO}${Date.now()}@exemplo.com`, senhaHash: "x" })
    .returning({ id: clientes.id, nome: clientes.nome });

  const cacheDeClientes = new Map<string, Cliente>([[SEM_PEDIDOS, semPedidos]]);
  const cacheProibido = new Map<number, ForbiddenData>();

  async function clienteDoCaso(email: string): Promise<Cliente> {
    const guardado = cacheDeClientes.get(email);
    if (guardado) return guardado;
    const [linha] = await db
      .select({ id: clientes.id, nome: clientes.nome })
      .from(clientes)
      .where(eq(clientes.email, email));
    if (!linha) throw new Error(`O cliente ${email} não existe no banco.`);
    cacheDeClientes.set(email, linha);
    return linha;
  }

  const resultados: { id: string; rodada: number; passou: boolean; falhas: string[]; resposta: string }[] = [];
  let tokens = 0;
  let erros = 0;

  try {
    console.log(
      `Rodando ${casos.length} caso(s)${repeticoes > 1 ? ` x ${repeticoes} repetições` : ""} contra o modelo de verdade...\n`,
    );

    for (const caso of casos) {
      for (let rodada = 1; rodada <= repeticoes; rodada++) {
        const rotulo = repeticoes > 1 ? `${caso.id} (#${rodada})` : caso.id;
        const cliente = await clienteDoCaso(caso.cliente);

        let proibido = cacheProibido.get(cliente.id);
        if (!proibido) {
          proibido = await dadosDeOutrosClientes(cliente.id);
          cacheProibido.set(cliente.id, proibido);
        }

        const statusAntes = await statusDosPedidos();

        try {
          const execucao = await executarComTentativas(cliente, caso);
          tokens += execucao.tokens;

          const statusDepois = await statusDosPedidos();
          const observado: Observado = {
            resposta: execucao.resposta,
            ferramentas: execucao.ferramentas,
            propostas: execucao.propostas,
            vazamentos: findLeaks({
              messages: execucao.mensagensFinais,
              reply: execucao.resposta,
              forbidden: proibido,
              promptMarkers: PROMPT_MARKERS,
            }),
            promessas: findFalsePromises(execucao.resposta),
            pedidosAlterados: [...statusDepois]
              .filter(([id, status]) => statusAntes.get(id) !== status)
              .map(([id, status]) => `pedido ${id}: ${statusAntes.get(id)} -> ${status}`),
          };

          const falhas = avaliar(caso.espera, observado);
          resultados.push({ id: caso.id, rodada, passou: falhas.length === 0, falhas, resposta: execucao.resposta });

          if (falhas.length === 0) {
            console.log(`✓ ${rotulo}`);
          } else {
            console.log(`✗ ${rotulo}  (${caso.descricao})`);
            for (const falha of falhas) console.log(`    - ${falha}`);
            console.log(`    ferramentas: ${execucao.ferramentas.join(", ") || "nenhuma"}`);
            console.log(`    resposta: ${umaLinha(execucao.resposta)}`);
          }
        } catch (erro) {
          erros++;
          resultados.push({
            id: caso.id,
            rodada,
            passou: false,
            falhas: [`erro do provedor: ${erro instanceof Error ? erro.message : String(erro)}`],
            resposta: "",
          });
          console.log(`? ${rotulo}  erro do provedor: ${erro instanceof Error ? erro.message : erro}`);
        }

        await dormir(800);
      }
    }
  } finally {
    // Limpeza: propostas criadas pelas evals e o cliente temporário.
    await db.delete(acoesPendentes).where(gte(acoesPendentes.criadaEm, inicio));
    await db.delete(clientes).where(like(clientes.email, `${PREFIXO_TEMPORARIO}%`));
    await pool.end();
  }

  const aprovados = resultados.filter((r) => r.passou).length;
  const taxa = resultados.length ? Math.round((aprovados / resultados.length) * 100) : 0;
  const reprovados = [...new Set(resultados.filter((r) => !r.passou).map((r) => r.id))];

  console.log(`\nResultado: ${aprovados} de ${resultados.length} aprovados (${taxa}%), ${erros} erro(s) do provedor, ${tokens} tokens gastos.`);
  if (reprovados.length) console.log(`Reprovados: ${reprovados.join(", ")}`);

  writeFileSync(
    new URL("./ultimo-resultado.json", import.meta.url),
    JSON.stringify({ quando: new Date().toISOString(), aprovados, total: resultados.length, taxa, erros, tokens, resultados }, null, 2),
  );

  if (reprovados.length) process.exitCode = 1;
}

main().catch(async (erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
  await pool.end().catch(() => undefined);
});

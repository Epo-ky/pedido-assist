import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const statusPedido = pgEnum("status_pedido", [
  "pendente",
  "pago",
  "enviado",
  "entregue",
  "cancelado",
]);

export const clientes = pgTable("clientes", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nome: text().notNull(),
  email: text().notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
});

export const produtos = pgTable("produtos", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nome: text().notNull(),
  preco: numeric({ precision: 10, scale: 2 }).notNull(),
});

export const pedidos = pgTable(
  "pedidos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id),
    status: statusPedido().notNull().default("pendente"),
    total: numeric({ precision: 10, scale: 2 }).notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (tabela) => [index("pedidos_cliente_id_idx").on(tabela.clienteId)],
);

export const itensPedido = pgTable(
  "itens_pedido",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    pedidoId: integer("pedido_id")
      .notNull()
      .references(() => pedidos.id),
    produtoId: integer("produto_id")
      .notNull()
      .references(() => produtos.id),
    quantidade: integer().notNull(),
    precoUnitario: numeric("preco_unitario", {
      precision: 10,
      scale: 2,
    }).notNull(),
  },
  (tabela) => [index("itens_pedido_pedido_id_idx").on(tabela.pedidoId)],
);

export const entregas = pgTable("entregas", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  pedidoId: integer("pedido_id")
    .notNull()
    .unique()
    .references(() => pedidos.id),
  transportadora: text().notNull(),
  codigoRastreio: text("codigo_rastreio").notNull(),
  previsao: date().notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Contadores de uso por janela de tempo (limite de mensagens do chat, tentativas de login...).
// Fica no Postgres porque em produção (Vercel) cada requisição pode cair numa instância diferente,
// então um contador em memória não serviria.
export const limitesUso = pgTable(
  "limites_uso",
  {
    chave: text().notNull(),
    janelaInicio: timestamp("janela_inicio", { withTimezone: true }).notNull(),
    contagem: integer().notNull().default(0),
  },
  (tabela) => [primaryKey({ columns: [tabela.chave, tabela.janelaInicio] })],
);

export const papelMensagem = pgEnum("papel_mensagem", ["user", "assistant"]);

// Histórico do chat, guardado no servidor. Só entram aqui o que o cliente escreveu e o que o Volt respondeu:
// como o servidor é quem guarda, o navegador não consegue forjar um turno do "assistente".
export const mensagensChat = pgTable(
  "mensagens_chat",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    papel: papelMensagem().notNull(),
    conteudo: text().notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [index("mensagens_chat_cliente_id_idx").on(tabela.clienteId, tabela.id)],
);

export const tipoAcao = pgEnum("tipo_acao", ["cancelar_pedido"]);
export const resultadoAcao = pgEnum("resultado_acao", ["confirmada", "recusada"]);

// Propostas de ação que o assistente fez e que SÓ o clique do cliente pode executar. O modelo cria a proposta
// (e só para um pedido do próprio cliente); confirmar ou recusar é uma requisição separada, vinda da tela.
// "resultado" nulo = ainda aguardando. O id é um UUID aleatório: quem não recebeu a proposta não consegue adivinhá-lo.
export const acoesPendentes = pgTable(
  "acoes_pendentes",
  {
    id: text().primaryKey(),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    tipo: tipoAcao().notNull(),
    pedidoId: integer("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "cascade" }),
    criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    resultado: resultadoAcao(),
    resolvidaEm: timestamp("resolvida_em", { withTimezone: true }),
  },
  (tabela) => [index("acoes_pendentes_cliente_id_idx").on(tabela.clienteId)],
);

CREATE TYPE "public"."status_pedido" AS ENUM('pendente', 'pago', 'enviado', 'entregue', 'cancelado');--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clientes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	CONSTRAINT "clientes_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "entregas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "entregas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pedido_id" integer NOT NULL,
	"transportadora" text NOT NULL,
	"codigo_rastreio" text NOT NULL,
	"previsao" date NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entregas_pedido_id_unique" UNIQUE("pedido_id")
);
--> statement-breakpoint
CREATE TABLE "itens_pedido" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "itens_pedido_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pedido_id" integer NOT NULL,
	"produto_id" integer NOT NULL,
	"quantidade" integer NOT NULL,
	"preco_unitario" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pedidos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cliente_id" integer NOT NULL,
	"status" "status_pedido" DEFAULT 'pendente' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "produtos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"preco" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itens_pedido_pedido_id_idx" ON "itens_pedido" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "pedidos_cliente_id_idx" ON "pedidos" USING btree ("cliente_id");
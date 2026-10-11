CREATE TYPE "public"."resultado_acao" AS ENUM('confirmada', 'recusada');--> statement-breakpoint
CREATE TYPE "public"."tipo_acao" AS ENUM('cancelar_pedido');--> statement-breakpoint
CREATE TABLE "acoes_pendentes" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" integer NOT NULL,
	"tipo" "tipo_acao" NOT NULL,
	"pedido_id" integer NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"resultado" "resultado_acao",
	"resolvida_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "acoes_pendentes" ADD CONSTRAINT "acoes_pendentes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acoes_pendentes" ADD CONSTRAINT "acoes_pendentes_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acoes_pendentes_cliente_id_idx" ON "acoes_pendentes" USING btree ("cliente_id");
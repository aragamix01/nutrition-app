CREATE TABLE "dish" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_th" text NOT NULL,
	"name_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_serving_desc" text,
	"use_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dish_component" (
	"id" serial PRIMARY KEY NOT NULL,
	"dish_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"grams" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "http_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"body" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"name_en" text NOT NULL,
	"name_th" text,
	"kcal" real NOT NULL,
	"protein_g" real NOT NULL,
	"carb_g" real NOT NULL,
	"fat_g" real NOT NULL,
	"fiber_g" real,
	"sodium_mg" real,
	"is_dish" boolean DEFAULT false NOT NULL,
	"source_url" text,
	"fetched_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "name_en")) STORED
);
--> statement-breakpoint
CREATE TABLE "meal_component" (
	"id" serial PRIMARY KEY NOT NULL,
	"meal_entry_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"grams" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_entry" (
	"id" serial PRIMARY KEY NOT NULL,
	"eaten_at" timestamp with time zone NOT NULL,
	"meal_type" text NOT NULL,
	"dish_id" integer,
	"name_th" text NOT NULL,
	"portion_multiplier" real DEFAULT 1 NOT NULL,
	"note" text,
	"kcal" real NOT NULL,
	"protein_g" real NOT NULL,
	"carb_g" real NOT NULL,
	"fat_g" real NOT NULL,
	"fiber_g" real,
	"sodium_mg" real
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"sex" text NOT NULL,
	"birth_year" integer NOT NULL,
	"height_cm" real NOT NULL,
	"activity_level" real NOT NULL,
	"goal" text NOT NULL,
	"goal_rate" real NOT NULL,
	"protein_g_per_kg" real DEFAULT 1.8 NOT NULL,
	"fat_pct" real DEFAULT 0.25 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_request_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "weight_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"weight_kg" real NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dish_component" ADD CONSTRAINT "dish_component_dish_id_dish_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dish"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_component" ADD CONSTRAINT "dish_component_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_component" ADD CONSTRAINT "meal_component_meal_entry_id_meal_entry_id_fk" FOREIGN KEY ("meal_entry_id") REFERENCES "public"."meal_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_component" ADD CONSTRAINT "meal_component_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_entry" ADD CONSTRAINT "meal_entry_dish_id_dish_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dish"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingredient_source_uq" ON "ingredient" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "ingredient_search_idx" ON "ingredient" USING gin ("search");--> statement-breakpoint
CREATE INDEX "ingredient_name_en_trgm_idx" ON "ingredient" USING gin ("name_en" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ingredient_name_th_trgm_idx" ON "ingredient" USING gin ("name_th" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "meal_entry_eaten_at_idx" ON "meal_entry" USING btree ("eaten_at");--> statement-breakpoint
CREATE UNIQUE INDEX "weight_log_date_uq" ON "weight_log" USING btree ("date");
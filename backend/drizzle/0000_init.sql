CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."kind" AS ENUM('food', 'coffee', 'hair');--> statement-breakpoint
CREATE TYPE "app"."offer_status" AS ENUM('draft', 'active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "app"."order_status" AS ENUM('sent', 'accepted', 'ready', 'done', 'missed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "app"."order_type" AS ENUM('now', 'plan');--> statement-breakpoint
CREATE TYPE "app"."pack_status" AS ENUM('pending_payment', 'active', 'used', 'expired', 'refunded', 'gifted');--> statement-breakpoint
CREATE TYPE "app"."payment_status" AS ENUM('created', 'pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "app"."staff_role" AS ENUM('owner', 'manager', 'cashier');--> statement-breakpoint
CREATE TYPE "app"."venue_status" AS ENUM('draft', 'review', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TABLE "app"."branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"address" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"hours" jsonb,
	"phone" text,
	"allows_courier" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."favorites" (
	"user_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_offer_id_pk" PRIMARY KEY("user_id","offer_id")
);
--> statement-breakpoint
CREATE TABLE "app"."gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid,
	"code" text NOT NULL,
	"message" text,
	"anonymous" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" "app"."kind" NOT NULL,
	"unit_name" text NOT NULL,
	"units" smallint NOT NULL,
	"price" integer NOT NULL,
	"regular_unit_price" integer NOT NULL,
	"valid_days" smallint DEFAULT 30 NOT NULL,
	"sizes" jsonb,
	"details" jsonb,
	"photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"promoted" boolean DEFAULT false NOT NULL,
	"status" "app"."offer_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no" bigint GENERATED ALWAYS AS IDENTITY (sequence name "app"."orders_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1),
	"type" "app"."order_type" NOT NULL,
	"pack_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone,
	"code" text NOT NULL,
	"courier" boolean DEFAULT false NOT NULL,
	"status" "app"."order_status" DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."pack_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"type" text NOT NULL,
	"units_delta" smallint DEFAULT 0 NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"units_total" smallint NOT NULL,
	"units_left" smallint NOT NULL,
	"price_paid" integer NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"status" "app"."pack_status" DEFAULT 'pending_payment' NOT NULL,
	"source" text DEFAULT 'purchase' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pack_id" uuid,
	"provider" text NOT NULL,
	"amount" integer NOT NULL,
	"status" "app"."payment_status" DEFAULT 'created' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"pack_id" uuid,
	"stars" smallint NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"cashier_id" uuid,
	"bank_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"username" text,
	"photo_url" text,
	"lang" text DEFAULT 'kk' NOT NULL,
	"city" text DEFAULT 'karaganda' NOT NULL,
	"phone" text,
	"pin_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."venue_follows" (
	"user_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_follows_user_id_venue_id_pk" PRIMARY KEY("user_id","venue_id")
);
--> statement-breakpoint
CREATE TABLE "app"."venue_staff" (
	"venue_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "app"."staff_role" NOT NULL,
	"branch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_staff_venue_id_user_id_pk" PRIMARY KEY("venue_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "app"."kind" NOT NULL,
	"city" text NOT NULL,
	"about" text,
	"logo_url" text,
	"cover_url" text,
	"rating" double precision,
	"reviews_count" integer DEFAULT 0 NOT NULL,
	"accepts_preorder" boolean DEFAULT true NOT NULL,
	"status" "app"."venue_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."branches" ADD CONSTRAINT "branches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."favorites" ADD CONSTRAINT "favorites_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "app"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gifts" ADD CONSTRAINT "gifts_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gifts" ADD CONSTRAINT "gifts_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."gifts" ADD CONSTRAINT "gifts_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."offers" ADD CONSTRAINT "offers_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pack_events" ADD CONSTRAINT "pack_events_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."packs" ADD CONSTRAINT "packs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."packs" ADD CONSTRAINT "packs_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "app"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ratings" ADD CONSTRAINT "ratings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ratings" ADD CONSTRAINT "ratings_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."redemptions" ADD CONSTRAINT "redemptions_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."redemptions" ADD CONSTRAINT "redemptions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."redemptions" ADD CONSTRAINT "redemptions_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."venue_follows" ADD CONSTRAINT "venue_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."venue_follows" ADD CONSTRAINT "venue_follows_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."venue_staff" ADD CONSTRAINT "venue_staff_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "app"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."venue_staff" ADD CONSTRAINT "venue_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."venue_staff" ADD CONSTRAINT "venue_staff_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "app"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branches_venue" ON "app"."branches" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gifts_code" ON "app"."gifts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_slug" ON "app"."offers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "offers_venue" ON "app"."offers" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_no" ON "app"."orders" USING btree ("no");--> statement-breakpoint
CREATE INDEX "orders_branch_time" ON "app"."orders" USING btree ("branch_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "pack_events_pack" ON "app"."pack_events" USING btree ("pack_id");--> statement-breakpoint
CREATE INDEX "packs_user" ON "app"."packs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_external" ON "app"."payments" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "ratings_venue" ON "app"."ratings" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "redemptions_pack" ON "app"."redemptions" USING btree ("pack_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_id" ON "app"."users" USING btree ("telegram_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_slug" ON "app"."venues" USING btree ("slug");
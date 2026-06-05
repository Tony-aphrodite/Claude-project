ALTER TABLE "roster_capacity_overrides" ADD COLUMN "blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "roster_capacity_overrides" ADD COLUMN "block_reason" text;
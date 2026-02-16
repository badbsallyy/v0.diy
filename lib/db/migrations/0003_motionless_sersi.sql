CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"visibility" varchar(20) DEFAULT 'private',
	"demo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "anonymous_chat_logs" CASCADE;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
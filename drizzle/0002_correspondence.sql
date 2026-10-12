-- This feature's tables are new and not yet carrying real data, so this migration drops
-- and recreates them outright rather than attempting in-place ALTERs. Safe to re-run.
DROP TABLE IF EXISTS `corr_offices`;
DROP TABLE IF EXISTS `corr_users`;
DROP TABLE IF EXISTS `corr_letters`;
DROP TABLE IF EXISTS `corr_letter_movements`;
DROP TABLE IF EXISTS `corr_letter_attachments`;
DROP TABLE IF EXISTS `corr_notifications`;
DROP TABLE IF EXISTS `corr_notification_log`;
DROP TABLE IF EXISTS `corr_mailboxes`;
DROP TABLE IF EXISTS `corr_mock_inbox`;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `corr_offices` (
	`id` TEXT PRIMARY KEY,
	`name` TEXT NOT NULL,
	`is_active` INTEGER NOT NULL DEFAULT 1,
	`created_at` INTEGER NOT NULL,
	`updated_at` INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `corr_users` (
	`id` TEXT PRIMARY KEY,
	`external_id` TEXT,
	`email` TEXT NOT NULL,
	`display_name` TEXT NOT NULL,
	`phone` TEXT,
	`role` TEXT NOT NULL,
	`office_id` TEXT,
	`is_active` INTEGER NOT NULL DEFAULT 1,
	`created_at` INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `corr_letters` (
	`id` TEXT PRIMARY KEY,
	`reference_number` TEXT NOT NULL,
	`source` TEXT NOT NULL,
	`subject` TEXT NOT NULL,
	`sender_name` TEXT NOT NULL,
	`sender_contact` TEXT,
	`received_at` INTEGER NOT NULL,
	`registered_at` INTEGER NOT NULL,
	`registered_by_user_id` TEXT,
	`original_location_note` TEXT,
	`office_id` TEXT NOT NULL,
	`assigned_officer_id` TEXT,
	`status` TEXT NOT NULL,
	`forward_to_office_id` TEXT,
	`forward_authorised_by_user_id` TEXT,
	`forward_authorised_at` INTEGER,
	`last_return_reason` TEXT,
	`last_return_at` INTEGER,
	`outcome_text` TEXT,
	`outcome_recorded_at` INTEGER,
	`outcome_recorded_by_user_id` TEXT,
	`last_correction_at` INTEGER
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `corr_letter_movements` (
	`id` TEXT PRIMARY KEY,
	`letter_id` TEXT NOT NULL,
	`at` INTEGER NOT NULL,
	`actor_user_id` TEXT,
	`actor_name` TEXT NOT NULL,
	`actor_role` TEXT NOT NULL,
	`type` TEXT NOT NULL,
	`from_office_id` TEXT,
	`to_office_id` TEXT,
	`from_officer_id` TEXT,
	`to_officer_id` TEXT,
	`note` TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `corr_letter_attachments` (
	`id` TEXT PRIMARY KEY,
	`letter_id` TEXT NOT NULL,
	`kind` TEXT NOT NULL,
	`storage_key` TEXT NOT NULL,
	`file_name` TEXT NOT NULL,
	`mime_type` TEXT NOT NULL,
	`size` INTEGER NOT NULL,
	`uploaded_by_user_id` TEXT,
	`uploaded_at` INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `corr_notifications` (
	`id` TEXT PRIMARY KEY,
	`user_id` TEXT NOT NULL,
	`letter_id` TEXT,
	`type` TEXT NOT NULL,
	`message` TEXT NOT NULL,
	`created_at` INTEGER NOT NULL,
	`read_at` INTEGER
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `corr_notification_log` (
	`id` TEXT PRIMARY KEY,
	`channel` TEXT NOT NULL,
	`recipient` TEXT NOT NULL,
	`subject` TEXT,
	`body` TEXT NOT NULL,
	`status` TEXT NOT NULL,
	`letter_id` TEXT,
	`created_at` INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `corr_mailboxes` (
	`id` TEXT PRIMARY KEY,
	`office_id` TEXT NOT NULL,
	`provider` TEXT NOT NULL,
	`address` TEXT NOT NULL,
	`is_active` INTEGER NOT NULL DEFAULT 1,
	`created_at` INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `corr_mock_inbox` (
	`id` TEXT PRIMARY KEY,
	`mailbox_id` TEXT NOT NULL,
	`from_address` TEXT NOT NULL,
	`subject` TEXT NOT NULL,
	`body` TEXT NOT NULL,
	`received_at` INTEGER NOT NULL,
	`processed` INTEGER NOT NULL DEFAULT 0
);

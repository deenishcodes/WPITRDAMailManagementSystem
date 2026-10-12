CREATE TABLE `role_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`expires` integer NOT NULL
);

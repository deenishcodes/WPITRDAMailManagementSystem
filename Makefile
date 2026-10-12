# Local development commands for LSF Correspondence.
# Requires Node.js 22+ and GNU Make (for example, via Git for Windows).

.DEFAULT_GOAL := help

.PHONY: help setup dev check build serve db-generate db-migrate clean

help: ## List available commands
	@echo Local LSF Correspondence commands:
	@echo   make setup        Install the locked project dependencies
	@echo   make dev          Start the local development workspace
	@echo   make check        Run TypeScript and lint checks
	@echo   make build        Create a production build
	@echo   make serve        Build, then run the local Worker
	@echo   make db-generate  Generate a Drizzle database migration
	@echo   make db-migrate   Apply the correspondence schema to the local database
	@echo   make clean        Remove local build output and local runtime state

setup: ## Install dependencies from the lockfile
	npm run install:ci

dev: ## Start the development workspace
	npm run dev

check: ## Verify TypeScript and linting
	node node_modules/typescript/bin/tsc --noEmit
	npm run lint

build: ## Build for local production use
	npm run build

serve: build ## Run the built application locally
	npm run start

db-generate: ## Generate a new Drizzle migration after schema changes
	npm run db:generate

db-migrate: build ## Apply pending Drizzle migrations to the local database
	-node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_medical_paladin.sql
	-node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_mixed_forgotten_one.sql
	node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_correspondence.sql
	node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_modern_crusher_hogan.sql

clean: ## Remove local build output and local persistent runtime state
	node -e "for (const p of ['dist','.wrangler/state','tsconfig.tsbuildinfo']) require('fs').rmSync(p,{recursive:true,force:true})"

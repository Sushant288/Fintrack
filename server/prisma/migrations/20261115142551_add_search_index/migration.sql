CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Transaction_description_trgm_idx" ON "Transaction" USING gin (description gin_trgm_ops);

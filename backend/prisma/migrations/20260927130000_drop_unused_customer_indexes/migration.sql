-- Drop indexes that cannot earn their storage.
--
-- The `init` migration created both a plain and a unique index over the identical
-- column list on Customer:
--
--   CREATE INDEX       "Customer_businessId_phone_idx" ON "Customer"("businessId", "phone");
--   CREATE UNIQUE INDEX "Customer_businessId_phone_key" ON "Customer"("businessId", "phone");
--
-- Same columns, same order. The unique index satisfies every lookup the plain one could,
-- so Postgres has no reason to choose the second, yet it is maintained on every insert
-- and every update of those columns. The application only ever addresses customers
-- through the unique key (`businessId_phone`), so the plain index is pure overhead.
--
-- `Customer_businessId_name_idx` goes for a different reason: customer search is a
-- case-insensitive substring match (`contains`), which a btree index cannot serve. The
-- planner would have to fall back to a sequential scan anyway, so the index only added
-- write amplification and storage. Substring search wants a trigram index, which is
-- worth adding deliberately if search ever becomes slow enough to justify its size.

-- DropIndex
DROP INDEX IF EXISTS "Customer_businessId_phone_idx";

-- DropIndex
DROP INDEX IF EXISTS "Customer_businessId_name_idx";

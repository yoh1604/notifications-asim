import { Pool, type QueryResultRow } from "pg";

const globalForPg = globalThis as typeof globalThis & {
  pgPool?: Pool;
  pgConnectionString?: string;
};

function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL belum diset. Isi .env.local terlebih dahulu.");
  }

  if (
    !globalForPg.pgPool ||
    globalForPg.pgConnectionString !== connectionString
  ) {
    globalForPg.pgPool = new Pool({ connectionString });
    globalForPg.pgConnectionString = connectionString;
  }

  return globalForPg.pgPool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return getPool().query<T>(text, params);
}

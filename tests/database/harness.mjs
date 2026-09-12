import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

export async function replay() {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL("./bootstrap.sql", import.meta.url), "utf8"));
    const dir = new URL("../../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(dir)).filter(f => f.endsWith(".sql")).sort()) {
      try { await db.exec(await readFile(new URL(file, dir), "utf8")); }
      catch (error) { throw new Error("Migration failed: " + file + ": " + error.message, { cause: error }); }
    }
    return db;
  } catch (error) { await db.close(); throw error; }
}


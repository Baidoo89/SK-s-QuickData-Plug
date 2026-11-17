import { readFile } from "node:fs/promises"
import { PrismaClient } from "@prisma/client"
import { projectRoot, readLocalConfig, databaseUrl, assertLocalDatabase } from "./local-environment.mjs"
import path from "node:path"

// Read-only, local-only inventory. No values, account IDs or secrets are emitted.
const schema = (await readFile(path.join(projectRoot, "prisma/schema.prisma"), "utf8")).replaceAll("\r", "")
const columns = []
for (const model of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  for (const field of model[2].matchAll(/^\s+(\w+)\s+Float\b/gm)) {
    if (field[1] !== "commissionPercent") columns.push({ table: model[1], column: field[1] })
  }
}
if (!columns.length) throw new Error("No monetary columns found")
const config = readLocalConfig()
const results = []
for (const database of ["quickdata_dev", "quickdata_integration"]) {
  const url = assertLocalDatabase(databaseUrl(config, database), database)
  const client = new PrismaClient({ datasources: { db: { url } } })
  const fields = []
  try {
    for (const { table, column } of columns) {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(table) || !/^[A-Za-z][A-Za-z0-9]*$/.test(column)) throw new Error("Unexpected schema identifier")
      const rows = await client.$queryRawUnsafe(`SELECT COUNT(*)::text AS rows, COUNT(*) FILTER (WHERE "${column}"::text IN ('NaN', 'Infinity', '-Infinity') OR "${column}"::numeric * 100 <> ROUND("${column}"::numeric * 100) OR ABS("${column}"::numeric * 100) > 9007199254740991)::text AS flagged FROM "${table}"`)
      fields.push({ table, column, rows: Number(rows[0].rows), flaggedRows: Number(rows[0].flagged) })
    }
    results.push({ database, fields, requiresReview: fields.some(field => field.flaggedRows > 0) })
  } finally { await client.$disconnect() }
}
console.log(JSON.stringify({ checkedUtc: new Date().toISOString(), scope: "isolated local databases only", results }, null, 2))

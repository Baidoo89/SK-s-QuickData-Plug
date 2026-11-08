import { createHash, randomBytes } from "node:crypto"
import { createReadStream, createWriteStream, existsSync } from "node:fs"
import { mkdir, readFile, writeFile, rename } from "node:fs/promises"
import { execFileSync, spawnSync } from "node:child_process"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import path from "node:path"
import { projectRoot, localRoot, configPath, databasePort, readLocalConfig, localEnvironment } from "./local-environment.mjs"

const version = "17.11-3"
const archiveName = `postgresql-${version}-windows-x64-binaries.zip`
const archivePath = path.join(localRoot, archiveName)
const binaryRoot = path.join(localRoot, "postgresql")
const dataDirectory = path.join(localRoot, "postgres-data")
const bin = name => path.join(binaryRoot, "pgsql", "bin", `${name}.exe`)
const options = { cwd: projectRoot, windowsHide: true, stdio: "inherit" }

function run(file, args, env = process.env) {
  return execFileSync(file, args, { ...options, env })
}

function running() {
  if (!existsSync(bin("pg_ctl"))) return false
  return spawnSync(bin("pg_ctl"), ["status", "-D", dataDirectory], { cwd: projectRoot, windowsHide: true, encoding: "utf8" }).status === 0
}

async function ensureBinaries() {
  if (existsSync(bin("postgres"))) return
  await mkdir(localRoot, { recursive: true })
  if (!existsSync(archivePath)) {
    console.log("Downloading portable PostgreSQL into .local (no system installation)...")
    const response = await fetch(`https://get.enterprisedb.com/postgresql/${archiveName}`)
    if (!response.ok || !response.body) throw new Error("Could not download portable PostgreSQL")
    const temporary = `${archivePath}.partial-${Date.now()}`
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary))
    await rename(temporary, archivePath)
  }
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(archivePath)) hash.update(chunk)
  if (hash.digest("hex") !== "4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf") throw new Error("PostgreSQL archive checksum does not match the publisher checksum")
  const quote = text => `'${text.replaceAll("'", "''")}'`
  run("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath ${quote(archivePath)} -DestinationPath ${quote(binaryRoot)} -Force`])
}

async function initialize() {
  await ensureBinaries()
  if (!existsSync(configPath)) {
    await writeFile(configPath, JSON.stringify({
      kind: "quickdata-local-only-v1", databasePassword: randomBytes(24).toString("hex"),
      authSecret: randomBytes(32).toString("hex"), encryptionKey: randomBytes(32).toString("hex"),
      accountPassword: randomBytes(18).toString("base64url"),
    }, null, 2), { flag: "wx", mode: 0o600 })
  }
  const config = readLocalConfig()
  const versionPath = path.join(dataDirectory, "PG_VERSION")
  if (!existsSync(versionPath)) {
    const passwordPath = path.join(localRoot, "postgres.password")
    await writeFile(passwordPath, `${config.databasePassword}\n`, { mode: 0o600 })
    run(bin("initdb"), ["-D", dataDirectory, "-U", "quickdata_local", "--auth=scram-sha-256", "--pwfile", passwordPath, "--encoding=UTF8", "--no-locale"])
  } else if ((await readFile(versionPath, "utf8")).trim() !== "17") {
    throw new Error("The local database directory uses a different PostgreSQL major version")
  }
  await writeFile(path.join(dataDirectory, "postgresql.auto.conf"), `listen_addresses = '127.0.0.1'\nport = ${databasePort}\nmax_connections = 40\nshared_buffers = '32MB'\n`, "utf8")
  return config
}

function start() {
  if (!existsSync(path.join(dataDirectory, "PG_VERSION"))) throw new Error("Run npm run setup:local first")
  if (!running()) run(bin("pg_ctl"), ["start", "-D", dataDirectory, "-o", `-h 127.0.0.1 -p ${databasePort}`, "-l", path.join(localRoot, "postgres.log"), "-w", "-t", "30"])
  console.log(`Local PostgreSQL is ready at 127.0.0.1:${databasePort}.`)
}

function ensureDatabases(config) {
  const env = { ...process.env, PGPASSWORD: config.databasePassword }
  for (const database of ["quickdata_dev", "quickdata_integration"]) {
    const existing = execFileSync(bin("psql"), ["-h", "127.0.0.1", "-p", String(databasePort), "-U", "quickdata_local", "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname = '${database}'`], { cwd: projectRoot, env, windowsHide: true, encoding: "utf8" }).trim()
    if (existing !== "1") run(bin("createdb"), ["-h", "127.0.0.1", "-p", String(databasePort), "-U", "quickdata_local", database], env)
  }
}

function migrate(config) {
  for (const database of ["quickdata_dev", "quickdata_integration"]) {
    console.log(`Applying project migrations to ${database}...`)
    run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"], localEnvironment(config, database))
  }
}

async function main() {
  if (process.platform !== "win32") throw new Error("This portable database helper targets Windows x64")
  const action = process.argv[2] ?? "status"
  if (action === "setup") {
    const config = await initialize()
    start()
    ensureDatabases(config)
    migrate(config)
    run(process.execPath, ["scripts/seed-local.mjs"], localEnvironment(config))
  } else if (action === "start") start()
  else if (action === "stop") {
    if (running()) run(bin("pg_ctl"), ["stop", "-D", dataDirectory, "-m", "fast", "-w", "-t", "30"])
    console.log("Local PostgreSQL stopped.")
  } else if (action === "migrate") { const config = readLocalConfig(); start(); ensureDatabases(config); migrate(config) }
  else if (action === "status") console.log(running() ? `Local PostgreSQL is running on port ${databasePort}.` : "Local PostgreSQL is stopped.")
  else throw new Error("Use setup, start, stop, migrate, or status")
}

main().catch(() => {
  // Child commands print their own diagnostics; keep connection secrets out of
  // generic exception objects and command wrappers.
  console.error("Local database command failed. Check the preceding diagnostic or .local/postgres.log.")
  process.exitCode = 1
})

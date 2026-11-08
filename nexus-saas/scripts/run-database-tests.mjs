import { execFileSync } from "node:child_process"
import { projectRoot, readLocalConfig, localEnvironment } from "./local-environment.mjs"

const config = readLocalConfig()
execFileSync(process.execPath, ["scripts/local-db.mjs", "start"], { cwd: projectRoot, windowsHide: true, stdio: "inherit" })
const env = localEnvironment(config, "quickdata_integration")
env.QUICKDATA_DATABASE_INTEGRATION = "1"
env.QUICKDATA_TEST_DATABASE_URL = env.DATABASE_URL
try {
  execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.database.config.mts"], { cwd: projectRoot, env, windowsHide: true, stdio: "inherit" })
} catch { process.exitCode = 1 }

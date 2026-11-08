import { execFileSync } from "node:child_process"
import { projectRoot, readLocalConfig, localEnvironment } from "./local-environment.mjs"

const config = readLocalConfig()
const env = localEnvironment(config)
env.QUICKDATA_PAYSTACK_TEST = "1"
try {
  execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.paystack.config.mts"], { cwd: projectRoot, env, windowsHide: true, stdio: "inherit" })
} catch { process.exitCode = 1 }

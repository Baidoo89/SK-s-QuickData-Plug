import { spawn, execFileSync } from "node:child_process"
import { projectRoot, readLocalConfig, localEnvironment, appPort } from "./local-environment.mjs"

const config = readLocalConfig()
execFileSync(process.execPath, ["scripts/local-db.mjs", "start"], { cwd: projectRoot, windowsHide: true, stdio: "inherit" })
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(appPort)], { cwd: projectRoot, env: localEnvironment(config), windowsHide: true, stdio: "inherit" })
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
child.on("exit", code => { process.exitCode = code ?? 0 })

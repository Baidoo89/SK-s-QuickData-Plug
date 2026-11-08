import { fileURLToPath } from "node:url"
import base from "../../../tailwind.config"

export default {
  ...base,
  content: [
    fileURLToPath(new URL("../../../src/**/*.{ts,tsx}", import.meta.url)),
    fileURLToPath(new URL("./app/**/*.{ts,tsx}", import.meta.url)),
  ],
}

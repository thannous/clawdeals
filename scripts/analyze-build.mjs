import { spawnSync } from "node:child_process";
import path from "node:path";

const nextBinPath = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextBinPath, "build", "--webpack"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ANALYZE: "true"
  }
});

if (result.error) {
  throw result.error;
}

process.exit(typeof result.status === "number" ? result.status : 1);

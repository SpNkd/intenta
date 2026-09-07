import { spawnSync } from "node:child_process";

const machine =
  process.platform === "darwin"
    ? spawnSync("/usr/bin/uname", ["-m"], { encoding: "utf8" }).stdout.trim()
    : process.arch;
const useNativeAppleSilicon =
  process.platform === "darwin" && (process.arch === "arm64" || machine === "arm64");
const command = useNativeAppleSilicon ? "/usr/bin/arch" : "uv";
const args = useNativeAppleSilicon
  ? ["-arm64", "uv", ...process.argv.slice(2)]
  : process.argv.slice(2);

const result = spawnSync(command, args, {
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

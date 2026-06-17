import { spawn } from "node:child_process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const processes = [
  spawn(npmCmd, ["run", "dev", "-w", "server"], { stdio: "inherit" }),
  spawn(npmCmd, ["run", "dev", "-w", "client"], { stdio: "inherit" })
];

function shutdown(signal) {
  for (const child of processes) child.kill(signal);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

for (const child of processes) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown("SIGTERM");
      process.exit(code);
    }
  });
}

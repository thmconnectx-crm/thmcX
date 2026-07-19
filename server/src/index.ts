import { app } from "./app.js";
import { env } from "./config.js";
import { startReportMonitor } from "./services/report-monitor.service.js";

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
const stopReportMonitor = startReportMonitor();

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Closing HTTP server...`);
  stopReportMonitor();

  const timeout = setTimeout(() => {
    console.error("Graceful shutdown timeout reached. Exiting.");
    process.exit(1);
  }, 10000);
  timeout.unref();

  server.close((error) => {
    if (error) {
      console.error("HTTP server shutdown failed:", error);
      process.exit(1);
    }
    clearTimeout(timeout);
    console.log("HTTP server closed.");
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

import { DEFAULT_BROKER_HOST } from "@torii/contracts";
import { parseBrokerPort, startTorii } from "./server.js";

const runtime = await startTorii({ port: parseBrokerPort(process.env.TORII_BROKER_PORT) });
const endpoint = runtime.broker.address();
if (endpoint === null) throw new Error("Broker did not report its listening address");
process.stderr.write(
  `Torii broker listening at ws://${DEFAULT_BROKER_HOST}:${endpoint.port}.\n` +
    `Pair this Firefox addon once with code: ${runtime.pairingCode.value}\n` +
    `The code expires at ${runtime.pairingCode.expiresAt.toISOString()} and is shown only on stderr.\n`
);

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await runtime.close();
}

process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));

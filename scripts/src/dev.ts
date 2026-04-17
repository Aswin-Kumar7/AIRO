import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

type ProcessSpec = {
  label: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDir, "..", "..");
const pnpmCommand = "pnpm";

const fileEnv = loadEnvFile(path.join(workspaceRoot, ".env.local"));
const sharedEnv: NodeJS.ProcessEnv = {
  ...process.env,
  ...fileEnv,
};

const apiPort = parsePort(sharedEnv.API_PORT ?? sharedEnv.PORT ?? "4000", "API_PORT");
const frontendPort = parsePort(sharedEnv.FRONTEND_PORT ?? "3000", "FRONTEND_PORT");
const nodeEnv = sharedEnv.NODE_ENV ?? "development";

sharedEnv.API_PORT = String(apiPort);
sharedEnv.BASE_PATH ??= "/";
sharedEnv.NODE_ENV = nodeEnv;

const processes: ChildProcess[] = [];
let shuttingDown = false;

console.log(`Starting API on http://localhost:${apiPort}`);
console.log(`Starting frontend on http://localhost:${frontendPort}`);

const apiPortInUse = await isPortInUse(apiPort);
const frontendPortInUse = await isPortInUse(frontendPort);

if (apiPortInUse) {
  console.log(`API port ${apiPort} is already in use. Reusing the existing service.`);
} else {
  processes.push(
    startProcess({
      label: "api",
      args: ["--filter", "@workspace/api-server", "run", "dev"],
      env: {
        ...sharedEnv,
        PORT: String(apiPort),
      },
    }),
  );
}

if (frontendPortInUse) {
  console.log(`Frontend port ${frontendPort} is already in use. Reusing the existing service.`);
} else {
  processes.push(
    startProcess({
      label: "web",
      args: ["--filter", "@workspace/ai-readiness", "run", "dev"],
      env: {
        ...sharedEnv,
        PORT: String(frontendPort),
        API_PORT: String(apiPort),
      },
    }),
  );
}

if (processes.length === 0) {
  console.log("Backend and frontend are already running on the configured ports.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function loadEnvFile(filePath: string): NodeJS.ProcessEnv {
  if (!existsSync(filePath)) {
    return {};
  }

  const env: NodeJS.ProcessEnv = {};

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function parsePort(rawValue: string, name: string): number {
  const port = Number(rawValue);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid ${name} value: ${rawValue}`);
  }

  return port;
}

function startProcess(spec: ProcessSpec): ChildProcess {
  const child = spawn(pnpmCommand, spec.args, {
    cwd: workspaceRoot,
    env: normalizeEnv(spec.env),
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
  });

  pipeOutput(child.stdout, spec.label, process.stdout);
  pipeOutput(child.stderr, spec.label, process.stderr);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[${spec.label}] exited with ${detail}`);

    shutdown(code ?? 1);
  });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }

    console.error(`[${spec.label}] failed to start`, error);
    shutdown(1);
  });

  return child;
}

function isPortInUse(port: number): Promise<boolean> {
  return Promise.all([
    canConnect(port, "127.0.0.1"),
    canConnect(port, "::1"),
    canConnect(port, "localhost"),
  ]).then((results) => results.some(Boolean));
}

function canConnect(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });

    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.setTimeout(500);
  });
}

function normalizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }

  return normalized;
}

function pipeOutput(
  stream: NodeJS.ReadableStream | null,
  label: string,
  target: NodeJS.WriteStream,
) {
  if (!stream) {
    return;
  }

  let buffer = "";

  stream.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      target.write(`[${label}] ${line}\n`);
    }
  });

  stream.on("end", () => {
    if (buffer) {
      target.write(`[${label}] ${buffer}\n`);
    }
  });
}

function shutdown(exitCode: number) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of processes) {
    terminateProcess(child);
  }

  process.exit(exitCode);
}

function terminateProcess(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    const taskkill = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });

    taskkill.unref();
    return;
  }

  child.kill("SIGTERM");
}
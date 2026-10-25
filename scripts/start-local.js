const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const http = require("node:http");

const root = path.resolve(__dirname, "..");
const children = [];
let stopping = false;

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

function hasGovernmentAdminApi(port = 5000) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path: "/api/government/admin/dashboard?demo=true", timeout: 2000 }, response => {
      response.resume();
      if (response.statusCode === 401 || response.statusCode === 403 || response.statusCode === 200) resolve(true);
      else if (response.statusCode === 404) resolve(false);
      else reject(new Error(`Government administration API health probe returned HTTP ${response.statusCode}.`));
    });
    request.on("timeout", () => request.destroy(new Error("API health probe timed out.")));
    request.on("error", reject);
  });
}

async function waitForPort(port, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isPortOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function startProcess(label, args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env });
  child.on("error", (error) => {
    console.error(`[${label}] ${error.message}`);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`[${label}] exited with code ${code ?? "unknown"}`);
      stop(code || 1);
    }
  });
  children.push(child);
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = code;
}

async function start() {
  if (!await isPortOpen(27017)) {
    console.log("MongoDB is not running; starting the local MongoDB container...");
    const result = spawnSync("docker", ["compose", "up", "-d", "mongodb"], { cwd: root, stdio: "inherit" });
    if (result.error || result.status !== 0) {
      throw new Error("MongoDB is unavailable. Start the MongoDB service or install Docker Desktop so docker compose can start it.");
    }
    if (!await waitForPort(27017)) throw new Error("MongoDB did not become ready on port 27017.");
  }

  if (!await isPortOpen(5000)) {
    console.log("Starting Express API on port 5000...");
    startProcess("API", ["server/index.js"]);
    if (!await waitForPort(5000)) throw new Error("API did not start on port 5000; check the API output above.");
  } else {
    console.log("Using the existing API on port 5000.");
  }
  if (!await hasGovernmentAdminApi()) {
    throw new Error("An older API server is running on port 5000 and does not include the Government Administration endpoints. Stop that API process, then run npm start again so the current server/index.js is loaded.");
  }

  if (!await isPortOpen(5173)) {
    console.log("Starting Vite on port 5173...");
    startProcess("Vite", ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]);
    if (!await waitForPort(5173)) throw new Error("Vite did not start on port 5173; check the Vite output above.");
  } else {
    console.log("Using the existing Vite server on port 5173.");
  }

  console.log("BioSecure Farm is ready at http://localhost:5173/");
  console.log("For other devices on this network, open http://<this-computer-LAN-IP>:5173/");
  console.log("Press Ctrl+C to stop services started by this script.");
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

start().catch((error) => {
  console.error(`[Startup] ${error.message}`);
  stop(1);
});

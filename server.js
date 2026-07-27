const express = require("express");
const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3847;
const DATA_DIR = process.env.CAMUTIL_DATA_DIR || __dirname;
const PRESETS_DIR = path.join(DATA_DIR, "presets");
const UVCC_SCRIPT = path.join(__dirname, "node_modules", "uvcc", "dist", "index.js");
const NATIVE_UVC_HELPER = path.join(__dirname, "native", "bin", "uvc_iokit");
let uvccQueue = Promise.resolve();

if (!fs.existsSync(PRESETS_DIR)) fs.mkdirSync(PRESETS_DIR, { recursive: true });

app.use(express.json());
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

function deviceArgs(query) {
  const args = [];
  if (query.vendor) args.push("--vendor", String(query.vendor));
  if (query.product) args.push("--product", String(query.product));
  if (query.address) args.push("--address", String(query.address));
  return args;
}

function uvcc(args, query = {}) {
  const devArgs = deviceArgs(query);
  const run = () => new Promise((resolve, reject) => {
    // uvcc/libusb can only reliably open a camera one operation at a time.
    execFile(process.execPath, [UVCC_SCRIPT, ...devArgs, ...args], { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      const output = stdout.trim();
      try {
        resolve(JSON.parse(output));
      } catch {
        resolve(output);
      }
    });
  });

  const result = uvccQueue.then(run, run);
  uvccQueue = result.catch(() => {});
  return result;
}

function nativeExposure(value, query = {}) {
  const run = () => new Promise((resolve, reject) => {
    execFile(
      NATIVE_UVC_HELPER,
      [String(query.vendor), String(query.product), String(value)],
      { timeout: 10000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message).trim()));
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          reject(new Error(`Invalid native UVC response: ${stdout.trim()}`));
        }
      }
    );
  });
  const result = uvccQueue.then(run, run);
  uvccQueue = result.catch(() => {});
  return result;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/diagnostic", (req, res) => {
  const event = {
    time: new Date().toISOString(),
    type: String(req.body?.type || "client"),
    requested: Number(req.body?.requested),
    cameraValue: Number(req.body?.cameraValue),
    previewLuma: Number(req.body?.previewLuma),
    details: req.body?.details && typeof req.body.details === "object"
      ? req.body.details
      : undefined,
  };
  console.log(`[client-diagnostic] ${JSON.stringify(event)}`);
  res.json({ ok: true });
});

app.get("/api/devices", async (_req, res) => {
  try {
    res.json(await uvcc(["devices"]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/controls", async (req, res) => {
  try {
    const controls = await uvcc(["controls"], req.query);
    const ranges = await uvcc(["ranges"], req.query);
    const values = await uvcc(["export"], req.query);
    res.json({ controls, ranges, values });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/set", async (req, res) => {
  const { control, value, vendor, product, address, verify } = req.body;
  if (!control || value === undefined) {
    return res.status(400).json({ error: "control and value required" });
  }
  try {
    let exposureDiagnostic = null;
    let nativeExposureResult = null;
    const useNativeKiyoExposure = control === "absolute_exposure_time" &&
      process.platform === "darwin" && fs.existsSync(NATIVE_UVC_HELPER) &&
      Number(vendor) === 0x1532 && Number(product) === 0x0e08;

    if (control === "absolute_exposure_time") {
      const exposureMode = await uvcc(["get", "auto_exposure_mode"], { vendor, product, address });
      const exposureBefore = await uvcc(["get", "absolute_exposure_time"], { vendor, product, address });
      exposureDiagnostic = {
        requested: Number(value),
        before: Number(exposureBefore),
        modeBefore: Number(exposureMode),
        transport: useNativeKiyoExposure ? "iokit" : "libusb",
      };
      if (useNativeKiyoExposure) {
        nativeExposureResult = await nativeExposure(value, { vendor, product });
      } else if (Number(exposureMode) !== 1) {
        await uvcc(["set", "auto_exposure_mode", "1"], { vendor, product, address });
      }
    }
    if (!nativeExposureResult) {
      const args = Array.isArray(value)
        ? ["set", control, ...value.map(String)]
        : ["set", control, String(value)];
      await uvcc(args, { vendor, product, address });
    }
    let acceptedValue = nativeExposureResult?.value ??
      (verify || exposureDiagnostic
        ? await uvcc(["get", control], { vendor, product, address })
        : value);
    if (exposureDiagnostic) {
      exposureDiagnostic.immediate = Number(acceptedValue);
      await new Promise((resolve) => setTimeout(resolve, 300));
      acceptedValue = await uvcc(["get", control], { vendor, product, address });
      exposureDiagnostic.settled = Number(acceptedValue);
      exposureDiagnostic.modeAfter = Number(
        await uvcc(["get", "auto_exposure_mode"], { vendor, product, address })
      );
      console.log(`[exposure] ${JSON.stringify(exposureDiagnostic)}`);
    }
    res.json({ ok: true, value: acceptedValue, diagnostic: exposureDiagnostic });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/presets", (_req, res) => {
  const files = fs.readdirSync(PRESETS_DIR).filter((f) => f.endsWith(".json"));
  const presets = files.map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, f), "utf8"));
    return { name: path.basename(f, ".json"), ...data };
  });
  res.json(presets);
});

app.post("/api/presets/save", async (req, res) => {
  const { name, vendor, product, address } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const values = await uvcc(["export"], { vendor, product, address });
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    fs.writeFileSync(
      path.join(PRESETS_DIR, `${sanitized}.json`),
      JSON.stringify({ savedAt: new Date().toISOString(), values }, null, 2)
    );
    res.json({ ok: true, name: sanitized });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/presets/load", async (req, res) => {
  const { name, vendor, product, address } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = path.join(PRESETS_DIR, `${sanitized}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "preset not found" });
  try {
    const { values } = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const stdin = JSON.stringify(values);
    const devArgs = deviceArgs({ vendor, product, address });
    await new Promise((resolve, reject) => {
      const proc = spawn(process.execPath, [UVCC_SCRIPT, ...devArgs, "import"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      proc.stdin.write(stdin);
      proc.stdin.end();
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      proc.on("error", reject);
    });
    res.json({ ok: true, values });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/presets/:name", (req, res) => {
  const sanitized = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = path.join(PRESETS_DIR, `${sanitized}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`4U2CtheUVC running at http://localhost:${PORT}`);
});

server.on("error", (error) => {
  console.error(`Could not start server: ${error.message}`);
  process.exitCode = 1;
});

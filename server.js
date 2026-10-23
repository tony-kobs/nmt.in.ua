const { createServer } = require("http");
const fs = require("fs");
const path = require("path");
const next = require("next");
const {
  loadEnvFile,
  readMaxBodyBytes,
  rejectOversizedBody,
} = require("./lib/serverBodyLimit.cjs");
const { healthBody, siteTmpDir } = require("./lib/siteHealth.cjs");

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const dir = __dirname;

// The panel starts this file itself and does not source the deploy script.
// Keep uploads out of the account-wide PHP tmp.
const siteTmp = siteTmpDir(dir);
fs.mkdirSync(siteTmp, { recursive: true });
process.env.TMPDIR = siteTmp;

if (process.env.NODE_ENV === "production") {
  loadEnvFile(path.join(dir, ".env.production"));
  const origin = "https://nmt.in.ua";
  const site = String(process.env.SITE_URL || "").trim();
  if (!site || /localhost|127\.0\.0\.1/i.test(site)) {
    process.env.SITE_URL = origin;
  }
  if (!String(process.env.MAIL_SITE_URL || "").trim()) {
    process.env.MAIL_SITE_URL = process.env.SITE_URL;
  }
}

const portEnv = process.env.PORT || "3000";
const isSocket = portEnv.includes("/") || portEnv.endsWith(".sock");
const port = isSocket ? portEnv : parseInt(portEnv, 10);
const hostname = process.env.HOST || process.env.HOSTNAME || "127.0.0.1";
const dev = process.env.NODE_ENV !== "production";
const maxBodyBytes = readMaxBodyBytes();

if (!dev && !fs.existsSync(path.join(dir, ".next"))) {
  console.error("Немає збірки. Спочатку виконайте: npm run build");
  process.exit(1);
}

const app = next({ dev, hostname, port, dir });
const handle = app.getRequestHandler();

function isHealthRequest(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const pathOnly = String(req.url || "/").split("?")[0];
  return pathOnly === "/health" || pathOnly === "/health/";
}

app.prepare().then(() => {
  createServer((req, res) => {
    if (isHealthRequest(req)) {
      const body = healthBody(dir);
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }
    if (rejectOversizedBody(req, res, maxBodyBytes)) {
      return;
    }
    handle(req, res);
  })
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(...(isSocket ? [port] : [port, hostname]), () => {
      console.log(
        isSocket
          ? `> Ready on socket ${port} (${process.env.NODE_ENV}, maxBody=${maxBodyBytes})`
          : `> Ready on http://${hostname}:${port} (${process.env.NODE_ENV}, maxBody=${maxBodyBytes})`,
      );
    });
});

// Dev-only helper: full-page screenshots at fixed breakpoints via Chrome DevTools Protocol.
// Chrome Headless on Windows refuses windows narrower than ~500px, so viewport size is
// forced through Emulation.setDeviceMetricsOverride instead of --window-size.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const OUT = process.env.SHOT_OUT ?? "./shots";
const PORT = 9333;

const targets = process.argv.slice(2);
const pages = targets.length ? targets : ["/"];
const widths = [375, 768, 1440];

mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  "--headless=new",
  "--hide-scrollbars",
  "--disable-gpu",
  "--no-first-run",
  "--user-data-dir=" + (process.env.TEMP ?? "/tmp") + "/shot-profile",
  "about:blank",
]);
chrome.on("error", (err) => {
  console.error("chrome failed:", err.message);
  process.exit(1);
});

async function cdpTargets() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("chrome debugger never came up");
}

const target = await cdpTargets();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
// Reveal animations rely on IntersectionObserver; reduced motion renders their end state.
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});

if (process.env.SHOT_DEMO) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${BASE}/login` });
  await sleep(2500);
  // /login no longer carries demo cards — fill the real form instead.
  await send("Runtime.evaluate", {
    expression: `(function () {
      const login = document.querySelector('input[name="login"]');
      const password = document.querySelector('input[name="password"]');
      if (!login || !password) return "no login form";
      const setValue = (el, value) => {
        Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        ).set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setValue(login, ${JSON.stringify(process.env.SHOT_LOGIN ?? "demo-student")});
      setValue(password, ${JSON.stringify(process.env.SHOT_PASSWORD ?? "demo123")});
      document.querySelector("form")?.requestSubmit();
      return "submitted";
    })()`,
    userGesture: true,
    returnByValue: true,
  });
  await sleep(6000);
}

for (const path of pages) {
  for (const width of widths) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await send("Page.navigate", { url: BASE + path });
    await sleep(2500);
    const { data } = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    const name = `${path.replace(/\W+/g, "_") || "root"}-${width}.png`;
    writeFileSync(`${OUT}/${name}`, Buffer.from(data, "base64"));
    console.log("saved", `${OUT}/${name}`);
  }
}

ws.close();
chrome.kill();

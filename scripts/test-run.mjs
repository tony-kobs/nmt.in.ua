import { execFile } from "node:child_process";

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env ?? process.env,
        timeout: options.timeout ?? 20_000,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const out = typeof stdout === "string" ? stdout : "";
        const errText = typeof stderr === "string" ? stderr : "";
        if (!error) {
          resolve({ code: 0, stdout: out, stderr: errText });
          return;
        }
        if (typeof error.code === "number") {
          resolve({ code: error.code, stdout: out, stderr: errText });
          return;
        }
        reject(error);
      },
    );
  });
}

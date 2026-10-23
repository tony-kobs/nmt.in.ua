/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS entry for server.js */
const fs = require("fs");
const path = require("path");

/** Panel-owned Node must not share PHP's account tmp. */
function siteTmpDir(appDir) {
  return path.join(appDir, "..", "tmp");
}

function readBuildId(appDir) {
  try {
    return fs.readFileSync(path.join(appDir, ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return "";
  }
}

/** Plain body for GET /health. Deploy accepts it only when the build id matches. */
function healthBody(appDir) {
  const id = readBuildId(appDir);
  return id ? `ok ${id}\n` : "ok\n";
}

module.exports = {
  siteTmpDir,
  readBuildId,
  healthBody,
};

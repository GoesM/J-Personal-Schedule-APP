const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const files = fs.readdirSync("release").filter((f) => /\.(zip|apk)$/.test(f));
const hashes = files.map((name) => ({
  name,
  size: fs.statSync(path.join("release", name)).size,
  sha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join("release", name)))
    .digest("hex"),
}));
fs.writeFileSync(
  "release/SHA256.json",
  JSON.stringify(
    {
      version: require("../package.json").version,
      generated: new Date().toISOString(),
      files: hashes,
    },
    null,
    2,
  ),
);
console.log(
  hashes
    .map((x) => x.name + " " + (x.size / 1024 / 1024).toFixed(2) + " MB")
    .join("\n"),
);

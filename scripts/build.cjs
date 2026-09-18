const esbuild = require("esbuild");
const fs = require("fs");
fs.mkdirSync("dist", { recursive: true });
esbuild.buildSync({
  entryPoints: ["src/app.mjs"],
  bundle: true,
  outfile: "dist/app.js",
  platform: "browser",
  target: "chrome120",
  inject: ["src/browser-globals.mjs"],
});
for (const f of ["index.html", "style.css"])
  fs.copyFileSync("src/" + f, "dist/" + f);
// Carry third-party dependency license text into both distributables.
const path = require("path");
let notices = "J人小程序：第三方许可声明\n";
function notice(dir) {
  if (!fs.existsSync(path.join(dir, "package.json"))) return;
  const p = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  for (const name of fs.readdirSync(dir)) {
    if (
      /^(licen[cs]e|notice)(\.|$)/i.test(name) &&
      fs.statSync(path.join(dir, name)).isFile()
    )
      notices +=
        "\n\n### " +
        p.name +
        " " +
        p.version +
        " / " +
        name +
        "\n" +
        fs.readFileSync(path.join(dir, name), "utf8");
  }
}
for (const entry of fs.readdirSync("node_modules", { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = path.join("node_modules", entry.name);
  if (entry.name.startsWith("@"))
    for (const name of fs.readdirSync(dir)) notice(path.join(dir, name));
  else notice(dir);
}
fs.writeFileSync("dist/THIRD_PARTY_NOTICES.txt", notices);
fs.mkdirSync("release", { recursive: true });
fs.copyFileSync("docs/USAGE.md", "release/使用说明.md");
fs.copyFileSync("docs/DEVELOPMENT.md", "release/开发指引.md");
fs.copyFileSync("docs/CHANGELOG.md", "release/更新说明.md");

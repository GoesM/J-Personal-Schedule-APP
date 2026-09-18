/* Pure Java Android build: SDK aapt2 + javac + d8 + zipalign + apksigner. */
const fs = require("fs"),
  path = require("path"),
  cp = require("child_process"),
  crypto = require("crypto");
const base = process.cwd(),
  sdk = process.env.ANDROID_HOME || "E:/AndroidSdk",
  java = process.env.JAVA_HOME || "E:/Android Studio/jbr",
  tools = path.join(sdk, "build-tools/36.1.0"),
  jar = path.join(sdk, "platforms/android-36.1/android.jar"),
  build = fs.mkdtempSync(path.join(require("os").tmpdir(), "jcalendar-build-"));
fs.mkdirSync("release", { recursive: true });
fs.copyFileSync(
  "android/AndroidManifest.xml",
  path.join(build, "AndroidManifest.xml"),
);
function run(exe, args) {
  const r = cp.spawnSync(exe, args, {
    stdio: "inherit",
    env: { ...process.env, JAVA_HOME: java },
    shell: exe.endsWith(".bat"),
  });
  if (r.status !== 0) throw Error("构建失败 " + exe);
}
fs.mkdirSync(path.join(build, "assets"), { recursive: true });
for (const f of fs.readdirSync("dist"))
  fs.copyFileSync("dist/" + f, path.join(build, "assets", f));
const html = path.join(build, "assets/index.html");
fs.writeFileSync(
  html,
  fs
    .readFileSync(html, "utf8")
    .replace(
      '<script src="app.js">',
      '<script src="bridge.js"></script><script src="app.js">',
    ),
);
fs.writeFileSync(
  path.join(build, "assets/bridge.js"),
  `const pending=new Map();let seq=0;window.native={invoke:(method,args)=>new Promise((resolve,reject)=>{const id=String(++seq);pending.set(id,{resolve,reject});AndroidNative.invoke(id,method,JSON.stringify(args));})};window.nativeResult=(id,error,value)=>{const p=pending.get(id);if(!p)return;pending.delete(id);if(error){const e=new Error(error);if(error.includes('ENOENT'))e.code='ENOENT';p.reject(e);}else p.resolve(value);};`,
);
run(path.join(tools, "aapt2.exe"), [
  "link",
  "-o",
  path.join(build, "base.apk"),
  "-I",
  jar,
  "--manifest",
  path.join(build, "AndroidManifest.xml"),
  "-A",
  path.join(build, "assets"),
]);
fs.mkdirSync(path.join(build, "classes"), { recursive: true });
run(path.join(java, "bin/javac.exe"), [
  "-encoding",
  "UTF-8",
  "-source",
  "8",
  "-target",
  "8",
  "-classpath",
  jar,
  "-d",
  path.join(build, "classes"),
  path.join(base, "android/src/cn/goesm/jcalendar/MainActivity.java"),
]);
const classes = [];
function walk(p) {
  for (const f of fs.readdirSync(p, { withFileTypes: true })) {
    const n = path.join(p, f.name);
    if (f.isDirectory()) walk(n);
    else if (n.endsWith(".class")) classes.push(n);
  }
}
walk(path.join(build, "classes"));
run(path.join(java, "bin/java.exe"), [
  "-cp",
  path.join(tools, "lib/d8.jar"),
  "com.android.tools.r8.D8",
  "--lib",
  jar,
  "--min-api",
  "26",
  "--output",
  build,
  ...classes,
]);
// Add dex using bundled PowerShell ZIP support, keeping signing material local.
const unsigned = path.join(build, "unsigned.apk");
fs.copyFileSync(path.join(build, "base.apk"), unsigned);
run("powershell.exe", [
  "-NoProfile",
  "-Command",
  `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open('${unsigned.replaceAll("'", "''")}', 'Update'); [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z,'${path.join(build, "classes.dex").replaceAll("'", "''")}','classes.dex') | Out-Null; $z.Dispose()`,
]);
const keyDir = path.join(base, "env/signing");
fs.mkdirSync(keyDir, { recursive: true });
const key = path.join(keyDir, "release.jks"),
  passwordFile = path.join(keyDir, "password.txt");
if (!fs.existsSync(key)) {
  const pass = crypto.randomBytes(24).toString("hex");
  fs.writeFileSync(passwordFile, pass);
  run(path.join(java, "bin/keytool.exe"), [
    "-genkeypair",
    "-keystore",
    key,
    "-storepass",
    pass,
    "-keypass",
    pass,
    "-alias",
    "release",
    "-keyalg",
    "RSA",
    "-keysize",
    "3072",
    "-validity",
    "10000",
    "-dname",
    "CN=J Personal Schedule",
  ]);
}
const aligned = path.join(build, "aligned.apk");
run(path.join(tools, "zipalign.exe"), ["-f", "4", unsigned, aligned]);
const output = path.join(base, "release/J人小程序-Android.apk");
run(path.join(java, "bin/java.exe"), [
  "-jar",
  path.join(tools, "lib/apksigner.jar"),
  "sign",
  "--ks",
  key,
  "--ks-pass",
  "file:" + passwordFile,
  "--out",
  output,
  aligned,
]);
run(path.join(java, "bin/java.exe"), [
  "-jar",
  path.join(tools, "lib/apksigner.jar"),
  "verify",
  "--verbose",
  output,
]);

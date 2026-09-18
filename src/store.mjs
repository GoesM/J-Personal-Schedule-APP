import { materialize } from "./model.mjs";
const bridge = window.native;
export const call = async (method, ...args) => {
  try {
    return await bridge.invoke(method, args);
  } catch (e) {
    if (e.message.includes("ENOENT")) e.code = "ENOENT";
    throw e;
  }
};
export const bytesTo64 = (b) => {
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};
export const from64 = (s) => Uint8Array.from(atob(s), (x) => x.charCodeAt(0));
export const fs = {
  promises: {
    readFile: async (p, opts) => {
      const b = from64(await call("read", p));
      return typeof opts === "string" || opts?.encoding
        ? new TextDecoder().decode(b)
        : b;
    },
    writeFile: async (p, data) =>
      call(
        "write",
        p,
        bytesTo64(
          typeof data === "string" ? new TextEncoder().encode(data) : data,
        ),
      ),
    mkdir: async (p) => call("mkdir", p),
    readdir: async (p) => call("list", p),
    unlink: async (p) => call("unlink", p),
    rmdir: async (p) => call("rmdir", p),
    stat: async (p) => stat(p),
    lstat: async (p) => stat(p),
    readlink: async () => {
      throw Error("Symlinks unsupported");
    },
    symlink: async () => {
      throw Error("Symlinks unsupported");
    },
    chmod: async () => {},
  },
};
async function stat(p) {
  const s = await call("stat", p);
  return {
    ...s,
    isFile: () => !s.directory,
    isDirectory: () => s.directory,
    isSymbolicLink: () => false,
  };
}
export let operations = [];
let frozen = false;
let writes = 0;
export const hasActiveWrites = () => writes > 0;
export const freeze = (value) => {
  frozen = value;
};
export const records = () => materialize(operations);
function validate(o) {
  if (
    !o ||
    !/^[a-zA-Z0-9-]+$/.test(o.id) ||
    typeof o.itemId !== "string" ||
    !Array.isArray(o.parents) ||
    !o.parents.every((x) => typeof x === "string") ||
    typeof o.at !== "string" ||
    !o.item ||
    typeof o.item.title !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(o.item.date)
  )
    throw Error("事项数据格式不正确");
  if (
    o.item.start &&
    (!/^([01]\d|2[0-3]):[0-5]\d$/.test(o.item.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.item.end) ||
      o.item.end <= o.item.start)
  )
    throw Error("日程时间格式不正确");
}
export async function load() {
  await call("mkdir", "/repo/ops");
  const next = [];
  for (const f of await call("list", "/repo/ops"))
    if (f.endsWith(".json")) {
      try {
        const o = JSON.parse(
          new TextDecoder().decode(
            from64(await call("read", "/repo/ops/" + f)),
          ),
        );
        validate(o);
        next.push(o);
      } catch (e) {
        throw Error("数据文件损坏：" + f + " " + e.message);
      }
    }
  operations = next;
}
export async function save(item, previous, deleted = false) {
  if (frozen) throw Error("同步中，请完成后再保存");
  writes++;
  try {
    const id = crypto.randomUUID();
    const op = {
      id,
      itemId: previous?.id || crypto.randomUUID(),
      parents: previous?.versions.map((x) => x.id) || [],
      at: new Date().toISOString(),
      item,
      deleted,
    };
    await call(
      "write",
      "/repo/ops/" + id + ".json",
      bytesTo64(new TextEncoder().encode(JSON.stringify(op))),
    );
    operations.push(op);
    return op;
  } finally {
    writes--;
  }
}
export async function importOps(list) {
  if (frozen) throw Error("同步中，请完成后再导入");
  writes++;
  try {
    for (const o of list) validate(o);
    for (const o of list) {
      if (!operations.some((x) => x.id === o.id)) {
        await call(
          "write",
          "/repo/ops/" + o.id + ".json",
          bytesTo64(new TextEncoder().encode(JSON.stringify(o))),
        );
        operations.push(o);
      }
    }
  } finally {
    writes--;
  }
}

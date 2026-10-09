/** Long TODO protocol v2. Content is partitioned by completion month; the small
 * per-device index contains only causal metadata, never titles/notes/history.
 * Each physical profile owns a private writer ID outside Git. Different devices
 * therefore never edit the same file. See docs/LONG_TODO_STORAGE.md.
 */
import { heads, materialize, localDate, shift } from "./model.mjs";

const FORMAT = "j-longtodo-v2";
const ROOT = "/repo/longtodo";
const validId = (v) => typeof v === "string" && /^[a-zA-Z0-9-]+$/.test(v);
const validTime = (v) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
export const recentCutoff = (now = new Date()) => shift(localDate(now), -6);
export function validateLongItem(item) {
  if (
    !item ||
    item.kind !== "longtodo" ||
    typeof item.title !== "string" ||
    !item.title.trim()
  )
    throw Error("长期TODO内容不能为空");
  if (item.ddl && !/^\d{4}-\d{2}-\d{2}$/.test(item.ddl))
    throw Error("DDL日期格式不正确");
  if (item.done && !validTime(item.completedAt))
    throw Error("长期TODO缺少完成时间");
}
function validateHead(h) {
  if (
    !h ||
    !validId(h.id) ||
    !validId(h.itemId) ||
    !validTime(h.at) ||
    !Array.isArray(h.parents) ||
    !h.parents.every(validId) ||
    !Array.isArray(h.ancestors) ||
    !h.ancestors.every(validId)
  )
    throw Error("长期TODO版本索引损坏");
}
const bucketFor = (o) =>
  o.deleted || o.item.done
    ? "completed/" + localDate(new Date(o.item.completedAt || o.at)).slice(0, 7)
    : "active";
const metadata = (o) => ({
  id: o.id,
  itemId: o.itemId,
  parents: o.parents,
  ancestors: o.ancestors,
  at: o.at,
  done: !!o.item.done,
  doneAt: o.item.completedAt || "",
  deleted: !!o.deleted,
  bucket: bucketFor(o),
});

export function createLongStore(io) {
  let loaded = [],
    indexes = [],
    writer = null,
    localIndex = [];
  // Serialise read-modify-write transactions even when several checkboxes are hit.
  let tail = Promise.resolve();
  const transaction = (fn) => {
    const next = tail.then(fn);
    tail = next.catch(() => {});
    return next;
  };
  const now = () => io.now?.() || new Date();
  const uuid = () => io.uuid?.() || crypto.randomUUID();
  const read = async (path, fallback) => {
    try {
      return await io.readJson(path);
    } catch (e) {
      if (e.code === "ENOENT" && fallback !== undefined) return fallback;
      throw e;
    }
  };
  const readIndex = async (device) => {
    const data = await read(`${ROOT}/${device}/index.json`, {
      format: FORMAT,
      heads: [],
    });
    if (data.format !== FORMAT || !Array.isArray(data.heads))
      throw Error("长期TODO索引格式不正确");
    for (const h of data.heads) {
      validateHead(h);
      if (
        !/^(active|completed\/\d{4}-\d{2})$/.test(h.bucket) ||
        (h.done && !validTime(h.doneAt))
      )
        throw Error("长期TODO归档索引损坏");
    }
    return data.heads;
  };
  const ensureWriter = async () => {
    if (writer) return;
    const data = await read("/longtodo-device.json", null);
    writer = data?.id;
    if (!validId(writer)) {
      writer = uuid();
      await io.writeJson("/longtodo-device.json", { id: writer });
    }
    localIndex = await readIndex(writer);
  };
  const readContent = async (pointers) => {
    const cache = new Map(),
      result = [];
    for (const h of pointers) {
      const path = `${ROOT}/${h.device}/${h.bucket}.json`;
      if (!cache.has(path)) {
        const data = await read(path);
        if (
          data.format !== FORMAT ||
          !data.operations ||
          typeof data.operations !== "object"
        )
          throw Error("长期TODO内容文件损坏：" + path);
        cache.set(path, data.operations);
      }
      const op = cache.get(path)[h.id];
      validateHead(op);
      validateLongItem(op.item);
      // Bucket month belongs to the writer's timezone; do not recompute it on
      // another device (a completion near midnight may be in a different month).
      if (
        op.id !== h.id ||
        op.itemId !== h.itemId ||
        op.at !== h.at ||
        !!op.item.done !== h.done ||
        !!op.deleted !== h.deleted ||
        (op.item.completedAt || "") !== h.doneAt ||
        (h.bucket === "active") !== (!op.deleted && !op.item.done)
      )
        throw Error("长期TODO索引与内容不一致");
      result.push(op);
    }
    return result;
  };
  const allCurrent = () => {
    const unique = new Map();
    for (const h of indexes) unique.set(h.id, h);
    const groups = new Map();
    for (const h of unique.values()) {
      if (!groups.has(h.itemId)) groups.set(h.itemId, []);
      groups.get(h.itemId).push(h);
    }
    return [...groups.values()].flatMap(heads);
  };
  async function load() {
    writer = null;
    localIndex = [];
    await io.mkdir(ROOT);
    const next = [];
    for (const device of await io.list(ROOT)) {
      if (!validId(device)) continue;
      for (const h of await readIndex(device)) next.push({ ...h, device });
    }
    indexes = next;
    const current = allCurrent(),
      cutoff = recentCutoff(now());
    const conflicts = new Set(
      materialize(current)
        .filter((r) => r.conflict)
        .map((r) => r.id),
    );
    // A conflict must remain resolvable even if one head is an old completion.
    const wanted = current.filter(
      (h) =>
        conflicts.has(h.itemId) ||
        (!h.deleted && (!h.done || localDate(new Date(h.doneAt)) >= cutoff)),
    );
    loaded = await readContent(wanted);
    return records();
  }
  function records() {
    return materialize(loaded);
  }
  async function publish(ops) {
    await ensureWriter();
    const byBucket = new Map();
    for (const op of ops) {
      validateHead(op);
      validateLongItem(op.item);
      const bucket = bucketFor(op);
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket).push(op);
    }
    // Content before index: an interrupted write cannot leave a dangling pointer.
    for (const [bucket, additions] of byBucket) {
      const path = `${ROOT}/${writer}/${bucket}.json`;
      const data = await read(path, { format: FORMAT, operations: {} });
      for (const op of additions) data.operations[op.id] = op;
      await io.writeJson(path, data);
    }
    const next = new Map();
    for (const h of [...localIndex, ...ops.map(metadata)]) next.set(h.id, h);
    const groups = new Map();
    for (const h of next.values()) {
      if (!groups.has(h.itemId)) groups.set(h.itemId, []);
      groups.get(h.itemId).push(h);
    }
    const nextIndex = [...groups.values()].flatMap(heads);
    await io.writeJson(`${ROOT}/${writer}/index.json`, {
      format: FORMAT,
      heads: nextIndex,
    });
    localIndex = nextIndex;
    indexes = [
      ...indexes.filter((h) => h.device !== writer),
      ...nextIndex.map((h) => ({ ...h, device: writer })),
    ];
    const map = new Map([...loaded, ...ops].map((o) => [o.id, o]));
    const currentIds = new Set(allCurrent().map((h) => h.id));
    loaded = [...map.values()].filter((o) => currentIds.has(o.id));
    // active.json is a current working set, not an ever-growing historical log.
    // Cleanup is after the commit point. A failed cleanup leaves harmless extra
    // content; the authoritative index hides it and the next transaction retries.
    try {
      const path = `${ROOT}/${writer}/active.json`;
      const active = await read(path, { format: FORMAT, operations: {} });
      const keep = new Set(
        nextIndex.filter((h) => h.bucket === "active").map((h) => h.id),
      );
      for (const id of Object.keys(active.operations))
        if (!keep.has(id)) delete active.operations[id];
      await io.writeJson(path, active);
    } catch {
      /* Durable index already saved. */
    }
  }
  const save = (item, previous, deleted = false) =>
    transaction(async () => {
      const time = now().toISOString();
      const completedAt = item.done
        ? previous?.item.done && previous.item.completedAt
          ? previous.item.completedAt
          : time
        : "";
      const op = {
        id: uuid(),
        itemId: previous?.id || uuid(),
        parents: previous?.versions.map((o) => o.id) || [],
        ancestors: [
          ...new Set(
            previous?.versions.flatMap((o) => [
              o.id,
              ...(o.ancestors || o.parents || []),
            ]) || [],
          ),
        ],
        at: time,
        item: {
          ...item,
          kind: "longtodo",
          date: "",
          start: "",
          end: "",
          completedAt,
        },
        deleted,
      };
      await publish([op]);
      return op;
    });
  const exportHeads = async () => readContent(allCurrent());
  const loadTrash = async () => {
    const extra = await readContent(allCurrent().filter((h) => h.deleted));
    loaded = [...new Map([...loaded, ...extra].map((o) => [o.id, o])).values()];
  };
  const importHeads = (ops) =>
    transaction(async () => {
      if (ops.length) {
        await publish(ops);
        await load();
      }
    });
  return { load, records, save, exportHeads, loadTrash, importHeads };
}

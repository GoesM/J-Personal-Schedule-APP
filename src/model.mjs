export function heads(ops) {
  const parents = new Set(ops.flatMap((x) => x.parents || []));
  return ops.filter((x) => !parents.has(x.id));
}
export function materialize(ops) {
  const groups = new Map();
  for (const o of ops) {
    if (!groups.has(o.itemId)) groups.set(o.itemId, []);
    groups.get(o.itemId).push(o);
  }
  return [...groups].map(([id, list]) => {
    const versions = heads(list).sort(
      (a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id),
    );
    return {
      id,
      versions,
      item: versions[0].item,
      deleted: versions[0].deleted,
      conflict: versions.length > 1,
    };
  });
}
/** Completion wins for every date/type. Timed items expire at their local end time. */
export function color(item, now = new Date()) {
  if (item.done) return "done";
  const clock = typeof now === "string" ? new Date(now + "T00:00:00") : now;
  const past =
    item.start && item.end
      ? new Date(item.date + "T" + item.end + ":00").getTime() <=
        clock.getTime()
      : item.date < localDate(clock);
  if (past) return "past";
  return item.important ? "important" : "future";
}
export function boundaries(items) {
  return [
    ...new Set([
      "08:00",
      "22:00",
      ...items.flatMap((i) => (i.start ? [i.start, i.end] : [])),
    ]),
  ].sort();
}
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Interval graph coloring; consistent widths across each connected overlap cluster. */
export function lanes(records) {
  const result = new Map();
  let cluster = [],
    ends = [],
    limit = "";
  const finish = () => {
    for (const [id, lane] of cluster)
      result.set(id, { lane, count: ends.length });
    cluster = [];
    ends = [];
  };
  for (const r of [...records].sort((a, b) =>
    a.item.start.localeCompare(b.item.start),
  )) {
    if (cluster.length && r.item.start >= limit) finish();
    let lane = ends.findIndex((t) => t <= r.item.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = r.item.end;
    cluster.push([r.id, lane]);
    limit =
      cluster.length === 1
        ? r.item.end
        : limit > r.item.end
          ? limit
          : r.item.end;
  }
  finish();
  return result;
}
export function shift(date, n) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return localDate(d);
}

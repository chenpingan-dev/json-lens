export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 160;

export function kind(value) {
  return value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value;
}

export function escapeToken(token) {
  return String(token).replaceAll("~", "~0").replaceAll("/", "~1");
}

function decodeToken(token) {
  if (/~(?:[^01]|$)/.test(token))
    throw new Error("Invalid JSON Pointer escape");
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

export function atPointer(value, pointer) {
  if (pointer === "") return value;
  if (!pointer.startsWith("/"))
    throw new Error("A JSON Pointer must start with /");
  let cursor = value;
  for (const token of pointer.slice(1).split("/").map(decodeToken)) {
    if (
      cursor === null ||
      typeof cursor !== "object" ||
      !Object.hasOwn(cursor, token)
    ) {
      throw new Error(`Pointer not found: ${pointer}`);
    }
    if (Array.isArray(cursor) && !/^(0|[1-9]\d*)$/.test(token))
      throw new Error("Invalid array index");
    cursor = cursor[token];
  }
  return cursor;
}

export function parseDocument(text) {
  if (new TextEncoder().encode(text).length > MAX_INPUT_BYTES)
    throw new Error("Input exceeds the 2 MiB limit");
  if (!text.trim()) throw new Error("Paste JSON or load the sample to begin");
  const value = JSON.parse(text);
  const stack = [[value, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (depth > MAX_DEPTH)
      throw new Error(`Nesting exceeds ${MAX_DEPTH} levels`);
    if (node !== null && typeof node === "object") {
      for (const child of Object.values(node)) stack.push([child, depth + 1]);
    }
  }
  return value;
}

export function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (kind(value) === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])]),
    );
  }
  return value;
}

export function flatten(value) {
  const rows = [];
  function visit(node, path, key, depth) {
    const type = kind(node);
    const children =
      type === "object" || type === "array" ? Object.entries(node) : [];
    rows.push({ path, key, depth, type, value: node, size: children.length });
    for (const [name, child] of children)
      visit(child, `${path}/${escapeToken(name)}`, name, depth + 1);
  }
  visit(value, "", "$", 0);
  return rows;
}

export function statistics(value) {
  const rows = flatten(value);
  const counts = Object.fromEntries(
    ["object", "array", "string", "number", "boolean", "null"].map((type) => [
      type,
      0,
    ]),
  );
  let depth = 0;
  for (const row of rows) {
    counts[row.type]++;
    depth = Math.max(depth, row.depth);
  }
  return { nodes: rows.length, depth, counts };
}

/** Structural diff: object key order is ignored; array items are compared by index. */
export function diff(left, right, limit = 2000) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError("limit must be a positive integer");
  const changes = [];
  let truncated = false;
  function emit(change) {
    if (changes.length < limit) changes.push(change);
    else truncated = true;
  }
  function visit(a, b, path) {
    if (truncated || Object.is(a, b)) return;
    const type = kind(a);
    if (type !== kind(b) || !["object", "array"].includes(type)) {
      emit({ op: "replace", path, before: a, after: b });
      return;
    }
    const keys =
      type === "array"
        ? Array.from({ length: Math.max(a.length, b.length) }, (_, index) =>
            String(index),
          )
        : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      const child = `${path}/${escapeToken(key)}`;
      if (!Object.hasOwn(a, key))
        emit({ op: "add", path: child, after: b[key] });
      else if (!Object.hasOwn(b, key))
        emit({ op: "remove", path: child, before: a[key] });
      else visit(a[key], b[key], child);
      if (truncated) break;
    }
  }
  visit(left, right, "");
  return { changes, truncated };
}

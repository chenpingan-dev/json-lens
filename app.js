import { initLayout } from "./src/layout.js";
import { t, errorText, initI18n } from "./src/i18n.js";
import {
  parseDocument,
  diff,
  flatten,
  kind,
  atPointer,
  statistics,
  sorted,
  MAX_INPUT_BYTES,
} from "./src/json.js";
const $ = (id) => document.getElementById(id);
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
let mode = "explore";
let value;
let selected;
let report = { changes: [], truncated: false };
const collapsed = new Set();
let debounce;
function message(text, error = false) {
  $("status").dataset.originalText = text;
  $("status").textContent = t(text);
  $("status").classList.toggle("error", error);
}
function preview(node) {
  const type = kind(node);
  if (type === "array") return t("[ {n} items ]", { n: node.length });
  if (type === "object")
    return t("{ {n} keys }", { n: Object.keys(node).length });
  const text = JSON.stringify(node);
  return text.length > 85 ? text.slice(0, 82) + "…" : text;
}
function download(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const link = element("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function resolvePointer() {
  try {
    selected = atPointer(value, $("pointer").value);
    $("selected-type").textContent = t(kind(selected));
    $("selected-value").textContent = JSON.stringify(selected, null, 2);
    message("Pointer resolved.");
  } catch (error) {
    message(errorText(error), true);
  }
}
function renderTree() {
  const rows = flatten(value);
  const query = $("search").value.toLowerCase();
  const filtered = rows.filter((row) =>
    query
      ? (
          row.path +
          " " +
          row.key +
          " " +
          (row.type === "object" || row.type === "array"
            ? ""
            : JSON.stringify(row.value))
        )
          .toLowerCase()
          .includes(query)
      : ![...collapsed].some(
          (path) =>
            row.path !== path &&
            (path === "" || row.path.startsWith(path + "/")),
        ),
  );
  $("tree-count").textContent = t("{n} nodes", { n: filtered.length });
  const fragment = document.createDocumentFragment();
  for (const row of filtered.slice(0, 1500)) {
    const button = element("button", "tree-row");
    button.style.paddingLeft = `${16 + Math.min(row.depth, 14) * 17}px`;
    button.setAttribute(
      "aria-label",
      `${row.path || t("root")}, ${t(row.type)}, ${preview(row.value)}`,
    );
    button.append(
      element(
        "span",
        "chevron",
        row.size ? (collapsed.has(row.path) ? "›" : "⌄") : "·",
      ),
    );
    button.append(element("span", "tree-key", row.key));
    button.append(
      element("span", `tree-value type-${row.type}`, preview(row.value)),
    );
    button.append(element("span", "tree-type", t(row.type)));
    button.addEventListener("click", () => {
      $("pointer").value = row.path;
      resolvePointer();
      if (row.size && !query) {
        collapsed.has(row.path)
          ? collapsed.delete(row.path)
          : collapsed.add(row.path);
        renderTree();
      }
    });
    fragment.append(button);
  }
  if (!filtered.length)
    fragment.append(
      element("div", "empty", t("No matching keys, paths or values.")),
    );
  if (filtered.length > 1500)
    fragment.append(
      element(
        "div",
        "empty",
        t("Showing 1,500 nodes. Search to narrow the result."),
      ),
    );
  $("tree").replaceChildren(fragment);
}
function renderDiff() {
  const right = parseDocument($("comparison").value);
  report = diff(value, right);
  const counts = { add: 0, remove: 0, replace: 0 };
  const fragment = document.createDocumentFragment();
  for (const change of report.changes) {
    counts[change.op]++;
    const row = element("div", "change");
    row.append(
      element(
        "span",
        `op ${change.op}`,
        t(change.op === "replace" ? "CHANGED" : change.op.toUpperCase()),
      ),
    );
    row.append(element("code", "change-path", change.path || t("(root)")));
    const values = element("div", "change-values");
    if (Object.hasOwn(change, "before"))
      values.append(element("span", "before", preview(change.before)));
    if (change.op === "replace") values.append(element("span", "muted", "→"));
    if (Object.hasOwn(change, "after"))
      values.append(element("span", "after", preview(change.after)));
    row.append(values);
    fragment.append(row);
  }
  if (!report.changes.length)
    fragment.append(
      element(
        "div",
        "empty",
        t("✓ Same structure and values. Object key order does not matter."),
      ),
    );
  if (report.truncated)
    fragment.append(
      element(
        "div",
        "empty",
        t("First 2,000 changes shown. Export includes this truncation flag."),
      ),
    );
  $("changes").replaceChildren(fragment);
  $("stat-changes").textContent =
    report.changes.length + (report.truncated ? "+" : "");
  $("change-detail").textContent = t(
    "{add} added · {remove} removed · {replace} changed",
    counts,
  );
  $("diff-count").textContent = report.changes.length;
}
function refresh() {
  try {
    value = parseDocument($("source").value);
    const stats = statistics(value);
    $("stat-nodes").textContent = stats.nodes.toLocaleString();
    $("stat-depth").textContent = stats.depth;
    const bytes = new TextEncoder().encode($("source").value).length;
    $("stat-size").textContent = `${(bytes / 1024).toFixed(1)} KB`;
    $("source-info").textContent = t("Valid {type} · {n} bytes", {
      type: t(kind(value)),
      n: bytes.toLocaleString(),
    });
    if (mode === "explore") {
      renderTree();
      $("stat-changes").textContent = "—";
      $("change-detail").textContent = t("Switch to diff to compare");
      selected = value;
      $("pointer").value = "";
      $("selected-type").textContent = t(kind(value));
      $("selected-value").textContent = JSON.stringify(value, null, 2);
    } else renderDiff();
    message("Valid JSON · processed locally in your browser.");
  } catch (error) {
    value = undefined;
    selected = undefined;
    report = { changes: [], truncated: false };
    for (const name of ["nodes", "depth", "size", "changes"])
      $(`stat-${name}`).textContent = "—";
    $("tree").replaceChildren(
      element("div", "empty", t("A valid document will appear here.")),
    );
    $("changes").replaceChildren(
      element(
        "div",
        "empty",
        t("Both documents must be valid JSON to compare."),
      ),
    );
    $("selected-value").textContent = "";
    $("source-info").textContent = t("Check JSON syntax");
    message(errorText(error), true);
  }
}
function setMode(next) {
  mode = next;
  for (const name of ["explore", "diff"]) {
    $(`tab-${name}`).setAttribute("aria-pressed", String(mode === name));
    $(`nav-${name}`).classList.toggle("active", mode === name);
  }
  for (const id of ["tree-panel", "inspector"])
    $(id).hidden = mode !== "explore";
  for (const id of ["compare-panel", "diff-panel"])
    $(id).hidden = mode !== "diff";
  refresh();
}
async function loadSample() {
  try {
    const responses = await Promise.all(
      ["source", "comparison"].map((name) => fetch(`examples/${name}.json`)),
    );
    if (responses.some((response) => !response.ok))
      throw new Error("Unable to load sample files");
    const data = await Promise.all(
      responses.map((response) => response.json()),
    );
    $("source").value = JSON.stringify(data[0], null, 2);
    $("comparison").value = JSON.stringify(data[1], null, 2);
    collapsed.clear();
    $("search").value = "";
    refresh();
  } catch (error) {
    message(errorText(error), true);
  }
}
async function importFile(file) {
  if (!file) return;
  try {
    if (file.size > MAX_INPUT_BYTES)
      throw new Error("File exceeds the 2 MiB limit");
    const text = await file.text();
    parseDocument(text);
    $("source").value = text;
    $("left-label").textContent = file.name;
    collapsed.clear();
    refresh();
  } catch (error) {
    message(errorText(error), true);
  }
}
for (const name of ["explore", "diff"])
  for (const prefix of ["tab", "nav"])
    $(`${prefix}-${name}`).addEventListener("click", () => setMode(name));
$("load-sample").addEventListener("click", loadSample);
$("refresh").addEventListener("click", refresh);
for (const [id, transform] of [
  ["format", (data) => JSON.stringify(data, null, 2)],
  ["sort", (data) => JSON.stringify(sorted(data), null, 2)],
  ["minify", (data) => JSON.stringify(data)],
]) {
  $(id).addEventListener("click", () => {
    try {
      $("source").value = transform(parseDocument($("source").value));
      refresh();
    } catch (error) {
      message(errorText(error), true);
    }
  });
}
for (const id of ["source", "comparison"])
  $(id).addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 350);
  });
$("search").addEventListener("input", () => {
  if (value !== undefined) renderTree();
});
$("expand").addEventListener("click", () => {
  collapsed.clear();
  if (value !== undefined) renderTree();
});
$("resolve").addEventListener("click", () => {
  if (value !== undefined) resolvePointer();
});
$("pointer").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && value !== undefined) resolvePointer();
});
$("copy-value").addEventListener("click", async () => {
  try {
    if (selected === undefined) throw new Error("Select a valid value first");
    await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
    message("Value copied.");
  } catch {
    message("Clipboard unavailable. Select and copy the value below.", true);
  }
});
$("swap").addEventListener("click", () => {
  const left = $("source").value;
  $("source").value = $("comparison").value;
  $("comparison").value = left;
  refresh();
});
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", (event) => {
  importFile(event.target.files[0]);
  event.target.value = "";
});
$("source").addEventListener("dragover", (event) => {
  if (event.dataTransfer.types.includes("Files")) event.preventDefault();
});
$("source").addEventListener("drop", (event) => {
  if (event.dataTransfer.files.length) {
    event.preventDefault();
    importFile(event.dataTransfer.files[0]);
  }
});
$("export").addEventListener("click", () => {
  try {
    download("document.json", parseDocument($("source").value));
  } catch (error) {
    message(errorText(error), true);
  }
});
$("export-diff").addEventListener("click", () => {
  if (value === undefined) {
    message("Validate both documents first.", true);
    return;
  }
  download("structural-diff.json", report);
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    refresh();
  }
});
loadSample();

initLayout();
initI18n(() => {
  if (value !== undefined) {
    const pointer = $("pointer").value;
    refresh();
    if (mode === "explore") {
      $("pointer").value = pointer;
      resolvePointer();
    }
  } else if ($("status").dataset.originalText)
    $("status").textContent = t($("status").dataset.originalText);
});

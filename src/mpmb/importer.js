import { createMPMBSandbox, getImportDiagnostics, resetImportDiagnostics } from "./compat.js";
import { registryCounts, registries, resetRegistries } from "../content/registry.js";


function applyCompatibilityTransforms(source) {
  const transforms = [];
  let code = source;
  const before = code;
  // Older Acrobat JavaScript commonly treated an unmatched optional replace capture as an empty string.
  // Modern browsers pass undefined. MPMB content contains code that calls .toLowerCase() on such a capture.
  code = code.replace(/\+n\.toLowerCase\(\)\+/g, '+(n||"").toLowerCase()+');
  if (code !== before) transforms.push("Acrobat optional RegExp capture -> empty-string compatibility");
  return { code, transforms };
}

function diffCounts(before, after) {
  return Object.fromEntries(Object.keys(after).map(k => [k, after[k] - (before[k] || 0)]));
}

export function importMPMBSource(source, filename = "content.js", { clean = true, sandboxExtras = {} } = {}) {
  resetImportDiagnostics();
  if (clean) resetRegistries();
  const before = registryCounts(registries);
  const sandbox = createMPMBSandbox(sandboxExtras);
  const transformed = applyCompatibilityTransforms(source);
  const started = performance.now();
  let error = null;
  let errorStack = null;
  const oldRegExpReplace = RegExp.prototype.replace;
  try {
    // Acrobat's legacy JS exposes String-like replace behavior on RegExp values in code used by MPMB.
    if (!RegExp.prototype.replace) Object.defineProperty(RegExp.prototype, "replace", { configurable: true, value(search, replacement) { return this.toString().replace(search, replacement); } });
    // Deliberately non-strict: `with` lets a Proxy provide MPMB's large Acrobat-era global namespace.
    // The imported script only receives this compatibility sandbox; window/document/fetch are not intentionally exposed.
    const execute = new Function("sandbox", `with (sandbox) {\n${transformed.code}\n}\n//# sourceURL=${filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}`);
    execute(sandbox);
  } catch (e) {
    error = `${e?.name ?? "Error"}: ${e?.message ?? e}`;
    errorStack = e?.stack ? String(e.stack) : null;
  } finally {
    if (oldRegExpReplace === undefined) delete RegExp.prototype.replace;
    else RegExp.prototype.replace = oldRegExpReplace;
  }
  const after = registryCounts(registries);
  const diagnostics = getImportDiagnostics();
  return {
    ok: !error, filename, error, errorStack,
    elapsedMs: Math.round((performance.now() - started) * 10) / 10,
    bytes: new Blob([source]).size,
    before, after, delta: diffCounts(before, after), transforms: [...transformed.transforms, "Acrobat RegExp.replace compatibility (temporary prototype shim)"],
    ...diagnostics,
  };
}

export function importReportText(r) {
  if (!r) return "No import has been run.";
  const lines = [];
  lines.push(`MPMB Web Compatibility Report`, `File: ${r.filename}`, `Result: ${r.ok ? "IMPORT COMPLETED" : "IMPORT STOPPED"}`, `Time: ${r.elapsedMs} ms`, `Size: ${r.bytes} bytes`, "");
  if (r.transforms?.length) { lines.push("Compatibility transforms:"); for (const x of r.transforms) lines.push(`  - ${x}`); lines.push(""); }
  if (r.baseReport) {
    lines.push(`PDF baseline layer: ${r.baseReport.ok ? "LOADED" : "FAILED"}`);
    if (r.protectedBaseKeyCount != null) lines.push(`PDF-owned top-level records protected: ${r.protectedBaseKeyCount}`);
    lines.push("");
  }
  if (r.capturedCounts) {
    lines.push("PDF base content captured:");
    for (const [k,v] of Object.entries(r.capturedCounts)) if (v) lines.push(`  ${k.padEnd(24)} ${String(v).padStart(6)}`);
    lines.push("");
  }
  lines.push("Registry counts:");
  for (const [k,v] of Object.entries(r.after)) lines.push(`  ${k.padEnd(24)} ${String(v).padStart(6)}${r.delta[k] ? `  (+${r.delta[k]})` : ""}`);
  if (r.error) lines.push("", `Error: ${r.error}`);
  if (r.errorStack) lines.push(...String(r.errorStack).split("\n").slice(1,5).map(x=>`  ${x.trim()}`));
  lines.push("", `Unknown globals shimmed: ${r.unknownGlobals?.length || 0}`);
  for (const x of (r.unknownGlobals || []).slice(0,100)) lines.push(`  ${String(x.count).padStart(5)}  ${x.name}`);
  lines.push("", `Missing pre-existing registry references shimmed: ${r.missingRegistryRefs?.length || 0}`);
  for (const x of (r.missingRegistryRefs || []).slice(0,100)) lines.push(`  ${String(x.count).padStart(5)}  ${x.name}`);
  lines.push("", `Compatibility shim calls: ${r.shimCalls?.length || 0}`);
  for (const x of (r.shimCalls || []).slice(0,100)) lines.push(`  ${String(x.count).padStart(5)}  ${x.name}`);
  if (r.log?.length) {
    lines.push("", "Compatibility log:");
    for (const x of r.log.slice(-100)) lines.push(`  [${x.level}] ${x.message}`);
  }
  return lines.join("\n");
}

import builtInSource from "./builtin/all_WotC_pub+UA.min.js?raw";
import { resetRegistries, registryCounts, registries } from "./registry.js";
import { loadBasePDFContent, restoreBasePDFContent, baseRegistryKeys, getBasePDFReport } from "./base-pdf-loader.js";
import { importMPMBSource } from "../mpmb/importer.js";

let builtInReport = null;
const extraReports = [];

function snapshotKeys() {
  return Object.fromEntries(Object.entries(registries).map(([name, value]) => [name, new Set(Object.keys(value || {}))]));
}

function diffAdded(before) {
  const out = {};
  for (const [name, value] of Object.entries(registries)) {
    const prior = before[name] || new Set();
    out[name] = Object.keys(value || {}).filter(k => !prior.has(k));
  }
  return out;
}

export function loadBuiltInContent() {
  resetRegistries();
  const baseReport = loadBasePDFContent();
  const beforeAddon = snapshotKeys();
  const baseKeys = baseRegistryKeys();
  const addonReport = importMPMBSource(builtInSource, "Built-in all_WotC_pub+UA.min.js", { clean: false });
  const addonAddedKeys = diffAdded(beforeAddon);

  // The PDF baseline is authoritative. The bundled WotC/UA script is additive;
  // if it touches a PDF-owned top-level registry key, put the original PDF record back.
  restoreBasePDFContent();

  builtInReport = {
    ...addonReport,
    baseReport,
    after: registryCounts(),
    addonAddedKeys,
    protectedBaseKeyCount: Object.values(baseKeys).reduce((n, set) => n + set.size, 0),
  };
  return builtInReport;
}

export function importAdditionalContent(source, filename) {
  const report = importMPMBSource(source, filename, { clean: false });
  // Additional scripts are allowed to use normal MPMB extension behavior, but the
  // extracted PDF-owned baseline remains authoritative after the script finishes.
  restoreBasePDFContent();
  report.after = registryCounts();
  extraReports.push(report);
  return report;
}

export function getBuiltInReport() { return builtInReport; }
export function getBaseReport() { return getBasePDFReport(); }
export function getExtraReports() { return [...extraReports]; }

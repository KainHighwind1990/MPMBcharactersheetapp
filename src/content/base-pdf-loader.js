import basePDFSource from "./builtin/base/base-pdf-content.js?raw";
import { registries, registryCounts } from "./registry.js";
import { importMPMBSource } from "../mpmb/importer.js";

let cachedBase = null;
let baseReport = null;

function clonePreservingRuntime(value, seen = new WeakMap()) {
  if (value == null || typeof value !== "object") return value;
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (value instanceof Date) return new Date(value.getTime());
  if (seen.has(value)) return seen.get(value);
  const out = Array.isArray(value) ? [] : {};
  seen.set(value, out);
  for (const key of Reflect.ownKeys(value)) out[key] = clonePreservingRuntime(value[key], seen);
  return out;
}


function mergeFeatureChoiceAugmentations(baseValue, currentValue, seen = new WeakMap()) {
  const out = clonePreservingRuntime(baseValue);
  if (!baseValue || typeof baseValue !== "object" || !currentValue || typeof currentValue !== "object") return out;
  if (seen.has(baseValue)) return out;
  seen.set(baseValue, out);
  const optional = Array.isArray(currentValue.__mpmbOptionalFeatureChoices) ? currentValue.__mpmbOptionalFeatureChoices : [];
  if (optional.length) {
    out.__mpmbOptionalFeatureChoices = clonePreservingRuntime(optional);
    for (const item of optional) { const key=String(item?.key || item?.name || "").trim().toLowerCase(); if (key && currentValue[key] !== undefined) out[key]=clonePreservingRuntime(currentValue[key]); }
  }
  if (Array.isArray(currentValue.choices)) {
    const baseChoices = Array.isArray(baseValue.choices) ? baseValue.choices : [];
    const extras = currentValue.choices.filter(x => !baseChoices.some(y => String(y).trim().toLowerCase() === String(x).trim().toLowerCase()));
    if (extras.length) {
      out.choices = [...baseChoices, ...clonePreservingRuntime(extras)];
      for (const name of extras) { const key=String(name).trim().toLowerCase(); if (currentValue[key] !== undefined) out[key]=clonePreservingRuntime(currentValue[key]); }
    }
  }
  for (const key of Object.keys(baseValue)) {
    if (baseValue[key] && typeof baseValue[key] === "object" && currentValue[key] && typeof currentValue[key] === "object") out[key]=mergeFeatureChoiceAugmentations(baseValue[key], currentValue[key], seen);
  }
  return out;
}

function annotateRelationships(base) {
  for (const [classKey, cls] of Object.entries(base.ClassList || {})) {
    const ids = Array.isArray(cls?.subclasses?.[1]) ? cls.subclasses[1] : [];
    for (const id of ids) {
      if (base.ClassSubList?.[id]) {
        base.ClassSubList[id].baseClass ??= classKey;
        base.ClassSubList[id].mpmbKey ??= id.slice(`${classKey}-`.length);
      }
    }
  }
  for (const [id, race] of Object.entries(base.RaceSubList || {})) {
    if (!race?.baseRace) race.baseRace = id.includes("-") ? id.split("-")[0] : "";
    race.mpmbKey ??= id;
  }
}

function installBase(base, { overwrite = true } = {}) {
  for (const [registryName, entries] of Object.entries(base || {})) {
    const target = registries[registryName];
    if (!target || !entries || typeof entries !== "object") continue;
    for (const [key, value] of Object.entries(entries)) {
      if (overwrite || !(key in target)) {
        const current = target[key];
        target[key] = overwrite && current ? mergeFeatureChoiceAugmentations(value, current) : clonePreservingRuntime(value);
      }
    }
  }
}

export function loadBasePDFContent() {
  let captured = null;
  const rawReport = importMPMBSource(basePDFSource, "MPMB v13.2.3 PDF base content", {
    clean: false,
    sandboxExtras: {
      __MPMB_CAPTURE_BASE__: (value) => { captured = value; },
    },
  });
  if (!rawReport.ok || !captured) {
    baseReport = { ...rawReport, baseCaptureError: !captured ? "Base content capture did not return registries." : null };
    return baseReport;
  }
  annotateRelationships(captured);
  cachedBase = clonePreservingRuntime(captured);
  const beforeInstall = registryCounts();
  installBase(cachedBase, { overwrite: true });
  const afterInstall = registryCounts();
  const capturedCounts = Object.fromEntries(Object.entries(cachedBase).map(([k,v]) => [k, v && typeof v === "object" ? Object.keys(v).length : 0]));
  baseReport = {
    ...rawReport,
    before: beforeInstall,
    after: afterInstall,
    delta: Object.fromEntries(Object.keys(afterInstall).map(k => [k, afterInstall[k] - (beforeInstall[k] || 0)])),
    capturedCounts,
    filename: "MPMB v13.2.3 PDF base content",
  };
  return baseReport;
}

export function restoreBasePDFContent() {
  if (!cachedBase) return;
  installBase(cachedBase, { overwrite: true });
}

export function baseRegistryKeys() {
  if (!cachedBase) return {};
  return Object.fromEntries(Object.entries(cachedBase).map(([name, entries]) => [name, new Set(Object.keys(entries || {}))]));
}

export function getBasePDFReport() { return baseReport; }

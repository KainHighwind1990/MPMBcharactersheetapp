import { registries } from "../content/registry.js";

const log = [];
const unknownGlobals = new Map();
const unknownCalls = new Map();
const missingRegistryRefs = new Map();
const fieldValues = Object.create(null);
const push = (level, message) => log.push({ level, message });
const normalizeKey = (x) => String(x ?? "").trim().toLowerCase();
const bump = (map, key) => map.set(String(key), (map.get(String(key)) || 0) + 1);

function addSubClass(baseClass, key, data) {
  const id = `${normalizeKey(baseClass)}-${normalizeKey(key)}`;
  registries.ClassSubList[id] = { ...data, baseClass: normalizeKey(baseClass), mpmbKey: key };
  const cls = registries.ClassList[normalizeKey(baseClass)];
  if (cls) {
    cls.subclasses ??= ["", []];
    if (Array.isArray(cls.subclasses[1]) && !cls.subclasses[1].includes(id)) cls.subclasses[1].push(id);
  }
  return id;
}
function addRacialVariant(baseRace, key, data) {
  const id = `${normalizeKey(baseRace)}-${normalizeKey(key)}`;
  registries.RaceSubList[id] = { ...data, baseRace: normalizeKey(baseRace), mpmbKey: key };
  return id;
}
function addBackgroundVariant(base, key, data) {
  const id = `${normalizeKey(base)}-${normalizeKey(key)}`;
  registries.BackgroundList[id] = { ...data, baseBackground: normalizeKey(base), mpmbKey: key };
  return id;
}

function addFeatureChoice(feature, optional, choiceName, data, extraName) {
  if (!feature || typeof feature !== "object" || !choiceName) return choiceName;
  const name = String(choiceName);
  const key = normalizeKey(name);
  feature[key] = data && typeof data === "object" ? { ...data } : data;
  if (feature[key] && typeof feature[key] === "object" && extraName && !feature[key].extraname) feature[key].extraname = extraName;
  if (optional) {
    // Proxy-backed compatibility views return an inert shim for a missing property.
    // Test ownership before reading so a missing array is actually created.
    if (!Object.prototype.hasOwnProperty.call(feature, "__mpmbOptionalFeatureChoices") || !Array.isArray(feature.__mpmbOptionalFeatureChoices)) {
      feature.__mpmbOptionalFeatureChoices = [];
    }
    if (!feature.__mpmbOptionalFeatureChoices.some(x => normalizeKey(x?.name) === key)) feature.__mpmbOptionalFeatureChoices.push({ name, key, data: feature[key], extraName: extraName || "" });
  } else {
    if (!Object.prototype.hasOwnProperty.call(feature, "choices") || !Array.isArray(feature.choices)) feature.choices = [];
    if (!feature.choices.some(x => normalizeKey(x) === key)) feature.choices.push(name);
  }
  return name;
}
function createClassFeatureVariant(baseClass, featureKey, variantName, data) {
  const cls = registries.ClassList[normalizeKey(baseClass)];
  const feature = cls?.features?.[normalizeKey(featureKey)] || cls?.features?.[featureKey];
  if (!feature || typeof feature !== "object" || !variantName || !data || typeof data !== "object") return data;
  const stored = { ...data, __mpmbReplacesFeature: true, __mpmbReplacesFeatureKey: normalizeKey(featureKey) };
  addFeatureChoice(feature, true, variantName, stored, `Optional ${cls?.name || baseClass} ${Number(feature.minlevel || 1)}`);
  const list = feature.__mpmbOptionalFeatureChoices || [];
  const row = list.find(x => normalizeKey(x?.name) === normalizeKey(variantName));
  if (row) { row.replacement = true; row.data = feature[normalizeKey(variantName)]; }
  return stored;
}

function removeFeatureChoice(feature, _optional, choiceName) {
  if (!feature || typeof feature !== "object") return;
  const key = normalizeKey(choiceName);
  if (Array.isArray(feature.choices)) feature.choices = feature.choices.filter(x => normalizeKey(x) !== key);
  if (Array.isArray(feature.__mpmbOptionalFeatureChoices)) feature.__mpmbOptionalFeatureChoices = feature.__mpmbOptionalFeatureChoices.filter(x => normalizeKey(x?.name) !== key);
  delete feature[key];
}

function stub(name, result = undefined) {
  return (...args) => { bump(unknownCalls, name); return typeof result === "function" ? result(...args) : result; };
}

function universalShim(path) {
  const fn = function (...args) { bump(unknownCalls, path); return universalShim(`${path}()`); };
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return (hint) => hint === "string" ? "" : 0;
      if (prop === "valueOf") return () => 0;
      if (prop === "toString") return () => "";
      if (prop === "length") return 0;
      if (prop === Symbol.iterator) return function* () {};
      return universalShim(`${path}.${String(prop)}`);
    },
    set() { return true; },
    apply(_t, _thisArg, args) { bump(unknownCalls, path); return universalShim(`${path}()`); },
    construct() { bump(unknownCalls, `new ${path}`); return {}; },
  });
}

function registryView(name, target) {
  const missing = new Map();
  const nestedCache = new WeakMap();
  const wrapExisting = (value, path) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof RegExp || value instanceof Date) return value;
    if (nestedCache.has(value)) return nestedCache.get(value);
    const nestedMissing = new Map();
    const proxy = new Proxy(value, {
      get(obj, prop) {
        if (typeof prop === "symbol") return obj[prop];
        if (prop in obj) return wrapExisting(obj[prop], `${path}.${String(prop)}`);
        const key = String(prop);
        const full = `${path}.${key}`;
        bump(missingRegistryRefs, full);
        if (!nestedMissing.has(key)) nestedMissing.set(key, universalShim(full));
        return nestedMissing.get(key);
      },
      set(obj, prop, next) { nestedMissing.delete(String(prop)); obj[prop] = next; return true; },
      deleteProperty(obj, prop) { nestedMissing.delete(String(prop)); return delete obj[prop]; },
    });
    nestedCache.set(value, proxy);
    return proxy;
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === "symbol") return obj[prop];
      if (prop in obj) return wrapExisting(obj[prop], `${name}[${JSON.stringify(String(prop))}]`);
      const key = String(prop);
      bump(missingRegistryRefs, `${name}[${JSON.stringify(key)}]`);
      if (!missing.has(key)) missing.set(key, universalShim(`${name}[${JSON.stringify(key)}]`));
      return missing.get(key);
    },
    set(obj, prop, value) { missing.delete(String(prop)); obj[prop] = value; return true; },
    deleteProperty(obj, prop) { missing.delete(String(prop)); return delete obj[prop]; },
  });
}

export function resetImportDiagnostics() {
  log.length = 0; unknownGlobals.clear(); unknownCalls.clear(); missingRegistryRefs.clear();
  for (const k of Object.keys(fieldValues)) delete fieldValues[k];
}
export function getImportDiagnostics() {
  return {
    log: [...log],
    unknownGlobals: [...unknownGlobals.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
    shimCalls: [...unknownCalls.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
    missingRegistryRefs: [...missingRegistryRefs.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
  };
}

export function createMPMBSandbox(extras = {}) {
  const registryGlobals = Object.fromEntries(Object.entries(registries).map(([name, target]) => [name, registryView(name, target)]));
  const base = {
    ...registryGlobals,
    sheetVersion: 13002003,
    iFileName: "web-import.js",
    levels: Array.from({ length: 21 }, (_, i) => i),
    AbilityScores: { names: ["Str", "Dex", "Con", "Int", "Wis", "Cha"], abbreviations: ["Str","Dex","Con","Int","Wis","Cha"] },
    RequiredSheetVersion: (version) => { push("info", `Requires MPMB sheet ${version}`); return true; },
    AddSubClass: addSubClass,
    AddRacialVariant: addRacialVariant,
    AddBackgroundVariant: addBackgroundVariant,
    AddWarlockInvocation: (name, data) => { registries.WarlockInvocations[normalizeKey(name)] = data; return name; },
    AddFightingStyle: (name, data) => { registries.FightingStyles[normalizeKey(name)] = data; return name; },
    AddFeat: (name, data) => { registries.FeatsList[normalizeKey(name)] = data; return name; },
    RemoveFeat: stub("RemoveFeat"), AddFeatureChoice: addFeatureChoice, RemoveFeatureChoice: removeFeatureChoice,
    GetFeatureChoice: stub("GetFeatureChoice", ""), CreateClassFeatureVariant: createClassFeatureVariant,
    RunFunctionAtEnd: (fn) => { if (typeof fn === "function") { try { fn(); } catch (e) { push("warn", `Deferred function failed: ${e?.message ?? e}`); } } },
    desc: (v, prefix = "\n   ") => Array.isArray(v) ? `${prefix}${v.join(prefix)}` : `${prefix}${v}`,
    toUni: (v) => String(v ?? ""), ConvertToMetric: (v) => v,
    What: (name) => fieldValues[name] ?? 0, How: (name) => fieldValues[name] ?? 0,
    Value: (name, value) => { fieldValues[name] = value; return value; },
    AddString: stub("AddString"), RemoveString: stub("RemoveString"), AddAction: stub("AddAction"), RemoveAction: stub("RemoveAction"),
    SetProf: stub("SetProf"), Checkbox: stub("Checkbox"), PickDropdown: stub("PickDropdown", 0), SetStringifieds: stub("SetStringifieds"),
    ApplyArmor: stub("ApplyArmor"), processResistance: stub("processResistance"),
    tDoc: { getField: (name) => ({ value: fieldValues[name] ?? 0, isBoxChecked: () => 0, checkThisBox:()=>{}, setAction:()=>{} }), resetForm: (names) => (names ?? []).forEach((n) => delete fieldValues[n]) },
    app: { alert: stub("app.alert"), response: stub("app.response", ""), execDialog: stub("app.execDialog", "cancel") },
    event: { value: 0, target: null },

    // Common MPMB environment/configuration values needed during content registration.
    typePF: false, typePFS: false, typeP: false, isTemplVis: false, isDisplay: false,
    classes: { known: {}, old: {}, totallevel: 0 }, CurrentRace: {}, CurrentClasses: {}, CurrentSpells: {}, CurrentFeats: {},
    AtHigherLevels: "\n   At Higher Levels. ", AtHigherLevelsShort: " At Higher Levels: ",
    thermoM: false, metric: false,

    // Explicit language/runtime builtins. The Proxy's `has` trap intentionally captures every other name.
    Math, JSON, Object, Array, String, Number, Boolean, RegExp, Date, Map, Set, WeakMap, WeakSet,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    Infinity, NaN, undefined,
    console,
    ...extras,
  };

  let proxy;
  proxy = new Proxy(base, {
    has() { return true; },
    get(target, prop) {
      if (prop === Symbol.unscopables) return undefined;
      if (prop in target) return target[prop];
      const name = String(prop);
      bump(unknownGlobals, name);
      const shim = universalShim(name);
      target[prop] = shim; // stable identity; also lets assignments mutate the sandbox.
      return shim;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return proxy;
}

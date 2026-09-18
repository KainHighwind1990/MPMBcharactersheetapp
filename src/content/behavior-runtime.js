import { registries } from "./registry.js";
import { resolvedRaceParts } from "./race-variants.js";
import { resolvedBackgroundData } from "./background-variants.js";
import { selectedFeatIds } from "./choice-framework.js";
import { resolveMagicItemData } from "./ability-scores.js";
import { abilityMod, proficiencyBonus } from "../rules.js";

const norm = v => String(v ?? "").trim().toLowerCase();
const asArray = v => Array.isArray(v) ? v : (v == null ? [] : [v]);
const unique = a => [...new Set((a || []).filter(Boolean))];

function selectedChoiceData(feature, selectedName) {
  const wanted = norm(selectedName);
  if (!wanted || !feature || typeof feature !== "object") return null;
  if (feature[wanted] && typeof feature[wanted] === "object") return feature[wanted];
  for (const [key, value] of Object.entries(feature)) {
    if (!value || typeof value !== "object") continue;
    if (norm(key) === wanted || norm(value.name) === wanted) return value;
  }
  return null;
}

function classFeatureEntries(character) {
  const rows = [];
  const featureChoices = character.contentSelections?.featureChoices || {};
  const optionalChoices = character.contentSelections?.optionalFeatureChoices || {};
  const extraChoices = character.contentSelections?.extraFeatureChoices || {};
  const pushFeatures = (origin, originId, features, level, legacyOriginId = "") => {
    for (const [key, feature] of Object.entries(features || {})) {
      if (!feature || typeof feature !== "object" || Number(feature.minlevel || 1) > Number(level || 0)) continue;
      const id = `${originId}:${key}`;
      const optionalId = `optional:${id}`;
      const legacyId = legacyOriginId ? `${legacyOriginId}:${key}` : "";
      const legacyOptionalId = legacyId ? `optional:${legacyId}` : "";
      const selectedOptional = optionalChoices[optionalId] || optionalChoices[legacyOptionalId] || [];
      const optionalDefs = Array.isArray(feature.__mpmbOptionalFeatureChoices) ? feature.__mpmbOptionalFeatureChoices : [];
      const replacement = optionalDefs.find(item => item?.replacement && selectedOptional.some(x => norm(x) === norm(item.name)));
      const effectiveFeature = replacement?.data || feature;
      rows.push({ id, origin, name: effectiveFeature.name || key, data: effectiveFeature, level: Number(level || effectiveFeature.minlevel || feature.minlevel || 1), minlevel: Number(feature.minlevel || 1), kind: replacement ? "feature replacement" : "feature" });
      const selectedName = featureChoices[id] || (legacyId ? featureChoices[legacyId] : "");
      if (selectedName) {
        const data = selectedChoiceData(feature, selectedName);
        if (data) rows.push({ id: `${id}:choice:${norm(selectedName)}`, origin, name: data.name || selectedName, data, level: Number(level || feature.minlevel || 1), minlevel: Number(feature.minlevel || 1), kind: "feature choice", parentId: id });
      }
      for (const selected of optionalChoices[optionalId] || optionalChoices[legacyOptionalId] || []) {
        const def = optionalDefs.find(item => norm(item?.name) === norm(selected));
        if (def?.replacement) continue;
        const data = selectedChoiceData(feature, selected);
        if (data) rows.push({ id: `${id}:optional:${norm(selected)}`, origin, name: data.name || selected, data, level: Number(level || feature.minlevel || 1), minlevel: Number(feature.minlevel || 1), kind: "optional feature choice", parentId: id });
      }
      const extraId = `extra:${id}`, legacyExtraId=legacyId?`extra:${legacyId}`:"";
      for (const selected of extraChoices[extraId] || extraChoices[legacyExtraId] || []) {
        const data = selectedChoiceData(feature, selected);
        if (data) rows.push({ id: `${id}:extra:${norm(selected)}`, origin, name: data.name || selected, data, level: Number(level || feature.minlevel || 1), minlevel: Number(feature.minlevel || 1), kind: "extra feature choice", parentId: id });
      }
    }
  };

  const { base, variant } = resolvedRaceParts(character);
  const characterLevel = (character.classes || []).reduce((n, c) => n + Math.max(0, Number(c.level) || 0), 0);
  if (base) pushFeatures(base.name || character.race, `race:${norm(character.race)}`, base.features, characterLevel);
  if (variant) pushFeatures(variant.name || character.raceVariant, `racevariant:${character.raceVariant}`, variant.features, characterLevel);
  const bg = resolvedBackgroundData(character);
  if (bg.effective?.features) pushFeatures(bg.effective.name || "Background", `background:${bg.variantKey || bg.baseKey}`, bg.effective.features, 20);
  (character.classes || []).forEach((row, index) => {
    const cls = registries.ClassList[norm(row.name)];
    if (cls) pushFeatures(cls.name || row.name, `class:${norm(row.name)}`, cls.features, row.level, `class:${index}:${norm(row.name)}`);
    const sub = registries.ClassSubList[row.subclass];
    if (sub) pushFeatures(sub.subname || sub.fullname || sub.name || row.subclass, `subclass:${row.subclass}`, sub.features, row.level, `subclass:${index}:${row.subclass}`);
  });
  return rows;
}

function activeMagicItems(character) {
  const out = [];
  for (const [index, entry] of (character.magicItems || []).entries()) {
    const id = typeof entry === "string" ? entry : entry?.id;
    if (!id) continue;
    const resolved = resolveMagicItemData(entry);
    const base = resolved.base || {};
    const data = resolved.data || base;
    const needs = !!(base.attunement || base.attunementRequired || resolved.choice?.attunement || resolved.choice?.attunementRequired);
    if (needs && !(typeof entry === "object" && entry.attuned)) continue;
    out.push({ id: `magic:${index}:${id}`, origin: "Magic Item", name: data.name || base.name || id, data, level: 1, kind: "magic item" });
  }
  return out;
}

export function activeBehaviorEntries(character) {
  const rows = [];
  const { base, variant } = resolvedRaceParts(character);
  if (base) rows.push({ id: `race:${norm(character.race)}:root`, origin: base.name || character.race, name: base.name || character.race, data: base, level: 1, kind: "race" });
  if (variant) rows.push({ id: `racevariant:${character.raceVariant}:root`, origin: variant.name || character.raceVariant, name: variant.name || character.raceVariant, data: variant, level: 1, kind: "race variant" });
  const bg = resolvedBackgroundData(character);
  if (bg.effective) rows.push({ id: `background:${bg.variantKey || bg.baseKey}:root`, origin: bg.effective.name || "Background", name: bg.effective.name || "Background", data: bg.effective, level: 1, kind: "background" });
  rows.push(...classFeatureEntries(character));
  for (const id of selectedFeatIds(character)) {
    const data = registries.FeatsList[id];
    if (data) rows.push({ id: `feat:${id}`, origin: "Feat", name: data.name || id, data, level: 1, kind: "feat" });
  }
  rows.push(...activeMagicItems(character));
  return rows;
}

function valueForField(character, name) {
  const key = norm(name).replace(/\s+/g, " ");
  const abilities = { str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha" };
  for (const [abbr, id] of Object.entries(abilities)) {
    if (key === `${abbr} mod` || key === `${abbr[0].toUpperCase()}${abbr.slice(1)} mod`.toLowerCase()) return abilityMod(character.abilities?.[id]);
  }
  if (key === "proficiency bonus" || key === "prof bonus") return proficiencyBonus(character);
  if (key === "character level" || key === "total level") return (character.classes || []).reduce((n, x) => n + Number(x.level || 0), 0);
  return null;
}

function levelValue(value, level) {
  if (Array.isArray(value)) {
    const numericLevel = Math.max(1, Number(level || 1));
    // MPMB's global `levels` helper is [0..20], so arrays produced with
    // `levels.map(...)` contain an intentional level-0 element. Ordinary
    // feature progression arrays contain exactly 20 entries for levels 1..20.
    const rawIndex = value.length === 21 ? numericLevel : numericLevel - 1;
    const index = Math.max(0, Math.min(value.length - 1, rawIndex));
    return value[index];
  }
  return value;
}

function evaluateLimitedExpression(character, expr) {
  let transformed = String(expr || "").trim();
  transformed = transformed.replace(/(?:What|How)\(\s*['\"]([^'\"]+)['\"]\s*\)/g, (_m, field) => {
    const value = valueForField(character, field);
    return value == null ? "NaN" : String(Number(value));
  });
  transformed = transformed.replace(/\bNumber\s*\(/g, "(");
  transformed = transformed.replace(/\bparseInt\s*\(/g, "(");
  if (!/^[\d\s+\-*/%().,NaInfityMthaxmin]+$/i.test(transformed.replace(/Math\.(max|min|floor|ceil|round|abs)/g, "Mathmax"))) return null;
  // Restore known Math calls after the allow-list check.
  const safe = transformed;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${safe});`)();
    return Number.isFinite(Number(result)) ? Number(result) : null;
  } catch { return null; }
}

export function evaluateUsages(character, entry) {
  const raw = levelValue(entry?.data?.usages, entry?.level);
  let base = Number(raw);
  if (!Number.isFinite(base)) base = null;
  const calc = entry?.data?.usagescalc;
  if (typeof calc === "string") {
    const m = calc.match(/event\.value\s*=\s*([^;]+);?/i);
    if (m) {
      const value = evaluateLimitedExpression(character, m[1]);
      if (value != null) return Math.max(0, Math.trunc(value));
    }
  }
  return base == null ? null : Math.max(0, Math.trunc(base));
}

function normalizeAction(raw) {
  const rows = [];
  const list = Array.isArray(raw) && raw.length && !Array.isArray(raw[0]) && typeof raw[0] === "string" ? [raw] : asArray(raw);
  for (const item of list) {
    if (!item) continue;
    if (typeof item === "string") rows.push({ type: item, name: "" });
    else if (Array.isArray(item)) rows.push({ type: String(item[0] || "action"), name: String(item[1] || "") });
    else if (typeof item === "object") rows.push({ type: String(item.type || item.action || "action"), name: String(item.name || item.label || "") });
  }
  return rows;
}

function recoveryLabel(raw, level = 1) {
  // MPMB commonly stores recovery as a level-indexed array (for example,
  // Bardic Inspiration is long-rest recovery until Font of Inspiration, then
  // short-rest recovery). Resolve the value for the feature's current level
  // instead of presenting the entire progression array to the player.
  raw = levelValue(raw, level);
  return String(raw ?? "").trim();
}


function semanticCallbackSupported(entry, kind) {
  const name = String(entry?.name || "");
  if (kind === "calcChanges" && /^(Pact of the Blade|Agonizing Blast|Lifedrinker|Rage|Martial Arts|Ki-Empowered Strikes)$/i.test(name)) return true;
  if (kind === "changeeval" && /^Unarmored Movement$/i.test(name) && /monk/i.test(String(entry?.origin || ""))) return true;
  return false;
}

function callbackKinds(data) {
  const rows = [];
  for (const key of ["eval", "removeeval", "changeeval", "calcChanges", "spellChanges", "calculate"]) if (data?.[key] != null) rows.push(key);
  return rows;
}

function resourcePresentation(entry, max) {
  const name = norm(entry?.name);
  const origin = norm(entry?.origin);
  const description = norm(entry?.data?.description);
  const text = `${name} ${origin} ${description}`;
  // MPMB represents point pools with the same `usages` field it uses for discrete
  // once-per-rest abilities. Point pools need direct numeric remaining-value input,
  // not one clickable pip per point. Keep this semantic and source-readable rather
  // than keying only on a large number so ordinary multi-use features remain pips.
  const explicitPool = /\blay on hands\b/.test(name)
    || (/\bhealing hands\b/.test(name) && /tranquility/.test(origin))
    || (/\b(points?|pool)\b/.test(description) && /\b(use|uses|using|spend|spends|cost|pool)\b/.test(description));
  return { mode: explicitPool ? "pool" : "uses", unit: explicitPool ? "points" : "uses" };
}

export function behaviorProfile(character) {
  const entries = activeBehaviorEntries(character);
  const actions = [];
  const resources = [];
  const diagnostics = [];
  for (const entry of entries) {
    const actionRows = normalizeAction(entry.data?.action);
    for (const action of actionRows) actions.push({ id: `${entry.id}:action:${actions.length}`, sourceId: entry.id, source: entry.name, origin: entry.origin, ...action });
    const max = evaluateUsages(character, entry);
    if (max != null && max > 0) {
      const presentation = resourcePresentation(entry, max);
      resources.push({ id: entry.id, source: entry.name, origin: entry.origin, max, recovery: recoveryLabel(entry.data?.recovery, entry.level), additional: String(levelValue(entry.data?.additional, entry.level) ?? ""), spellGrant: !!entry.data?.spellcastingBonus, spellSheetResource: !!entry.data?.spellcastingBonus && /^(race|racevariant|feat):/.test(entry.id), ...presentation });
    }
    if (entry.data?.usagescalc && max == null) diagnostics.push({ source: entry.name, kind: "usagescalc", detail: "Could not translate this usages calculation yet." });
    for (const kind of callbackKinds(entry.data)) {
      if (semanticCallbackSupported(entry, kind)) continue;
      diagnostics.push({ source: entry.name, kind, detail: kind === "calcChanges" ? `Contains ${Object.keys(entry.data.calcChanges || {}).join(", ") || "callback"} behavior.` : "Acrobat callback detected; semantic handler required." });
    }
  }
  return { entries, actions, resources, diagnostics };
}

export function ensureBehaviorState(character) {
  character.behavior ||= {};
  character.behavior.resources ||= {};
  character.behavior.activeEntryIds ||= [];
  return character.behavior;
}

export function reconcileBehaviorState(character) {
  const state = ensureBehaviorState(character);
  const profile = behaviorProfile(character);
  const active = new Set(profile.entries.map(x => x.id));
  const resources = new Set(profile.resources.map(x => x.id));
  for (const row of profile.resources) {
    const old = state.resources[row.id] || {};
    state.resources[row.id] = { used: Math.max(0, Math.min(row.max, Number(old.used || 0))), max: row.max };
  }
  for (const id of Object.keys(state.resources)) if (!resources.has(id)) delete state.resources[id];
  const previous = new Set(state.activeEntryIds || []);
  state.lifecycle = {
    added: [...active].filter(id => !previous.has(id)),
    removed: [...previous].filter(id => !active.has(id)),
  };
  state.activeEntryIds = [...active];
  return { ...profile, state };
}

export function resourceStatus(character) {
  const profile = reconcileBehaviorState(character);
  return profile.resources.map(row => {
    const used = Number(character.behavior?.resources?.[row.id]?.used || 0);
    return { ...row, used, remaining: Math.max(0, row.max - used) };
  });
}

export function setResourceUsed(character, id, used) {
  const rows = resourceStatus(character);
  const row = rows.find(x => x.id === id);
  if (!row) return null;
  character.behavior.resources[id] = { used: Math.max(0, Math.min(row.max, Number(used || 0))), max: row.max };
  return character.behavior.resources[id];
}

function recoveryMatches(recovery, rest) {
  const text = norm(recovery);
  if (!text) return false;
  if (rest === "short") return /short rest|short or long rest|short\/long rest|short rest and long rest/.test(text);
  if (rest === "long") return /long rest|short or long rest|short\/long rest|short rest and long rest/.test(text);
  // Calendar-based recharge is deliberately separate from resting. A Staff of
  // Defense recharges at dawn, for example, even if nobody took a long rest.
  if (rest === "daily") return /dawn|dusk|day|daily/.test(text);
  return false;
}

export function resetBehaviorResources(character, rest = "long") {
  for (const row of resourceStatus(character)) if (recoveryMatches(row.recovery, rest)) character.behavior.resources[row.id].used = 0;
  return resourceStatus(character);
}

export function behaviorDiagnostics(character) {
  const profile = behaviorProfile(character);
  const grouped = new Map();
  for (const row of profile.diagnostics) {
    const key = `${row.kind}:${row.detail}`;
    const current = grouped.get(key) || { kind: row.kind, detail: row.detail, sources: [] };
    current.sources.push(row.source);
    grouped.set(key, current);
  }
  return [...grouped.values()].map(x => ({ ...x, sources: unique(x.sources) }));
}


function entryNameMatches(entry, pattern) {
  return pattern.test(String(entry?.name || ""));
}

/**
 * Browser-native translations for a small set of common MPMB attack callbacks.
 * These are intentionally semantic and opt-in: we only translate behavior where
 * the source rule can be identified unambiguously, rather than executing Acrobat JS.
 */
export function behaviorWeaponModifiers(character, weapon = {}, weaponEntry = {}) {
  const entries = activeBehaviorEntries(character);
  const name = String(weaponEntry?.name || weapon?.name || weaponEntry?.id || "");
  const id = String(weaponEntry?.id || "");
  const hay = `${id} ${name}`.toLowerCase();
  const notes = [];
  let hit = 0;
  let damage = 0;
  let forceProficient = false;
  let countsAsMagical = false;
  let abilityOverride = null;
  let minimumDamageDie = 0;

  const pactBlade = entries.some(e => entryNameMatches(e, /^Pact of the Blade$/i));
  const isPactNamed = /\bpact\b/i.test(name);
  if (pactBlade && isPactNamed) {
    forceProficient = true;
    countsAsMagical = true;
    notes.push("Pact of the Blade: treated as your pact weapon, proficient, and magical");
  }

  if (entries.some(e => entryNameMatches(e, /^Agonizing Blast$/i)) && /eldritch blast/.test(hay)) {
    const mod = abilityMod(character.abilities?.cha);
    damage += mod;
    notes.push(`Agonizing Blast: Charisma modifier ${mod >= 0 ? "+" : ""}${mod} to damage`);
  }

  if (entries.some(e => entryNameMatches(e, /^Lifedrinker$/i)) && pactBlade && isPactNamed) {
    const mod = abilityMod(character.abilities?.cha);
    damage += mod;
    notes.push(`Lifedrinker: Charisma modifier ${mod >= 0 ? "+" : ""}${mod} necrotic damage`);
  }

  if (entries.some(e => entryNameMatches(e, /^Thirsting Blade$/i)) && pactBlade && isPactNamed) {
    notes.push("Thirsting Blade: 2 attacks with this pact weapon when you take the Attack action");
  }

  const baseName = String(weapon?.name || weaponEntry?.id || name).toLowerCase();
  const isUnarmed = /unarmed strike/.test(`${baseName} ${name}`.toLowerCase());
  if (isUnarmed && entries.some(e => entryNameMatches(e, /^Ki-Empowered Strikes$/i) && /monk/i.test(String(e.origin || "")))) {
    countsAsMagical = true;
    notes.push("Ki-Empowered Strikes: unarmed strike counts as magical for overcoming resistance and immunity");
  }

  const martialArts = entries.find(e => entryNameMatches(e, /^Martial Arts$/i) && /monk/i.test(String(e.origin || "")));
  if (martialArts && !character.armor?.selected && !character.armor?.shield) {
    const type = String(weapon?.type || "").toLowerCase();
    const description = String(weapon?.description || "").toLowerCase();
    const isShortsword = /shortsword/.test(`${baseName} ${name}`.toLowerCase());
    const isSimpleMelee = /simple/.test(type) && (weapon?.list === "melee" || !/ranged/.test(type)) && !/heavy|two[- ]?handed/.test(`${description} ${name}`.toLowerCase());
    if (isUnarmed || isShortsword || isSimpleMelee) {
      if (String(weaponEntry?.ability || "auto").toLowerCase() === "auto" && abilityMod(character.abilities?.dex) > abilityMod(character.abilities?.str)) {
        abilityOverride = "dex";
      }
      const lvl = Number(martialArts.level || 1);
      minimumDamageDie = lvl < 5 ? 4 : lvl < 11 ? 6 : lvl < 17 ? 8 : 10;
      notes.push(`Martial Arts: may use Dexterity and at least 1d${minimumDamageDie} damage while unarmored and without a shield`);
    }
  }

  const rage = entries.find(e => entryNameMatches(e, /^Rage$/i));
  const desc = `${weapon?.description || ""} ${weaponEntry?.range || weapon?.range || ""}`.toLowerCase();
  const melee = weapon?.list === "melee" || /melee/.test(desc) || (!/ranged/.test(desc) && !/eldritch blast/.test(hay));
  const ability = String(weaponEntry?.ability || "auto").toLowerCase();
  if (rage && /\brage\b/i.test(name) && melee && (ability === "auto" || ability === "str")) {
    const lvl = Number(rage.level || 1);
    const bonus = lvl < 9 ? 2 : lvl < 16 ? 3 : 4;
    damage += bonus;
    notes.push(`Rage: +${bonus} melee weapon damage (weapon name includes “Rage”)`);
  }

  return { hit, damage, forceProficient, countsAsMagical, abilityOverride, minimumDamageDie, notes };
}

/** Common changeeval translation: Monk Unarmored Movement. */
export function behaviorSpeedBonus(character) {
  const entry = activeBehaviorEntries(character).find(e => entryNameMatches(e, /^Unarmored Movement$/i) && /monk/i.test(String(e.origin || "")));
  if (!entry) return { bonus: 0, notes: [] };
  if (character.armor?.selected || character.armor?.shield) return { bonus: 0, notes: ["Monk Unarmored Movement suppressed by armor or shield"] };
  const lvl = Number(entry.level || 0);
  const bonus = lvl < 2 ? 0 : lvl < 6 ? 10 : lvl < 10 ? 15 : lvl < 14 ? 20 : lvl < 18 ? 25 : 30;
  return { bonus, notes: bonus ? [`Monk Unarmored Movement +${bonus} ft`] : [] };
}

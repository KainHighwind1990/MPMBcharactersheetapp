import { registries } from "./registry.js";
import { skillMap } from "./core-content.js";
import { resolvedBackgroundData } from "./background-variants.js";

export const ALL_SKILLS = skillMap.map(([name]) => name);
const SKILL_LOOKUP = new Map(ALL_SKILLS.map(name => [norm(name), name]));

function norm(v) { return String(v ?? "").trim().toLowerCase(); }
function canonicalSkill(v) { return SKILL_LOOKUP.get(norm(v)) || null; }
function displayName(data, fallback) { return data?.name || String(fallback || "").replace(/\b\w/g, m => m.toUpperCase()); }
function unique(list) { return [...new Set(list.filter(Boolean))]; }

function extractFixedSkills(data) {
  const raw = data?.skills;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const s = canonicalSkill(item); if (s) out.push(s);
    } else if (Array.isArray(item) && item.length) {
      const s = canonicalSkill(item[0]); if (s) out.push(s);
    }
  }
  return unique(out);
}

function choiceText(data, mode = "primary") {
  const raw = data?.skillstxt;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") return raw[mode] || "";
  return "";
}

function parseChoice(text) {
  text = String(text || "").trim();
  if (!text) return null;
  const countWords = { one:1, two:2, three:3, four:4, five:5, six:6 };
  const m = text.match(/choose\s+(?:any\s+)?(one|two|three|four|five|six|\d+)\b/i);
  if (!m) return null;
  const count = Number(m[1]) || countWords[norm(m[1])] || 1;
  if (/choose\s+any\s+/i.test(text) && /skills?/i.test(text) && !/\bfrom\b/i.test(text)) {
    return { count, options: ALL_SKILLS.slice(), text };
  }
  const from = text.match(/\b(?:from|among)\b\s+(.+)$/i);
  if (!from) return { count, options: ALL_SKILLS.slice(), text, uncertain: true };
  let tail = from[1].replace(/[.;]+$/g, "").replace(/\band\b/gi, ",").replace(/\bor\b/gi, ",");
  const options = unique(tail.split(",").map(x => canonicalSkill(x.replace(/^\s*(?:the\s+)?/, "").trim())));
  return { count, options: options.length ? options : ALL_SKILLS.slice(), text, uncertain: !options.length };
}

function sourceRecord({ id, kind, label, data, mode = "primary" }) {
  return {
    id, kind, label, mode,
    fixed: extractFixedSkills(data),
    choice: parseChoice(choiceText(data, mode)),
    rawChoiceText: choiceText(data, mode),
  };
}

export function skillSources(character) {
  const out = [];
  const raceKey = norm(character.race);
  if (raceKey && registries.RaceList[raceKey]) {
    const data = registries.RaceList[raceKey];
    out.push(sourceRecord({ id:`race:${raceKey}`, kind:"race", label:`Race: ${displayName(data, raceKey)}`, data }));
    if (character.raceVariant && registries.RaceSubList[character.raceVariant]) {
      const variant = registries.RaceSubList[character.raceVariant];
      out.push(sourceRecord({ id:`racevariant:${character.raceVariant}`, kind:"race variant", label:`Race Variant: ${displayName(variant, character.raceVariant)}`, data: variant }));
    }
  }
  const bg = resolvedBackgroundData(character);
  if (bg.effective) {
    const id = bg.variantKey || bg.baseKey;
    out.push(sourceRecord({ id:`background:${id}`, kind:bg.variant ? "background variant" : "background", label:`Background: ${displayName(bg.effective, id)}`, data:bg.effective }));
  }
  (character.classes || []).forEach((row, index) => {
    const key = norm(row.name); const data = registries.ClassList[key]; if (!data) return;
    const mode = index === 0 ? "primary" : "secondary";
    const source = sourceRecord({ id:`class:${index}:${key}:${mode}`, kind:"class", label:`${index===0?"Starting class":"Multiclass"}: ${displayName(data,key)}`, data, mode });
    if (source.fixed.length || source.choice || source.rawChoiceText) out.push(source);
  });
  return out;
}

function selectionStore(character) {
  character.contentSelections ||= {};
  character.contentSelections.skillChoices ||= {};
  return character.contentSelections.skillChoices;
}

export function reconcileSkillProficiencies(character) {
  const sources = skillSources(character);
  const store = selectionStore(character);
  const validIds = new Set(sources.map(s=>s.id));
  for (const id of Object.keys(store)) if (!validIds.has(id)) delete store[id];

  const grants = new Map();
  const duplicates = [];
  function grant(skill, source, type="fixed") {
    if (!skill) return;
    if (!grants.has(skill)) grants.set(skill, []);
    else if (grants.get(skill).length) duplicates.push({skill, source});
    grants.get(skill).push({ sourceId:source.id, sourceLabel:source.label, type });
  }

  for (const source of sources) for (const skill of source.fixed) grant(skill, source, "fixed");

  for (const source of sources) {
    if (!source.choice) continue;
    const current = Array.isArray(store[source.id]) ? store[source.id] : [];
    const clean = [];
    for (const item of current) {
      const skill = canonicalSkill(item);
      if (!skill || clean.includes(skill) || !source.choice.options.includes(skill)) continue;
      if (grants.has(skill)) continue;
      clean.push(skill); grant(skill, source, "choice");
      if (clean.length >= source.choice.count) break;
    }
    store[source.id] = clean;
  }

  const priorRanks = character.skillProficiencies || {};
  character.skillProficiencies = {};
  for (const skill of grants.keys()) character.skillProficiencies[skill] = Number(priorRanks[skill]) === 2 ? 2 : 1;
  return { sources, grants, duplicates, store };
}

export function setSkillChoice(character, sourceId, slot, value) {
  const store = selectionStore(character);
  const arr = Array.isArray(store[sourceId]) ? [...store[sourceId]] : [];
  const skill = canonicalSkill(value) || "";
  arr[slot] = skill;
  store[sourceId] = arr.filter(Boolean);
  return reconcileSkillProficiencies(character);
}

export function skillChoiceStatus(character) {
  const state = reconcileSkillProficiencies(character);
  return state.sources.map(source => {
    const selected = state.store[source.id] || [];
    return { ...source, selected, missing: source.choice ? Math.max(0, source.choice.count - selected.length) : 0 };
  });
}

export function skillTooltip(character, skill) {
  const canonical = canonicalSkill(skill) || skill;
  const state = reconcileSkillProficiencies(character);
  const lines = [];
  const existing = state.grants.get(canonical) || [];
  if (existing.length) lines.push(`Proficient from: ${existing.map(g=>g.sourceLabel).join(", ")}`);
  else lines.push("Not currently proficient.");
  const eligible = state.sources.filter(s => s.choice?.options.includes(canonical));
  for (const source of eligible) {
    const picked = (state.store[source.id] || []).includes(canonical);
    lines.push(`${picked ? "Selected" : "Eligible"}: ${source.label} — ${source.choice.text}`);
  }
  const fixed = state.sources.filter(s => s.fixed.includes(canonical));
  for (const source of fixed) if (!existing.some(g=>g.sourceId===source.id)) lines.push(`Automatic: ${source.label}`);
  return lines.join("\n");
}

export function availableChoicesForSource(character, sourceId, slot) {
  const state = reconcileSkillProficiencies(character);
  const source = state.sources.find(s=>s.id===sourceId);
  if (!source?.choice) return [];
  const ownSelected = state.store[sourceId] || [];
  const current = ownSelected[slot] || "";
  return source.choice.options.map(skill => {
    const grants = state.grants.get(skill) || [];
    const grantedElsewhere = grants.some(g=>g.sourceId !== sourceId) || ownSelected.some((s,i)=>i!==slot && s===skill);
    return { skill, disabled: grantedElsewhere && skill !== current };
  });
}

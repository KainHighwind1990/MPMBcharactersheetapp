import { registries } from "./registry.js";
import { coreClassNames } from "./core-content.js";
import { resolvedBackgroundData } from "./background-variants.js";

const norm = (v) => String(v ?? "").trim().toLowerCase();
const display = (v) => String(v ?? "").replace(/\b\w/g, m => m.toUpperCase());

export function classOptions() {
  // The web sheet targets the final 2014 Ranger plus Tasha's optional class
  // features. Older UA replacement/playtest Ranger classes are superseded and
  // intentionally hidden from selectable class pools. Their registry data is
  // retained so imported content can still be parsed/audited safely.
  const supersededClassKeys = new Set(["rangerua", "ua-playtest-ranger", "spell-less ranger"]);
  const keys = new Set([...coreClassNames, ...Object.keys(registries.ClassList)].filter(key => !supersededClassKeys.has(key)));
  return [...keys].map(key => {
    const data = registries.ClassList[key] ?? {};
    let label = data.name || display(key);
    if (data.prestigeClassPrereq) label += " (Prestige Class)";
    return { key, label, data };
  }).sort((a,b)=>a.label.localeCompare(b.label));
}

export function subclassUnlockLevel(classKey) {
  const cls = registries.ClassList[norm(classKey)] ?? {};
  if (Number.isFinite(Number(cls.subclassLevel)) && Number(cls.subclassLevel) > 0) return Number(cls.subclassLevel);

  // MPMB's own base class records identify the subclass choice with a
  // class feature key such as subclassfeature1/2/3. Prefer that authoritative
  // class-level marker over scanning subclass feature internals (which can
  // contain helper entries that unlock earlier, e.g. spellcasting metadata).
  const classMarkers = Object.entries(cls.features ?? {})
    .filter(([key, feature]) => /^subclassfeature/i.test(key) && feature && typeof feature === "object")
    .map(([, feature]) => Number(feature.minlevel))
    .filter(level => Number.isFinite(level) && level > 0);
  if (classMarkers.length) return Math.min(...classMarkers);

  const candidates = subclassesForClass(classKey);
  const levels = candidates.flatMap(x => Object.values(x.data?.features ?? {})
    .filter(f => f && typeof f === "object")
    .map(f => Number(f.minlevel))
    .filter(level => Number.isFinite(level) && level > 0));
  return levels.length ? Math.min(...levels) : 3;
}

export function subclassesForClass(classKey) {
  const key = norm(classKey);
  const rows = Object.entries(registries.ClassSubList)
    .filter(([,data]) => norm(data?.baseClass) === key)
    .map(([id,data]) => ({ id, data, label: data?.subname || data?.fullname || data?.name || data?.mpmbKey || id }));
  const duplicateCounts = new Map();
  for (const row of rows) duplicateCounts.set(row.label, (duplicateCounts.get(row.label) || 0) + 1);
  return rows.map(row => ({ ...row, displayLabel: duplicateCounts.get(row.label) > 1 ? `${row.label} [${sourceShort(row.data)}]` : row.label }))
    .sort((a,b)=>a.displayLabel.localeCompare(b.displayLabel));
}

export function subclassSelectionForClass(classKey, subclassValue) {
  const value = String(subclassValue ?? "").trim();
  if (!value) return null;
  const wanted = norm(value);
  return subclassesForClass(classKey).find(row => row.id === value || norm(row.id) === wanted) || null;
}

export function validSubclassForClass(classKey, subclassValue) {
  return !!subclassSelectionForClass(classKey, subclassValue);
}

export function raceOptions() {
  const rows=Object.entries(registries.RaceList).map(([key,data]) => ({ key, label: data?.name || display(key), data }));
  const counts=new Map(); for(const row of rows) counts.set(norm(row.label),(counts.get(norm(row.label))||0)+1);
  for(const row of rows) if((counts.get(norm(row.label))||0)>1) row.label=`${row.label} (${sourceShort(row.data)})`;
  return rows.sort((a,b)=>a.label.localeCompare(b.label));
}

export function backgroundOptions() {
  return Object.entries(registries.BackgroundList).filter(([,data])=>!data?.baseBackground).map(([key,data]) => ({ key, label: data?.name || display(key), data }))
    .sort((a,b)=>a.label.localeCompare(b.label));
}

export function sourceShort(data) {
  const src = data?.source;
  if (!Array.isArray(src) || !src.length) return "unknown source";
  return src.map(x => Array.isArray(x) ? x[0] : x).filter(Boolean).join("/");
}


function spellGrantGroups(data) {
  const groups = new Map();
  const groupName = value => String(value || "").replace(/\s*\(level\s*\d+\)\s*$/i, "").trim();
  for (const b of (Array.isArray(data?.spellcastingBonus) ? data.spellcastingBonus : [])) {
    const name = groupName(b?.name); if (name) groups.set(norm(name), name);
  }
  for (const f of Object.values(data?.features || {})) {
    if (!f || typeof f !== "object" || !Array.isArray(f.spellcastingBonus) || !f.spellcastingBonus.length) continue;
    const name = groupName(f.name || f.spellcastingBonus[0]?.name); if (name) groups.set(norm(name), name);
  }
  return groups;
}

function traitWithoutSpellGrantSections(trait, groups) {
  const text = String(trait || "");
  if (!text || !groups?.size) return { general: text, sections: [] };
  const chunks = text.split(/\n\s*\n/);
  const sections = []; const keep = [];
  for (const chunk of chunks) {
    const m = chunk.match(/^\s*([^\n:]+):\s*\n?([\s\S]*)$/);
    const key = m ? norm(m[1]) : "";
    if (m && groups.has(key)) sections.push({ name: groups.get(key), description: cleanDescription(m[2]) });
    else keep.push(chunk);
  }
  return { general: cleanDescription(keep.join("\n\n")), sections };
}

function raceFeatureRows(data, level, origin, originId, selectedChoices, extraChoices) {
  const groups = spellGrantGroups(data);
  const split = traitWithoutSpellGrantSections(data?.trait, groups);
  const rows = [];
  if (split.general) rows.push({ origin, level: 1, name: "Racial Traits", description: split.general });
  for (const section of split.sections) rows.push({ origin, level: 1, name: section.name, description: section.description });
  for (const f of featureEntries(data?.features, level, originId, selectedChoices, extraChoices)) {
    const baseName = String(f.name || "").replace(/\s*\(level\s*\d+\)\s*$/i, "").trim();
    if (groups.has(norm(baseName))) continue;
    rows.push({ origin, ...f });
  }
  return rows;
}

export function activeFeatures(character) {
  const rows = [];
  const selectedChoices = character?.contentSelections?.featureChoices || {};
  const extraChoices = character?.contentSelections?.extraFeatureChoices || {};
  const optionalChoices = character?.contentSelections?.optionalFeatureChoices || {};
  const race = registries.RaceList[norm(character.race)];
  const characterLevel = (character.classes || []).reduce((n, c) => n + Math.max(0, Number(c.level) || 0), 0);
  if (race) {
    const variant = character.raceVariant ? registries.RaceSubList[character.raceVariant] : null;
    if (!variant) rows.push(...raceFeatureRows(race, characterLevel, race.name || character.race, `race:${norm(character.race)}`, selectedChoices, extraChoices));
    if (variant) {
      rows.push(...raceFeatureRows(variant, characterLevel, variant.name || variant.mpmbKey || character.raceVariant, `racevariant:${character.raceVariant}`, selectedChoices, extraChoices));
    }
  }
  const bg = resolvedBackgroundData(character);
  if (bg.effective) {
    const featureName = bg.effective.feature;
    if (featureName) {
      const featureData = registries.BackgroundFeatureList[norm(featureName)] || Object.values(registries.BackgroundFeatureList).find(f=>norm(f?.name)===norm(featureName));
      rows.push({ origin: bg.effective.name || display(bg.variantKey || bg.baseKey), level: 1, name: featureName, description: cleanDescription(featureData?.description || featureData?.descriptionFull || bg.effective.featuretxt || '') });
    }
  }
  for (const [index, cls] of (character.classes ?? []).entries()) {
    const classData = registries.ClassList[norm(cls.name)];
    const classOriginId = `class:${norm(cls.name)}`, legacyClassOriginId=`class:${index}:${norm(cls.name)}`;
    for (const f of featureEntries(classData?.features, cls.level, classOriginId, selectedChoices, extraChoices, optionalChoices, legacyClassOriginId)) rows.push({ origin: classData?.name || display(cls.name), ...f });
    if (cls.subclass) {
      const sub = registries.ClassSubList[cls.subclass];
      const subclassOriginId = `subclass:${cls.subclass}`, legacySubclassOriginId=`subclass:${index}:${cls.subclass}`;
      for (const f of featureEntries(sub?.features, cls.level, subclassOriginId, selectedChoices, extraChoices, optionalChoices, legacySubclassOriginId)) rows.push({ origin: sub?.subname || sub?.fullname || sub?.name || cls.subclass, ...f });
    }
  }
  return rows.sort((a,b)=>(a.level-b.level)||a.origin.localeCompare(b.origin)||a.name.localeCompare(b.name));
}

function featureEntries(features, level, originId = "", selectedChoices = {}, extraChoices = {}, optionalChoices = {}, legacyOriginId = "") {
  if (!features || typeof features !== "object") return [];
  return Object.entries(features)
    .filter(([,f]) => f && typeof f === "object" && Number(f.minlevel || 1) <= Number(level || 0))
    .map(([key,f]) => {
      const optionalId=originId?`optional:${originId}:${key}`:"";
      const optionalDefs=Array.isArray(f.__mpmbOptionalFeatureChoices)?f.__mpmbOptionalFeatureChoices:[];
      const legacyOptionalId=legacyOriginId?`optional:${legacyOriginId}:${key}`:"";
      const selectedOptional=optionalId?(optionalChoices[optionalId]||optionalChoices[legacyOptionalId]||[]):[];
      const replacement=optionalDefs.find(item=>item?.replacement&&selectedOptional.some(x=>norm(x)===norm(item.name)));
      const effective=replacement?.data||f;
      const selectedName = originId ? (selectedChoices[`${originId}:${key}`] || (legacyOriginId ? selectedChoices[`${legacyOriginId}:${key}`] : "")) : "";
      const selected = selectedName ? selectedChoiceData(f, selectedName) : null;
      const extraId = originId ? `extra:${originId}:${key}` : "";
      const legacyExtraId=legacyOriginId?`extra:${legacyOriginId}:${key}`:"";
      const extras = (extraChoices[extraId] || extraChoices[legacyExtraId] || []).map(name => {
        const data = selectedChoiceData(f, name);
        return { name: data?.name || name, description: cleanDescription(data?.description), usages: data?.usages, recovery: data?.recovery, action: data?.action };
      });
      return {
        level: Number(f.minlevel || 1),
        name: effective.name || "Unnamed Feature",
        description: cleanDescription(resolveLevelIndexedValue(effective.description, level)),
        usages: effective.usages,
        recovery: effective.recovery,
        action: effective.action,
        choice: selectedName ? {
          name: selected?.name || selectedName,
          description: cleanDescription(resolveLevelIndexedValue(selected?.description, level)),
          usages: selected?.usages,
          recovery: selected?.recovery,
          action: selected?.action,
        } : null,
        extras,
      };
    });
}

function selectedChoiceData(feature, selectedName) {
  const wanted = norm(selectedName);
  if (!wanted || !feature || typeof feature !== "object") return null;
  const direct = feature[wanted];
  if (direct && typeof direct === "object") return direct;
  for (const value of Object.values(feature)) {
    if (value && typeof value === "object" && norm(value.name) === wanted) return value;
  }
  return null;
}

function resolveLevelIndexedValue(value, level) {
  // MPMB commonly builds changing feature text with levels.map(...), producing
  // a 20/21-entry array whose entry for the current class level is the complete
  // replacement description. It is not a list of paragraphs to concatenate.
  if (!Array.isArray(value)) return value;
  const numericLevel = Math.max(1, Math.min(20, Number(level) || 1));
  if (value.length >= 20 && value.every(entry => entry == null || typeof entry === "string")) {
    // MPMB's `levels` helper is normally 1-based (index 0 is level 0), but
    // tolerate 20-entry imported arrays that start directly at level 1.
    const index = value.length >= 21 ? numericLevel : numericLevel - 1;
    return value[index] ?? value.slice(0, index + 1).reverse().find(entry => entry != null && entry !== "") ?? "";
  }
  return value;
}

function cleanDescription(v) {
  if (Array.isArray(v)) return v.map(cleanDescription).filter(Boolean).join("\n");
  return String(v ?? "").replace(/^\s+/, "").replace(/\n\s+/g, "\n").trim();
}

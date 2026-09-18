import { registries } from "./registry.js";
import { abilityMod, proficiencyBonus } from "../rules.js";
import { weaponProficiencyProfile } from "./choice-framework.js";
import { fightingStyleWeaponModifiers, mediumArmorDexCap } from "./combat.js";
import { behaviorWeaponModifiers } from "./behavior-runtime.js";

const display = (v) => String(v ?? "").replace(/\b\w/g, m => m.toUpperCase());
const norm = (v) => String(v ?? "").trim().toLowerCase();
const optionRows = (registry, nameKeys=["name"]) => Object.entries(registry || {}).map(([key,data]) => ({
  key, data, label: nameKeys.map(k=>data?.[k]).find(Boolean) || display(key)
})).sort((a,b)=>a.label.localeCompare(b.label));

export const featOptions = () => optionRows(registries.FeatsList);
export const weaponOptions = () => optionRows(registries.WeaponsList);
export const armorOptions = () => optionRows(registries.ArmourList).filter(o => norm(o.key) !== "unarmored" && norm(o.label) !== "unarmored");

function classLevel(character, name) {
  return (character.classes || []).filter(c => norm(c.name) === norm(name)).reduce((n,c) => n + (Number(c.level)||0), 0);
}

export function unarmoredDefenseOptions(character) {
  const out=[{key:"normal",label:"Unarmored (10 + Dex)"}];
  if (classLevel(character,"monk") >= 1) out.push({key:"monk",label:"Unarmored Defense — Monk (10 + Dex + Wis)"});
  if (classLevel(character,"barbarian") >= 1) out.push({key:"barbarian",label:"Unarmored Defense — Barbarian (10 + Dex + Con)"});
  return out;
}
export const magicItemOptions = () => optionRows(registries.MagicItemsList);
export const spellOptions = () => optionRows(registries.SpellsList);
export const gearOptions = () => optionRows(registries.GearList, ["infoname","name"]);
export const packOptions = () => optionRows(registries.PacksList);

export function enhancementFromName(name) {
  const m=String(name||"").match(/(?:^|\s)\+\s*([123])(?:\b|$)/);
  return m ? Number(m[1]) : 0;
}

function cleanBaseName(name) {
  return String(name||"").replace(/\s*\+\s*[123](?=\b|$)/g, "").replace(/\s{2,}/g," ").trim();
}

export function weaponEntryFromId(id) {
  const w=registries.WeaponsList[id]||{};
  const damage=Array.isArray(w.damage)?w.damage:[];
  return {
    id,
    name:w.name||display(id),
    enhancement:enhancementFromName(w.name),
    ability:"auto",
    damageCount:Number(damage[0]||1),
    damageDie:Number(damage[1]||0),
    damageType:damage[2]||"",
    range:w.range||"",
    hitMisc:0,
    damageMisc:0,
    proficientOverride:null,
    wielding:"main-hand",
  };
}

function normalizeWeaponEntry(entry) {
  if(typeof entry==="string") return weaponEntryFromId(entry);
  const base=weaponEntryFromId(entry?.id||"");
  const out={...base,...entry};
  if (out.proficientOverride === undefined) {
    if (out.proficient === "yes") out.proficientOverride = true;
    else if (out.proficient === "no") out.proficientOverride = false;
    else out.proficientOverride = null;
  }
  delete out.proficient;
  const typed=enhancementFromName(out.name);
  if(typed) out.enhancement=typed;
  out.enhancement=Math.max(0,Math.min(3,Number(out.enhancement)||0));
  return out;
}

export function setWeaponEnhancement(entry, value) {
  const n=Math.max(0,Math.min(3,Number(value)||0));
  entry.enhancement=n;
  const base=cleanBaseName(entry.name || registries.WeaponsList[entry.id]?.name || display(entry.id));
  entry.name=`${base}${n?` +${n}`:""}`;
  return entry;
}

export function syncWeaponNameEnhancement(entry) {
  const parsed=enhancementFromName(entry.name);
  entry.enhancement=parsed;
  return entry;
}

export function ensureSheetSections(character) {
  character.feats ??= [];
  character.weapons = Array.isArray(character.weapons) ? character.weapons.map(normalizeWeaponEntry) : [];
  character.armor ??= { selected:"", shield:false, misc:0 };
  character.armor.enhancement ??= enhancementFromName(character.armor.name||"");
  character.armor.name ??= registries.ArmourList[character.armor.selected]?.name || "";
  character.armor.baseAc ??= null;
  character.armor.typeOverride ??= "";
  character.armor.shieldEnhancement ??= 0;
  character.armor.unarmoredDefense ??= "normal";
  character.magicItems ??= [];
  character.spells ??= [];
  character.inventory ??= [];
  character.currency ??= { cp:0, sp:0, ep:0, gp:0, pp:0 };
  character.notes ??= "";
  return character;
}

function hasWeaponProficiency(character, weapon) {
  if (!weapon) return false;
  const type = norm(weapon.type);
  const profile = weaponProficiencyProfile(character);
  if (profile.simple && type.includes("simple")) return true;
  if (profile.martial && type.includes("martial")) return true;
  return profile.names.includes(norm(weapon.name));
}

export function weaponSummary(character, entryOrId) {
  const entry=normalizeWeaponEntry(entryOrId);
  const w = registries.WeaponsList[entry.id]||{};
  if (!entry.id && !entry.name) return null;
  let ability = entry.ability && entry.ability!=="auto" ? entry.ability : (Number(w.ability || 1) === 2 ? "dex" : "str");
  const text = `${w.description || ""} ${entry.range || w.range || ""}`.toLowerCase();
  if (entry.ability==="auto" && text.includes("finesse")) {
    if (abilityMod(character.abilities.dex) > abilityMod(character.abilities.str)) ability = "dex";
  }
  if (entry.ability==="auto" && (w.list === "ranged" || /ranged/.test(text)) && !text.includes("thrown")) ability = "dex";
  const autoProf = hasWeaponProficiency(character,w);
  const behaviorMods=behaviorWeaponModifiers(character,w,entry);
  if (behaviorMods.abilityOverride) ability = behaviorMods.abilityOverride;
  const proficient=entry.proficientOverride===true?true:entry.proficientOverride===false?false:(autoProf||behaviorMods.forceProficient);
  const mod = abilityMod(character.abilities[ability]);
  const enhancement=Math.max(0,Math.min(3,Number(entry.enhancement)||0));
  const styles=fightingStyleWeaponModifiers(character,w,entry);
  const hit = mod + (proficient ? proficiencyBonus(character) : 0) + enhancement + (Number(entry.hitMisc)||0) + styles.hit + behaviorMods.hit;
  let damageAbility = w.abilitytodamage === false ? 0 : mod;
  if (entry.wielding === "off-hand" && !styles.notes.some(x=>/Two-Weapon Fighting/i.test(x))) damageAbility = 0;
  const damageBonus=damageAbility+enhancement+(Number(entry.damageMisc)||0)+styles.damage+behaviorMods.damage;
  const count=Number(entry.damageCount)||0;
  let die=Number(entry.damageDie)||0;
  if (count === 1 && Number(behaviorMods.minimumDamageDie || 0) > die) die = Number(behaviorMods.minimumDamageDie);
  const damageDice=count&&die?`${count}d${die}`:"—";
  const damage=damageDice==="—"?damageDice:`${damageDice}${damageBonus===0?"":damageBonus>0?`+${damageBonus}`:`${damageBonus}`} ${entry.damageType||""}`.trim();
  return { entry, id:entry.id, name:entry.name||w.name||display(entry.id), ability, proficient, autoProficient:autoProf, hit, damage, damageDice, damageBonus, enhancement, range:entry.range||w.range||"", description:w.description||"", source:w.source, styleNotes:[...styles.notes,...behaviorMods.notes], countsAsMagical:behaviorMods.countsAsMagical, isRanged:styles.ranged, isMelee:styles.melee };
}

export function selectArmor(character, id) {
  ensureSheetSections(character);
  const a=registries.ArmourList[id]||{};
  character.armor.selected=id;
  character.armor.name=a.name||display(id);
  character.armor.enhancement=enhancementFromName(a.name);
  character.armor.baseAc=a.ac!==undefined && Number.isFinite(Number(a.ac)) ? Number(a.ac) : null;
  character.armor.typeOverride=a.type||"";
  return character.armor;
}

export function setArmorEnhancement(character, value) {
  ensureSheetSections(character);
  const n=Math.max(0,Math.min(3,Number(value)||0));
  character.armor.enhancement=n;
  const fallback=registries.ArmourList[character.armor.selected]?.name||"Armor";
  const base=cleanBaseName(character.armor.name||fallback);
  character.armor.name=`${base}${n?` +${n}`:""}`;
}

export function syncArmorNameEnhancement(character) {
  ensureSheetSections(character);
  character.armor.enhancement=enhancementFromName(character.armor.name);
}

export function calculatedArmorClass(character) {
  ensureSheetSections(character);
  const a = registries.ArmourList[character.armor?.selected]||{};
  const dex = abilityMod(character.abilities.dex);
  let ac = 10 + dex;
  if (!character.armor?.selected) {
    const mode=norm(character.armor?.unarmoredDefense || "normal");
    // Monk Unarmored Defense requires no armor and no shield. Barbarian permits a shield.
    if (mode === "monk" && classLevel(character,"monk") >= 1 && !character.armor?.shield) ac += abilityMod(character.abilities.wis);
    else if (mode === "barbarian" && classLevel(character,"barbarian") >= 1) ac += abilityMod(character.abilities.con);
  }
  if (character.armor?.selected) {
    const type = norm(character.armor.typeOverride || a.type);
    const baseAc=character.armor.baseAc!==null && character.armor.baseAc!==undefined ? Number(character.armor.baseAc) : Number(a.ac || 10);
    if (type === "heavy") ac = baseAc;
    else if (type === "medium") ac = baseAc + Math.min(mediumArmorDexCap(character),dex);
    else ac = baseAc + dex;
    ac += Number(character.armor.enhancement)||0;
  }
  if (character.armor?.shield) ac += 2 + (Number(character.armor.shieldEnhancement)||0);
  ac += Number(character.armor?.misc || 0);
  return ac;
}

export function featSummary(id) {
  const f=registries.FeatsList[id]; if(!f) return null;
  return {id,name:f.name||display(id), prerequisite:f.prerequisite||"", description:f.descriptionFull||f.description||"", source:f.source};
}
export function magicItemSummary(id) {
  const m=registries.MagicItemsList[id]; if(!m) return null;
  return {id,name:m.name||display(id), attunement:!!(m.attunement||m.attunementRequired), description:m.descriptionFull||m.description||m.tooltip||"", type:m.type||"", source:m.source};
}
export function spellCastingTimeLabel(value, fullValue="") {
  const raw=String(fullValue||value||"").trim();
  const short=String(value||"").trim().toLowerCase();
  if (!raw) return "";
  if (/\brea(?:ction)?\b/.test(short) || /^1\s*reaction\b/i.test(raw)) return fullValue ? raw.replace(/^1\s*reaction/i,"Reaction") : "Reaction";
  if (/\bbns\b|bonus\s*action/.test(short) || /^1\s*bonus action\b/i.test(raw)) return fullValue ? raw.replace(/^1\s*bonus action/i,"Bonus Action") : "Bonus Action";
  if (/^1\s*a(?:\b|ction)/.test(short) || /^1\s*action\b/i.test(raw)) return fullValue ? raw.replace(/^1\s*action/i,"Action") : "Action";
  return raw
    .replace(/^(\d+)\s*rnd$/i,"$1 round")
    .replace(/^(\d+)\s*min$/i,"$1 minute")
    .replace(/^(\d+)\s*h$/i,"$1 hour");
}

export function spellSummary(id) {
  const s=registries.SpellsList[id]; if(!s) return null;
  const components=String(s.components||"").trim();
  const material=String(s.compMaterial||"").trim();
  const concentration=/^\s*conc[,.]?/i.test(String(s.duration||""));
  return {
    id,
    name:s.name||display(id),
    level:Number(s.level||0),
    school:s.school||"",
    time:s.time||"",
    timeFull:s.timeFull||"",
    castingTime:spellCastingTimeLabel(s.time,s.timeFull),
    range:s.range||"",
    components,
    material,
    duration:s.duration||"",
    concentration,
    ritual:!!s.ritual,
    save:s.save||"",
    description:s.description||s.descriptionShorter||s.descriptionFull||"",
    descriptionFull:s.descriptionFull||s.description||s.descriptionShorter||"",
    source:s.source
  };
}

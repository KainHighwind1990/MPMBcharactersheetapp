import { registries } from "./registry.js";
import { resolvedRaceParts } from "./race-variants.js";
import { resolvedBackgroundData } from "./background-variants.js";
import { selectedFeatIds } from "./choice-framework.js";
import { resolveMagicItemData } from "./ability-scores.js";
import { abilityMod, proficiencyBonus } from "../rules.js";
import { behaviorSpeedBonus } from "./behavior-runtime.js";

const norm = v => String(v ?? "").trim().toLowerCase();
const unique = a => [...new Set((a || []).filter(Boolean))];
const asArray = v => Array.isArray(v) ? v : (v == null ? [] : [v]);

export const STANDARD_CONDITIONS = [
  ["blinded","Blinded","Can’t see; attacks against you have advantage and your attacks have disadvantage."],
  ["charmed","Charmed","Can’t attack/charm the charmer; charmer has advantage on social checks against you."],
  ["deafened","Deafened","Can’t hear and automatically fails checks that require hearing."],
  ["frightened","Frightened","Disadvantage on checks/attacks while source is visible; can’t willingly move closer."],
  ["grappled","Grappled","Speed becomes 0."],
  ["incapacitated","Incapacitated","Can’t take actions or reactions."],
  ["invisible","Invisible","Can’t be seen without special senses; attacks against you usually have disadvantage and yours advantage."],
  ["paralyzed","Paralyzed","Incapacitated; can’t move/speak; auto-fail STR/DEX saves; nearby hits become critical."],
  ["petrified","Petrified","Incapacitated and immobile; resistance to all damage; auto-fail STR/DEX saves."],
  ["poisoned","Poisoned","Disadvantage on attack rolls and ability checks."],
  ["prone","Prone","Crawl unless standing; attacks affected by distance; your attacks have disadvantage."],
  ["restrained","Restrained","Speed becomes 0; attacks against you advantage; your attacks disadvantage; DEX saves disadvantage."],
  ["stunned","Stunned","Incapacitated; can’t move; auto-fail STR/DEX saves; attacks against you have advantage."],
  ["unconscious","Unconscious","Incapacitated; prone; unaware; drops held items; auto-fail STR/DEX saves; nearby hits become critical."],
];

function activeMagicItems(character){
  const out=[];
  for(const entry of character.magicItems||[]){
    const id=typeof entry==="string"?entry:entry?.id; if(!id) continue;
    const resolved=resolveMagicItemData(entry); const base=resolved.base||{}; const data=resolved.data||base;
    const needs=!!(base.attunement||base.attunementRequired||resolved.choice?.attunement||resolved.choice?.attunementRequired);
    const active=!needs || (typeof entry==="object" && !!entry.attuned);
    if(active) out.push({label:data.name||base.name||id,data,base,entry});
  }
  return out;
}

function selectedFeatureData(character){
  const rows=[];
  const selections=character.contentSelections?.featureChoices||{};
  for(const [id,choice] of Object.entries(selections)){
    if(!choice) continue;
    const parts=id.split(":");
    let owner=null, feature=null;
    if(parts[0]==="class"){
      const index=Number(parts[1]); const cls=registries.ClassList[norm(parts[2])]; const key=parts.slice(3).join(":"); owner=cls; feature=cls?.features?.[key];
    } else if(parts[0]==="subclass"){
      const sub=registries.ClassSubList[parts[2]]; const key=parts.slice(3).join(":"); owner=sub; feature=sub?.features?.[key];
    }
    if(!feature) continue;
    const selected=feature[norm(choice)] || feature[choice] || null;
    rows.push({label:selected?.name||choice, data:selected||feature, owner, feature, choice});
  }
  return rows;
}

function activeSourceData(character){
  const out=[];
  const {base,variant}=resolvedRaceParts(character);
  if(base) out.push({label:base.name||character.race,data:base});
  if(variant) out.push({label:variant.name||character.raceVariant,data:variant});
  const bg=resolvedBackgroundData(character); if(bg.effective) out.push({label:bg.effective.name||"Background",data:bg.effective});
  for(const row of character.classes||[]){
    const cls=registries.ClassList[norm(row.name)]; if(cls){
      out.push({label:cls.name||row.name,data:cls});
      for(const f of Object.values(cls.features||{})) if(f&&typeof f==="object"&&Number(f.minlevel||1)<=Number(row.level||0)) out.push({label:f.name||cls.name||row.name,data:f});
    }
    const sub=registries.ClassSubList[row.subclass]; if(sub){
      out.push({label:sub.subname||sub.fullname||row.subclass,data:sub});
      for(const f of Object.values(sub.features||{})) if(f&&typeof f==="object"&&Number(f.minlevel||1)<=Number(row.level||0)) out.push({label:f.name||sub.subname||row.subclass,data:f});
    }
  }
  for(const id of selectedFeatIds(character)){ const f=registries.FeatsList[id]; if(f) out.push({label:f.name||id,data:f}); }
  out.push(...selectedFeatureData(character));
  out.push(...activeMagicItems(character));
  return out;
}

export function hasNamedFeat(character, name){
  const q=norm(name); return selectedFeatIds(character).some(id=>norm(registries.FeatsList[id]?.name||id)===q);
}

export function mediumArmorDexCap(character){ return hasNamedFeat(character,"Medium Armor Master") ? 3 : 2; }

export function combatPassivePerception(character){
  const rank=Number(character.skillProficiencies?.Perception||0);
  let value=10+abilityMod(character.abilities?.wis)+proficiencyBonus(character)*rank;
  if(hasNamedFeat(character,"Observant")) value+=5;
  return value;
}

function numberFromMod(mod, character){
  if(Number.isFinite(Number(mod))) return Number(mod);
  const text=String(mod??"").trim();
  const m=text.match(/^([+-]?\d+)$/); if(m) return Number(m[1]);
  const max=text.match(/^max\((Str|Dex|Con|Int|Wis|Cha)\|(-?\d+)\)$/i);
  if(max){ const key=norm(max[1]).slice(0,3); return Math.max(abilityMod(character.abilities?.[key]),Number(max[2])); }
  return 0;
}

export function savingThrowExtra(character, ability){
  let bonus=0; const notes=[];
  for(const src of activeSourceData(character)) for(const item of asArray(src.data?.addMod)){
    if(!item||typeof item!=="object"||norm(item.type)!=="save") continue;
    const field=norm(item.field); if(field!=="all" && !field.includes(norm(ability)) && !field.includes(norm(ability).slice(0,3))) continue;
    const n=numberFromMod(item.mod,character); if(n){ bonus+=n; notes.push(`${src.label} ${n>=0?"+":""}${n}`); }
  }
  return {bonus,notes};
}

export function combatSaveBonus(character, ability){
  const base=abilityMod(character.abilities?.[ability]);
  const prof=(character.saveProficiencies||[]).includes(ability)?proficiencyBonus(character):0;
  return base+prof+savingThrowExtra(character,ability).bonus;
}

export function fightingStyleNames(character){
  const names=[];
  for(const v of Object.values(character.contentSelections?.featureChoices||{})) if(/archery|defense|dueling|great weapon fighting|protection|two-weapon fighting/i.test(String(v||""))) names.push(norm(v));
  return unique(names);
}

function isRangedWeapon(w,entry){
  const txt=`${w?.list||""} ${w?.range||""} ${w?.description||""} ${entry?.range||""}`.toLowerCase();
  return w?.list==="ranged" || (/ranged/.test(txt)&&!/thrown/.test(txt));
}
function isMeleeWeapon(w,entry){ return !isRangedWeapon(w,entry) || /melee/.test(String(w?.range||entry?.range||"").toLowerCase()); }

export function fightingStyleWeaponModifiers(character, weapon, entry){
  const styles=fightingStyleNames(character); let hit=0, damage=0; const notes=[];
  const ranged=isRangedWeapon(weapon,entry), melee=isMeleeWeapon(weapon,entry);
  if(styles.includes("archery")&&ranged){ hit+=2; notes.push("Archery +2 to hit"); }
  if(styles.includes("dueling")&&melee&&entry?.wielding!=="two-handed"&&entry?.wielding!=="off-hand") { damage+=2; notes.push("Dueling +2 damage (one-handed)"); }
  if(styles.includes("two-weapon fighting")&&entry?.wielding==="off-hand") notes.push("Two-Weapon Fighting: ability modifier applies to off-hand damage");
  if(styles.includes("great weapon fighting")&&melee&&entry?.wielding==="two-handed") notes.push("Great Weapon Fighting: reroll 1s and 2s on weapon damage dice");
  return {hit,damage,notes,ranged,melee};
}

function extraAcRows(character){
  const rows=[];
  for(const src of activeSourceData(character)) for(const x of asArray(src.data?.extraAC)){
    if(!x||typeof x!=="object") continue;
    const mod=numberFromMod(x.mod,character); if(!mod) continue;
    // MPMB's Defense style uses stopeval to require worn armor. Handle that common condition semantically.
    if(/defense fighting style/i.test(String(x.name||src.label)) && !character.armor?.selected) continue;
    rows.push({source:x.name||src.label,mod,text:x.text||""});
  }
  // Some selected style definitions are easier and safer to recognize explicitly.
  if(fightingStyleNames(character).includes("defense") && character.armor?.selected && !rows.some(x=>/defense fighting style/i.test(x.source))) rows.push({source:"Defense Fighting Style",mod:1,text:"+1 AC while wearing armor"});
  if(hasNamedFeat(character,"Dual Wielder") && (character.weapons||[]).some(x=>x?.wielding==="off-hand") && (character.weapons||[]).some(x=>(x?.wielding||"main-hand")==="main-hand")) rows.push({source:"Dual Wielder",mod:1,text:"+1 AC while wielding a separate melee weapon in each hand"});
  return rows;
}

function raceWalkData(character){
  const {base,variant}=resolvedRaceParts(character); const data=(variant?.speed?variant:base)?.speed?.walk || base?.speed?.walk || {};
  return {spd:Number(data.spd)||30,enc:Number(data.enc)||Number(data.spd)||30};
}
function sourceSpeedAdjustments(character){
  let add=0; const modes={}; const notes=[];
  for(const src of activeSourceData(character)){
    const speed=src.data?.speed; if(!speed||typeof speed!=="object") continue;
    if(speed.allModes!=null){ const n=Number(String(speed.allModes).replace(/[^0-9+-.]/g,""))||0; add+=n; if(n) notes.push(`${src.label} ${n>=0?"+":""}${n} ft`); }
    for(const mode of ["fly","swim","climb","burrow"]){ const v=speed[mode]; if(!v) continue; modes[mode]=v; notes.push(`${src.label}: ${mode} speed`); }
  }
  return {add,modes,notes};
}

export function derivedSpeed(character){
  const race=raceWalkData(character); let walk=race.spd; const notes=[];
  const armor=registries.ArmourList[character.armor?.selected]||{}; const req=Number(armor.strReq||0); const str=Number(character.abilities?.str||0);
  if(req&&str<req){
    // Dwarves and similar races encode an encumbered speed equal to normal speed; honor that source behavior.
    walk=race.enc; notes.push(`${armor.name||"Armor"}: STR ${req} required${race.enc===race.spd?"; racial speed is unaffected":"; speed reduced"}`);
  }
  const src=sourceSpeedAdjustments(character); walk+=src.add; notes.push(...src.notes);
  const callbackSpeed=behaviorSpeedBonus(character); walk+=Number(callbackSpeed.bonus||0); notes.push(...(callbackSpeed.notes||[]));
  walk+=Number(character.combat?.speedMisc||0);
  const active=new Set(character.combat?.conditions||[]); if(["grappled","restrained","paralyzed","petrified","stunned","unconscious"].some(x=>active.has(x))){ walk=0; notes.push("Active condition reduces movement to 0"); }
  const modes={walk};
  for(const [mode,v] of Object.entries(src.modes)){
    const raw=v?.spd ?? v; if(typeof raw==="number") modes[mode]=raw; else if(String(raw).toLowerCase()==="walk") modes[mode]=walk; else { const m=String(raw).match(/(?:fixed\s*)?(\d+)/i); if(m) modes[mode]=Number(m[1]); }
  }
  return {walk:Math.max(0,walk),modes,notes};
}

export function initiativeSummary(character){
  let bonus=abilityMod(character.abilities?.dex)+Number(character.combat?.initiativeMisc||0); const notes=[];
  // Alert is stable 2014 rules and appears in imported content under various source keys.
  if(selectedFeatIds(character).some(id=>/\balert\b/i.test(String(registries.FeatsList[id]?.name||id)))){ bonus+=5; notes.push("Alert +5"); }
  const bard=(character.classes||[]).find(x=>norm(x.name)==="bard" && Number(x.level)>=2);
  const champion=(character.classes||[]).find(x=>norm(x.name)==="fighter" && x.subclass==="fighter-champion" && Number(x.level)>=7);
  if(bard||champion){ const half=Math.floor(proficiencyBonus(character)/2); bonus+=half; notes.push(`${bard?"Jack of All Trades":"Remarkable Athlete"} +${half}`); }
  for(const src of activeSourceData(character)){
    const txt=String(src.data?.descriptionFull||src.data?.description||"");
    const m=txt.match(/(?:gain|have|add)\s+(?:a\s+)?\+?(\d+)\s+(?:bonus\s+)?to\s+initiative/i); if(m){ const n=Number(m[1]); bonus+=n; notes.push(`${src.label} +${n}`); }
  }
  return {bonus,notes};
}

export function sensesAndResistances(character){
  const senses=[],resistances=[];
  for(const src of activeSourceData(character)){
    for(const v of asArray(src.data?.vision)){
      if(Array.isArray(v)){ const [name,range]=v; senses.push({name:String(name),range,source:src.label}); }
      else if(v) senses.push({name:String(v),range:"",source:src.label});
    }
    for(const v of asArray(src.data?.dmgres)){
      if(Array.isArray(v)) resistances.push({name:String(v[1]||v[0]),source:src.label});
      else if(v) resistances.push({name:String(v),source:src.label});
    }
  }
  const key=x=>`${norm(x.name)}|${norm(x.source)}`;
  return {senses:[...new Map(senses.map(x=>[key(x),x])).values()],resistances:[...new Map(resistances.map(x=>[key(x),x])).values()]};
}

export function armorStatus(character){
  const a=registries.ArmourList[character.armor?.selected]||{}; const type=norm(character.armor?.typeOverride||a.type); const prof=character.armorProficiencies||{};
  let proficient=true; if(type==="light") proficient=!!prof.light; else if(type==="medium") proficient=!!prof.medium; else if(type==="heavy") proficient=!!prof.heavy;
  const shieldOk=!character.armor?.shield||!!prof.shield;
  const stealthDisadvantage=!!a.stealthdis && !(type==="medium" && hasNamedFeat(character,"Medium Armor Master"));
  return {proficient,shieldProficient:shieldOk,type,strReq:Number(a.strReq||0),stealthDisadvantage};
}

export function calculatedCombatArmorClass(character, baseAc){
  const extras=extraAcRows(character); return {ac:Number(baseAc||10)+extras.reduce((s,x)=>s+x.mod,0),extras};
}

export function combatProfile(character, baseAc){
  const speed=derivedSpeed(character), initiative=initiativeSummary(character), sr=sensesAndResistances(character), armor=armorStatus(character), ac=calculatedCombatArmorClass(character,baseAc);
  return {initiative,speed,senses:sr.senses,resistances:sr.resistances,armor,ac,conditions:STANDARD_CONDITIONS.filter(x=>(character.combat?.conditions||[]).includes(x[0]))};
}

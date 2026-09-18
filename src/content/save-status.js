import { registries } from "./registry.js";

const ABILITY_MAP={str:"str",strength:"str",dex:"dex",dexterity:"dex",con:"con",constitution:"con",int:"int",intelligence:"int",wis:"wis",wisdom:"wis",cha:"cha",charisma:"cha"};
const norm=v=>String(v??"").trim().toLowerCase();
function abilityKey(v){ const n=norm(v); return ABILITY_MAP[n]||ABILITY_MAP[n.slice(0,3)]||n.slice(0,3); }
function activeFeatureObjects(character){
  const out=[];
  const race=registries.RaceList[norm(character.race)]; if(race) out.push({label:race.name||character.race,data:race});
  const rv=character.raceVariant?registries.RaceSubList[character.raceVariant]:null; if(rv) out.push({label:rv.name||character.raceVariant,data:rv});
  for(const row of character.classes||[]){
    const cls=registries.ClassList[norm(row.name)]||{};
    out.push({label:cls.name||row.name,data:cls});
    for(const f of Object.values(cls.features||{})) if(f&&typeof f==="object"&&Number(f.minlevel||1)<=Number(row.level||0)) out.push({label:f.name||cls.name||row.name,data:f});
    if(row.subclass){ const sub=registries.ClassSubList[row.subclass]||{}; out.push({label:sub.subname||sub.fullname||row.subclass,data:sub}); for(const f of Object.values(sub.features||{})) if(f&&typeof f==="object"&&Number(f.minlevel||1)<=Number(row.level||0)) out.push({label:f.name||sub.subname||row.subclass,data:f}); }
  }
  for(const entry of character.magicItems||[]){ const id=typeof entry==="string"?entry:entry?.id; const m=registries.MagicItemsList[id]; if(!m)continue; if(m.attunement && !(typeof entry==="object"&&entry.attuned)) continue; out.push({label:m.name||id,data:m}); }
  return out;
}
export function derivedSaveProficiencies(character){
  const set=new Set(); const first=character.classes?.[0]; const cls=registries.ClassList[norm(first?.name)];
  for(const s of cls?.saves||[]) set.add(abilityKey(s));
  for(const src of activeFeatureObjects(character)) for(const s of src.data?.saves||[]) set.add(abilityKey(s));
  const overrides=character.saveProficiencyOverrides||{}; for(const [a,v] of Object.entries(overrides)){ if(v===true)set.add(a); if(v===false)set.delete(a); }
  return [...set].filter(Boolean);
}
export function reconcileSaveProficiencies(character){ character.saveProficiencies=derivedSaveProficiencies(character); return character.saveProficiencies; }
export function setSaveProficiencyOverride(character,ability,value){ character.saveProficiencyOverrides??={}; character.saveProficiencyOverrides[ability]=!!value; reconcileSaveProficiencies(character); }
export function clearSaveProficiencyOverride(character,ability){ if(character.saveProficiencyOverrides) delete character.saveProficiencyOverrides[ability]; reconcileSaveProficiencies(character); }
export function saveAdvantageInfo(character, ability){
  const rows=[];
  for(const src of activeFeatureObjects(character)){
    const d=src.data||{};
    const adv=(d.savetxt?.adv_vs||[]); if(Array.isArray(adv)&&adv.length) rows.push({source:src.label,condition:adv.join(", "),kind:"advantage",conditional:true});
    const txt=String(d.description||d.descriptionFull||"");
    const long=ability==="dex"?"dexterity":ability==="str"?"strength":ability==="con"?"constitution":ability==="int"?"intelligence":ability==="wis"?"wisdom":"charisma";
    const re=new RegExp(`adv(?:antage|\\.)?[^\\n.;]{0,40}(?:${long}|${ability})[^\\n.;]{0,80}(?:sav(?:e|ing throw)s?)`,"i");
    const re2=new RegExp(`(?:${long}|${ability})[^\\n.;]{0,40}(?:sav(?:e|ing throw)s?)[^\\n.;]{0,80}adv(?:antage|\\.)?`,"i");
    if((re.test(txt)||re2.test(txt))&&!rows.some(x=>x.source===src.label&&x.condition===txt)) rows.push({source:src.label,condition:txt.split(/\n/).find(x=>/adv/i.test(x)&&/sav/i.test(x))||"conditional saving throws",kind:"advantage",conditional:/(?:against|vs\.?|while|when|if|charm|fright|poison|spell|magic)/i.test(txt)});
  }
  const manual=character.saveAdvantageNotes?.[ability]; if(manual) rows.push({source:"Manual",condition:manual,kind:"advantage",conditional:true});
  return rows;
}

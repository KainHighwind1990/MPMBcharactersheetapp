import { registries } from './registry.js';
const norm=v=>String(v??'').trim().toLowerCase();
export function raceVariantsFor(raceKey){
  const key=norm(raceKey);
  return Object.entries(registries.RaceSubList)
    .filter(([id,d])=>norm(d?.baseRace)===key || (!d?.baseRace && id.startsWith(`${key}-`)))
    .map(([id,data])=>{ const raw=data?.mpmbKey||id.slice(key.length+1); const pretty=String(raw).replace(/\b\w/g,m=>m.toUpperCase()); const label=data?.name || (key==='human' && norm(raw)==='variant' ? 'Variant Human' : pretty); return {id,data,label}; })
    .sort((a,b)=>a.label.localeCompare(b.label));
}
export function resolvedRaceParts(character){
  const base=registries.RaceList[norm(character.race)];
  const variant=character.raceVariant ? registries.RaceSubList[character.raceVariant] : null;
  return {base,variant};
}

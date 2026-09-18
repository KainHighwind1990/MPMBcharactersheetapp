import { registries } from './registry.js';
const norm=v=>String(v??'').trim().toLowerCase();
function store(character){ character.contentSelections ||= {}; character.contentSelections.expertiseChoices ||= {}; return character.contentSelections.expertiseChoices; }
function valueAtLevel(v, level){ if(!Array.isArray(v)) return Number(v)||0; return Number(v.length>=21 ? v[level] : v[level-1])||0; }
export function expertiseSources(character){
  const out=[];
  (character.classes||[]).forEach((row,index)=>{
    const cls=registries.ClassList[norm(row.name)];
    for(const [key,f] of Object.entries(cls?.features||{})){
      if(!f || typeof f!=='object' || Number(f.minlevel||99)>Number(row.level||0)) continue;
      const looks=/expertise/i.test(`${f.name||''} ${f.skillstxt||''} ${key}`);
      const count=valueAtLevel(f.extraTimes,row.level);
      if(!looks || !count) continue;
      const choices=(f.extrachoices||[]).filter(x=>norm(x)!=="thieves' tools" && norm(x)!=='thieves tools');
      out.push({id:`expertise:${index}:${norm(row.name)}:${key}`,label:`${cls?.name||row.name}: ${f.name||'Expertise'}`,count,choices,raw:f.skillstxt||f.description||''});
    }
  });
  return out;
}
export function reconcileExpertise(character){
  // Start from the proficiency layer; this function upgrades selected skills to rank 2.
  const s=store(character); const sources=expertiseSources(character); const valid=new Set(sources.map(x=>x.id));
  for(const k of Object.keys(s)) if(!valid.has(k)) delete s[k];
  const already=new Set();
  for(const src of sources){
    const proficient=Object.entries(character.skillProficiencies||{}).filter(([,r])=>Number(r)>=1).map(([k])=>k);
    const allowed=src.choices.length ? proficient.filter(x=>src.choices.some(c=>norm(c)===norm(x))) : proficient;
    const clean=[];
    for(const x of Array.isArray(s[src.id])?s[src.id]:[]){ if(allowed.includes(x)&&!clean.includes(x)&&!already.has(x)){clean.push(x);already.add(x);} if(clean.length>=src.count)break; }
    s[src.id]=clean;
    for(const x of clean) character.skillProficiencies[x]=2;
  }
  return sources.map(src=>({...src,selected:s[src.id]||[],missing:Math.max(0,src.count-(s[src.id]?.length||0))}));
}
export function setExpertiseChoice(character,id,slot,value){ const s=store(character); const a=[...(s[id]||[])]; a[slot]=value; s[id]=a.filter(Boolean); return reconcileExpertise(character); }
export function availableExpertise(character,src,slot){
  const selected=new Set(src.selected||[]); const current=src.selected?.[slot]; if(current)selected.delete(current);
  return Object.entries(character.skillProficiencies||{}).filter(([,rank])=>Number(rank)>=1).map(([skill])=>skill).filter(skill=>!selected.has(skill) && (!src.choices.length||src.choices.some(c=>norm(c)===norm(skill)))).sort();
}

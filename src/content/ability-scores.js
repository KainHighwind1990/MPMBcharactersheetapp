import { registries } from './registry.js';
import { racialAbilityStatus, improvementSources, selectedFeatIds } from './choice-framework.js';

export const ABILITY_KEYS = ['str','dex','con','int','wis','cha'];
export const ABILITY_NAMES = ['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'];
const norm=v=>String(v??'').trim().toLowerCase();
const title=v=>String(v??'').replace(/\b\w/g,m=>m.toUpperCase());
const abilityFromName=name=>{
  const n=norm(name);
  const i=ABILITY_NAMES.findIndex(x=>norm(x)===n || norm(x).startsWith(n) || n.startsWith(norm(x)));
  return i>=0?ABILITY_KEYS[i]:'';
};

function ensure(character){
  character.contentSelections ||= {};
  character.contentSelections.featAbilityChoices ||= {};
  character.baseAbilities ||= { ...(character.abilities||{}) };
  for(const k of ABILITY_KEYS) if(!Number.isFinite(Number(character.baseAbilities[k]))) character.baseAbilities[k]=10;
  character.abilities ||= { ...character.baseAbilities };
  return character;
}

function scoreArray(data,key='scores'){
  const raw=data?.[key];
  if(!Array.isArray(raw)) return [0,0,0,0,0,0];
  return ABILITY_KEYS.map((_,i)=>Number(raw[i])||0);
}

function featChoiceData(character,id,feat){
  const chosen=character.contentSelections?.featureChoices?.[`feat:${id}:feat`];
  if(!chosen) return null;
  const wanted=norm(chosen);
  for(const [k,v] of Object.entries(feat||{})) if(norm(k)===wanted && v && typeof v==='object') return v;
  return null;
}

function scoreTextChoice(feat){
  const text=String(feat?.scorestxt||'').trim();
  if(!text || !/\bor\b/i.test(text)) return null;
  const amount=Number(text.match(/\+(\d+)/)?.[1]||0);
  if(!amount) return null;
  const options=[];
  for(const name of ABILITY_NAMES) if(new RegExp(`\\b${name}\\b`,'i').test(text)) options.push(abilityFromName(name));
  if(options.length<2) return null;
  return {amount,count:1,options:[...new Set(options)],text};
}

export function featAbilityChoiceSources(character){
  ensure(character);
  const store=character.contentSelections.featAbilityChoices;
  const rows=[], valid=new Set();
  for(const id of selectedFeatIds(character)){
    const feat=registries.FeatsList[id]; if(!feat) continue;
    // Feats such as Resilient already expose a normal MPMB feature choice whose
    // selected sub-object contains its score increase. Do not create a second selector.
    if(featChoiceData(character,id,feat)?.scores) continue;
    if(scoreArray(feat).some(Boolean)) continue;
    const parsed=scoreTextChoice(feat); if(!parsed) continue;
    const sourceId=`featability:${id}`; valid.add(sourceId);
    if(store[sourceId] && !parsed.options.includes(store[sourceId])) delete store[sourceId];
    rows.push({id:sourceId,featId:id,label:`${feat.name||title(id)} ability increase`,...parsed,selected:store[sourceId]||''});
  }
  for(const id of Object.keys(store)) if(!valid.has(id)) delete store[id];
  return rows;
}

export function setFeatAbilityChoice(character,id,value){
  ensure(character);
  character.contentSelections.featAbilityChoices[id]=value;
  return featAbilityChoiceSources(character);
}

function numericMagicMod(value){
  if(typeof value==='number' && Number.isFinite(value)) return value;
  const text=String(value??'').trim();
  return /^[+-]?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}

function enhancementCandidates(data){
  const out=[];
  for(const row of Array.isArray(data?.extraAC)?data.extraAC:[]){
    const n=numericMagicMod(row?.mod);
    if(Number.isInteger(n) && n>0 && n<=3) out.push(n);
  }
  for(const row of Array.isArray(data?.addMod)?data.addMod:[]){
    const n=numericMagicMod(row?.mod);
    if(Number.isInteger(n) && n>0 && n<=3) out.push(n);
  }
  return out;
}

export function magicItemEnhancementProfile(entry){
  const id=typeof entry==='string'?entry:entry?.id;
  const base=registries.MagicItemsList[id]||{};
  const selected=typeof entry==='object'?String(entry.choice||''):'';
  const wanted=norm(selected);
  let choice=null;
  if(wanted) for(const [k,v] of Object.entries(base)) if(norm(k)===wanted && v && typeof v==='object' && !Array.isArray(v)){choice=v;break;}
  const raw=choice?{...base,...choice}:base;
  const candidates=enhancementCandidates(raw);
  if(!candidates.length) return {supported:false,baseBonus:0,selectedBonus:0};
  const counts=new Map();
  for(const n of candidates) counts.set(n,(counts.get(n)||0)+1);
  const baseBonus=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0];
  const chosen=typeof entry==='object'?Number(entry.enhancement)||0:0;
  return {supported:true,baseBonus,selectedBonus:[1,2,3].includes(chosen)?chosen:0};
}

function applyMagicEnhancement(data, baseBonus, selectedBonus){
  if(!selectedBonus || !baseBonus || selectedBonus===baseBonus) return data;
  const replaceRows=(rows=[])=>rows.map(row=>{
    if(!row||typeof row!=='object') return row;
    const n=numericMagicMod(row.mod);
    return n===baseBonus ? {...row,mod:selectedBonus} : row;
  });
  return {
    ...data,
    extraAC:Array.isArray(data.extraAC)?replaceRows(data.extraAC):data.extraAC,
    addMod:Array.isArray(data.addMod)?replaceRows(data.addMod):data.addMod,
  };
}

export function resolveMagicItemData(entry){
  const id=typeof entry==='string'?entry:entry?.id;
  const base=registries.MagicItemsList[id]||{};
  const selected=typeof entry==='object'?String(entry.choice||''):'';
  const wanted=norm(selected);
  let choice=null;
  if(wanted) for(const [k,v] of Object.entries(base)) if(norm(k)===wanted && v && typeof v==='object' && !Array.isArray(v)){choice=v;break;}
  const raw=choice?{...base,...choice}:base;
  const enhancement=magicItemEnhancementProfile(entry);
  const data=enhancement.supported ? applyMagicEnhancement(raw,enhancement.baseBonus,enhancement.selectedBonus) : raw;
  return {id,base,choice,data,selected,enhancement};
}

function itemActive(entry,resolved){
  const needs=!!(resolved.base?.attunement||resolved.base?.attunementRequired||resolved.choice?.attunement||resolved.choice?.attunementRequired);
  return !needs || (typeof entry==='object' && !!entry.attuned);
}

function addArray(acc,data,label,kind='add'){
  const arr=scoreArray(data,kind==='override'?'scoresOverride':kind==='maximum'?'scoresMaximum':'scores');
  arr.forEach((v,i)=>{if(v)acc.push({ability:ABILITY_KEYS[i],value:v,label,kind});});
}

function maximumEntries(data,label){
  const raw=data?.scoresMaximum; if(!Array.isArray(raw)) return [];
  const out=[];
  raw.slice(0,6).forEach((v,i)=>{
    if(v===undefined||v===null||v===0||v==='')return;
    if(typeof v==='string'&&/^\+\d+$/.test(v.trim())) out.push({ability:ABILITY_KEYS[i],increase:Number(v),label,kind:'max'});
    else if(Number.isFinite(Number(v))) out.push({ability:ABILITY_KEYS[i],set:Number(v),label,kind:'max'});
  });
  return out;
}

export function abilityScoreBreakdown(character){
  ensure(character);
  const adds=[], overrides=[], maxima=[];
  const racial=racialAbilityStatus(character);
  const raceLabel=racial.data?.name||racial.data?.sortname||'Race';
  for(const [k,v] of Object.entries(racial.rule?.fixed||{})) if(Number(v)) adds.push({ability:k,value:Number(v),label:raceLabel,kind:'add'});
  for(const row of racial.groups||[]){
    row.selected.forEach(k=>{if(k) adds.push({ability:k,value:Number(row.group.amount)||0,label:raceLabel,kind:'add'});});
  }

  for(const imp of improvementSources(character)){
    const v=imp.value||{};
    if(v.mode==='+2'&&v.ability1) adds.push({ability:v.ability1,value:2,label:imp.label,kind:'add'});
    if(v.mode==='+1/+1'){
      if(v.ability1) adds.push({ability:v.ability1,value:1,label:imp.label,kind:'add'});
      if(v.ability2&&v.ability2!==v.ability1) adds.push({ability:v.ability2,value:1,label:imp.label,kind:'add'});
    }
  }

  const featAbilityRows=featAbilityChoiceSources(character);
  const featAbilityByFeat=new Map(featAbilityRows.map(x=>[x.featId,x]));
  for(const id of selectedFeatIds(character)){
    const feat=registries.FeatsList[id]; if(!feat)continue;
    const label=feat.name||title(id);
    const choice=featChoiceData(character,id,feat);
    const chosenScores=choice?.scores ? scoreArray(choice) : scoreArray(feat);
    chosenScores.forEach((v,i)=>{if(v)adds.push({ability:ABILITY_KEYS[i],value:v,label,kind:'add'});});
    if(!chosenScores.some(Boolean)){
      const row=featAbilityByFeat.get(id); if(row?.selected) adds.push({ability:row.selected,value:row.amount,label,kind:'add'});
    }
  }

  for(const entry of character.magicItems||[]){
    const r=resolveMagicItemData(entry); if(!r.id||!itemActive(entry,r))continue;
    const label=r.data?.name||r.base?.name||title(r.id);
    addArray(adds,r.data,label,'add');
    addArray(overrides,r.data,label,'override');
    maxima.push(...maximumEntries(r.data,label));
  }

  const result={}, details={};
  for(const k of ABILITY_KEYS){
    const base=Number(character.baseAbilities[k])||0;
    let maximum=Math.max(20,base);
    for(const m of maxima.filter(x=>x.ability===k)){
      if(Number.isFinite(m.set)) maximum=Math.max(maximum,m.set);
      if(Number.isFinite(m.increase)) maximum+=m.increase;
    }
    const related=adds.filter(x=>x.ability===k);
    let value=base+related.reduce((n,x)=>n+Number(x.value||0),0);
    if(value>maximum) value=Math.max(base,maximum);
    for(const o of overrides.filter(x=>x.ability===k)) if(Number(o.value)>value) value=Number(o.value);
    result[k]=value;
    details[k]={base,value,maximum,adds:related,overrides:overrides.filter(x=>x.ability===k),maxima:maxima.filter(x=>x.ability===k)};
  }
  return {scores:result,details,featAbilityChoices:featAbilityRows};
}

export function reconcileAbilityScores(character){
  const state=abilityScoreBreakdown(character);
  character.abilities={...state.scores};
  return state;
}

import { registries } from './registry.js';
import { resolvedRaceParts } from './race-variants.js';
import { resolvedBackgroundData } from './background-variants.js';
import { totalLevel } from '../rules.js';

export const ABILITY_KEYS=['str','dex','con','int','wis','cha'];
export const ABILITY_LABELS={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
const ABILITY_INDEX={strength:'str',str:'str',dexterity:'dex',dex:'dex',constitution:'con',con:'con',intelligence:'int',int:'int',wisdom:'wis',wis:'wis',charisma:'cha',cha:'cha'};
const norm=v=>String(v??'').trim().toLowerCase();
const title=v=>String(v??'').replace(/\b\w/g,m=>m.toUpperCase());
const unique=a=>[...new Set((a||[]).filter(Boolean))];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);

function selections(character){
  character.contentSelections ||= {};
  character.contentSelections.generalProficiencyChoices ||= {};
  character.contentSelections.racialAbilityChoices ||= [];
  character.contentSelections.featureChoices ||= {};
  character.contentSelections.optionalFeatureChoices ||= {};
  character.contentSelections.extraFeatureChoices ||= {};
  character.contentSelections.improvementChoices ||= {};
  character.contentSelections.bonusFeatChoices ||= {};
  character.contentSelections.featAbilityChoices ||= {};
  return character.contentSelections;
}

function modeValue(data,key,mode){
  const raw=data?.[key];
  if(raw && typeof raw==='object' && !Array.isArray(raw)) return raw[mode] ?? null;
  return raw;
}

function effectiveRaceParts(character){
  const {base,variant}=resolvedRaceParts(character);
  return [base,variant].filter(Boolean);
}

function sourceRows(character){
  const rows=[];
  const raceParts=effectiveRaceParts(character);
  if(raceParts[0]) rows.push({id:`race:${norm(character.race)}`,kind:'race',label:`Race: ${raceParts[0].name||title(character.race)}`,data:raceParts[0]});
  if(raceParts[1]) rows.push({id:`racevariant:${character.raceVariant}`,kind:'race variant',label:`Race Variant: ${raceParts[1].name||raceParts[1].mpmbKey||title(character.raceVariant)}`,data:raceParts[1]});
  const bg=resolvedBackgroundData(character);
  if(bg.effective) rows.push({id:`background:${bg.variantKey||bg.baseKey}`,kind:bg.variant?'background variant':'background',label:`Background: ${bg.effective.name||title(bg.variantKey||bg.baseKey)}`,data:bg.effective});
  (character.classes||[]).forEach((row,index)=>{
    const key=norm(row.name), cls=registries.ClassList[key]; if(!cls)return;
    const mode=index===0?'primary':'secondary';
    rows.push({id:`class:${key}:${mode}`,legacyId:`class:${index}:${key}:${mode}`,kind:index===0?'starting class':'multiclass',label:`${index===0?'Starting class':'Multiclass'}: ${cls.name||title(key)}`,data:cls,mode});
    const optionalStore=character.contentSelections?.optionalFeatureChoices||{};
    for(const [featureKey,feature] of Object.entries(cls.features||{})){
      const id=`optional:class:${key}:${featureKey}`, legacyId=`optional:class:${index}:${key}:${featureKey}`;
      if(!optionalStore[id]&&optionalStore[legacyId]) optionalStore[id]=optionalStore[legacyId];
      if(legacyId!==id) delete optionalStore[legacyId];
      for(const selected of optionalStore[id]||[]){
        const defs=Array.isArray(feature?.__mpmbOptionalFeatureChoices)?feature.__mpmbOptionalFeatureChoices:[];
        const def=defs.find(x=>norm(x?.name)===norm(selected));
        if(def?.data) rows.push({id:`${id}:${norm(selected)}`,kind:'optional class feature',label:`${cls.name||title(key)}: ${def.data.name||selected}`,data:def.data,mode});
      }
    }
  });
  return rows;
}

function allToolOptions(){
  return Object.entries(registries.ToolsList||{}).map(([id,d])=>({id,label:d?.name||d?.infoname||title(id)})).sort((a,b)=>a.label.localeCompare(b.label));
}
function toolCategoryOptions(label){
  const q=norm(label); const all=allToolOptions();
  if(/artisan/.test(q)) return all.filter(x=>/(supplies|tools|utensils)$/i.test(x.label) && !/(navigator|thieves)/i.test(x.label));
  if(/gaming/.test(q)) return all.filter(x=>/(dice|dragonchess|playing card|three-dragon ante)/i.test(x.label));
  if(/musical|instrument/.test(q)) return all.filter(x=>/(bagpipes|drum|dulcimer|flute|horn|lute|lyre|pan flute|shawm|viol)$/i.test(x.label));
  const wanted=[];
  const keywordMap=[['smith',/smith/i],['brewer',/brewer/i],['mason',/mason/i],['thieves',/thieves/i],['navigator',/navigator/i],['herbalism',/herbalism/i],['disguise',/disguise/i],['forgery',/forgery/i],['poison',/poison/i],['alchemist',/alchemist/i],['tinker',/tinker/i]];
  for(const [word,re] of keywordMap) if(q.includes(word)) wanted.push(...all.filter(x=>re.test(x.label)));
  if(/gaming set,? instrument,? or thieves/.test(q)) wanted.push(...all.filter(x=>/(dice|dragonchess|playing card|three-dragon ante|bagpipes|drum|dulcimer|flute|horn|lute|lyre|pan flute|shawm|viol|thieves)/i.test(x.label)));
  return unique(wanted.map(x=>x.id)).map(id=>all.find(x=>x.id===id)).filter(Boolean);
}

const STANDARD_LANGUAGE_OPTIONS=['Common','Dwarvish','Elvish','Giant','Gnomish','Goblin','Halfling','Orc','Abyssal','Celestial','Draconic','Deep Speech','Infernal','Primordial','Sylvan','Undercommon','Aarakocra','Aquan','Auran','Gith','Grung','Leonin','Loxodon','Minotaur','Netherese','Quori','Vedalken'];
function looksLikeSingleLanguage(value){
  const text=String(value??'').trim();
  if(!text || text.length>32 || !/^[A-Za-z][A-Za-z '\-]+$/.test(text)) return false;
  if(/\b(choose|other|any|recommended|telepathy|speech|emissary|friend)\b/i.test(text)) return false;
  if(/\bor\b|,|\(|\)/i.test(text)) return false;
  return true;
}
function collectLanguagesFromValue(value,out){
  if(typeof value==='string') { if(looksLikeSingleLanguage(value)) out.add(value.trim()); return; }
  if(Array.isArray(value)) for(const x of value) collectLanguagesFromValue(x,out);
}
export function languageOptions(){
  const out=new Set(STANDARD_LANGUAGE_OPTIONS);
  for(const reg of [registries.RaceList,registries.RaceSubList,registries.BackgroundList,registries.ClassList]) for(const d of Object.values(reg||{})) collectLanguagesFromValue(d?.languageProfs,out);
  return [...out].sort((a,b)=>a.localeCompare(b));
}

function parseLanguageProfs(raw){
  const fixed=[],choices=[];
  if(!Array.isArray(raw)) return {fixed,choices};
  for(const x of raw){
    if(typeof x==='string' && x.trim()) fixed.push(x.trim());
    else if(Number.isFinite(Number(x)) && Number(x)>0) choices.push({count:Number(x),label:'Choose language',options:languageOptions().map(v=>({id:v,label:v}))});
    else if(Array.isArray(x)) {
      const names=x.filter(v=>typeof v==='string'); const count=x.find(v=>Number.isFinite(Number(v))&&Number(v)>0);
      if(names.length && count) choices.push({count:Number(count),label:names.join(' or '),options:names.map(v=>({id:v,label:v}))});
      else fixed.push(...names);
    }
  }
  return {fixed:unique(fixed),choices};
}

function parseToolProfs(raw){
  const fixed=[],choices=[];
  if(!raw) return {fixed,choices};
  const list=Array.isArray(raw)?raw:[raw];
  for(const x of list){
    if(typeof x==='string' && x.trim()) fixed.push(x.trim());
    else if(Array.isArray(x) && x.length){
      const label=String(x[0]??'').trim(); const second=x[1];
      if(Number.isFinite(Number(second)) && Number(second)>0){
        const opts=toolCategoryOptions(label);
        choices.push({count:Number(second),label:label||'Choose tool',options:opts.length?opts:[{id:label,label}]});
      } else if(label) fixed.push(label);
    }
  }
  return {fixed:unique(fixed),choices};
}

function profSource(source,type){
  const raw=modeValue(source.data,type==='language'?'languageProfs':'toolProfs',source.mode||'primary');
  const parsed=type==='language'?parseLanguageProfs(raw):parseToolProfs(raw);
  return parsed.fixed.length||parsed.choices.length?{...source,type,...parsed}:null;
}

export function generalProficiencySources(character){
  const out=[];
  for(const source of sourceRows(character)) for(const type of ['language','tool']) { const p=profSource(source,type); if(p) out.push(p); }
  return out;
}

function normalizedChoiceArray(current,choice,used){
  const options=new Set(choice.options.map(x=>x.id)); const clean=[];
  for(const x of Array.isArray(current)?current:[]) if(options.has(x)&&!clean.includes(x)&&!used.has(norm(x))){ clean.push(x); used.add(norm(x)); if(clean.length>=choice.count)break; }
  return clean;
}

export function reconcileGeneralProficiencies(character){
  const s=selections(character), store=s.generalProficiencyChoices, sources=generalProficiencySources(character);
  const valid=new Set(); const langs=[],tools=[]; const usedLang=new Set(),usedTool=new Set();
  for(const source of sources){
    const used=source.type==='language'?usedLang:usedTool; const target=source.type==='language'?langs:tools;
    for(const fixed of source.fixed){if(!used.has(norm(fixed))){used.add(norm(fixed));target.push(fixed);}}
    source.choices.forEach((choice,index)=>{
      const id=`${source.id}:${source.type}:${index}`; valid.add(id);
      const legacyId=source.legacyId?`${source.legacyId}:${source.type}:${index}`:'';
      if(!store[id] && legacyId && store[legacyId]) store[id]=store[legacyId];
      if(legacyId && legacyId!==id) delete store[legacyId];
      const clean=normalizedChoiceArray(store[id],choice,used); store[id]=clean;
      target.push(...clean);
    });
  }
  for(const id of Object.keys(store)) if(!valid.has(id)) delete store[id];
  character.languages=unique(langs); character.toolProficiencies=unique(tools);
  const weapon=weaponProficiencyProfile(character), armor=armorProficiencyProfile(character);
  character.weaponProficiencies=weapon; character.armorProficiencies=armor;
  return {sources,store,languages:character.languages,tools:character.toolProficiencies,weapon,armor};
}

export function setGeneralProficiencyChoice(character,id,slot,value){
  const store=selections(character).generalProficiencyChoices; const a=[...(store[id]||[])]; a[slot]=value; store[id]=a.filter(Boolean); return reconcileGeneralProficiencies(character);
}

export function generalProficiencyStatus(character){
  const state=reconcileGeneralProficiencies(character); const rows=[];
  for(const source of state.sources) source.choices.forEach((choice,index)=>{
    const id=`${source.id}:${source.type}:${index}`, selected=state.store[id]||[];
    rows.push({id,sourceId:source.id,type:source.type,label:source.label,kind:source.kind,fixed:source.fixed,choice,index,selected,missing:Math.max(0,choice.count-selected.length)});
  });
  return {state,rows};
}

function profArrays(character,key){
  const out=[];
  for(const source of sourceRows(character)) {
    const v=modeValue(source.data,key,source.mode||'primary'); if(Array.isArray(v)) out.push(v);
  }
  return out;
}
export function armorProficiencyProfile(character){
  const flags=[false,false,false,false];
  for(const p of profArrays(character,'armorProfs')) for(let i=0;i<4;i++) if(p[i]===true) flags[i]=true;
  return {light:flags[0],medium:flags[1],heavy:flags[2],shield:flags[3]};
}
export function weaponProficiencyProfile(character){
  let simple=false,martial=false; const names=new Set();
  for(const p of profArrays(character,'weaponProfs')) { if(p[0]===true)simple=true; if(p[1]===true)martial=true; if(Array.isArray(p[2])) for(const n of p[2]) names.add(norm(n)); }
  return {simple,martial,names:[...names]};
}

function abilityKey(word){return ABILITY_INDEX[norm(word)]||null;}
function fixedAbilityBonuses(data){
  const out=Object.fromEntries(ABILITY_KEYS.map(k=>[k,0])); const a=Array.isArray(data?.scores)?data.scores:[];
  ABILITY_KEYS.forEach((k,i)=>out[k]=Number(a[i]||0)); return out;
}
function racialAbilitySource(character){
  const {base,variant}=resolvedRaceParts(character); if(!base)return null;
  return variant && (own(variant,'scores')||own(variant,'scorestxt')) ? variant : base;
}
function parseRacialAbilityRule(data, genericMode='+2/+1'){
  if(!data)return {fixed:fixedAbilityBonuses(data),groups:[],text:'',generic:false};
  const fixed=fixedAbilityBonuses(data), text=String(data.scorestxt||''); const groups=[];
  const generic=!!data.scoresGeneric;
  if(generic){
    if(genericMode==='+1/+1/+1') groups.push({amount:1,count:3,options:ABILITY_KEYS.slice(),unique:true});
    else { groups.push({amount:2,count:1,options:ABILITY_KEYS.slice(),unique:true}); groups.push({amount:1,count:1,options:ABILITY_KEYS.slice(),unique:true,excludeAcrossGroups:true}); }
    return {fixed,groups,text:text||'Choose either +2 to one ability and +1 to another, or +1 to three different abilities.',generic:true,genericMode};
  }
  // If a textual choice is present, the numeric scores remain the fixed portion only.
  let m=text.match(/\+(\d+)\s+to\s+(two|three|four|five|six|\d+)\s+(?:different\s+)?ability scores? of my choice/i);
  if(m){ const words={two:2,three:3,four:4,five:5,six:6}; groups.push({amount:Number(m[1]),count:Number(m[2])||words[norm(m[2])]||1,options:ABILITY_KEYS.slice(),unique:true}); }
  m=text.match(/\+(\d+)\s+to\s+two\s+other ability scores?/i);
  if(m){ const excluded=ABILITY_KEYS.filter(k=>fixed[k]>0); groups.push({amount:Number(m[1]),count:2,options:ABILITY_KEYS.filter(k=>!excluded.includes(k)),unique:true}); }
  if(!groups.length){
    const or=text.match(/\+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:\s+or\s+)(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i);
    if(or) groups.push({amount:Number(or[1]),count:1,options:[abilityKey(or[2]),abilityKey(or[3])].filter(Boolean),unique:true});
  }
  return {fixed,groups,text,generic:false};
}
export function racialAbilityStatus(character){
  const data=racialAbilitySource(character); const s=selections(character);
  if(data?.scoresGeneric && !['+2/+1','+1/+1/+1'].includes(s.racialAbilityMode)) s.racialAbilityMode='+2/+1';
  const rule=parseRacialAbilityRule(data,s.racialAbilityMode); const selected=[]; let offset=0;
  const flat=[];
  const usedAcross=new Set();
  for(const group of rule.groups){
    const used=new Set(); const arr=[];
    for(let i=0;i<group.count;i++){ const v=s.racialAbilityChoices[offset+i]; if(group.options.includes(v)&&!used.has(v)&&!(rule.generic&&usedAcross.has(v))){arr.push(v);used.add(v);usedAcross.add(v);} else arr.push(''); }
    flat.push({group,selected:arr,offset}); selected.push(...arr); offset+=group.count;
  }
  s.racialAbilityChoices=selected;
  return {data,rule,groups:flat,missing:selected.filter(x=>!x).length};
}
export function setRacialAbilityChoice(character,slot,value){ const s=selections(character); s.racialAbilityChoices[slot]=value; return racialAbilityStatus(character); }
export function setRacialAbilityMode(character,mode){ const s=selections(character); s.racialAbilityMode=mode==='+1/+1/+1'?'+1/+1/+1':'+2/+1'; s.racialAbilityChoices=[]; return racialAbilityStatus(character); }
export function clearRacialAbilityState(character){ const s=selections(character); s.racialAbilityChoices=[]; delete s.racialAbilityMode; delete s.racialAbilityOverrides; }

function featureRows(character){
  const rows=[]; const selectionState=selections(character);
  const add=(origin,originId,features,level,legacyOriginId='')=>{for(const [key,f] of Object.entries(features||{})){
    if(!f||typeof f!=='object'||Number(f.minlevel||1)>Number(level||0))continue;
    const optionalId=`optional:${originId}:${key}`;
    const legacyOptionalId=legacyOriginId?`optional:${legacyOriginId}:${key}`:'';
    if(!selectionState.optionalFeatureChoices[optionalId] && legacyOptionalId && selectionState.optionalFeatureChoices[legacyOptionalId]) selectionState.optionalFeatureChoices[optionalId]=selectionState.optionalFeatureChoices[legacyOptionalId];
    if(legacyOptionalId && legacyOptionalId!==optionalId) delete selectionState.optionalFeatureChoices[legacyOptionalId];
    const selected=selectionState.optionalFeatureChoices[optionalId]||[];
    const variants=Array.isArray(f.__mpmbOptionalFeatureChoices)?f.__mpmbOptionalFeatureChoices:[];
    const replacement=variants.find(item=>item?.replacement && selected.some(x=>norm(x)===norm(item.name)));
    rows.push({origin,originId,legacyOriginId,key,feature:replacement?.data||f,baseFeature:f,replacement:replacement||null,level:Number(level||0)});
  }};
  const {base,variant}=resolvedRaceParts(character); if(base)add(base.name||character.race,`race:${character.race}`,base.features,20); if(variant)add(variant.name||variant.mpmbKey,`racevariant:${character.raceVariant}`,variant.features,20);
  const bg=resolvedBackgroundData(character); if(bg.effective?.features)add(bg.effective.name||'Background',`background:${bg.variantKey||bg.baseKey}`,bg.effective.features,20);
  (character.classes||[]).forEach((row,index)=>{const key=norm(row.name), cls=registries.ClassList[key]; if(cls)add(cls.name||row.name,`class:${key}`,cls.features,row.level,`class:${index}:${key}`); const sub=registries.ClassSubList[row.subclass]; if(sub)add(sub.subname||sub.fullname||sub.name||row.subclass,`subclass:${row.subclass}`,sub.features,row.level,`subclass:${index}:${row.subclass}`);});
  for(const id of selectedFeatIds(character)){const f=registries.FeatsList[id]; if(f) rows.push({origin:f.name||title(id),originId:`feat:${id}`,key:'feat',feature:f});}
  return rows;
}

function optionalFeatureLevel(item,row){
  const texts=[item?.data?.extraname,item?.extraName,item?.name];
  for(const value of texts){
    if(typeof value!=="string") continue;
    const m=value.match(/Optional\s+[A-Za-z ]+?\s+(\d+)\b/i)||value.match(/Optional\s+(\d+)(?:st|nd|rd|th)-level/i)||value.match(/prereq:\s*level\s*(\d+)/i);
    if(m) return Number(m[1]);
  }
  return Number(row?.level||0);
}
function isChoicePoolAddition(feature,item){
  return Array.isArray(feature?.extrachoices) && !String(item?.extraName||"").trim();
}
function isSupersededOptional(row,item){
  const src=Array.isArray(item?.data?.source)?item.data.source:[];
  const sourceIds=src.map(x=>norm(Array.isArray(x)?x[0]:x));
  return norm(row?.origin)==="ranger" && sourceIds.includes("ua:cfv");
}

export function featureChoiceSources(character){
  const s=selections(character); const out=[]; const validRequired=new Set(), validOptional=new Set(), validExtra=new Set();
  const optionalByOrigin=new Map();
  for(const row of featureRows(character)){
    const f=row.feature;
    const host=row.baseFeature||f;
    const allOptional=(Array.isArray(host.__mpmbOptionalFeatureChoices)?host.__mpmbOptionalFeatureChoices:[]).filter(item=>!isSupersededOptional(row,item));
    const poolAdds=allOptional.filter(item=>isChoicePoolAddition(f,item));
    const independentOptional=allOptional.filter(item=>!isChoicePoolAddition(f,item));
    const choices=Array.isArray(f.choices)?f.choices.filter(x=>!allOptional.some(o=>norm(o.name)===norm(x))):[];
    if(choices.length){ const id=`${row.originId}:${row.key}`, legacyId=row.legacyOriginId?`${row.legacyOriginId}:${row.key}`:''; validRequired.add(id); if(!s.featureChoices[id]&&legacyId&&s.featureChoices[legacyId])s.featureChoices[id]=s.featureChoices[legacyId]; if(legacyId&&legacyId!==id)delete s.featureChoices[legacyId]; const current=s.featureChoices[id]; if(current&&!choices.some(x=>norm(x)===norm(current))) delete s.featureChoices[id]; out.push({id,kind:'single',optional:false,label:`${row.origin}: ${f.name||title(row.key)}`,choices,selected:s.featureChoices[id]||'',feature:f}); }

    if(independentOptional.length){
      const id=`optional:${row.originId}:${row.key}`; validOptional.add(id);
      const available=independentOptional.filter(item=>optionalFeatureLevel(item,row)<=Number(row.level||0));
      const cur=Array.isArray(s.optionalFeatureChoices[id])?s.optionalFeatureChoices[id]:[];
      s.optionalFeatureChoices[id]=cur.filter(x=>available.some(o=>norm(o.name)===norm(x)));
      if(available.length){
        const group=optionalByOrigin.get(row.originId)||{id:`optional-group:${row.originId}`,kind:'optional-group',optional:true,label:`${row.origin}: Optional Class Features`,items:[]};
        for(const item of available) group.items.push({sourceId:id,value:item.name,name:item.name,level:optionalFeatureLevel(item,row),selected:s.optionalFeatureChoices[id].some(x=>norm(x)===norm(item.name)),description:item.data?.description||'',source:item.data?.source,hostFeature:f.name||title(row.key)});
        optionalByOrigin.set(row.originId,group);
      }
    }

    const extras=[...(Array.isArray(f.extrachoices)?f.extrachoices:[])];
    for(const item of poolAdds) if(!extras.some(x=>norm(x)===norm(item.name))) extras.push(item.name);
    if(extras.length){
      const id=`extra:${row.originId}:${row.key}`, legacyExtraId=row.legacyOriginId?`extra:${row.legacyOriginId}:${row.key}`:''; validExtra.add(id); if(!s.extraFeatureChoices[id]&&legacyExtraId&&s.extraFeatureChoices[legacyExtraId])s.extraFeatureChoices[id]=s.extraFeatureChoices[legacyExtraId]; if(legacyExtraId&&legacyExtraId!==id)delete s.extraFeatureChoices[legacyExtraId];
      const rawCount=Array.isArray(f.extraTimes)?f.extraTimes[Math.max(0,Math.min(f.extraTimes.length-1,row.level-1))]:f.extraTimes;
      const count=Math.max(0,Number(rawCount)||0);
      const legacyOptionalId=`optional:${row.originId}:${row.key}`;
      const legacySelected=Array.isArray(s.optionalFeatureChoices[legacyOptionalId])?s.optionalFeatureChoices[legacyOptionalId].filter(x=>poolAdds.some(o=>norm(o.name)===norm(x))):[];
      const current=[...(Array.isArray(s.extraFeatureChoices[id])?s.extraFeatureChoices[id]:[]),...legacySelected];
      const clean=[];
      for(const value of current){if(extras.some(x=>norm(x)===norm(value))&&!clean.some(x=>norm(x)===norm(value))&&clean.length<count)clean.push(value);}
      s.extraFeatureChoices[id]=clean;
      const options=extras.map(value=>({value,...extraFeatureEligibility(character,f,value,row.level)}));
      out.push({id,kind:'extra',optional:false,label:`${row.origin}: ${f.name||title(row.key)}`,choices:extras,options,count,selected:clean,missing:Math.max(0,count-clean.length),feature:f});
    }
  }
  out.push(...optionalByOrigin.values());
  for(const id of Object.keys(s.featureChoices)) if(!validRequired.has(id)) delete s.featureChoices[id];
  for(const id of Object.keys(s.optionalFeatureChoices)) if(!validOptional.has(id)) delete s.optionalFeatureChoices[id];
  for(const id of Object.keys(s.extraFeatureChoices)) if(!validExtra.has(id)) delete s.extraFeatureChoices[id];
  return out;
}
function extraFeatureEligibility(character,feature,value,level){
  const text=String(value||''); const reasons=[];
  const lvl=text.match(/(?:level|warlock level)\s*(\d+)/i); if(lvl&&Number(level||0)<Number(lvl[1])) reasons.push(`requires level ${lvl[1]}`);
  const pact=text.match(/Pact of the (Blade|Chain|Tome)/i); if(pact){
    const boon=Object.entries(character.contentSelections?.featureChoices||{}).find(([id])=>/warlock.*pact boon|pact boon/i.test(id))?.[1]||'';
    if(norm(boon)!==norm(`Pact of the ${pact[1]}`)) reasons.push(`requires Pact of the ${pact[1]}`);
  }
  if(/eldritch blast cantrip/i.test(text) && !(character.spells||[]).some(id=>norm(id)==='eldritch blast')) reasons.push('requires Eldritch Blast cantrip');
  const data=selectedChoiceDataForFeature(feature,value);
  return {eligible:reasons.length===0,reasons,data};
}
function selectedChoiceDataForFeature(feature,value){
  const q=norm(value); if(feature?.[q]&&typeof feature[q]==='object')return feature[q];
  for(const [key,data] of Object.entries(feature||{})) if(data&&typeof data==='object'&&(norm(key)===q||norm(data.name)===q)) return data;
  return null;
}
export function setFeatureChoice(character,id,value){selections(character).featureChoices[id]=value;return featureChoiceSources(character);}
export function toggleOptionalFeatureChoice(character,id,value,checked){const s=selections(character);const a=new Set(s.optionalFeatureChoices[id]||[]);checked?a.add(value):a.delete(value);s.optionalFeatureChoices[id]=[...a];return featureChoiceSources(character);}
export function setExtraFeatureChoice(character,id,slot,value){
  const s=selections(character); const rows=featureChoiceSources(character); const row=rows.find(x=>x.id===id&&x.kind==='extra'); if(!row)return rows;
  const next=[...(s.extraFeatureChoices[id]||[])];
  if(value){ const opt=row.options.find(x=>norm(x.value)===norm(value)); if(!opt?.eligible)return rows; next[slot]=value; } else next[slot]='';
  s.extraFeatureChoices[id]=next.filter((v,i,a)=>v&&a.findIndex(x=>norm(x)===norm(v))===i).slice(0,row.count);
  return featureChoiceSources(character);
}

export function improvementSources(character){
  const s=selections(character),out=[],valid=new Set();
  // Class rows are unique (classPlanIssues rejects duplicate class rows), so an
  // improvement belongs to the class + slot, not to the class's current row
  // position. Stable IDs keep ASI/feat selections attached when multiclass rows
  // are reordered. Migrate the older index-based IDs on sight so existing saves
  // from pre-0.8.19 builds retain their choices.
  (character.classes||[]).forEach((row,index)=>{
    const classKey=norm(row.name), cls=registries.ClassList[classKey], arr=cls?.improvements; if(!Array.isArray(arr))return;
    const count=Number(arr[Math.max(0,Number(row.level||1)-1)]||0);
    for(let slot=0;slot<count;slot++){
      const id=`asi:${classKey}:${slot}`, legacyId=`asi:${index}:${classKey}:${slot}`;
      valid.add(id);
      if(!s.improvementChoices[id] && s.improvementChoices[legacyId]) s.improvementChoices[id]=s.improvementChoices[legacyId];
      const value=s.improvementChoices[id]||{mode:'',ability1:'',ability2:'',feat:''};
      s.improvementChoices[id]=value;
      out.push({id,index,slot,label:`${cls.name||title(row.name)} improvement ${slot+1}`,value});
    }
  });
  for(const id of Object.keys(s.improvementChoices)) if(!valid.has(id)) delete s.improvementChoices[id];
  return out;
}
export function setImprovementChoice(character,id,patch){const s=selections(character);s.improvementChoices[id]={...(s.improvementChoices[id]||{}),...patch};return improvementSources(character);}

function bonusFeatRows(character){
  const rows=[]; const {variant}=resolvedRaceParts(character);
  if(variant && /gain\s+(?:one|1)\s+feat\s+of\s+(?:my|your)\s+choice/i.test(String(variant.trait||''))) rows.push({id:`bonusfeat:racevariant:${character.raceVariant}`,label:`${variant.name||'Race variant'} bonus feat`});
  const bg=resolvedBackgroundData(character); if(bg.effective && /gain\s+(?:one|1)\s+feat\s+of\s+(?:my|your)\s+choice/i.test(String(bg.effective.descriptionFull||bg.effective.description||bg.effective.trait||''))) rows.push({id:`bonusfeat:background:${bg.variantKey||bg.baseKey}`,label:`${bg.effective.name||'Background'} bonus feat`});
  return rows;
}
export function bonusFeatSources(character){
  const s=selections(character),rows=bonusFeatRows(character),valid=new Set(rows.map(x=>x.id)); for(const id of Object.keys(s.bonusFeatChoices)) if(!valid.has(id)) delete s.bonusFeatChoices[id];
  return rows.map(x=>({...x,selected:s.bonusFeatChoices[x.id]||''}));
}
export function setBonusFeatChoice(character,id,feat){selections(character).bonusFeatChoices[id]=feat;return bonusFeatSources(character);}


export function reconcileFeatAssignments(character){
  const s=selections(character);
  const manual=(character.feats||[]).map(x=>typeof x==='string'?x:x?.id).filter(Boolean);
  if(!manual.length) return {assigned:[],remaining:[]};
  const assigned=[];
  const consume=id=>{const i=manual.indexOf(id);if(i>=0)manual.splice(i,1);};
  // Remove duplicates already represented by a managed feat source.
  for(const id of Object.values(s.bonusFeatChoices||{})) if(id) consume(id);
  for(const v of Object.values(s.improvementChoices||{})) if(v?.mode==='feat'&&v.feat) consume(v.feat);
  // A manually added feat is treated as the player's answer to the next
  // currently-unresolved feat-granting slot. Variant-human/background bonus
  // feats are filled first, then unresolved class ASI/feat slots.
  for(const row of bonusFeatSources(character)){
    if(row.selected) continue;
    const pick=manual.find(id=>featEligibility(character,id).eligible);
    if(!pick) continue;
    s.bonusFeatChoices[row.id]=pick; consume(pick); assigned.push({source:row.id,feat:pick});
  }
  for(const row of improvementSources(character)){
    const v=s.improvementChoices[row.id]||{};
    if(v.mode) continue;
    const pick=manual.find(id=>featEligibility(character,id).eligible);
    if(!pick) continue;
    s.improvementChoices[row.id]={mode:'feat',ability1:'',ability2:'',feat:pick}; consume(pick); assigned.push({source:row.id,feat:pick});
  }
  // Keep only unclaimed manually-granted extras. Managed selections remain in
  // contentSelections and continue to appear in the Feats panel.
  character.feats=manual;
  return {assigned,remaining:manual};
}

export function selectedFeatIds(character){
  const s=selections(character),ids=[];
  for(const x of character.feats||[]) ids.push(typeof x==='string'?x:x?.id);
  for(const x of Object.values(s.bonusFeatChoices||{})) if(x)ids.push(x);
  for(const v of Object.values(s.improvementChoices||{})) if(v?.mode==='feat'&&v.feat)ids.push(v.feat);
  return unique(ids.filter(Boolean));
}

function hasCasting(character){
  for(const row of character.classes||[]){const cls=registries.ClassList[norm(row.name)];if(cls?.spellcastingFactor||cls?.features?.spellcasting||cls?.features?.['pact magic'])return true;const sub=registries.ClassSubList[row.subclass];if(sub && Object.values(sub.features||{}).some(f=>f && typeof f==='object' && (f.spellcastingFactor||f.spellcastingList||f.spellcastingKnown||f.spellcastingBonus)))return true;}
  return false;
}
function raceWords(character){const {base,variant}=resolvedRaceParts(character);return `${base?.name||''} ${base?.sortname||''} ${variant?.name||''} ${variant?.mpmbKey||''}`.toLowerCase();}
function hasFeatNamed(character,name){const q=norm(name).replace(/ feat$/,''); return selectedFeatIds(character).some(id=>{const f=registries.FeatsList[id];return norm(f?.name||id)===q||norm(id)===q;});}

export function featEligibility(character,id){
  const feat=registries.FeatsList[id]; if(!feat)return {eligible:false,supported:true,reasons:['Unknown feat']};
  const p=String(feat.prerequisite||'').trim(); if(!p)return {eligible:true,supported:true,reasons:[]};
  const reasons=[],unknown=[]; let eligible=true; const level=totalLevel(character); const lower=p.toLowerCase();
  const lvl=lower.match(/\b(4th|8th|12th|16th|19th|\d+(?:st|nd|rd|th))[- ]?level\b/); if(lvl){const need=parseInt(lvl[1],10); if(level<need){eligible=false;reasons.push(`Requires level ${need}`);}}
  const abilityMatches=[...p.matchAll(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:\s+or\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))?\s+(\d+)\s+or higher/gi)];
  for(const m of abilityMatches){const need=Number(m[3]),keys=[abilityKey(m[1]),abilityKey(m[2])].filter(Boolean);if(!keys.some(k=>Number(character.abilities?.[k]||0)>=need)){eligible=false;reasons.push(`${keys.map(k=>ABILITY_LABELS[k]).join(' or ')} ${need}+`);}}
  const armor=armorProficiencyProfile(character); if(/proficiency with light armor/i.test(p)&&!armor.light){eligible=false;reasons.push('Requires light armor proficiency');} if(/proficiency with medium armor/i.test(p)&&!armor.medium){eligible=false;reasons.push('Requires medium armor proficiency');} if(/proficiency with heavy armor/i.test(p)&&!armor.heavy){eligible=false;reasons.push('Requires heavy armor proficiency');}
  const weapons=weaponProficiencyProfile(character); if(/(?:proficiency with a martial weapon|martial weapon proficiency)/i.test(p)&&!(weapons.martial||weapons.names.length)){eligible=false;reasons.push('Requires martial weapon proficiency');}
  if(/ability to cast at least one spell|spellcasting or pact magic feature|spellcasting feature/i.test(p)&&!hasCasting(character)){eligible=false;reasons.push('Requires spellcasting');}
  const rw=raceWords(character);
  const raceClause=p.match(/Being an? ([^,]+?)(?:\.|$)/i);
  if(raceClause){const terms=raceClause[1].split(/\s+or\s+|,\s*/).map(x=>x.replace(/^(?:a|an)\s+/i,'').trim()).filter(Boolean); if(terms.length&&!terms.some(t=>rw.includes(norm(t).replace(/\([^)]*\)/g,'').trim()))){eligible=false;reasons.push(`Requires ${terms.join(' or ')}`);}}
  for(const m of p.matchAll(/(?:^|,\s*)([^,]+?) feat(?:,|$)/gi)){const name=m[1].replace(/^\d+(?:st|nd|rd|th)[- ]level\s*/i,'').trim(); if(name&&!/the ability|spellcasting/i.test(name)&&!hasFeatNamed(character,name)){eligible=false;reasons.push(`Requires ${name} feat`);}}
  const clsBg=p.match(/(Fighter|Paladin|Sorcerer|Warlock|Wizard|Cleric|Druid|Bard|Ranger|Rogue|Barbarian|Monk) Class/i); if(clsBg&&!character.classes.some(r=>norm(r.name)===norm(clsBg[1]))){eligible=false;reasons.push(`Requires ${clsBg[1]} class`);}
  // Conditions not yet safely reducible to semantic state are reported instead of silently approved.
  const knownPatterns=[/\d+(?:st|nd|rd|th)[- ]level/ig,/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:\s+or\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))?\s+\d+\s+or higher/ig,/proficiency with (?:light|medium|heavy) armor/ig,/proficiency with a martial weapon|martial weapon proficiency/ig,/ability to cast at least one spell|spellcasting or pact magic feature|spellcasting feature/ig,/Being an? [^,]+?(?:\.|$)/ig,/[^,]+? feat/ig,/(Fighter|Paladin|Sorcerer|Warlock|Wizard|Cleric|Druid|Bard|Ranger|Rogue|Barbarian|Monk) Class/ig];
  let residual=p; for(const re of knownPatterns) residual=residual.replace(re,''); residual=residual.replace(/[;,]/g,' ').replace(/\b(and|or|plus)\b/gi,' ').replace(/\s+/g,' ').trim();
  if(residual && !/^(the|a|an)$/i.test(residual)) unknown.push(residual);
  return {eligible,supported:unknown.length===0,reasons,unknown,prerequisite:p};
}

export function featOptionsWithEligibility(character){
  return Object.entries(registries.FeatsList).map(([id,f])=>({id,label:f?.name||title(id),eligibility:featEligibility(character,id)})).sort((a,b)=>a.label.localeCompare(b.label));
}

export function characterChoiceIssues(character){
  const issues=[];
  const racial=racialAbilityStatus(character); if(racial.missing)issues.push(`${racial.missing} racial ability choice${racial.missing===1?'':'s'}`);
  const prof=generalProficiencyStatus(character); for(const r of prof.rows) if(r.missing)issues.push(`${r.label}: ${r.missing} ${r.type} choice${r.missing===1?'':'s'}`);
  for(const f of featureChoiceSources(character)) { if(f.kind==='extra'&&f.missing)issues.push(`${f.label}: choose ${f.missing} more`); else if(f.kind!=='optional'&&!f.optional&&!f.selected&&f.kind!=='extra')issues.push(`${f.label}: feature choice required`); }
  for(const b of bonusFeatSources(character)) if(!b.selected)issues.push(`${b.label}: choose feat`);
  for(const a of improvementSources(character)) {const v=a.value;if(!v.mode)issues.push(`${a.label}: choose ASI or feat`); else if(v.mode==='+2'&&!v.ability1)issues.push(`${a.label}: choose ability`); else if(v.mode==='+1/+1'&&(!v.ability1||!v.ability2||v.ability1===v.ability2))issues.push(`${a.label}: choose two different abilities`); else if(v.mode==='feat'&&!v.feat)issues.push(`${a.label}: choose feat`);}
  return issues;
}

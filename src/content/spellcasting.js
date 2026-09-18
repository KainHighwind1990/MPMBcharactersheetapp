import { registries } from "./registry.js";
import { abilityMod, proficiencyBonus } from "../rules.js";
import { selectedFeatIds } from "./choice-framework.js";
import { resolvedRaceParts } from "./race-variants.js";

const norm = v => String(v ?? "").trim().toLowerCase();
const ABILITIES = ["str","dex","con","int","wis","cha"];
const FULL_MAX = [0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9];
const WARLOCK_MAX = [0,1,1,2,2,3,3,4,4,5,5,5,5,5,5,5,5,5,5,5,5];

// PHB multiclass spell-slot table, indexed by effective spellcaster level.
const STANDARD_SLOTS = [
  [],
  [2],
  [3],
  [4,2],
  [4,3],
  [4,3,2],
  [4,3,3],
  [4,3,3,1],
  [4,3,3,2],
  [4,3,3,3,1],
  [4,3,3,3,2],
  [4,3,3,3,2,1],
  [4,3,3,3,2,1],
  [4,3,3,3,2,1,1],
  [4,3,3,3,2,1,1],
  [4,3,3,3,2,1,1,1],
  [4,3,3,3,2,1,1,1],
  [4,3,3,3,2,1,1,1,1],
  [4,3,3,3,3,1,1,1,1],
  [4,3,3,3,3,2,1,1,1],
  [4,3,3,3,3,2,2,1,1],
];

const PACT_SLOTS = [
  null,
  { slots:1, level:1 }, { slots:2, level:1 },
  { slots:2, level:2 }, { slots:2, level:2 },
  { slots:2, level:3 }, { slots:2, level:3 },
  { slots:2, level:4 }, { slots:2, level:4 },
  { slots:2, level:5 }, { slots:2, level:5 },
  { slots:3, level:5 }, { slots:3, level:5 }, { slots:3, level:5 }, { slots:3, level:5 }, { slots:3, level:5 }, { slots:3, level:5 },
  { slots:4, level:5 }, { slots:4, level:5 }, { slots:4, level:5 }, { slots:4, level:5 },
];

function atLevel(value, level, fallback=0) {
  if (Array.isArray(value)) return value[Math.max(0, Math.min(value.length - 1, Number(level||1)-1))] ?? fallback;
  if (Number.isFinite(Number(value))) return Number(value);
  return fallback;
}
function totalLevel(character){ return (character.classes||[]).reduce((n,c)=>n+Math.max(0,Number(c.level)||0),0); }
function levelRangeOk(spell, range) {
  if (!Array.isArray(range)) return true;
  const lvl=Number(spell?.level||0);
  return lvl >= Number(range[0] ?? 0) && lvl <= Number(range[1] ?? 9);
}
function schoolOk(spell, schools) {
  if (!Array.isArray(schools) || !schools.length) return true;
  return schools.map(norm).includes(norm(spell?.school));
}
function classOk(spell, classes) {
  const wanted=(Array.isArray(classes)?classes:[classes]).filter(Boolean).map(norm);
  if (!wanted.length || wanted.includes("any")) return true;
  const actual=(Array.isArray(spell?.classes)?spell.classes:[]).map(norm);
  return wanted.some(x=>actual.includes(x));
}
function listSpecMatches(spell, spec, maxSpell=9) {
  if (!spell) return false;
  if (Number(spell.level||0) > maxSpell) return false;
  if (!spec || typeof spec !== "object") return true;
  if (!classOk(spell, spec.class)) return false;
  if (!schoolOk(spell, spec.school)) return false;
  if (!levelRangeOk(spell, spec.level)) return false;
  return true;
}
function spellRows(filter) {
  return Object.entries(registries.SpellsList).filter(([,s])=>filter(s)).map(([id,s])=>({id,name:s.name||id,level:Number(s.level||0),school:s.school||""})).sort((a,b)=>(a.level-b.level)||a.name.localeCompare(b.name));
}
function factorNumber(v) {
  if (Number.isFinite(Number(v))) return Math.max(1,Number(v));
  const m=String(v??"").match(/\d+/); return m?Math.max(1,Number(m[0])):1;
}
function maxSpellLevel(level, factor, classKey, spellTable) {
  level=Math.max(0,Number(level)||0);
  if (Array.isArray(spellTable) && spellTable[level]) {
    const row=spellTable[level];
    if (Array.isArray(row)) { for(let i=row.length-1;i>=0;i--) if(Number(row[i])>0) return i; }
  }
  if (norm(classKey)==="warlock") return WARLOCK_MAX[Math.min(20,level)]||0;
  // Spell-level access advances on the class progression, not on multiclass slot contribution.
  // Half/third casters therefore round UP here (e.g. Paladin 5 gets 2nd-level spells,
  // Eldritch Knight 7 gets 2nd-level spells), while slot contribution still rounds down.
  const eff=Math.max(0,Math.ceil(level/factor));
  return FULL_MAX[Math.min(20,eff)]||0;
}
function collectFeatureObjects(data, level) {
  const out=[];
  if (!data || typeof data!=="object") return out;
  out.push({name:data.name||data.subname||data.fullname||"Source",data,level:0});
  for(const f of Object.values(data.features||{})) if(f && typeof f==="object" && Number(f.minlevel||1)<=level) out.push({name:f.name||"Feature",data:f,level:Number(f.minlevel||1)});
  return out;
}
function collectSpellExtras(classData, subData, level, typeSp, selectedOptional=[]) {
  const extraOptions=new Set(), autoSpells=new Set(), autoPrepared=new Set(), bonusChoices=[];
  const sources=[...collectFeatureObjects(classData,level), ...collectFeatureObjects(subData,level), ...selectedOptional.map((data,i)=>({name:data?.name||`Optional feature ${i+1}`,data,level:Number(data?.minlevel||1)}))];
  for(const src of sources) {
    const d=src.data;
    if(Array.isArray(d.spellcastingExtra)) {
      const ids=d.spellcastingExtra.filter(id=>registries.SpellsList[id]);
      const special=d.spellcastingExtraApplyNonconform===true || d.spellcastingExtra?.[100]==="AddToKnown";
      if (typeSp==="list" && !special) ids.forEach(id=>autoPrepared.add(id));
      else if (special) ids.forEach(id=>autoSpells.add(id));
      else ids.forEach(id=>extraOptions.add(id));
    }
    const bonuses=Array.isArray(d.spellcastingBonus)?d.spellcastingBonus:[];
    for(const b of bonuses) {
      const times=Math.max(1,atLevel(b.times,level,1));
      const fixed=(b.selection||b.spells||b.spell||[]); const fixedIds=(Array.isArray(fixed)?fixed:[fixed]).filter(x=>registries.SpellsList[x]);
      if(fixedIds.length) fixedIds.forEach(id=>{ if(b.prepared) autoPrepared.add(id); else autoSpells.add(id); });
      else {
        const spec={class:b.class,school:b.school,level:b.level};
        bonusChoices.push({name:b.name||src.name||"Bonus spell",count:times,spec,prepared:!!b.prepared});
      }
    }
  }
  return {extraOptions:[...extraOptions],autoSpells:[...autoSpells],autoPrepared:[...autoPrepared],bonusChoices};
}
function numericAbilityOptions(value){
  const vals=(Array.isArray(value)?value:[value]).map(Number).filter(x=>Number.isInteger(x)&&x>=1&&x<=6);
  return [...new Set(vals.map(x=>ABILITIES[x-1]))];
}
function standaloneSpellSource(id,name,data,level,kind){
  if(!data||typeof data!=="object") return null;
  const featureObjects=collectFeatureObjects(data,level);
  const autoSpells=new Set(), bonusChoices=[];
  let abilityOptions=numericAbilityOptions(data.spellcastingAbility);
  for(const src of featureObjects){
    const bonuses=Array.isArray(src.data.spellcastingBonus)?src.data.spellcastingBonus:[];
    for(const b of bonuses){
      const times=Math.max(1,atLevel(b.times,level,1));
      const fixed=(b.selection||b.spells||b.spell||[]); const fixedIds=(Array.isArray(fixed)?fixed:[fixed]).filter(x=>registries.SpellsList[x]);
      if(fixedIds.length) fixedIds.forEach(x=>autoSpells.add(x));
      else {
        const spec={class:b.class,school:b.school,level:b.level};
        const options=spellRows(sp=>listSpecMatches(sp,spec,9));
        if(options.length) bonusChoices.push({name:b.name||src.name||"Bonus spell",count:times,spec,options,prepared:false,firstCol:b.firstCol||""});
      }
      const local=numericAbilityOptions(b.spellcastingAbility||src.data.spellcastingAbility);
      if(!abilityOptions.length&&local.length) abilityOptions=local;
    }
  }
  if(!autoSpells.size&&!bonusChoices.length) return null;
  const ability=abilityOptions.length===1?abilityOptions[0]:null;
  return {id,name,kind,sourceOnly:true,classIndex:null,classKey:"",level,ability,abilityOptions,factor:0,typeSp:"bonus",maxSpell:null,known:{},cantripCount:0,spellCount:0,preparedCount:0,list:null,cantrips:[],spells:[],extraOptions:[],autoSpells:[...autoSpells],autoPrepared:[],bonusChoices};
}
function standaloneSpellcasters(character){
  const out=[], level=totalLevel(character); const {base,variant}=resolvedRaceParts(character);
  const raceKey=norm(character.race);
  const baseSource=standaloneSpellSource(`extra:race:${raceKey}`,base?.name||character.race||"Race",base,level,"race"); if(baseSource)out.push(baseSource);
  if(variant){const v=standaloneSpellSource(`extra:racevariant:${character.raceVariant}`,variant.name||"Race variant",variant,level,"race");if(v)out.push(v);}
  for(const featId of selectedFeatIds(character)){
    const feat=registries.FeatsList[featId]; const f=standaloneSpellSource(`extra:feat:${featId}`,feat?.name||featId,feat,level,"feat"); if(f)out.push(f);
  }
  return out;
}

function selectedOptionalClassFeatures(character, classIndex, classKey, cls) {
  const store=character.contentSelections?.optionalFeatureChoices||{}; const out=[];
  for(const [featureKey,feature] of Object.entries(cls?.features||{})){
    const id=`optional:class:${classKey}:${featureKey}`, legacyId=`optional:class:${classIndex}:${classKey}:${featureKey}`;
    for(const selected of store[id]||store[legacyId]||[]){
      const defs=Array.isArray(feature?.__mpmbOptionalFeatureChoices)?feature.__mpmbOptionalFeatureChoices:[];
      const def=defs.find(x=>norm(x?.name)===norm(selected));
      if(def?.data) out.push(def.data);
    }
  }
  return out;
}

export function spellcastersForCharacter(character) {
  const out=[];
  for(let i=0;i<(character.classes||[]).length;i++) {
    const row=character.classes[i], key=norm(row.name), cls=registries.ClassList[key]||{}, sub=row.subclass?registries.ClassSubList[row.subclass]||{}:{};
    const known=sub.spellcastingKnown || cls.spellcastingKnown;
    const factorRaw=sub.spellcastingFactor ?? cls.spellcastingFactor;
    if(!known || factorRaw===undefined) continue;
    const level=Number(row.level)||0, factor=factorNumber(factorRaw);
    const startsEarly=key==="artificer";
    if(level<factor && !startsEarly && !(sub.spellcastingTable||cls.spellcastingTable)) continue;
    const list=sub.spellcastingList || cls.spellcastingList || {class:key};
    const typeSp=!known.spells || Array.isArray(known.spells) || !Number.isNaN(Number(known.spells)) ? "known" : String(known.spells);
    const maxSpell=maxSpellLevel(level,factor,key,sub.spellcastingTable||cls.spellcastingTable);
    const abilityIndex=Number(sub.abilitySave||cls.abilitySave||0);
    const ability=ABILITIES[abilityIndex-1] || ({wizard:"int",cleric:"wis",druid:"wis",ranger:"wis",paladin:"cha",bard:"cha",sorcerer:"cha",warlock:"cha",artificer:"int"}[key]||"int");
    const selectedOptional=selectedOptionalClassFeatures(character,i,key,cls);
    const extras=collectSpellExtras(cls,sub,level,typeSp,selectedOptional);
    const availableExtra=id=>{ const sp=registries.SpellsList[id]; return !!sp && Number(sp.level||0)<=maxSpell; };
    extras.extraOptions=extras.extraOptions.filter(availableExtra);
    extras.autoSpells=extras.autoSpells.filter(availableExtra);
    extras.autoPrepared=extras.autoPrepared.filter(availableExtra);
    extras.bonusChoices = extras.bonusChoices.map(b=>({...b, options: spellRows(sp=>listSpecMatches(sp,b.spec,maxSpell))}));
    let baseSpells=spellRows(s=>Number(s.level||0)>0 && listSpecMatches(s,list,maxSpell));
    // Browser-native translation of Tasha's Additional Ranger Spells. In MPMB this
    // is expressed through calcChanges.spellList; the web runtime applies the same
    // list expansion directly when that optional feature is selected.
    if(key==="ranger" && selectedOptional.some(x=>norm(x?.name)==="additional ranger spells")){
      const ids=new Set(baseSpells.map(x=>x.id));
      for(const id of ["entangle","searing smite","aid","enhance ability","gust of wind","magic weapon","elemental weapon","meld into stone","revivify","dominate beast","greater restoration"]){
        const sp=registries.SpellsList[id]; if(sp && Number(sp.level||0)<=maxSpell && !ids.has(id)){ baseSpells.push({id,name:sp.name||id,level:Number(sp.level||0),school:sp.school||""}); ids.add(id); }
      }
      baseSpells.sort((a,b)=>(a.level-b.level)||a.name.localeCompare(b.name));
    }
    const cantrips=spellRows(s=>Number(s.level||0)===0 && listSpecMatches(s,{...list,level:[0,0]},0));
    for(const id of extras.extraOptions) { const s=registries.SpellsList[id]; if(!s)continue; const rowx={id,name:s.name||id,level:Number(s.level||0),school:s.school||""}; (rowx.level===0?cantrips:baseSpells).push(rowx); }
    const unique=x=>[...new Map(x.map(v=>[v.id,v])).values()].sort((a,b)=>(a.level-b.level)||a.name.localeCompare(b.name));
    const cantripCount=Math.max(0,Number(atLevel(known.cantrips,level,0))||0);
    let spellCount=0;
    if(Array.isArray(known.spells)||Number.isFinite(Number(known.spells))) spellCount=Math.max(0,Number(atLevel(known.spells,level,0))||0);
    else if(typeSp==="book") spellCount=Math.max(0,6+Math.max(0,level-1)*2);
    let preparedCount=0;
    if(known.prepared) {
      // Preparation count is not the same thing as multiclass slot contribution.
      // Cleric/Druid/Paladin/Wizard prepare class level + ability modifier;
      // 2014 Artificer prepares half artificer level (rounded down) + Intelligence.
      // Using spellcastingFactor here incorrectly made Paladins prepare only half
      // their class level and made odd-level Artificers prepare one too many.
      const prepLevel=key==="artificer" ? Math.floor(level/2) : level;
      preparedCount=Array.isArray(known.prepared)?Math.max(0,Number(atLevel(known.prepared,level,0))||0):Math.max(1,abilityMod(character.abilities?.[ability])+Math.max(0,prepLevel));
    }
    const factorText=String(factorRaw||""); const kind=factorText.startsWith("warlock")?"pact":factorText.startsWith("psionic")?"psionic":"class";
    out.push({id:`class:${i}:${key}:${row.subclass||"base"}`,kind,classIndex:i,classKey:key,name:sub.spellcastingKnown?(sub.subname||sub.fullname||sub.name||cls.name||key):(cls.name||key),level,ability,abilityOptions:[ability],factor,factorRaw,typeSp,maxSpell,known,cantripCount,spellCount,preparedCount,list,cantrips:unique(cantrips),spells:unique(baseSpells),...extras});
  }
  out.push(...standaloneSpellcasters(character));
  return out;
}

function standardCasterContribution(row){
  const key=norm(row?.name), cls=registries.ClassList[key]||{}, sub=row?.subclass?registries.ClassSubList[row.subclass]||{}:{};
  const known=sub.spellcastingKnown||cls.spellcastingKnown; const raw=sub.spellcastingFactor??cls.spellcastingFactor;
  if(!known||raw===undefined) return 0;
  const text=String(raw); if(text.startsWith("warlock")||text.startsWith("psionic"))return 0;
  const level=Math.max(0,Number(row.level)||0), factor=factorNumber(raw);
  if(key==="artificer"&&factor===2)return Math.ceil(level/2);
  return Math.floor(level/factor);
}
export function effectiveCasterLevel(character){
  return Math.max(0,Math.min(20,(character.classes||[]).reduce((n,row)=>n+standardCasterContribution(row),0)));
}
export function pactMagicLevel(character){
  return Math.max(0,...(character.classes||[]).filter(r=>norm(r.name)==="warlock").map(r=>Number(r.level)||0));
}
function standardSpellcastingRows(character){
  return (character.classes||[]).filter(row=>{
    const key=norm(row?.name), cls=registries.ClassList[key]||{}, sub=row?.subclass?registries.ClassSubList[row.subclass]||{}:{};
    const known=sub.spellcastingKnown||cls.spellcastingKnown, raw=sub.spellcastingFactor??cls.spellcastingFactor;
    return !!known && raw!==undefined && !String(raw).startsWith("warlock") && !String(raw).startsWith("psionic");
  });
}
function singleClassSlotLevel(row){
  const key=norm(row?.name), cls=registries.ClassList[key]||{}, sub=row?.subclass?registries.ClassSubList[row.subclass]||{}:{};
  const raw=sub.spellcastingFactor??cls.spellcastingFactor, factor=factorNumber(raw), level=Math.max(0,Number(row?.level)||0);
  // A character with only one standard Spellcasting class uses that class's own slot
  // progression. Half/third casters round UP for their native slot table. Artificer also
  // rounds up, matching its multiclass contribution rule. Only when two or more standard
  // Spellcasting classes are combined do the PHB multiclass contribution rules round each
  // class down independently. Pact Magic remains a separate pool and doesn't trigger this.
  // Native half-casters (Paladin/Ranger) do not gain Spellcasting until class level 2.
  // Using ceil(level/2) without this gate incorrectly gave them 1st-level slots at level 1.
  if((key==="paladin"||key==="ranger") && level<2) return 0;
  return Math.max(0,Math.min(20,Math.ceil(level/factor)));
}
function rawSlotCapacity(character){
  const standardRows=standardSpellcastingRows(character);
  const contributionLevel=effectiveCasterLevel(character);
  const casterLevel=standardRows.length===1 ? singleClassSlotLevel(standardRows[0]) : contributionLevel;
  const standard=(STANDARD_SLOTS[casterLevel]||[]).map((max,i)=>({level:i+1,max:Number(max)||0})).filter(x=>x.max>0);
  const warlockLevel=Math.min(20,pactMagicLevel(character)), p=PACT_SLOTS[warlockLevel]||null;
  return {casterLevel,contributionLevel,standard,warlockLevel,pact:p?{slotLevel:p.level,max:p.slots}:null};
}
export function ensureSpellcastingState(character) {
  character.spellcasting ??= {casters:{},managedSpellIds:[],slots:{standard:{},pact:{used:0}}}; character.spellcasting.casters ??={};
  character.spellcasting.managedSpellIds ??=[]; character.spellcasting.slots??={standard:{},pact:{used:0}};
  character.spellcasting.slots.standard??={}; character.spellcasting.slots.pact??={used:0};
  for(const c of spellcastersForCharacter(character)) character.spellcasting.casters[c.id] ??={cantrips:[],spells:[],prepared:[],bonus:[],ability:""};
  return character.spellcasting;
}
export function reconcileSpellSlotUsage(character){
  character.spellcasting??={casters:{},managedSpellIds:[],slots:{standard:{},pact:{used:0}}};
  character.spellcasting.slots??={standard:{},pact:{used:0}}; character.spellcasting.slots.standard??={}; character.spellcasting.slots.pact??={used:0};
  const cap=rawSlotCapacity(character), valid=new Set(cap.standard.map(x=>String(x.level)));
  for(const key of Object.keys(character.spellcasting.slots.standard)) if(!valid.has(String(key))) delete character.spellcasting.slots.standard[key];
  for(const row of cap.standard) character.spellcasting.slots.standard[row.level]=Math.max(0,Math.min(row.max,Number(character.spellcasting.slots.standard[row.level])||0));
  character.spellcasting.slots.pact.used=cap.pact?Math.max(0,Math.min(cap.pact.max,Number(character.spellcasting.slots.pact.used)||0)):0;
  return character.spellcasting.slots;
}
export function spellSlotSummary(character){
  ensureSpellcastingState(character); reconcileSpellSlotUsage(character); const cap=rawSlotCapacity(character);
  return {casterLevel:cap.casterLevel,contributionLevel:cap.contributionLevel,standard:cap.standard.map(x=>({...x,used:Number(character.spellcasting.slots.standard[x.level])||0,remaining:x.max-(Number(character.spellcasting.slots.standard[x.level])||0)})),warlockLevel:cap.warlockLevel,pact:cap.pact?{...cap.pact,used:Number(character.spellcasting.slots.pact.used)||0,remaining:cap.pact.max-(Number(character.spellcasting.slots.pact.used)||0)}:null};
}
export function setSpellSlotUsed(character,pool,level,used){
  ensureSpellcastingState(character); const cap=rawSlotCapacity(character);
  if(pool==="pact"){const max=cap.pact?.max||0;character.spellcasting.slots.pact.used=Math.max(0,Math.min(max,Number(used)||0));}
  else {const row=cap.standard.find(x=>x.level===Number(level)); if(row)character.spellcasting.slots.standard[row.level]=Math.max(0,Math.min(row.max,Number(used)||0));}
  return reconcileSpellSlotUsage(character);
}
export function resetSpellSlots(character,rest="long"){
  ensureSpellcastingState(character); if(rest==="long")for(const k of Object.keys(character.spellcasting.slots.standard))character.spellcasting.slots.standard[k]=0;
  if(rest==="long"||rest==="short")character.spellcasting.slots.pact.used=0; return reconcileSpellSlotUsage(character);
}

export function reconcileSpellcastingState(character) {
  ensureSpellcastingState(character); reconcileSpellSlotUsage(character);
  const casters=spellcastersForCharacter(character);
  const valid=new Set(casters.map(c=>c.id));
  const oldManaged=new Set(character.spellcasting.managedSpellIds||[]);
  for(const [id,state] of Object.entries(character.spellcasting.casters||{})){
    if(valid.has(id)) continue;
    for(const spell of [...(state.cantrips||[]),...(state.spells||[]),...(state.prepared||[]),...(state.bonus||[])]) if(spell)oldManaged.add(spell);
    delete character.spellcasting.casters[id];
  }
  // A level/class/subclass change can leave selections that were legal for the old
  // caster but no longer exist in the current spell pool. Prune those immediately,
  // rather than waiting for the Spell Wizard to be opened and applied again.
  for(const c of casters){
    const state=character.spellcasting.casters[c.id] ??={cantrips:[],spells:[],prepared:[],bonus:[],ability:""};
    for(const spell of [...(state.cantrips||[]),...(state.spells||[]),...(state.prepared||[]),...(state.bonus||[])]) if(spell)oldManaged.add(spell);
    state.cantrips=legalSelected(state.cantrips,c.cantrips,c.cantripCount);
    state.spells=legalSelected(state.spells,c.spells,c.spellCount);
    const prepPool=preparedPool(c,state);
    state.prepared=legalSelected(state.prepared,prepPool,Math.min(c.preparedCount,prepPool.length));
    const bonusOptions=(c.bonusChoices||[]).flatMap(b=>b.options||[]);
    const requiredBonus=(c.bonusChoices||[]).reduce((n,b)=>n+Number(b.count||0),0);
    state.bonus=legalSelected(state.bonus,bonusOptions,requiredBonus);
    state.ability=(c.abilityOptions||[]).includes(state.ability)?state.ability:(c.ability||"");
  }
  const currentManaged=new Set();
  for(const c of casters){
    const state=character.spellcasting.casters[c.id]||{};
    for(const spell of [...(state.cantrips||[]),...(state.spells||[]),...(state.prepared||[]),...(state.bonus||[]),...c.autoSpells,...c.autoPrepared]) if(spell)currentManaged.add(spell);
  }
  const manual=(character.spells||[]).map(x=>typeof x==='string'?x:x?.id).filter(id=>id&&!oldManaged.has(id));
  character.spells=[...new Set([...manual,...currentManaged])];
  character.spellcasting.managedSpellIds=[...currentManaged];
  return character.spellcasting;
}

function legalSelected(ids, rows, limit = Infinity) {
  const allowed = new Set((rows || []).map(x => typeof x === "string" ? x : x?.id).filter(Boolean));
  const out = [];
  for (const id of ids || []) {
    if (!id || !allowed.has(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

export function createSpellWizardDraft(character) {
  ensureSpellcastingState(character);
  return spellcastersForCharacter(character).map(c=>{
    const old = character.spellcasting.casters[c.id] || {};
    const cantrips = legalSelected(old.cantrips, c.cantrips, c.cantripCount);
    const spells = legalSelected(old.spells, c.spells, c.spellCount);
    const prepSelections = { cantrips, spells, prepared:[], bonus:[] };
    const prepPool = preparedPool(c, prepSelections);
    const prepared = legalSelected(old.prepared, prepPool, Math.min(c.preparedCount, prepPool.length));
    const bonusOptions = (c.bonusChoices || []).flatMap(b => b.options || []);
    const requiredBonus = (c.bonusChoices || []).reduce((n,b)=>n+Number(b.count||0),0);
    const bonus = legalSelected(old.bonus, bonusOptions, requiredBonus);
    return {
      ...c,
      selections: {
        cantrips,
        spells,
        prepared,
        bonus,
        ability:(c.abilityOptions||[]).includes(old.ability) ? old.ability : (c.ability || ""),
      }
    };
  });
}

export function validSpellWizardDraft(draft) {
  const problems=[];
  for(const c of draft||[]) {
    for (const kind of ["cantrips","spells","prepared","bonus"]) { const vals=(c.selections[kind]||[]).filter(Boolean); if(new Set(vals).size!==vals.length) problems.push(`${c.name}: ${kind} contains a duplicate selection`); }
    if((c.abilityOptions||[]).length>1 && !(c.abilityOptions||[]).includes(c.selections.ability)) problems.push(`${c.name}: choose a spellcasting ability`);
    if(c.selections.cantrips.filter(Boolean).length!==c.cantripCount) problems.push(`${c.name}: choose ${c.cantripCount} cantrip${c.cantripCount===1?"":"s"}`);
    if((c.typeSp==="known"||c.typeSp==="book") && c.selections.spells.filter(Boolean).length!==c.spellCount) problems.push(`${c.name}: choose ${c.spellCount} ${c.typeSp==="book"?"spellbook spell":"known spell"}${c.spellCount===1?"":"s"}`);
    // Daily preparation is never a creation blocker. For full-list casters it is
    // handled on the Spells panel; book/known preparers may optionally set today's
    // prepared subset here, but can finish creation with zero through the limit.
    const prepLimit=Math.min(c.preparedCount, preparedPool(c,c.selections).length);
    if(c.selections.prepared.filter(Boolean).length>prepLimit) problems.push(`${c.name}: prepared spell selection exceeds ${prepLimit}`);
    const requiredBonus=(c.bonusChoices||[]).reduce((n,b)=>n+Number(b.count||0),0);
    if(c.selections.bonus.filter(Boolean).length!==requiredBonus) problems.push(`${c.name}: choose ${requiredBonus} special/expanded spell option${requiredBonus===1?"":"s"}`);
  }
  return problems;
}

export function preparedPool(caster,selections) {
  if(caster.typeSp==="book") {
    const ids=new Set([...(selections?.spells||[]), ...caster.autoSpells]);
    return caster.spells.filter(x=>ids.has(x.id));
  }
  if(caster.typeSp==="known") {
    const ids=new Set([...(selections?.spells||[]), ...caster.autoSpells]);
    return caster.spells.filter(x=>ids.has(x.id));
  }
  return caster.spells;
}

export function applySpellWizard(character,draft) {
  ensureSpellcastingState(character);
  const previouslyManaged=new Set();
  for(const c of spellcastersForCharacter(character)) {
    const old=character.spellcasting.casters[c.id]||{};
    for(const id of [...(old.cantrips||[]),...(old.spells||[]),...(old.prepared||[]),...(old.bonus||[]),...c.autoSpells,...c.autoPrepared]) if(id) previouslyManaged.add(id);
  }
  const all=new Set((character.spells||[]).map(x=>typeof x==="string"?x:x?.id).filter(id=>id&&!previouslyManaged.has(id)));
  for(const c of draft||[]) {
    const state=character.spellcasting.casters[c.id] ??={cantrips:[],spells:[],prepared:[],bonus:[],ability:""};
    state.cantrips=c.selections.cantrips.filter(Boolean).slice(0,c.cantripCount);
    state.spells=c.selections.spells.filter(Boolean).slice(0,c.spellCount);
    const pool=new Set(preparedPool(c,state).map(x=>x.id));
    state.prepared=c.selections.prepared.filter(id=>pool.has(id)).slice(0,c.preparedCount);
    state.bonus=c.selections.bonus.filter(Boolean);
    state.ability=(c.abilityOptions||[]).includes(c.selections.ability)?c.selections.ability:(c.ability||"");
    [...state.cantrips,...state.spells,...state.prepared,...state.bonus,...c.autoSpells,...c.autoPrepared].forEach(id=>id&&all.add(id));
  }
  character.spells=[...all].filter(Boolean);
  character.spellcasting.managedSpellIds=[...new Set((draft||[]).flatMap(c=>[...(c.selections.cantrips||[]),...(c.selections.spells||[]),...(c.selections.prepared||[]),...(c.selections.bonus||[]),...c.autoSpells,...c.autoPrepared]).filter(Boolean))];
  reconcileSpellcastingState(character);
  return character;
}


export function spellGrantMetadata(character) {
  const out = new Map();
  const level = totalLevel(character);
  const addSource = (sourceId, sourceName, data, kind) => {
    if (!data || typeof data !== "object") return;
    let rootAbilities = numericAbilityOptions(data.spellcastingAbility);
    for (const src of collectFeatureObjects(data, level)) {
      const bonuses = Array.isArray(src.data.spellcastingBonus) ? src.data.spellcastingBonus : [];
      for (const b of bonuses) {
        const fixed = (b.selection || b.spells || b.spell || []);
        const ids = (Array.isArray(fixed) ? fixed : [fixed]).filter(id => registries.SpellsList[id]);
        if (!ids.length) continue;
        const localAbilities = numericAbilityOptions(b.spellcastingAbility || src.data.spellcastingAbility);
        const abilities = localAbilities.length ? localAbilities : rootAbilities;
        const ability = abilities.length === 1 ? abilities[0] : null;
        const grant = {
          sourceId, source: sourceName, feature: src.name || b.name || sourceName, kind,
          ability, abilityOptions: abilities, firstCol: b.firstCol || "",
          usages: atLevel(src.data.usages, level, null), recovery: src.data.recovery || "",
        };
        for (const id of ids) { const rows = out.get(id) || []; rows.push(grant); out.set(id, rows); }
      }
    }
  };
  const { base, variant } = resolvedRaceParts(character);
  if (base) addSource(`race:${norm(character.race)}`, base.name || character.race || "Race", base, "race");
  if (variant) addSource(`racevariant:${character.raceVariant}`, variant.name || character.raceVariant || "Race variant", variant, "race");
  for (const featId of selectedFeatIds(character)) { const feat = registries.FeatsList[featId]; if (feat) addSource(`feat:${featId}`, feat.name || featId, feat, "feat"); }
  return out;
}

export function spellStatuses(character) {
  const map=new Map(); ensureSpellcastingState(character);
  for(const c of spellcastersForCharacter(character)) {
    const st=character.spellcasting.casters[c.id]||{};
    const add=(id,label)=>{ if(!id)return; const x=map.get(id)||new Set(); x.add(`${c.name}: ${label}`); map.set(id,x); };
    (st.cantrips||[]).forEach(id=>add(id,"known cantrip"));
    (st.spells||[]).forEach(id=>add(id,c.typeSp==="book"?"in spellbook":"known"));
    (st.prepared||[]).forEach(id=>add(id,"prepared"));
    (st.bonus||[]).forEach(id=>add(id,c.kind==="race"?"racial spell":c.kind==="feat"?"feat spell":"special spell"));
    c.autoSpells.forEach(id=>add(id,c.kind==="race"?"racial spell":c.kind==="feat"?"feat spell":"bonus/automatic"));
    c.autoPrepared.forEach(id=>add(id,"always prepared"));
  }
  return new Map([...map].map(([k,v])=>[k,[...v]]));
}

export function spellcastingSummary(character) {
  ensureSpellcastingState(character);
  return spellcastersForCharacter(character).map(c=>{
    const state=character.spellcasting.casters[c.id]||{}; const ability=state.ability||c.ability||null;
    return {id:c.id,name:c.name,kind:c.kind||"class",ability,abilityOptions:c.abilityOptions||[],attack:ability?proficiencyBonus(character)+abilityMod(character.abilities?.[ability]):null,dc:ability?8+proficiencyBonus(character)+abilityMod(character.abilities?.[ability]):null,maxSpell:c.maxSpell,cantripCount:c.cantripCount,spellCount:c.spellCount,preparedCount:c.preparedCount,typeSp:c.typeSp};
  });
}

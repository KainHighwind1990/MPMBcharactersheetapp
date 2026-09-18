import { registries } from './registry.js';
import { subclassUnlockLevel, subclassesForClass, validSubclassForClass } from './queries.js';
import { characterChoiceIssues, featEligibility } from './choice-framework.js';
import { skillChoiceStatus } from './skill-proficiencies.js';
import { reconcileExpertise } from './expertise.js';
import { featAbilityChoiceSources } from './ability-scores.js';
import { createSpellWizardDraft, validSpellWizardDraft, spellcastersForCharacter } from './spellcasting.js';
import { totalLevel } from '../rules.js';

const norm=v=>String(v??'').trim().toLowerCase();
const label=v=>String(v??'').replace(/\b\w/g,m=>m.toUpperCase());
const ABILITY_MAP={strength:'str',dexterity:'dex',constitution:'con',intelligence:'int',wisdom:'wis',charisma:'cha'};

export function classPrerequisite(classKey){
  return String(registries.ClassList[norm(classKey)]?.prereqs||'').trim();
}

export function prerequisiteResult(text, abilities={}){
  text=String(text||'').trim();
  if(!text) return {ok:true,supported:true,requirements:[]};
  const parts=text.split(/\s+(and|or)\s+/i);
  const requirements=[]; const ops=[];
  for(let i=0;i<parts.length;i++){
    if(i%2){ops.push(parts[i].toLowerCase());continue;}
    const m=parts[i].match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(\d+)/i);
    if(!m) return {ok:true,supported:false,requirements,unknown:text};
    const ability=ABILITY_MAP[m[1].toLowerCase()], need=Number(m[2]), actual=Number(abilities?.[ability]||0);
    requirements.push({ability,need,actual,ok:actual>=need,label:m[1]});
  }
  let ok=requirements[0]?.ok??true;
  for(let i=0;i<ops.length;i++) ok=ops[i]==='and' ? (ok&&requirements[i+1].ok) : (ok||requirements[i+1].ok);
  return {ok,supported:true,requirements,operators:ops};
}


export function prestigeClassIssues(character, classKey, rows=character.classes||[]){
  const key=norm(classKey), cls=registries.ClassList[key]||{};
  if(!cls.prestigeClassPrereq) return [];
  const issues=[];
  const requiredLevel=Number(cls.prestigeClassPrereq)||0;
  const priorLevels=rows.filter(r=>norm(r.name)!==key).reduce((n,r)=>n+Math.max(0,Number(r.level)||0),0);
  if(priorLevels<requiredLevel) issues.push(`${cls.name||label(key)} requires character level ${requiredLevel} before taking its first prestige-class level`);
  const text=String(cls.prereqs||'');
  for(const m of text.matchAll(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(\d+)/gi)){
    const ability=ABILITY_MAP[m[1].toLowerCase()], need=Number(m[2]), actual=Number(character.abilities?.[ability]||0);
    if(actual<need) issues.push(`${cls.name||label(key)} requires ${m[1]} ${need}`);
  }
  if(/proficiency in the Arcana skill/i.test(text) && Number(character.skillProficiencies?.Arcana||0)<1) issues.push(`${cls.name||label(key)} requires proficiency in Arcana`);
  // Rune Scribe is the only official 2014-era prestige-class experiment in the
  // bundled corpus and has five class levels. The source's special tutor/rune
  // task is narrative and remains a DM/player verification rather than a sheet
  // value we can infer.
  const row=rows.find(r=>norm(r.name)===key);
  if(key==='rune scribe' && Number(row?.level||0)>5) issues.push('Rune Scribe has a maximum of 5 prestige-class levels');
  return [...new Set(issues)];
}

export function multiclassEligibility(character,targetClass){
  const target=norm(targetClass); const rows=character.classes||[];
  if(!target||!registries.ClassList[target]) return {ok:false,supported:true,reasons:['Choose a valid class'],checks:[]};
  if(rows.some(r=>norm(r.name)===target)) return {ok:true,supported:true,reasons:[],checks:[]};
  const prestige=prestigeClassIssues(character,target,[...rows,{name:target,level:1,subclass:''}]);
  if(prestige.length) return {ok:false,supported:true,reasons:prestige,checks:[]};
  if(!rows.length) return {ok:true,supported:true,reasons:[],checks:[]};
  const keys=[...new Set([...rows.map(r=>norm(r.name)),target])];
  const checks=keys.map(key=>({classKey:key,text:classPrerequisite(key),...prerequisiteResult(classPrerequisite(key),character.abilities)}));
  const bad=checks.filter(x=>!x.ok); const unsupported=checks.filter(x=>!x.supported);
  return {ok:bad.length===0,supported:unsupported.length===0,checks,reasons:bad.map(x=>`${registries.ClassList[x.classKey]?.name||label(x.classKey)} requires ${x.text}`),unknown:unsupported.map(x=>x.text)};
}

export function classPlanIssues(character,rows=character.classes||[]){
  const issues=[]; const total=rows.reduce((n,r)=>n+Math.max(0,Number(r.level)||0),0);
  if(!rows.length) issues.push('Choose at least one class');
  if(total<1) issues.push('Total level must be at least 1');
  if(total>20) issues.push('Total character level cannot exceed 20');
  const seen=new Set();
  for(const row of rows){
    const key=norm(row.name); const cls=registries.ClassList[key];
    if(!cls){issues.push(`Unknown class: ${row.name||'(blank)'}`);continue;}
    if(seen.has(key)) issues.push(`${cls.name||label(key)} appears more than once; combine its levels into one row`); seen.add(key);
    const lvl=Math.max(0,Number(row.level)||0); if(lvl<1||lvl>20) issues.push(`${cls.name||label(key)} level must be 1–20`);
    issues.push(...prestigeClassIssues({...character,classes:rows},key,rows));
    const subs=subclassesForClass(key), unlock=subclassUnlockLevel(key);
    if(subs.length&&lvl>=unlock&&!validSubclassForClass(key,row.subclass)) issues.push(`${cls.name||label(key)} ${lvl} needs a subclass`);
  }
  if(rows.length>1){
    for(const row of rows){
      const key=norm(row.name), text=classPrerequisite(key), result=prerequisiteResult(text,character.abilities);
      if(!result.ok) issues.push(`${registries.ClassList[key]?.name||label(key)} requires ${text}`);
      else if(!result.supported) issues.push(`${registries.ClassList[key]?.name||label(key)} multiclass prerequisite needs manual verification: ${text}`);
    }
  }
  return [...new Set(issues)];
}

export function levelUpPreview(character,classKey){
  const key=norm(classKey), cls=registries.ClassList[key];
  if(!cls) return {ok:false,reasons:['Choose a valid class'],classKey:key};
  const current=(character.classes||[]).find(r=>norm(r.name)===key); const oldLevel=Number(current?.level||0); const newLevel=oldLevel+1;
  if(totalLevel(character)>=20) return {ok:false,reasons:['Character is already level 20'],classKey:key,oldLevel,newLevel};
  if(newLevel>20) return {ok:false,reasons:[`${cls.name||label(key)} cannot exceed level 20`],classKey:key,oldLevel,newLevel};
  const multi=oldLevel?{ok:true,reasons:[],supported:true}:multiclassEligibility(character,key);
  const features=Object.values(cls.features||{}).filter(f=>f&&typeof f==='object'&&Number(f.minlevel||1)===newLevel).map(f=>f.name||'Class feature');
  const unlock=subclassUnlockLevel(key), subs=subclassesForClass(key); const subclassNeeded=!!subs.length&&newLevel>=unlock&&!current?.subclass;
  const oldImp=Number(cls.improvements?.[Math.max(0,oldLevel-1)]||0), newImp=Number(cls.improvements?.[Math.max(0,newLevel-1)]||0);
  const asiGained=Math.max(0,newImp-oldImp);
  return {ok:multi.ok,reasons:multi.reasons||[],supported:multi.supported!==false,classKey:key,className:cls.name||label(key),oldLevel,newLevel,features,subclassNeeded,subclassUnlock:unlock,asiGained,isNewClass:!current};
}

export function applyLevelUp(character,classKey,subclass=''){
  const preview=levelUpPreview(character,classKey); if(!preview.ok)return preview;
  let row=(character.classes||[]).find(r=>norm(r.name)===preview.classKey);
  if(row) row.level=preview.newLevel; else { row={name:preview.classKey,level:1,subclass:''}; character.classes.push(row); }
  if(subclass) row.subclass=subclass;
  return {...preview,applied:true};
}

export function creationChecklist(character){
  const items=[];
  const add=(id,labelText,panel,problems,action='jump')=>items.push({id,label:labelText,panel,action,problems:[...new Set(problems.filter(Boolean))],complete:problems.filter(Boolean).length===0});
  add('identity','Identity & origin','identity',[!character.race?'Choose a race':'',!character.background?'Choose a background':'']);
  add('classes','Classes, levels & subclasses','combat',classPlanIssues(character));
  const abilityProblems=[]; for(const [k,v] of Object.entries(character.baseAbilities||{})) if(!Number.isFinite(Number(v))||Number(v)<1) abilityProblems.push(`Set ${k.toUpperCase()} base score`);
  add('abilities','Base ability scores','abilities',abilityProblems);
  const choices=characterChoiceIssues(character); add('choices','Languages, tools, feats, ASIs & feature choices','choices',choices);
  const skillProblems=[]; for(const s of skillChoiceStatus(character)) if(s.missing)skillProblems.push(`${s.label}: ${s.missing} skill choice${s.missing===1?'':'s'}`); for(const e of reconcileExpertise(character))if(e.missing)skillProblems.push(`${e.label}: ${e.missing} expertise choice${e.missing===1?'':'s'}`);
  add('skills','Skills & Expertise','skill-proficiencies',skillProblems);
  const featAbility=featAbilityChoiceSources(character).filter(x=>!x.selected).map(x=>`${x.label}: choose ability`); if(featAbility.length){ const item=items.find(x=>x.id==='choices'); item.problems.push(...featAbility);item.complete=false; }
  const casters=spellcastersForCharacter(character);
  const spellDraft=casters.length?createSpellWizardDraft(character):[];
  const spellProblems=spellDraft.length?validSpellWizardDraft(spellDraft):[];
  // Full-list prepared casters (cleric/druid-style) prepare directly on the sheet.
  // Their cantrip/bonus/ability choices can still require the wizard, but changing the
  // day's prepared spells should never require reopening it.
  // Daily preparation for full-list prepared casters is never a creation blocker.
  // The spell wizard may edit that preparation, but only permanent spell choices
  // (cantrips, known/book spells, casting ability, special choices) are required.
  const wizardProblems=spellProblems;
  const spellChoiceRequired=spellDraft.some(c=>
    Number(c.cantripCount||0)>0 || (c.typeSp!=='list'&&Number(c.spellCount||0)>0) ||
    (c.abilityOptions||[]).length>1 || (c.bonusChoices||[]).some(b=>Number(b.count||0)>0)
  );
  add('spells','Spell choices','spells',wizardProblems,spellChoiceRequired&&wizardProblems.length?'spell-wizard':'jump');
  // Keep the Full Character Wizard's Spells step available for class spellcasters
  // even after their current creation-time choices are complete. Fixed racial/feat
  // spell grants alone do not expose the step.
  const spellItem=items[items.length-1];
  spellItem.wizardAvailable=spellChoiceRequired;
  spellItem.hasClassSpellcasting=spellDraft.some(c=>c.kind==='class' && (Number(c.cantripCount||0)>0 || Number(c.spellCount||0)>0 || Number(c.preparedCount||0)>0 || (c.spells||[]).length || (c.cantrips||[]).length));
  items.push({id:'gear',label:'Starting equipment',panel:'equipment',action:'gear-wizard',problems:[],complete:true,optional:true,note:character.startingGearApplied?'Starting Gear Wizard has been applied':'Optional: use the Starting Gear Wizard or manage equipment manually'});
  return items;
}

export function creationStatus(character){
  const items=creationChecklist(character); const remaining=items.reduce((n,x)=>n+x.problems.length,0);
  return {items,remaining,complete:remaining===0,totalLevel:totalLevel(character)};
}

export function validateCreation(character){
  const status=creationStatus(character); return status.items.flatMap(i=>i.problems.map(problem=>({step:i.id,label:i.label,panel:i.panel,problem})));
}

export function canChooseFeat(character,id){ return featEligibility(character,id); }

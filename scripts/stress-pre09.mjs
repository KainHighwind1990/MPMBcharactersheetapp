// Pre-0.9 torture matrix. This intentionally runs after the compatibility suite so
// it exercises the same fully imported MPMB registries used by the browser.
await import('./smoke-content.mjs');
import { registries } from '../src/content/registry.js';
import { newCharacter, normalizeCharacter } from '../src/state.js';
import { subclassesForClass, subclassUnlockLevel } from '../src/content/queries.js';
import { classPlanIssues, creationStatus } from '../src/content/character-workflow.js';
import { reconcileAbilityScores } from '../src/content/ability-scores.js';
import { reconcileGeneralProficiencies, reconcileFeatAssignments } from '../src/content/choice-framework.js';
import { reconcileSkillProficiencies } from '../src/content/skill-proficiencies.js';
import { reconcileExpertise } from '../src/content/expertise.js';
import { reconcileSaveProficiencies } from '../src/content/save-status.js';
import { reconcileHP } from '../src/content/hp.js';
import { reconcileSpellcastingState, spellSlotSummary, spellcastersForCharacter } from '../src/content/spellcasting.js';
import { reconcileBehaviorState, resourceStatus } from '../src/content/behavior-runtime.js';
import { combatProfile, derivedSpeed, initiativeSummary } from '../src/content/combat.js';
import { calculatedArmorClass } from '../src/content/sheet-sections.js';

const core=['barbarian','bard','cleric','druid','fighter','monk','paladin','ranger','rogue','sorcerer','warlock','wizard'];
let cases=0; const failures=[];
function run(name,fn){cases++;try{fn();}catch(e){failures.push(`${name}: ${e?.stack||e}`);}}
function ok(v,msg){if(!v)throw new Error(msg);}
function subclassId(x){return x?.key||x?.id||'';}
function reconcileAll(c){reconcileFeatAssignments(c);reconcileAbilityScores(c);reconcileGeneralProficiencies(c);reconcileSkillProficiencies(c);reconcileExpertise(c);reconcileSaveProficiencies(c);reconcileHP(c);reconcileSpellcastingState(c);reconcileBehaviorState(c);return c;}

// 240 single-class level snapshots.
for(const key of core)for(let level=1;level<=20;level++)run(`class ${key} ${level}`,()=>{
 const c=newCharacter();c.classes=[{name:key,level,subclass:''}];const subs=subclassesForClass(key);if(subs.length&&level>=subclassUnlockLevel(key))c.classes[0].subclass=subclassId(subs[0]);reconcileAll(c);
 ok(classPlanIssues(c).length===0,classPlanIssues(c).join(' | '));const ac=calculatedArmorClass(c);ok(Number.isFinite(ac),'AC non-finite');ok(Number.isFinite(derivedSpeed(c).walk),'speed non-finite');ok(Number.isFinite(initiativeSummary(c).bonus),'initiative non-finite');
 const slots=spellSlotSummary(c);ok(slots.standard.every(x=>x.max>=0&&x.used>=0&&x.used<=x.max),'slot bounds');if(slots.pact)ok(slots.pact.used>=0&&slots.pact.used<=slots.pact.max,'pact bounds');resourceStatus(c).forEach(x=>ok(x.used>=0&&x.used<=x.max,'resource bounds'));creationStatus(c);
});

// Every imported subclass at its unlock level and at level 20.
for(const key of core)for(const sub of subclassesForClass(key)){const id=subclassId(sub);for(const level of [...new Set([subclassUnlockLevel(key),20])])run(`subclass ${id} @${level}`,()=>{const c=newCharacter();c.classes=[{name:key,level,subclass:id}];reconcileAll(c);ok(!classPlanIssues(c).some(x=>/needs a subclass/i.test(x)),classPlanIssues(c).join(' | '));combatProfile(c,calculatedArmorClass(c));spellcastersForCharacter(c);});}

// Ordered multiclass pairs. Use 5/5 to hit subclasses, ASIs and half-caster slots.
for(const a of core)for(const b of core)if(a!==b)run(`multiclass ${a}5/${b}5`,()=>{const c=newCharacter();c.classes=[{name:a,level:5,subclass:''},{name:b,level:5,subclass:''}];for(const row of c.classes){const subs=subclassesForClass(row.name);if(subs.length)row.subclass=subclassId(subs[0]);}reconcileAll(c);spellSlotSummary(c);combatProfile(c,calculatedArmorClass(c));ok((c.classes.reduce((n,x)=>n+x.level,0))===10,'level total changed');});

// All imported races and variants must survive the complete reconcile/render data path.
for(const race of Object.keys(registries.RaceList))run(`race ${race}`,()=>{const c=newCharacter();c.race=race;reconcileAll(c);combatProfile(c,calculatedArmorClass(c));creationStatus(c);});
for(const variant of Object.keys(registries.RaceSubList))run(`race variant ${variant}`,()=>{const c=newCharacter();c.raceVariant=variant;reconcileAll(c);combatProfile(c,calculatedArmorClass(c));});

// Save/load round-trip snapshots across representative complex characters.
for(let i=0;i<100;i++)run(`roundtrip ${i}`,()=>{const a=core[i%core.length],b=core[(i*5+3)%core.length];const c=newCharacter();c.name=`Stress ${i}`;c.classes=a===b?[{name:a,level:10,subclass:''}]:[{name:a,level:6,subclass:''},{name:b,level:4,subclass:''}];for(const row of c.classes){const subs=subclassesForClass(row.name);if(subs.length&&row.level>=subclassUnlockLevel(row.name))row.subclass=subclassId(subs[0]);}c.baseAbilities={str:8+(i%13),dex:8+((i+2)%13),con:8+((i+4)%13),int:8+((i+6)%13),wis:8+((i+8)%13),cha:8+((i+10)%13)};c.abilities={...c.baseAbilities};reconcileAll(c);const loaded=normalizeCharacter(JSON.parse(JSON.stringify(c)));reconcileAll(loaded);ok(loaded.name===c.name,'name lost');ok(loaded.classes.length===c.classes.length,'classes lost');ok(Object.values(loaded.abilities).every(Number.isFinite),'ability corruption');});

console.log(`\nPRE-0.9 STRESS MATRIX: ${cases} scenarios`);
if(failures.length){console.error(`FAILED: ${failures.length}`);for(const x of failures.slice(0,50))console.error(` - ${x}`);process.exitCode=1;}else console.log(`PASS: all ${cases} stress scenarios completed without invariant failures.`);

import { registries } from './registry.js';
import { abilityMod, totalLevel } from '../rules.js';
const norm=v=>String(v??'').trim().toLowerCase();
export const HP_MODES=[['manual','Manual'],['fixed','5e Fixed Value'],['average','Mathematical Average'],['roll','Roll Hit Dice']];
export function hitDieForClass(name){ return Number(registries.ClassList[norm(name)]?.die)||0; }
function ensure(character){ character.hp ||= {}; character.hp.mode ||= 'manual'; character.hp.rolls ||= {}; if(character.hp.manualMax==null) character.hp.manualMax=Number(character.hp.max)||0; }
function rollDie(die){ if(!die)return 0; const a=new Uint32Array(1); if(globalThis.crypto?.getRandomValues){crypto.getRandomValues(a);return 1+(a[0]%die);} return 1+Math.floor(Math.random()*die); }
export function rerollHP(character){ ensure(character); character.hp.rolls={}; (character.classes||[]).forEach((c,ci)=>{const die=hitDieForClass(c.name);for(let lv=1;lv<=Number(c.level||0);lv++){if(ci===0&&lv===1)continue;character.hp.rolls[`${ci}:${lv}`]=rollDie(die);}}); return calculateHP(character); }
export function calculateHP(character){
  ensure(character); if(character.hp.mode==='manual') return Number(character.hp.manualMax ?? character.hp.max ?? 0);
  const con=abilityMod(character.abilities?.con); let base=0; let first=true;
  (character.classes||[]).forEach((c,ci)=>{const die=hitDieForClass(c.name);for(let lv=1;lv<=Number(c.level||0);lv++){
    let gain;
    if(first){gain=die;first=false;}
    else if(character.hp.mode==='fixed') gain=Math.floor(die/2)+1;
    else if(character.hp.mode==='average') gain=(die+1)/2;
    else { const k=`${ci}:${lv}`; if(!character.hp.rolls[k]) character.hp.rolls[k]=rollDie(die); gain=character.hp.rolls[k]; }
    base += Math.max(1, gain+con);
  }});
  return Math.ceil(base);
}
export function reconcileHP(character){ ensure(character); const max=calculateHP(character); character.hp.max=max; if(Number(character.hp.current)>max) character.hp.current=max; return max; }
export function hpBreakdown(character){
  ensure(character); const rows=[]; const con=abilityMod(character.abilities?.con); let first=true;
  (character.classes||[]).forEach((c,ci)=>{const die=hitDieForClass(c.name);for(let lv=1;lv<=Number(c.level||0);lv++){let raw;if(first){raw=die;first=false;}else if(character.hp.mode==='fixed')raw=Math.floor(die/2)+1;else if(character.hp.mode==='average')raw=(die+1)/2;else if(character.hp.mode==='roll')raw=character.hp.rolls[`${ci}:${lv}`]??'?';else continue;rows.push(`${registries.ClassList[norm(c.name)]?.name||c.name} ${lv}: ${raw}${con>=0?'+':''}${con} CON`);}}); return rows;
}

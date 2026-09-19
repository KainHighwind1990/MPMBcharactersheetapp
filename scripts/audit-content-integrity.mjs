import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resetRegistries,registries,registryCounts} from '../src/content/registry.js';
import {importMPMBSource} from '../src/mpmb/importer.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseSource=fs.readFileSync(path.join(root,'src/content/builtin/base/base-pdf-content.js'),'utf8');
const addonSource=fs.readFileSync(path.join(root,'src/content/builtin/all_WotC_pub+UA.min.js'),'utf8');
resetRegistries();
let base=null;
importMPMBSource(baseSource,'MPMB v13.2.3 PDF base content',{clean:false,sandboxExtras:{__MPMB_CAPTURE_BASE__:v=>{base=v;}}});
for(const [name,entries] of Object.entries(base||{})) if(registries[name]) Object.assign(registries[name],entries);
importMPMBSource(addonSource,'Built-in all_WotC_pub+UA.min.js',{clean:false});
const sourceName=d=>{const x=Array.isArray(d?.source)&&d.source[0]; const id=Array.isArray(x)?x[0]:x; return registries.SourceList[id]?.abbreviation||id||'unknown';};
const raceFields=['scores','scoresGeneric','scorestxt','skills','skillstxt','languageProfs','toolProfs','weaponProfs','armorProfs','speed','vision','savetxt','dmgres','features','spellcastingBonus','trait'];
const suspicious=[];
for(const [id,d] of Object.entries(registries.RaceList)){
  const present=raceFields.filter(k=>d?.[k]!==undefined && d[k]!==null && d[k]!=='' && (!Array.isArray(d[k])||d[k].length));
  const ability=!!(d?.scoresGeneric || (Array.isArray(d?.scores)&&d.scores.some(Number)) || String(d?.scorestxt||'').trim());
  if(!ability || present.length<4) suspicious.push({id,name:d?.name||id,source:sourceName(d),ability,present});
}
const generic=Object.entries(registries.RaceList).filter(([,d])=>d?.scoresGeneric).map(([id,d])=>({id,name:d.name,source:sourceName(d)}));
const featScoreText=Object.entries(registries.FeatsList).filter(([,d])=>String(d?.scorestxt||'').trim()).map(([id,d])=>({id,name:d.name,source:sourceName(d),scorestxt:d.scorestxt,scores:d.scores||null}));
const duplicateRaceNames=[]; const byName=new Map();
for(const [id,d] of Object.entries(registries.RaceList)){const n=String(d?.name||id).trim().toLowerCase();(byName.get(n)||byName.set(n,[]).get(n)).push({id,source:sourceName(d)});}
for(const [name,rows] of byName) if(rows.length>1) duplicateRaceNames.push({name,rows});
const report={generated:new Date().toISOString(),counts:registryCounts(),summary:{genericAbilityRaces:generic.length,racesFlaggedForReview:suspicious.length,featsWithScoreText:featScoreText.length,duplicateRaceNames:duplicateRaceNames.length},genericAbilityRaces:generic,racesFlaggedForReview:suspicious,featsWithScoreText:featScoreText,duplicateRaceNames};
const out=path.join(root,'content-integrity-audit.json'); fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2)); console.log(`Wrote ${out}`);

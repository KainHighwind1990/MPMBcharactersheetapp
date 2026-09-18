import { registries } from "./registry.js";
import { weaponEntryFromId, selectArmor, ensureSheetSections } from "./sheet-sections.js";

const norm = v => String(v ?? "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9+]+/g, " ").trim();
const qtyWords = {a:1,an:1,one:1,two:2,three:3,four:4,five:5,ten:10,twenty:20};

function titleCase(s){ return String(s||"").replace(/\b\w/g,m=>m.toUpperCase()); }

export function classStartingEquipment(classKey) {
  const cls = registries.ClassList[classKey];
  const raw = String(cls?.equipment || "");
  const groups = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*[•*-]\s*(.+?);?\s*$/);
    if (!m) continue;
    const text = m[1].replace(/;$/, "").trim();
    groups.push({ text, alternatives: text.split(/\s+-or-\s+/i).map(x=>x.trim()).filter(Boolean) });
  }
  const alt = raw.match(/Alternatively,\s*choose\s+(.+?)\s+worth of starting equipment/i)?.[1] || "";
  return { classKey, name: cls?.name || titleCase(classKey), raw, groups, alternativeWealth: alt };
}

export function backgroundStartingEquipment(backgroundKey, variantKey = "") {
  const base = registries.BackgroundList[backgroundKey] || {};
  const variant = variantKey && registries.BackgroundList[variantKey]?.baseBackground === backgroundKey ? registries.BackgroundList[variantKey] : null;
  const bg = variant ? { ...base, ...variant } : base;
  const rows = [...(bg.equipleft || []), ...(bg.equipright || [])].map((row, index) => ({
    label: String(row?.[0] || "").trim(),
    qty: Number(row?.[1]) || 1,
    weight: row?.[2] ?? "",
    index,
  })).filter(x=>x.label);
  return { backgroundKey, variantKey: variant ? variantKey : "", name:bg.name || titleCase(variantKey || backgroundKey), gold:Number(bg.gold)||0, rows };
}

function weaponRows(filter = {}) {
  return Object.entries(registries.WeaponsList).filter(([,w]) => {
    if (filter.type && norm(w?.type) !== filter.type) return false;
    if (filter.melee && norm(w?.list) !== "melee") return false;
    return true;
  }).map(([id,w])=>({id,label:w.name||titleCase(id)})).sort((a,b)=>a.label.localeCompare(b.label));
}

export function categoryPicksForAlternative(text) {
  const src = String(text||"");
  const out = [];
  const patterns = [
    { re:/\b(two)\s+martial\s+weapons?\b/i, count:2, filter:{type:"martial"}, label:"Martial weapon" },
    { re:/\b(?:a|an|any|one)\s+martial\s+melee\s+weapon\b/i, count:1, filter:{type:"martial",melee:true}, label:"Martial melee weapon" },
    { re:/\b(?:a|an|any|one)\s+martial\s+weapon\b/i, count:1, filter:{type:"martial"}, label:"Martial weapon" },
    { re:/\b(two)\s+simple\s+melee\s+weapons?\b/i, count:2, filter:{type:"simple",melee:true}, label:"Simple melee weapon" },
    { re:/\b(?:a|an|any|one)\s+simple\s+melee\s+weapon\b/i, count:1, filter:{type:"simple",melee:true}, label:"Simple melee weapon" },
    { re:/\b(?:a|an|any|one)\s+simple\s+weapon\b/i, count:1, filter:{type:"simple"}, label:"Simple weapon" },
  ];
  for (const p of patterns) {
    const m = src.match(p.re);
    if (!m) continue;
    out.push({ key:`weapon:${out.length}`, kind:"weapon", count:p.count, label:p.label, options:weaponRows(p.filter), matched:m[0] });
  }
  if (/\bany other musical instrument\b/i.test(src)) {
    const opts = Object.entries(registries.ToolsList).filter(([,t])=>/instrument/i.test(norm(t?.type)+" "+norm(t?.name))).map(([id,t])=>({id:`tool:${id}`,label:t.name||titleCase(id)})).sort((a,b)=>a.label.localeCompare(b.label));
    out.push({key:`tool:${out.length}`,kind:"tool",count:1,label:"Musical instrument",options:opts,matched:"any other musical instrument"});
  }
  return out;
}

function parseQtyBefore(text, index) {
  const before = text.slice(Math.max(0,index-20),index).toLowerCase();
  const m = before.match(/(?:^|\b)(\d+|a|an|one|two|three|four|five|ten|twenty)\s*$/i);
  if (!m) return 1;
  return Number(m[1]) || qtyWords[m[1].toLowerCase()] || 1;
}

function exactMatches(text, registry, labelKeys) {
  const source = String(text||"").toLowerCase();
  const rows = [];
  for (const [id,obj] of Object.entries(registry||{})) {
    const names = labelKeys.map(k=>obj?.[k]).filter(Boolean);
    if (registry === registries.ArmourList && obj?.invName) names.push(obj.invName);
    names.push(id);
    let best = "";
    for (const name of names) {
      const candidate = String(name).toLowerCase().replace(/\s*\([^)]*\)\s*/g," ").trim();
      if (candidate.length < 4) continue;
      const idx = source.indexOf(candidate);
      if (idx >= 0 && candidate.length > best.length) best = candidate;
    }
    if (best) rows.push({id,obj,name:best,index:source.indexOf(best),qty:parseQtyBefore(source,source.indexOf(best))});
  }
  // Prefer longest names where one registry entry's name contains another.
  return rows.filter(r=>!rows.some(other=>other!==r && other.index===r.index && other.name.length>r.name.length));
}

function findGearId(label) {
  const n = norm(label).replace(/\bwith coins\b/g,"").trim();
  let best = null;
  for (const [id,g] of Object.entries(registries.GearList)) {
    const names=[id,g?.name,g?.infoname].filter(Boolean).map(norm);
    for(const nm of names){
      const stripped=nm.replace(/\b\d+\s*(cp|sp|ep|gp|pp)\b/g,"").trim();
      if (stripped===n || stripped.startsWith(n+" ") || n.startsWith(stripped+" ")) {
        if(!best || stripped.length>best.score) best={id,score:stripped.length};
      }
    }
  }
  return best?.id || "";
}

export function previewAlternative(text) {
  const picks = categoryPicksForAlternative(text);
  let cleaned = String(text||"");
  for (const p of picks) cleaned = cleaned.replace(p.matched, " ");
  const weapons = exactMatches(cleaned, registries.WeaponsList, ["name"]);
  const armor = exactMatches(cleaned, registries.ArmourList, ["name","invName"]);
  const packs = exactMatches(cleaned, registries.PacksList, ["name"]);
  return { text, picks, weapons, armor, packs, shield:/\bshield\b/i.test(cleaned) };
}

function addInventory(character, label, qty=1, meta={}) {
  const clean=String(label||"").trim(); if(!clean) return;
  const id = meta.id || findGearId(clean);
  const key = id ? `gear:${id}` : `label:${norm(clean)}`;
  const existing = character.inventory.find(x => typeof x === "object" && (x.key===key || (id && x.id===id) || (!id && norm(x.label)===norm(clean))));
  if(existing){ existing.qty=(Number(existing.qty)||1)+(Number(qty)||1); return; }
  character.inventory.push({ id, label:clean, qty:Number(qty)||1, key, source:meta.source||"starting-equipment", kind:meta.kind||"gear" });
}

function addPack(character, packId) {
  const pack=registries.PacksList[packId];
  if(!pack) return;
  for(const row of pack.items||[]) addInventory(character,row?.[0],Number(row?.[1])||1,{source:`pack:${packId}`});
}

function findPackInText(text){
  const n=norm(text);
  for(const [id,p] of Object.entries(registries.PacksList)) {
    const base=norm(p?.name).replace(/\b\d+\s*gp\b/g,"").trim();
    if(n.includes(norm(id)+" pack") || n.includes(base)) return id;
  }
  return "";
}

function addFixedFromText(character, text) {
  let cleaned=String(text||"");
  for(const p of categoryPicksForAlternative(cleaned)) cleaned=cleaned.replace(p.matched," ");
  const packId=findPackInText(cleaned);
  if(packId){ addPack(character,packId); cleaned=cleaned.replace(new RegExp(`${packId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}['’]?s?\\s+pack`,'ig'),' '); }

  for(const r of exactMatches(cleaned,registries.WeaponsList,["name"])) {
    for(let i=0;i<r.qty;i++) character.weapons.push(weaponEntryFromId(r.id));
  }
  const armors=exactMatches(cleaned,registries.ArmourList,["name","invName"]);
  if(armors.length) selectArmor(character,armors[0].id);
  if(/\bshield\b/i.test(cleaned)) character.armor.shield=true;

  const known = [
    [/\b(\d+|ten|twenty|five|four)\s+arrows?\b/i,"Arrows"],
    [/\b(\d+|ten|twenty|five|four)\s+bolts?\b/i,"Crossbow bolts"],
    [/\b(\d+|ten|twenty|five|four)\s+darts?\b/i,"Darts"],
    [/\b(?:a\s+)?quiver(?:\s+of\s+\d+\s+arrows?)?\b/i,"Quiver"],
    [/\bcomponent pouch\b/i,"Component pouch"],
    [/\barcane focus\b/i,"Arcane focus"],
    [/\bdruidic focus\b/i,"Druidic focus"],
    [/\bholy symbol\b/i,"Holy symbol"],
    [/\bthieves['’]? tools\b/i,"Thieves' tools"],
    [/\bspellbook\b/i,"Spellbook"],
    [/\blute\b/i,"Lute"],
  ];
  for(const [re,label] of known){ const m=cleaned.match(re); if(!m)continue; let q=1; if(m[1]) q=Number(m[1])||qtyWords[String(m[1]).toLowerCase()]||1; addInventory(character,label,q); }
}

export function createStartingGearDraft(character) {
  const classKey=character.classes?.[0]?.name || "";
  const backgroundKey=character.background || "";
  const cls=classStartingEquipment(classKey);
  return {
    classKey, backgroundKey, backgroundVariant:character.backgroundVariant||"", classData:cls, backgroundData:backgroundStartingEquipment(backgroundKey, character.backgroundVariant||""),
    choices:cls.groups.map(()=>({alternative:0,picks:[]})), replaceExisting:!(character.weapons?.length||character.inventory?.length||character.armor?.selected||character.armor?.shield),
  };
}

export function applyStartingGear(character,draft) {
  ensureSheetSections(character);
  character.currency ??= {cp:0,sp:0,ep:0,gp:0,pp:0};
  if(draft.replaceExisting){
    character.weapons=[]; character.inventory=[];
    character.armor={selected:"",shield:false,misc:0,enhancement:0,name:"",baseAc:null,typeOverride:"",shieldEnhancement:0};
  }
  draft.classData.groups.forEach((group,index)=>{
    const choice=draft.choices[index]||{};
    const alt=group.alternatives[Math.max(0,Number(choice.alternative)||0)]||group.alternatives[0]||"";
    addFixedFromText(character,alt);
    const pickDefs=categoryPicksForAlternative(alt);
    let flatIndex=0;
    for(const def of pickDefs){
      for(let slot=0;slot<def.count;slot++){
        const selected=choice.picks?.[flatIndex++] || def.options?.[0]?.id || "";
        if(!selected)continue;
        if(def.kind==="weapon") character.weapons.push(weaponEntryFromId(selected));
        else if(def.kind==="tool") addInventory(character,registries.ToolsList[selected.replace(/^tool:/,"")]?.name||selected.replace(/^tool:/,""),1,{kind:"tool"});
      }
    }
  });
  for(const row of draft.backgroundData.rows) addInventory(character,row.label,row.qty,{source:`background:${draft.backgroundKey}`});
  if(draft.backgroundData.gold) character.currency.gp=(Number(character.currency.gp)||0)+draft.backgroundData.gold;
  character.startingGearApplied={classKey:draft.classKey,backgroundKey:draft.backgroundKey,at:new Date().toISOString()};
  return character;
}

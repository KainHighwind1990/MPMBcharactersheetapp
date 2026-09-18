import { registries } from './registry.js';
const norm=v=>String(v??'').trim().toLowerCase();
const display=v=>String(v??'').replace(/\b\w/g,m=>m.toUpperCase());

export function backgroundVariantsFor(backgroundKey){
  const key=norm(backgroundKey);
  return Object.entries(registries.BackgroundList)
    .filter(([id,d])=>norm(d?.baseBackground)===key)
    .map(([id,data])=>({id,data,label:data?.name||data?.mpmbKey||display(id)}))
    .sort((a,b)=>a.label.localeCompare(b.label));
}

export function resolvedBackgroundData(character){
  const baseKey=norm(character.background);
  const base=registries.BackgroundList[baseKey]||null;
  const variantKey=character.backgroundVariant||'';
  const variant=variantKey && registries.BackgroundList[variantKey] && norm(registries.BackgroundList[variantKey].baseBackground)===baseKey ? registries.BackgroundList[variantKey] : null;
  // Background variants in MPMB are partial overrides: missing properties inherit the base,
  // while explicit empty strings intentionally clear a base proficiency field.
  const effective=base ? {...base,...(variant||{})} : null;
  return {baseKey,base,variantKey:variant?variantKey:'',variant,effective};
}

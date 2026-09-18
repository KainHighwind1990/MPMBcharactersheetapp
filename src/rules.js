export const abilityOrder = ["str", "dex", "con", "int", "wis", "cha"];
export const abilityNames = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };

export function abilityMod(score) {
  return Math.floor((Number(score || 0) - 10) / 2);
}
export function formatMod(n) { return n >= 0 ? `+${n}` : `${n}`; }
export function totalLevel(character) {
  return (character.classes ?? []).reduce((sum, c) => sum + Math.max(0, Number(c.level) || 0), 0);
}
export function proficiencyBonus(character) {
  const level = Math.max(1, totalLevel(character));
  return 2 + Math.floor((level - 1) / 4);
}
export function saveBonus(character, ability) {
  const mod = abilityMod(character.abilities[ability]);
  return mod + (character.saveProficiencies.includes(ability) ? proficiencyBonus(character) : 0);
}
export function skillBonus(character, ability, skillName) {
  const mod = abilityMod(character.abilities[ability]);
  const rank = Number(character.skillProficiencies?.[skillName] ?? 0); // 0 none, 1 proficient, 2 expertise
  return mod + proficiencyBonus(character) * rank;
}
export function passivePerception(character) {
  return 10 + skillBonus(character, "wis", "Perception");
}

const STORAGE_KEY = "mpmb-web-sheet.character.v1";

export function newCharacter() {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID?.() ?? `char-${Date.now()}`,
    name: "",
    player: "",
    race: "",
    raceVariant: "",
    background: "",
    backgroundVariant: "",
    alignment: "",
    age: "",
    height: "",
    weight: "",
    eyes: "",
    hair: "",
    skin: "",
    sex: "",
    deity: "",
    classes: [{ name: "fighter", level: 1, subclass: "" }],
    baseAbilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    saveProficiencyOverrides: {},
    saveAdvantageNotes: {},
    skillProficiencies: {},
    languages: [],
    toolProficiencies: [],
    weaponProficiencies: { simple:false, martial:false, names:[] },
    armorProficiencies: { light:false, medium:false, heavy:false, shield:false },
    hp: { current: 10, max: 10, temp: 0, mode: "manual", manualMax: 10, rolls: {} },
    armorClass: 10,
    speed: 30,
    combat: { initiativeMisc: 0, speedMisc: 0, conditions: [] },
    behavior: { resources: {}, activeEntryIds: [], lifecycle: { added: [], removed: [] } },
    feats: [],
    weapons: [],
    armor: { selected: "", shield: false, misc: 0 },
    magicItems: [],
    spells: [],
    spellcasting: { casters: {}, managedSpellIds: [], slots: { standard: {}, pact: { used: 0 } } },
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    notes: "",
    contentSelections: {},
  };
}

export function loadCharacter() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeCharacter(JSON.parse(raw)) : newCharacter();
  } catch {
    return newCharacter();
  }
}

export function saveCharacter(character) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(character));
}

export function normalizeCharacter(input) {
  const base = newCharacter();
  return {
    ...base,
    ...input,
    baseAbilities: { ...base.baseAbilities, ...(input?.baseAbilities ?? input?.abilities ?? {}) },
    abilities: { ...base.abilities, ...(input?.abilities ?? input?.baseAbilities ?? {}) },
    hp: { ...base.hp, ...(input?.hp ?? {}), manualMax: input?.hp?.manualMax ?? input?.hp?.max ?? base.hp.manualMax },
    classes: Array.isArray(input?.classes) && input.classes.length ? input.classes : base.classes,
    saveProficiencies: Array.isArray(input?.saveProficiencies) ? input.saveProficiencies : [],
    saveProficiencyOverrides: input?.saveProficiencyOverrides ?? {},
    saveAdvantageNotes: input?.saveAdvantageNotes ?? {},
    skillProficiencies: input?.skillProficiencies ?? {},
    languages: Array.isArray(input?.languages) ? input.languages : [],
    toolProficiencies: Array.isArray(input?.toolProficiencies) ? input.toolProficiencies : [],
    weaponProficiencies: { ...base.weaponProficiencies, ...(input?.weaponProficiencies ?? {}) },
    armorProficiencies: { ...base.armorProficiencies, ...(input?.armorProficiencies ?? {}) },
    feats: Array.isArray(input?.feats) ? input.feats : [],
    weapons: Array.isArray(input?.weapons) ? input.weapons : [],
    armor: { ...base.armor, ...(input?.armor ?? {}) },
    combat: { ...base.combat, ...(input?.combat ?? {}), conditions: Array.isArray(input?.combat?.conditions) ? input.combat.conditions : [] },
    behavior: { ...base.behavior, ...(input?.behavior ?? {}), resources: { ...(input?.behavior?.resources ?? {}) }, activeEntryIds: Array.isArray(input?.behavior?.activeEntryIds) ? input.behavior.activeEntryIds : [], lifecycle: { ...base.behavior.lifecycle, ...(input?.behavior?.lifecycle ?? {}) } },
    magicItems: Array.isArray(input?.magicItems) ? input.magicItems : [],
    spells: Array.isArray(input?.spells) ? input.spells : [],
    spellcasting: { casters: {}, managedSpellIds: [], slots: { standard: {}, pact: { used: 0 } }, ...(input?.spellcasting ?? {}), casters: { ...(input?.spellcasting?.casters ?? {}) }, managedSpellIds: Array.isArray(input?.spellcasting?.managedSpellIds) ? input.spellcasting.managedSpellIds : [], slots: { standard: { ...(input?.spellcasting?.slots?.standard ?? {}) }, pact: { used: Number(input?.spellcasting?.slots?.pact?.used)||0 } } },
    inventory: Array.isArray(input?.inventory) ? input.inventory : [],
    currency: { ...base.currency, ...(input?.currency ?? {}) },
  };
}

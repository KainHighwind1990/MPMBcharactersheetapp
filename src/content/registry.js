export function createRegistries() {
  return {
    SourceList: {}, ClassList: {}, ClassSubList: {}, RaceList: {}, RaceSubList: {},
    FeatsList: {}, SpellsList: {}, MagicItemsList: {}, BackgroundList: {}, BackgroundSubList: {}, BackgroundFeatureList: {},
    ArmourList: {}, WeaponsList: {}, AmmoList: {}, PacksList: {}, GearList: {}, ToolsList: {},
    CreatureList: {}, CompanionList: {}, FightingStyles: {},
    WarlockInvocations: {}, GenericClassFeatures: {},
  };
}

export const registries = createRegistries();

export function resetRegistries() {
  for (const value of Object.values(registries)) {
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) delete value[key];
    }
  }
}

export function registryCounts(r = registries) {
  return Object.fromEntries(Object.entries(r).map(([key, value]) => [key, value && typeof value === "object" ? Object.keys(value).length : 0]));
}

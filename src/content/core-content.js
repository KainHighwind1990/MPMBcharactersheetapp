export const APP_VERSION = "0.9.0";
export const APP_STAGE = "Beta";

export const coreClassNames = [
  "barbarian", "bard", "cleric", "druid", "fighter", "monk",
  "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
];

export const skillMap = [
  ["Acrobatics", "dex"], ["Animal Handling", "wis"], ["Arcana", "int"],
  ["Athletics", "str"], ["Deception", "cha"], ["History", "int"],
  ["Insight", "wis"], ["Intimidation", "cha"], ["Investigation", "int"],
  ["Medicine", "wis"], ["Nature", "int"], ["Perception", "wis"],
  ["Performance", "cha"], ["Persuasion", "cha"], ["Religion", "int"],
  ["Sleight of Hand", "dex"], ["Stealth", "dex"], ["Survival", "wis"],
];

// Kept as a compatibility no-op for older local test code. From 0.3.1 onward,
// the browser baseline is extracted from the actual MPMB PDF, not hand-seeded.
export function seedCoreRegistries() {}

export function developmentStatus() {
  return [
    ["MPMB PDF base content", "Extracted + loaded", "good"],
    ["Built-in WotC + UA add-on", "Loaded additively", "good"],
    ["Duplicate protection for PDF baseline", "Working", "good"],
    ["Additional MPMB JS import", "Working", "good"],
    ["Class / multiclass selection", "Working", "good"],
    ["Level-aware subclass selection", "Working", "good"],
    ["Race / background selection", "Variants + structural choices working", "good"],
    ["Full character wizard", "End-to-end resumable creation workflow + completeness review", "good"],
    ["Multiclass planning", "Starting class distinction + 2014 ability prerequisites", "good"],
    ["Level-up workflow", "Choose class, validate multiclassing, preview unlocks, then surface new choices", "good"],
    ["Skill proficiency automation", "Fixed grants + choice pools working", "good"],
    ["Race / background / subclass features", "Displayed + required choices tracked", "good"],
    ["Class feature choices", "Single/optional/extra choices working; Eldritch Invocation slots now interactive", "good"],
    ["Feats / ASIs", "Source-managed slots + half-feat ability increases working", "good"],
    ["Weapons / armor / attacks", "Ability/proficiency/magic attack math working", "good"],
    ["Magic items", "Selection/attunement + common ability score effects working", "warn"],
    ["Equipment / gear", "Basic inventory working", "warn"],
    ["Spellcasting", "Slots, multiclass progression, Pact Magic, class/subclass/racial/feat spell sources", "good"],
    ["Behavior compatibility runtime", "Actions, usages/recovery, lifecycle tracking, extra choices, and unsupported-callback diagnostics online", "warn"],
    ["Owlbear token integration", "Scaffold only", "warn"],
  ];
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resetRegistries, registryCounts, registries } from "../src/content/registry.js";
import { importMPMBSource } from "../src/mpmb/importer.js";
import { subclassesForClass, subclassUnlockLevel, activeFeatures, backgroundOptions, classOptions } from "../src/content/queries.js";
import { skillSources, reconcileSkillProficiencies, setSkillChoice, skillTooltip } from "../src/content/skill-proficiencies.js";
import { raceVariantsFor } from "../src/content/race-variants.js";
import { expertiseSources, reconcileExpertise, setExpertiseChoice } from "../src/content/expertise.js";
import { calculateHP, reconcileHP } from "../src/content/hp.js";
import { featOptions, weaponOptions, armorOptions, magicItemOptions, spellOptions, gearOptions, weaponSummary, calculatedArmorClass, spellSummary, weaponEntryFromId, setWeaponEnhancement, syncWeaponNameEnhancement, selectArmor, setArmorEnhancement, enhancementFromName, unarmoredDefenseOptions } from "../src/content/sheet-sections.js";
import { DEFAULT_PANEL_ORDER, DEFAULT_PANEL_WIDTHS, defaultSheetLayout, normalizeSheetLayout, layoutPresetKey } from "../src/layout.js";
import { newCharacter, normalizeCharacter } from "../src/state.js";
import { classStartingEquipment, backgroundStartingEquipment, categoryPicksForAlternative, createStartingGearDraft, applyStartingGear } from "../src/content/starting-gear.js";
import { spellcastersForCharacter, createSpellWizardDraft, validSpellWizardDraft, applySpellWizard, reconcileSpellcastingState, effectiveCasterLevel, spellSlotSummary, setSpellSlotUsed, resetSpellSlots, spellcastingSummary, preparedPool, spellGrantMetadata } from "../src/content/spellcasting.js";
import { reconcileSaveProficiencies, saveAdvantageInfo } from "../src/content/save-status.js";
import { backgroundVariantsFor } from "../src/content/background-variants.js";
import { racialAbilityStatus, setRacialAbilityChoice, setRacialAbilityMode, generalProficiencyStatus, setGeneralProficiencyChoice, armorProficiencyProfile, weaponProficiencyProfile, featureChoiceSources, setFeatureChoice, setExtraFeatureChoice, improvementSources, setImprovementChoice, bonusFeatSources, setBonusFeatChoice, featEligibility, characterChoiceIssues, reconcileFeatAssignments } from "../src/content/choice-framework.js";
import { reconcileAbilityScores, featAbilityChoiceSources, setFeatAbilityChoice, resolveMagicItemData, magicItemEnhancementProfile, setRacialAbilityOverride, clearRacialAbilityOverride, setManualAbilityAdjustment } from "../src/content/ability-scores.js";
import { ORIGINAL_THEME, normalizeRgb, rgbToHex, hexToRgb, normalizeThemePrefs } from "../src/theme.js";
import { prerequisiteResult, multiclassEligibility, classPlanIssues, levelUpPreview, applyLevelUp, creationStatus } from "../src/content/character-workflow.js";
import { combatProfile, combatSaveBonus, derivedSpeed, initiativeSummary, armorStatus } from "../src/content/combat.js";
import { behaviorProfile, reconcileBehaviorState, resourceStatus, setResourceUsed, resetBehaviorResources, behaviorDiagnostics, behaviorWeaponModifiers, behaviorSpeedBonus } from "../src/content/behavior-runtime.js";
import { performRest } from "../src/content/rests.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseSource = fs.readFileSync(path.join(root, "src/content/builtin/base/base-pdf-content.js"), "utf8");
const addonSource = fs.readFileSync(path.join(root, "src/content/builtin/all_WotC_pub+UA.min.js"), "utf8");

function clone(value, seen = new WeakMap()) {
  if (value == null || typeof value !== "object") return value;
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (value instanceof Date) return new Date(value.getTime());
  if (seen.has(value)) return seen.get(value);
  const out = Array.isArray(value) ? [] : {};
  seen.set(value, out);
  for (const key of Reflect.ownKeys(value)) out[key] = clone(value[key], seen);
  return out;
}

function mergeAug(baseValue,currentValue){
  const out=clone(baseValue);
  if(!baseValue||typeof baseValue!=="object"||!currentValue||typeof currentValue!=="object") return out;
  const optional=Array.isArray(currentValue.__mpmbOptionalFeatureChoices)?currentValue.__mpmbOptionalFeatureChoices:[];
  if(optional.length){out.__mpmbOptionalFeatureChoices=clone(optional);for(const item of optional){const key=String(item?.key||item?.name||"").trim().toLowerCase();if(key&&currentValue[key]!==undefined)out[key]=clone(currentValue[key]);}}
  if(Array.isArray(currentValue.choices)){const baseChoices=Array.isArray(baseValue.choices)?baseValue.choices:[];const extras=currentValue.choices.filter(x=>!baseChoices.some(y=>String(y).trim().toLowerCase()===String(x).trim().toLowerCase()));if(extras.length){out.choices=[...baseChoices,...clone(extras)];for(const name of extras){const key=String(name).trim().toLowerCase();if(currentValue[key]!==undefined)out[key]=clone(currentValue[key]);}}}
  for(const key of Object.keys(baseValue)) if(baseValue[key]&&typeof baseValue[key]==="object"&&currentValue[key]&&typeof currentValue[key]==="object") out[key]=mergeAug(baseValue[key],currentValue[key]);
  return out;
}

resetRegistries();
let base = null;
const baseReport = importMPMBSource(baseSource, "MPMB v13.2.3 PDF base content", {
  clean: false,
  sandboxExtras: { __MPMB_CAPTURE_BASE__: value => { base = value; } },
});
if (base) {
  for (const [classKey, cls] of Object.entries(base.ClassList || {})) {
    for (const id of cls?.subclasses?.[1] || []) if (base.ClassSubList?.[id]) base.ClassSubList[id].baseClass = classKey;
  }
  for (const [id, race] of Object.entries(base.RaceSubList || {})) race.baseRace ||= id.split("-")[0];
}
const baseSnapshot = clone(base || {});
for (const [name, entries] of Object.entries(base || {})) if (registries[name]) for (const [key, value] of Object.entries(entries)) registries[name][key] = clone(value);
const baseCounts = registryCounts();
const addonReport = importMPMBSource(addonSource, "Built-in all_WotC_pub+UA.min.js", { clean: false });
for (const [name, entries] of Object.entries(baseSnapshot)) if (registries[name]) for (const [key, value] of Object.entries(entries)) registries[name][key] = registries[name][key] ? mergeAug(value, registries[name][key]) : clone(value);
const counts = registryCounts();

const checks = [];
function check(name, condition, details = "") { checks.push({ name, ok: !!condition, details }); }

// Level-indexed MPMB descriptions (e.g. levels.map(...)) represent one
// replacement description per class level, not paragraphs to concatenate.
const creationCollege = subclassesForClass("bard").find(x => /college of creation/i.test(x.label));
if (creationCollege) {
  const creationAt3 = activeFeatures({ race: "", classes: [{ name: "bard", level: 3, subclass: creationCollege.id }] }).find(x => x.name === "Performance of Creation");
  const creationAt10 = activeFeatures({ race: "", classes: [{ name: "bard", level: 10, subclass: creationCollege.id }] }).find(x => x.name === "Performance of Creation");
  const creationAt14 = activeFeatures({ race: "", classes: [{ name: "bard", level: 14, subclass: creationCollege.id }] }).find(x => x.name === "Performance of Creation");
  check("College of Creation level 3 resolves one current Performance of Creation description", /60 gp/.test(creationAt3?.description || "") && !/80 gp|100 gp|200 gp/.test(creationAt3?.description || ""), creationAt3?.description || "missing");
  check("College of Creation level 10 replaces Performance of Creation with current level text", /200 gp/.test(creationAt10?.description || "") && !/60 gp|180 gp|220 gp/.test(creationAt10?.description || ""), creationAt10?.description || "missing");
  check("College of Creation level 14 resolves Creative Crescendo-era Performance of Creation text", /Charisma mod/.test(creationAt14?.description || "") && /Huge/.test(creationAt14?.description || ""), creationAt14?.description || "missing");
}
check("PDF base extraction completes", baseReport.ok && !!base, baseReport.error || "");
check("WotC/UA add-on import completes", addonReport.ok, addonReport.error || "");
check("PDF base has 12 classes", baseCounts.ClassList === 12, String(baseCounts.ClassList));
check("PDF base has 12 subclasses", baseCounts.ClassSubList === 12, String(baseCounts.ClassSubList));
check("PDF base has 319 spells", baseCounts.SpellsList === 319, String(baseCounts.SpellsList));
check("PDF base has 239 magic items", baseCounts.MagicItemsList === 239, String(baseCounts.MagicItemsList));
check("PDF base has 14 armor entries", baseCounts.ArmourList === 14, String(baseCounts.ArmourList));
check("PDF base has 55 weapons", baseCounts.WeaponsList === 55, String(baseCounts.WeaponsList));
check("PDF base has 131 creatures", baseCounts.CreatureList === 131, String(baseCounts.CreatureList));

const requiredBaseSubs = {
  barbarian: "barbarian-berserker",
  bard: "bard-college of lore",
  cleric: "cleric-life domain",
  druid: "druid-circle of the land",
  fighter: "fighter-champion",
  monk: "monk-way of the open hand",
  paladin: "paladin-oath of devotion",
  ranger: "ranger-hunter",
  rogue: "rogue-thief",
  sorcerer: "sorcerer-draconic bloodline",
  warlock: "warlock-the fiend",
  wizard: "wizard-evocation",
};
for (const [cls, id] of Object.entries(requiredBaseSubs)) check(`Base subclass present: ${id}`, !!registries.ClassSubList[id] && registries.ClassSubList[id].baseClass === cls);

check("Champion appears for Fighter", subclassesForClass("fighter").some(s => s.id === "fighter-champion"), `${subclassesForClass("fighter").length} Fighter subclasses`);
check("Fighter subclass unlock = 3", subclassUnlockLevel("fighter") === 3, String(subclassUnlockLevel("fighter")));
check("Cleric subclass unlock = 1", subclassUnlockLevel("cleric") === 1, String(subclassUnlockLevel("cleric")));
check("Wizard subclass unlock = 2", subclassUnlockLevel("wizard") === 2, String(subclassUnlockLevel("wizard")));
const rangerSubs = subclassesForClass("ranger");
const gloom = rangerSubs.find(s => s.label === "Gloom Stalker");
const rangerish = classOptions().filter(x => /ranger/i.test(x.label));
check("Only the final 2014 Ranger is selectable", rangerish.length===1 && rangerish[0].key==="ranger" && rangerish[0].label==="Ranger", rangerish.map(x=>`${x.key}:${x.label}`).join(" | "));
check("Superseded UA Ranger classes remain out of selectable pools", !classOptions().some(x=>["rangerua","ua-playtest-ranger","spell-less ranger"].includes(x.key)));
check("Rune Scribe is identified as a prestige class", classOptions().some(x=>x.key==="rune scribe" && /Prestige Class/.test(x.label)));
const runeTooEarly={...newCharacter(),abilities:{str:10,dex:14,con:10,int:14,wis:10,cha:10},classes:[{name:"fighter",level:4,subclass:""}],skillProficiencies:{Arcana:1}};
check("Rune Scribe cannot be entered before character level 5", multiclassEligibility(runeTooEarly,"rune scribe").ok===false, JSON.stringify(multiclassEligibility(runeTooEarly,"rune scribe")));
const runeEligible={...runeTooEarly,classes:[{name:"fighter",level:5,subclass:""}]};
check("Rune Scribe mechanical entry requirements pass at level 5 with Dex/Int 13 and Arcana", multiclassEligibility(runeEligible,"rune scribe").ok===true, JSON.stringify(multiclassEligibility(runeEligible,"rune scribe")));
const runeNoArcana={...runeEligible,skillProficiencies:{}};
check("Rune Scribe requires Arcana proficiency", multiclassEligibility(runeNoArcana,"rune scribe").ok===false, JSON.stringify(multiclassEligibility(runeNoArcana,"rune scribe")));

check("Gloom Stalker add-on subclass available", !!gloom, `${rangerSubs.length} Ranger subclasses`);
check("Assassin add-on subclass available", subclassesForClass("rogue").some(s => s.label === "Assassin"));
check("Bugbear add-on race available", !!registries.RaceList.bugbear);
check("Human PDF-base race available", !!registries.RaceList.human);
const humanVariants = raceVariantsFor("human");
check("Variant Human is exposed as a Human race variant", humanVariants.some(v=>/variant/i.test(v.label)), humanVariants.map(v=>v.label).join(", "));
const variantHuman = humanVariants.find(v=>/variant/i.test(v.label));
if (variantHuman) {
  const vh = {race:"human",raceVariant:variantHuman.id,background:"",classes:[{name:"fighter",level:1,subclass:""}],contentSelections:{},skillProficiencies:{}};
  const vhSource = skillSources(vh).find(x=>x.id===`racevariant:${variantHuman.id}`);
  check("Variant Human offers one skill choice", vhSource?.choice?.count===1, JSON.stringify(vhSource?.choice));
}
check("Acolyte PDF-base background available", !!registries.BackgroundList.acolyte);
check("Longsword PDF-base weapon preserved", !!registries.WeaponsList.longsword);
check("Chain mail PDF-base armor preserved", !!registries.ArmourList["chain mail"]);
check("Misty step available after additive merge", !!registries.SpellsList["misty step"]);
check("Ioun stone available after additive merge", !!registries.MagicItemsList["ioun stone"] || Object.keys(registries.MagicItemsList).some(k => k.startsWith("ioun stone")));
if (gloom) {
  const features5 = activeFeatures({ race: "bugbear", classes: [{ name: "ranger", level: 5, subclass: gloom.id }] });
  check("Gloom 5 includes Dread Ambusher", features5.some(f => f.name === "Dread Ambusher"), features5.map(f => f.name).join(", "));
  check("Gloom 5 excludes Iron Mind", !features5.some(f => f.name === "Iron Mind"));
  const features7 = activeFeatures({ race: "bugbear", classes: [{ name: "ranger", level: 7, subclass: gloom.id }] });
  check("Gloom 7 includes Iron Mind", features7.some(f => f.name === "Iron Mind"));
}

const fighterChar = { race:"high elf", background:"acolyte", classes:[{name:"fighter",level:3,subclass:"fighter-champion"}], contentSelections:{}, skillProficiencies:{} };
let skillState = reconcileSkillProficiencies(fighterChar);
check("High Elf automatically grants Perception", fighterChar.skillProficiencies.Perception === 1);
check("Acolyte automatically grants Insight", fighterChar.skillProficiencies.Insight === 1);
check("Acolyte automatically grants Religion", fighterChar.skillProficiencies.Religion === 1);
const fighterSource = skillSources(fighterChar).find(s=>s.id.includes("class:0:fighter"));
check("Fighter offers exactly two skill choices", fighterSource?.choice?.count === 2, JSON.stringify(fighterSource?.choice));
check("Fighter choice pool includes Athletics", fighterSource?.choice?.options?.includes("Athletics"));
check("Fighter choice pool excludes Arcana", !fighterSource?.choice?.options?.includes("Arcana"));
setSkillChoice(fighterChar, fighterSource.id, 0, "Athletics");
setSkillChoice(fighterChar, fighterSource.id, 1, "Survival");
check("Chosen Fighter Athletics is applied", fighterChar.skillProficiencies.Athletics === 1);
check("Chosen Fighter Survival is applied", fighterChar.skillProficiencies.Survival === 1);
check("Skill hover text identifies automatic source", /Race: High elf/i.test(skillTooltip(fighterChar,"Perception")), skillTooltip(fighterChar,"Perception"));

const halfElfChar = { race:"half-elf", background:"", classes:[{name:"wizard",level:1,subclass:""}], contentSelections:{}, skillProficiencies:{} };
const halfElfSource = skillSources(halfElfChar).find(s=>s.id==="race:half-elf");
check("Half-Elf offers any two skills", halfElfSource?.choice?.count===2 && halfElfSource.choice.options.length===18, JSON.stringify(halfElfSource?.choice));

const multiChar = { race:"", background:"", classes:[{name:"fighter",level:3,subclass:"fighter-champion"},{name:"rogue",level:2,subclass:""}], contentSelections:{}, skillProficiencies:{} };
const rogueSecondary = skillSources(multiChar).find(s=>s.id.includes("class:1:rogue:secondary"));
check("Multiclass Rogue uses secondary one-skill choice", rogueSecondary?.choice?.count===1, JSON.stringify(rogueSecondary?.choice));

const rogueExpert = {race:"human",background:"acolyte",classes:[{name:"rogue",level:1,subclass:""}],abilities:{str:10,dex:16,con:14,int:10,wis:10,cha:10},contentSelections:{},skillProficiencies:{}};
reconcileSkillProficiencies(rogueExpert);
const rs = skillSources(rogueExpert).find(s=>s.id.includes("class:0:rogue"));
setSkillChoice(rogueExpert, rs.id, 0, "Stealth"); setSkillChoice(rogueExpert, rs.id, 1, "Acrobatics"); setSkillChoice(rogueExpert, rs.id, 2, "Deception"); setSkillChoice(rogueExpert, rs.id, 3, "Perception");
let ex = reconcileExpertise(rogueExpert);
check("Rogue 1 exposes two Expertise choices", ex[0]?.count===2, JSON.stringify(ex[0]));
setExpertiseChoice(rogueExpert, ex[0].id, 0, "Stealth"); setExpertiseChoice(rogueExpert, ex[0].id, 1, "Acrobatics");
reconcileExpertise(rogueExpert);
check("Expertise upgrades selected skill rank to 2", rogueExpert.skillProficiencies.Stealth===2 && rogueExpert.skillProficiencies.Acrobatics===2, JSON.stringify(rogueExpert.skillProficiencies));

const bard3={race:"",background:"",classes:[{name:"bard",level:3,subclass:"bard-college of lore"}],abilities:{con:10},contentSelections:{},skillProficiencies:{Acrobatics:1,Performance:1}};
check("Bard 3 exposes two Expertise choices", expertiseSources(bard3)[0]?.count===2, JSON.stringify(expertiseSources(bard3)[0]));
const bard10={...bard3,classes:[{name:"bard",level:10,subclass:"bard-college of lore"}]};
check("Bard 10 exposes four Expertise choices", expertiseSources(bard10)[0]?.count===4, JSON.stringify(expertiseSources(bard10)[0]));

const hpChar={classes:[{name:"fighter",level:3,subclass:""}],abilities:{con:14},hp:{mode:"fixed",current:1,max:1,temp:0,manualMax:1,rolls:{}}};
check("Fighter 3 fixed HP with CON 14 = 28", calculateHP(hpChar)===28, String(calculateHP(hpChar)));
hpChar.hp.mode="average"; check("Fighter 3 mathematical-average HP with CON 14 = 27", calculateHP(hpChar)===27, String(calculateHP(hpChar)));
hpChar.hp.mode="manual"; hpChar.hp.manualMax=42; reconcileHP(hpChar); check("Manual HP preserves entered maximum", hpChar.hp.max===42, String(hpChar.hp.max));

check("Feat UI has complete merged registry", featOptions().length === counts.FeatsList, String(featOptions().length));
check("Weapon UI has complete merged registry", weaponOptions().length === counts.WeaponsList, String(weaponOptions().length));
check("Armor UI has complete merged registry without duplicate base Unarmored row", armorOptions().length === counts.ArmourList - (registries.ArmourList.unarmored ? 1 : 0), String(armorOptions().length));
check("Magic item UI has complete merged registry", magicItemOptions().length === counts.MagicItemsList, String(magicItemOptions().length));
check("Spell UI has complete merged registry", spellOptions().length === counts.SpellsList, String(spellOptions().length));
check("Gear UI has complete merged registry", gearOptions().length === counts.GearList, String(gearOptions().length));
const combatChar={classes:[{name:"fighter",level:3,subclass:"fighter-champion"}],abilities:{str:16,dex:14,con:14,int:10,wis:10,cha:10},armor:{selected:"chain mail",shield:true,misc:0}};
const longSword=weaponSummary(combatChar,"longsword");
check("Longsword basic attack uses STR + proficiency", longSword?.hit===5 && longSword?.damage?.includes("1d8+3"), JSON.stringify(longSword));
check("Chain mail + shield basic AC = 18", calculatedArmorClass(combatChar)===18, String(calculatedArmorClass(combatChar)));
const plusWeapon=weaponEntryFromId("longsword");
setWeaponEnhancement(plusWeapon,1);
const plusSummary=weaponSummary(combatChar,plusWeapon);
check("+1 longsword adds +1 to hit and damage", plusSummary?.hit===6 && plusSummary?.damage?.includes("1d8+4") && plusSummary?.name.includes("+1"), JSON.stringify(plusSummary));
plusWeapon.name="Longsword +2"; syncWeaponNameEnhancement(plusWeapon);
const plusTwoSummary=weaponSummary(combatChar,plusWeapon);
check("Typing +2 in weapon name is recognized", enhancementFromName(plusWeapon.name)===2 && plusTwoSummary?.hit===7 && plusTwoSummary?.damage?.includes("1d8+5"), JSON.stringify(plusTwoSummary));
const armorChar={classes:combatChar.classes,abilities:combatChar.abilities,armor:{selected:"",shield:false,misc:0}};
selectArmor(armorChar,"chain mail"); setArmorEnhancement(armorChar,1);
check("+1 chain mail adds +1 AC", calculatedArmorClass(armorChar)===17 && armorChar.armor.name.includes("+1"), JSON.stringify(armorChar.armor));
armorChar.armor.shield=true; armorChar.armor.shieldEnhancement=2;
check("+2 shield adds its magic bonus on top of shield AC", calculatedArmorClass(armorChar)===21, String(calculatedArmorClass(armorChar)));


const defaultLayout = defaultSheetLayout();
check("Default layout contains every current top-level panel", defaultLayout.order.length===20 && DEFAULT_PANEL_ORDER.includes("creation-status") && DEFAULT_PANEL_ORDER.includes("weapons") && DEFAULT_PANEL_ORDER.includes("combat") && DEFAULT_PANEL_ORDER.includes("diagnostics"), defaultLayout.order.join(", "));
const customLayout = normalizeSheetLayout({order:["weapons","combat"],panels:{weapons:{collapsed:true,height:260,width:"half"},combat:{height:70,width:"full"}}}, DEFAULT_PANEL_ORDER);
check("Layout normalization preserves custom order", customLayout.order[0]==="weapons" && customLayout.order[1]==="combat", customLayout.order.slice(0,4).join(", "));
check("Layout normalization preserves collapsed state and valid height", customLayout.panels.weapons.collapsed===true && customLayout.panels.weapons.height===260, JSON.stringify(customLayout.panels.weapons));
check("Layout normalization rejects unusably small stored heights", customLayout.panels.combat.height===null, JSON.stringify(customLayout.panels.combat));
check("Layout normalization preserves half/full panel width", customLayout.panels.weapons.width==="half" && customLayout.panels.combat.width==="full", JSON.stringify({weapons:customLayout.panels.weapons,combat:customLayout.panels.combat}));
const fractionalLayout = normalizeSheetLayout({panels:{resources:{width:"quarter"},skills:{width:"third"}}}, DEFAULT_PANEL_ORDER);
check("Layout v2 preserves quarter/third panel widths", fractionalLayout.panels.resources.width==="quarter" && fractionalLayout.panels.skills.width==="third", JSON.stringify({resources:fractionalLayout.panels.resources,skills:fractionalLayout.panels.skills}));
check("Default layout keeps Identity full width but Feats compact", DEFAULT_PANEL_WIDTHS.identity==="full" && DEFAULT_PANEL_WIDTHS.feats==="half", JSON.stringify({identity:DEFAULT_PANEL_WIDTHS.identity,feats:DEFAULT_PANEL_WIDTHS.feats}));
const identityChar = newCharacter();
check("Character state includes roleplay identity fields", ["alignment","age","height","weight","eyes","hair","skin","sex","deity"].every(k => Object.prototype.hasOwnProperty.call(identityChar,k)), JSON.stringify(identityChar));
const migratedIdentity = normalizeCharacter({name:"Old Character",classes:[{name:"fighter",level:1,subclass:""}]});
check("Older character saves migrate roleplay identity fields", migratedIdentity.name==="Old Character" && migratedIdentity.alignment==="" && migratedIdentity.eyes==="", JSON.stringify({name:migratedIdentity.name,alignment:migratedIdentity.alignment,eyes:migratedIdentity.eyes}));
check("Layout preset 1 has an independent browser-local storage key", layoutPresetKey(1)!==layoutPresetKey(2) && /preset/.test(layoutPresetKey(1)), layoutPresetKey(1));
check("Layout preset 2 has an independent browser-local storage key", /2$/.test(layoutPresetKey(2)), layoutPresetKey(2));


const fighterGear = classStartingEquipment("fighter");
check("Fighter starting equipment exposes four choice groups", fighterGear.groups.length===4, JSON.stringify(fighterGear.groups));
check("Fighter first equipment group preserves chain mail vs leather package", fighterGear.groups[0]?.alternatives?.length===2 && /chain mail/i.test(fighterGear.groups[0].alternatives[0]) && /longbow/i.test(fighterGear.groups[0].alternatives[1]), JSON.stringify(fighterGear.groups[0]));
const martialPick = categoryPicksForAlternative(fighterGear.groups[1]?.alternatives?.[0]||"");
check("Fighter martial-weapon choice becomes a weapon dropdown", martialPick.length===1 && martialPick[0].kind==="weapon" && martialPick[0].options.some(x=>x.id==="longsword"), JSON.stringify(martialPick[0]?.options?.slice(0,5)));
const sageGear = backgroundStartingEquipment("sage");
check("Sage background equipment is read from MPMB equipleft/equipright", sageGear.rows.some(x=>/ink/i.test(x.label)) && sageGear.rows.some(x=>/common clothes/i.test(x.label)) && sageGear.gold===10, JSON.stringify(sageGear));
const wizardChar = newCharacter(); wizardChar.classes=[{name:"fighter",level:1,subclass:""}]; wizardChar.background="sage";
const wizardDraft=createStartingGearDraft(wizardChar);
wizardDraft.choices[0].alternative=1; // leather armor + longbow + arrows
wizardDraft.choices[1].alternative=0; wizardDraft.choices[1].picks=["longsword"]; // martial weapon + shield
wizardDraft.choices[2].alternative=1; // two handaxes
wizardDraft.choices[3].alternative=0; // dungeoneer's pack
applyStartingGear(wizardChar,wizardDraft);
check("Starting Gear Wizard applies selected Fighter weapons", ["longbow","longsword","handaxe","handaxe"].every((id,i)=>wizardChar.weapons[i]?.id===id), wizardChar.weapons.map(x=>x.id).join(", "));
check("Starting Gear Wizard equips selected armor and shield", wizardChar.armor.selected==="leather" && wizardChar.armor.shield===true, JSON.stringify(wizardChar.armor));
check("Starting Gear Wizard expands packs into inventory", wizardChar.inventory.some(x=>/crowbar/i.test(x.label||"")) && wizardChar.inventory.some(x=>/rope/i.test(x.label||"")), wizardChar.inventory.map(x=>x.label).join(", "));
check("Starting Gear Wizard adds Sage fixed gear and starting gold", wizardChar.inventory.some(x=>/letter from dead colleague/i.test(x.label||"")) && wizardChar.currency.gp===10, JSON.stringify({gp:wizardChar.currency.gp,items:wizardChar.inventory.map(x=>x.label)}));

// v0.3.10: weapon proficiency checkbox math, spell list guidance, and save awareness
const daggerChar={classes:[{name:"fighter",level:3,subclass:"fighter-champion"}],abilities:{str:10,dex:16,con:10,int:10,wis:10,cha:10},saveProficiencies:[]};
const dagger=weaponEntryFromId("dagger");
let daggerSummary=weaponSummary(daggerChar,dagger);
check("Dagger auto-uses better DEX and simple-weapon proficiency", daggerSummary.ability==="dex" && daggerSummary.proficient===true && daggerSummary.hit===5 && daggerSummary.damage.includes("1d4+3"), JSON.stringify(daggerSummary));
dagger.proficientOverride=false; daggerSummary=weaponSummary(daggerChar,dagger);
check("Manual proficiency checkbox override removes proficiency from attack only", daggerSummary.hit===3 && daggerSummary.damage.includes("1d4+3"), JSON.stringify(daggerSummary));

const wiz1=newCharacter(); wiz1.classes=[{name:"wizard",level:1,subclass:""}]; wiz1.abilities.int=16;
const wizCaster=spellcastersForCharacter(wiz1)[0];
check("Wizard 1 spell wizard requires 3 cantrips and 6 spellbook spells", wizCaster?.cantripCount===3 && wizCaster?.spellCount===6 && wizCaster?.typeSp==="book", JSON.stringify({cantrips:wizCaster?.cantripCount,spells:wizCaster?.spellCount,type:wizCaster?.typeSp}));
check("Wizard 1 spell choices are restricted to wizard level-1 spells", wizCaster?.maxSpell===1 && wizCaster.spells.every(x=>(registries.SpellsList[x.id]?.classes||[]).includes("wizard") && x.level===1), JSON.stringify(wizCaster?.spells?.slice(0,5)));
check("Wizard prepared count uses INT modifier + wizard level", wizCaster?.preparedCount===4, String(wizCaster?.preparedCount));
const cleric1=newCharacter(); cleric1.classes=[{name:"cleric",level:1,subclass:"cleric-life domain"}]; cleric1.abilities.wis=16;
const clericCaster=spellcastersForCharacter(cleric1)[0];
check("Cleric uses full-list prepared casting instead of known-spell picks", clericCaster?.typeSp==="list" && clericCaster?.spellCount===0 && clericCaster?.preparedCount===4, JSON.stringify({type:clericCaster?.typeSp,spells:clericCaster?.spellCount,prepared:clericCaster?.preparedCount}));
check("Life Domain level 1 automatically marks only currently available domain spells prepared", clericCaster?.autoPrepared.includes("bless") && clericCaster?.autoPrepared.includes("cure wounds") && !clericCaster?.autoPrepared.includes("lesser restoration"), JSON.stringify(clericCaster?.autoPrepared));
const dsId=Object.keys(registries.ClassSubList).find(k=>/divine soul/i.test(k));
if(dsId){ const ds=newCharacter(); ds.classes=[{name:"sorcerer",level:3,subclass:dsId}]; const dsc=spellcastersForCharacter(ds)[0]; check("Divine Soul expands Sorcerer spell access to Cleric list", dsc?.spells.some(x=>x.id==="cure wounds") && dsc?.spells.some(x=>x.id==="magic missile"), JSON.stringify(dsc?.list)); }
const atId=Object.keys(registries.ClassSubList).find(k=>/arcane trickster/i.test(k));
const arcanaId=Object.keys(registries.ClassSubList).find(k=>/arcana domain/i.test(k));
if(arcanaId){ const ac=newCharacter(); ac.classes=[{name:"cleric",level:5,subclass:arcanaId}]; ac.abilities.wis=16; const acc=spellcastersForCharacter(ac)[0]; const arcaneInit=acc?.bonusChoices?.find(b=>/arcane initiate/i.test(b.name)); check("Arcana Domain Arcane Initiate exposes two Wizard cantrip choices", arcaneInit?.count===2 && arcaneInit.options.length>0 && arcaneInit.options.every(x=>x.level===0 && (registries.SpellsList[x.id]?.classes||[]).includes("wizard")), JSON.stringify(arcaneInit&&{count:arcaneInit.count,options:arcaneInit.options.slice(0,8)})); }

if(atId){ const at=newCharacter(); at.classes=[{name:"rogue",level:3,subclass:atId}]; at.abilities.int=16; const atc=spellcastersForCharacter(at)[0]; check("Arcane Trickster handles fixed Mage Hand plus any-school bonus pick separately", atc?.autoSpells.includes("mage hand") && atc?.bonusChoices?.some(b=>b.options.some(x=>x.id==="magic missile")), JSON.stringify({auto:atc?.autoSpells,bonus:atc?.bonusChoices?.map(x=>({name:x.name,count:x.count,options:x.options.length}))})); }
const gloom7={...newCharacter(),classes:[{name:"ranger",level:7,subclass:gloom?.id||""}]}; reconcileSaveProficiencies(gloom7);
check("Subclass-granted saving throw proficiency is applied automatically", gloom7.saveProficiencies.includes("wis"), JSON.stringify(gloom7.saveProficiencies));
const holy={...newCharacter(),classes:[{name:"paladin",level:10,subclass:"paladin-oath of devotion"}],magicItems:[{id:"holy avenger",attuned:true}]}; reconcileSaveProficiencies(holy);
check("Holy Avenger marks saving throw advantage conditions", saveAdvantageInfo(holy,"dex").some(x=>/spells/i.test(x.condition)&&/magical effects/i.test(x.condition)), JSON.stringify(saveAdvantageInfo(holy,"dex")));
const spellDraft=createSpellWizardDraft(wiz1);
if(spellDraft[0]){ const c=spellDraft[0]; c.selections.cantrips=c.cantrips.slice(0,c.cantripCount).map(x=>x.id); c.selections.spells=c.spells.slice(0,c.spellCount).map(x=>x.id); c.selections.prepared=[]; check("Wizard daily preparation is optional during creation", validSpellWizardDraft(spellDraft).length===0, validSpellWizardDraft(spellDraft).join(" | ")); const bookSet=new Set(c.selections.spells); c.selections.prepared=c.spells.filter(x=>bookSet.has(x.id)).slice(0,c.preparedCount).map(x=>x.id); check("Complete Wizard spell draft validates", validSpellWizardDraft(spellDraft).length===0, validSpellWizardDraft(spellDraft).join(" | ")); applySpellWizard(wiz1,spellDraft); check("Applying spell wizard writes selected spells to character", c.selections.cantrips.every(id=>wiz1.spells.includes(id)) && c.selections.spells.every(id=>wiz1.spells.includes(id)), JSON.stringify(wiz1.spellcasting)); }

// v0.3.11: spell action economy, components, and description modes
const healingWordSummary=spellSummary("healing word");
check("Healing Word exposes Bonus Action casting economy", healingWordSummary?.castingTime==="Bonus Action", JSON.stringify(healingWordSummary));
const shieldSummary=spellSummary("shield");
check("Shield exposes Reaction casting economy and full trigger text", /^Reaction/i.test(shieldSummary?.castingTime||"") && /hit by an attack/i.test(shieldSummary?.castingTime||""), JSON.stringify(shieldSummary));
const fireballSummary=spellSummary("fireball");
check("Fireball exposes components and material component text", fireballSummary?.components==="V,S,M" && /bat guana and sulfur/i.test(fireballSummary?.material||""), JSON.stringify(fireballSummary));
check("Fireball exposes saving throw metadata", fireballSummary?.save==="Dex", JSON.stringify(fireballSummary));
check("Spell summaries retain distinct concise and full descriptions", fireballSummary?.description && fireballSummary?.descriptionFull && fireballSummary.descriptionFull.length>fireballSummary.description.length, JSON.stringify({short:fireballSummary?.description?.length,long:fireballSummary?.descriptionFull?.length}));


// v0.4.0 character-choice framework
check("Background dropdown excludes AddBackgroundVariant child records", !backgroundOptions().some(x=>x.key==="soldier-city watch"), backgroundOptions().filter(x=>/city watch/i.test(x.label)).map(x=>x.key).join(", "));
const soldierVariants=backgroundVariantsFor("soldier");
check("Soldier exposes City Watch as a background variant", soldierVariants.some(x=>x.id==="soldier-city watch"), soldierVariants.map(x=>x.label).join(", "));
const cityWatch={...newCharacter(),race:"human",background:"soldier",backgroundVariant:"soldier-city watch",classes:[{name:"fighter",level:1,subclass:""}],contentSelections:{},skillProficiencies:{}};
const citySkill=skillSources(cityWatch).find(x=>x.id==="background:soldier-city watch");
check("Background variant overrides its base skill package", citySkill?.fixed?.includes("Insight") && !citySkill?.fixed?.includes("Intimidation"), JSON.stringify(citySkill));
const cityProf=generalProficiencyStatus(cityWatch);
check("Background variant can explicitly clear inherited tool proficiencies", !cityProf.state.tools.length && !cityProf.rows.some(x=>/background/i.test(x.label)&&x.type==="tool"), JSON.stringify({tools:cityProf.state.tools,rows:cityProf.rows}));

const vhChoice={...newCharacter(),race:"human",raceVariant:variantHuman?.id||"human-variant",background:"",classes:[{name:"fighter",level:1,subclass:""}],contentSelections:{},skillProficiencies:{}};
let vhAbility=racialAbilityStatus(vhChoice);
check("Variant Human exposes two +1 racial ability choices", vhAbility.groups.length===1 && vhAbility.groups[0].group.count===2 && vhAbility.groups[0].group.amount===1, JSON.stringify(vhAbility.groups));
setRacialAbilityChoice(vhChoice,0,"str"); setRacialAbilityChoice(vhChoice,1,"dex"); vhAbility=racialAbilityStatus(vhChoice);
check("Variant Human racial ability choices persist structurally", vhAbility.missing===0 && vhAbility.groups[0].selected.join(",")==="str,dex", JSON.stringify(vhAbility.groups[0].selected));
const vhBonus=bonusFeatSources(vhChoice);
check("Variant Human creates one bonus-feat choice source", vhBonus.length===1, JSON.stringify(vhBonus));
setBonusFeatChoice(vhChoice,vhBonus[0]?.id,"grappler");
check("Variant Human bonus feat is stored by source", bonusFeatSources(vhChoice)[0]?.selected==="grappler", JSON.stringify(vhChoice.contentSelections?.bonusFeatChoices));

const acolyteChoice={...newCharacter(),race:"high elf",background:"acolyte",classes:[{name:"fighter",level:1,subclass:""}],contentSelections:{},skillProficiencies:{}};
let acProf=generalProficiencyStatus(acolyteChoice);
const acLang=acProf.rows.find(x=>x.type==="language" && /Acolyte/i.test(x.label));
check("Acolyte exposes two language choices", acLang?.choice?.count===2, JSON.stringify(acLang));
if(acLang){setGeneralProficiencyChoice(acolyteChoice,acLang.id,0,"Dwarvish");setGeneralProficiencyChoice(acolyteChoice,acLang.id,1,"Goblin");}
acProf=generalProficiencyStatus(acolyteChoice);
check("Language choices apply alongside automatic racial languages", ["Common","Elvish","Dwarvish","Goblin"].every(x=>acProf.state.languages.includes(x)), JSON.stringify(acProf.state.languages));
const dwarfChoice={...newCharacter(),race:"mountain dwarf",background:"",classes:[{name:"fighter",level:1,subclass:""}],contentSelections:{},skillProficiencies:{}};
const dwarfProf=generalProficiencyStatus(dwarfChoice); const dwarfTool=dwarfProf.rows.find(x=>x.type==="tool"&&/Mountain dwarf/i.test(x.label));
check("Mountain Dwarf tool choice resolves to concrete smith/brewer/mason options", dwarfTool?.choice?.count===1 && dwarfTool.choice.options.some(x=>/Smith/i.test(x.label)) && dwarfTool.choice.options.some(x=>/Brewer/i.test(x.label)) && dwarfTool.choice.options.some(x=>/Mason/i.test(x.label)), JSON.stringify(dwarfTool?.choice));
const fighterArmor=armorProficiencyProfile({classes:[{name:"fighter",level:1,subclass:""}]});
check("Starting Fighter armor proficiencies include light/medium/heavy/shield", fighterArmor.light&&fighterArmor.medium&&fighterArmor.heavy&&fighterArmor.shield, JSON.stringify(fighterArmor));
const rogueMultiWeapons=weaponProficiencyProfile({classes:[{name:"fighter",level:1,subclass:""},{name:"rogue",level:1,subclass:""}]});
check("Multiclass proficiency resolver does not incorrectly fall back to Rogue primary weapon package", rogueMultiWeapons.simple&&rogueMultiWeapons.martial, JSON.stringify(rogueMultiWeapons));
const bardPrimary={...newCharacter(),classes:[{name:"bard",level:1,subclass:""}],contentSelections:{}}; const bardTools=generalProficiencyStatus(bardPrimary).rows.find(x=>x.type==="tool");
check("Starting Bard exposes three musical instrument tool choices", bardTools?.choice?.count===3, JSON.stringify(bardTools));

const hunter3={...newCharacter(),classes:[{name:"ranger",level:3,subclass:"ranger-hunter"}],contentSelections:{}};
let hunterChoices=featureChoiceSources(hunter3); const prey=hunterChoices.find(x=>/Hunter's Prey/i.test(x.label));
check("Hunter 3 exposes Hunter's Prey as a required feature choice", !!prey && !prey.optional && prey.choices.includes("Colossus Slayer"), JSON.stringify(prey));
if(prey)setFeatureChoice(hunter3,prey.id,"Colossus Slayer");
check("Feature choice selection is stored in browser-native character state", featureChoiceSources(hunter3).find(x=>x.id===prey?.id)?.selected==="Colossus Slayer", JSON.stringify(hunter3.contentSelections?.featureChoices));
const totem3={...newCharacter(),classes:[{name:"barbarian",level:3,subclass:"barbarian-totem warrior"}],contentSelections:{}}; const totemChoice=featureChoiceSources(totem3).find(x=>/Totem Spirit/i.test(x.label));
check("AddFeatureChoice extends native choices (SCAG Elk/Tiger)", totemChoice?.choices?.some(x=>/^Elk$/i.test(x)) && totemChoice?.choices?.some(x=>/^Tiger$/i.test(x)), JSON.stringify(totemChoice?.choices));
const wizardOptional={...newCharacter(),classes:[{name:"wizard",level:1,subclass:""}],contentSelections:{}}; const optDun=featureChoiceSources(wizardOptional).find(x=>x.kind==="optional-group" && x.items?.some(c=>/Dunamancy/i.test(c.name)));
check("Optional AddFeatureChoice registrations have browser-native optional state", !!optDun, JSON.stringify(optDun));

const fighter4={...newCharacter(),classes:[{name:"fighter",level:4,subclass:"fighter-champion"}],abilities:{str:16,dex:12,con:14,int:10,wis:10,cha:10},contentSelections:{}}; const asi=improvementSources(fighter4);
check("Fighter 4 exposes one ASI/feat improvement slot", asi.length===1, JSON.stringify(asi));
check("Grappler prerequisite evaluates true with Strength 16", featEligibility(fighter4,"grappler").eligible===true, JSON.stringify(featEligibility(fighter4,"grappler")));
fighter4.abilities.str=12;
check("Grappler prerequisite evaluates false below Strength 13", featEligibility(fighter4,"grappler").eligible===false, JSON.stringify(featEligibility(fighter4,"grappler")));
const plainFighter={...newCharacter(),classes:[{name:"fighter",level:4,subclass:"fighter-champion"}],abilities:{str:16,dex:16,con:14,int:10,wis:10,cha:10},contentSelections:{}};
check("War Caster prerequisite rejects non-spellcasting Fighter", featEligibility(plainFighter,"war caster").eligible===false, JSON.stringify(featEligibility(plainFighter,"war caster")));
const incompleteIssues=characterChoiceIssues(vhChoice);
check("Choice framework reports unresolved required choices", incompleteIssues.some(x=>/language|improvement|feature|ability/i.test(x)) || incompleteIssues.length>0, JSON.stringify(incompleteIssues));
check("Active feature list includes selected background feature", activeFeatures({...newCharacter(),background:"acolyte"}).some(x=>x.name==="Shelter of the Faithful"), activeFeatures({...newCharacter(),background:"acolyte"}).map(x=>x.name).join(", "));
const bladeWarlock={...newCharacter(),classes:[{name:"warlock",level:3,subclass:""}],contentSelections:{}};
const pactBoonChoice=featureChoiceSources(bladeWarlock).find(x=>/Pact Boon/i.test(x.label));
check("Warlock 3 exposes Pact Boon choice", !!pactBoonChoice && pactBoonChoice.choices.some(x=>/Pact of the Blade/i.test(x)), JSON.stringify(pactBoonChoice));
if(pactBoonChoice)setFeatureChoice(bladeWarlock,pactBoonChoice.id,"Pact of the Blade");
const pactBoonFeature=activeFeatures(bladeWarlock).find(x=>x.name==="Pact Boon");
check("Active feature shows selected Pact Boon name", pactBoonFeature?.choice?.name==="Pact of the Blade", JSON.stringify(pactBoonFeature));
check("Active feature shows selected Pact Boon description", /pact weapon/i.test(pactBoonFeature?.choice?.description||""), JSON.stringify(pactBoonFeature));


// v0.4.1: visible language/tool choices, feat-slot adoption, and derived ability scores
const humanBard4={...newCharacter(),race:"human",raceVariant:variantHuman?.id||"human-variant",classes:[{name:"bard",level:4,subclass:"bard-college of lore"}],baseAbilities:{str:10,dex:15,con:14,int:10,wis:10,cha:15},abilities:{str:10,dex:15,con:14,int:10,wis:10,cha:15},feats:["actor","alert"],contentSelections:{},skillProficiencies:{}};
let hbProf=generalProficiencyStatus(humanBard4);
check("Variant Human exposes its extra language as an explicit choice", hbProf.rows.some(x=>x.type==="language"&&x.choice?.count===1), JSON.stringify(hbProf.rows.filter(x=>x.type==="language")));
check("Bard exposes its three instrument choices in the general proficiency framework", hbProf.rows.some(x=>x.type==="tool"&&x.choice?.count===3), JSON.stringify(hbProf.rows.filter(x=>x.type==="tool")));
const adopt=reconcileFeatAssignments(humanBard4);
check("Existing feats are adopted into Variant Human + Bard 4 feat-granting slots", adopt.assigned.length===2 && bonusFeatSources(humanBard4)[0]?.selected && improvementSources(humanBard4)[0]?.value?.mode==="feat", JSON.stringify({assigned:adopt.assigned,bonus:bonusFeatSources(humanBard4),asi:improvementSources(humanBard4),manual:humanBard4.feats}));
check("Claimed source-managed feats are removed from the free manual feat bucket", humanBard4.feats.length===0, JSON.stringify(humanBard4.feats));

const racialScores={...newCharacter(),race:"human",raceVariant:variantHuman?.id||"human-variant",classes:[{name:"fighter",level:1,subclass:""}],baseAbilities:{str:15,dex:15,con:14,int:10,wis:10,cha:8},abilities:{str:15,dex:15,con:14,int:10,wis:10,cha:8},contentSelections:{}};
setRacialAbilityChoice(racialScores,0,"str"); setRacialAbilityChoice(racialScores,1,"dex"); reconcileAbilityScores(racialScores);
check("Variant Human racial choices alter derived ability scores", racialScores.abilities.str===16 && racialScores.abilities.dex===16, JSON.stringify(racialScores.abilities));

const asiScores={...newCharacter(),classes:[{name:"bard",level:4,subclass:"bard-college of lore"}],baseAbilities:{str:8,dex:14,con:14,int:10,wis:10,cha:15},abilities:{str:8,dex:14,con:14,int:10,wis:10,cha:15},contentSelections:{}};
const bardAsi=improvementSources(asiScores)[0]; setImprovementChoice(asiScores,bardAsi.id,{mode:"+2",ability1:"cha",ability2:"",feat:""}); reconcileAbilityScores(asiScores);
check("Class ASI choices alter derived ability scores", asiScores.abilities.cha===17, JSON.stringify(asiScores.abilities));
setImprovementChoice(asiScores,bardAsi.id,{mode:"+2",ability1:"dex"}); reconcileAbilityScores(asiScores);
check("Changing an ASI later removes the old bonus and applies the new one", asiScores.abilities.cha===15 && asiScores.abilities.dex===16, JSON.stringify(asiScores.abilities));

const halfFeatScores={...newCharacter(),classes:[{name:"fighter",level:1,subclass:""}],baseAbilities:{str:15,dex:14,con:14,int:10,wis:10,cha:10},abilities:{str:15,dex:14,con:14,int:10,wis:10,cha:10},feats:["athlete"],contentSelections:{}};
let halfRows=featAbilityChoiceSources(halfFeatScores);
check("Half-feat scorestxt creates an explicit ability choice", halfRows.length===1 && halfRows[0].options.includes("str") && halfRows[0].options.includes("dex"), JSON.stringify(halfRows));
if(halfRows[0]) setFeatAbilityChoice(halfFeatScores,halfRows[0].id,"str"); reconcileAbilityScores(halfFeatScores);
check("Half-feat ability choice applies its +1", halfFeatScores.abilities.str===16, JSON.stringify(halfFeatScores.abilities));

const fixedFeatScores={...newCharacter(),classes:[{name:"fighter",level:1,subclass:""}],baseAbilities:{str:10,dex:10,con:10,int:10,wis:10,cha:15},abilities:{str:10,dex:10,con:10,int:10,wis:10,cha:15},feats:["actor"],contentSelections:{}}; reconcileAbilityScores(fixedFeatScores);
check("Fixed half-feat scores arrays apply automatically", fixedFeatScores.abilities.cha===16, JSON.stringify(fixedFeatScores.abilities));
const rebornScores={...newCharacter(),race:"reborn",classes:[{name:"fighter",level:1,subclass:""}],baseAbilities:{str:10,dex:10,con:10,int:10,wis:10,cha:10},abilities:{str:10,dex:10,con:10,int:10,wis:10,cha:10},contentSelections:{}};
let rebornAbility=racialAbilityStatus(rebornScores);
check("scoresGeneric races expose +2/+1 flexible racial choices", rebornAbility.rule.generic===true && rebornAbility.groups.length===2 && rebornAbility.missing===2, JSON.stringify(rebornAbility));
setRacialAbilityChoice(rebornScores,0,"con"); setRacialAbilityChoice(rebornScores,1,"wis"); reconcileAbilityScores(rebornScores);
check("Reborn flexible racial choices apply +2/+1", rebornScores.abilities.con===12 && rebornScores.abilities.wis===11, JSON.stringify(rebornScores.abilities));
setRacialAbilityMode(rebornScores,"+1/+1/+1"); setRacialAbilityChoice(rebornScores,0,"dex"); setRacialAbilityChoice(rebornScores,1,"con"); setRacialAbilityChoice(rebornScores,2,"wis"); reconcileAbilityScores(rebornScores);
check("scoresGeneric races support three +1 choices", rebornScores.abilities.dex===11 && rebornScores.abilities.con===11 && rebornScores.abilities.wis===11, JSON.stringify(rebornScores.abilities));
setRacialAbilityOverride(rebornScores,"dex",2); setManualAbilityAdjustment(rebornScores,"str",1);
check("Manual racial override and Other ability adjustment are applied", rebornScores.abilities.dex===12 && rebornScores.abilities.str===11, JSON.stringify(rebornScores.abilities));
clearRacialAbilityOverride(rebornScores,"dex");
check("Clearing racial override restores automatic racial choice", rebornScores.abilities.dex===11, JSON.stringify(rebornScores.abilities));

const itemScores={...newCharacter(),classes:[{name:"fighter",level:1,subclass:""}],baseAbilities:{str:10,dex:10,con:10,int:10,wis:10,cha:10},abilities:{str:10,dex:10,con:10,int:10,wis:10,cha:10},magicItems:[{id:"gauntlets of ogre power",attuned:true,choice:""}],contentSelections:{}}; reconcileAbilityScores(itemScores);
check("Attuned magic-item score override updates the derived score", itemScores.abilities.str===19, JSON.stringify(itemScores.abilities));
itemScores.magicItems[0].attuned=false; reconcileAbilityScores(itemScores);
check("Removing attunement removes the magic-item score override", itemScores.abilities.str===10, JSON.stringify(itemScores.abilities));
itemScores.magicItems=[{id:"belt of giant strength",attuned:true,choice:"Hill (Str 21, rare)"}]; reconcileAbilityScores(itemScores);
check("Magic-item option choices drive option-specific ability overrides", itemScores.abilities.str===21 && resolveMagicItemData(itemScores.magicItems[0]).choice, JSON.stringify({scores:itemScores.abilities,item:resolveMagicItemData(itemScores.magicItems[0]).data?.name}));

// v0.4.2: theme preference primitives and visible Character Choices navigation
check("Original theme page color is the current page background", rgbToHex(ORIGINAL_THEME.page)==="#111318", rgbToHex(ORIGINAL_THEME.page));
check("Original theme panel color is the current box background", rgbToHex(ORIGINAL_THEME.panel)==="#1a1e25", rgbToHex(ORIGINAL_THEME.panel));
check("RGB values clamp safely into 0-255", JSON.stringify(normalizeRgb({r:-20,g:128.4,b:400}))===JSON.stringify({r:0,g:128,b:255}), JSON.stringify(normalizeRgb({r:-20,g:128.4,b:400})));
check("RGB converts to hex", rgbToHex({r:12,g:34,b:56})==="#0c2238", rgbToHex({r:12,g:34,b:56}));
check("Hex converts to RGB", JSON.stringify(hexToRgb("#0c2238"))===JSON.stringify({r:12,g:34,b:56}), JSON.stringify(hexToRgb("#0c2238")));
const themeNormalized=normalizeThemePrefs({page:{r:1,g:2,b:3},panel:{r:4,g:5,b:6},overrides:{feats:{r:7,g:8,b:9}}});
check("Theme preferences retain page and overall box colors", rgbToHex(themeNormalized.page)==="#010203" && rgbToHex(themeNormalized.panel)==="#040506", JSON.stringify(themeNormalized));
check("Theme preferences retain per-panel overrides", rgbToHex(themeNormalized.overrides.feats)==="#070809", JSON.stringify(themeNormalized.overrides));
check("Creation Status and Character Choices lead the default workflow", DEFAULT_PANEL_ORDER[0]==="identity" && DEFAULT_PANEL_ORDER[1]==="creation-status" && DEFAULT_PANEL_ORDER[2]==="choices", DEFAULT_PANEL_ORDER.slice(0,4).join(", "));


// v0.4.3: end-to-end character workflow, multiclass validation, level-up, and cleanup
const prereqAnd=prerequisiteResult("Strength 13 and Charisma 13",{str:13,cha:12});
check("Multiclass prerequisite parser honors AND", prereqAnd.ok===false && prereqAnd.requirements.length===2, JSON.stringify(prereqAnd));
const prereqOr=prerequisiteResult("Strength 13 or Dexterity 13",{str:10,dex:14});
check("Multiclass prerequisite parser honors OR", prereqOr.ok===true, JSON.stringify(prereqOr));
const legalMulti={...newCharacter(),classes:[{name:"fighter",level:4,subclass:"fighter-champion"}],baseAbilities:{str:13,dex:10,con:14,int:10,wis:10,cha:13},abilities:{str:13,dex:10,con:14,int:10,wis:10,cha:13},contentSelections:{}};
check("Adding Bard validates both existing Fighter and new Bard prerequisites", multiclassEligibility(legalMulti,"bard").ok===true, JSON.stringify(multiclassEligibility(legalMulti,"bard")));
legalMulti.abilities.str=12;
check("Multiclass blocks when the existing class prerequisite is no longer met", multiclassEligibility(legalMulti,"bard").ok===false, JSON.stringify(multiclassEligibility(legalMulti,"bard")));
const invalidPlan={...newCharacter(),classes:[{name:"fighter",level:4,subclass:"fighter-champion"},{name:"bard",level:1,subclass:""}],abilities:{str:12,dex:10,con:14,int:10,wis:10,cha:13}};
check("Class plan reports failed multiclass prerequisites", classPlanIssues(invalidPlan).some(x=>/Fighter requires Strength 13 or Dexterity 13/i.test(x)), JSON.stringify(classPlanIssues(invalidPlan)));
const bardLevel={...newCharacter(),classes:[{name:"bard",level:3,subclass:"bard-college of lore"}],baseAbilities:{str:8,dex:14,con:14,int:10,wis:10,cha:16},abilities:{str:8,dex:14,con:14,int:10,wis:10,cha:16},contentSelections:{},skillProficiencies:{}};
const bardPreview=levelUpPreview(bardLevel,"bard");
check("Level-up preview detects Bard 4 ASI/feat slot", bardPreview.ok && bardPreview.newLevel===4 && bardPreview.asiGained===1, JSON.stringify(bardPreview));
applyLevelUp(bardLevel,"bard");
check("Level-up applies exactly one class level", bardLevel.classes[0].level===4, JSON.stringify(bardLevel.classes));
check("Creation Status catches the newly unlocked Bard 4 improvement", creationStatus(bardLevel).items.find(x=>x.id==="choices")?.problems.some(x=>/improvement/i.test(x)), JSON.stringify(creationStatus(bardLevel)));
const wizardManaged={...newCharacter(),classes:[{name:"wizard",level:1,subclass:""}],spellcasting:{casters:{},managedSpellIds:[]},spells:[]};
const wd=createSpellWizardDraft(wizardManaged); if(wd[0]){wd[0].selections.cantrips=wd[0].cantrips.slice(0,wd[0].cantripCount).map(x=>x.id);wd[0].selections.spells=wd[0].spells.slice(0,wd[0].spellCount).map(x=>x.id);wd[0].selections.prepared=wd[0].selections.spells.slice(0,Math.min(wd[0].preparedCount,wd[0].selections.spells.length));applySpellWizard(wizardManaged,wd);}
const oldManagedCount=wizardManaged.spellcasting.managedSpellIds.length; wizardManaged.classes=[{name:"fighter",level:1,subclass:""}]; reconcileSpellcastingState(wizardManaged);
check("Changing away from a spellcasting class removes stale managed spells", oldManagedCount>0 && wizardManaged.spellcasting.managedSpellIds.length===0 && wizardManaged.spells.length===0, JSON.stringify({oldManagedCount,spells:wizardManaged.spells,state:wizardManaged.spellcasting}));


// v0.6.0: rules-driven combat math core
const defenseFighter={...newCharacter(),race:"human",classes:[{name:"fighter",level:3,subclass:"fighter-champion"}],baseAbilities:{str:16,dex:14,con:14,int:10,wis:10,cha:10},abilities:{str:16,dex:14,con:14,int:10,wis:10,cha:10},armor:{selected:"chain mail",shield:true,misc:0,enhancement:0,name:"Chain mail",baseAc:16,typeOverride:"heavy",shieldEnhancement:0},armorProficiencies:{light:true,medium:true,heavy:true,shield:true},contentSelections:{featureChoices:{"class:0:fighter:fighting style":"Defense"}},combat:{initiativeMisc:0,speedMisc:0,conditions:[]}};
const defenseCombat=combatProfile(defenseFighter,calculatedArmorClass(defenseFighter));
check("Defense Fighting Style adds +1 AC while armored", defenseCombat.ac.ac===19, JSON.stringify(defenseCombat.ac));
const archeryFighter={...defenseFighter,armor:{selected:"",shield:false,misc:0},contentSelections:{featureChoices:{"class:0:fighter:fighting style":"Archery"}}};
const longbow=weaponSummary(archeryFighter,"longbow");
check("Archery Fighting Style adds +2 to ranged weapon attacks", longbow?.hit===6 && longbow?.styleNotes?.some(x=>/Archery/i.test(x)), JSON.stringify(longbow));
const duelingFighter={...defenseFighter,contentSelections:{featureChoices:{"class:0:fighter:fighting style":"Dueling"}}};
const duelSword=weaponEntryFromId("longsword"); duelSword.wielding="main-hand"; const duelSummary=weaponSummary(duelingFighter,duelSword);
check("Dueling Fighting Style adds +2 one-handed melee damage", duelSummary?.damageBonus===5, JSON.stringify(duelSummary));
const offhandFighter={...defenseFighter,contentSelections:{featureChoices:{}}}; const offhand=weaponEntryFromId("shortsword"); offhand.wielding="off-hand"; const offSummary=weaponSummary(offhandFighter,offhand);
check("Off-hand attack omits ability damage without Two-Weapon Fighting style", offSummary?.damageBonus===0, JSON.stringify(offSummary));
const twfFighter={...defenseFighter,contentSelections:{featureChoices:{"class:0:fighter:fighting style":"Two-Weapon Fighting"}}}; const twf=weaponEntryFromId("shortsword"); twf.wielding="off-hand"; const twfSummary=weaponSummary(twfFighter,twf);
check("Two-Weapon Fighting restores ability modifier to off-hand damage", twfSummary?.damageBonus===3, JSON.stringify(twfSummary));
const ringChar={...defenseFighter,armor:{selected:"chain mail",shield:false,misc:0,enhancement:0,name:"Chain mail",baseAc:16,typeOverride:"heavy",shieldEnhancement:0},magicItems:[{id:"ring of protection",attuned:true,choice:""}],saveProficiencies:["str","con"]};
const ringCombat=combatProfile(ringChar,calculatedArmorClass(ringChar));
check("Ring of Protection adds +1 AC when attuned", ringCombat.ac.ac===18, JSON.stringify(ringCombat.ac));
check("Ring of Protection adds +1 to saving throws", combatSaveBonus(ringChar,"dex")===3, String(combatSaveBonus(ringChar,"dex")));
ringChar.magicItems[0].attuned=false; check("Unattuned Ring of Protection stops affecting AC and saves", combatProfile(ringChar,calculatedArmorClass(ringChar)).ac.ac===17 && combatSaveBonus(ringChar,"dex")===2, JSON.stringify(combatProfile(ringChar,calculatedArmorClass(ringChar)).ac));
const ringEnhance={id:"ring of protection",attuned:true,choice:"",enhancement:2};
const ringProfile=magicItemEnhancementProfile(ringEnhance);
check("Ring of Protection exposes a base +1 magic-bonus profile", ringProfile.supported===true && ringProfile.baseBonus===1, JSON.stringify(ringProfile));
ringChar.magicItems=[ringEnhance];
check("Ring of Protection +2 override raises AC by +2", combatProfile(ringChar,calculatedArmorClass(ringChar)).ac.ac===19, JSON.stringify(combatProfile(ringChar,calculatedArmorClass(ringChar)).ac));
check("Ring of Protection +2 override raises saves by +2", combatSaveBonus(ringChar,"dex")===4, String(combatSaveBonus(ringChar,"dex")));
ringChar.magicItems[0].enhancement=3;
check("Ring of Protection +3 override raises AC and saves by +3", combatProfile(ringChar,calculatedArmorClass(ringChar)).ac.ac===20 && combatSaveBonus(ringChar,"dex")===5, JSON.stringify({ac:combatProfile(ringChar,calculatedArmorClass(ringChar)).ac.ac,save:combatSaveBonus(ringChar,"dex")}));
ringChar.magicItems[0].enhancement=0;
check("Magic item bonus Base restores the native +1 effect", combatProfile(ringChar,calculatedArmorClass(ringChar)).ac.ac===18 && combatSaveBonus(ringChar,"dex")===3, JSON.stringify({ac:combatProfile(ringChar,calculatedArmorClass(ringChar)).ac.ac,save:combatSaveBonus(ringChar,"dex")}));
const dwarfHeavy={...newCharacter(),race:"hill dwarf",classes:[{name:"wizard",level:1,subclass:""}],abilities:{str:8,dex:10,con:12,int:16,wis:12,cha:8},armor:{selected:"plate",shield:false,misc:0},combat:{initiativeMisc:0,speedMisc:0,conditions:[]}};
check("Dwarf heavy-armor STR shortfall preserves racial speed", derivedSpeed(dwarfHeavy).walk===25, JSON.stringify(derivedSpeed(dwarfHeavy)));
const humanHeavy={...dwarfHeavy,race:"human"}; check("Non-dwarf heavy-armor STR shortfall uses encoded encumbered speed", derivedSpeed(humanHeavy).walk===20, JSON.stringify(derivedSpeed(humanHeavy)));
humanHeavy.combat.conditions=["grappled"]; check("Grappled condition makes derived speed 0", derivedSpeed(humanHeavy).walk===0, JSON.stringify(derivedSpeed(humanHeavy)));
const elfCombat={...newCharacter(),race:"high elf",classes:[{name:"fighter",level:1,subclass:""}],abilities:{str:10,dex:16,con:12,int:12,wis:10,cha:10},combat:{initiativeMisc:2,speedMisc:0,conditions:[]}}; const ep=combatProfile(elfCombat,10+3);
check("Combat profile derives initiative from DEX plus misc modifier", initiativeSummary(elfCombat).bonus===5, JSON.stringify(initiativeSummary(elfCombat)));
check("Combat profile surfaces racial Darkvision", ep.senses.some(x=>/Darkvision/i.test(x.name)&&Number(x.range)===60), JSON.stringify(ep.senses));
const armorWarn={...humanHeavy,armorProficiencies:{light:false,medium:false,heavy:false,shield:false},combat:{initiativeMisc:0,speedMisc:0,conditions:[]}}; check("Equipped armor proficiency warning is rules-driven", armorStatus(armorWarn).proficient===false, JSON.stringify(armorStatus(armorWarn)));


// v0.7.1: spell slots, multiclass spellcasting, Pact Magic, and racial/feat spell sources
const wizard5={...newCharacter(),classes:[{name:"wizard",level:5,subclass:""}],abilities:{str:8,dex:14,con:14,int:16,wis:10,cha:10}};
const wizard5Slots=spellSlotSummary(wizard5);
check("Wizard 5 has 4/3/2 standard spell slots", wizard5Slots.casterLevel===5 && wizard5Slots.standard.map(x=>x.max).join(",")==="4,3,2", JSON.stringify(wizard5Slots));
const wizard5Summary=spellcastingSummary(wizard5).find(x=>x.classKey!=="");
check("Wizard spell attack and save DC use INT plus proficiency", wizard5Summary?.attack===6 && wizard5Summary?.dc===14, JSON.stringify(wizard5Summary));
const paladin5={...newCharacter(),classes:[{name:"paladin",level:5,subclass:""}]};
check("Paladin 5 keeps its native 4/2 slots while contributing two levels if multiclassed with another Spellcasting class", effectiveCasterLevel(paladin5)===2 && spellSlotSummary(paladin5).standard.map(x=>x.max).join(",")==="4,2", JSON.stringify(spellSlotSummary(paladin5)));
const artificer1={...newCharacter(),classes:[{name:"artificer",level:1,subclass:""}],abilities:{str:8,dex:14,con:14,int:16,wis:10,cha:10}};
check("Artificer 1 rounds half-caster level upward and has slots", effectiveCasterLevel(artificer1)===1 && spellSlotSummary(artificer1).standard[0]?.max===2 && spellcastersForCharacter(artificer1).some(x=>x.classKey==="artificer"), JSON.stringify(spellSlotSummary(artificer1)));
const ek3={...newCharacter(),classes:[{name:"fighter",level:3,subclass:"fighter-eldritch knight"}],abilities:{str:10,dex:16,con:14,int:16,wis:10,cha:8}};
check("Eldritch Knight 3 contributes one effective caster level", effectiveCasterLevel(ek3)===1 && spellSlotSummary(ek3).standard[0]?.max===2, JSON.stringify(spellSlotSummary(ek3)));
const wizPal={...newCharacter(),classes:[{name:"wizard",level:3,subclass:""},{name:"paladin",level:2,subclass:""}],abilities:{str:13,dex:10,con:14,int:16,wis:10,cha:13}};
check("Wizard 3 / Paladin 2 combines to effective caster level 4", effectiveCasterLevel(wizPal)===4 && spellSlotSummary(wizPal).standard.map(x=>x.max).join(",")==="4,3", JSON.stringify(spellSlotSummary(wizPal)));
const pactMulti={...newCharacter(),classes:[{name:"wizard",level:2,subclass:""},{name:"warlock",level:3,subclass:"warlock-the fiend"}],abilities:{str:8,dex:14,con:14,int:16,wis:10,cha:16}};
const pactMultiSlots=spellSlotSummary(pactMulti);
check("Wizard/Warlock keeps Pact Magic separate from standard slots", pactMultiSlots.casterLevel===2 && pactMultiSlots.standard[0]?.max===3 && pactMultiSlots.pact?.max===2 && pactMultiSlots.pact?.slotLevel===2, JSON.stringify(pactMultiSlots));
setSpellSlotUsed(pactMulti,"standard",1,2); setSpellSlotUsed(pactMulti,"pact",2,1);
let usedSlots=spellSlotSummary(pactMulti);
check("Spell slot usage persists independently for standard and Pact Magic", usedSlots.standard[0]?.used===2 && usedSlots.pact?.used===1, JSON.stringify(usedSlots));
resetSpellSlots(pactMulti,"short"); usedSlots=spellSlotSummary(pactMulti);
check("Short rest restores Pact Magic without restoring normal slots", usedSlots.standard[0]?.used===2 && usedSlots.pact?.used===0, JSON.stringify(usedSlots));
resetSpellSlots(pactMulti,"long"); usedSlots=spellSlotSummary(pactMulti);
check("Long rest restores both normal and Pact Magic slots", usedSlots.standard[0]?.used===0 && usedSlots.pact?.used===0, JSON.stringify(usedSlots));
const highElfSpell={...newCharacter(),race:"high elf",classes:[{name:"fighter",level:1,subclass:""}],abilities:{str:10,dex:16,con:12,int:14,wis:10,cha:8}};
const highElfCasters=spellcastersForCharacter(highElfSpell); const highElfSource=highElfCasters.find(x=>x.kind==="race");
check("High Elf racial cantrip becomes a guided racial spell choice", !!highElfSource && highElfSource.bonusChoices?.some(b=>b.options.some(x=>x.level===0&&x.id==="mage hand")), JSON.stringify(highElfSource?.bonusChoices?.map(b=>({name:b.name,count:b.count,options:b.options.slice(0,5)}))));
const highElfDraft=createSpellWizardDraft(highElfSpell); const elfDraftSource=highElfDraft.find(x=>x.kind==="race"); if(elfDraftSource){const pick=elfDraftSource.bonusChoices[0]?.options?.[0]?.id; if(pick)elfDraftSource.selections.bonus=[pick]; applySpellWizard(highElfSpell,highElfDraft); check("Applying racial spell choice writes it to the character spell list", !!pick && highElfSpell.spells.includes(pick), JSON.stringify(highElfSpell.spellcasting));}
const tiefling5={...newCharacter(),race:"tiefling",classes:[{name:"fighter",level:5,subclass:"fighter-champion"}],abilities:{str:16,dex:12,con:14,int:8,wis:10,cha:16}};
const tieflingSource=spellcastersForCharacter(tiefling5).find(x=>x.kind==="race");
check("Tiefling level-gated racial spells include Thaumaturgy, Hellish Rebuke, and Darkness", ["thaumaturgy","hellish rebuke","darkness"].every(id=>tieflingSource?.autoSpells.includes(id)), JSON.stringify(tieflingSource?.autoSpells));
const feyTouched={...newCharacter(),classes:[{name:"fighter",level:4,subclass:"fighter-champion"}],feats:["fey touched"],abilities:{str:10,dex:16,con:14,int:14,wis:12,cha:10}};
const featCaster=spellcastersForCharacter(feyTouched).find(x=>x.kind==="feat"&&/Fey Touched/i.test(x.name));
check("Fey Touched exposes Misty Step plus its constrained bonus spell choice", featCaster?.autoSpells.includes("misty step") && featCaster?.bonusChoices?.some(b=>b.options.some(x=>x.level===1)), JSON.stringify({auto:featCaster?.autoSpells,bonus:featCaster?.bonusChoices?.map(b=>({name:b.name,count:b.count,options:b.options.length}))}));

// Regression: reducing a previously completed Wizard 5 to Wizard 2 and adding Warlock 3
// must prune spell choices that are no longer legal/current instead of leaving invisible stale
// selections that make the Spell List Wizard impossible to validate.
const transitionCaster={...newCharacter(),classes:[{name:"wizard",level:5,subclass:"wizard-evocation"}],abilities:{str:8,dex:14,con:14,int:16,wis:10,cha:16}};
let transitionDraft=createSpellWizardDraft(transitionCaster);
if(transitionDraft[0]){
  const c=transitionDraft[0];
  c.selections.cantrips=c.cantrips.slice(0,c.cantripCount).map(x=>x.id);
  c.selections.spells=c.spells.slice(-c.spellCount).map(x=>x.id); // deliberately include higher-level spells where available
  const pool=preparedPool(c,c.selections);
  c.selections.prepared=pool.slice(0,Math.min(c.preparedCount,pool.length)).map(x=>x.id);
  applySpellWizard(transitionCaster,transitionDraft);
}
transitionCaster.classes=[{name:"wizard",level:2,subclass:"wizard-evocation"},{name:"warlock",level:3,subclass:"warlock-the fiend"}];
reconcileSpellcastingState(transitionCaster);
transitionDraft=createSpellWizardDraft(transitionCaster);
const transitionWiz=transitionDraft.find(c=>c.classKey==="wizard");
const transitionLock=transitionDraft.find(c=>c.classKey==="warlock");
check("Deleveling Wizard prunes invisible stale cantrip/spell/prepared selections", !!transitionWiz && transitionWiz.selections.cantrips.length<=transitionWiz.cantripCount && transitionWiz.selections.spells.length<=transitionWiz.spellCount && transitionWiz.selections.prepared.length<=transitionWiz.preparedCount && transitionWiz.selections.spells.every(id=>transitionWiz.spells.some(x=>x.id===id)), JSON.stringify(transitionWiz?.selections));
for(const c of transitionDraft){
  c.selections.cantrips=[...c.selections.cantrips,...c.cantrips.filter(x=>!c.selections.cantrips.includes(x.id)).slice(0,Math.max(0,c.cantripCount-c.selections.cantrips.length)).map(x=>x.id)].slice(0,c.cantripCount);
  if(c.typeSp==="book"||c.typeSp==="known") c.selections.spells=[...c.selections.spells,...c.spells.filter(x=>!c.selections.spells.includes(x.id)).slice(0,Math.max(0,c.spellCount-c.selections.spells.length)).map(x=>x.id)].slice(0,c.spellCount);
  const pool=preparedPool(c,c.selections);
  c.selections.prepared=[...c.selections.prepared,...pool.filter(x=>!c.selections.prepared.includes(x.id)).slice(0,Math.max(0,Math.min(c.preparedCount,pool.length)-c.selections.prepared.length)).map(x=>x.id)].slice(0,Math.min(c.preparedCount,pool.length));
}
check("Wizard 2 / Warlock 3 transition draft can be completed and validated", !!transitionWiz && !!transitionLock && validSpellWizardDraft(transitionDraft).length===0, validSpellWizardDraft(transitionDraft).join(" | "));



// v0.8.4: normalize AddFeatureChoice(true) semantics across class/subclass choice pools
const monkOptional6={...newCharacter(),classes:[{name:"monk",level:6,subclass:"monk-way of the open hand"}],contentSelections:{}};
const monkOptionalRows=featureChoiceSources(monkOptional6).filter(x=>x.kind==="optional-group"&&/^Monk:/i.test(x.label));
const monkOptionalNames=monkOptionalRows.flatMap(x=>x.items||[]).map(x=>x.name);
check("Monk optional class features are grouped independently instead of under host features", monkOptionalRows.length===1 && /Optional Class Features/i.test(monkOptionalRows[0]?.label||"") && ["Dedicated Weapon","Ki-Fueled Attack","Quickened Healing (2 ki points)","Focused Aim (1-3 ki points)"].every(n=>monkOptionalNames.includes(n)), JSON.stringify(monkOptionalRows));
check("Monk optional feature UI no longer labels Focused Aim as part of Slow Fall", !monkOptionalRows.some(x=>/Slow Fall|Deflect Missiles|Unarmored Movement|\bKi\b/.test(x.label.replace(/^Monk:\s*/,""))), monkOptionalRows.map(x=>x.label).join(" | "));
const monkOptional2={...newCharacter(),classes:[{name:"monk",level:2,subclass:""}],contentSelections:{}};
const monk2Names=featureChoiceSources(monkOptional2).filter(x=>x.kind==="optional-group").flatMap(x=>x.items||[]).map(x=>x.name);
check("Optional class features honor their own unlock levels instead of the host feature level", monk2Names.includes("Dedicated Weapon") && !monk2Names.includes("Ki-Fueled Attack") && !monk2Names.includes("Focused Aim (1-3 ki points)"), JSON.stringify(monk2Names));
const sorc4={...newCharacter(),classes:[{name:"sorcerer",level:4,subclass:"sorcerer-draconic bloodline"}],contentSelections:{}};
const metaChoices=featureChoiceSources(sorc4).find(x=>x.kind==="extra"&&/Metamagic/i.test(x.label));
check("Tasha/UA Metamagic additions extend the Metamagic selection pool instead of becoming checkboxes", metaChoices?.choices?.includes("Seeking Spell") && metaChoices?.choices?.includes("Transmuted Spell") && !featureChoiceSources(sorc4).some(x=>x.kind==="optional-group"&&x.items?.some(i=>/Seeking Spell|Transmuted Spell/.test(i.name))), JSON.stringify(metaChoices?.choices));
const artificer6={...newCharacter(),classes:[{name:"artificer",level:6,subclass:""}],contentSelections:{}};
const infusionChoices=featureChoiceSources(artificer6).find(x=>x.kind==="extra"&&/Infuse Item/i.test(x.label));
check("Tasha/UA Artificer infusions extend the Infuse Item selection pool", infusionChoices?.choices?.some(x=>/Mind Sharpener/.test(x)) && infusionChoices?.choices?.some(x=>/Spell-Refueling Ring/.test(x)), JSON.stringify(infusionChoices?.choices));
const bm3={...newCharacter(),classes:[{name:"fighter",level:3,subclass:"fighter-battle master"}],contentSelections:{}};
const maneuverChoices=featureChoiceSources(bm3).find(x=>x.kind==="extra"&&/Maneuvers/i.test(x.label));
check("Tasha/UA Battle Master maneuvers extend the Maneuvers selection pool", maneuverChoices?.choices?.some(x=>/^Ambush$/i.test(x)) && maneuverChoices?.choices?.some(x=>/^Brace$/i.test(x)), JSON.stringify(maneuverChoices?.choices));
let optionalClassAuditOk=true; const optionalClassAudit=[];
for(const classKey of Object.keys(registries.ClassList)){
  const cls=registries.ClassList[classKey]; if(!cls?.features) continue;
  const ch={...newCharacter(),classes:[{name:classKey,level:20,subclass:""}],contentSelections:{}};
  const rows=featureChoiceSources(ch);
  for(const row of rows.filter(x=>x.kind==="optional-group")){ if(!/Optional Class Features/i.test(row.label)){optionalClassAuditOk=false;optionalClassAudit.push(row.label);} }
}
check("All loaded classes use semantic Optional Class Features groups rather than host-feature labels", optionalClassAuditOk, optionalClassAudit.join(" | "));

// v0.8.0: semantic behavior runtime, limited-use features, actions, diagnostics, and extra choices
const warlock3={...newCharacter(),classes:[{name:"warlock",level:3,subclass:"warlock-the fiend"}],abilities:{str:8,dex:14,con:14,int:10,wis:10,cha:16},spells:["eldritch blast"],contentSelections:{featureChoices:{"class:0:warlock:pact boon":"Pact of the Blade"}}};
let warlockChoices=featureChoiceSources(warlock3);
const invocationChoices=warlockChoices.find(x=>x.kind==="extra"&&/Eldritch Invocations/i.test(x.label));
check("Warlock 3 exposes two Eldritch Invocation selection slots", invocationChoices?.count===2 && invocationChoices?.missing===2, JSON.stringify(invocationChoices&&{count:invocationChoices.count,missing:invocationChoices.missing,options:invocationChoices.options.length}));
const thirsting=invocationChoices?.options.find(x=>/Thirsting Blade/i.test(x.value));
check("Invocation prerequisite filtering knows Thirsting Blade is unavailable before Warlock 5", !!thirsting && !thirsting.eligible && thirsting.reasons.some(x=>/level 5/i.test(x)), JSON.stringify(thirsting));
const legalInvocations=(invocationChoices?.options||[]).filter(x=>x.eligible).slice(0,2);
if(invocationChoices&&legalInvocations.length>=2){setExtraFeatureChoice(warlock3,invocationChoices.id,0,legalInvocations[0].value);setExtraFeatureChoice(warlock3,invocationChoices.id,1,legalInvocations[1].value);}
warlockChoices=featureChoiceSources(warlock3); const invAfter=warlockChoices.find(x=>x.id===invocationChoices?.id);
check("Eldritch Invocation selections persist and satisfy their current count", invAfter?.selected?.length===2 && invAfter?.missing===0, JSON.stringify(invAfter?.selected));
const warlockBehavior=behaviorProfile(warlock3);
check("Selected Pact of the Blade contributes an Action to the behavior runtime", warlockBehavior.actions.some(x=>/Pact of the Blade/i.test(x.source)&&/action/i.test(x.type)), JSON.stringify(warlockBehavior.actions.filter(x=>/Pact/i.test(x.source))));
check("Selected extra invocation records enter the active behavior graph", legalInvocations.length>=2 && legalInvocations.every(inv=>warlockBehavior.entries.some(x=>x.kind==="extra feature choice"&&x.name===(inv.data?.name||inv.value))), JSON.stringify(warlockBehavior.entries.filter(x=>x.kind==="extra feature choice").map(x=>x.name)));

const lightId=Object.keys(registries.ClassSubList).find(k=>/light domain/i.test(k));
if(lightId){
  const light={...newCharacter(),classes:[{name:"cleric",level:2,subclass:lightId}],abilities:{str:10,dex:10,con:12,int:10,wis:16,cha:10}};
  const lightResources=resourceStatus(light); const ward=lightResources.find(x=>/Warding Flare/i.test(x.source));
  check("Warding Flare usagescalc resolves from Wisdom modifier", ward?.max===3, JSON.stringify(ward));
  if(ward){setResourceUsed(light,ward.id,2); check("Feature usage state records spent uses", resourceStatus(light).find(x=>x.id===ward.id)?.used===2, JSON.stringify(resourceStatus(light).find(x=>x.id===ward.id))); resetBehaviorResources(light,"long"); check("Long rest restores Warding Flare uses", resourceStatus(light).find(x=>x.id===ward.id)?.used===0, JSON.stringify(resourceStatus(light).find(x=>x.id===ward.id)));}
}
const staffChar={...newCharacter(),classes:[{name:"wizard",level:3,subclass:"wizard-evocation"}],magicItems:[{id:"staff of defense",attuned:true,choice:"",enhancement:0}]};
const staffResources=resourceStatus(staffChar); const staff=staffResources.find(x=>/Staff of Defense/i.test(x.source));
check("Magic item charges use the same browser-native resource tracker", staff?.max===10 && /dawn/i.test(staff?.recovery||""), JSON.stringify(staff));
check("Magic-item spell charges remain eligible for the central Resources tracker", staff?.spellSheetResource===false, JSON.stringify(staff));
if(staff){setResourceUsed(staffChar,staff.id,4);resetBehaviorResources(staffChar,"long");check("Long rest does not incorrectly recharge dawn-based magic-item charges", resourceStatus(staffChar).find(x=>x.id===staff.id)?.used===4, JSON.stringify(resourceStatus(staffChar).find(x=>x.id===staff.id)));resetBehaviorResources(staffChar,"daily");check("Daily recovery restores dawn/dusk/day resources", resourceStatus(staffChar).find(x=>x.id===staff.id)?.used===0, JSON.stringify(resourceStatus(staffChar).find(x=>x.id===staff.id)));}
const pactDiag=behaviorDiagnostics(warlock3);
check("Translated Pact of the Blade calcChanges no longer reports as unsupported", !pactDiag.some(x=>x.kind==="calcChanges"&&x.sources.some(n=>/Pact of the Blade/i.test(n))), JSON.stringify(pactDiag.filter(x=>x.kind==="calcChanges")));
const abjurationId=Object.keys(registries.ClassSubList).find(k=>/abjuration/i.test(k));
if(abjurationId){ const abj={...newCharacter(),classes:[{name:"wizard",level:10,subclass:abjurationId}]}; const d=behaviorDiagnostics(abj); check("Genuinely unsupported calcChanges are still reported", d.some(x=>x.kind==="calcChanges"), JSON.stringify(d.filter(x=>x.kind==="calcChanges"))); }
const life={...newCharacter(),classes:[{name:"fighter",level:1,subclass:""}]}; const firstLifecycle=reconcileBehaviorState(life).state.lifecycle; reconcileBehaviorState(life); const secondLifecycle=life.behavior.lifecycle;
check("Behavior lifecycle records newly active entries once and then stabilizes", firstLifecycle.added.length>=0 && secondLifecycle.added.length===0 && secondLifecycle.removed.length===0, JSON.stringify({first:firstLifecycle,second:secondLifecycle}));

// v0.8.1: one global rest flow resets every relevant subsystem together
const restChar={...newCharacter(),classes:[{name:"warlock",level:3,subclass:"warlock-the fiend"},{name:"fighter",level:1,subclass:""}]};
reconcileSpellcastingState(restChar);
const restPact=spellSlotSummary(restChar).pact;
if(restPact) setSpellSlotUsed(restChar,"pact",restPact.slotLevel,1);
const restFeatures=resourceStatus(restChar);
const shortFeature=restFeatures.find(x=>/short/i.test(x.recovery||""));
if(shortFeature) setResourceUsed(restChar,shortFeature.id,1);
const shortSummary=performRest(restChar,"short");
check("Global Short Rest restores Pact Magic", spellSlotSummary(restChar).pact?.used===0 && shortSummary.restoredPactSlots===1, JSON.stringify(shortSummary));
check("Global Short Rest restores short-rest feature resources", !shortFeature || resourceStatus(restChar).find(x=>x.id===shortFeature.id)?.used===0, JSON.stringify(shortFeature));
const longCaster={...newCharacter(),classes:[{name:"wizard",level:2,subclass:"wizard-evocation"},{name:"warlock",level:1,subclass:"warlock-the fiend"}]};
reconcileSpellcastingState(longCaster);
setSpellSlotUsed(longCaster,"standard",1,1);
const longPact=spellSlotSummary(longCaster).pact; if(longPact) setSpellSlotUsed(longCaster,"pact",longPact.slotLevel,1);
const longSummary=performRest(longCaster,"long");
check("Global Long Rest restores standard and Pact spell slots together", spellSlotSummary(longCaster).standard.every(x=>x.used===0) && (!spellSlotSummary(longCaster).pact || spellSlotSummary(longCaster).pact.used===0) && longSummary.restoredStandardSlots>=1, JSON.stringify(longSummary));

// v0.8.2: semantic callback translations + toolbar cleanup milestone
const pactMods=behaviorWeaponModifiers(warlock3,{name:"Longsword",list:"melee",description:""},{name:"Pact Longsword",id:"longsword",ability:"str"});
check("Pact of the Blade semantically grants proficiency to a Pact-named weapon", pactMods.forceProficient===true && pactMods.countsAsMagical===true, JSON.stringify(pactMods));
const agonizingWarlock={...newCharacter(),classes:[{name:"warlock",level:3,subclass:"warlock-the fiend"}],abilities:{str:8,dex:14,con:14,int:10,wis:10,cha:16},spells:["eldritch blast"],contentSelections:{extraFeatureChoices:{"extra:class:0:warlock:eldritch invocations":["Agonizing Blast (prereq: Eldritch Blast cantrip)"]}}};
const agonizingMods=behaviorWeaponModifiers(agonizingWarlock,{name:"Eldritch Blast",list:"ranged"},{name:"Eldritch Blast",id:"eldritch blast",ability:"cha"});
check("Agonizing Blast translates its calcChanges damage into Charisma modifier", agonizingMods.damage===3, JSON.stringify(agonizingMods));
const monk6={...newCharacter(),classes:[{name:"monk",level:6,subclass:"monk-way of the open hand"}],armor:{selected:"",name:"",enhancement:0,baseAc:null,typeOverride:"",shield:false,shieldEnhancement:0,misc:0}};
const monkSpeed=behaviorSpeedBonus(monk6);
check("Monk Unarmored Movement changeeval translates at current class level", monkSpeed.bonus===15, JSON.stringify(monkSpeed));
monk6.armor.selected="leather";
check("Monk Unarmored Movement is suppressed while armored", behaviorSpeedBonus(monk6).bonus===0, JSON.stringify(behaviorSpeedBonus(monk6)));


// v0.8.3: weapon editor layout + Monk Martial Arts semantic translation
const monkMA={...newCharacter(),classes:[{name:"monk",level:6,subclass:"monk-way of the open hand"}],abilities:{str:8,dex:16,con:12,int:10,wis:14,cha:10},armor:{selected:"",name:"",enhancement:0,baseAc:null,typeOverride:"",shield:false,shieldEnhancement:0,misc:0}};
const clubEntry={id:"club",name:"Club",ability:"auto",damageCount:1,damageDie:4,damageType:"bludgeoning",range:"Melee",hitMisc:0,damageMisc:0,proficientOverride:null,wielding:"main-hand"};
const clubSummary=weaponSummary(monkMA,clubEntry);
check("Monk Martial Arts uses Dexterity when better on qualifying weapon", clubSummary?.ability==="dex", JSON.stringify(clubSummary));
check("Monk 6 Martial Arts upgrades a 1d4 qualifying weapon to 1d6", /1d6/.test(clubSummary?.damage||""), JSON.stringify(clubSummary));
monkMA.armor.selected="leather";
const armoredClub=weaponSummary(monkMA,clubEntry);
check("Monk Martial Arts attack translation is suppressed while armored", armoredClub?.ability==="str" && /1d4/.test(armoredClub?.damage||""), JSON.stringify(armoredClub));
const martialDiag=behaviorDiagnostics({...monkMA,armor:{...monkMA.armor,selected:""}});
check("Translated Martial Arts calcChanges no longer reports as unsupported", !martialDiag.some(x=>x.kind==="calcChanges"&&x.sources.some(n=>/^Martial Arts$/i.test(n))), JSON.stringify(martialDiag.filter(x=>x.kind==="calcChanges")));


const monkUnarmed=weaponSummary({...monkMA,armor:{...monkMA.armor,selected:""}},{id:"unarmed strike",name:"Unarmed Strike",ability:"auto",damageCount:1,damageDie:1,damageType:"bludgeoning",range:"Melee",hitMisc:0,damageMisc:0,proficientOverride:null,wielding:"main-hand"});
check("Ki-Empowered Strikes makes Monk 6 unarmed strikes count as magical", monkUnarmed?.countsAsMagical===true && monkUnarmed?.styleNotes?.some(x=>/Ki-Empowered Strikes/i.test(x)), JSON.stringify(monkUnarmed));
const monkSword=weaponSummary({...monkMA,armor:{...monkMA.armor,selected:""}},{id:"shortsword",name:"Shortsword",ability:"auto",damageCount:1,damageDie:6,damageType:"piercing",range:"Melee",hitMisc:0,damageMisc:0,proficientOverride:null,wielding:"main-hand"});
check("Ki-Empowered Strikes does not incorrectly make Monk weapons magical", monkSword?.countsAsMagical!==true, JSON.stringify(monkSword));
const kiDiag=behaviorDiagnostics({...monkMA,armor:{...monkMA.armor,selected:""}});
check("Translated Ki-Empowered Strikes calcChanges no longer reports as unsupported", !kiDiag.some(x=>x.kind==="calcChanges"&&x.sources.some(n=>/^Ki-Empowered Strikes$/i.test(n))), JSON.stringify(kiDiag.filter(x=>x.kind==="calcChanges")));

// v0.8.5: arbitrary-spend point pools use numeric remaining-value trackers
const tranquilityId=Object.keys(registries.ClassSubList).find(k=>/way of tranquility/i.test(k));
if(tranquilityId){
  const tranquil6={...newCharacter(),classes:[{name:"monk",level:6,subclass:tranquilityId}]};
  const healingHands=resourceStatus(tranquil6).find(x=>/^Healing Hands$/i.test(x.source));
  check("Way of Tranquility Healing Hands is recognized as a point pool", healingHands?.max===60 && healingHands?.mode==="pool" && healingHands?.unit==="points", JSON.stringify(healingHands));
  if(healingHands){ setResourceUsed(tranquil6,healingHands.id,30); const after=resourceStatus(tranquil6).find(x=>x.id===healingHands.id); check("Point-pool state supports arbitrary spending such as 30 of 60", after?.remaining===30 && after?.used===30, JSON.stringify(after)); }
}
const paladin6Pool={...newCharacter(),classes:[{name:"paladin",level:6,subclass:"paladin-oath of devotion"}]};
const layHands=resourceStatus(paladin6Pool).find(x=>/^Lay on Hands$/i.test(x.source));
check("Paladin Lay on Hands uses the same numeric point-pool presentation", layHands?.max===30 && layHands?.mode==="pool", JSON.stringify(layHands));
const discreteResource=resourceStatus({...newCharacter(),classes:[{name:"cleric",level:2,subclass:lightId||""}],abilities:{str:10,dex:10,con:12,int:10,wis:16,cha:10}}).find(x=>/Warding Flare/i.test(x.source));
check("Discrete limited-use abilities remain pip-style resources", !discreteResource || discreteResource.mode==="uses", JSON.stringify(discreteResource));

// v0.8.6: innate/racial spell grants stay grouped and retain their own casting semantics
{
  const aasimar = newCharacter(); aasimar.race = "aasimar"; aasimar.classes = [{name:"fighter",level:1,subclass:""}];
  let names = activeFeatures(aasimar).map(x=>x.name);
  check("Aasimar Celestial Legacy is one grouped racial feature", names.filter(x=>x==="Celestial Legacy").length===1, names);
  check("Aasimar level 1 does not activate future Celestial Legacy resources", !resourceStatus(aasimar).some(x=>/Lesser Restoration|Daylight/i.test(x.source)), resourceStatus(aasimar));
  aasimar.classes[0].level=3;
  let grants=spellGrantMetadata(aasimar);
  check("Aasimar Lesser Restoration activates at level 3", grants.has("lesser restoration"), grants.get("lesser restoration"));
  check("Aasimar Lesser Restoration uses Charisma", grants.get("lesser restoration")?.some(x=>x.ability==="cha"), grants.get("lesser restoration"));
  check("Aasimar Lesser Restoration has one long-rest use", resourceStatus(aasimar).some(x=>/Celestial Legacy \(level 3\)/i.test(x.source)&&x.max===1&&/long rest/i.test(x.recovery)), resourceStatus(aasimar));
  check("Racial spell-use resources are marked for the Spells panel instead of the central tracker", resourceStatus(aasimar).filter(x=>x.spellGrant).every(x=>x.spellSheetResource===true), JSON.stringify(resourceStatus(aasimar)));
  check("Aasimar Daylight remains locked before level 5", !grants.has("daylight"), grants.get("daylight"));
  aasimar.classes[0].level=5; grants=spellGrantMetadata(aasimar);
  check("Aasimar Daylight activates at level 5 with Charisma", grants.get("daylight")?.some(x=>x.ability==="cha"), grants.get("daylight"));
}

// v0.8.7: automatic innate spells do not create false spell-choice resolution work
{
  const aasimarFighter = newCharacter(); aasimarFighter.race="aasimar"; aasimarFighter.background="acolyte"; aasimarFighter.classes=[{name:"fighter",level:5,subclass:"fighter-champion"}];
  const aasimarSpellItem=creationStatus(aasimarFighter).items.find(x=>x.id==="spells");
  check("Automatic Aasimar spells do not require the Spell List Wizard", aasimarSpellItem?.complete===true && aasimarSpellItem?.action==="jump", JSON.stringify(aasimarSpellItem));
  const birdFighter = newCharacter(); birdFighter.race="aarakocra"; birdFighter.classes=[{name:"fighter",level:1,subclass:""}];
  const birdSpellItem=creationStatus(birdFighter).items.find(x=>x.id==="spells");
  check("Non-spellcasting Aarakocra Fighter has no spell wizard choice", birdSpellItem?.complete===true && birdSpellItem?.action==="jump", JSON.stringify(birdSpellItem));
  const wizard = newCharacter(); wizard.classes=[{name:"wizard",level:1,subclass:""}];
  const wizardSpellItem=creationStatus(wizard).items.find(x=>x.id==="spells");
  check("Actual caster choices still expose the Spell List Wizard", wizardSpellItem?.action==="spell-wizard" && wizardSpellItem?.complete===false, JSON.stringify(wizardSpellItem));
}

// v0.8.13 hotfix: level-indexed recovery values must resolve to one current value
const bard3Recovery=resourceStatus({...newCharacter(),classes:[{name:"bard",level:3,subclass:""}],abilities:{str:10,dex:14,con:12,int:10,wis:10,cha:16}}).find(x=>/Bardic Inspiration/i.test(x.source));
const bard5Recovery=resourceStatus({...newCharacter(),classes:[{name:"bard",level:5,subclass:""}],abilities:{str:10,dex:14,con:12,int:10,wis:10,cha:16}}).find(x=>/Bardic Inspiration/i.test(x.source));
check("Bardic Inspiration shows only its current recovery at level 3", bard3Recovery?.recovery==="long rest", JSON.stringify(bard3Recovery));
check("Font of Inspiration changes Bardic Inspiration display to short-rest recovery", bard5Recovery?.recovery==="short rest", JSON.stringify(bard5Recovery));

// v0.8.16: Spellcasting Audit I — verify each single-class casting model before multiclass torture tests.
{
  const caster=(name,level,abilityKey,abilityScore,subclass="")=>{const ch=newCharacter();ch.classes=[{name,level,subclass}];ch.abilities={str:10,dex:10,con:10,int:10,wis:10,cha:10,[abilityKey]:abilityScore};return spellcastersForCharacter(ch).find(x=>x.classKey===name);};
  const bard=caster("bard",3,"cha",16); check("Bard 3 is a known-spells caster with CHA", bard?.typeSp==="known"&&bard.ability==="cha"&&bard.cantripCount===2&&bard.spellCount===6&&bard.maxSpell===2, JSON.stringify(bard&&{typeSp:bard.typeSp,ability:bard.ability,cantrips:bard.cantripCount,spells:bard.spellCount,max:bard.maxSpell}));
  const cleric=caster("cleric",5,"wis",16,"cleric-life domain"); check("Cleric 5 uses full-list preparation and prepares level + WIS", cleric?.typeSp==="list"&&cleric.ability==="wis"&&cleric.preparedCount===8&&cleric.maxSpell===3, JSON.stringify(cleric&&{typeSp:cleric.typeSp,prepared:cleric.preparedCount,max:cleric.maxSpell,autoPrepared:cleric.autoPrepared}));
  check("Life Cleric domain spells are always prepared outside the normal preparation count", ["bless","cure wounds","lesser restoration","spiritual weapon"].every(id=>cleric?.autoPrepared.includes(id)), JSON.stringify(cleric?.autoPrepared));
  const druid=caster("druid",5,"wis",16,"druid-circle of the land"); check("Druid 5 uses full-list preparation and prepares level + WIS", druid?.typeSp==="list"&&druid.preparedCount===8&&druid.maxSpell===3, JSON.stringify(druid&&{typeSp:druid.typeSp,prepared:druid.preparedCount,max:druid.maxSpell}));
  const pal1=caster("paladin",1,"cha",16); check("Paladin 1 has no active spellcasting source yet", !pal1, JSON.stringify(pal1));
  const pal5=caster("paladin",5,"cha",16,"paladin-oath of devotion"); check("Paladin 5 prepares PALADIN LEVEL + CHA, not effective caster level", pal5?.typeSp==="list"&&pal5.preparedCount===8&&pal5.maxSpell===2, JSON.stringify(pal5&&{typeSp:pal5.typeSp,prepared:pal5.preparedCount,max:pal5.maxSpell}));
  const ranger=caster("ranger",5,"wis",16,"ranger-hunter"); check("Ranger 5 remains a known-spells half-caster", ranger?.typeSp==="known"&&ranger.spellCount===4&&ranger.maxSpell===2, JSON.stringify(ranger&&{typeSp:ranger.typeSp,spells:ranger.spellCount,max:ranger.maxSpell}));
  check("Ranger 5 selectable spell pool actually contains level-2 Ranger spells", ranger?.spells?.some(sp=>sp.level===2)&&ranger.spells.some(sp=>sp.id==="pass without trace"||sp.name==="Pass without Trace"), JSON.stringify(ranger?.spells?.filter(sp=>sp.level===2).slice(0,8)));
  const rangerDraftChar=newCharacter(); rangerDraftChar.classes=[{name:"ranger",level:5,subclass:"ranger-hunter"}]; rangerDraftChar.abilities.wis=16; const rangerDraft=createSpellWizardDraft(rangerDraftChar).find(x=>x.classKey==="ranger");
  check("Ranger 5 Spell Wizard draft carries level-2 options through to the UI pool", rangerDraft?.spells?.some(sp=>sp.level===2), JSON.stringify(rangerDraft?.spells?.filter(sp=>sp.level===2).slice(0,6)));
  const rangerChoices=featureChoiceSources(rangerDraftChar); const rangerOptional=rangerChoices.find(x=>x.kind==="optional-group"&&/Ranger/.test(x.label));
  check("Tasha Ranger replacements are offered while superseded UA CFV replacements are hidden", ["Favored Foe","Deft Explorer","Primal Awareness"].every(n=>rangerOptional?.items?.some(i=>i.name===n)) && !(rangerOptional?.items||[]).some(i=>/\(ua\)/i.test(i.name)), JSON.stringify(rangerOptional?.items?.map(i=>i.name)));
  const deft=rangerOptional?.items?.find(i=>i.name==="Deft Explorer"); if(deft){ rangerDraftChar.contentSelections.optionalFeatureChoices[deft.sourceId]=[deft.value]; } const afterDeft=featureChoiceSources(rangerDraftChar);
  check("Selecting Deft Explorer replaces Natural Explorer choices with Canny expertise", !afterDeft.some(x=>/Natural Explorer/.test(x.label)) && afterDeft.some(x=>/Deft Explorer: Canny/.test(x.label)&&x.kind==="extra"&&x.count===1), JSON.stringify(afterDeft.filter(x=>/Explorer/.test(x.label)).map(x=>({label:x.label,kind:x.kind,count:x.count}))));
  const foe=rangerOptional?.items?.find(i=>i.name==="Favored Foe"); if(foe){ rangerDraftChar.contentSelections.optionalFeatureChoices[foe.sourceId]=[foe.value]; } const afterFoe=featureChoiceSources(rangerDraftChar);
  check("Selecting Favored Foe removes Favored Enemy selection requirements", !afterFoe.some(x=>/Favored Enemy/.test(x.label)&&x.kind==="extra"), JSON.stringify(afterFoe.filter(x=>/Favored/.test(x.label)).map(x=>x.label)));
  const addSpells=rangerOptional?.items?.find(i=>/^Additional Ranger Spells/.test(i.name)); if(addSpells){ rangerDraftChar.contentSelections.optionalFeatureChoices[addSpells.sourceId]=[addSpells.value]; } const rangerExpanded=spellcastersForCharacter(rangerDraftChar).find(x=>x.classKey==="ranger");
  check("Tasha Additional Ranger Spells expands the actual Ranger selection pool", ["aid","enhance ability","gust of wind"].every(id=>rangerExpanded?.spells?.some(sp=>sp.id===id)), JSON.stringify(rangerExpanded?.spells?.filter(sp=>["aid","enhance ability","gust of wind"].includes(sp.id))));
  const deftProf=generalProficiencyStatus(rangerDraftChar); check("Deft Explorer contributes its two Canny language choices", deftProf.rows.some(x=>/Deft Explorer/.test(x.label)&&x.type==="language"&&x.choice?.count===2), JSON.stringify(deftProf.rows.filter(x=>/Deft Explorer/.test(x.label))));
  const sorc=caster("sorcerer",5,"cha",16,"sorcerer-draconic bloodline"); check("Sorcerer 5 is a CHA known-spells caster", sorc?.typeSp==="known"&&sorc.ability==="cha"&&sorc.cantripCount===5&&sorc.spellCount===6&&sorc.maxSpell===3, JSON.stringify(sorc&&{typeSp:sorc.typeSp,cantrips:sorc.cantripCount,spells:sorc.spellCount,max:sorc.maxSpell}));
  const warlock=caster("warlock",5,"cha",16,"warlock-the fiend"); check("Warlock 5 is a known-spells Pact Magic caster", warlock?.kind==="pact"&&warlock.typeSp==="known"&&warlock.spellCount===6&&warlock.maxSpell===3, JSON.stringify(warlock&&{kind:warlock.kind,typeSp:warlock.typeSp,spells:warlock.spellCount,max:warlock.maxSpell}));
  const wiz=caster("wizard",5,"int",16,"wizard-evocation"); check("Wizard 5 has a spellbook and prepares wizard level + INT", wiz?.typeSp==="book"&&wiz.spellCount===14&&wiz.preparedCount===8&&wiz.maxSpell===3, JSON.stringify(wiz&&{typeSp:wiz.typeSp,book:wiz.spellCount,prepared:wiz.preparedCount,max:wiz.maxSpell}));
  const art1=caster("artificer",1,"int",16); check("Artificer 1 casts immediately and prepares at least INT-mod spells", art1?.typeSp==="list"&&art1.preparedCount===3&&art1.maxSpell===1, JSON.stringify(art1&&{typeSp:art1.typeSp,prepared:art1.preparedCount,max:art1.maxSpell}));
  const art5=caster("artificer",5,"int",16); check("Artificer 5 preparation rounds half class level DOWN", art5?.preparedCount===5&&art5.maxSpell===2, JSON.stringify(art5&&{prepared:art5.preparedCount,max:art5.maxSpell}));
  const elf=newCharacter();elf.race="high elf";elf.classes=[{name:"fighter",level:5,subclass:"fighter-champion"}];const elfSource=spellcastersForCharacter(elf).find(x=>x.kind==="race");check("Automatic/choice racial magic remains its own INT spell source", elfSource?.ability==="int"&&elfSource?.sourceOnly===true, JSON.stringify(elfSource&&{ability:elfSource.ability,sourceOnly:elfSource.sourceOnly,choices:elfSource.bonusChoices?.length}));
}


// v0.8.17: Spellcasting Audit II — multiclass slot math, Pact Magic separation,
// third-caster progression, multiple casting abilities, and source isolation.
{
  const ranger1Slots={...newCharacter(),classes:[{name:"ranger",level:1,subclass:""}],abilities:{str:10,dex:16,con:12,int:10,wis:16,cha:8}};
  check("Ranger 1 has no spell slots before Spellcasting begins at level 2", spellSlotSummary(ranger1Slots).standard.length===0, JSON.stringify(spellSlotSummary(ranger1Slots)));
  const paladin1Slots={...newCharacter(),classes:[{name:"paladin",level:1,subclass:""}],abilities:{str:16,dex:10,con:14,int:8,wis:10,cha:16}};
  check("Paladin 1 has no spell slots before Spellcasting begins at level 2", spellSlotSummary(paladin1Slots).standard.length===0, JSON.stringify(spellSlotSummary(paladin1Slots)));
  const ranger5Slots={...newCharacter(),classes:[{name:"ranger",level:5,subclass:"ranger-hunter"}],abilities:{str:10,dex:16,con:12,int:10,wis:16,cha:8}};
  check("Single-class Ranger 5 uses native half-caster 4/2 slots, not multiclass contribution slots", spellSlotSummary(ranger5Slots).standard.map(x=>x.max).join(",")==="4,2" && effectiveCasterLevel(ranger5Slots)===2, JSON.stringify(spellSlotSummary(ranger5Slots)));
  const rangerFighter={...ranger5Slots,classes:[{name:"ranger",level:5,subclass:"ranger-hunter"},{name:"fighter",level:2,subclass:""}]};
  check("Adding a noncaster does not reduce Ranger's native slot progression", spellSlotSummary(rangerFighter).standard.map(x=>x.max).join(",")==="4,2", JSON.stringify(spellSlotSummary(rangerFighter)));
  const art5Slots={...newCharacter(),classes:[{name:"artificer",level:5,subclass:"artificer-artillerist"}],abilities:{str:8,dex:14,con:14,int:16,wis:10,cha:10}};
  check("Single-class Artificer 5 has native 4/2 slots", spellSlotSummary(art5Slots).standard.map(x=>x.max).join(",")==="4,2", JSON.stringify(spellSlotSummary(art5Slots)));
  const ek7={...newCharacter(),classes:[{name:"fighter",level:7,subclass:"fighter-eldritch knight"}],abilities:{str:10,dex:16,con:14,int:16,wis:10,cha:8}};
  const ek7Caster=spellcastersForCharacter(ek7).find(x=>x.classKey==="fighter");
  check("Eldritch Knight 7 reaches 2nd-level spells and native 4/2 third-caster slots", ek7Caster?.maxSpell===2 && spellSlotSummary(ek7).standard.map(x=>x.max).join(",")==="4,2", JSON.stringify({caster:ek7Caster&&{max:ek7Caster.maxSpell},slots:spellSlotSummary(ek7)}));
  const wiz3Pal5={...newCharacter(),classes:[{name:"wizard",level:3,subclass:"wizard-evocation"},{name:"paladin",level:5,subclass:"paladin-oath of devotion"}],abilities:{str:13,dex:10,con:14,int:16,wis:10,cha:16}};
  const wpSlots=spellSlotSummary(wiz3Pal5), wpCasters=spellcastersForCharacter(wiz3Pal5);
  check("Wizard 3 / Paladin 5 combines contributions to caster level 5", effectiveCasterLevel(wiz3Pal5)===5 && wpSlots.casterLevel===5 && wpSlots.standard.map(x=>x.max).join(",")==="4,3,2", JSON.stringify(wpSlots));
  check("Multiclass slot level does not grant higher-level class spells", wpCasters.find(x=>x.classKey==="wizard")?.maxSpell===2 && wpCasters.find(x=>x.classKey==="paladin")?.maxSpell===2, JSON.stringify(wpCasters.map(x=>({key:x.classKey,max:x.maxSpell}))));
  const wiz5War5={...newCharacter(),classes:[{name:"wizard",level:5,subclass:"wizard-evocation"},{name:"warlock",level:5,subclass:"warlock-the fiend"}],abilities:{str:8,dex:12,con:14,int:16,wis:10,cha:18}};
  const wwSlots=spellSlotSummary(wiz5War5), wwSummary=spellcastingSummary(wiz5War5);
  check("Wizard 5 / Warlock 5 keeps 4/3/2 standard slots and two 3rd-level Pact slots", wwSlots.standard.map(x=>x.max).join(",")==="4,3,2" && wwSlots.pact?.max===2 && wwSlots.pact?.slotLevel===3, JSON.stringify(wwSlots));
  check("Multiple class spell sources retain independent INT and CHA attack/DC values", wwSummary.some(x=>x.name==="Wizard"&&x.ability==="int"&&x.attack===7&&x.dc===15) && wwSummary.some(x=>x.name==="Warlock"&&x.ability==="cha"&&x.attack===8&&x.dc===16), JSON.stringify(wwSummary));
  const tieflingWizard={...newCharacter(),race:"tiefling",classes:[{name:"wizard",level:5,subclass:"wizard-evocation"}],abilities:{str:8,dex:14,con:14,int:18,wis:10,cha:12}};
  const twSources=spellcastersForCharacter(tieflingWizard), twSummary=spellcastingSummary(tieflingWizard);
  check("Racial casting ability stays independent from class casting ability", twSources.some(x=>x.kind==="race"&&x.ability==="cha") && twSources.some(x=>x.classKey==="wizard"&&x.ability==="int"), JSON.stringify(twSummary));
  const rangerWarlock={...newCharacter(),classes:[{name:"ranger",level:5,subclass:"ranger-hunter"},{name:"warlock",level:3,subclass:"warlock-the fiend"}],abilities:{str:10,dex:16,con:14,int:8,wis:16,cha:16}};
  const rwSlots=spellSlotSummary(rangerWarlock);
  check("Ranger plus Warlock preserves Ranger native slots because Pact Magic is separate", rwSlots.standard.map(x=>x.max).join(",")==="4,2" && rwSlots.pact?.max===2 && rwSlots.pact?.slotLevel===2, JSON.stringify(rwSlots));
  setSpellSlotUsed(rangerWarlock,"standard",2,1); setSpellSlotUsed(rangerWarlock,"pact",2,2); resetSpellSlots(rangerWarlock,"short");
  const rwAfterShort=spellSlotSummary(rangerWarlock);
  check("Short rest still restores only Pact slots in mixed half-caster/Pact builds", rwAfterShort.standard.find(x=>x.level===2)?.used===1 && rwAfterShort.pact?.used===0, JSON.stringify(rwAfterShort));
}

// v0.8.18: Spellcasting Audit III — destructive level/class/subclass transitions.
{
  const transition={...newCharacter(),classes:[{name:"wizard",level:5,subclass:"wizard-evocation"}],abilities:{str:8,dex:14,con:14,int:16,wis:10,cha:10}};
  let draft=createSpellWizardDraft(transition), wc=draft[0];
  wc.selections.cantrips=wc.cantrips.slice(0,wc.cantripCount).map(x=>x.id);
  // Deliberately include higher-level spells so deleveling has something real to prune.
  const high=wc.spells.filter(x=>x.level>=2).slice(0,2).map(x=>x.id), low=wc.spells.filter(x=>x.level===1&&!high.includes(x.id));
  wc.selections.spells=[...high,...low.map(x=>x.id)].slice(0,wc.spellCount);
  wc.selections.prepared=wc.selections.spells.slice(0,Math.min(wc.preparedCount,wc.selections.spells.length));
  applySpellWizard(transition,draft);
  transition.classes[0].level=2; reconcileSpellcastingState(transition);
  const downCaster=spellcastersForCharacter(transition)[0], downState=transition.spellcasting.casters[downCaster.id];
  check("Wizard 5 -> 2 immediately prunes spells above the new spell level", downState.spells.every(id=>Number(registries.SpellsList[id]?.level||0)<=1) && high.every(id=>!transition.spells.includes(id)), JSON.stringify({state:downState,spells:transition.spells}));
  check("Wizard 5 -> 2 caps retained spellbook selections to the new required count", downState.spells.length<=downCaster.spellCount, JSON.stringify({kept:downState.spells.length,max:downCaster.spellCount}));

  const rangerDown={...newCharacter(),classes:[{name:"ranger",level:5,subclass:"ranger-hunter"}],abilities:{str:10,dex:16,con:14,int:8,wis:16,cha:8}};
  let rd=createSpellWizardDraft(rangerDown), rc=rd[0];
  const r2=rc.spells.find(x=>x.level===2), r1=rc.spells.filter(x=>x.level===1).slice(0,rc.spellCount-1);
  rc.selections.spells=[...(r2?[r2.id]:[]),...r1.map(x=>x.id)].slice(0,rc.spellCount); rc.selections.cantrips=[]; rc.selections.prepared=[];
  applySpellWizard(rangerDown,rd); rangerDown.classes[0].level=3; reconcileSpellcastingState(rangerDown);
  const rdCaster=spellcastersForCharacter(rangerDown)[0], rdState=rangerDown.spellcasting.casters[rdCaster.id];
  check("Ranger 5 -> 3 removes previously known 2nd-level Ranger spells", !r2 || (!rdState.spells.includes(r2.id)&&!rangerDown.spells.includes(r2.id)), JSON.stringify({removed:r2?.id,state:rdState.spells}));
  check("Ranger 5 -> 3 reconciles native slots back to level-3 capacity", spellSlotSummary(rangerDown).standard.map(x=>x.max).join(",")==="3", JSON.stringify(spellSlotSummary(rangerDown)));

  const ekChange={...newCharacter(),classes:[{name:"fighter",level:7,subclass:"fighter-eldritch knight"}],abilities:{str:10,dex:16,con:14,int:16,wis:10,cha:8}};
  let ed=createSpellWizardDraft(ekChange), ec=ed[0]; ec.selections.cantrips=ec.cantrips.slice(0,ec.cantripCount).map(x=>x.id); ec.selections.spells=ec.spells.slice(0,ec.spellCount).map(x=>x.id); ec.selections.bonus=(ec.bonusChoices||[]).flatMap(b=>b.options.slice(0,b.count).map(x=>x.id)); ec.selections.prepared=[]; applySpellWizard(ekChange,ed);
  const ekManaged=[...ekChange.spellcasting.managedSpellIds]; ekChange.classes[0].subclass="fighter-champion"; reconcileSpellcastingState(ekChange);
  check("Removing a spellcasting subclass removes its caster and managed spells", spellcastersForCharacter(ekChange).length===0 && ekManaged.every(id=>!ekChange.spells.includes(id)), JSON.stringify({casters:spellcastersForCharacter(ekChange),spells:ekChange.spells}));

  const manual={...newCharacter(),classes:[{name:"wizard",level:3,subclass:"wizard-evocation"}],abilities:{str:8,dex:12,con:12,int:16,wis:10,cha:10},spells:["guidance"]};
  reconcileSpellcastingState(manual); manual.classes=[]; reconcileSpellcastingState(manual);
  check("Spellcasting reconciliation preserves genuinely manual/non-managed spell entries", manual.spells.includes("guidance"), JSON.stringify(manual.spells));
}

// Armor / Unarmored Defense regression checks (0.8.17 hotfix)
{
  const plain={...newCharacter(),classes:[{name:"fighter",level:1,subclass:""}],abilities:{str:10,dex:12,con:10,int:10,wis:10,cha:10}};
  check("Default unarmored AC is 10 + Dex", calculatedArmorClass(plain)===11, String(calculatedArmorClass(plain)));
  check("Base Unarmored registry entry is not duplicated in armor dropdown", !armorOptions().some(o=>String(o.label).toLowerCase()==="unarmored"), JSON.stringify(armorOptions().filter(o=>/unarm/i.test(o.label))));
  const monk={...newCharacter(),classes:[{name:"monk",level:1,subclass:""}],abilities:{str:10,dex:12,con:10,int:10,wis:16,cha:10}};
  monk.armor.unarmoredDefense="monk";
  check("Monk Unarmored Defense is offered and calculates 10 + Dex + Wis", unarmoredDefenseOptions(monk).some(o=>o.key==="monk") && calculatedArmorClass(monk)===14, JSON.stringify({opts:unarmoredDefenseOptions(monk),ac:calculatedArmorClass(monk)}));
  monk.armor.shield=true;
  check("Monk Unarmored Defense is suppressed by a shield", calculatedArmorClass(monk)===13, String(calculatedArmorClass(monk)));
  const barb={...newCharacter(),classes:[{name:"barbarian",level:1,subclass:""}],abilities:{str:16,dex:12,con:16,int:8,wis:10,cha:8}};
  barb.armor.unarmoredDefense="barbarian";
  check("Barbarian Unarmored Defense is offered and calculates 10 + Dex + Con", unarmoredDefenseOptions(barb).some(o=>o.key==="barbarian") && calculatedArmorClass(barb)===14, JSON.stringify({opts:unarmoredDefenseOptions(barb),ac:calculatedArmorClass(barb)}));
  barb.armor.shield=true;
  check("Barbarian Unarmored Defense permits a shield", calculatedArmorClass(barb)===16, String(calculatedArmorClass(barb)));
}


// v0.8.19: Level Progression Audit I — ASI/feat schedules, caps, and stable
// multiclass ownership when class rows are reordered.
{
  const f8={...newCharacter(),classes:[{name:"fighter",level:8,subclass:"fighter-champion"}],baseAbilities:{str:19,dex:14,con:14,int:10,wis:10,cha:10},abilities:{str:19,dex:14,con:14,int:10,wis:10,cha:10},contentSelections:{}};
  const fSlots=improvementSources(f8);
  check("Fighter 8 exposes its level 4, 6, and 8 improvement slots", fSlots.length===3, JSON.stringify(fSlots));
  setImprovementChoice(f8,fSlots[0].id,{mode:"+2",ability1:"str",ability2:"",feat:""}); reconcileAbilityScores(f8);
  check("ASI increases respect the normal ability-score maximum of 20", f8.abilities.str===20, JSON.stringify(f8.abilities));
  setImprovementChoice(f8,fSlots[1].id,{mode:"+1/+1",ability1:"dex",ability2:"con",feat:""}); reconcileAbilityScores(f8);
  check("Split ASI applies +1 to two different abilities", f8.abilities.dex===15 && f8.abilities.con===15, JSON.stringify(f8.abilities));

  const rogue10={...newCharacter(),classes:[{name:"rogue",level:10,subclass:"rogue-thief"}],contentSelections:{}};
  check("Rogue 10 exposes the extra Rogue improvement at level 10", improvementSources(rogue10).length===3, JSON.stringify(improvementSources(rogue10)));
  const f5={...newCharacter(),classes:[{name:"fighter",level:5,subclass:"fighter-champion"}],abilities:{str:16,dex:12,con:14,int:10,wis:10,cha:8}};
  check("Fighter 5 -> 6 level-up preview reports the Fighter bonus improvement", levelUpPreview(f5,"fighter").asiGained===1, JSON.stringify(levelUpPreview(f5,"fighter")));
  f5.classes[0].level=6;
  check("Fighter 6 -> 7 level-up preview does not invent an improvement", levelUpPreview(f5,"fighter").asiGained===0, JSON.stringify(levelUpPreview(f5,"fighter")));

  const multi={...newCharacter(),classes:[{name:"fighter",level:6,subclass:"fighter-champion"},{name:"wizard",level:4,subclass:"wizard-evocation"}],baseAbilities:{str:16,dex:12,con:14,int:16,wis:10,cha:8},abilities:{str:16,dex:12,con:14,int:16,wis:10,cha:8},contentSelections:{}};
  let ms=improvementSources(multi), fighterSlot=ms.find(x=>/^Fighter improvement 1/.test(x.label)), wizardSlot=ms.find(x=>/^Wizard improvement 1/.test(x.label));
  setImprovementChoice(multi,fighterSlot.id,{mode:"+2",ability1:"str",ability2:"",feat:""});
  setImprovementChoice(multi,wizardSlot.id,{mode:"+2",ability1:"int",ability2:"",feat:""});
  reconcileAbilityScores(multi);
  const before={str:multi.abilities.str,int:multi.abilities.int,fighterId:fighterSlot.id,wizardId:wizardSlot.id};
  multi.classes.reverse(); ms=improvementSources(multi); reconcileAbilityScores(multi);
  fighterSlot=ms.find(x=>/^Fighter improvement 1/.test(x.label)); wizardSlot=ms.find(x=>/^Wizard improvement 1/.test(x.label));
  check("Reordering multiclass rows preserves each class's ASI ownership", multi.abilities.str===18 && multi.abilities.int===18 && fighterSlot.value.ability1==="str" && wizardSlot.value.ability1==="int", JSON.stringify({before,after:multi.abilities,slots:ms}));
  check("ASI source IDs are stable and no longer depend on multiclass row position", fighterSlot.id==="asi:fighter:0" && wizardSlot.id==="asi:wizard:0", JSON.stringify(ms.map(x=>x.id)));

  const legacy={...newCharacter(),classes:[{name:"bard",level:4,subclass:"bard-college of lore"}],baseAbilities:{str:8,dex:14,con:14,int:10,wis:10,cha:16},abilities:{str:8,dex:14,con:14,int:10,wis:10,cha:16},contentSelections:{improvementChoices:{"asi:0:bard:0":{mode:"+2",ability1:"cha",ability2:"",feat:""}}}};
  const migrated=improvementSources(legacy); reconcileAbilityScores(legacy);
  check("Pre-0.8.19 index-based ASI selections migrate without losing the choice", migrated[0]?.id==="asi:bard:0" && migrated[0]?.value?.ability1==="cha" && legacy.abilities.cha===18 && !legacy.contentSelections.improvementChoices["asi:0:bard:0"], JSON.stringify({slots:migrated,store:legacy.contentSelections.improvementChoices,scores:legacy.abilities}));
}


// v0.8.20-0.8.24: pre-0.9 consolidation audits.
{
  // Stable class-owned choices: class row order must never be part of persistent identity.
  const stable={...newCharacter(),classes:[{name:"fighter",level:1,subclass:""},{name:"bard",level:3,subclass:"bard-college of lore"}],contentSelections:{}};
  let gp=generalProficiencyStatus(stable); const beforeIds=gp.rows.map(x=>x.id);
  stable.classes.reverse(); gp=generalProficiencyStatus(stable);
  check("0.8.20: reordering classes correctly recalculates starting-vs-multiclass proficiencies", beforeIds.join("|")!==gp.rows.map(x=>x.id).join("|") && gp.rows.some(x=>x.kind==="starting class"), JSON.stringify(gp.rows.map(x=>({id:x.id,kind:x.kind,type:x.type}))));

  const war={...newCharacter(),classes:[{name:"fighter",level:1,subclass:""},{name:"warlock",level:3,subclass:"warlock-the fiend"}],abilities:{str:13,dex:12,con:14,int:10,wis:10,cha:16},contentSelections:{}};
  let fcs=featureChoiceSources(war); const pact=fcs.find(x=>x.kind==="single"&&/Pact Boon/i.test(x.label));
  if(pact) setFeatureChoice(war,pact.id,"Pact of the Blade");
  war.classes.reverse(); fcs=featureChoiceSources(war);
  const pactAfter=fcs.find(x=>x.kind==="single"&&/Pact Boon/i.test(x.label));
  check("0.8.20: class feature choices survive class-row reordering", !pact || pactAfter?.selected==="Pact of the Blade", JSON.stringify(pactAfter));

  // v0.8.21: every core class can traverse levels 1-20 without corrupting class plans.
  const core=["barbarian","bard","cleric","druid","fighter","monk","paladin","ranger","rogue","sorcerer","warlock","wizard"];
  let progressionOk=true, progressionDetail="";
  for(const key of core) for(let level=1;level<=20;level++){
    const c={...newCharacter(),classes:[{name:key,level,subclass:""}]}; const unlock=subclassUnlockLevel(key); const subs=subclassesForClass(key); if(subs.length&&level>=unlock)c.classes[0].subclass=subs[0].key||subs[0].id;
    const issues=classPlanIssues(c).filter(x=>!/multiclass prerequisite needs manual verification/i.test(x));
    if(issues.length){progressionOk=false;progressionDetail=`${key} ${level}: ${issues.join(" | ")}`;break;}
  }
  check("0.8.21: all 12 core classes validate across levels 1-20 with legal subclasses", progressionOk, progressionDetail);

  // v0.8.22: slot/resource/rest invariants across representative caster families.
  const casterMatrix=[["bard",20],["paladin",20],["ranger",20],["artificer",20],["warlock",20]]; let slotInvariant=true,slotDetail="";
  for(const [key,level] of casterMatrix){const c={...newCharacter(),classes:[{name:key,level,subclass:""}]};const subs=subclassesForClass(key);if(subs.length)c.classes[0].subclass=subs[0].key||subs[0].id;try{const ss=spellSlotSummary(c);if(ss.standard.some(x=>x.max<0||x.used<0||x.used>x.max)||(ss.pact&&(ss.pact.used<0||ss.pact.used>ss.pact.max)))throw new Error("invalid slot bounds");}catch(e){slotInvariant=false;slotDetail=`${key}: ${e.message}`;break;}}
  check("0.8.22: representative full/half/Artificer/Pact casters maintain valid slot bounds",slotInvariant,slotDetail);

  // v0.8.23: combat derivations remain finite through extreme legal ability values.
  let combatInvariant=true,combatDetail="";
  for(const key of core){const c={...newCharacter(),classes:[{name:key,level:20,subclass:""}],abilities:{str:20,dex:20,con:20,int:20,wis:20,cha:20},baseAbilities:{str:20,dex:20,con:20,int:20,wis:20,cha:20}};const subs=subclassesForClass(key);if(subs.length)c.classes[0].subclass=subs[0].key||subs[0].id;try{const cp=combatProfile(c,calculatedArmorClass(c));if(!Number.isFinite(cp.ac.ac)||!Number.isFinite(initiativeSummary(c).bonus)||!Number.isFinite(derivedSpeed(c).walk))throw new Error("non-finite combat value");}catch(e){combatInvariant=false;combatDetail=`${key}: ${e.message}`;break;}}
  check("0.8.23: combat/AC/initiative/speed derivations stay finite for every core class",combatInvariant,combatDetail);

  // v0.8.24: save/load normalization must tolerate sparse older character objects.
  const sparse=normalizeCharacter({name:"Legacy",classes:[{name:"fighter",level:5,subclass:"fighter-champion"}],abilities:{str:18},hp:{max:42},spellcasting:{slots:{standard:{1:{used:99}}}},combat:{conditions:null}});
  check("0.8.24: sparse legacy saves normalize all required nested state", sparse.baseAbilities.str===18&&sparse.abilities.str===18&&Array.isArray(sparse.combat.conditions)&&sparse.behavior?.resources&&sparse.spellcasting?.casters&&sparse.currency?.gp===0, JSON.stringify({abilities:sparse.abilities,combat:sparse.combat,behavior:sparse.behavior}));
}
console.log("MPMB Web v0.8.25-hotfix.1 Manual Torture-Test Consolidation compatibility test\n");
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.details ? `  (${c.details})` : ""}`);
console.log("\\nPDF base registry counts:");
for (const [k,v] of Object.entries(baseCounts)) if (v) console.log(`  ${k.padEnd(24)} ${v}`);
console.log("\\nFinal additive registry counts:");
for (const [k,v] of Object.entries(counts)) if (v) console.log(`  ${k.padEnd(24)} ${v}`);

const failed = checks.filter(c => !c.ok);
if (failed.length) { console.error(`\n${failed.length} check(s) FAILED.`); process.exitCode = 1; }
else console.log(`\nAll ${checks.length} checks passed.`);

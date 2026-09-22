import { loadCharacter, saveCharacter, normalizeCharacter, newCharacter } from "./state.js";
import { abilityOrder, abilityNames, abilityMod, formatMod, proficiencyBonus, saveBonus, skillBonus, passivePerception, totalLevel } from "./rules.js";
import { APP_VERSION, APP_STAGE, skillMap, developmentStatus } from "./content/core-content.js";
import { importReportText } from "./mpmb/importer.js";
import { registries, registryCounts } from "./content/registry.js";
import { loadBuiltInContent, importAdditionalContent, getBuiltInReport, getBaseReport } from "./content/load-content.js";
import { classOptions, subclassesForClass, subclassUnlockLevel, validSubclassForClass, raceOptions, backgroundOptions, activeFeatures, sourceShort } from "./content/queries.js";
import { reconcileSkillProficiencies, skillChoiceStatus, setSkillChoice, skillTooltip, availableChoicesForSource } from "./content/skill-proficiencies.js";
import { owlBearStatus } from "./owlbear/bridge.js";
import { raceVariantsFor } from "./content/race-variants.js";
import { backgroundVariantsFor, resolvedBackgroundData } from "./content/background-variants.js";
import { expertiseSources, reconcileExpertise, setExpertiseChoice, availableExpertise } from "./content/expertise.js";
import { HP_MODES, reconcileHP, rerollHP, hpBreakdown } from "./content/hp.js";
import { ensureSheetSections, featOptions, weaponOptions, armorOptions, magicItemOptions, spellOptions, gearOptions, featSummary, weaponSummary, calculatedArmorClass, magicItemSummary, spellSummary, weaponEntryFromId, setWeaponEnhancement, syncWeaponNameEnhancement, selectArmor, setArmorEnhancement, syncArmorNameEnhancement, unarmoredDefenseOptions } from "./content/sheet-sections.js";
import { enhanceSheetLayout, resetSheetLayout, saveLayoutPreset, loadLayoutPreset, hasLayoutPreset, DEFAULT_PANEL_ORDER } from "./layout.js";
import { createStartingGearDraft, applyStartingGear, categoryPicksForAlternative } from "./content/starting-gear.js";
import { createSpellWizardDraft, applySpellWizard, validSpellWizardDraft, preparedPool, spellStatuses, spellGrantMetadata, spellcastingSummary, reconcileSpellcastingState, spellSlotSummary, setSpellSlotUsed, spellcastersForCharacter } from "./content/spellcasting.js";
import { reconcileSaveProficiencies, saveAdvantageInfo, setSaveProficiencyOverride, clearSaveProficiencyOverride } from "./content/save-status.js";
import { ABILITY_KEYS, ABILITY_LABELS, racialAbilityStatus, setRacialAbilityChoice, setRacialAbilityMode, clearRacialAbilityState, generalProficiencyStatus, setGeneralProficiencyChoice, reconcileGeneralProficiencies, featureChoiceSources, setFeatureChoice, toggleOptionalFeatureChoice, setExtraFeatureChoice, improvementSources, setImprovementChoice, bonusFeatSources, setBonusFeatChoice, featOptionsWithEligibility, featEligibility, selectedFeatIds, characterChoiceIssues, reconcileFeatAssignments } from "./content/choice-framework.js";
import { reconcileAbilityScores, abilityScoreBreakdown, featAbilityChoiceSources, setFeatAbilityChoice, resolveMagicItemData, setRacialAbilityOverride, clearRacialAbilityOverride, setManualAbilityAdjustment } from "./content/ability-scores.js";
import { loadThemePrefs, saveThemePrefs, applyThemePrefs, restoreOriginalTheme, resetAllPanelOverrides, setPanelOverride, clearPanelOverride, rgbToHex, hexToRgb, normalizeRgb } from "./theme.js";
import { creationStatus, classPlanIssues, multiclassEligibility, levelUpPreview, applyLevelUp } from "./content/character-workflow.js";
import { combatProfile, combatSaveBonus, savingThrowExtra, combatPassivePerception, STANDARD_CONDITIONS } from "./content/combat.js";
import { reconcileBehaviorState, behaviorProfile, resourceStatus, setResourceUsed, behaviorDiagnostics } from "./content/behavior-runtime.js";
import { performRest } from "./content/rests.js";

let character = ensureSheetSections(loadCharacter());
let lastImport = null;
const builtInImport = loadBuiltInContent();
// Migrate older saves that stored a background variant directly in the background field.
if (character.background && registries.BackgroundList[character.background]?.baseBackground && !character.backgroundVariant) { character.backgroundVariant = character.background; character.background = registries.BackgroundList[character.backgroundVariant].baseBackground; }
reconcileFeatAssignments(character);
reconcileAbilityScores(character);
const app = document.querySelector("#app");
const mpmbInput = document.querySelector("#mpmb-file-input");
const charInput = document.querySelector("#character-file-input");
const levelDialog = document.querySelector("#level-dialog");
const fullWizardDialog = document.querySelector("#full-wizard-dialog");
const creationDialog = document.querySelector("#creation-dialog");
const levelUpDialog = document.querySelector("#levelup-dialog");
const gearDialog = document.querySelector("#gear-dialog");
const spellDialog = document.querySelector("#spell-dialog");
const themeDialog = document.querySelector("#theme-dialog");
let gearWizardDraft = null;
let spellWizardDraft = null;
let creationDraft = null;
let fullWizardStep = 0;
let resumeFullWizard = false;
let creationTargetLevel = 1;
let levelUpDraft = null;
const SPELL_DESCRIPTION_VIEW_KEY = "mpmb-web-sheet.spells.fullDescriptions.v1";
let showFullSpellDescriptions = false;
let expandedSpellIds = new Set();
try { showFullSpellDescriptions = localStorage.getItem(SPELL_DESCRIPTION_VIEW_KEY) === "true"; } catch {}
function spellIsExpanded(id){ return expandedSpellIds.has(id); }
function spellCompactMeta(sp){
  const bits=[sp.level?`L${sp.level}`:'C', sp.school||'', sp.castingTime||'—', sp.range||'—', sp.duration||'—', sp.components||'—'];
  return bits.filter(Boolean).map(esc).join(' · ');
}
function spellTooltip(sp){ return esc(sp.descriptionFull||sp.description||''); }
function spellExpandButton(id){ return `<button type="button" class="spell-expand-toggle" data-spell-expand="${esc(id)}" aria-expanded="${spellIsExpanded(id)?'true':'false'}" title="${spellIsExpanded(id)?'Collapse spell details':'Expand spell details'}">${spellIsExpanded(id)?'▾':'▸'}</button>`; }
function knownCantripIds(){
  const ids=new Set();
  for(const c of spellcastersForCharacter(character)) {
    const state=character.spellcasting?.casters?.[c.id]||{};
    for(const id of [...(state.cantrips||[]),...c.autoSpells]) if(registries.SpellsList[id]?.level===0) ids.add(id);
  }
  return ids;
}
function expandPreparedSpells(){
  reconcileSpellcastingState(character);
  const ids=knownCantripIds();
  for(const c of spellcastersForCharacter(character)) {
    const state=character.spellcasting?.casters?.[c.id]||{};
    for(const id of [...(state.prepared||[]),...(c.autoPrepared||[])]) ids.add(id);
  }
  expandedSpellIds=ids;
}

function esc(v) { return String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function randomButton(label="Random") { return `<button type="button" class="random-choice-button" data-random-choice title="Choose a random valid option">🎲 ${esc(label)}</button>`; }
function randomSelectWrap(selectHtml,label="Random") { return `<span class="random-select-wrap">${selectHtml}${randomButton(label)}</span>`; }
function syncSearchableSelectInput(select) {
  if(!(select instanceof HTMLSelectElement)) return;
  const input=select.closest(".searchable-select-control")?.querySelector(".searchable-select-input");
  if(!input) return;
  const opt=select.selectedOptions?.[0];
  input.value=(opt?.textContent||"").trim();
}
function randomClaimedValues(select) {
  const claimed=new Set();
  if(!(select instanceof HTMLSelectElement)) return claimed;
  const d=select.dataset;
  // Choice rows that share a source/pool must never randomly choose a value
  // already held by a sibling row. Do this from live values instead of relying
  // on disabled attributes, because several wizards intentionally avoid a full
  // redraw after every pick.
  let selector="";
  if(d.spellCaster!==undefined && d.spellKind!==undefined) selector=`select[data-spell-caster="${CSS.escape(d.spellCaster)}"][data-spell-kind="${CSS.escape(d.spellKind)}"]`;
  else if(d.skillSource!==undefined) selector=`select[data-skill-source="${CSS.escape(d.skillSource)}"]`;
  else if(d.expertiseSource!==undefined) selector=`select[data-expertise-source="${CSS.escape(d.expertiseSource)}"]`;
  else if(d.generalProfSource!==undefined) selector=`select[data-general-prof-source="${CSS.escape(d.generalProfSource)}"]`;
  else if(d.extraFeatureSource!==undefined) selector=`select[data-extra-feature-source="${CSS.escape(d.extraFeatureSource)}"]`;
  if(selector) for(const other of document.querySelectorAll(selector)) if(other!==select && other.value) claimed.add(other.value);
  return claimed;
}
function chooseRandomSelectOption(select) {
  if(!select || select.disabled) return false;
  const claimed=randomClaimedValues(select);
  const options=[...select.options].filter(o=>o.value && !o.disabled && o.dataset.randomSkip!=="true" && !claimed.has(o.value));
  if(!options.length) return false;
  const pick=options[Math.floor(Math.random()*options.length)];
  select.value=pick.value;
  // Keep the visible searchable combobox in sync with the hidden native select.
  // Spell-wizard cantrip changes intentionally do not redraw the dialog, so
  // without this a random pick succeeded in state but looked like a no-op.
  syncSearchableSelectInput(select);
  select.dispatchEvent(new Event("change",{bubbles:true}));
  queueMicrotask(()=>syncSearchableSelectInput(select));
  return true;
}
function title(s) { return String(s || "").replace(/\b\w/g, m => m.toUpperCase()); }
function reconcileCharacterState({save=true}={}) {
  reconcileFeatAssignments(character);
  const abilityState=reconcileAbilityScores(character);
  reconcileGeneralProficiencies(character);
  reconcileSkillProficiencies(character);
  reconcileExpertise(character);
  reconcileSaveProficiencies(character);
  reconcileHP(character);
  ensureSheetSections(character);
  reconcileSpellcastingState(character);
  reconcileBehaviorState(character);
  const baseAc=calculatedArmorClass(character);
  character.armorClass=combatProfile(character,baseAc).ac.ac;
  character.speed=combatProfile(character,baseAc).speed.walk;
  if(save) saveCharacter(character);
  return abilityState;
}
function setByPath(path, value, {renderNow=true}={}) {
  const parts = path.split("."); let obj = character;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  obj[parts.at(-1)] = value;
  if (path === "race") { character.raceVariant = ""; clearRacialAbilityState(character); }
  if (path === "raceVariant") clearRacialAbilityState(character);
  if (path === "background") character.backgroundVariant = "";
  if(renderNow){ reconcileCharacterState(); render(); }
}

function ordinal(n){const x=Number(n)||0;const mod100=x%100;if(mod100>=11&&mod100<=13)return `${x}th`;return `${x}${x%10===1?'st':x%10===2?'nd':x%10===3?'rd':'th'}`;}
function slotPips(pool,level,max,used){return `<div class="slot-pips" role="group" aria-label="${pool==='pact'?'Pact Magic':`${ordinal(level)}-level`} spell slots">${Array.from({length:max},(_,i)=>`<button type="button" class="slot-pip ${i<used?'used':'available'}" data-spell-slot-pip="${pool}" data-spell-slot-level="${level}" data-spell-slot-index="${i}" title="${i<used?'Mark this slot available':'Mark this slot used'}">${i<used?'×':'○'}</button>`).join('')}</div>`;}
function spellSlotsHtml(){
  const slots=spellSlotSummary(character);
  if(!slots.standard.length&&!slots.pact)return `<div class="spell-slot-panel"><strong>Spell slots</strong><span class="muted">No spell-slot pool for this character.</span></div>`;
  const standard=slots.standard.length?`<div class="slot-pool"><div class="slot-pool-head"><strong>Spellcasting slots</strong><span>slot progression level ${slots.casterLevel}</span></div><div class="slot-level-grid">${slots.standard.map(x=>`<div class="slot-level"><span><strong>${ordinal(x.level)}</strong> ${x.remaining}/${x.max} available</span>${slotPips('standard',x.level,x.max,x.used)}</div>`).join('')}</div></div>`:'';
  const pact=slots.pact?`<div class="slot-pool pact-pool"><div class="slot-pool-head"><strong>Pact Magic</strong><span>Warlock ${slots.warlockLevel} · ${ordinal(slots.pact.slotLevel)}-level slots</span></div><div class="slot-level"><span><strong>${slots.pact.remaining}/${slots.pact.max}</strong> available</span>${slotPips('pact',slots.pact.slotLevel,slots.pact.max,slots.pact.used)}</div></div>`:'';
  return `<div class="spell-slot-panel">${standard}${pact}</div>`;
}

function render() {
  // Rebuilding #app should not throw the user back up the sheet. Keep the
  // viewport anchored unless a caller explicitly scrolls somewhere afterward.
  const preservedScrollX=window.scrollX, preservedScrollY=window.scrollY;
  const prof = proficiencyBonus(character); const level = totalLevel(character); const counts = registryCounts(); const obr = owlBearStatus();
  const races = raceOptions(); const backgrounds = backgroundOptions(); const variants = raceVariantsFor(character.race); const backgroundVariants = backgroundVariantsFor(character.background); const features = activeFeatures(character);
  const abilityState=reconcileCharacterState({save:false}); const skillSources = skillChoiceStatus(character); const expertise = reconcileExpertise(character); const issues = characterIssues(); const buildStatus=creationStatus(character); const combat=combatProfile(character,calculatedArmorClass(character)); const behavior=behaviorProfile(character); const behaviorResources=resourceStatus(character); const trackerResources=behaviorResources.filter(r=>!r.spellSheetResource); const behaviorDiags=behaviorDiagnostics(character);
  app.innerHTML = `
    <div class="toolbar">
      <h1>MPMB Web Character Sheet <span class="version">v${APP_VERSION} ${APP_STAGE}</span></h1>
      <button class="primary-action" data-act="full-wizard">Full Character Wizard</button>
      <button data-act="level-up">Level Up</button>
      <button class="rest-action" data-act="short-rest" title="Restore Pact Magic and features that recover on a short rest">Short Rest</button>
      <button class="rest-action" data-act="long-rest" title="Restore all spell slots and features that recover on a long rest or daily reset">Long Rest</button>
      <button data-act="levels">Classes / Levels (${level})</button>
      <button data-act="load-mpmb">Import Additional MPMB JS</button>
      <button data-act="report" ${lastImport ? "" : "disabled"}>Export Last Import Report</button>
      <button data-act="export">Export Character</button>
      <button data-act="tester-report" title="Export app/version, diagnostics, content counts, and this character for a bug report">Tester Report</button>
      <button data-act="print" title="Open the system print dialog with a clean printable character-sheet layout">Print Sheet</button>
      <button data-act="import">Import Character</button>
      <button data-act="theme" title="Change page, panel, or individual section colors. Color settings are saved only in this browser.">Colors</button>
      <span class="toolbar-divider" aria-hidden="true"></span>
      <button data-act="reset-layout" title="Restore the default panel order, sizes, and expanded state. Saved custom layouts are kept.">Reset Layout</button>
      <button data-act="save-layout-1" title="Save the current panel order, collapsed states, and sizes to this browser">Save Layout 1</button>
      <button data-act="load-layout-1" ${hasLayoutPreset(1) ? "" : "disabled"} title="Load Custom Layout 1 from this browser">Load Layout 1</button>
      <button data-act="save-layout-2" title="Save the current panel order, collapsed states, and sizes to this browser">Save Layout 2</button>
      <button data-act="load-layout-2" ${hasLayoutPreset(2) ? "" : "disabled"} title="Load Custom Layout 2 from this browser">Load Layout 2</button>
    </div>
    <div class="layout-local-note"><strong>Layout presets are browser-local.</strong> Reset Layout restores the default without deleting Layout 1 or 2. Presets are not included in character exports and will not follow you to another browser/device unless we add that later.</div>
    <div class="baseline-banner ${builtInImport.ok ? "ok" : "error"}">
      <strong>MPMB PDF base + WotC/UA add-on:</strong> ${builtInImport.ok && builtInImport.baseReport?.ok ? "loaded automatically" : "FAILED TO LOAD"}
      <span>${Object.values(counts).reduce((a,b)=>a+b,0)} registered records · PDF baseline protected from add-on duplicates</span>
    </div>
    ${issues.length ? `<div class="validation-banner"><strong>Character choices needed:</strong> ${issues.map(esc).join(" · ")}</div>` : ""}
    <section class="sheet">
      <section class="panel identity" data-panel-id="identity">
        <div class="identity-fields">
          <div class="identity-row identity-names">
            ${field("Character Name", "name", character.name)}
            ${field("Player", "player", character.player)}
          </div>
          <div class="identity-row identity-origin">
            ${selectField("Race", "race", character.race, races, "Select race...")}
            ${variants.length ? raceVariantField(variants) : `<div class="field identity-variant-placeholder" aria-hidden="true"><label>Race Variant / Subrace</label><input disabled value="None / not applicable"></div>`}
            ${selectField("Background", "background", character.background, backgrounds, "Select background...")}
            ${backgroundVariants.length ? backgroundVariantField(backgroundVariants) : `<div class="field identity-variant-placeholder" aria-hidden="true"><label>Background Variant</label><input disabled value="None / not applicable"></div>`}
          </div>
          <div class="identity-row identity-roleplay">
            ${field("Alignment", "alignment", character.alignment)}
            ${field("Age", "age", character.age)}
            ${field("Height", "height", character.height)}
            ${field("Weight", "weight", character.weight)}
            ${field("Eyes", "eyes", character.eyes)}
            ${field("Hair", "hair", character.hair)}
            ${field("Skin", "skin", character.skin)}
            ${field("Sex", "sex", character.sex)}
            ${field("Faith / Deity", "deity", character.deity)}
          </div>
        </div>
      </section>

      ${buildStatus.complete ? "" : `<section class="panel wide-panel" data-panel-id="creation-status">
        <h2>Creation Status <span class="badge">${buildStatus.remaining} item${buildStatus.remaining===1?"":"s"} remaining</span></h2>
        <div class="creation-status-summary incomplete"><strong>Character setup is not complete yet.</strong> Use the buttons below to jump directly to unfinished parts.</div>
        <div class="creation-checklist">${buildStatus.items.filter(item=>!item.complete&&!item.optional).map(creationChecklistRow).join("")}</div>
        <div class="creation-status-actions"><button type="button" data-act="full-wizard">Open Full Wizard</button><button type="button" data-act="character-builder">Edit Build Basics</button><button type="button" data-act="level-up">Level Up</button></div>
      </section>`}

      <section class="panel wide-panel" data-panel-id="choices">
        <h2>Character Choices <span class="badge">languages · tools · ASIs · feats · feature choices</span></h2>
        <div class="choices-callout"><strong>This is the Character Choices area.</strong> Language choices, tool choices, racial ability choices, bonus-feat slots, ASI/feat slots, and required feature choices appear here. Skill proficiency choices remain in the separate Skill Proficiencies &amp; Expertise section.</div>
        ${characterChoicesPanel()}
      </section>

      <section class="panel" data-panel-id="abilities">
        <h2>Abilities</h2>
        <div class="ability-grid">${abilityOrder.map(a => { const d=abilityState.details[a]; const mods=[...d.adds.map(x=>`${x.label} ${x.value>=0?"+":""}${x.value}`),...d.overrides.map(x=>`${x.label} sets at least ${x.value}`),...d.maxima.map(x=>`${x.label} ${x.increase?`raises max +${x.increase}`:`max ${x.set}`}`)]; const raceAdd=d.adds.filter(x=>x.source==='race').reduce((n,x)=>n+Number(x.value||0),0); const other=Number(character.contentSelections?.manualAbilityAdjustments?.[a])||0; const racialManual=Object.prototype.hasOwnProperty.call(character.contentSelections?.racialAbilityOverrides||{},a); return `<div class="ability" title="${esc(mods.length?`Base ${d.base}; ${mods.join("; ")}`:`Base ${d.base}; no active modifiers`)}"><strong>${abilityNames[a]}</strong><label class="ability-base"><span>Base</span><input data-path="baseAbilities.${a}" type="number" min="1" max="30" value="${character.baseAbilities[a]}"></label><label class="ability-base"><span>Racial${racialManual?' *':''}</span><input data-racial-score="${a}" type="number" min="-10" max="10" value="${raceAdd}"></label><label class="ability-base"><span>Other</span><input data-other-score="${a}" type="number" min="-30" max="30" value="${other}"></label>${racialManual?`<button type="button" class="ability-auto-reset" data-racial-score-reset="${a}" title="Return this racial modifier to automatic">Auto</button>`:''}<div class="ability-final"><span>Final</span><b>${character.abilities[a]}</b></div><div class="mod">${formatMod(abilityMod(character.abilities[a]))}</div></div>`; }).join("")}</div><p class="muted">Base is your rolled/point-buy score. Racial is automatic but editable; an asterisk marks a manual override and Auto restores source-driven calculation. Other is a free manual adjustment. ASIs, feats, and supported magic items remain automatic.</p>
        <h2 class="section-gap">Saving Throws <span class="badge">proficiency + advantage awareness</span></h2>
        <div class="two-col list">${abilityOrder.map(a => saveRow(a)).join("")}</div>
        ${conditionalSaveAdvantageSummary()}
      </section>

      <section class="panel" data-panel-id="combat">
        <h2>Combat Summary <span class="badge">rules-driven</span></h2>
        <div class="stats-row">${stat("Level", level)}${stat("Proficiency", formatMod(prof))}${stat("AC", combat.ac.ac)}${stat("Initiative", formatMod(combat.initiative.bonus))}${stat("Passive Perception", combatPassivePerception(character))}</div>
        <div class="stats-row section-small">${stat("Speed", `${combat.speed.walk} ft`)}${stat("Classes", character.classes.length)}</div>
        ${hpControls()}
        <div class="combat-adjust-grid"><label><span>Initiative misc.</span><input type="number" data-combat-number="initiativeMisc" value="${Number(character.combat?.initiativeMisc||0)}"></label><label><span>Speed misc.</span><input type="number" data-combat-number="speedMisc" value="${Number(character.combat?.speedMisc||0)}"></label></div>
        ${combat.initiative.notes.length?`<div class="combat-source-note"><strong>Initiative:</strong> ${combat.initiative.notes.map(esc).join(" · ")}</div>`:""}
        ${combat.speed.notes.length?`<div class="combat-source-note"><strong>Speed:</strong> ${combat.speed.notes.map(esc).join(" · ")}</div>`:""}
        <div class="combat-derived-grid"><div><h3>Senses</h3>${combat.senses.length?combat.senses.map(x=>`<div class="combat-tag" title="${esc(x.source)}">${esc(x.name)}${x.range?` ${esc(x.range)}${Number.isFinite(Number(x.range))?" ft":""}`:""}</div>`).join(""):`<span class="muted">None detected</span>`}</div><div><h3>Resistances</h3>${combat.resistances.length?combat.resistances.map(x=>`<div class="combat-tag" title="${esc(x.source)}">${esc(x.name)}</div>`).join(""):`<span class="muted">None detected</span>`}</div></div>
        <h3 class="section-gap">Conditions</h3><div class="condition-grid">${STANDARD_CONDITIONS.map(([id,label,note])=>`<label title="${esc(note)}"><input type="checkbox" data-condition="${id}" ${(character.combat?.conditions||[]).includes(id)?"checked":""}> ${esc(label)}</label>`).join("")}</div>
        ${combat.conditions.length?`<div class="condition-reminders">${combat.conditions.map(([,label,note])=>`<div><strong>${esc(label)}:</strong> ${esc(note)}</div>`).join("")}</div>`:""}
        <h2 class="section-gap">Classes</h2>
        <div class="list">${character.classes.map(c => classSummary(c)).join("")}</div>
      </section>

      <section class="panel" data-panel-id="skills">
        <h2>Skills <span class="badge">hover for proficiency sources</span></h2>
        <div class="two-col list">${skillMap.map(([name,a]) => `<div class="list-row skill-row" title="${esc(skillTooltip(character,name))}"><span><span class="prof-dot ${character.skillProficiencies[name] ? "on" : ""}">${character.skillProficiencies[name] ? "●" : "○"}</span> ${name}${Number(character.skillProficiencies[name])===2 ? ` <span class="expertise-mark">EXPERTISE</span>` : ""} <span class="muted">${abilityNames[a]}</span></span><strong>${formatMod(skillBonus(character,a,name))}</strong></div>`).join("")}</div>
        <p class="muted skill-help">Hover a skill to see which selected race, background, or class grants it automatically or allows it as a choice.</p>
      </section>

      <section class="panel" data-panel-id="skill-proficiencies">
        <h2>Skill Proficiencies <span class="badge">0.3.3</span></h2>
        ${skillSources.length ? `<div class="skill-source-list">${skillSources.map(skillSourceCard).join("")}</div>` : `<p class="muted">Choose a race, background, and class to see their skill proficiency grants and choices.</p>`}
        ${expertise.length ? `<h3 class="section-gap">Expertise</h3><div class="skill-source-list">${expertise.map(expertiseCard).join("")}</div>` : ""}
      </section>


      <section class="panel wide-panel" data-panel-id="feats">
        <h2>Feats <span class="badge">basic selection</span></h2>
        ${collectionPicker("feat", featOptions(), "Add feat...")}
        <div class="card-list">${selectedFeatIds(character).length ? selectedFeatIds(character).map((id,i)=>featCard(id,i, !(character.feats||[]).includes(id))).join("") : `<p class="muted">No feats selected.</p>`}</div>
      </section>

      <section class="panel wide-panel" data-panel-id="weapons">
        <h2>Attacks & Weapons <span class="badge">basic attack math</span></h2>
        ${collectionPicker("weapon", weaponOptions(), "Add weapon...")}
        <div class="card-list">${character.weapons.length ? character.weapons.map((id,i)=>weaponCard(id,i)).join("") : `<p class="muted">No weapons selected.</p>`}</div>
      </section>

      <section class="panel wide-panel" data-panel-id="armor">
        <h2>Armor & AC <span class="badge">editable + magic bonus</span></h2>
        <div class="equipment-controls armor-edit-grid">
          <label><span>Armor</span><select data-section-select="armor">${unarmoredDefenseOptions(character).map(o=>`<option value="__unarmored_${o.key}" ${!character.armor.selected && (character.armor.unarmoredDefense||"normal")===o.key?"selected":""}>${esc(o.label)}</option>`).join("")}${armorOptions().map(o=>`<option value="${esc(o.key)}" ${o.key===character.armor.selected?"selected":""}>${esc(o.label)}</option>`).join("")}</select></label>
          <label><span>Display name</span><input data-armor-field="name" value="${esc(character.armor.name||(!character.armor.selected?"Unarmored":""))}" placeholder="e.g. Plate +1"></label>
          <label><span>Magic bonus</span><select data-armor-enhancement>${[0,1,2,3].map(n=>`<option value="${n}" ${Number(character.armor.enhancement||0)===n?"selected":""}>${n?`+${n}`:"Normal"}</option>`).join("")}</select></label>
          <label><span>Base AC</span><input type="number" data-armor-field="baseAc" value="${character.armor.baseAc??(!character.armor.selected?10:"")}" placeholder="From armor"></label>
          <label><span>Armor type</span><select data-armor-field="typeOverride">${["unarmored","light","medium","heavy"].map(t=>`<option value="${t==="unarmored"?"":t}" ${(!character.armor.selected&&t==="unarmored")||(String(character.armor.typeOverride||"").toLowerCase()===t)?"selected":""}>${title(t)}</option>`).join("")}</select></label>
          <label class="checkline"><input type="checkbox" data-section-check="shield" ${character.armor.shield?"checked":""}> Shield</label>
          <label><span>Shield magic bonus</span><select data-shield-enhancement ${character.armor.shield?"":"disabled"}>${[0,1,2,3].map(n=>`<option value="${n}" ${Number(character.armor.shieldEnhancement||0)===n?"selected":""}>${n?`+${n}`:"Normal"}</option>`).join("")}</select></label>
          <label><span>Misc AC</span><input type="number" data-section-number="armor-misc" value="${Number(character.armor.misc||0)}"></label>
        </div>
        <p class="muted">Selecting armor fills its normal fields. You can edit them afterward. Typing “+1”, “+2”, or “+3” into the armor name automatically applies that magic AC bonus.</p>
        <div class="big-result">Calculated AC: <strong>${combat.ac.ac}</strong></div>${combat.ac.extras.length?`<div class="combat-source-note"><strong>AC modifiers:</strong> ${combat.ac.extras.map(x=>`${esc(x.source)} ${x.mod>=0?"+":""}${x.mod}`).join(" · ")}</div>`:""}${!combat.armor.proficient?`<div class="validation-banner"><strong>Armor warning:</strong> You are not proficient with this armor.</div>`:""}${!combat.armor.shieldProficient?`<div class="validation-banner"><strong>Shield warning:</strong> You are not proficient with shields.</div>`:""}${combat.armor.stealthDisadvantage?`<div class="combat-source-note">Stealth checks have disadvantage from the equipped armor.</div>`:""}
      </section>

      <section class="panel wide-panel" data-panel-id="magic-items">
        <h2>Magic Items <span class="badge">selection + attunement</span></h2>
        ${collectionPicker("magic", magicItemOptions(), "Add magic item...")}
        <div class="card-list">${character.magicItems.length ? character.magicItems.map((x,i)=>magicCard(x,i)).join("") : `<p class="muted">No magic items selected.</p>`}</div>
      </section>

      <section class="panel wide-panel" data-panel-id="spells">
        <h2>Spells <span class="badge">guided spellcasting</span></h2>
        <div class="equipment-toolbar">
          ${collectionPicker("spell", spellOptions(), "Add spell manually...")}
          <button type="button" data-act="spell-wizard">Generate / Manage Spell List</button>
          <div class="spell-view-controls" role="group" aria-label="Spell display controls"><button type="button" data-act="expand-prepared-spells">Expand prepared + cantrips</button><button type="button" data-act="expand-all-spells">Expand all spells</button><button type="button" data-act="collapse-all-spells">Collapse all spells</button></div>
          <label class="inline-check spell-description-toggle" title="Use the source's full spell text when a spell is expanded. This display preference is stored only in this browser."><input type="checkbox" data-spell-full-descriptions ${showFullSpellDescriptions?"checked":""}> Full descriptions when expanded</label>
        </div>
        ${spellcastingSummary(character).length ? `<div class="spellcasting-summary">${spellcastingSummary(character).map(x=>`<div><strong>${esc(x.name)}</strong><span>${x.ability?`${abilityNames[x.ability]} · attack ${formatMod(x.attack)} · DC ${x.dc}`:'Spellcasting ability choice pending'}${x.maxSpell?` · max spell level ${x.maxSpell}`:''}${x.kind==='pact'?' · Pact Magic':x.kind==='race'?' · racial':x.kind==='feat'?' · feat':''}</span></div>`).join("")}</div>` : `<p class="muted">No active spellcasting source detected.</p>`}
        ${spellSlotsHtml()}
        ${preparedCasterPanels()}
        <div class="card-list">${nonListManagedSpells().length ? nonListManagedSpells().map(({id,index})=>spellCard(id,index)).join("") : (preparedCasterPanels()?"":`<p class="muted">No spells selected.</p>`)}</div>
      </section>

      <section class="panel wide-panel" data-panel-id="equipment">
        <h2>Equipment & Gear <span class="badge">starting gear wizard</span></h2>
        <div class="equipment-toolbar">
          ${collectionPicker("gear", gearOptions(), "Add gear...")}
          <button type="button" data-act="gear-wizard">Starting Gear Wizard</button>
        </div>
        <div class="currency-grid">${["cp","sp","ep","gp","pp"].map(k=>`<label><span>${k.toUpperCase()}</span><input type="number" min="0" data-currency="${k}" value="${Number(character.currency?.[k]||0)}"></label>`).join("")}</div>
        <div class="inventory-list">${character.inventory.length ? character.inventory.map((x,i)=>inventoryRow(x,i)).join("") : `<p class="muted">No gear selected.</p>`}</div>
      </section>

      <section class="panel wide-panel" data-panel-id="notes">
        <h2>Notes</h2>
        <textarea data-notes rows="7" placeholder="Character notes...">${esc(character.notes)}</textarea>
      </section>

      <section class="panel" data-panel-id="features">
        <h2>Active Character Features <span class="badge">race · background · class · subclass</span></h2>
        ${features.length ? `<div class="feature-list">${features.map(featureCard).join("")}</div>` : `<p class="muted">Choose a race and/or eligible subclass to see imported feature definitions here.</p>`}
      </section>

      <section class="panel" data-panel-id="resources">
        <h2>Resources <span class="badge">limited-use abilities</span></h2>
        <p class="muted resource-intro">Track class, subclass, racial, feat, and similar limited-use abilities here. Spell-grant uses stay with their spells. Short Rest and Long Rest restore matching resources automatically.</p>
        ${trackerResources.length ? `<div class="resource-tracker-list">${trackerResources.map(r=>`<article class="resource-tracker-row ${r.mode==='pool'?'pool-resource':''}"><div class="resource-tracker-name"><strong>${esc(r.source)}</strong><span>${esc(r.origin)}${r.additional?` · ${esc(r.additional)}`:""}</span></div><div class="resource-tracker-state">${r.mode==='pool'?`<div class="resource-pool-controls"><button type="button" data-resource-adjust="-1" data-resource-id="${esc(r.id)}" title="Spend 1 ${esc(r.unit||'point')}" ${r.remaining<=0?'disabled':''}>−</button><label><span class="sr-only">${esc(r.source)} remaining</span><input type="number" min="0" max="${r.max}" step="1" inputmode="numeric" data-feature-resource-remaining="${esc(r.id)}" value="${r.remaining}"></label><span>/ ${r.max} ${esc(r.unit||'points')}</span><button type="button" data-resource-adjust="1" data-resource-id="${esc(r.id)}" title="Restore 1 ${esc(r.unit||'point')}" ${r.remaining>=r.max?'disabled':''}>+</button></div>`:`<div class="resource-pips-wrap"><div class="slot-pips" role="group" aria-label="${esc(r.source)} uses">${Array.from({length:r.max},(_,i)=>`<button type="button" class="slot-pip ${i<r.used?'used':'available'}" data-feature-resource="${esc(r.id)}" data-feature-resource-index="${i}" title="${i<r.used?'Mark available':'Mark used'}">${i<r.used?'×':'○'}</button>`).join('')}</div><strong>${r.remaining}/${r.max}</strong></div>`}<small>${r.recovery?`Recovers: ${esc(r.recovery)}`:'Recovery not specified'}</small></div></article>`).join('')}</div>` : `<p class="muted">No non-spell limited-use resources are active for this character.</p>`}
      </section>

      <section class="panel wide-panel" data-panel-id="feature-runtime">
        <h2>Feature Actions & Compatibility <span class="badge">0.8 behavior runtime</span></h2>
        ${behavior.actions.length ? `<div class="feature-list">${behavior.actions.map(a=>`<article class="feature"><div class="feature-head"><strong>${esc(a.source)}</strong><span>${esc(a.origin)}</span></div><div class="feature-meta"><strong>${esc(title(a.type))}</strong>${a.name?` · ${esc(a.name)}`:""}</div></article>`).join("")}</div>` : `<p class="muted">No action, bonus action, or reaction metadata is currently active.</p>`}
        ${behaviorDiags.length ? `<details class="behavior-diagnostics"><summary>${behaviorDiags.length} behavior compatibility note${behaviorDiags.length===1?'':'s'}</summary>${behaviorDiags.map(d=>`<div class="combat-source-note"><strong>${esc(d.kind)}</strong>: ${esc(d.detail)} <span class="muted">${esc(d.sources.slice(0,6).join(', '))}${d.sources.length>6?' …':''}</span></div>`).join('')}</details>` : `<div class="good">No unsupported callback behavior detected in the currently active features.</div>`}
      </section>

      <section class="panel" data-panel-id="runtime">
        <h2>Content Runtime</h2>
        <div class="list">${Object.entries(counts).filter(([,v])=>v).map(([k,v]) => `<div class="list-row"><span>${k}</span><strong>${v}</strong></div>`).join("")}</div>
        <p class="muted">The original PDF-owned content loads first. WotC/UA content is then added on top, while duplicate PDF-owned records are restored from the baseline. Manual import remains available for extra MPMB JavaScript.</p>
        <p class="muted">Owlbear boundary: ${obr.embedded ? "embedded iframe" : "standalone browser"}; SDK ${obr.sdkLoaded ? "detected" : "not loaded yet"}.</p>
      </section>

      <section class="panel" data-panel-id="development">
        <h2>Development Status</h2>
        <div class="list">${developmentStatus().map(([name,status,cls])=>`<div class="list-row"><span>${esc(name)}</span><strong class="${cls}">${esc(status)}</strong></div>`).join("")}</div>
      </section>

      <section class="panel diag" data-panel-id="diagnostics">
        <h2>MPMB Import Diagnostics</h2>
        <div class="diag-tabs"><button data-act="base-report">Show PDF Base Report</button><button data-act="builtin-report">Show WotC/UA Merge Report</button>${lastImport ? `<button data-act="last-report">Show Last Additional Import</button>` : ""}</div>
        <pre id="diag-output">${esc(formatImport(lastImport || getBuiltInReport()))}</pre>
      </section>
    </section>`;
  enhanceSheetLayout(app.querySelector(".sheet"));
  applyThemePrefs(document);
  window.scrollTo(preservedScrollX,preservedScrollY);
}


function collectionPicker(kind, rows, placeholder){
  return `<div class="collection-picker"><select data-add-kind="${kind}"><option value="">${esc(placeholder)}</option>${rows.map(o=>`<option value="${esc(o.key)}">${esc(o.label)}</option>`).join("")}</select></div>`;
}
function sourceLabel(data){ const src=data?.source; return Array.isArray(src)?src.map(x=>Array.isArray(x)?x[0]:x).filter(Boolean).join("/"):""; }
function featCard(id,i,managed=false){ const f=featSummary(id); if(!f)return ""; const elig=featEligibility(character,id); const status=!f.prerequisite?"":elig.eligible?(elig.supported?`<span class="good">Prerequisite met</span>`:`<span class="warn">Prerequisite partly needs manual verification</span>`):`<span class="choice-needed">Prerequisite not met</span>`; return `<article class="item-card"><div class="item-head"><strong>${esc(f.name)}</strong>${managed?`<span class="badge">choice-managed</span>`:`<button data-remove-kind="feat" data-index="${i}">×</button>`}</div>${f.prerequisite?`<div class="item-meta">Prerequisite: ${esc(f.prerequisite)} · ${status}</div>`:""}<div class="item-desc">${esc(f.description)}</div></article>`; }
function weaponCard(entry,i){
  const w=weaponSummary(character,entry); if(!w)return ""; const e=w.entry;
  const bonusText=w.damageBonus===0?"+ 0":w.damageBonus>0?`+ ${w.damageBonus}`:`- ${Math.abs(w.damageBonus)}`;
  const autoNote=e.proficientOverride===null||e.proficientOverride===undefined ? `Auto: ${w.autoProficient?"proficient":"not proficient"}` : `Manual override (${w.autoProficient?"auto would be proficient":"auto would not be proficient"})`;
  return `<article class="item-card weapon-editor"><div class="item-head"><strong>${esc(w.name)}</strong><button data-remove-kind="weapon" data-index="${i}">×</button></div><div class="weapon-edit-grid"><label><span>Name</span><input data-weapon-field="name" data-index="${i}" value="${esc(e.name)}"></label><label><span>Magic bonus</span><select data-weapon-enhancement data-index="${i}">${[0,1,2,3].map(n=>`<option value="${n}" ${w.enhancement===n?"selected":""}>${n?`+${n}`:"Normal"}</option>`).join("")}</select></label><label><span>Ability</span><select data-weapon-field="ability" data-index="${i}">${[["auto","Auto"],["str","STR"],["dex","DEX"],["int","INT"],["wis","WIS"],["cha","CHA"]].map(([v,l])=>`<option value="${v}" ${e.ability===v?"selected":""}>${l}</option>`).join("")}</select></label><label><span>Wielding</span><select data-weapon-field="wielding" data-index="${i}">${[["main-hand","Main hand"],["off-hand","Off-hand"],["two-handed","Two-handed"]].map(([v,l])=>`<option value="${v}" ${e.wielding===v?"selected":""}>${l}</option>`).join("")}</select></label><label class="weapon-prof-box"><span>Proficiency</span><span class="inline-check"><input type="checkbox" data-weapon-proficient data-index="${i}" ${w.proficient?"checked":""}> Proficient</span><small>${esc(autoNote)}</small>${e.proficientOverride!==null&&e.proficientOverride!==undefined?`<button type="button" class="tiny-button" data-weapon-prof-auto="${i}">Use auto</button>`:""}</label><label><span>Damage</span><div class="damage-expression"><input type="number" min="0" data-weapon-field="damageCount" data-index="${i}" value="${Number(e.damageCount||0)}"><span>d</span><input type="number" min="0" data-weapon-field="damageDie" data-index="${i}" value="${Number(e.damageDie||0)}"><strong>${bonusText}</strong></div></label><label><span>Damage type</span><input data-weapon-field="damageType" data-index="${i}" value="${esc(e.damageType||"")}"></label><label><span>Range</span><input data-weapon-field="range" data-index="${i}" value="${esc(e.range||"")}"></label><label><span>Misc to hit</span><input type="number" data-weapon-field="hitMisc" data-index="${i}" value="${Number(e.hitMisc||0)}"></label><label><span>Misc damage</span><input type="number" data-weapon-field="damageMisc" data-index="${i}" value="${Number(e.damageMisc||0)}"></label></div><div class="weapon-stats"><span>To hit <b>${formatMod(w.hit)}</b></span><span>Damage <b>${esc(w.damage)}</b></span><span>${abilityNames[w.ability]} modifier ${formatMod(abilityMod(character.abilities[w.ability]))}</span><span>${esc(w.range)}</span></div><p class="muted">The damage bonus beside the die is calculated from the selected ability, magic bonus, and misc damage. Proficiency affects the attack roll only. Typing “+1”, “+2”, or “+3” in the name still applies the matching magic bonus.</p>${w.styleNotes?.length?`<div class="combat-source-note"><strong>Combat modifiers:</strong> ${w.styleNotes.map(esc).join(" · ")}</div>`:""}${w.description?`<div class="item-desc">${esc(w.description)}</div>`:""}</article>`;
}
function magicCard(entry,i){
  const id=typeof entry==="string"?entry:entry.id; const r=resolveMagicItemData(entry); const base=r.base||{}; const data=r.data||base; if(!id||!base)return "";
  const attuned=typeof entry==="object"&&!!entry.attuned; const needsAttunement=!!(base.attunement||base.attunementRequired||r.choice?.attunement||r.choice?.attunementRequired);
  const choices=Array.isArray(base.choices)?base.choices:[];
  const choiceHtml=choices.length?`<label class="mini-field magic-choice"><span>Type / option</span><select data-magic-choice="${i}"><option value="">Choose option...</option>${choices.map(x=>`<option value="${esc(x)}" ${x===r.selected?"selected":""}>${esc(x)}</option>`).join("")}</select></label>`:"";
  const enhancement=r.enhancement||{supported:false,baseBonus:0,selectedBonus:0};
  const enhancementHtml=enhancement.supported?`<label class="mini-field magic-choice"><span>Magic bonus</span><select data-magic-enhancement="${i}"><option value="0" ${!enhancement.selectedBonus?"selected":""}>Base (+${enhancement.baseBonus})</option>${[1,2,3].map(n=>`<option value="${n}" ${enhancement.selectedBonus===n?"selected":""}>+${n}</option>`).join("")}</select><small>Overrides matching built-in +${enhancement.baseBonus} numeric effects without adding another copy of this item.</small></label>`:"";
  const effectTags=[]; if(Array.isArray(data.scores)&&data.scores.some(Number)) effectTags.push("ability bonus"); if(Array.isArray(data.scoresOverride)&&data.scoresOverride.some(Number)) effectTags.push("ability override"); if(Array.isArray(data.scoresMaximum)&&data.scoresMaximum.some(x=>x)) effectTags.push("ability maximum");
  if(enhancement.supported) effectTags.push(`magic bonus +${enhancement.selectedBonus||enhancement.baseBonus}`);
  const active=!needsAttunement||attuned;
  const shownName=data.name||base.name||title(id);
  const displayName=enhancement.selectedBonus&&enhancement.selectedBonus!==enhancement.baseBonus ? `${shownName} +${enhancement.selectedBonus}` : shownName;
  return `<article class="item-card"><div class="item-head"><strong>${esc(displayName)}</strong><button data-remove-kind="magic" data-index="${i}">×</button></div><div class="item-meta">${esc(data.type||base.type||"")}${needsAttunement?` · <label class="inline-check"><input type="checkbox" data-magic-attune="${i}" ${attuned?"checked":""}> Attuned</label>`:""}${effectTags.length?` · <span class="${active?"good":"muted"}">${active?"Active":"Inactive"}: ${esc(effectTags.join(", "))}</span>`:""}</div>${choiceHtml}${enhancementHtml}<div class="item-desc">${esc(data.descriptionFull||data.description||base.descriptionFull||base.description||"")}</div></article>`;
}

function listPreparedCasters(){
  reconcileSpellcastingState(character);
  return spellcastersForCharacter(character).filter(c=>c.typeSp==='list' && c.preparedCount>0);
}
function listPreparedSpellIds(){
  const ids=new Set();
  for(const c of listPreparedCasters()) for(const sp of c.spells||[]) ids.add(sp.id);
  return ids;
}
function nonListManagedSpells(){
  const listIds=listPreparedSpellIds();
  return (character.spells||[]).map((id,index)=>({id:typeof id==='string'?id:id?.id,index})).filter(x=>x.id&&!listIds.has(x.id));
}
function preparedCasterPanels(){
  const casters=listPreparedCasters();
  if(!casters.length)return '';
  return `<div class="prepared-caster-lists">${casters.map(c=>{
    const state=character.spellcasting?.casters?.[c.id]||{};
    const prepared=new Set(state.prepared||[]);
    const always=new Set(c.autoPrepared||[]);
    const selected=prepared.size;
    const rows=(c.spells||[]).map(sp=>{
      const checked=prepared.has(sp.id)||always.has(sp.id);
      const disabled=always.has(sp.id) || (!checked && selected>=c.preparedCount);
      const status=always.has(sp.id)?'Always':(prepared.has(sp.id)?'Prepared':'');
      const expanded=spellIsExpanded(sp.id);
      return `<article class="spell-row ${checked?'is-prepared':''} ${expanded?'is-expanded':''}" title="${spellTooltip(sp)}"><div class="spell-compact-line"><label class="prepared-spell-toggle" title="${always.has(sp.id)?'Always prepared':'Prepare this spell'}"><input type="checkbox" data-prepared-caster="${esc(c.id)}" data-prepared-spell="${esc(sp.id)}" ${checked?'checked':''} ${disabled?'disabled':''}></label>${spellExpandButton(sp.id)}<strong class="spell-row-name">${esc(sp.name)}</strong><span class="spell-row-shorthand">${spellCompactMeta(sp)}</span>${status?`<span class="spell-status">${esc(status)}</span>`:''}</div>${expanded?`<div class="spell-expanded-body">${spellCardBody(sp.id)}</div>`:''}</article>`;
    }).join('');
    return `<section class="prepared-caster-section"><div class="prepared-caster-head"><div><h3>${esc(c.name)} prepared spells</h3><p class="muted">Check prepared spells here. Hover a compact row for the full spell text, or expand individual spells for complete details.</p></div><strong class="prepared-count ${selected===c.preparedCount?'good':'choice-needed'}">${selected}/${c.preparedCount} prepared</strong></div><div class="compact-spell-list">${rows}</div></section>`;
  }).join('')}</div>`;
}
function spellCardBody(id){
  const sp=spellSummary(id); if(!sp)return '';
  const desc=showFullSpellDescriptions ? sp.descriptionFull : sp.description;
  const componentText=sp.components || '—';
  const materialText=sp.material ? ` — ${sp.material}` : '';
  return `<div class="spell-details"><div><strong>Cast</strong><span>${esc(sp.castingTime||'—')}</span></div><div><strong>Range</strong><span>${esc(sp.range||'—')}</span></div><div><strong>Duration</strong><span>${esc(sp.duration||'—')}</span></div><div class="spell-components"><strong>Components</strong><span>${esc(componentText+materialText)}</span></div>${sp.save?`<div><strong>Save</strong><span>${esc(sp.save)}</span></div>`:''}</div><div class="item-desc spell-description ${showFullSpellDescriptions?'spell-description-full':'spell-description-summary'}">${esc(desc)}</div>`;
}

function spellCard(id,i){
  const sp=spellSummary(id); if(!sp)return "";
  const statuses=spellStatuses(character).get(id)||[];
  const grants=spellGrantMetadata(character).get(id)||[];
  const resources=resourceStatus(character);
  const grantHtml=grants.map(g=>{
    const ability=g.ability?abilityNames[g.ability]:((g.abilityOptions||[]).length?"ability choice pending":"");
    const resource=resources.find(r=>r.source===g.feature && r.origin===g.source);
    const usage=resource ? `<div class="spell-grant-uses"><span>${resource.remaining}/${resource.max} available${resource.recovery?` · ${esc(resource.recovery)}`:""}</span><div class="slot-pips" role="group" aria-label="${esc(g.feature)} uses">${Array.from({length:resource.max},(_,n)=>`<button type="button" class="slot-pip ${n<resource.used?'used':'available'}" data-feature-resource="${esc(resource.id)}" data-feature-resource-index="${n}" title="${n<resource.used?'Mark available':'Mark used'}">${n<resource.used?'×':'○'}</button>`).join('')}</div></div>` : "";
    return `<div class="spell-grant-detail"><strong>${esc(g.source)}</strong>${g.feature&&g.feature!==g.source?`<span>${esc(g.feature)}</span>`:""}${ability?`<span>Spellcasting ability: ${esc(ability)}</span>`:""}${usage}</div>`;
  }).join("");
  const expanded=spellIsExpanded(id);
  const cantrip=sp.level===0;
  return `<article class="spell-row ${expanded?'is-expanded':''}" title="${spellTooltip(sp)}"><div class="spell-compact-line"><span class="spell-known-marker" title="${cantrip?'Known cantrip':'Known / granted spell'}">${cantrip?'◆':'•'}</span>${spellExpandButton(id)}<strong class="spell-row-name">${esc(sp.name)}</strong><span class="spell-row-shorthand">${spellCompactMeta(sp)}</span>${statuses.map(x=>`<span class="spell-status">${esc(x)}</span>`).join("")}<button class="spell-row-remove" data-remove-kind="spell" data-index="${i}" title="Remove manually added spell">×</button></div>${expanded?`<div class="spell-expanded-body">${spellCardBody(id)}${grantHtml?`<div class="spell-grant-details">${grantHtml}</div>`:""}</div>`:''}</article>`;
}

function inventoryRow(entry,i){ const id=typeof entry==="string"?entry:entry.id; const qty=typeof entry==="object"?Number(entry.qty||1):1; const g=registries.GearList[id]||{}; const label=typeof entry==="object"&&entry.label ? entry.label : (g.infoname||g.name||title(id)); return `<div class="inventory-row"><span>${esc(label)}${entry?.source?.startsWith?.("background:")?` <small class="inventory-source">background</small>`:""}</span><input type="number" min="1" value="${qty}" data-gear-qty="${i}"><button data-remove-kind="gear" data-index="${i}">×</button></div>`; }
function addCollection(kind,id){ if(!id)return; ensureSheetSections(character); if(kind==="feat"&&!selectedFeatIds(character).includes(id)) { character.feats.push(id); reconcileFeatAssignments(character); } if(kind==="weapon") character.weapons.push(weaponEntryFromId(id)); if(kind==="magic") character.magicItems.push({id,attuned:false,choice:"",enhancement:0}); if(kind==="spell"&&!character.spells.includes(id)) character.spells.push(id); if(kind==="gear") character.inventory.push({id,qty:1}); saveCharacter(character); render(); }
function removeCollection(kind,index){ const map={feat:"feats",weapon:"weapons",magic:"magicItems",spell:"spells",gear:"inventory"}; const key=map[kind]; if(key) character[key].splice(index,1); saveCharacter(character); render(); }

function raceVariantField(rows) {
  const val=character.raceVariant||"";
  return `<div class="field"><label>Race Variant / Subrace</label><select data-path="raceVariant"><option value="">Base ${esc(registries.RaceList[character.race]?.name||title(character.race))}</option>${rows.map(x=>`<option value="${esc(x.id)}" ${x.id===val?"selected":""}>${esc(x.label)}</option>`).join("")}</select></div>`;
}
function backgroundVariantField(rows) {
  const val=character.backgroundVariant||"";
  return `<div class="field"><label>Background Variant</label><select data-path="backgroundVariant"><option value="">Base ${esc(registries.BackgroundList[character.background]?.name||title(character.background))}</option>${rows.map(x=>`<option value="${esc(x.id)}" ${x.id===val?"selected":""}>${esc(x.label)}</option>`).join("")}</select></div>`;
}

function choiceSelect(id, selected, options, dataset, placeholder="Choose...", unavailable=[]) {
  const blocked=new Set((unavailable||[]).filter(Boolean));
  const select=`<select ${dataset}><option value="">${esc(placeholder)}</option>${options.map(o=>{const v=typeof o==='string'?o:o.id;const l=typeof o==='string'?o:o.label;const disabled=blocked.has(v)&&v!==selected;return `<option value="${esc(v)}" ${v===selected?"selected":""} ${disabled?"disabled":""}>${esc(l)}</option>`;}).join("")}</select>`;
  return randomSelectWrap(select);
}
function featChoiceOptions(selected="") {
  return featOptionsWithEligibility(character).filter(x=>x.eligibility.eligible || x.id===selected).map(x=>({id:x.id,label:`${x.label}${x.eligibility.supported?"":" [verify prerequisite]"}`}));
}
function characterChoicesPanel(){
  const racial=racialAbilityStatus(character);
  const general=generalProficiencyStatus(character);
  const featureChoices=featureChoiceSources(character);
  const improvements=improvementSources(character);
  const bonusFeats=bonusFeatSources(character);
  const prof=general.state;
  const fixedAbility=Object.entries(racial.rule.fixed||{}).filter(([,v])=>Number(v)).map(([k,v])=>`${ABILITY_LABELS[k]} ${Number(v)>0?"+":""}${v}`).join(", ");
  const racialHtml=racial.data ? `<section class="choice-group"><h3>Racial Ability Scores</h3><p class="muted">${esc(racial.rule.text||fixedAbility||"No ability score choice")}</p>${racial.rule.generic?`<label class="mini-field"><span>Flexible ability-score method</span><select data-racial-ability-mode><option value="+2/+1" ${racial.rule.genericMode==='+2/+1'?'selected':''}>+2 to one, +1 to another</option><option value="+1/+1/+1" ${racial.rule.genericMode==='+1/+1/+1'?'selected':''}>+1 to three different abilities</option></select></label>`:''}${fixedAbility?`<div class="choice-summary"><strong>Fixed:</strong> ${esc(fixedAbility)}</div>`:""}${racial.groups.map(({group,selected,offset})=>`<div class="choice-grid">${Array.from({length:group.count},(_,i)=>`<label class="mini-field"><span>+${group.amount} choice ${i+1}</span>${choiceSelect(`racial:${offset+i}`,selected[i],group.options.map(k=>({id:k,label:ABILITY_LABELS[k]})),`data-racial-ability-slot="${offset+i}"`,`Choose ability...`,racial.groups.flatMap(x=>x.selected))}</label>`).join("")}</div>`).join("")}${racial.missing?`<div class="choice-needed">${racial.missing} racial ability choice${racial.missing===1?"":"s"} remaining</div>`:`<div class="good">Racial ability choices complete</div>`}<p class="muted">These bonuses apply automatically to Final scores. The Abilities panel also permits a manual racial override for unusual/custom content.</p></section>` : "";
  const profCard=r=>`<article class="choice-card"><div class="choice-card-head"><strong>${esc(r.label)}</strong><span>${esc(r.type)}</span></div>${r.fixed?.length?`<div><strong>Automatic:</strong> ${r.fixed.map(esc).join(", ")}</div>`:""}<div class="choice-grid">${Array.from({length:r.choice.count},(_,slot)=>`<label class="mini-field"><span>${esc(r.choice.label)} ${slot+1}</span>${choiceSelect(r.id,r.selected[slot]||"",r.choice.options,`data-general-prof-source="${esc(r.id)}" data-general-prof-slot="${slot}"`,`Choose...`,[...(r.type==='language'?prof.languages:prof.tools),...(r.selected||[])])}</label>`).join("")}</div>${r.missing?`<div class="choice-needed">${r.missing} choice${r.missing===1?"":"s"} remaining</div>`:`<div class="good">Complete</div>`}</article>`;
  const languageRows=general.rows.filter(r=>r.type==='language');
  const toolRows=general.rows.filter(r=>r.type==='tool');
  const profHtml=`<section class="choice-group"><h3>Languages</h3><div class="choice-summary"><strong>Known:</strong> ${prof.languages.length?prof.languages.map(esc).join(", "):"—"}</div>${languageRows.length?languageRows.map(profCard).join(""):`<p class="muted">No language choices are currently required.</p>`}</section><section class="choice-group"><h3>Tool Proficiencies</h3><div class="choice-summary"><strong>Known:</strong> ${prof.tools.length?prof.tools.map(esc).join(", "):"—"}</div>${toolRows.length?toolRows.map(profCard).join(""):`<p class="muted">No tool choices are currently required.</p>`}</section><section class="choice-group"><h3>Armor & Weapon Proficiencies</h3><div class="proficiency-summary"><div><strong>Armor</strong><span>${Object.entries(prof.armor).filter(([,v])=>v).map(([k])=>title(k)).join(", ")||"—"}</span></div><div><strong>Weapons</strong><span>${[prof.weapon.simple&&"Simple",prof.weapon.martial&&"Martial",...prof.weapon.names.map(title)].filter(Boolean).join(", ")||"—"}</span></div></div></section>`;
  const featureHtml=featureChoices.length?`<section class="choice-group"><h3>Feature Choices</h3>${featureChoices.map(f=>{
    if(f.kind==='optional-group') return `<article class="choice-card"><div class="choice-card-head"><strong>${esc(f.label)}</strong><span>optional class features</span></div><div class="optional-choice-list">${(f.items||[]).map(item=>`<label class="optional-feature-row"><span class="inline-check"><input type="checkbox" data-optional-feature-source="${esc(item.sourceId)}" data-optional-feature-value="${esc(item.value)}" ${item.selected?"checked":""}> <strong>${esc(item.name)}</strong></span><span class="optional-feature-level">Level ${item.level}</span>${item.description?`<span class="optional-feature-description">${esc(item.description)}</span>`:""}</label>`).join("")}</div></article>`;
    if(f.kind==='extra') return `<article class="choice-card"><div class="choice-card-head"><strong>${esc(f.label)}</strong><span>${f.count} selection${f.count===1?'':'s'}</span></div><div class="choice-grid">${Array.from({length:f.count},(_,slot)=>{const current=f.selected?.[slot]||'';const opts=(f.options||[]).filter(o=>o.eligible||o.value===current).map(o=>({id:o.value,label:o.reasons?.length?`${o.value} — ${o.reasons.join(', ')}`:o.value}));return `<label class="mini-field"><span>Choice ${slot+1}</span>${choiceSelect(f.id,current,opts,`data-extra-feature-source="${esc(f.id)}" data-extra-feature-slot="${slot}"`,`Choose option...`,f.selected||[])}</label>`;}).join('')}</div>${f.missing?`<div class="choice-needed">${f.missing} selection${f.missing===1?'':'s'} remaining</div>`:`<div class="good">Selections complete</div>`}</article>`;
    return `<article class="choice-card"><div class="choice-card-head"><strong>${esc(f.label)}</strong><span>required</span></div>${choiceSelect(f.id,f.selected,f.choices,`data-feature-choice-source="${esc(f.id)}"`,`Choose feature option...`)}${f.selected?`<div class="good">Choice recorded</div>`:`<div class="choice-needed">Feature choice required</div>`}</article>`;
  }).join("")}</section>`:"";
  const featAbilityRows=featAbilityChoiceSources(character);
  const featAbilityHtml=featAbilityRows.length?`<section class="choice-group"><h3>Half-Feat Ability Increases</h3>${featAbilityRows.map(r=>`<article class="choice-card"><div class="choice-card-head"><strong>${esc(r.label)}</strong><span>+${r.amount}</span></div>${choiceSelect(r.id,r.selected,r.options.map(k=>({id:k,label:ABILITY_LABELS[k]})),`data-feat-ability-source="${esc(r.id)}"`,`Choose ability...`)}${r.selected?`<div class="good">Applied to ${esc(ABILITY_LABELS[r.selected])}</div>`:`<div class="choice-needed">Ability choice required</div>`}</article>`).join("")}</section>`:"";
  const bonusFeatHtml=bonusFeats.length?`<section class="choice-group"><h3>Bonus Feats</h3>${bonusFeats.map(b=>`<article class="choice-card"><strong>${esc(b.label)}</strong>${choiceSelect(b.id,b.selected,featChoiceOptions(b.selected),`data-bonus-feat-source="${esc(b.id)}"`,`Choose qualifying feat...`)}</article>`).join("")}</section>`:"";
  const improvementHtml=improvements.length?`<section class="choice-group"><h3>Ability Score Improvements / Feats</h3>${improvements.map(a=>{const v=a.value||{};return `<article class="choice-card improvement-card"><div class="choice-card-head"><strong>${esc(a.label)}</strong><span>2014 ASI rule</span></div><label class="mini-field"><span>Use improvement for</span><select data-improvement-source="${esc(a.id)}" data-improvement-field="mode"><option value="">Choose...</option><option value="+2" ${v.mode==="+2"?"selected":""}>+2 to one ability</option><option value="+1/+1" ${v.mode==="+1/+1"?"selected":""}>+1 to two abilities</option><option value="feat" ${v.mode==="feat"?"selected":""}>Feat</option></select></label>${v.mode==="+2"?choiceSelect(a.id,v.ability1,ABILITY_KEYS.map(k=>({id:k,label:ABILITY_LABELS[k]})),`data-improvement-source="${esc(a.id)}" data-improvement-field="ability1"`,`Choose ability...`):""}${v.mode==="+1/+1"?`<div class="choice-grid">${choiceSelect(a.id,v.ability1,ABILITY_KEYS.map(k=>({id:k,label:ABILITY_LABELS[k]})),`data-improvement-source="${esc(a.id)}" data-improvement-field="ability1"`,`First +1...`)}${choiceSelect(a.id,v.ability2,ABILITY_KEYS.map(k=>({id:k,label:ABILITY_LABELS[k]})),`data-improvement-source="${esc(a.id)}" data-improvement-field="ability2"`,`Second +1...`)}</div>`:""}${v.mode==="feat"?choiceSelect(a.id,v.feat,featChoiceOptions(v.feat),`data-improvement-source="${esc(a.id)}" data-improvement-field="feat"`,`Choose qualifying feat...`):""}</article>`}).join("")}</section>`:"";
  return `${racialHtml}${profHtml}${featureHtml}${featAbilityHtml}${bonusFeatHtml}${improvementHtml||`<section class="choice-group"><h3>Ability Score Improvements / Feats</h3><p class="muted">No ASI/feat improvement is currently unlocked.</p></section>`}`;
}

function expertiseCard(src){
  const selects=Array.from({length:src.count},(_,slot)=>{const current=src.selected[slot]||""; const opts=availableExpertise(character,src,slot); return `<label class="skill-choice"><span>Expertise ${slot+1}</span>${randomSelectWrap(`<select data-expertise-source="${esc(src.id)}" data-expertise-slot="${slot}"><option value="">Select proficient skill...</option>${opts.map(skill=>`<option value="${esc(skill)}" ${skill===current?"selected":""}>${esc(skill)}</option>`).join("")}</select>`)}</label>`}).join("");
  return `<article class="skill-source"><div class="skill-source-head"><strong>${esc(src.label)}</strong><span>expertise</span></div><div class="skill-choice-rule">${esc(src.raw)}</div><div class="skill-choice-grid">${selects}</div>${src.missing?`<div class="choice-needed">${src.missing} expertise choice${src.missing===1?"":"s"} remaining</div>`:`<div class="good skill-complete">Choices complete</div>`}</article>`;
}
function saveRow(a){
  const adv=saveAdvantageInfo(character,a); const permanent=adv.filter(x=>!x.conditional); const prof=character.saveProficiencies.includes(a); const overridden=Object.prototype.hasOwnProperty.call(character.saveProficiencyOverrides||{},a); const extra=savingThrowExtra(character,a);
  const tip=adv.length?adv.map(x=>`${x.source}: ${x.conditional?"conditional ":""}advantage — ${x.condition}`).join("\n"):"No currently detected saving throw advantage.";
  const fullTip=[tip, ...(extra.notes||[])].filter(Boolean).join("\n");
  return `<div class="list-row save-row" title="${esc(fullTip)}"><span><label class="inline-check"><input type="checkbox" data-save-prof="${a}" ${prof?"checked":""}> ${abilityNames[a]}</label>${overridden?` <button type="button" class="tiny-button" data-save-prof-auto="${a}" title="Return this save proficiency to automatic class/feature handling">Auto</button>`:""}${permanent.length?` <span class="save-adv" title="${esc(permanent.map(x=>`${x.source}: ${x.condition}`).join("\n"))}">ADV</span>`:""}${extra.bonus?` <span class="save-bonus" title="${esc(extra.notes.join(" · "))}">${formatMod(extra.bonus)} item/feature</span>`:""}</span><strong>${formatMod(combatSaveBonus(character,a))}</strong></div>`;
}
function conditionalSaveAdvantageSummary(){
  const seen=new Set(), rows=[];
  for(const a of abilityOrder) for(const x of saveAdvantageInfo(character,a).filter(x=>x.conditional)){
    const key=`${x.source}|${x.condition}`; if(seen.has(key)) continue; seen.add(key); rows.push(x);
  }
  return rows.length?`<div class="save-conditional-box"><strong>Conditional saving throw advantage</strong>${rows.map(x=>`<div><span>${esc(x.source)}</span> — ${esc(x.condition)}</div>`).join("")}</div>`:"";
}

function hpControls(){
  const mode=character.hp.mode||"manual"; const details=mode!=="manual"?hpBreakdown(character):[];
  return `<div class="hp-summary-controls"><label><span>Current HP</span><input data-path="hp.current" type="number" min="0" value="${Number(character.hp.current||0)}"></label><label><span>Maximum HP</span><input data-hp-max type="number" min="1" value="${Number(character.hp.max||1)}"></label><label><span>Temp HP</span><input data-path="hp.temp" type="number" min="0" value="${Number(character.hp.temp||0)}"></label><label><span>Calculate max HP</span><select data-hp-mode>${HP_MODES.map(([k,l])=>`<option value="${k}" ${mode===k?"selected":""}>${l}</option>`).join("")}</select></label>${mode==='roll'?`<button type="button" data-act="reroll-hp">Roll HP Again</button>`:""}</div>${mode!=="manual"?`<div class="hp-derived-note">Calculated using ${esc(HP_MODES.find(([k])=>k===mode)?.[1]||mode)}. You can still edit Maximum HP manually.</div>`:""}${details.length?`<details class="hp-breakdown"><summary>HP breakdown</summary><div>${details.map(esc).join("<br>")}</div></details>`:""}`;
}

function field(label, path, value) { return `<div class="field"><label>${label}</label><input data-path="${path}" value="${esc(value)}"></div>`; }
function selectField(label, path, value, rows, placeholder) {
  const exists = rows.some(x=>x.key===value);
  return `<div class="field"><label>${label}</label><select data-path="${path}"><option value="">${esc(placeholder)}</option>${!exists && value ? `<option value="${esc(value)}" selected>${esc(value)} (from character file)</option>` : ""}${rows.map(x=>`<option value="${esc(x.key)}" ${x.key===value?"selected":""}>${esc(x.label)}</option>`).join("")}</select></div>`;
}
function stat(label, value) { return `<div class="stat"><div class="value">${esc(value)}</div><div class="label">${label}</div></div>`; }
function formatImport(r) { return r ? importReportText(r) : "No import report available."; }

function classSummary(c) {
  const subs = subclassesForClass(c.name); const unlock = subclassUnlockLevel(c.name); const sub = registries.ClassSubList[c.subclass];
  const subLabel = sub?.subname || sub?.fullname || sub?.name || "";
  let note = subLabel ? ` — ${esc(subLabel)}` : "";
  if (!subLabel && subs.length && c.level >= unlock) note = ` <span class="choice-needed">— subclass required</span>`;
  else if (subs.length && c.level < unlock) note = ` <span class="muted">— subclass at ${unlock}</span>`;
  return `<div class="list-row"><span>${esc(registries.ClassList[c.name]?.name || title(c.name))}${note}</span><strong>${c.level}</strong></div>`;
}

function featureCard(f) {
  const extra = [f.usages != null ? `Uses: ${f.usages}` : "", f.recovery ? `Recovery: ${f.recovery}` : ""].filter(Boolean).join(" · ");
  const choiceExtra = f.choice ? [f.choice.usages != null ? `Uses: ${f.choice.usages}` : "", f.choice.recovery ? `Recovery: ${f.choice.recovery}` : ""].filter(Boolean).join(" · ") : "";
  const choice = f.choice ? `<div class="feature-choice-detail"><div class="feature-choice-label">Selected: <strong>${esc(f.choice.name)}</strong></div>${f.choice.description ? `<div class="feature-desc">${esc(f.choice.description)}</div>` : ""}${choiceExtra ? `<div class="feature-meta">${esc(choiceExtra)}</div>` : ""}</div>` : "";
  const extras=(f.extras||[]).map(x=>{const meta=[x.usages!=null?`Uses: ${x.usages}`:"",x.recovery?`Recovery: ${x.recovery}`:""].filter(Boolean).join(" · ");return `<div class="feature-choice-detail"><div class="feature-choice-label">Selected: <strong>${esc(x.name)}</strong></div>${x.description?`<div class="feature-desc">${esc(x.description)}</div>`:""}${meta?`<div class="feature-meta">${esc(meta)}</div>`:""}</div>`;}).join("");
  return `<article class="feature"><div class="feature-head"><strong>${esc(f.name)}</strong><span>${esc(f.origin)} · Lv ${f.level}</span></div>${f.description ? `<div class="feature-desc">${esc(f.description)}</div>` : ""}${extra ? `<div class="feature-meta">${esc(extra)}</div>` : ""}${choice}${extras}</article>`;
}

function skillSourceCard(source) {
  const fixed = source.fixed.length ? `<div class="skill-auto"><strong>Automatic:</strong> ${source.fixed.map(esc).join(", ")}</div>` : "";
  let choices = "";
  if (source.choice) {
    const selects = Array.from({length:source.choice.count}, (_,slot) => {
      const current = source.selected[slot] || "";
      const options = availableChoicesForSource(character, source.id, slot);
      return `<label class="skill-choice"><span>Choice ${slot+1}</span>${randomSelectWrap(`<select data-skill-source="${esc(source.id)}" data-skill-slot="${slot}"><option value="">Select skill...</option>${options.map(o=>`<option value="${esc(o.skill)}" ${o.skill===current?"selected":""} ${o.disabled?"disabled":""}>${esc(o.skill)}</option>`).join("")}</select>`)}</label>`;
    }).join("");
    choices = `<div class="skill-choice-rule">${esc(source.choice.text)}</div><div class="skill-choice-grid">${selects}</div>${source.missing ? `<div class="choice-needed">${source.missing} skill choice${source.missing===1?"":"s"} remaining</div>` : `<div class="good skill-complete">Choices complete</div>`}`;
  }
  if (!fixed && !choices) return `<article class="skill-source"><div class="skill-source-head"><strong>${esc(source.label)}</strong><span class="muted">No skill proficiency grant</span></div></article>`;
  return `<article class="skill-source"><div class="skill-source-head"><strong>${esc(source.label)}</strong><span>${source.kind}</span></div>${fixed}${choices}</article>`;
}

function creationChecklistRow(item) {
  const button = item.action === "spell-wizard"
    ? `<button type="button" data-act="spell-wizard">Resolve</button>`
    : item.action === "gear-wizard"
      ? `<button type="button" data-act="gear-wizard">Open</button>`
      : `<button type="button" data-workflow-panel="${esc(item.panel)}">${item.complete?"View":"Resolve"}</button>`;
  const stateText=item.optional?(item.note||"Optional"):(item.problems.length?`<div class="creation-check-problems">${item.problems.map(esc).join(" · ")}</div>`:`<div class="good">Complete</div>`);
  return `<article class="creation-check ${item.complete?"complete":"incomplete"}"><div class="creation-check-main"><span class="creation-check-icon">${item.optional?"•":item.complete?"✓":"!"}</span><div><strong>${esc(item.label)}${item.optional?` <span class="badge">optional</span>`:""}</strong>${item.optional?`<div class="muted">${esc(stateText)}</div>`:stateText}</div></div>${button}</article>`;
}

function characterIssues() {
  const issues = [];
  for (const c of character.classes) {
    const subs = subclassesForClass(c.name); const unlock = subclassUnlockLevel(c.name);
    if (subs.length && c.level >= unlock && !validSubclassForClass(c.name,c.subclass)) issues.push(`${registries.ClassList[c.name]?.name || title(c.name)} ${c.level} needs a subclass`);
  }
  for (const source of skillChoiceStatus(character)) if (source.missing) issues.push(`${source.label}: ${source.missing} skill choice${source.missing===1?"":"s"}`);
  for (const source of reconcileExpertise(character)) if (source.missing) issues.push(`${source.label}: ${source.missing} expertise choice${source.missing===1?"":"s"}`);
  issues.push(...characterChoiceIssues(character));
  for(const row of featAbilityChoiceSources(character)) if(!row.selected) issues.push(`${row.label}: choose ability`);
  return [...new Set(issues)];
}



function spellSelectOptions(rows,current="",unavailable=[]) {
  const blocked=new Set((unavailable||[]).filter(Boolean));
  let last=null, html='<option value="">Choose spell...</option>';
  for(const row of rows||[]) {
    if(row.level!==last){ if(last!==null) html+='</optgroup>'; html+=`<optgroup label="${row.level===0?'Cantrips':`Level ${row.level}`}">`; last=row.level; }
    html+=`<option value="${esc(row.id)}" ${row.id===current?'selected':''} ${blocked.has(row.id)&&row.id!==current?'disabled':''}>${row.level>0?`L${row.level} · `:""}${esc(row.name)}</option>`;
  }
  if(last!==null) html+='</optgroup>';
  return html;
}
function wizardSelectRows(caster,kind,count,pool,label) {
  const selected=caster.selections[kind]||[];
  // Grey out duplicates only within the same choice set. Prepared spells are
  // deliberately a second-stage selection FROM the spellbook/known pool, so a
  // spell being in the book must never make it unavailable for preparation.
  const claimed=(caster.selections[kind]||[]).filter(Boolean);
  if(!count) return '';
  return `<div class="spell-wizard-grid">${Array.from({length:count},(_,i)=>`<label class="mini-field"><span>${esc(label)} ${i+1}</span>${randomSelectWrap(`<select data-spell-caster="${esc(caster.id)}" data-spell-kind="${kind}" data-spell-slot="${i}">${spellSelectOptions(pool,selected[i]||'',claimed)}</select>`)}</label>`).join('')}</div>`;
}
function wizardPreparedChecklist(caster,pool) {
  const selected=new Set(caster.selections.prepared||[]);
  const limit=Math.min(Number(caster.preparedCount||0),pool.length);
  const rows=(pool||[]).map(sp=>{
    const checked=selected.has(sp.id);
    const disabled=!checked && selected.size>=limit;
    return `<label class="prepared-wizard-option ${checked?'is-prepared':''}"><input type="checkbox" data-spell-caster="${esc(caster.id)}" data-prepared-option="${esc(sp.id)}" ${checked?'checked':''} ${disabled?'disabled':''}> <span><strong>${esc(sp.name)}</strong><small>${sp.level?`Level ${sp.level}`:'Cantrip'}${sp.school?` · ${esc(sp.school)}`:''}</small></span></label>`;
  }).join('');
  return `<div class="wizard-prepared-head"><strong data-prepared-count-for="${esc(caster.id)}">Today's prepared spells: ${selected.size} / ${limit}</strong><span class="muted">Optional during creation. You can finish with any number prepared and change these later on the Spells panel.</span></div><div class="wizard-prepared-list" data-prepared-list-for="${esc(caster.id)}">${rows}</div>`;
}
function openSpellWizard(){
  spellWizardDraft=createSpellWizardDraft(character);
  if(!spellWizardDraft.length){ alert('No active spellcasting class or subclass was detected for this character.'); return; }
  drawSpellWizard(); spellDialog.showModal();
}
function drawSpellWizard(){
  if(!spellWizardDraft)return;
  const preservedDialogScroll=spellDialog.scrollTop;
  spellDialog.innerHTML=`<form method="dialog" class="spell-wizard-form"><h2>Spell List Wizard</h2><p class="muted">Each caster is restricted to its loaded MPMB spell list, spell level, school restrictions, subclass-expanded lists, automatic bonus spells, and its known/prepared rules.</p>${spellWizardDraft.map(c=>spellWizardCaster(c)).join('')}<div id="spell-wizard-problems"></div><div class="dialog-actions"><button value="cancel">Cancel</button><button value="apply">Apply Spell List</button></div></form>`;
  spellDialog.querySelectorAll('[data-spell-caster]').forEach(sel=>sel.addEventListener('change',()=>{
    const c=spellWizardDraft.find(x=>x.id===sel.dataset.spellCaster); if(!c)return;
    if(sel.dataset.preparedOption!==undefined){
      const id=sel.dataset.preparedOption, set=new Set(c.selections.prepared||[]), limit=Math.min(Number(c.preparedCount||0),preparedPool(c,c.selections).length);
      if(sel.checked){
        if(set.size<limit) set.add(id);
        else sel.checked=false;
      } else set.delete(id);
      c.selections.prepared=[...set].slice(0,limit);

      // Full-list preparation is an in-place UI action. Rebuilding the modal
      // here destroyed the clicked checkbox and caused browsers to jump the
      // dialog back toward the top on every preparation change.
      const list=spellDialog.querySelector(`[data-prepared-list-for="${CSS.escape(c.id)}"]`);
      const count=spellDialog.querySelector(`[data-prepared-count-for="${CSS.escape(c.id)}"]`);
      const selectedNow=new Set(c.selections.prepared||[]);
      if(count) count.textContent=`Today's prepared spells: ${selectedNow.size} / ${limit}`;
      if(list) list.querySelectorAll('[data-prepared-option]').forEach(box=>{
        const checked=selectedNow.has(box.dataset.preparedOption);
        box.checked=checked;
        box.disabled=!checked && selectedNow.size>=limit;
        box.closest('.prepared-wizard-option')?.classList.toggle('is-prepared',checked);
      });
      updateSpellWizardProblems();
      return;
    }
    if(sel.dataset.spellAbility!==undefined){c.selections.ability=sel.value;updateSpellWizardProblems();return;}
    const kind=sel.dataset.spellKind, slot=Number(sel.dataset.spellSlot)||0; c.selections[kind][slot]=sel.value;
    if(kind==='spells' && c.preparedCount) drawSpellWizard(); else updateSpellWizardProblems();
  }));
  updateSpellWizardProblems();
  spellDialog.scrollTop=preservedDialogScroll;
}
function spellWizardCaster(c){
  const prepPool=preparedPool(c,c.selections);
  let bonusOffset=0;
  const bonus=(c.bonusChoices||[]).map(b=>{ const html=wizardSelectRows({id:c.id,selections:{bonus:c.selections.bonus.slice(bonusOffset,bonusOffset+b.count)}},'bonus',b.count,b.options,b.name||'Bonus spell'); const adjusted=html.replace(/data-spell-slot="(\d+)"/g,(_,n)=>`data-spell-slot="${Number(n)+bonusOffset}"`); bonusOffset+=b.count; return adjusted; }).join('');
  const autos=[...c.autoSpells.map(id=>`${registries.SpellsList[id]?.name||id} (${c.kind==='race'?'racial':c.kind==='feat'?'feat':'automatic/known'})`),...c.autoPrepared.map(id=>`${registries.SpellsList[id]?.name||id} (always prepared)`)].filter(Boolean);
  const spellLabel=c.typeSp==='book'?'Spellbook spell':c.typeSp==='known'?'Known spell':'Spell';
  const abilityChoice=(c.abilityOptions||[]).length>1?`<label class="mini-field spell-ability-choice"><span>Spellcasting ability</span><select data-spell-caster="${esc(c.id)}" data-spell-ability>${c.abilityOptions.map(a=>`<option value="${a}" ${c.selections.ability===a?'selected':''}>${abilityNames[a]}</option>`).join('')}</select></label>`:'';
  const ability=c.selections.ability||c.ability; const badge=ability?`${abilityNames[ability]}${c.maxSpell?` · max level ${c.maxSpell}`:''}`:(c.sourceOnly?'Innate / granted spells':'Ability pending');
  const explanation=c.sourceOnly?'These spells come from your race, variant, or feat and do not create normal class spell slots.':c.typeSp==='list'?'Full class list available; choose prepared spells below.':c.typeSp==='book'?`Choose ${c.spellCount} spells for the spellbook, then choose prepared spells from that book.`:`Choose ${c.spellCount} known spells.`;
  return `<section class="wizard-block spell-caster-block"><h3>${esc(c.name)} <span class="badge">${esc(badge)}</span></h3><p class="muted">${esc(explanation)}</p>${abilityChoice}${wizardSelectRows(c,'cantrips',c.cantripCount,c.cantrips,'Cantrip')}${(c.typeSp==='known'||c.typeSp==='book')?wizardSelectRows(c,'spells',c.spellCount,c.spells,spellLabel):''}${bonus?`<h4>Special spell choices</h4>${bonus}`:''}${autos.length?`<div class="wizard-auto-spells"><strong>Automatic / always available:</strong> ${autos.map(esc).join(', ')}</div>`:''}${c.preparedCount&&c.typeSp!=='list'?`<h4>Prepared spells (${c.preparedCount})</h4>${wizardSelectRows(c,'prepared',Math.min(c.preparedCount,prepPool.length),prepPool,'Prepared')}`:c.preparedCount&&c.typeSp==='list'?`<h4>Prepare spells <span class="badge">optional</span></h4>${wizardPreparedChecklist(c,prepPool)}`:''}</section>`;
}
function updateSpellWizardProblems(){
  const box=spellDialog.querySelector('#spell-wizard-problems'); if(!box)return; const problems=validSpellWizardDraft(spellWizardDraft);
  box.innerHTML=problems.length?`<div class="validation-banner"><strong>Choices still needed:</strong> ${problems.map(esc).join(' · ')}</div>`:`<div class="good spell-wizard-complete">All required spell choices are complete.</div>`;
}

function openGearWizard() {
  gearWizardDraft = createStartingGearDraft(character);
  if (!gearWizardDraft.classKey && !gearWizardDraft.backgroundKey) {
    alert("Choose a starting class and/or background first.");
    return;
  }
  drawGearWizard();
  gearDialog.showModal();
}

function drawGearWizard() {
  const d=gearWizardDraft; if(!d)return;
  const classGroups=d.classData.groups;
  const bg=d.backgroundData;
  gearDialog.innerHTML=`<form method="dialog" class="gear-wizard-form">
    <h2>Starting Gear Wizard</h2>
    <p class="muted">Uses the starting-equipment definitions from your primary class (${esc(d.classData.name)}) and background (${esc(bg.name||"none")}). Multiclass levels do not grant another starting-equipment package.</p>
    ${classGroups.length?`<section class="wizard-block"><h3>${esc(d.classData.name)} equipment</h3>${classGroups.map((g,i)=>gearWizardGroup(g,i,d.choices[i])).join("")}${d.classData.alternativeWealth?`<p class="muted wizard-wealth">Alternative starting wealth from the source: ${esc(d.classData.alternativeWealth)}. This wizard currently builds the equipment package.</p>`:""}</section>`:`<section class="wizard-block"><h3>${esc(d.classData.name||"Class")}</h3><p class="muted">No structured starting-equipment choices were found for this class.</p></section>`}
    <section class="wizard-block"><h3>${esc(bg.name||"Background")} equipment</h3>${bg.rows.length?`<div class="wizard-fixed-list">${bg.rows.map(r=>`<div><span>${esc(r.label)}</span><strong>${r.qty>1?`×${r.qty}`:"included"}</strong></div>`).join("")}</div>`:`<p class="muted">No fixed background equipment was found.</p>`}${bg.gold?`<div class="wizard-gold">Starting coin: <strong>${bg.gold} gp</strong></div>`:""}</section>
    <label class="wizard-replace"><input type="checkbox" data-gear-replace ${d.replaceExisting?"checked":""}> Replace current weapons, armor, and inventory before adding this package</label>
    <p class="muted">Packs are expanded into their contents. Weapon choices are added to Attacks & Weapons, armor is equipped in Armor & AC, shields are toggled there, background coin goes to GP, and the rest goes into Equipment & Gear.</p>
    <div class="dialog-actions"><button value="cancel">Cancel</button><button value="apply">Add Starting Gear</button></div>
  </form>`;
  gearDialog.querySelectorAll("[data-gear-alt]").forEach(sel=>sel.addEventListener("change",()=>{ const i=Number(sel.dataset.gearAlt); d.choices[i].alternative=Number(sel.value)||0; d.choices[i].picks=[]; drawGearWizard(); }));
  gearDialog.querySelectorAll("[data-gear-pick]").forEach(sel=>sel.addEventListener("change",()=>{ const [gi,pi]=sel.dataset.gearPick.split(":").map(Number); d.choices[gi].picks[pi]=sel.value; }));
  gearDialog.querySelector("[data-gear-replace]")?.addEventListener("change",e=>{d.replaceExisting=e.target.checked;});
}

function gearWizardGroup(group,index,choice) {
  const altIndex=Math.max(0,Number(choice?.alternative)||0);
  const alt=group.alternatives[altIndex]||group.alternatives[0]||"";
  const picks=categoryPicksForAlternative(alt);
  let flat=0;
  const pickerHtml=picks.map(def=>Array.from({length:def.count},(_,slot)=>{const pi=flat++; const current=choice?.picks?.[pi]||""; return `<label class="mini-field"><span>${esc(def.label)}${def.count>1?` ${slot+1}`:""}</span><select data-gear-pick="${index}:${pi}"><option value="">Choose...</option>${def.options.map(o=>`<option value="${esc(o.id)}" ${o.id===current?"selected":""}>${esc(o.label)}</option>`).join("")}</select></label>`}).join("")).join("");
  return `<article class="wizard-choice"><label class="mini-field"><span>Choice ${index+1}</span><select data-gear-alt="${index}">${group.alternatives.map((a,ai)=>`<option value="${ai}" ${ai===altIndex?"selected":""}>${esc(a)}</option>`).join("")}</select></label>${pickerHtml?`<div class="wizard-subchoices">${pickerHtml}</div>`:""}</article>`;
}


function cloneCharacterData(value){ return JSON.parse(JSON.stringify(value)); }
function builderSelect(rows,current,placeholder){ return `<option value="">${esc(placeholder)}</option>${rows.map(x=>`<option value="${esc(x.key??x.id)}" ${(x.key??x.id)===current?"selected":""}>${esc(x.label??x.displayLabel??x.name??x.id)}</option>`).join("")}`; }
function wizardClassLine(c,i,known,totalRows){
  const subs=subclassesForClass(c.name), unlock=subclassUnlockLevel(c.name), unlocked=Number(c.level)>=unlock;
  const taken=new Set((creationDraft?.classes||[]).map((row,idx)=>idx===i?null:row.name).filter(Boolean));
  const available = (i===0 ? known.filter(x=>!x.data?.prestigeClassPrereq || x.key===c.name) : known).filter(x=>!taken.has(x.key) || x.key===c.name);
  const randomBase=i>0?{...creationDraft,classes:(creationDraft?.classes||[]).filter((_,idx)=>idx!==i)}:creationDraft;
  const classOptionsHtml=`<option value="">Choose class...</option>${available.map(x=>{const randomInvalid=i>0 && x.key!==c.name && !multiclassEligibility(randomBase,x.key).ok;return `<option value="${esc(x.key)}" ${x.key===c.name?'selected':''} ${randomInvalid?'data-random-skip="true"':''}>${esc(x.label)}</option>`;}).join('')}`;
  const subSelect=`<select data-builder-subclass="${i}" ${unlocked&&subs.length?'':'disabled'}><option value="">${subs.length?(unlocked?'Choose subclass...':`Unlocks at ${unlock}`):'No subclass registered'}</option>${subs.map(x=>`<option value="${esc(x.id)}" ${x.id===c.subclass?'selected':''}>${esc(x.displayLabel)}</option>`).join('')}</select>`;
  return `<div class="class-line builder-class-line" data-builder-class-row="${i}"><div class="mini-field"><label>${i===0?'Starting class':'Class'}</label>${randomSelectWrap(`<select data-builder-class="${i}">${classOptionsHtml}</select>`)}</div><div class="mini-field"><label>Level</label><input type="number" min="1" max="20" data-builder-level="${i}" value="${Number(c.level)||1}"></div><div class="mini-field"><label>Subclass</label>${randomSelectWrap(subSelect)}</div><button type="button" data-builder-remove-class="${i}" ${totalRows<=1?'disabled':''}>×</button></div>`;
}

const FULL_WIZARD_STEPS=[['build','Build & abilities'],['appearance','Identity & appearance'],['choices','Languages, tools, feats & features'],['skills','Skills & Expertise'],['spells','Spells'],['gear','Equipment'],['review','Review & finish']];
function fullWizardProgress(status=null){const st=status||creationStatus(character);return `${st.remaining} required item${st.remaining===1?'':'s'} remaining`;}
function visibleFullWizardSteps(status){
 const spellItem=status.items.find(x=>x.id==='spells');
 return FULL_WIZARD_STEPS.map((step,index)=>({step,index})).filter(x=>x.step[0]!=='spells'||spellItem?.wizardAvailable||spellItem?.hasClassSpellcasting);
}
function fullWizardNav(status){const visible=visibleFullWizardSteps(status);return `<div class="full-wizard-steps">${visible.map(({step:[id,l],index},n)=>`<button type="button" data-full-step="${index}" class="${index===fullWizardStep?'active':''}"><span>${n+1}</span>${esc(l)}</button>`).join('')}</div>`;}
function fullWizardFooter(status){const visible=visibleFullWizardSteps(status),pos=Math.max(0,visible.findIndex(x=>x.index===fullWizardStep)),prev=visible[pos-1]?.index,next=visible[pos+1]?.index;return `<div class="full-wizard-footer"><button type="button" data-full-save-exit>Save & Exit</button><span class="muted">Changes save as you make them. Leave at any point and continue manually or resume later.</span><div class="full-wizard-next">${prev!==undefined?`<button type="button" data-full-prev="${prev}">← Previous</button>`:''}${next!==undefined?`<button type="button" class="primary-action" data-full-next="${next}">Next →</button>`:'<button type="button" class="primary-action" data-full-finish>Finish Wizard</button>'}</div></div>`;}
function fullWizardStepHtml(status){
 status=status||creationStatus(character);
 const key=FULL_WIZARD_STEPS[fullWizardStep][0];
 if(key==='build')return `<section class="wizard-block"><h3>Build & base abilities</h3><p>Set race, variant/subrace, background, class split, subclasses, and unmodified ability scores. Derived scores continue to include racial, ASI, half-feat, and supported item effects.</p><div class="full-wizard-summary"><strong>${esc(character.race||'No race')} · ${esc(character.background||'No background')}</strong><span>${character.classes.map(c=>`${esc(registries.ClassList[c.name]?.name||c.name)} ${c.level}${c.subclass?` (${esc(registries.ClassSubList[c.subclass]?.subname||c.subclass)})`:''}`).join(' / ')}</span><span>${ABILITY_KEYS.map(k=>`${k.toUpperCase()} ${character.abilities[k]}`).join(' · ')}</span></div><button type="button" data-full-open-basics>Edit build basics</button><p class="muted">The basics editor returns here when closed.</p></section>`;
 if(key==='appearance')return `<section class="wizard-block"><h3>Identity & appearance <span class="badge">optional</span></h3><p class="muted">These never block completion.</p><div class="builder-grid">${[['name','Character name'],['player','Player'],['alignment','Alignment'],['age','Age'],['height','Height'],['weight','Weight'],['eyes','Eyes'],['hair','Hair'],['skin','Skin'],['sex','Sex'],['deity','Faith / Deity']].map(([k,l])=>`<label class="mini-field"><span>${l}</span><input data-full-path="${k}" value="${esc(character[k]||'')}"></label>`).join('')}</div></section>`;
 if(key==='choices')return `<section class="wizard-block"><h3>Rules-driven character choices</h3><p class="muted">Languages, tools, racial choices, feature choices, bonus feats, ASIs, feats, and half-feat ability increases all use the same source-driven engine as the sheet.</p>${characterChoicesPanel()}</section>`;
 if(key==='skills'){const sources=skillChoiceStatus(character),exp=reconcileExpertise(character);return `<section class="wizard-block"><h3>Skills & Expertise</h3>${sources.length?sources.map(skillSourceCard).join(''):'<p class="muted">No skill choices are required.</p>'}${exp.length?`<h4>Expertise</h4>${exp.map(expertiseCard).join('')}`:''}</section>`;}
 if(key==='spells'){
  // creationStatus already resolved spellcasting and validated the spell-wizard draft.
  // Re-running spellcastersForCharacter() here made the full wizard's Spells page
  // uniquely depend on a second spell-source traversal during navigation. Use the
  // status result as the single source of truth instead.
  const item=status.items.find(x=>x.id==='spells') || {complete:true,problems:[],action:'jump'};
  const hasSpellChoices=!!item.wizardAvailable;
  const summary=item.complete?'Spell choices complete':(item.problems.length?item.problems.join(' · '):'Spell choices still need attention');
  return `<section class="wizard-block"><h3>Spells</h3>${hasSpellChoices?`<div class="full-wizard-summary"><strong>${esc(summary)}</strong><span>The spell-list wizard enforces class lists, known/prepared counts, automatic subclass spells, and special access.</span></div><button type="button" data-full-spells>Open Spell List Wizard</button>`:'<p class="good">This character has no spellcasting choices to resolve.</p>'}</section>`;
 }
 if(key==='gear')return `<section class="wizard-block"><h3>Starting equipment <span class="badge">optional</span></h3><p>Use the class/background package wizard or skip this and manage equipment manually.</p><div class="full-wizard-summary"><strong>${character.startingGearApplied?'Starting package applied':'No starting package recorded'}</strong><span>${character.weapons.length} weapon entries · ${character.inventory.length} inventory entries · ${Number(character.currency.gp||0)} gp</span></div><button type="button" data-full-gear>Open Starting Gear Wizard</button></section>`;
 return `<section class="wizard-block"><h3>Review & finish</h3><div class="creation-status-summary ${status.complete?'complete':'incomplete'}"><strong>${status.complete?'Character creation requirements complete':esc(fullWizardProgress())}</strong><span>${status.complete?'Finish now or return to any step. The normal sheet remains editable.':'Select an unresolved section below, or Save & Exit and continue manually.'}</span></div><div class="full-review-list">${status.items.filter(x=>x.id!=='spells'||x.wizardAvailable||x.hasClassSpellcasting||!x.complete).map(x=>`<button type="button" data-full-review-step="${x.id==='identity'?1:x.id==='classes'||x.id==='abilities'?0:x.id==='choices'?2:x.id==='skills'?3:x.id==='spells'?4:x.id==='gear'?5:6}" class="${x.complete?'complete':'incomplete'}"><span>${x.complete?'✓':'!'}</span><strong>${esc(x.label)}</strong><small>${x.optional?'Optional':x.complete?'Complete':esc(x.problems.join(' · '))}</small></button>`).join('')}</div>${status.complete?'<p class="good">All required creation choices are resolved.</p>':'<p class="choice-needed">Required items remain. Save & Exit is always allowed.</p>'}</section>`;
}
function renderFullWizard(){
 if(!fullWizardDialog.open)return;
 reconcileCharacterState();
 // Compute creation/spell validation exactly once per wizard render. Spell validation can
 // normalize managed spellcasting state, so re-running it while rendering only step 5
 // was an unnecessary source of navigation failures.
 const status=creationStatus(character);
 let body;
 try { body=fullWizardStepHtml(status); }
 catch(err) {
   console.error('Full Character Wizard step render failed', {step:fullWizardStep,error:err});
   const key=FULL_WIZARD_STEPS[fullWizardStep]?.[0]||'unknown';
   body=`<section class="wizard-block"><h3>${key==='spells'?'Spells':'Wizard step'}</h3><p class="choice-needed">This wizard page hit a rendering error. Save & Exit remains available.</p>${key==='spells'?'<button type="button" data-full-spells>Open Spell List Wizard</button>':''}</section>`;
 }
 fullWizardDialog.innerHTML=`<form method="dialog" class="full-wizard-form"><div class="full-wizard-head"><div><h2>Full Character Wizard</h2><p>${esc(fullWizardProgress(status))}</p></div><button type="button" data-full-save-exit>Save & Exit</button></div>${fullWizardNav(status)}<div class="full-wizard-body">${body}</div>${fullWizardFooter(status)}</form>`;
}
function openFullWizard(step=0){fullWizardStep=Math.max(0,Math.min(FULL_WIZARD_STEPS.length-1,Number(step)||0));if(!fullWizardDialog.open)fullWizardDialog.showModal();renderFullWizard();}
function fullWizardChanged(){reconcileCharacterState();renderFullWizard();}
fullWizardDialog.addEventListener('input',e=>{if(e.target?.dataset?.fullPath){character[e.target.dataset.fullPath]=e.target.value;saveCharacter(character);}});
fullWizardDialog.addEventListener('change',e=>{
 if(e.target?.dataset?.racialAbilitySlot!==undefined){setRacialAbilityChoice(character,Number(e.target.dataset.racialAbilitySlot)||0,e.target.value);return fullWizardChanged();}
 if(e.target?.dataset?.generalProfSource){setGeneralProficiencyChoice(character,e.target.dataset.generalProfSource,Number(e.target.dataset.generalProfSlot)||0,e.target.value);return fullWizardChanged();}
 if(e.target?.dataset?.featAbilitySource){setFeatAbilityChoice(character,e.target.dataset.featAbilitySource,e.target.value);return fullWizardChanged();}
 if(e.target?.dataset?.featureChoiceSource){setFeatureChoice(character,e.target.dataset.featureChoiceSource,e.target.value);return fullWizardChanged();}
 if(e.target?.dataset?.optionalFeatureSource){toggleOptionalFeatureChoice(character,e.target.dataset.optionalFeatureSource,e.target.dataset.optionalFeatureValue,e.target.checked);return fullWizardChanged();}
 if(e.target?.dataset?.extraFeatureSource){setExtraFeatureChoice(character,e.target.dataset.extraFeatureSource,Number(e.target.dataset.extraFeatureSlot),e.target.value);return fullWizardChanged();}
 if(e.target?.dataset?.bonusFeatSource){setBonusFeatChoice(character,e.target.dataset.bonusFeatSource,e.target.value);return fullWizardChanged();}
 if(e.target?.dataset?.improvementSource){setImprovementChoice(character,e.target.dataset.improvementSource,{[e.target.dataset.improvementField]:e.target.value});return fullWizardChanged();}
 if(e.target?.dataset?.skillSource){setSkillChoice(character,e.target.dataset.skillSource,Number(e.target.dataset.skillSlot)||0,e.target.value);return fullWizardChanged();}
 if(e.target?.dataset?.expertiseSource){setExpertiseChoice(character,e.target.dataset.expertiseSource,Number(e.target.dataset.expertiseSlot)||0,e.target.value);return fullWizardChanged();}
});
fullWizardDialog.addEventListener('click',e=>{
 const control=e.target?.closest?.('[data-full-step],[data-full-prev],[data-full-next],[data-full-review-step],[data-full-save-exit],[data-full-finish],[data-full-open-basics],[data-full-spells],[data-full-gear]');
 if(!control || !fullWizardDialog.contains(control)) return;
 if(control.dataset.fullStep!==undefined){fullWizardStep=Number(control.dataset.fullStep);return renderFullWizard();}
 if(control.dataset.fullPrev!==undefined){fullWizardStep=Math.max(0,Math.min(FULL_WIZARD_STEPS.length-1,Number(control.dataset.fullPrev)));return renderFullWizard();}
 if(control.dataset.fullNext!==undefined){fullWizardStep=Math.max(0,Math.min(FULL_WIZARD_STEPS.length-1,Number(control.dataset.fullNext)));return renderFullWizard();}
 if(control.dataset.fullReviewStep!==undefined){fullWizardStep=Number(control.dataset.fullReviewStep);return renderFullWizard();}
 if(control.dataset.fullSaveExit!==undefined){saveCharacter(character);fullWizardDialog.close('saved');render();return;}
 if(control.dataset.fullFinish!==undefined){const st=creationStatus(character);if(!st.complete){alert(`There are still ${st.remaining} required creation items. Resolve them or use Save & Exit.`);return;}saveCharacter(character);fullWizardDialog.close('finished');render();return;}
 if(control.dataset.fullOpenBasics!==undefined){resumeFullWizard=true;fullWizardDialog.close('subdialog');openCharacterBuilder();return;}
 if(control.dataset.fullSpells!==undefined){resumeFullWizard=true;fullWizardDialog.close('subdialog');openSpellWizard();return;}
 if(control.dataset.fullGear!==undefined){resumeFullWizard=true;fullWizardDialog.close('subdialog');openGearWizard();return;}
});

function openCharacterBuilder({fresh=false}={}){
  creationDraft=ensureSheetSections(normalizeCharacter(cloneCharacterData(fresh?newCharacter():character)));
  creationTargetLevel=Math.max(1,totalLevel(creationDraft)||1);
  drawCharacterBuilder(); creationDialog.showModal();
}
function drawCharacterBuilder(){
  if(!creationDraft)return;
  reconcileAbilityScores(creationDraft);
  const races=raceOptions(), bgs=backgroundOptions(), variants=raceVariantsFor(creationDraft.race), bgVariants=backgroundVariantsFor(creationDraft.background), known=classOptions();
  const planIssues=classPlanIssues(creationDraft,creationDraft.classes);
  if(totalLevel(creationDraft)!==creationTargetLevel) planIssues.push(`Allocate exactly ${creationTargetLevel} total level${creationTargetLevel===1?'':'s'}; currently allocated ${totalLevel(creationDraft)}`);
  const multiNotes=creationDraft.classes.length>1 ? creationDraft.classes.map(r=>multiclassEligibility(creationDraft,r.name)).flatMap(x=>x.reasons||[]) : [];
  creationDialog.innerHTML=`<form method="dialog" class="creation-builder-form"><h2>Character Builder</h2><p class="muted">This sets the structural character build in one place. After applying it, Creation Status walks you through every remaining language, tool, skill, feat/ASI, feature, Expertise, and spell choice.</p><div class="builder-top-actions"><button type="button" data-builder-fresh>Start Fresh</button><span class="muted">Current total level: ${totalLevel(creationDraft)}</span></div><section class="wizard-block"><h3>1. Identity & origin</h3><div class="builder-grid"><label class="mini-field"><span>Character name</span><input data-builder-field="name" value="${esc(creationDraft.name)}"></label><label class="mini-field"><span>Player</span><input data-builder-field="player" value="${esc(creationDraft.player)}"></label><label class="mini-field"><span>Race</span>${randomSelectWrap(`<select data-builder-field="race">${builderSelect(races,creationDraft.race,'Choose race...')}</select>`)}</label><label class="mini-field"><span>Race variant / subrace</span>${randomSelectWrap(`<select data-builder-field="raceVariant" ${variants.length?'':'disabled'}><option value="">${variants.length?'Choose variant / subrace...':'None / not applicable'}</option>${variants.map(x=>`<option value="${esc(x.id)}" ${x.id===creationDraft.raceVariant?'selected':''}>${esc(x.label)}</option>`).join('')}</select>`)}</label><label class="mini-field"><span>Background</span>${randomSelectWrap(`<select data-builder-field="background">${builderSelect(bgs,creationDraft.background,'Choose background...')}</select>`)}</label><label class="mini-field"><span>Background variant</span>${randomSelectWrap(`<select data-builder-field="backgroundVariant" ${bgVariants.length?'':'disabled'}><option value="">${bgVariants.length?'Choose variant...':'None / not applicable'}</option>${bgVariants.map(x=>`<option value="${esc(x.id)}" ${x.id===creationDraft.backgroundVariant?'selected':''}>${esc(x.label)}</option>`).join('')}</select>`)}</label></div></section><section class="wizard-block"><h3>2. Classes & levels</h3><label class="mini-field builder-target-level"><span>Target character level</span><input type="number" min="1" max="20" data-builder-target-level value="${creationTargetLevel}"></label><p class="muted">Distribute exactly this many levels across the class rows below. The first row is the starting class and controls starting saving throws/proficiency packages.</p><div id="builder-class-editor">${creationDraft.classes.map((c,i)=>wizardClassLine(c,i,known,creationDraft.classes.length)).join('')}</div><button type="button" data-builder-add-class>+ Add multiclass</button>${planIssues.length?`<div class="validation-banner compact"><strong>Class plan:</strong> ${planIssues.map(esc).join(' · ')}</div>`:`<div class="good wizard-complete">Class plan is structurally valid.</div>`}${multiNotes.length?`<p class="muted">Multiclass prerequisites use the character's current derived ability scores.</p>`:''}</section><section class="wizard-block"><h3>3. Base ability scores</h3><p class="muted">Enter the unmodified scores. Race, ASIs, half-feats, and magic items are applied separately to the Final scores.</p><div class="builder-abilities">${ABILITY_KEYS.map(k=>`<label class="mini-field"><span>${ABILITY_LABELS[k]}</span><input type="number" min="1" max="30" data-builder-ability="${k}" value="${Number(creationDraft.baseAbilities[k])||10}"><small>Final ${creationDraft.abilities[k]}</small></label>`).join('')}</div></section><section class="wizard-block"><h3>4. What happens next</h3><p class="muted">Apply this build, then the Creation Status section becomes the checklist for all remaining rules-driven choices. It links directly to Character Choices, Skill Proficiencies & Expertise, and the Spell List Wizard.</p></section><div class="dialog-actions"><button value="cancel">Cancel</button><button value="apply" ${planIssues.length?'disabled':''}>Apply Build & Continue</button></div></form>`;
  creationDialog.querySelector('[data-builder-target-level]')?.addEventListener('change',e=>{creationTargetLevel=Math.max(1,Math.min(20,Number(e.target.value)||1));drawCharacterBuilder();});
  creationDialog.querySelectorAll('[data-builder-field]').forEach(el=>el.addEventListener('change',()=>{ const key=el.dataset.builderField; creationDraft[key]=el.value; if(key==='race'){creationDraft.raceVariant='';clearRacialAbilityState(creationDraft);} if(key==='raceVariant')clearRacialAbilityState(creationDraft); if(key==='background')creationDraft.backgroundVariant=''; drawCharacterBuilder(); }));
  creationDialog.querySelectorAll('[data-builder-ability]').forEach(el=>el.addEventListener('change',()=>{creationDraft.baseAbilities[el.dataset.builderAbility]=Number(el.value)||10; reconcileAbilityScores(creationDraft); drawCharacterBuilder();}));
  creationDialog.querySelectorAll('[data-builder-class]').forEach(el=>el.addEventListener('change',()=>{ const i=Number(el.dataset.builderClass); creationDraft.classes[i].name=el.value; creationDraft.classes[i].subclass=''; drawCharacterBuilder(); }));
  creationDialog.querySelectorAll('[data-builder-level]').forEach(el=>el.addEventListener('change',()=>{ const i=Number(el.dataset.builderLevel); creationDraft.classes[i].level=Math.max(1,Math.min(20,Number(el.value)||1)); if(creationDraft.classes[i].level<subclassUnlockLevel(creationDraft.classes[i].name))creationDraft.classes[i].subclass=''; drawCharacterBuilder(); }));
  creationDialog.querySelectorAll('[data-builder-subclass]').forEach(el=>el.addEventListener('change',()=>{ const i=Number(el.dataset.builderSubclass); creationDraft.classes[i].subclass=el.value; drawCharacterBuilder(); }));
  creationDialog.querySelector('[data-builder-add-class]')?.addEventListener('click',()=>{ const taken=new Set(creationDraft.classes.map(x=>x.name)); const next=known.find(x=>!taken.has(x.key))?.key||known[0]?.key||'fighter'; creationDraft.classes.push({name:next,level:1,subclass:''}); drawCharacterBuilder(); });
  creationDialog.querySelectorAll('[data-builder-remove-class]').forEach(el=>el.addEventListener('click',()=>{ if(creationDraft.classes.length>1){creationDraft.classes.splice(Number(el.dataset.builderRemoveClass),1);drawCharacterBuilder();} }));
  creationDialog.querySelector('[data-builder-fresh]')?.addEventListener('click',()=>{ if(confirm('Start the builder from a fresh character? This does not replace the current sheet until you click Apply Build & Continue.')){creationDraft=ensureSheetSections(newCharacter());creationTargetLevel=1;drawCharacterBuilder();} });
}
function focusPanel(panelId){
  const panel=document.querySelector(`[data-panel-id="${panelId}"]`); if(!panel)return;
  if(panel.classList.contains('is-collapsed')) panel.querySelector('.panel-collapse')?.click();
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function focusNextIncomplete(){ const next=creationStatus(character).items.find(x=>!x.complete); if(!next)return; if(next.action==='spell-wizard')openSpellWizard(); else focusPanel(next.panel); }

function openLevelUp(){
  if(totalLevel(character)>=20){alert('This character is already level 20.');return;}
  const current=character.classes?.[0]?.name||classOptions()[0]?.key||'fighter'; levelUpDraft={classKey:current,subclass:''}; drawLevelUp(); levelUpDialog.showModal();
}
function drawLevelUp(){
  if(!levelUpDraft)return; const known=classOptions(), preview=levelUpPreview(character,levelUpDraft.classKey), current=(character.classes||[]).find(x=>x.name===levelUpDraft.classKey);
  const subs=subclassesForClass(levelUpDraft.classKey); const needSub=preview.subclassNeeded; if(current?.subclass)levelUpDraft.subclass=current.subclass;
  levelUpDialog.innerHTML=`<form method="dialog" class="levelup-form"><h2>Level Up</h2><p class="muted">Choose which class receives the next character level. Adding a new class validates the 2014 multiclass ability prerequisites for both your existing class(es) and the new class.</p><label class="mini-field"><span>Class receiving the level</span><select data-levelup-class>${known.map(x=>`<option value="${esc(x.key)}" ${x.key===levelUpDraft.classKey?'selected':''}>${esc(x.label)}${(character.classes||[]).some(c=>c.name===x.key)?` (currently ${character.classes.find(c=>c.name===x.key).level})`:' (new multiclass)'}</option>`).join('')}</select></label><div class="levelup-preview ${preview.ok?'':'blocked'}"><h3>${esc(preview.className||levelUpDraft.classKey)} ${preview.oldLevel||0} → ${preview.newLevel||1}</h3>${preview.reasons?.length?`<div class="validation-banner compact">${preview.reasons.map(esc).join(' · ')}</div>`:''}${preview.features?.length?`<div><strong>New class features:</strong> ${preview.features.map(esc).join(', ')}</div>`:`<div class="muted">No named class feature is registered exactly at this level.</div>`}${preview.asiGained?`<div><strong>New ASI/feat slot:</strong> ${preview.asiGained}</div>`:''}${needSub?`<label class="mini-field section-gap"><span>Subclass now required</span><select data-levelup-subclass><option value="">Choose subclass...</option>${subs.map(x=>`<option value="${esc(x.id)}" ${x.id===levelUpDraft.subclass?'selected':''}>${esc(x.displayLabel)}</option>`).join('')}</select></label>`:''}<p class="muted">After applying, Creation Status will flag any newly unlocked skill, Expertise, ASI/feat, feature, or spell choices.</p></div><div class="dialog-actions"><button value="cancel">Cancel</button><button value="apply" ${!preview.ok||(needSub&&!levelUpDraft.subclass)?'disabled':''}>Apply Level</button></div></form>`;
  levelUpDialog.querySelector('[data-levelup-class]')?.addEventListener('change',e=>{levelUpDraft={classKey:e.target.value,subclass:''};drawLevelUp();});
  levelUpDialog.querySelector('[data-levelup-subclass]')?.addEventListener('change',e=>{levelUpDraft.subclass=e.target.value;drawLevelUp();});
}

function openLevels() {
  const known = classOptions();
  const draft = character.classes.map(c => ({...c}));
  levelDialog.innerHTML = `<form method="dialog"><h2>Classes & Levels</h2><p class="muted">Subclass choices unlock automatically at the level required by each class. Multiclass plans validate the 2014 ability prerequisites and total level cannot exceed 20.</p><div id="class-editor"></div><button type="button" data-add-class>+ Add Class</button><div id="class-plan-problems"></div><div class="dialog-actions"><button value="cancel">Cancel</button><button value="save" data-level-save>Apply</button></div></form>`;
  const wrap = levelDialog.querySelector("#class-editor");
  const drawRows = () => { wrap.innerHTML = draft.map((c,i)=>classLine(c,i,known,draft.length)).join(""); const issues=classPlanIssues({...character,classes:draft},draft); const box=levelDialog.querySelector('#class-plan-problems'); if(box)box.innerHTML=issues.length?`<div class="validation-banner compact"><strong>Fix before applying:</strong> ${issues.map(esc).join(' · ')}</div>`:`<div class="good wizard-complete">Class plan is valid.</div>`; const save=levelDialog.querySelector('[data-level-save]'); if(save)save.disabled=!!issues.length; bindClassRows(); };
  const bindClassRows = () => {
    wrap.querySelectorAll(".class-line").forEach((row,i)=>{
      const classSel=row.querySelector("[data-class]"); const levelInput=row.querySelector("[data-level]"); const subSel=row.querySelector("[data-subclass]"); const remove=row.querySelector("[data-remove]");
      classSel.onchange=()=>{ draft[i].name=classSel.value; draft[i].subclass=""; drawRows(); };
      levelInput.oninput=()=>{ draft[i].level=Math.min(20,Math.max(1,Number(levelInput.value)||1)); if (draft[i].level < subclassUnlockLevel(draft[i].name)) draft[i].subclass=""; drawRows(); rowForIndex(i)?.querySelector("[data-level]")?.focus(); };
      subSel.onchange=()=>{ draft[i].subclass=subSel.value; drawRows(); rowForIndex(i)?.querySelector('[data-subclass]')?.focus(); };
      remove.onclick=()=>{ if(draft.length>1){ draft.splice(i,1); drawRows(); } };
    });
  };
  const rowForIndex = i => wrap.querySelector(`.class-line[data-index="${i}"]`);
  levelDialog.querySelector("[data-add-class]").onclick = () => { const first=known[0]?.key||"fighter"; draft.push({name:first,level:1,subclass:""}); drawRows(); };
  drawRows();
  levelDialog.onclose = () => {
    if (levelDialog.returnValue !== "save") return;
    character.classes = draft.map(c=>({name:c.name,level:Math.max(1,Math.min(20,Number(c.level)||1)),subclass:c.subclass||""}));
    updatePrimaryClassSaves(); reconcileCharacterState(); render();
  };
  levelDialog.showModal();
}

function classLine(c,i,known,totalRows) {
  const subs=subclassesForClass(c.name); const unlock=subclassUnlockLevel(c.name); const unlocked=Number(c.level)>=unlock; const validSub=subs.some(s=>s.id===c.subclass);
  const available = i===0 ? known.filter(x=>!x.data?.prestigeClassPrereq || x.key===c.name) : known;
  const subOptions = !subs.length ? `<option value="">No subclasses registered</option>` : !unlocked ? `<option value="">Available at class level ${unlock}</option>` : `<option value="">Select subclass...</option>${subs.map(s=>`<option value="${esc(s.id)}" ${s.id===c.subclass?"selected":""}>${esc(s.displayLabel)}</option>`).join("")}`;
  return `<div class="class-line" data-index="${i}"><div class="mini-field"><label>Class</label><select data-class>${available.map(x=>`<option value="${esc(x.key)}" ${x.key===c.name?"selected":""}>${esc(x.label)}</option>`).join("")}</select></div><div class="mini-field"><label>Level</label><input data-level type="number" min="1" max="20" value="${c.level}"></div><div class="mini-field"><label>Subclass</label><select data-subclass ${unlocked&&subs.length?"":"disabled"}>${!validSub && c.subclass ? `<option value="${esc(c.subclass)}" selected>Unknown: ${esc(c.subclass)}</option>`:""}${subOptions}</select></div><button type="button" data-remove title="Remove class" ${totalRows<=1?"disabled":""}>×</button></div>`;
}

function updatePrimaryClassSaves() {
  const first=character.classes[0]; const saves=registries.ClassList[first?.name]?.saves;
  if (Array.isArray(saves)) {
    const map={Str:"str",Dex:"dex",Con:"con",Int:"int",Wis:"wis",Cha:"cha"};
    character.saveProficiencies=saves.map(x=>map[x]||String(x).toLowerCase().slice(0,3)).filter(Boolean);
  }
}


// v0.8.24 QOL: editable/searchable comboboxes backed by the original <select>.
// The native select remains the source of truth, but the user interacts with a
// visible text field. This avoids Firefox native-select interception problems.
let searchableSelectState=null;
function searchableSelectEntries(select){
  return [...select.options].map((option,index)=>({
    option,index,label:(option.textContent||'').trim(),value:option.value,
    disabled:option.disabled || option.parentElement?.disabled || false
  })).filter(x=>x.value || x.label);
}
function closeSearchableSelect(){
  if(searchableSelectState?.input && searchableSelectState?.select){
    const opt=searchableSelectState.select.selectedOptions?.[0];
    searchableSelectState.input.value=(opt?.textContent||'').trim();
  }
  searchableSelectState?.root?.remove(); searchableSelectState=null;
}
function positionSearchableSelect(){
  if(!searchableSelectState)return;
  const {input,root}=searchableSelectState; const r=input.getBoundingClientRect();
  root.style.left=`${Math.max(8,Math.min(r.left,window.innerWidth-Math.max(260,r.width)-8))}px`;
  root.style.top=`${Math.min(window.innerHeight-260,r.bottom+4)}px`;
  root.style.width=`${Math.max(260,r.width)}px`;
}
function renderSearchableSelect(){
  if(!searchableSelectState)return;
  const {select,list}=searchableSelectState;
  const q=String(searchableSelectState.query||'').trim().toLocaleLowerCase();
  const entries=searchableSelectEntries(select).filter(x=>!q || x.label.toLocaleLowerCase().includes(q));
  list.innerHTML=entries.length ? entries.map(x=>`<button type="button" class="select-search-option ${x.disabled?'is-disabled':''} ${x.value===select.value?'is-current':''}" data-select-search-index="${x.index}" ${x.disabled?'disabled':''}>${esc(x.label)}${x.disabled?'<span>Already selected / unavailable</span>':''}</button>`).join('') : '<div class="select-search-empty">No matching choices</div>';
}
function openSearchableSelect(select,input,clearForTyping=false){
  if(!(select instanceof HTMLSelectElement) || select.disabled)return;
  if(searchableSelectState?.select===select){
    if(clearForTyping){ input.value=''; searchableSelectState.query=''; renderSearchableSelect(); }
    return;
  }
  closeSearchableSelect();
  const root=document.createElement('div'); root.className='select-search-popover';
  root.innerHTML='<div class="select-search-results"></div>';
  // A modal <dialog> is promoted to the browser's top layer. Elements appended
  // to <body> cannot paint above it regardless of z-index, so keep the results
  // popover inside the active dialog when the combobox lives in one.
  const dialog=input.closest('dialog[open]');
  (dialog || document.body).appendChild(root);
  searchableSelectState={select,input,root,list:root.querySelector('.select-search-results'),query:''};
  if(clearForTyping) input.value='';
  positionSearchableSelect(); renderSearchableSelect();
}
function enhanceSearchableSelect(select){
  if(!(select instanceof HTMLSelectElement) || select.dataset.searchEnhanced==='1')return;
  select.dataset.searchEnhanced='1';
  const wrap=document.createElement('div'); wrap.className='searchable-select-control';
  const input=document.createElement('input');
  input.type='text'; input.className='searchable-select-input'; input.autocomplete='off'; input.spellcheck=false;
  input.setAttribute('aria-label', select.getAttribute('aria-label') || 'Search choices');
  input.placeholder='Type to filter…';
  const selected=select.selectedOptions?.[0]; input.value=(selected?.textContent||'').trim();
  select.parentNode.insertBefore(wrap,select); wrap.appendChild(input); wrap.appendChild(select);
  select.classList.add('searchable-select-native');
  input.disabled=select.disabled;
  // Opening a combobox always shows the full choice list. The displayed current
  // value (including placeholder text such as 'Choose race...') is not a search
  // query until the user actually types.
  input.addEventListener('focus',()=>{ openSearchableSelect(select,input,false); if(searchableSelectState?.select===select){searchableSelectState.query='';renderSearchableSelect();} });
  input.addEventListener('click',()=>{ openSearchableSelect(select,input,false); if(searchableSelectState?.select===select){searchableSelectState.query='';renderSearchableSelect();} input.select(); });
  input.addEventListener('input',()=>{ openSearchableSelect(select,input,false); if(searchableSelectState?.select===select) searchableSelectState.query=input.value; renderSearchableSelect(); });
  // Any code path that changes the native select (random buttons, migrations,
  // wizard logic) must also update the visible editable combobox.
  select.addEventListener('change',()=>queueMicrotask(()=>syncSearchableSelectInput(select)));
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ e.preventDefault(); closeSearchableSelect(); input.blur(); }
    if(e.key==='ArrowDown' && searchableSelectState?.select===select){ e.preventDefault(); searchableSelectState.list.querySelector('button:not(:disabled)')?.focus(); }
  });
}
function enhanceAllSearchableSelects(){ document.querySelectorAll('select').forEach(enhanceSearchableSelect); }

// The application rebuilds sections during render, so enhance newly-created
// selects after each DOM update without changing their existing event handlers.
// IMPORTANT: dialogs (Character Builder, Full Wizard, Spell Wizard, etc.) live
// outside #app, so observe the whole document body rather than only #app.
const searchableSelectObserver=new MutationObserver(()=>queueMicrotask(enhanceAllSearchableSelects));
searchableSelectObserver.observe(document.body,{childList:true,subtree:true});
queueMicrotask(enhanceAllSearchableSelects);

document.addEventListener('keydown',e=>{
  if(searchableSelectState && e.key==='Escape'){ e.preventDefault(); const input=searchableSelectState.input; closeSearchableSelect(); input?.focus(); }
});
document.addEventListener('click',e=>{
  const choice=e.target.closest?.('[data-select-search-index]');
  if(choice && searchableSelectState){
    const {select,input}=searchableSelectState; const option=select.options[Number(choice.dataset.selectSearchIndex)];
    if(option && !option.disabled){
      select.value=option.value;
      input.value=(option.textContent||'').trim();
      closeSearchableSelect();
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return;
  }
  if(searchableSelectState && !searchableSelectState.root.contains(e.target) && e.target!==searchableSelectState.input) closeSearchableSelect();
});
window.addEventListener('resize',positionSearchableSelect); window.addEventListener('scroll',positionSearchableSelect,true);

app.addEventListener("input", e => { const path=e.target?.dataset?.path; if(!path)return; const v=e.target.type==="number"?(e.target.value===""?"":Number(e.target.value)):e.target.value; setByPath(path,v,{renderNow:false}); });
app.addEventListener("change", e => {
  if(e.target?.dataset?.featureResourceRemaining!==undefined){ const id=e.target.dataset.featureResourceRemaining; const status=resourceStatus(character).find(x=>x.id===id); if(status){ const remaining=Math.max(0,Math.min(status.max,Math.trunc(Number(e.target.value)||0))); setResourceUsed(character,id,status.max-remaining); saveCharacter(character); render(); } return; }
  if(e.target?.dataset?.notes!==undefined){ character.notes=e.target.value; saveCharacter(character); return; }
  if(e.target?.dataset?.spellFullDescriptions!==undefined){ showFullSpellDescriptions=e.target.checked; try { localStorage.setItem(SPELL_DESCRIPTION_VIEW_KEY,String(showFullSpellDescriptions)); } catch {} render(); return; }
  if(e.target?.dataset?.preparedCaster!==undefined){
    reconcileSpellcastingState(character);
    const caster=spellcastersForCharacter(character).find(c=>c.id===e.target.dataset.preparedCaster && c.typeSp==='list');
    const state=character.spellcasting?.casters?.[e.target.dataset.preparedCaster];
    if(caster&&state){ const id=e.target.dataset.preparedSpell; const set=new Set(state.prepared||[]); if(e.target.checked){ if(set.size<caster.preparedCount)set.add(id); } else set.delete(id); state.prepared=[...set].filter(x=>(caster.spells||[]).some(sp=>sp.id===x)).slice(0,caster.preparedCount); reconcileSpellcastingState(character); saveCharacter(character); render(); }
    return;
  }
  if(e.target?.dataset?.weaponProficient!==undefined){ const x=character.weapons[Number(e.target.dataset.index)]; if(x){ x.proficientOverride=e.target.checked; saveCharacter(character); render(); } return; }
  if(e.target?.dataset?.saveProf!==undefined){ setSaveProficiencyOverride(character,e.target.dataset.saveProf,e.target.checked); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.weaponEnhancement!==undefined){ const x=character.weapons[Number(e.target.dataset.index)]; if(x){ setWeaponEnhancement(x,e.target.value); saveCharacter(character); render(); } return; }
  if(e.target?.dataset?.weaponField){ const x=character.weapons[Number(e.target.dataset.index)]; if(x){ const f=e.target.dataset.weaponField; x[f]=e.target.type==="number"?Number(e.target.value):e.target.value; if(f==="name") syncWeaponNameEnhancement(x); saveCharacter(character); render(); } return; }
  if(e.target?.dataset?.armorEnhancement!==undefined){ setArmorEnhancement(character,e.target.value); character.armorClass=calculatedArmorClass(character); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.armorField){ const f=e.target.dataset.armorField; character.armor[f]=e.target.type==="number"?(e.target.value===""?null:Number(e.target.value)):e.target.value; if(f==="name") syncArmorNameEnhancement(character); character.armorClass=calculatedArmorClass(character); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.shieldEnhancement!==undefined){ character.armor.shieldEnhancement=Number(e.target.value)||0; character.armorClass=calculatedArmorClass(character); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.addKind){ addCollection(e.target.dataset.addKind,e.target.value); return; }
  if(e.target?.dataset?.sectionSelect==="armor"){ if(String(e.target.value).startsWith("__unarmored_")){ character.armor.selected=""; character.armor.unarmoredDefense=String(e.target.value).replace("__unarmored_",""); character.armor.name="Unarmored"; character.armor.enhancement=0; character.armor.baseAc=10; character.armor.typeOverride=""; } else selectArmor(character,e.target.value); character.armorClass=calculatedArmorClass(character); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.sectionCheck==="shield"){ character.armor.shield=e.target.checked; character.armorClass=calculatedArmorClass(character); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.sectionNumber==="armor-misc"){ character.armor.misc=Number(e.target.value)||0; character.armorClass=calculatedArmorClass(character); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.magicAttune!==undefined){ const x=character.magicItems[Number(e.target.dataset.magicAttune)]; if(x&&typeof x==="object") x.attuned=e.target.checked; saveCharacter(character); render(); return; }
  if(e.target?.dataset?.magicChoice!==undefined){ const x=character.magicItems[Number(e.target.dataset.magicChoice)]; if(x&&typeof x==="object"){ x.choice=e.target.value; x.enhancement=0; } saveCharacter(character); render(); return; }
  if(e.target?.dataset?.magicEnhancement!==undefined){ const x=character.magicItems[Number(e.target.dataset.magicEnhancement)]; if(x&&typeof x==="object") x.enhancement=Number(e.target.value)||0; reconcileCharacterState(); render(); return; }
  if(e.target?.dataset?.currency!==undefined){ const k=e.target.dataset.currency; character.currency[k]=Math.max(0,Number(e.target.value)||0); saveCharacter(character); return; }
  if(e.target?.dataset?.combatNumber!==undefined){ character.combat??={initiativeMisc:0,speedMisc:0,conditions:[]}; character.combat[e.target.dataset.combatNumber]=Number(e.target.value)||0; reconcileCharacterState(); render(); return; }
  if(e.target?.dataset?.condition!==undefined){ character.combat??={initiativeMisc:0,speedMisc:0,conditions:[]}; const set=new Set(character.combat.conditions||[]); e.target.checked?set.add(e.target.dataset.condition):set.delete(e.target.dataset.condition); character.combat.conditions=[...set]; reconcileCharacterState(); render(); return; }
  if(e.target?.dataset?.gearQty!==undefined){ const x=character.inventory[Number(e.target.dataset.gearQty)]; if(x&&typeof x==="object") x.qty=Math.max(1,Number(e.target.value)||1); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.racialScore!==undefined){ setRacialAbilityOverride(character,e.target.dataset.racialScore,e.target.value); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.otherScore!==undefined){ setManualAbilityAdjustment(character,e.target.dataset.otherScore,e.target.value); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.racialAbilityMode!==undefined){ setRacialAbilityMode(character,e.target.value); reconcileAbilityScores(character); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.racialAbilitySlot!==undefined){ setRacialAbilityChoice(character,Number(e.target.dataset.racialAbilitySlot)||0,e.target.value); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.generalProfSource){ setGeneralProficiencyChoice(character,e.target.dataset.generalProfSource,Number(e.target.dataset.generalProfSlot)||0,e.target.value); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.featAbilitySource){ setFeatAbilityChoice(character,e.target.dataset.featAbilitySource,e.target.value); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.featureChoiceSource){ setFeatureChoice(character,e.target.dataset.featureChoiceSource,e.target.value); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.optionalFeatureSource){ toggleOptionalFeatureChoice(character,e.target.dataset.optionalFeatureSource,e.target.dataset.optionalFeatureValue,e.target.checked); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.extraFeatureSource){ setExtraFeatureChoice(character,e.target.dataset.extraFeatureSource,Number(e.target.dataset.extraFeatureSlot),e.target.value); reconcileCharacterState(); render(); return; }
  if(e.target?.dataset?.bonusFeatSource){ setBonusFeatChoice(character,e.target.dataset.bonusFeatSource,e.target.value); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.improvementSource){ setImprovementChoice(character,e.target.dataset.improvementSource,{[e.target.dataset.improvementField]:e.target.value}); saveCharacter(character); render(); return; }
  const sourceId=e.target?.dataset?.skillSource;
  if(sourceId){ setSkillChoice(character, sourceId, Number(e.target.dataset.skillSlot)||0, e.target.value); reconcileExpertise(character); saveCharacter(character); render(); return; }
  const expertiseId=e.target?.dataset?.expertiseSource;
  if(expertiseId){ setExpertiseChoice(character, expertiseId, Number(e.target.dataset.expertiseSlot)||0, e.target.value); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.hpMode!==undefined){ character.hp.mode=e.target.value; if(e.target.value==='roll') rerollHP(character); reconcileHP(character); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.hpManual!==undefined){ character.hp.manualMax=Math.max(1,Number(e.target.value)||1); reconcileHP(character); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.hpMax!==undefined){ const max=Math.max(1,Number(e.target.value)||1); character.hp.mode='manual'; character.hp.manualMax=max; character.hp.max=max; if(Number(character.hp.current)>max) character.hp.current=max; saveCharacter(character); render(); return; }
  const path=e.target?.dataset?.path; if(!path)return; const v=e.target.type==="number"?Number(e.target.value||0):e.target.value; setByPath(path,v);
});
document.addEventListener("click", e => {
  const button=e.target.closest?.("[data-random-choice]");
  if(!button) return;
  e.preventDefault();
  const select=button.closest(".random-select-wrap")?.querySelector("select");
  chooseRandomSelectOption(select);
});

app.addEventListener("click", e => {
  if(e.target?.dataset?.racialScoreReset!==undefined){ clearRacialAbilityOverride(character,e.target.dataset.racialScoreReset); saveCharacter(character); render(); return; }
  const resourceAdjust=e.target.closest?.('[data-resource-adjust]');
  if(resourceAdjust){ const id=resourceAdjust.dataset.resourceId; const delta=Number(resourceAdjust.dataset.resourceAdjust)||0; const status=resourceStatus(character).find(x=>x.id===id); if(status){ const remaining=Math.max(0,Math.min(status.max,status.remaining+delta)); setResourceUsed(character,id,status.max-remaining); saveCharacter(character); render(); } return; }
  const resourceButton=e.target.closest?.('[data-feature-resource]');
  if(resourceButton){ const id=resourceButton.dataset.featureResource; const status=resourceStatus(character).find(x=>x.id===id); if(status){ const index=Number(resourceButton.dataset.featureResourceIndex); setResourceUsed(character,id,index<status.used?index:index+1); saveCharacter(character); render(); } return; }

  const spellExpand=e.target.closest?.('[data-spell-expand]');
  if(spellExpand){ const id=spellExpand.dataset.spellExpand; expandedSpellIds.has(id)?expandedSpellIds.delete(id):expandedSpellIds.add(id); render(); return; }
  if(e.target?.dataset?.removeKind){ removeCollection(e.target.dataset.removeKind,Number(e.target.dataset.index)); return; }
  if(e.target?.dataset?.spellSlotPip!==undefined){ const pool=e.target.dataset.spellSlotPip, level=Number(e.target.dataset.spellSlotLevel)||0, index=Number(e.target.dataset.spellSlotIndex)||0; const slots=spellSlotSummary(character); const current=pool==='pact'?(slots.pact?.used||0):(slots.standard.find(x=>x.level===level)?.used||0); setSpellSlotUsed(character,pool,level,index<current?index:index+1); saveCharacter(character); render(); return; }
  const act=e.target?.dataset?.act;
  if(act==="expand-prepared-spells"){ expandPreparedSpells(); render(); return; }
  if(act==="expand-all-spells"){ expandedSpellIds=new Set((character.spells||[]).map(x=>typeof x==='string'?x:x?.id).filter(Boolean)); for(const c of listPreparedCasters()) for(const sp of c.spells||[]) expandedSpellIds.add(sp.id); render(); return; }
  if(act==="collapse-all-spells"){ expandedSpellIds.clear(); render(); return; }
  if(act==="short-rest"){ performRest(character,"short"); saveCharacter(character); render(); return; }
  if(act==="long-rest"){ performRest(character,"long"); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.weaponProfAuto!==undefined){ const x=character.weapons[Number(e.target.dataset.weaponProfAuto)]; if(x){ x.proficientOverride=null; saveCharacter(character); render(); } return; }
  if(e.target?.dataset?.saveProfAuto!==undefined){ clearSaveProficiencyOverride(character,e.target.dataset.saveProfAuto); saveCharacter(character); render(); return; }
  if(e.target?.dataset?.workflowPanel){ focusPanel(e.target.dataset.workflowPanel); return; }
  if(act==="full-wizard"){ openFullWizard(); return; }
  if(act==="character-builder"){ openCharacterBuilder(); return; }
  if(act==="level-up"){ openLevelUp(); return; }
  if(act==="gear-wizard"){ openGearWizard(); return; }
  if(act==="spell-wizard"){ openSpellWizard(); return; }
  if(act==="reroll-hp"){ rerollHP(character); saveCharacter(character); render(); return; }
  if(act==="levels") openLevels();
  if(act==="load-mpmb") mpmbInput.click();
  if(act==="report"&&lastImport) exportImportReport();
  if(act==="export") exportCharacter();
  if(act==="tester-report"){ exportTesterReport(); return; }
  if(act==="print"){ window.print(); return; }
  if(act==="import") charInput.click();
  if(act==="jump-choices"){ focusPanel("choices"); return; }
  if(act==="theme"){ openThemeDialog(); return; }
  if(act==="reset-layout"){ resetSheetLayout(); render(); return; }
  if(act==="save-layout-1"){ saveLayoutPreset(1, document.querySelector(".sheet")); render(); return; }
  if(act==="save-layout-2"){ saveLayoutPreset(2, document.querySelector(".sheet")); render(); return; }
  if(act==="load-layout-1"){ if(loadLayoutPreset(1, DEFAULT_PANEL_ORDER)) render(); return; }
  if(act==="load-layout-2"){ if(loadLayoutPreset(2, DEFAULT_PANEL_ORDER)) render(); return; }
  if(act==="base-report") document.querySelector("#diag-output").textContent=formatImport(getBaseReport());
  if(act==="builtin-report") document.querySelector("#diag-output").textContent=formatImport(getBuiltInReport());
  if(act==="last-report"&&lastImport) document.querySelector("#diag-output").textContent=formatImport(lastImport);
});


let themeTargetPanel = null;
function rgbInputs(prefix, rgb){
  const c=normalizeRgb(rgb);
  return `<div class="theme-picker-row"><input type="color" data-theme-color="${prefix}" value="${rgbToHex(c)}" aria-label="${prefix} color picker"><div class="rgb-grid">${[["r","R"],["g","G"],["b","B"]].map(([k,l])=>`<label>${l}<input type="number" min="0" max="255" step="1" data-theme-rgb="${prefix}" data-channel="${k}" value="${c[k]}"></label>`).join("")}</div></div>`;
}
function openThemeDialog(panelId=null, panelTitle=""){
  themeTargetPanel=panelId;
  const prefs=loadThemePrefs();
  if(panelId){
    const current=prefs.overrides[panelId] || prefs.panel;
    const inherited=!prefs.overrides[panelId];
    themeDialog.innerHTML=`<form method="dialog" class="theme-form"><h2>Section Color</h2><div class="theme-panel-title"><strong>${esc(panelTitle||panelId)}</strong> <span class="muted">${inherited?"currently using overall box color":"individual override active"}</span></div><div class="theme-color-card"><h3>Individual box color</h3>${rgbInputs("panel-override",current)}<p class="theme-note">This color overrides the overall box color for this section only.</p></div><div class="theme-actions-secondary"><button type="button" data-theme-command="clear-panel">Reset This Box to Overall Color</button></div><div class="dialog-actions"><button value="cancel">Close</button><button type="button" data-theme-command="apply-panel">Apply Color</button></div></form>`;
  } else {
    themeDialog.innerHTML=`<form method="dialog" class="theme-form"><h2>Color Settings</h2><p class="theme-note"><strong>Saved locally:</strong> color settings are stored only in this browser/profile. They are not part of the exported character file.</p><div class="theme-grid"><div class="theme-color-card"><h3>Page background</h3>${rgbInputs("page",prefs.page)}</div><div class="theme-color-card"><h3>Overall box color</h3>${rgbInputs("panel",prefs.panel)}<p class="theme-note">Individual section colors override this value.</p></div></div><div class="theme-actions-secondary"><button type="button" data-theme-command="reset-overrides">Reset All Individual Box Colors</button><button type="button" data-theme-command="restore-original">Revert All Colors to Original</button></div><div class="dialog-actions"><button value="cancel">Close</button><button type="button" data-theme-command="apply-global">Apply Colors</button></div></form>`;
  }
  wireThemeDialog();
  themeDialog.showModal();
}
function themeRgbFromDialog(prefix){
  const vals={};
  themeDialog.querySelectorAll(`[data-theme-rgb="${prefix}"]`).forEach(x=>vals[x.dataset.channel]=x.value);
  return normalizeRgb(vals);
}
function syncThemeColorPicker(prefix){
  const color=themeDialog.querySelector(`[data-theme-color="${prefix}"]`);
  if(color) color.value=rgbToHex(themeRgbFromDialog(prefix));
}
function syncThemeRgb(prefix, rgb){
  const c=normalizeRgb(rgb);
  themeDialog.querySelectorAll(`[data-theme-rgb="${prefix}"]`).forEach(x=>x.value=c[x.dataset.channel]);
  const color=themeDialog.querySelector(`[data-theme-color="${prefix}"]`); if(color) color.value=rgbToHex(c);
}
function wireThemeDialog(){
  themeDialog.querySelectorAll("[data-theme-rgb]").forEach(x=>x.addEventListener("input",()=>syncThemeColorPicker(x.dataset.themeRgb)));
  themeDialog.querySelectorAll("[data-theme-color]").forEach(x=>x.addEventListener("input",()=>syncThemeRgb(x.dataset.themeColor,hexToRgb(x.value))));
  themeDialog.querySelectorAll("[data-theme-command]").forEach(btn=>btn.addEventListener("click",()=>{
    const cmd=btn.dataset.themeCommand;
    if(cmd==="apply-global"){
      const prefs=loadThemePrefs(); prefs.page=themeRgbFromDialog("page"); prefs.panel=themeRgbFromDialog("panel"); saveThemePrefs(prefs); applyThemePrefs(document); themeDialog.close();
    } else if(cmd==="apply-panel" && themeTargetPanel){ setPanelOverride(themeTargetPanel,themeRgbFromDialog("panel-override")); applyThemePrefs(document); themeDialog.close();
    } else if(cmd==="clear-panel" && themeTargetPanel){ clearPanelOverride(themeTargetPanel); applyThemePrefs(document); themeDialog.close();
    } else if(cmd==="reset-overrides"){ resetAllPanelOverrides(); applyThemePrefs(document); themeDialog.close(); openThemeDialog(); }
    else if(cmd==="restore-original"){ restoreOriginalTheme(); applyThemePrefs(document); themeDialog.close(); }
  }));
}
window.addEventListener("mpmb-panel-theme",e=>openThemeDialog(e.detail?.panelId,e.detail?.title));


creationDialog.addEventListener("close",()=>{
  if(creationDialog.returnValue!=="apply" || !creationDraft){creationDraft=null;if(resumeFullWizard){resumeFullWizard=false;setTimeout(()=>openFullWizard(fullWizardStep),0);}return;}
  if(classPlanIssues(creationDraft,creationDraft.classes).length){ alert("Fix the class plan before applying the character build."); creationDialog.showModal(); return; }
  character=ensureSheetSections(normalizeCharacter(cloneCharacterData(creationDraft)));
  updatePrimaryClassSaves(); reconcileCharacterState(); creationDraft=null; render(); if(resumeFullWizard){resumeFullWizard=false;setTimeout(()=>openFullWizard(fullWizardStep),0);}else setTimeout(focusNextIncomplete,0);
});

levelUpDialog.addEventListener("close",()=>{
  if(levelUpDialog.returnValue!=="apply" || !levelUpDraft){levelUpDraft=null;return;}
  const preview=levelUpPreview(character,levelUpDraft.classKey);
  if(!preview.ok){alert(preview.reasons.join("\n"));levelUpDialog.showModal();return;}
  if(preview.subclassNeeded&&!levelUpDraft.subclass){alert("Choose the subclass unlocked at this level.");levelUpDialog.showModal();return;}
  applyLevelUp(character,levelUpDraft.classKey,levelUpDraft.subclass);
  reconcileCharacterState(); levelUpDraft=null; render(); setTimeout(focusNextIncomplete,0);
});

gearDialog.addEventListener("close",()=>{
  if(gearDialog.returnValue!=="apply" || !gearWizardDraft) { gearWizardDraft=null; if(resumeFullWizard){resumeFullWizard=false;setTimeout(()=>openFullWizard(fullWizardStep),0);} return; }
  applyStartingGear(character,gearWizardDraft);
  const baseAc=calculatedArmorClass(character);
  character.armorClass=combatProfile(character,baseAc).ac.ac;
  character.speed=combatProfile(character,baseAc).speed.walk;
  saveCharacter(character); gearWizardDraft=null; render(); if(resumeFullWizard){resumeFullWizard=false;setTimeout(()=>openFullWizard(fullWizardStep),0);}
});

spellDialog.addEventListener("close",()=>{
  if(spellDialog.returnValue!=="apply" || !spellWizardDraft){ spellWizardDraft=null; if(resumeFullWizard){resumeFullWizard=false;setTimeout(()=>openFullWizard(fullWizardStep),0);} return; }
  const problems=validSpellWizardDraft(spellWizardDraft);
  if(problems.length){ alert(`Complete the spell choices first:\n\n${problems.join("\n")}`); spellDialog.showModal(); return; }
  applySpellWizard(character,spellWizardDraft); saveCharacter(character); spellWizardDraft=null; render(); if(resumeFullWizard){resumeFullWizard=false;setTimeout(()=>openFullWizard(fullWizardStep),0);}
});

mpmbInput.addEventListener("change", async()=>{ const file=mpmbInput.files?.[0]; if(!file)return; lastImport=importAdditionalContent(await file.text(),file.name); render(); mpmbInput.value=""; });
charInput.addEventListener("change", async()=>{ const file=charInput.files?.[0]; if(!file)return; try{character=ensureSheetSections(normalizeCharacter(JSON.parse(await file.text())));saveCharacter(character);}catch(e){alert(`Could not import character: ${e.message}`);}render();charInput.value=""; });
function exportImportReport(){ if(!lastImport)return; downloadText(`${lastImport.filename}.mpmb-web-report.txt`,importReportText(lastImport),"text/plain"); }
function exportTesterReport(){
  const report={
    generatedAt:new Date().toISOString(),
    app:{version:APP_VERSION,stage:APP_STAGE,online:navigator.onLine,userAgent:navigator.userAgent,viewport:{width:window.innerWidth,height:window.innerHeight,pixelRatio:window.devicePixelRatio||1}},
    content:{registryCounts:registryCounts(),builtInOk:!!builtInImport?.ok,baseOk:!!builtInImport?.baseReport?.ok},
    character:{name:character.name||"",level:totalLevel(character),race:character.race||"",raceVariant:character.raceVariant||"",background:character.background||"",classes:character.classes||[]},
    creationIssues:characterIssues(),
    behaviorDiagnostics:behaviorDiagnostics(character),
    fullCharacter:character
  };
  const base=String(character.name||"character").trim().replace(/[\\/:*?"<>|]+/g,"-")||"character";
  downloadText(`${base}.tester-report.json`,JSON.stringify(report,null,2),"application/json");
}
function exportCharacter(){
  const base = String(character.name || "character").trim().replace(/[\\/:*?"<>|]+/g, "-") || "character";
  const suggested = `${base}.character.json`;
  const requested = window.prompt("Export character filename:", suggested);
  if (requested == null) return;
  let filename = String(requested).trim().replace(/[\\/:*?"<>|]+/g, "-");
  if (!filename) filename = suggested;
  if (!/\.json$/i.test(filename)) filename += ".character.json";
  downloadText(filename,JSON.stringify(character,null,2),"application/json");
}
function downloadText(name,text,type){ const blob=new Blob([text],{type});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

// Browser/PWA builds can work offline after the first successful load. Tauri desktop/mobile
// bundles do not depend on this, but using the same frontend keeps behavior consistent.
if ("serviceWorker" in navigator && !location.protocol.startsWith("tauri")) {
  window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
}

// First-class baseline saves should be deterministic and source-driven.
if (!character.saveProficiencies?.length) { updatePrimaryClassSaves(); }
reconcileCharacterState();
render();

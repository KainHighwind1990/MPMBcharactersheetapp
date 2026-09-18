import { resetSpellSlots, spellSlotSummary } from "./spellcasting.js";
import { resetBehaviorResources, resourceStatus } from "./behavior-runtime.js";

export function performRest(character, kind = "long") {
  const rest = kind === "short" ? "short" : "long";
  const beforeSlots = spellSlotSummary(character);
  const beforeResources = resourceStatus(character);

  resetSpellSlots(character, rest);
  resetBehaviorResources(character, rest);

  const afterSlots = spellSlotSummary(character);
  const afterResources = resourceStatus(character);
  return {
    kind: rest,
    restoredStandardSlots: rest === "long" ? beforeSlots.standard.reduce((n, row) => n + row.used, 0) : 0,
    restoredPactSlots: Math.max(0, (beforeSlots.pact?.used || 0) - (afterSlots.pact?.used || 0)),
    restoredFeatureUses: beforeResources.reduce((n, row) => {
      const after = afterResources.find(x => x.id === row.id);
      return n + Math.max(0, row.used - Number(after?.used || 0));
    }, 0),
  };
}

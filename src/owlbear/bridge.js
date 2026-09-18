// Owlbear integration boundary. The standalone sheet does not depend on the OBR SDK yet.
// Keeping all VTT-specific behavior here prevents the character/rules engine from becoming Owlbear-specific.
export const OBR_METADATA_KEY = "com.mpmb-web-sheet/character";

export function isEmbedded() {
  return window.self !== window.top;
}

export function owlBearStatus() {
  return {
    embedded: isEmbedded(),
    sdkLoaded: Boolean(globalThis.OBR),
    metadataKey: OBR_METADATA_KEY,
  };
}

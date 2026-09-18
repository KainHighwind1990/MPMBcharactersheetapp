const STORAGE_KEY = "mpmb-web-sheet.theme.v1";

export const ORIGINAL_THEME = Object.freeze({
  page: { r:17, g:19, b:24 },
  panel: { r:26, g:30, b:37 },
  overrides: {}
});

export function clampChannel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function normalizeRgb(value, fallback={r:0,g:0,b:0}) {
  const src = value && typeof value === "object" ? value : fallback;
  return {
    r: clampChannel(src.r ?? fallback.r),
    g: clampChannel(src.g ?? fallback.g),
    b: clampChannel(src.b ?? fallback.b)
  };
}

export function rgbToHex(rgb) {
  const c = normalizeRgb(rgb);
  return `#${[c.r,c.g,c.b].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
}

export function hexToRgb(hex, fallback={r:0,g:0,b:0}) {
  const raw = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(raw)) return normalizeRgb(fallback);
  return { r:parseInt(raw.slice(0,2),16), g:parseInt(raw.slice(2,4),16), b:parseInt(raw.slice(4,6),16) };
}

export function normalizeThemePrefs(raw) {
  const base = {
    page: normalizeRgb(raw?.page, ORIGINAL_THEME.page),
    panel: normalizeRgb(raw?.panel, ORIGINAL_THEME.panel),
    overrides: {}
  };
  if (raw?.overrides && typeof raw.overrides === "object") {
    for (const [id, rgb] of Object.entries(raw.overrides)) {
      if (!id) continue;
      base.overrides[id] = normalizeRgb(rgb, base.panel);
    }
  }
  return base;
}

export function loadThemePrefs() {
  try { return normalizeThemePrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")); }
  catch { return normalizeThemePrefs(null); }
}

export function saveThemePrefs(prefs) {
  const normalized = normalizeThemePrefs(prefs);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  return normalized;
}

export function resetAllPanelOverrides(prefs=loadThemePrefs()) {
  return saveThemePrefs({ ...prefs, overrides:{} });
}

export function restoreOriginalTheme() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  return normalizeThemePrefs(null);
}

export function setPanelOverride(panelId, rgb, prefs=loadThemePrefs()) {
  if (!panelId) return saveThemePrefs(prefs);
  const next = normalizeThemePrefs(prefs);
  next.overrides[panelId] = normalizeRgb(rgb, next.panel);
  return saveThemePrefs(next);
}

export function clearPanelOverride(panelId, prefs=loadThemePrefs()) {
  const next = normalizeThemePrefs(prefs);
  delete next.overrides[panelId];
  return saveThemePrefs(next);
}

export function applyThemePrefs(root=document) {
  const prefs = loadThemePrefs();
  const docEl = root.documentElement || document.documentElement;
  docEl.style.setProperty("--page-bg", rgbToHex(prefs.page));
  docEl.style.setProperty("--panel-bg", rgbToHex(prefs.panel));
  const panels = (root.querySelectorAll ? root : document).querySelectorAll?.(".panel[data-panel-id]") || [];
  for (const panel of panels) {
    const rgb = prefs.overrides[panel.dataset.panelId];
    if (rgb) {
      panel.style.setProperty("--panel-effective-bg", rgbToHex(rgb));
      panel.dataset.customColor = "1";
    } else {
      panel.style.removeProperty("--panel-effective-bg");
      delete panel.dataset.customColor;
    }
  }
  return prefs;
}

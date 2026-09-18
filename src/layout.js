const STORAGE_KEY = "mpmb-web-sheet-layout-v1";
const WIDTH_SEQUENCE = ["quarter", "third", "half", "full"];
const WIDTH_COLUMNS = { quarter: 3, third: 4, half: 6, full: 12 };
const GRID_ROW_PX = 1;
const GRID_VERTICAL_GAP_PX = 14;
const PRESET_PREFIX = "mpmb-web-sheet-layout-preset-v1-";

export const DEFAULT_PANEL_ORDER = [
  "identity", "creation-status", "choices", "abilities", "combat", "skills", "skill-proficiencies",
  "feats", "weapons", "armor", "magic-items", "spells", "equipment",
  "notes", "resources", "features", "feature-runtime", "runtime", "development", "diagnostics"
];

export const DEFAULT_PANEL_WIDTHS = {
  identity: "full",
  "creation-status": "full",
  choices: "full",
  abilities: "half",
  combat: "half",
  skills: "half",
  "skill-proficiencies": "half",
  feats: "half",
  weapons: "full",
  armor: "full",
  "magic-items": "full",
  spells: "full",
  equipment: "full",
  notes: "full",
  resources: "half",
  features: "full",
  "feature-runtime": "full",
  runtime: "full",
  development: "full",
  diagnostics: "full"
};

const PANEL_TITLES = {
  identity: "Identity",
  "creation-status": "Creation Status",
  choices: "Character Choices",
  abilities: "Abilities & Saving Throws",
  combat: "Combat Summary & Classes",
  skills: "Skills",
  "skill-proficiencies": "Skill Proficiencies & Expertise",
  feats: "Feats",
  weapons: "Attacks & Weapons",
  armor: "Armor & AC",
  "magic-items": "Magic Items",
  spells: "Spells",
  equipment: "Equipment & Gear",
  notes: "Notes",
  resources: "Resources",
  features: "Active Features",
  "feature-runtime": "Feature Actions & Resources",
  runtime: "Content Runtime",
  development: "Development Status",
  diagnostics: "MPMB Import Diagnostics"
};

export function defaultSheetLayout() {
  return { order: [...DEFAULT_PANEL_ORDER], panels: {} };
}

export function normalizeSheetLayout(raw, availableIds = DEFAULT_PANEL_ORDER) {
  const allowed = new Set(availableIds);
  const inputOrder = Array.isArray(raw?.order) ? raw.order : [];
  const order = [];
  for (const id of [...inputOrder, ...DEFAULT_PANEL_ORDER, ...availableIds]) {
    if (allowed.has(id) && !order.includes(id)) order.push(id);
  }
  const panels = {};
  for (const id of availableIds) {
    const src = raw?.panels?.[id] || {};
    const h = Number(src.height);
    panels[id] = {
      collapsed: !!src.collapsed,
      height: Number.isFinite(h) && h >= 110 ? Math.round(h) : null,
      width: WIDTH_SEQUENCE.includes(src.width) ? src.width : (DEFAULT_PANEL_WIDTHS[id] || "half")
    };
  }
  return { order, panels };
}

export function loadSheetLayout(availableIds = DEFAULT_PANEL_ORDER) {
  try {
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const layout=normalizeSheetLayout(raw, availableIds);
    // Creation Status is conditional. The first time it appears in a saved layout, put it
    // above all movable panels so an unresolved character issue cannot spawn out of sight.
    // Once present in the saved order, normal drag/reorder behavior is respected.
    if(availableIds.includes("creation-status") && !raw?.order?.includes?.("creation-status")){
      layout.order=layout.order.filter(id=>id!=="creation-status");
      layout.order.unshift("creation-status");
    }
    return layout;
  } catch {
    const layout=normalizeSheetLayout(null, availableIds);
    if(availableIds.includes("creation-status")){layout.order=layout.order.filter(id=>id!=="creation-status");layout.order.unshift("creation-status");}
    return layout;
  }
}

export function saveSheetLayout(layout) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch {}
}

export function resetSheetLayout() {
  // Reset only the active layout. Saved presets deliberately remain available.
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function layoutPresetKey(slot) {
  return `${PRESET_PREFIX}${slot}`;
}

export function hasLayoutPreset(slot) {
  try { return !!localStorage.getItem(layoutPresetKey(slot)); } catch { return false; }
}

export function saveLayoutPreset(slot, sheet = null) {
  const availableIds = sheet
    ? [...sheet.querySelectorAll(":scope > .panel[data-panel-id]")].map(p => p.dataset.panelId)
    : DEFAULT_PANEL_ORDER;
  const snapshot = sheet ? captureSheetLayout(sheet, availableIds) : loadSheetLayout(availableIds);
  try {
    localStorage.setItem(layoutPresetKey(slot), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function loadLayoutPreset(slot, availableIds = DEFAULT_PANEL_ORDER) {
  try {
    const raw = localStorage.getItem(layoutPresetKey(slot));
    if (!raw) return false;
    saveSheetLayout(normalizeSheetLayout(JSON.parse(raw), availableIds));
    return true;
  } catch {
    return false;
  }
}

export function captureSheetLayout(sheet, availableIds = DEFAULT_PANEL_ORDER) {
  const live = loadSheetLayout(availableIds);
  live.order = [...sheet.querySelectorAll(":scope > .panel[data-panel-id]")].map(p => p.dataset.panelId);
  for (const panel of sheet.querySelectorAll(":scope > .panel[data-panel-id]")) {
    const id = panel.dataset.panelId;
    if (!live.panels[id]) continue;
    live.panels[id].collapsed = panel.classList.contains("is-collapsed");
    if (!live.panels[id].collapsed && panel.dataset.userResized === "1") {
      live.panels[id].height = Math.max(110, Math.round(panel.getBoundingClientRect().height));
    }
  }
  saveSheetLayout(live);
  return live;
}

function panelTitle(panel) {
  return PANEL_TITLES[panel.dataset.panelId] || panel.querySelector(":scope > h2")?.textContent?.trim() || "Section";
}

export function enhanceSheetLayout(sheet) {
  if (!sheet) return;
  const panels = [...sheet.querySelectorAll(":scope > .panel[data-panel-id]")];
  if (!panels.length) return;
  const availableIds = panels.map(p => p.dataset.panelId);
  const layout = loadSheetLayout(availableIds);
  const byId = new Map(panels.map(p => [p.dataset.panelId, p]));

  for (const id of layout.order) {
    const panel = byId.get(id);
    if (panel) sheet.appendChild(panel);
  }

  let dragged = null;
  let gapDropAfter = null;
  const dropPreview = document.createElement("div");
  dropPreview.className = "layout-drop-preview";
  dropPreview.hidden = true;
  sheet.appendChild(dropPreview);

  // The sheet itself is a drop target for the otherwise-empty area beneath a
  // shorter neighboring panel. This is the key difference from the old flat
  // sortable list: dropping into that physical gap inserts after the panel
  // above it instead of swapping with that panel.
  sheet.addEventListener("dragover", e => {
    if (!dragged || e.target.closest?.(".layout-panel")) return;
    e.preventDefault();
    const panelsNow = [...sheet.querySelectorAll(":scope > .layout-panel[data-panel-id]")].filter(p => p !== dragged);
    const underX = panelsNow.filter(p => { const r=p.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && r.bottom <= e.clientY + 3; });
    gapDropAfter = underX.sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0] || null;
    const sheetRect=sheet.getBoundingClientRect();
    const dragRect=dragged.getBoundingClientRect();
    const anchorRect=gapDropAfter?.getBoundingClientRect();
    const left = anchorRect ? anchorRect.left-sheetRect.left : Math.max(0,e.clientX-sheetRect.left-dragRect.width/2);
    const top = anchorRect ? anchorRect.bottom-sheetRect.top+14 : Math.max(0,e.clientY-sheetRect.top);
    dropPreview.style.left=`${left}px`; dropPreview.style.top=`${top}px`;
    dropPreview.style.width=`${dragRect.width}px`; dropPreview.style.height=`${Math.min(Math.max(dragRect.height,42),180)}px`;
    dropPreview.hidden=false;
    if(e.dataTransfer)e.dataTransfer.dropEffect="move";
  });
  sheet.addEventListener("dragleave", e => { if(!sheet.contains(e.relatedTarget)){dropPreview.hidden=true;gapDropAfter=null;} });
  sheet.addEventListener("drop", e => {
    if (!dragged || e.target.closest?.(".layout-panel")) return;
    e.preventDefault();
    if (gapDropAfter) gapDropAfter.after(dragged); else sheet.insertBefore(dragged, dropPreview);
    dropPreview.hidden=true; gapDropAfter=null;
    persistOrder(sheet, availableIds); scheduleGridRefresh(sheet);
  });

  let resizeTimer = null;
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(entries => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const live = loadSheetLayout(availableIds);
      for (const entry of entries) {
        const panel = entry.target;
        if (panel.classList.contains("is-collapsed")) continue;
        const id = panel.dataset.panelId;
        if (panel.dataset.userResized === "1") live.panels[id].height = Math.round(panel.getBoundingClientRect().height);
      }
      saveSheetLayout(live);
      refreshGridSpans(sheet);
    }, 120);
  }) : null;

  for (const panel of [...sheet.querySelectorAll(":scope > .panel[data-panel-id]")]) {
    const id = panel.dataset.panelId;
    const state = layout.panels[id] || { collapsed:false, height:null };
    panel.classList.add("layout-panel");

    const originalChildren = [...panel.childNodes];
    const header = document.createElement("div");
    header.className = "panel-layout-header";
    header.innerHTML = `<button type="button" class="panel-drag-handle" draggable="true" title="Drag to move this section" aria-label="Drag ${panelTitle(panel)}">⠿</button><strong class="panel-layout-title"></strong><span class="panel-layout-hint">drag · resize</span><button type="button" class="panel-theme-button" title="Set a custom color for this section" aria-label="Set color of ${panelTitle(panel)}">🎨</button><div class="panel-width-buttons" role="group" aria-label="Width of ${panelTitle(panel)}"><button type="button" data-panel-width="quarter" title="Quarter width">1/4</button><button type="button" data-panel-width="third" title="Third width">1/3</button><button type="button" data-panel-width="half" title="Half width">1/2</button><button type="button" data-panel-width="full" title="Full width">1/1</button></div><button type="button" class="panel-collapse" title="Collapse or expand this section" aria-label="Collapse or expand ${panelTitle(panel)}">⌃</button>`;
    header.querySelector(".panel-layout-title").textContent = panelTitle(panel);
    const body = document.createElement("div");
    body.className = "panel-layout-body";
    originalChildren.forEach(n => body.appendChild(n));
    panel.append(header, body);

    if (state.height) {
      panel.style.height = `${state.height}px`;
      panel.dataset.userResized = "1";
    }
    panel.classList.toggle("is-collapsed", state.collapsed);
    applyPanelWidth(panel, state.width);
    updateWidthButtons(header.querySelector(".panel-width-buttons"), state.width);
    header.querySelector(".panel-collapse").textContent = state.collapsed ? "⌄" : "⌃";

    header.querySelector(".panel-collapse").addEventListener("click", () => {
      const live = loadSheetLayout(availableIds);
      const next = !panel.classList.contains("is-collapsed");
      live.panels[id].collapsed = next;
      if (!next && live.panels[id].height) panel.style.height = `${live.panels[id].height}px`;
      saveSheetLayout(live);
      panel.classList.toggle("is-collapsed", next);
      header.querySelector(".panel-collapse").textContent = next ? "⌄" : "⌃";
      scheduleGridRefresh(sheet);
    });

    header.querySelector(".panel-theme-button").addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("mpmb-panel-theme", { detail:{ panelId:id, title:panelTitle(panel) } }));
    });

    header.querySelectorAll(".panel-width-buttons [data-panel-width]").forEach(button => {
      button.addEventListener("click", () => {
        const next = button.dataset.panelWidth;
        if (!WIDTH_SEQUENCE.includes(next)) return;
        const live = loadSheetLayout(availableIds);
        live.panels[id].width = next;
        saveSheetLayout(live);
        applyPanelWidth(panel, next);
        updateWidthButtons(header.querySelector(".panel-width-buttons"), next);
      });
    });

    const handle = header.querySelector(".panel-drag-handle");
    handle.addEventListener("dragstart", e => {
      dragged = panel;
      panel.classList.add("is-dragging");
      sheet.classList.add("is-layout-dragging");
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }
    });
    handle.addEventListener("dragend", () => {
      panel.classList.remove("is-dragging");
      [...sheet.children].forEach(x => x.classList?.remove("drag-target-before", "drag-target-after"));
      sheet.classList.remove("is-layout-dragging");
      dropPreview.hidden = true; gapDropAfter = null;
      dragged = null;
      persistOrder(sheet, availableIds);
      scheduleGridRefresh(sheet);
    });
    panel.addEventListener("dragover", e => {
      if (!dragged || dragged === panel) return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      panel.classList.toggle("drag-target-before", !after);
      panel.classList.toggle("drag-target-after", after);
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
    panel.addEventListener("dragleave", () => panel.classList.remove("drag-target-before", "drag-target-after"));
    panel.addEventListener("drop", e => {
      if (!dragged || dragged === panel) return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      if (after) panel.after(dragged); else panel.before(dragged);
      panel.classList.remove("drag-target-before", "drag-target-after");
      persistOrder(sheet, availableIds);
      scheduleGridRefresh(sheet);
    });

    panel.addEventListener("pointerdown", e => {
      if (panel.classList.contains("is-collapsed")) return;
      const r = panel.getBoundingClientRect();
      if (e.clientY >= r.bottom - 18) panel.dataset.userResized = "1";
    });
    observer?.observe(panel);
  }

  // CSS Grid uses twelve invisible columns. A very small implicit row lets panels
  // of different heights pack vertically (masonry-style) while retaining native
  // browser drag/drop and normal document flow on narrow screens.
  refreshGridSpans(sheet);
}

function applyPanelWidth(panel, width) {
  const normalized = WIDTH_SEQUENCE.includes(width) ? width : "half";
  for (const value of WIDTH_SEQUENCE) panel.classList.toggle(`panel-width-${value}`, value === normalized);
  panel.dataset.panelWidth = normalized;
  panel.style.setProperty("--panel-column-span", String(WIDTH_COLUMNS[normalized]));
  scheduleGridRefresh(panel.parentElement);
}

function updateWidthButtons(group, width) {
  if (!group) return;
  const normalized = WIDTH_SEQUENCE.includes(width) ? width : "half";
  const names = { quarter:"quarter", third:"third", half:"half", full:"full" };
  group.querySelectorAll("[data-panel-width]").forEach(button => {
    const selected = button.dataset.panelWidth === normalized;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.setAttribute("aria-label", `Set section to ${names[button.dataset.panelWidth]} width${selected ? " (current)" : ""}`);
  });
}


let gridRefreshFrame = 0;
function scheduleGridRefresh(sheet) {
  if (!sheet?.classList?.contains("sheet")) return;
  cancelAnimationFrame(gridRefreshFrame);
  gridRefreshFrame = requestAnimationFrame(() => refreshGridSpans(sheet));
}

function refreshGridSpans(sheet) {
  if (!sheet) return;
  const narrow = window.matchMedia?.("(max-width: 860px)")?.matches;
  for (const panel of sheet.querySelectorAll(":scope > .layout-panel[data-panel-id]")) {
    if (narrow) {
      panel.style.removeProperty("grid-row-end");
      continue;
    }
    const height = Math.max(panel.getBoundingClientRect().height, panel.classList.contains("is-collapsed") ? 39 : 110);
    // Include the desired visual gap in the occupied grid rows. The panel itself
    // stays at its natural/user-resized height; the extra rows are empty space.
    const rows = Math.max(1, Math.ceil((height + GRID_VERTICAL_GAP_PX) / GRID_ROW_PX));
    panel.style.gridRowEnd = `span ${rows}`;
  }
}

function persistOrder(sheet, availableIds) {
  const live = loadSheetLayout(availableIds);
  live.order = [...sheet.querySelectorAll(":scope > .panel[data-panel-id]")].map(p => p.dataset.panelId);
  saveSheetLayout(live);
}

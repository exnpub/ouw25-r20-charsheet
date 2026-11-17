const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const dist = path.join(__dirname, "..", "dist");

test("build contains one inline Sheet Worker and no unresolved source marker", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  assert.equal((html.match(/<script type="text\/worker">/g) || []).length, 1);
  assert.doesNotMatch(html, /SHEET_WORKER/);
  assert.match(html, /on\("clicked:roll_collision"/);
  assert.match(html, /startRoll\(/);
  assert.match(html, /finishRoll\(/);
});

test("build contains the two sheet modes and all character/cooperative blocks", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  for (const mode of ["merchant", "cooperative"]) {
    assert.match(html, new RegExp(`value="${mode}"`));
  }
  assert.match(html, /value="merchant" checked/);
  for (const field of [
    "character_name", "big_dream", "specialty", "past", "character_merit",
    "character_flaw", "hiring_history", "pocket_money", "wound_4",
    "pension_balance", "personal_items", "cooperative_budget",
    "cooperative_reputation", "shared_memory", "memory_details",
    "contract_what", "contract_destination", "contract_when", "contract_cost",
    "ship_name", "ship_class", "cargo_load", "forced_mode", "illumination_mode",
    "unrest", "fuel_stock", "provisions_stock", "ship_merit_4", "ship_flaw_4",
    "stanine_8", "compartment_4", "gear_2", "cargo_notes",
  ]) {
    assert.match(html, new RegExp(`name="attr_${field}"`), `missing field ${field}`);
  }
  assert.match(html, /class="repeating_contracts"/);
  assert.match(html, /class="sheet-contract-header" role="row"/);
  assert.match(html, /class="sheet-contract-row" role="row"/);
  for (const heading of ["Что", "Куда", "Когда", "Стоимость"]) {
    assert.match(html, new RegExp(`<span role="columnheader">${heading}<\\/span>`));
  }
  assert.match(html, /name="attr_cooperative_tab" value="attributes" checked/);
  assert.match(html, /name="attr_cooperative_tab" value="contracts"/);
  assert.match(html, /name="attr_cooperative_tab" value="ship"/);
  assert.match(html, /class="sheet-cooperative-tab-panel sheet-cooperative-attributes"/);
  assert.match(html, /class="sheet-cooperative-tab-panel sheet-cooperative-contracts"/);
  assert.match(html, /class="sheet-cooperative-tab-panel sheet-cooperative-ship"/);
  assert.match(html, /class="sheet-ship-quality-columns"/);
  assert.match(html, /aria-label="Достоинство 1"/);
  assert.match(html, /aria-label="Недостаток 1"/);
  assert.doesNotMatch(html, /Достоинство судна [1-4]|Недостаток судна [1-4]/);
  assert.match(html, /class="sheet-field-inline sheet-wide-input">Оперативный бюджет/);
  assert.match(html, /class="sheet-panel sheet-panel-personal sheet-collision-panel"/);
  assert.doesNotMatch(html, /<div class="sheet-stat"><span>Прочность<\/span>/);
  assert.doesNotMatch(html, /Планирование рейса|Журнал кооператива/);
});

test("cooperative attributes stack budget, reputation and memories beside notes", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  const attributes = html.split('class="sheet-cooperative-tab-panel sheet-cooperative-attributes"')[1]
    .split('class="sheet-cooperative-tab-panel sheet-cooperative-contacts"')[0];
  assert.match(attributes, /class="sheet-cooperative-attributes-layout"/);
  assert.match(attributes, /<label class="bordered-sector sheet-cooperative-budget">\s*<span class="sheet-budget-title">БЮДЖЕТ<\/span>\s*<span class="sheet-budget-value"><input type="number" name="attr_cooperative_budget"/);
  assert.match(attributes, /class="sheet-cooperative-cards">[\s\S]*name="attr_cooperative_reputation"[\s\S]*name="attr_shared_memory"/);
  assert.match(css, /\.sheet-cooperative-attributes-layout\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(attributes, /class="sheet-cooperative-budget-column">[\s\S]*name="attr_cooperative_budget"[\s\S]*class="sheet-cooperative-cards">[\s\S]*name="attr_shared_memory"[\s\S]*class="sheet-cooperative-notes-column">[\s\S]*name="attr_memory_details"/);
  assert.match(css, /\.sheet-cooperative-budget\s*\{[^}]*flex-direction:\s*row;/s);
  assert.match(css, /\.sheet-cooperative-notes-column textarea\s*\{[^}]*height:\s*300px;[^}]*width:\s*100%;/s);
  assert.match(css, /\.sheet-cooperative-cards\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
});

test("cooperative contacts tab precedes contracts and has four repeating columns", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  const tabs = html.match(/<div class="sheet-mode-switch sheet-cooperative-tabs"[\s\S]*?<\/div>/)?.[0];
  assert.ok(tabs);
  assert.deepEqual(
    [...tabs.matchAll(/name="attr_cooperative_tab" value="([^"]+)"/g)].map(([, value]) => value),
    ["attributes", "contacts", "contracts", "ship", "cargo"],
  );
  assert.match(html, /class="sheet-cooperative-tab-panel sheet-cooperative-contacts"/);
  assert.match(css, /value="contacts"\]:checked\) \.sheet-cooperative-contacts/);
  assert.match(html, /class="sheet-contact-table" role="table" aria-label="Контакты"/);
  assert.match(html, /class="repeating_contacts"/);
  for (const [field, label] of [
    ["contact_who", "Кто"],
    ["contact_where", "Где"],
    ["contact_relation", "Отношение"],
    ["contact_debt", "Долг"],
  ]) {
    assert.match(html, new RegExp(`name="attr_${field}"[^>]*aria-label="${label}"`));
    assert.match(html, new RegExp(`<span role="columnheader">${label}<\\/span>`));
  }
  assert.match(css, /\.sheet-cooperative-contacts \.sheet-contact-row[^{}]*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)/s);
});

test("cargo tab provides three repeating columns and a ship occupancy warning state", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  assert.match(html, /class="sheet-cooperative-tab-panel sheet-cooperative-cargo"/);
  assert.match(html, /class="repeating_cargo" role="rowgroup"/);
  for (const [field, type, label] of [
    ["name", "text", "Наименование"], ["quantity", "number", "Количество"],
    ["volume", "number", "Объём, ст."],
  ]) {
    assert.match(html, new RegExp(`type="${type}" name="attr_cargo_item_${field}"[^>]*aria-label="${label}"`));
    assert.ok(html.includes(`<span role="columnheader">${label}</span>`));
  }
  assert.match(html, /name="attr_cargo_near_full"/);
  assert.match(css, /value="cargo"\]:checked\) \.sheet-cooperative-cargo/);
  assert.match(css, /\.sheet-cooperative-cargo \.sheet-cargo-row\s*\{[^}]*grid-template-columns:\s*repeat\(3/s);
});

test("build contains the CSS brand placeholder and guarded pension deposit controls", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  assert.match(html, /class="sheet-brand-banner"/);
  assert.match(html, /name="attr_pension_balance"[^>]*readonly/);
  assert.match(html, /name="act_pension_deposit"/);
  assert.match(html, /clicked:pension_deposit/);
  assert.match(css, /\.sheet-brand-banner\s*\{[^}]*background:\s*#8a2be2/s);
  assert.equal((css.match(/https:\/\/i\.imgur\.com\/Z28BrcA\.jpeg/g) || []).length, 1);
  assert.match(css, /\.sheet-app\s*\{[^}]*background-image:\s*url\("https:\/\/i\.imgur\.com\/Z28BrcA\.jpeg"\)/s);
  assert.match(css, /\.charsheet \.sheet-app h2,[\s\S]*font-weight:\s*400 !important/);
  assert.match(css, /\.sheet-panel h2\s*\{[^}]*margin-bottom:\s*1em/s);
  assert.match(css, /\.sheet-inline-fields\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(css, /\.sheet-inline-fields\s*\{[^}]*column-gap:\s*1\.2rem/s);
  assert.match(css, /\.sheet-cooperative-attributes-layout\s*\{[^}]*column-gap:\s*1\.2rem/s);
  assert.match(css, /\.sheet-cooperative-contracts \.sheet-inline-fields\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.repeating_contracts \.repitem \+ \.repitem\s*\{[^}]*margin-top:\s*0\.75rem/s);
  assert.match(css, /\.sheet-cooperative-tab-panel\s*\{[^}]*min-height:\s*200px/s);
  assert.match(css, /\.sheet-app textarea\s*\{[^}]*height:\s*60px/s);
  assert.match(css, /\.sheet-app textarea\s*\{[^}]*margin:\s*0\.5rem/s);
  assert.match(css, /\.sheet-cooperative-tabs > \.sheet-mode-option\s*\{[^}]*width:\s*fit-content !important/s);
  assert.match(css, /\.sheet-ship-stats\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-template-columns:\s*repeat\(5/s);
  assert.match(css, /\.sheet-ship-resources\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-template-columns:\s*repeat\(4/s);
  assert.match(css, /\.sheet-ship-resources\s*\{[^}]*column-gap:\s*15px/s);
  assert.match(css, /\.sheet-ship-quality-columns\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(css, /\.sheet-ship-quality-list\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /\.sheet-stat-value\s*\{[^}]*font-size:\s*1\.725rem/s);
  assert.match(css, /\.sheet-stat .sheet-stat-label\s*\{[^}]*font-size:\s*0\.85rem/s);
  assert.match(css, /\.sheet-hold-bonus\s*\{[^}]*display:\s*none;[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(css, /\.sheet-tooltip-toggle:has\(input:not\(:checked\)\):hover::after/);
  const borderColors = [...css.matchAll(/border:\s*[^;#]*#([0-9a-f]{6})/gi)]
    .map((match) => match[1].toLowerCase());
  assert.ok(borderColors.length > 0);
  assert.deepEqual(new Set(borderColors), new Set(["9a806a"]));
  assert.doesNotMatch(html, /<svg/i);
});

test("ship damage checklist has a visible title and base checkboxes", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  assert.match(html, /class="sheet-wounds sheet-ship-damage">\s*<span class="sheet-checklist-title">Поломы<\/span>/i);
  for (const index of [1, 2, 3]) {
    assert.match(html, new RegExp(`name="attr_ship_damage_${index}"`));
  }
  assert.match(css, /\.charsheet \.sheet-app \.sheet-ship-damage\s*\{[^}]*display:\s*flex !important/s);
  assert.match(css, /\.charsheet \.sheet-app \.sheet-ship-damage \.sheet-damage-1,[\s\S]*?\.sheet-damage-3\s*\{[^}]*display:\s*inline-flex !important/s);
  assert.match(css, /\.charsheet \.sheet-ship-damage label\[class\^="sheet-damage-"\] input\[type="checkbox"\]\s*\{[^}]*height:\s*24px;[^}]*opacity:\s*0;[^}]*width:\s*24px/s);
  assert.match(html, /attr_ship_damage_1" value="1"><span class="sheet-damage-box"><\/span><span class="sheet-damage-icon sheet-damage-blast">💥<\/span><span class="sheet-damage-icon sheet-damage-skull">💀<\/span>/);
  assert.match(css, /\.charsheet \.sheet-ship-damage label\[class\^="sheet-damage-"\] > \.sheet-damage-box\s*\{[^}]*display:\s*flex !important;[^}]*height:\s*24px;[^}]*width:\s*24px/s);
  assert.match(css, /\.charsheet \.sheet-ship-damage input\[type="checkbox"\]:checked \+ \.sheet-damage-box \+ \.sheet-damage-blast\s*\{[^}]*display:\s*flex !important/s);
  assert.match(css, /option\[value="0"\]:checked\)[\s\S]*?\.sheet-damage-3 input\[type="checkbox"\]:checked \+ \.sheet-damage-box \+ \.sheet-damage-blast \+ \.sheet-damage-skull/);
  assert.match(css, /option\[value="6"\]:checked\) \.sheet-damage-11 input\[type="checkbox"\]:checked \+ \.sheet-damage-box \+ \.sheet-damage-blast \+ \.sheet-damage-skull/);
  assert.match(css, /\.charsheet \.sheet-ship-damage \.sheet-checklist-title\s*\{[^}]*font-size:\s*1\.5em/s);
});

test("ship stats expose every changing value as a direct Roll20 display span", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  for (const attribute of [
    "ship_speed", "ship_fuel_rate", "ship_provision_rate", "stanine_count",
    "cargo_occupied", "cargo_capacity",
  ]) {
    assert.match(html, new RegExp(`<span class="sheet-stat-value" name="attr_${attribute}">`));
  }
  assert.doesNotMatch(html, /<strong[^>]*name="attr_(?:ship_speed|ship_fuel_rate|ship_provision_rate|stanine_count|cargo_occupied|cargo_capacity)"/);
  assert.match(html, /class="sheet-field-status sheet-ship-status"><span name="attr_ship_status"><\/span>/);
  assert.match(css, /\.sheet-stat-value\s*\{[^}]*display:\s*block;[^}]*font-size:\s*1\.725rem/s);
  assert.match(css, /\.sheet-stat-cargo \.sheet-stat-value\s*\{[^}]*display:\s*inline/s);
});

test("build wires derived ship values, responsive equipment slots, and force roll queries", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  assert.match(html, /name="attr_cargo_progress"/);
  assert.match(html, /name="attr_crew_progress"/);
  assert.match(html, /name="attr_unrest_progress"/);
  assert.match(html, /name="attr_cargo_meter_label"/);
  assert.match(html, /name="attr_crew_meter_label"/);
  assert.match(html, /name="attr_unrest_meter_label"/);
  assert.match(html, /4\+\?\{Дополнительные d6\|0\}/);
  assert.match(html, /\?\{Осложнения\|0\}/);
  assert.doesNotMatch(html, /Кости проверки механика/);
  assert.match(html, /name="attr_ship_damage_9"/);
  assert.match(css, /sheet-stanine-8/);
  assert.match(css, /sheet-damage-9/);
});

test("travel panel exposes mode buttons, status, and active-state colors", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  const panel = html.match(/<div class="bordered-sector sheet-travel-panel">([\s\S]*?)<\/div>/)?.[1];

  assert.ok(panel);
  assert.match(panel, /<h3>В пути<\/h3>/);
  assert.match(panel, /name="attr_forced_mode"/);
  assert.match(panel, /name="act_toggle_forced_mode"[^>]*>Форсаж!<span/);
  assert.match(panel, /name="attr_illumination_mode"/);
  assert.match(panel, /name="act_toggle_illumination_mode"[^>]*>Иллюминация<span/);
  for (const action of ["toggle_forced_mode", "toggle_illumination_mode", "travel_sector",
    "undo_sector", "reset_sectors", "psychotherapy", "increase_unrest"]) {
    assert.match(panel, new RegExp(`name="act_${action}">[^<]+<span class="sheet-control-tooltip" role="tooltip">[^<]+</span></button>`));
    assert.match(html, new RegExp(`clicked:${action}`));
  }
  assert.match(panel, /name="act_undo_sector"[\s\S]*?<\/button>\s*<button[^>]*name="act_reset_sectors"/);
  assert.match(html, /name="attr_travel_status"/);
  assert.match(css, /\.sheet-travel-controls:has\(input\[name="attr_forced_mode"\]:checked\)[\s\S]*?background:\s*#b3261e/s);
  assert.match(css, /\.sheet-travel-controls:has\(input\[name="attr_illumination_mode"\]:checked\)[\s\S]*?background:\s*#536b37/s);
  assert.match(html, /clicked:toggle_forced_mode/);
  assert.match(html, /clicked:toggle_illumination_mode/);
});

test("ship and travel tooltips have explicit content and are not clipped by the ship heading", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  assert.match(html, /class="sheet-ship-name"[^>]*>[\s\S]*?<span class="sheet-control-tooltip" role="tooltip">Название вашего кораблика<\/span><\/label>/);
  assert.match(css, /\.charsheet \.sheet-ship-heading\s*\{[^}]*overflow:\s*visible/s);
  assert.match(css, /button:hover > \.sheet-control-tooltip/);
  assert.match(css, /button:focus-visible > \.sheet-control-tooltip/);
  assert.match(css, /\.sheet-ship-name:focus-within > \.sheet-control-tooltip/);
});

test("sector reset has a hidden confirmation row with confirm and cancel actions", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  assert.match(html, /name="attr_reset_sectors_pending" value="1"/);
  for (const action of ["confirm_reset_sectors", "cancel_reset_sectors"]) {
    assert.match(html, new RegExp(`name="act_${action}"`));
    assert.match(html, new RegExp(`clicked:${action}`));
  }
  assert.match(css, /\.sheet-reset-sectors-confirmation\s*\{[^}]*display:\s*none/s);
  assert.match(css, /input\[name="attr_reset_sectors_pending"\]:checked \+ \.sheet-reset-sectors-confirmation\s*\{[^}]*display:\s*flex/s);
});

test("travel exposes a disabled fallback button, shortage warning and empty-stock states", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  assert.match(html, /name="act_travel_sector_blocked" disabled/);
  assert.match(html, /class="sheet-travel-warning" role="alert"><span name="attr_travel_warning"/);
  for (const state of ["travel_blocked", "fuel_empty", "provisions_empty", "fuel_low"]) {
    assert.match(html, new RegExp(`type="checkbox" name="attr_${state}"`));
  }
  assert.match(html, /class="sheet-fuel-warning" role="status"><span name="attr_fuel_warning"/);
});

test("unrest has a rounded editable display and separate exact storage", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  assert.match(html, /type="number" name="attr_unrest_display" min="0" max="25" step="1"[^>]*>\s*<span>из 25<\/span>/);
  assert.match(html, /type="hidden" name="attr_unrest" value="0"/);
});

test("psychotherapy chat shows computed relief rather than the unmodified d6", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const template = html.match(/<rolltemplate class="sheet-rolltemplate-ouw25therapy">([\s\S]*?)<\/rolltemplate>/)?.[1];
  assert.ok(template);
  assert.match(template, /\{\{computed::relief\}\}/);
  assert.doesNotMatch(template, /\{\{relief\}\}/);
});

test("build places ship equipment in left and right columns without visible numbered labels", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  assert.match(html, /class="sheet-ship-equipment-columns"/);
  assert.match(html, /class="sheet-ship-equipment-left"/);
  assert.match(html, /aria-label="Станина 1"/);
  assert.match(html, /aria-label="Отсек 1"/);
  assert.match(html, /aria-label="Обвес 1"/);
  assert.doesNotMatch(html, /<label[^>]*>Станина [1-8]|<label[^>]*>Отсек [1-4]|<label[^>]*>Обвес [1-2]/);
  assert.match(css, /\.sheet-ship-equipment-columns\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(css, /\.sheet-ship-equipment-list\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
});

test("ship identity row uses ordinal class labels without changing numeric values", () => {
  const html = readFileSync(path.join(dist, "ouw25.html"), "utf8");
  const css = readFileSync(path.join(dist, "ouw25.css"), "utf8");
  const heading = html.match(/<div class="sheet-ship-heading">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(heading);
  assert.match(heading, /<label class="sheet-ship-name" data-tooltip="Название вашего кораблика">HMS[\s\S]*name="attr_ship_name" title="Название вашего кораблика"/);
  assert.match(heading, /<\/label>\s*<select class="sheet-ship-class-select" name="attr_ship_class"[\s\S]*<\/select>\s*$/);
  assert.doesNotMatch(heading, /sheet-ship-class-caption/);

  const classSelect = heading.match(/<select class="sheet-ship-class-select" name="attr_ship_class"[\s\S]*?<\/select>/)?.[0];
  assert.ok(classSelect);
  assert.deepEqual(
    [...classSelect.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)]
      .map(([, value, label]) => [value, label]),
    [
      ["0", "нулевого класса"],
      ["1", "первого класса"],
      ["2", "второго класса"],
      ["3", "третьего класса"],
      ["4", "четвёртого класса"],
      ["5", "пятого класса"],
      ["6", "шестого класса"],
    ],
  );
  assert.match(css, /\.charsheet \.sheet-app input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="hidden"\]\),[\s\S]*?\.charsheet \.sheet-app select\s*\{[^}]*height:\s*28px/s);
  assert.match(css, /\.charsheet \.sheet-ship-heading\s*\{[^}]*align-items:\s*center;[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(min-content, max-content\) auto max-content max-content;[^}]*overflow:\s*visible/s);
  assert.match(css, /\.charsheet \.sheet-ship-name input\s*\{[^}]*width:\s*30ch/s);
  assert.match(css, /\.charsheet \.sheet-ship-name input\s*\{[^}]*line-height:\s*18px/s);
  assert.match(css, /\.charsheet \.sheet-ship-name input,[\s\S]*?\.charsheet \.sheet-ship-class-select\s*\{[^}]*padding:\s*4px/s);
  assert.match(css, /\.charsheet \.sheet-ship-class-select\s*\{[^}]*appearance:\s*none;[^}]*box-sizing:\s*border-box;[^}]*height:\s*28px;[^}]*line-height:\s*18px;[^}]*transform:\s*translateY\(-1px\);[^}]*width:\s*calc\(16ch \+ 24px \+ 2px\)/s);
  assert.match(html, /class="sheet-ship-name" data-tooltip="Название вашего кораблика"/);
  assert.match(css, /\.charsheet \.sheet-ship-name:hover > \.sheet-control-tooltip/);
});

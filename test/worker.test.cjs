const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const root = path.join(__dirname, "..");

function createWorkerHarness(attributes, dice, { applyWrites = false, macroResults = {} } = {}) {
  const handlers = {};
  const writes = [];
  const finishes = [];
  const rolls = [];
  const context = {
    on(events, callback) {
      for (const event of events.split(/\s+/)) {
        handlers[event] ??= [];
        handlers[event].push(callback);
      }
    },
    getAttrs(names, callback) {
      callback(Object.fromEntries(names.map((name) => [name, attributes[name] ?? ""])));
    },
    setAttrs(values, options, callback) {
      writes.push(values);
      if (applyWrites) {
        Object.assign(attributes, values);
      }
      const onComplete = typeof options === "function" ? options : callback;
      if (onComplete) {
        onComplete();
      }
    },
    startRoll(expression, callback) {
      rolls.push(expression);
      if (expression.includes("&{template:default}") || expression.includes("&{template:ouw25therapy}")) {
        callback({
          rollId: "test-macro",
          results: macroResults,
        });
        return;
      }
      callback({
        rollId: "test-roll",
        results: { pool: { dice } },
      });
    },
    finishRoll(rollId, values) {
      finishes.push({ rollId, values });
    },
  };

  vm.createContext(context);
  vm.runInContext(
    `${readFileSync(path.join(root, "src/rules.js"), "utf8")}\n${readFileSync(path.join(root, "src/worker.js"), "utf8")}`,
    context
  );
  return {
    trigger(event, ...args) {
      (handlers[event] || []).forEach((callback) => callback(...args));
    },
    attributes,
    writes,
    finishes,
    rolls,
  };
}

test("Roll20 worker passes validated dice through startRoll and finishRoll", () => {
  const harness = createWorkerHarness(
    { ce_dice_count: "4", ce_pre_deduction: "1" },
    [6, 6, 6, 2]
  );

  harness.trigger("clicked:roll_collision");

  assert.match(harness.rolls[0], /\{\{pool=\[\[4d6\]\]\}\}/);
  assert.match(harness.rolls[0], /\{\{pre_deduction=1\}\}/);
  assert.equal(harness.finishes[0].rollId, "test-roll");
  assert.equal(harness.finishes[0].values.pool, 2);
  assert.equal(harness.writes[0].ce_raw_sixes, "3");
  assert.equal(harness.writes[0].ce_status, "Это успех!");
});

test("Roll20 worker surfaces invalid Collision Engine input without rolling", () => {
  const harness = createWorkerHarness(
    { ce_dice_count: "3", ce_pre_deduction: "0" },
    [6, 6, 6, 2]
  );

  harness.trigger("clicked:roll_collision");

  assert.equal(harness.rolls.length, 0);
  assert.match(harness.writes[0].ce_status, /Количество костей/);
});

test("pension worker applies a validated deposit and clears the deposit field", () => {
  const harness = createWorkerHarness(
    { pension_balance: "15", pension_deposit: "5" },
    []
  );

  harness.trigger("clicked:pension_deposit");

  assert.equal(harness.writes[0].pension_balance, "20");
  assert.equal(harness.writes[0].pension_deposit, "");
  assert.equal(harness.writes[0].pension_status, "Счёт пополнен.");
});

test("pension worker preserves the balance when the deposit is invalid", () => {
  const harness = createWorkerHarness(
    { pension_balance: "15", pension_deposit: "-5" },
    []
  );

  harness.trigger("clicked:pension_deposit");

  assert.equal(Object.hasOwn(harness.writes[0], "pension_balance"), false);
  assert.match(harness.writes[0].pension_status, /Сумма пополнения/);
});

test("sheet open populates the chosen card and ship-derived values", () => {
  const harness = createWorkerHarness({
    sheet_mode: "cooperative",
    specialty: "mechanic",
    past: "hard_worker",
    ship_class: "0",
    crew_count: "10",
    forced_mode: "0",
    illumination_mode: "0",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
    character_merit: "strong",
    cooperative_reputation: "hunters",
    shared_memory: "rescue",
    ship_merit_1: "strong_hull",
    compartment_1: "passenger",
  }, []);

  harness.trigger("sheet:opened");

  const personal = harness.writes.find((write) => write.specialty_description);
  const ship = harness.writes.find((write) => write.ship_speed);
  assert.match(personal.specialty_description, /двигателях/);
  assert.match(personal.past_description, /четвёртая рана/);
  assert.match(personal.reputation_description, /поиске/);
  assert.match(personal.shared_memory_description, /спасли/);
  assert.equal(ship.ship_speed, "1");
  assert.equal(ship.ship_fuel_rate, "1");
  assert.equal(ship.ship_provision_rate, "1");
  assert.equal(ship.stanine_count, "2");
  assert.equal(ship.ship_durability_max, "5");
  assert.equal(ship.cargo_occupied, "420");
  assert.equal(ship.cargo_capacity, "1600");
});

test("changing ship class refreshes all class-based resource stats", () => {
  const classes = [
    { fuel: "1", provisions: "1", stanines: "2", hold: "1600", crew: "10" },
    { fuel: "2", provisions: "1", stanines: "3", hold: "3200", crew: "15" },
    { fuel: "2", provisions: "2", stanines: "4", hold: "6400", crew: "20" },
    { fuel: "4", provisions: "2", stanines: "5", hold: "12800", crew: "25" },
    { fuel: "4", provisions: "3", stanines: "6", hold: "25200", crew: "30" },
    { fuel: "8", provisions: "3", stanines: "7", hold: "50400", crew: "35" },
    { fuel: "10", provisions: "5", stanines: "8", hold: "100000", crew: "50" },
  ];
  const harness = createWorkerHarness({
    ship_class: "0",
    crew_count: "10",
    forced_mode: "0",
    illumination_mode: "0",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
  }, []);

  classes.forEach((expected, classIndex) => {
    harness.attributes.ship_class = String(classIndex);
    harness.attributes.crew_count = expected.crew;
    harness.trigger("change:ship_class");

    const ship = harness.writes.at(-1);
    assert.equal(ship.ship_fuel_rate, expected.fuel);
    assert.equal(ship.ship_provision_rate, expected.provisions);
    assert.equal(ship.stanine_count, expected.stanines);
    assert.equal(ship.cargo_capacity, expected.hold);
  });
});

test("lower ship classes calculate stats with an over-capacity crew and warn", () => {
  const harness = createWorkerHarness({
    ship_class: "0",
    crew_count: "30",
    forced_mode: "0",
    illumination_mode: "0",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
  }, []);

  const classes = [
    { fuel: "1", provisions: "1", stanines: "2", hold: "1600", crewCapacity: "10" },
    { fuel: "2", provisions: "1", stanines: "3", hold: "3200", crewCapacity: "15" },
    { fuel: "2", provisions: "2", stanines: "4", hold: "6400", crewCapacity: "20" },
    { fuel: "4", provisions: "2", stanines: "5", hold: "12800", crewCapacity: "25" },
  ];
  classes.forEach((expected, classIndex) => {
    harness.attributes.ship_class = String(classIndex);
    harness.trigger("change:ship_class");

    const ship = harness.writes.at(-1);
    assert.equal(ship.ship_fuel_rate, expected.fuel);
    assert.equal(ship.ship_provision_rate, expected.provisions);
    assert.equal(ship.stanine_count, expected.stanines);
    assert.equal(ship.cargo_capacity, expected.hold);
    assert.match(ship.ship_status, new RegExp(`Экипаж \\(30\\) превышает вместимость судна \\(${expected.crewCapacity}\\)`));
  });
});

test("changing cargo load refreshes occupied hold capacity", () => {
  const harness = createWorkerHarness({
    ship_class: "0",
    crew_count: "10",
    forced_mode: "0",
    illumination_mode: "0",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
    compartment_1: "passenger",
  }, []);

  harness.attributes.cargo_load = "125";
  harness.trigger("change:cargo_load");

  const ship = harness.writes.at(-1);
  assert.equal(ship.cargo_occupied, "545");
  assert.equal(ship.cargo_capacity, "1600");
});

test("fuel and provisions counters refresh occupied hold capacity", () => {
  const harness = createWorkerHarness({
    ship_class: "0",
    crew_count: "10",
    forced_mode: "0",
    illumination_mode: "0",
    unrest: "0",
    cargo_load: "100",
    fuel_stock: "25",
    provisions_stock: "18",
    hold_bonus: "0",
  }, []);

  harness.trigger("change:fuel_stock");
  assert.equal(harness.writes.at(-1).cargo_occupied, "126");

  harness.attributes.provisions_stock = "19";
  harness.trigger("change:provisions_stock");
  assert.equal(harness.writes.at(-1).cargo_occupied, "127");

  harness.attributes.fuel_stock = "30";
  harness.trigger("change:fuel_stock");
  assert.equal(harness.writes.at(-1).cargo_occupied, "132");
});

test("pocket money and cooperative budget reject fractions", () => {
  const harness = createWorkerHarness({
    pocket_money: "12.5",
    cooperative_budget: "-3",
  }, []);

  harness.trigger("change:pocket_money");
  harness.trigger("change:cooperative_budget");

  assert.match(harness.writes[0].pocket_money_status, /Карманные деньги/);
  assert.match(harness.writes[1].cooperative_budget_status, /Оперативный бюджет/);
});

test("forced-mode changes finish the standard macro on both transitions", () => {
  const harness = createWorkerHarness(
    {
      ship_class: "0",
      crew_count: "10",
      forced_mode: "1",
      illumination_mode: "0",
      ce_pre_deduction: "0",
      unrest: "0",
      cargo_load: "0",
      hold_bonus: "0",
    },
    [6, 6, 1, 2]
  );

  harness.trigger("change:forced_mode", { newValue: "1", sourceType: "player" });
  harness.trigger("change:forced_mode", { newValue: "0", sourceType: "player" });

  assert.equal(harness.rolls.length, 2);
  for (const roll of harness.rolls) {
    assert.ok(roll.startsWith("&{template:default}"));
    assert.ok(roll.includes("[[ [[ [[4+?{Дополнительные d6|0}]]d6>6 ]] - ?{Осложнения|0} ]]"));
    assert.doesNotMatch(roll, /Кости проверки механика|query=|computed::/);
  }
  assert.equal(harness.finishes.length, 2);
  assert.ok(harness.finishes.every((finish) => finish.rollId === "test-macro"));
});

test("travel buttons switch modes, update illumination fuel, and roll on both boost transitions", () => {
  const illumination = createWorkerHarness({
    ship_class: "2",
    crew_count: "20",
    forced_mode: "1",
    illumination_mode: "0",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
  }, [], { applyWrites: true });

  illumination.trigger("clicked:toggle_illumination_mode");

  assert.ok(illumination.writes.some((write) =>
    write.illumination_mode === "1" && write.forced_mode === "0"
  ));
  const illuminatedShip = illumination.writes.find((write) => write.ship_fuel_rate);
  assert.equal(illuminatedShip.ship_fuel_rate, "4");
  assert.equal(illuminatedShip.ship_speed, "1");

  const enabling = createWorkerHarness({
    ship_class: "0",
    crew_count: "10",
    forced_mode: "0",
    illumination_mode: "1",
    ce_pre_deduction: "0",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
  }, [6, 6, 1, 2], { applyWrites: true });

  enabling.trigger("clicked:toggle_forced_mode");

  assert.ok(enabling.writes.some((write) =>
    write.forced_mode === "1" && write.illumination_mode === "0"
  ));
  assert.equal(enabling.rolls.length, 1);
  assert.match(enabling.rolls[0], /Включение форсажа/);

  const disabling = createWorkerHarness({
    ship_class: "0",
    crew_count: "10",
    forced_mode: "1",
    illumination_mode: "0",
    ce_pre_deduction: "0",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
  }, [6, 6, 1, 2], { applyWrites: true });

  disabling.trigger("clicked:toggle_forced_mode");

  assert.ok(disabling.writes.some((write) => write.forced_mode === "0"));
  assert.equal(disabling.rolls.length, 1);
  assert.match(disabling.rolls[0], /Выключение форсажа/);
});

test("sector travel uses current class, crew and mode and supports fractional stocks", () => {
  for (const [mode, crew, fuel, provisions, unrest, watches] of [
    ["normal", "10", "9", "9", "1", "1"],
    ["forced_mode", "5", "8", "9.75", "1", "0.5"],
    ["illumination_mode", "10", "8", "9", "0.5", "1"],
    ["normal", "4", "8", "9.5", "1", "2"],
  ]) {
    const harness = createWorkerHarness({
      ship_class: "0", crew_count: crew, fuel_stock: "10", provisions_stock: "10",
      unrest: "0", [mode]: "1",
    }, [], { applyWrites: true });
    harness.trigger("clicked:travel_sector");
    assert.equal(harness.attributes.fuel_stock, fuel);
    assert.equal(harness.attributes.provisions_stock, provisions);
    assert.equal(harness.attributes.unrest, unrest);
    assert.equal(harness.attributes.travel_watches, watches);
    assert.equal(harness.attributes.travel_sectors, "1");
    assert.ok(harness.attributes.ship_speed);
    assert.match(harness.attributes.travel_status, /Пройден сектор/);
    harness.trigger("clicked:travel_sector");
    assert.equal(harness.attributes.travel_sectors, "2");
    assert.equal(harness.attributes.ship_status, "");
  }
  const larger = createWorkerHarness({
    ship_class: "2", crew_count: "20", fuel_stock: "10", provisions_stock: "10",
  }, [], { applyWrites: true });
  larger.trigger("clicked:travel_sector");
  assert.equal(larger.attributes.fuel_stock, "8");
  assert.equal(larger.attributes.provisions_stock, "8");
});

test("unrest display rounds up without losing fractional illumination gains or rollback precision", () => {
  const harness = createWorkerHarness({
    fuel_stock: "20", provisions_stock: "10", illumination_mode: "1", unrest: "0",
  }, [], { applyWrites: true });
  for (const [exact, displayed] of [["0.5", "1"], ["1", "1"], ["1.5", "2"]]) {
    harness.trigger("clicked:travel_sector");
    assert.equal(harness.attributes.unrest, exact);
    assert.equal(harness.attributes.unrest_display, displayed);
    assert.equal(harness.attributes.unrest_meter_label, `${displayed} / 25`);
    harness.trigger("change:unrest_display", { sourceType: "sheetworker" });
    assert.equal(harness.attributes.unrest, exact);
  }
  harness.trigger("sheet:opened");
  assert.equal(harness.attributes.unrest, "1.5");
  assert.equal(harness.attributes.unrest_display, "2");
  harness.trigger("clicked:undo_sector");
  assert.equal(harness.attributes.unrest, "1");
  assert.equal(harness.attributes.unrest_display, "1");
});

test("the rounded unrest counter remains editable without feeding worker updates back into storage", () => {
  const harness = createWorkerHarness({
    unrest: "2.5", unrest_display: "7",
  }, [], { applyWrites: true });
  harness.trigger("change:unrest_display", { sourceType: "player" });
  assert.equal(harness.attributes.unrest, "7");
  assert.equal(harness.attributes.unrest_display, "7");
  harness.attributes.unrest_display = "-1";
  harness.trigger("change:unrest_display", { sourceType: "player" });
  assert.equal(harness.attributes.unrest, "7");
  assert.match(harness.attributes.ship_status, /неотрицательное/);
});

test("insufficient supplies do not change stocks or the previous undo record", () => {
  for (const stocks of [{ fuel_stock: "0", provisions_stock: "10" },
    { fuel_stock: "10", provisions_stock: "0" }]) {
    const harness = createWorkerHarness({
      ...stocks, travel_last_sector: "previous",
    }, [], { applyWrites: true });
    harness.trigger("clicked:travel_sector");
    assert.equal(harness.attributes.fuel_stock, stocks.fuel_stock);
    assert.equal(harness.attributes.provisions_stock, stocks.provisions_stock);
    assert.equal(harness.attributes.travel_last_sector, "previous");
    assert.equal(harness.attributes.travel_sectors, undefined);
    assert.match(harness.attributes.travel_status, /Недостаточно/);
  }
});

test("ship refresh blocks travel and marks depleted supplies, including on sheet open", () => {
  for (const [fuel, provisions, fuelEmpty, provisionsEmpty, warning] of [
    ["0", "10", "1", "0", /Топливо закончилось/],
    ["10", "0", "0", "1", /Провиант закончился/],
    ["0", "0", "1", "1", /Топливо закончилось.*Провиант закончился/],
    ["0.5", "10", "0", "0", /Недостаточно топлива/],
    ["10", "0.5", "0", "0", /Недостаточно провианта/],
  ]) {
    const harness = createWorkerHarness({
      fuel_stock: fuel, provisions_stock: provisions,
    }, [], { applyWrites: true });
    harness.trigger("sheet:opened");
    assert.equal(harness.attributes.travel_blocked, "1");
    assert.equal(harness.attributes.fuel_empty, fuelEmpty);
    assert.equal(harness.attributes.provisions_empty, provisionsEmpty);
    assert.match(harness.attributes.travel_warning, warning);
    harness.attributes.fuel_stock = "10";
    harness.attributes.provisions_stock = "10";
    harness.trigger("change:fuel_stock");
    assert.equal(harness.attributes.travel_blocked, "0");
    assert.equal(harness.attributes.travel_warning, "");
    assert.equal(harness.attributes.fuel_empty, "0");
    assert.equal(harness.attributes.provisions_empty, "0");
  }
});

test("travel availability follows changing fuel requirements and restores after rollback", () => {
  const harness = createWorkerHarness({
    fuel_stock: "1", provisions_stock: "1",
  }, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(harness.attributes.travel_blocked, "0");
  harness.trigger("clicked:toggle_illumination_mode");
  assert.equal(harness.attributes.travel_blocked, "1");
  assert.match(harness.attributes.travel_warning, /требуется 2/);
  harness.trigger("clicked:toggle_illumination_mode");
  assert.equal(harness.attributes.travel_blocked, "0");
  harness.trigger("clicked:travel_sector");
  assert.equal(harness.attributes.travel_blocked, "1");
  assert.equal(harness.attributes.fuel_empty, "1");
  assert.equal(harness.attributes.provisions_empty, "1");
  assert.match(harness.attributes.travel_warning, /Переход недоступен/);
  harness.trigger("clicked:undo_sector");
  assert.equal(harness.attributes.travel_blocked, "0");
  assert.equal(harness.attributes.travel_warning, "");
  assert.equal(harness.attributes.fuel_empty, "0");
  assert.equal(harness.attributes.provisions_empty, "0");
});

test("low-fuel warning starts at five sectors and follows current consumption", () => {
  for (const [fuel, low] of [["5.25", "0"], ["5", "1"], ["3", "1"], ["0", "0"]]) {
    const harness = createWorkerHarness({
      fuel_stock: fuel, provisions_stock: "100",
    }, [], { applyWrites: true });
    harness.trigger("sheet:opened");
    assert.equal(harness.attributes.fuel_low, low);
    if (low === "1") {
      assert.match(harness.attributes.fuel_warning, /Мало топлива/);
      assert.equal(harness.attributes.travel_blocked, "0");
    } else {
      assert.equal(harness.attributes.fuel_warning, "");
    }
  }
  const harness = createWorkerHarness({
    fuel_stock: "10", provisions_stock: "100",
  }, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(harness.attributes.fuel_low, "0");
  harness.trigger("clicked:toggle_illumination_mode");
  assert.equal(harness.attributes.fuel_low, "1");
  assert.match(harness.attributes.fuel_warning, /в запасе: 5/);
  harness.attributes.fuel_stock = "20";
  harness.trigger("change:fuel_stock");
  assert.equal(harness.attributes.fuel_low, "0");
  assert.equal(harness.attributes.fuel_warning, "");
  harness.attributes.ship_class = "3";
  harness.trigger("change:ship_class");
  assert.equal(harness.attributes.fuel_low, "1");
  assert.match(harness.attributes.fuel_warning, /расход 16/);
  harness.attributes.fuel_stock = "1";
  harness.trigger("change:fuel_stock");
  assert.equal(harness.attributes.fuel_low, "1");
  assert.equal(harness.attributes.travel_blocked, "1");
});

test("sector rollback persists across sheet reloads and preserves later resource changes", () => {
  const harness = createWorkerHarness({
    fuel_stock: "10", provisions_stock: "10", unrest: "2",
    forced_mode: "1",
  }, [], { applyWrites: true });
  harness.trigger("clicked:travel_sector");
  harness.trigger("clicked:travel_sector");
  const reloaded = createWorkerHarness({
    ...harness.attributes, forced_mode: "0", fuel_stock: "16", unrest: "7",
  }, [], { applyWrites: true });
  reloaded.trigger("clicked:undo_sector");
  assert.equal(reloaded.attributes.fuel_stock, "18");
  assert.equal(reloaded.attributes.provisions_stock, "9.5");
  assert.equal(reloaded.attributes.unrest, "6");
  assert.equal(reloaded.attributes.travel_sectors, "1");
  assert.equal(reloaded.attributes.travel_watches, "0.5");
  assert.equal(reloaded.attributes.travel_last_sector, "");
  reloaded.trigger("clicked:undo_sector");
  assert.equal(reloaded.attributes.fuel_stock, "18");
  assert.match(reloaded.attributes.travel_status, /Нет перехода/);
  assert.equal(reloaded.rolls.length, 0);
});

test("confirmed reset clears sectors and watches, preserving supplies, unrest and rollback", () => {
  const harness = createWorkerHarness({
    fuel_stock: "10", provisions_stock: "10", unrest: "2",
  }, [], { applyWrites: true });
  harness.trigger("clicked:travel_sector");
  const before = { ...harness.attributes };
  harness.trigger("clicked:reset_sectors");
  assert.deepEqual(harness.attributes, { ...before, reset_sectors_pending: "1" });
  harness.trigger("clicked:confirm_reset_sectors");
  assert.deepEqual(harness.attributes, {
    ...before, travel_sectors: "0", travel_watches: "0", reset_sectors_pending: "0",
  });
  harness.trigger("clicked:undo_sector");
  assert.equal(harness.attributes.travel_sectors, "0");
  assert.equal(harness.attributes.travel_watches, "0");
  assert.equal(harness.attributes.fuel_stock, "10");
  assert.equal(harness.attributes.provisions_stock, "10");
  assert.equal(harness.attributes.unrest, "2");
});

test("reset cancellation preserves both counters and confirmation is required", () => {
  const harness = createWorkerHarness({
    travel_sectors: "4", travel_watches: "2.5",
  }, [], { applyWrites: true });
  harness.trigger("clicked:confirm_reset_sectors");
  assert.equal(harness.writes.length, 0);
  harness.trigger("clicked:reset_sectors");
  harness.trigger("clicked:cancel_reset_sectors");
  harness.trigger("clicked:confirm_reset_sectors");
  assert.deepEqual(harness.attributes, {
    travel_sectors: "4", travel_watches: "2.5", reset_sectors_pending: "0",
  });
});

test("psychotherapy applies success, floors partial relief, and never makes unrest negative", () => {
  for (const [successes, die, initial, expected] of [
    [2, 5, "10", "5"], [1, 5, "10", "8"], [1, 1, "10", "10"],
    [0, 5, "10", "10"], [-1, 6, "10", "10"], [3, 6, "0.5", "0"],
  ]) {
    const harness = createWorkerHarness({ unrest: initial }, [], {
      applyWrites: true,
      macroResults: { successes: { result: successes }, relief: { result: die } },
    });
    harness.trigger("clicked:psychotherapy");
    assert.equal(harness.attributes.unrest, expected);
    assert.match(harness.rolls[0], /4\+\?\{Дополнительные d6\|0\}/);
    assert.match(harness.rolls[0], /\?\{Осложнения\|0\}/);
    assert.equal(harness.finishes.length, 1);
    assert.equal(harness.finishes[0].values.relief, Number(initial) - Number(expected));
    assert.match(harness.rolls[0], /template:ouw25therapy/);
    assert.match(harness.attributes.travel_status, /Психотерапия/);
  }
});

test("unrest growth accepts rolled or custom amounts, caps at 25, and rejects negative input", () => {
  for (const gain of [1, 5, 12, 18, 0.5]) {
    const harness = createWorkerHarness({ unrest: "24" }, [], {
      applyWrites: true, macroResults: { "Прирост": { result: gain } },
    });
    harness.trigger("clicked:increase_unrest");
    assert.equal(harness.attributes.unrest, String(Math.min(25, 24 + gain)));
    assert.equal(harness.attributes.travel_status, `Смута увеличена на ${Math.min(1, gain)}.`);
    assert.match(harness.rolls[0], /\+d6,1d6\|\+2d6,2d6\|\+3d6,3d6/);
    assert.match(harness.rolls[0], /Количество смуты&#124;1&#125;/);
    assert.equal(harness.finishes.length, 1);
  }
  const invalid = createWorkerHarness({ unrest: "4" }, [], {
    applyWrites: true, macroResults: { "Прирост": { result: -3 } },
  });
  invalid.trigger("clicked:increase_unrest");
  assert.equal(invalid.attributes.unrest, "4");
  assert.match(invalid.attributes.travel_status, /неотрицательное/);
});

test("unrest clamps manual and previously stored values and styles the rounded display", () => {
  const harness = createWorkerHarness({ unrest: "30" }, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(harness.attributes.unrest, "25");
  assert.equal(harness.attributes.unrest_display, "25");
  for (const [exact, display, high, max] of [
    ["19", "19", "0", "0"], ["19.5", "20", "1", "0"],
    ["20", "20", "1", "0"], ["24", "24", "1", "0"],
    ["24.5", "25", "1", "1"], ["25", "25", "1", "1"], ["40", "25", "1", "1"],
  ]) {
    harness.attributes.unrest_display = exact;
    harness.trigger("change:unrest_display", { sourceType: "player" });
    assert.equal(harness.attributes.unrest, String(Math.min(25, Number(exact))));
    assert.equal(harness.attributes.unrest_display, display);
    assert.equal(harness.attributes.unrest_high, high);
    assert.equal(harness.attributes.unrest_max, max);
  }
});

test("sector rollback removes only the unrest actually added at the cap", () => {
  for (const [initial, gained] of [["24.5", 0.5], ["25", 0]]) {
    const harness = createWorkerHarness({
      unrest: initial, fuel_stock: "100", provisions_stock: "100",
    }, [], { applyWrites: true });
    harness.trigger("clicked:travel_sector");
    assert.equal(harness.attributes.unrest, "25");
    assert.equal(JSON.parse(harness.attributes.travel_last_sector).unrest, gained);
    harness.trigger("clicked:undo_sector");
    assert.equal(harness.attributes.unrest, initial);
  }
});

test("forced mode is blocked by the worn-engine flaw", () => {
  const harness = createWorkerHarness({
    ship_class: "0",
    crew_count: "10",
    forced_mode: "1",
    illumination_mode: "0",
    ship_flaw_1: "worn_engine",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
  }, []);

  harness.trigger("change:forced_mode", { newValue: "1", sourceType: "player" });

  assert.equal(harness.rolls.length, 0);
  assert.ok(harness.writes.some((write) => write.forced_mode === "0"));
});

test("travel button does not enable boost for a worn engine", () => {
  const harness = createWorkerHarness({
    ship_class: "0",
    crew_count: "10",
    forced_mode: "0",
    illumination_mode: "0",
    ship_flaw_1: "worn_engine",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
  }, []);

  harness.trigger("clicked:toggle_forced_mode");

  assert.equal(harness.rolls.length, 0);
  assert.equal(harness.writes[0].forced_mode, undefined);
  assert.match(harness.writes[0].travel_status, /двигло/);
});

test("ship calculations show doubled illumination fuel and warning thresholds", () => {
  const harness = createWorkerHarness({
    ship_class: "2",
    crew_count: "20",
    illumination_mode: "1",
    forced_mode: "0",
    unrest: "20",
    cargo_load: "0",
    hold_bonus: "0",
  }, []);

  harness.trigger("sheet:opened");

  const ship = harness.writes.find((write) => write.ship_speed);
  assert.equal(ship.ship_fuel_rate, "4");
  assert.equal(ship.ship_provision_rate, "2");
  assert.equal(ship.stanine_count, "4");
  assert.equal(ship.cargo_meter_label, "0 / 6400 ст.");
  assert.equal(ship.crew_meter_label, "20 / 20");
  assert.equal(ship.unrest_meter_label, "20 / 25");
  assert.equal(ship.unrest_high, "1");
  assert.equal(ship.unrest_progress, "20");
  assert.equal(ship.travel_status, "");
});

test("crew changes refresh the fractional speed and low-crew indicator", () => {
  const harness = createWorkerHarness({
    ship_class: "0",
    crew_count: "4",
    forced_mode: "0",
    illumination_mode: "0",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
  }, []);

  harness.trigger("change:crew_count");

  const ship = harness.writes.find((write) => write.ship_speed);
  assert.equal(ship.ship_speed, "0.5");
  assert.equal(ship.crew_progress, "40");
  assert.equal(ship.crew_low, "1");
  assert.equal(ship.crew_meter_label, "4 / 10");
});

test("crew capacity warning includes exactly half without changing the speed threshold", () => {
  const harness = createWorkerHarness({
    ship_class: "0", crew_count: "6",
  }, [], { applyWrites: true });
  for (const [crew, warning, speed] of [
    ["6", "0", "1"], ["5", "1", "1"], ["4", "1", "0.5"], ["10", "0", "1"],
  ]) {
    harness.attributes.crew_count = crew;
    harness.trigger("change:crew_count");
    assert.equal(harness.attributes.crew_half_or_less, warning);
    assert.equal(harness.attributes.ship_speed, speed);
  }
  harness.attributes.ship_class = "1";
  harness.attributes.crew_count = "8";
  harness.trigger("change:ship_class");
  assert.equal(harness.attributes.crew_half_or_less, "0");
  harness.attributes.crew_count = "7";
  harness.trigger("change:crew_count");
  assert.equal(harness.attributes.crew_half_or_less, "1");
});

test("no crew blocks travel without spending supplies and hiring restores movement", () => {
  const harness = createWorkerHarness({
    ship_class: "0", crew_count: "0", fuel_stock: "100", provisions_stock: "100",
    travel_sectors: "4", travel_watches: "5", unrest: "2",
    travel_last_sector: "previous",
  }, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(harness.attributes.crew_empty, "1");
  assert.equal(harness.attributes.travel_blocked, "1");
  assert.match(harness.attributes.travel_warning, /Движение дальше невозможно: не осталось матросов/);
  const before = { ...harness.attributes };
  harness.trigger("clicked:travel_sector");
  assert.deepEqual(harness.attributes, {
    ...before, travel_status: "Движение дальше невозможно: не осталось матросов.",
  });
  harness.attributes.crew_count = "1";
  harness.trigger("change:crew_count");
  assert.equal(harness.attributes.crew_empty, "0");
  assert.equal(harness.attributes.crew_half_or_less, "1");
  assert.equal(harness.attributes.travel_blocked, "0");
  assert.equal(harness.attributes.travel_warning, "");
  harness.trigger("clicked:travel_sector");
  assert.equal(harness.attributes.travel_sectors, "5");
});

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const root = path.join(__dirname, "..");

function createWorkerHarness(attributes, dice, queryAnswer = "4") {
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
    setAttrs(values) {
      writes.push(values);
    },
    startRoll(expression, callback) {
      rolls.push(expression);
      if (expression.includes("query=")) {
        callback({
          rollId: "test-query",
          results: { query: { expression: `0[answer=${queryAnswer}]` } },
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
  assert.equal(ship.ship_durability_max, "5");
  assert.equal(ship.cargo_occupied, "420");
  assert.equal(ship.cargo_capacity, "1600");
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

test("forced-mode changes open a Roll20 query and roll on both transitions", () => {
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

  assert.equal(harness.rolls.filter((roll) => roll.includes("query=")).length, 2);
  assert.equal(harness.rolls.filter((roll) => roll.includes("Проверка удачи")).length, 2);
  assert.equal(harness.rolls.filter((roll) => roll.includes("4d6")).length, 2);
  assert.equal(harness.finishes.filter((finish) => finish.rollId === "test-query").length, 2);
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

const assert = require("node:assert/strict");
const test = require("node:test");
const Ouw25Rules = require("../src/rules.js");

test("Collision Engine accepts at least four dice and nonnegative deductions", () => {
  assert.deepEqual(Ouw25Rules.parseCollisionInput("4", "0"), {
    diceCount: 4,
    preDeduction: 0,
  });
  assert.throws(() => Ouw25Rules.parseCollisionInput("3", "0"), /Количество костей/);
  assert.throws(() => Ouw25Rules.parseCollisionInput("4", "-1"), /Вычет шестёрок/);
});

test("Collision Engine distinguishes full, partial, and failed results", () => {
  assert.equal(Ouw25Rules.resolveCollision([6, 6, 1, 2], 0).outcome, "success");
  assert.equal(Ouw25Rules.resolveCollision([6, 1, 2, 3], 0).outcome, "partial");
  assert.deepEqual(Ouw25Rules.resolveCollision([6, 1, 2, 3], 2), {
    rawSixes: 1,
    remaining: -1,
    outcome: "failure",
  });
});

test("Collision Engine rejects invalid die results", () => {
  assert.throws(() => Ouw25Rules.resolveCollision([6, 1, 2], 0), /некорректный набор/);
  assert.throws(() => Ouw25Rules.resolveCollision([6, 1, 2, 7], 0), /некорректный набор/);
});

test("pension balance can only be increased by a positive whole-number deposit", () => {
  assert.equal(Ouw25Rules.calculatePensionBalance("12", "8"), 20);
  assert.throws(() => Ouw25Rules.calculatePensionBalance("12", "0"), /Сумма пополнения/);
  assert.throws(() => Ouw25Rules.calculatePensionBalance("12", "1.5"), /Сумма пополнения/);
  assert.throws(
    () => Ouw25Rules.calculatePensionBalance(String(Number.MAX_SAFE_INTEGER), "1"),
    /превышает допустимое значение/
  );
});

test("pocket and cooperative budgets accept only whole nonnegative numbers", () => {
  assert.equal(Ouw25Rules.validateMoney("0", "Бюджет"), 0);
  assert.equal(Ouw25Rules.validateMoney("123", "Бюджет"), 123);
  assert.throws(() => Ouw25Rules.validateMoney("-1", "Бюджет"), /Бюджет/);
  assert.throws(() => Ouw25Rules.validateMoney("1.2", "Бюджет"), /Бюджет/);
});

test("all class defaults match the book ship table", () => {
  assert.deepEqual(
    Ouw25Rules.SHIP_CLASSES.map(({ fuel, provisions, crew, durability, stanines, hold }) =>
      [fuel, provisions, crew, durability, stanines, hold]),
    [
      [1, 1, 10, 3, 2, 1600],
      [2, 1, 15, 4, 3, 3200],
      [2, 2, 20, 5, 4, 6400],
      [4, 2, 25, 6, 5, 12800],
      [4, 3, 30, 7, 6, 25200],
      [8, 3, 35, 8, 7, 50400],
      [10, 5, 50, 9, 8, 100000],
    ]
  );
});

test("ship calculations apply forced mode and below-half crew modifiers", () => {
  const result = Ouw25Rules.calculateShip({
    shipClass: "0",
    crewCount: "4",
    forced: true,
    illumination: false,
    unrest: "0",
    cargoLoad: "0",
    holdBonus: "0",
    merits: [],
    compartments: [],
    damage: [],
  });

  assert.equal(result.fuel, 4);
  assert.equal(result.provisions, 0.5);
  assert.equal(result.speed, 1);
  assert.equal(result.crewLow, true);
  assert.equal(result.requiresMechanicCheck, true);
});

test("half crew and forced mode use the rule table values", () => {
  const result = Ouw25Rules.calculateShip({
    shipClass: "0",
    crewCount: "5",
    forced: true,
    illumination: false,
    unrest: "0",
    cargoLoad: "0",
    holdBonus: "0",
    merits: [],
    compartments: [],
    damage: [],
  });

  assert.equal(result.crewBand, "half");
  assert.equal(result.fuel, 2);
  assert.equal(result.provisions, 0.25);
  assert.equal(result.speed, 2);
});

test("odd crew capacity treats seven of fifteen as below half", () => {
  const result = Ouw25Rules.calculateShip({
    shipClass: "1",
    crewCount: "7",
    forced: true,
    illumination: false,
    unrest: "0",
    cargoLoad: "0",
    holdBonus: "0",
    merits: [],
    compartments: [],
    damage: [],
  });

  assert.equal(result.crewBand, "below-half");
  assert.equal(result.fuel, 8);
  assert.equal(result.provisions, 0.5);
  assert.equal(result.speed, 1);
});

test("below-half crew halves normal ship speed", () => {
  const result = Ouw25Rules.calculateShip({
    shipClass: "0",
    crewCount: "4",
    forced: false,
    illumination: false,
    unrest: "0",
    cargoLoad: "0",
    holdBonus: "0",
    merits: [],
    compartments: [],
    damage: [],
  });

  assert.equal(result.speed, 0.5);
  assert.equal(result.crewProgress, 40);
  assert.equal(result.crewLow, true);
});

test("illumination doubles fuel and halves unrest growth", () => {
  const result = Ouw25Rules.calculateShip({
    shipClass: "2",
    crewCount: "20",
    forced: false,
    illumination: true,
    unrest: "20",
    cargoLoad: "0",
    holdBonus: "0",
    merits: [],
    compartments: [],
    damage: [],
  });

  assert.equal(result.fuel, 4);
  assert.equal(result.provisions, 2);
  assert.equal(result.unrestPerSector, 0.5);
  assert.equal(result.unrestHigh, true);
});

test("ship calculations include compartment space, cargo expansion, and strong hull", () => {
  const result = Ouw25Rules.calculateShip({
    shipClass: "0",
    crewCount: "10",
    forced: false,
    illumination: false,
    unrest: "0",
    cargoLoad: "1000",
    holdBonus: "300",
    merits: ["large_hold", "strong_hull"],
    compartments: ["passenger", "diving"],
    damage: [true, true, true, true, true],
  });

  assert.equal(result.cargoOccupied, 2220);
  assert.equal(result.holdCapacity, 1900);
  assert.equal(result.cargoProgress, 100);
  assert.equal(result.durability, 5);
  assert.equal(result.damageOverLimit, false);
  assert.match(result.status, /превышают вместимость/);
});

test("ship calculations reject invalid class, crew, and simultaneous modes", () => {
  const base = {
    shipClass: "0",
    crewCount: "10",
    forced: false,
    illumination: false,
    unrest: "0",
    cargoLoad: "0",
    holdBonus: "0",
    merits: [],
    compartments: [],
    damage: [],
  };
  assert.throws(() => Ouw25Rules.calculateShip({ ...base, shipClass: "7" }), /Класс судна/);
  assert.throws(() => Ouw25Rules.calculateShip({ ...base, crewCount: "11" }), /Число матросов/);
  assert.throws(
    () => Ouw25Rules.calculateShip({ ...base, forced: true, illumination: true }),
    /не включаются одновременно/
  );
  assert.throws(
    () => Ouw25Rules.calculateShip({ ...base, merits: ["large_hold"], holdBonus: "50" }),
    /Бонус вместимости/
  );
});

test("card catalogs supply descriptions for all selectable backgrounds and specialties", () => {
  for (const id of [
    "veteran", "seeker", "colonist", "deprived", "savage", "reconstructed",
    "remnant", "augur", "gambler", "champion", "writer", "artist",
    "hard_worker", "sleeper", "defect", "slave",
  ]) {
    assert.ok(Ouw25Rules.describe("past", id), `missing past description: ${id}`);
  }
  for (const id of ["quartermaster", "navigator", "medic", "mechanic"]) {
    assert.ok(Ouw25Rules.describe("specialty", id), `missing specialty description: ${id}`);
  }
});

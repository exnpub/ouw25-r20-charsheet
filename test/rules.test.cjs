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

test("pension stage explains the next threshold and completion without inventing post-retirement tiers", () => {
  assert.match(Ouw25Rules.pensionStage("0"), /Отпусков заработано – 0\.\nДо следующего отпуска – /);
  assert.match(Ouw25Rules.pensionStage("29999"), /\nДо следующего отпуска – 1 ог\./);
  assert.match(Ouw25Rules.pensionStage("30000"), /Отпусков заработано – 1\.\n/);
  assert.match(Ouw25Rules.pensionStage("239999"), /Отпусков заработано – 7\.\n/);
  assert.match(Ouw25Rules.pensionStage("240000"), /Поздравляем/);
  assert.equal(Ouw25Rules.pensionStage("240001"), Ouw25Rules.pensionStage("240000"));
  assert.throws(() => Ouw25Rules.pensionStage("-1"), /Пенсионный счёт/);
});

test("personal random choices map book dice sums and reject rolls outside the selected table", () => {
  assert.equal(Ouw25Rules.randomPersonalChoice("past", 3), "veteran");
  assert.equal(Ouw25Rules.randomPersonalChoice("past", 18), "slave");
  assert.equal(Ouw25Rules.randomPersonalChoice("flaw", 10), "distracted");
  assert.throws(() => Ouw25Rules.randomPersonalChoice("past", 2), /некорректный/);
  assert.throws(() => Ouw25Rules.randomPersonalChoice("past", 18.5), /некорректный/);
  assert.throws(() => Ouw25Rules.randomPersonalChoice("dream", 11), /некорректный/);
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

test("forced mode and illumination combine with independent fuel multipliers", () => {
  for (const [crewCount, fuel, speed] of [["10", 4, 2], ["4", 8, 1]]) {
    const result = Ouw25Rules.calculateShip({
      shipClass: "0", crewCount, forced: true, illumination: true,
      unrest: "0", cargoLoad: "0", holdBonus: "0",
      merits: [], compartments: [], damage: [],
    });

    assert.equal(result.fuel, fuel);
    assert.equal(result.speed, speed);
    assert.equal(result.provisions, 0.5);
    assert.equal(result.unrestPerSector, 0.5);
  }
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

test("ship cargo occupancy includes fuel and provisions rounded up per 18 units", () => {
  const base = {
    shipClass: "0",
    crewCount: "10",
    forced: false,
    illumination: false,
    unrest: "0",
    cargoLoad: "125",
    fuelStock: "37",
    holdBonus: "0",
    merits: [],
    compartments: [],
    damage: [],
  };
  for (const [stock, cargoSpace] of [[0, 0], [1, 1], [18, 1], [19, 2], [36, 2], [37, 3]]) {
    const result = Ouw25Rules.calculateShip({
      ...base,
      provisionsStock: String(stock),
    });
    assert.equal(result.cargoOccupied, 125 + 37 + cargoSpace);
  }
});

test("ship calculations reject invalid class but warn over-capacity crew", () => {
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
  const overCapacity = Ouw25Rules.calculateShip({ ...base, crewCount: "11" });
  assert.equal(overCapacity.fuel, 1);
  assert.equal(overCapacity.provisions, 1);
  assert.match(overCapacity.status, /Экипаж \(11\) превышает вместимость судна \(10\)/);
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

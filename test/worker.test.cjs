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
  let macroIndex = 0;
  const context = {
    on(events, callback) {
      for (const event of events.split(/\s+/)) {
        handlers[event] ??= [];
        handlers[event].push(callback);
      }
    },
    getAttrs(names, callback) {
      callback(Object.fromEntries(names.map((name) => [name, Object.hasOwn(attributes, name) ? attributes[name] : ""])));
    },
    getSectionIDs(section, callback) {
      const prefix = `${section}_`;
      const ids = Object.keys(attributes).filter((name) => name.startsWith(prefix))
        .map((name) => name.slice(prefix.length).split("_")[0]);
      callback([...new Set(ids)]);
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
          results: Array.isArray(macroResults) ? (macroResults[macroIndex++] || {}) : macroResults,
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

test("debts sum creditor amounts on open and recalculate after edits and removals", () => {
  const attributes = {
    repeating_creditors_first_creditor_amount: "120",
    repeating_creditors_second_creditor_amount: "80",
    repeating_creditors_blank_creditor_who: "Someone",
    repeating_personalitems_item_personal_item_cost: "999",
  };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(attributes.debt_total, "200");
  attributes.repeating_creditors_second_creditor_amount = "30";
  harness.trigger("change:repeating_creditors:creditor_amount");
  assert.equal(attributes.debt_total, "150");
  delete attributes.repeating_creditors_first_creditor_amount;
  harness.trigger("remove:repeating_creditors");
  assert.equal(attributes.debt_total, "30");
  delete attributes.repeating_creditors_second_creditor_amount;
  harness.trigger("remove:repeating_creditors");
  assert.equal(attributes.debt_total, "0");
});

test("Cooperative debt totals only contact debts and updates on edits and removals", () => {
  const attributes = {
    repeating_contacts_first_contact_debt: "120",
    repeating_contacts_second_contact_debt: "80",
    repeating_contacts_blank_contact_who: "Someone",
    repeating_contacts_invalid_contact_debt: "invalid",
    repeating_contacts_negative_contact_debt: "-10",
    repeating_creditors_first_creditor_amount: "999",
  };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(attributes.cooperative_debt_total, "200");
  assert.equal(attributes.debt_total, "999");

  attributes.repeating_contacts_second_contact_debt = "30";
  harness.trigger("change:repeating_contacts:contact_debt");
  assert.equal(attributes.cooperative_debt_total, "150");
  delete attributes.repeating_contacts_first_contact_debt;
  harness.trigger("remove:repeating_contacts");
  assert.equal(attributes.cooperative_debt_total, "30");
  attributes.repeating_contacts_second_contact_debt = "";
  harness.trigger("change:repeating_contacts:contact_debt");
  assert.equal(attributes.cooperative_debt_total, "0");

  Object.keys(attributes).filter((name) => name.startsWith("repeating_contacts_")).forEach((name) => {
    delete attributes[name];
  });
  attributes.cooperative_debt_total = "30";
  harness.trigger("remove:repeating_contacts");
  assert.equal(attributes.cooperative_debt_total, "0");
});

test("debts ignore blank, invalid and negative creditor amounts", () => {
  const harness = createWorkerHarness({
    repeating_creditors_valid_creditor_amount: "100",
    repeating_creditors_blank_creditor_amount: "",
    repeating_creditors_invalid_creditor_amount: "invalid",
    repeating_creditors_infinite_creditor_amount: "Infinity",
    repeating_creditors_negative_creditor_amount: "-10",
  }, []);
  harness.trigger("change:repeating_creditors:creditor_amount");
  assert.equal(harness.writes[0].debt_total, "100");
});

test("debt size steps follow total debt across thresholds and row removal", () => {
  const attributes = {
    repeating_creditors_first_creditor_amount: "9999",
    repeating_creditors_second_creditor_amount: "0",
  };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(attributes.debt_step_bits, "");
  attributes.repeating_creditors_second_creditor_amount = "1";
  harness.trigger("change:repeating_creditors:creditor_amount");
  assert.equal(attributes.debt_step_bits, "bit0");
  attributes.repeating_creditors_second_creditor_amount = "20001";
  harness.trigger("change:repeating_creditors:creditor_amount");
  assert.equal(attributes.debt_step_bits, "bit0 bit1");
  delete attributes.repeating_creditors_second_creditor_amount;
  harness.trigger("remove:repeating_creditors");
  assert.equal(attributes.debt_step_bits, "");
});

test("pension clears the legacy success message on open without erasing other statuses", () => {
  for (const status of ["Счёт пополнен.", "Поздравляем! Новые пенсионные пороги: 30 000 ог.", "Сумма пополнения должна быть положительной."]) {
    const attributes = { pension_balance: "30000", pension_status: status };
    const harness = createWorkerHarness(attributes, [], { applyWrites: true });
    harness.trigger("sheet:opened");
    assert.equal(attributes.pension_status, status === "Счёт пополнен." ? "" : status);
    assert.equal(attributes.pension_balance, "30000");
  }
});

test("pension applies the deposit once and only after confirmation", () => {
  const attributes = { pension_balance: "15", pension_deposit: "5" };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });

  harness.trigger("clicked:confirm_pension_deposit");
  assert.equal(harness.writes.length, 0);
  harness.trigger("clicked:pension_deposit");
  assert.equal(attributes.pension_deposit_amount, "5");
  assert.equal(attributes.pension_balance, "15");
  harness.trigger("clicked:confirm_pension_deposit");
  assert.equal(attributes.pension_balance, "20");
  assert.equal(attributes.pension_deposit, "");
  assert.equal(attributes.pension_status, "");
  const writes = harness.writes.length;
  harness.trigger("clicked:confirm_pension_deposit");
  assert.equal(harness.writes.length, writes);
});

test("pension cancellation or an edited amount never applies a pending deposit", () => {
  const attributes = { pension_balance: "15", pension_deposit: "5" };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("clicked:pension_deposit");
  harness.trigger("clicked:cancel_pension_deposit");
  harness.trigger("clicked:confirm_pension_deposit");
  assert.equal(attributes.pension_balance, "15");
  assert.equal(attributes.pension_deposit, "5");
  harness.trigger("clicked:pension_deposit");
  attributes.pension_deposit = "6";
  harness.trigger("clicked:confirm_pension_deposit");
  assert.equal(attributes.pension_balance, "15");
  assert.equal(attributes.pension_deposit_pending, "0");
  assert.match(attributes.pension_status, /Сумма изменилась/);
});

test("pension size follows existing balances, deposits and direct balance changes", () => {
  const attributes = { pension_balance: "9999", pension_deposit: "1" };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(attributes.pension_step_bits, "");
  harness.trigger("clicked:pension_deposit");
  harness.trigger("clicked:confirm_pension_deposit");
  assert.equal(attributes.pension_step_bits, "bit0");
  attributes.pension_balance = "30000";
  harness.trigger("change:pension_balance");
  assert.equal(attributes.pension_step_bits, "bit0 bit1");
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

test("pension milestones congratulate only newly crossed thresholds and persist their stage", () => {
  const attributes = { pension_balance: "29999", pension_deposit: "60002" };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("clicked:pension_deposit");
  harness.trigger("clicked:confirm_pension_deposit");
  assert.equal(attributes.pension_balance, "90001");
  assert.match(attributes.pension_status, /Поздравляем/);
  assert.match(attributes.pension_status.replace(/\s/g, ""), /30000,60000,90000/);
  assert.match(attributes.pension_stage_status, /Отпусков заработано – 3\.\nДо следующего отпуска/);
  assert.match(attributes.pension_stage_status.replace(/\s/g, ""), /29999ог/);
  attributes.pension_deposit = "1";
  harness.trigger("clicked:pension_deposit");
  harness.trigger("clicked:confirm_pension_deposit");
  assert.equal(attributes.pension_status, "");
  attributes.pension_balance = "239999";
  attributes.pension_deposit = "1";
  harness.trigger("clicked:pension_deposit");
  harness.trigger("clicked:confirm_pension_deposit");
  assert.match(attributes.pension_status, /завершить контракт/);
  harness.trigger("sheet:opened");
  assert.match(attributes.pension_stage_status, /Поздравляем/);
  attributes.pension_deposit = "30000";
  harness.trigger("clicked:pension_deposit");
  harness.trigger("clicked:confirm_pension_deposit");
  assert.equal(attributes.pension_status, "");
  assert.match(attributes.pension_stage_status, /240 000/);
});

test("luck buttons work when the display-only counter has no stored value", () => {
  for (const value of [undefined, null, ""]) {
    for (const [action, expected] of [["luck_add", "2"], ["luck_spend", "0"]]) {
      const attributes = { luck_points: value };
      const harness = createWorkerHarness(attributes, [], { applyWrites: true });
      harness.trigger(`clicked:${action}`);
      assert.equal(attributes.luck_points, expected);
      assert.equal(attributes.luck_status, "");
      harness.trigger("clicked:luck_add");
      assert.equal(attributes.luck_points, String(Number(expected) + 1));
    }
  }
});

test("luck clears stale input-validation messages on open without resetting the count", () => {
  const attributes = {
    luck_points: "4",
    luck_status: "Метки удачи: введите целое неотрицательное число.",
  };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(attributes.luck_status, "");
  assert.equal(attributes.luck_points, "4");
});

test("luck can be freely granted and spent without purchase or a negative balance", () => {
  const attributes = { luck_points: "0", pocket_money: "12", pension_balance: "99" };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("clicked:luck_spend");
  assert.equal(attributes.luck_points, "0");
  assert.match(attributes.luck_status, /Нет меток/);
  harness.trigger("clicked:luck_add");
  harness.trigger("clicked:luck_add");
  assert.equal(attributes.luck_points, "2");
  harness.trigger("clicked:luck_spend");
  assert.equal(attributes.luck_points, "1");
  attributes.luck_points = "1.5";
  harness.trigger("clicked:luck_add");
  assert.equal(attributes.luck_points, "1.5");
  assert.equal(attributes.luck_status, "Не удалось изменить число меток удачи.");
  assert.equal(attributes.pocket_money, "12");
  assert.equal(attributes.pension_balance, "99");
});

test("personal cards switch moves, contextual actions and wound capacity without resetting luck", () => {
  const attributes = { specialty: "mechanic", past: "veteran", luck_points: "7", hiring_history: "tale" };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.match(attributes.special_move_title, /желудей/);
  assert.match(attributes.special_move_description, /вахту/);
  assert.match(attributes.past_action_1_label, /однополчанина/);
  assert.equal(attributes.past_action_3_visible, "1");
  assert.equal(attributes.past_action_4_visible, "0");
  assert.equal(attributes.hiring_action_visible, "1");
  attributes.past = "hard_worker";
  attributes.past_roll_result = "old";
  harness.trigger("change:past", { sourceAttribute: "past" });
  assert.equal(attributes.past_action_1_visible, "0");
  assert.equal(attributes.past_roll_result, "");
  assert.equal(attributes.wounds_four, "1");
  attributes.past = "artist";
  harness.trigger("change:past");
  assert.equal(attributes.wounds_two, "1");
  assert.equal(attributes.wounds_four, "0");
  attributes.past = "deprived";
  harness.trigger("change:past");
  assert.equal(attributes.wounds_two, "0");
  attributes.wound_fragile = "1";
  harness.trigger("change:wound_fragile");
  assert.equal(attributes.wounds_two, "1");
  attributes.past = "augur";
  attributes.hiring_history = "letters";
  harness.trigger("change:past");
  assert.equal(attributes.hiring_action_visible, "0");
  assert.equal(attributes.luck_points, "7");
});

test("additional trait descriptions load and change without migrating or overwriting original traits", () => {
  const attributes = {
    character_merit: "strong", character_flaw: "greedy",
    repeating_merits_row1_trait: "agile", repeating_flaws_row2_trait: "injury",
  };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.match(attributes.repeating_merits_row1_trait_description, /Ловкость/);
  assert.match(attributes.repeating_flaws_row2_trait_description, /травма/);
  attributes.repeating_merits_row1_trait = "";
  harness.trigger("change:repeating_merits:trait");
  assert.equal(attributes.repeating_merits_row1_trait_description, "");
  assert.equal(attributes.character_merit, "strong");
  assert.equal(attributes.character_flaw, "greedy");
});

test("randomize buttons use book distributions and update only the requested field or repeating row", () => {
  const attributes = { past: "artist", character_merit: "strong", repeating_merits_row1_trait: "agile", repeating_merits_row2_trait: "taste" };
  const harness = createWorkerHarness(attributes, [], {
    applyWrites: true,
    macroResults: [{ Выбор: { result: 3 } }, { Выбор: { result: 18 } }, { Выбор: { result: 9 } }],
  });
  harness.trigger("clicked:random_past");
  assert.match(harness.rolls[0], /3d6/);
  assert.equal(attributes.past, "veteran");
  assert.match(attributes.past_rules, /однополчанина/);
  harness.trigger("clicked:repeating_merits:random_trait", { sourceAttribute: "repeating_merits_row1_random_trait" });
  assert.equal(attributes.repeating_merits_row1_trait, "empathetic");
  assert.match(attributes.repeating_merits_row1_trait_description, /эмоций/);
  assert.equal(attributes.repeating_merits_row2_trait, "taste");
  assert.equal(attributes.character_merit, "strong");
  harness.trigger("clicked:random_flaw");
  assert.equal(attributes.character_flaw, "sex_addiction");
});

test("random names use two published-list choices and malformed rolls do not erase the existing name", () => {
  const attributes = { character_name: "Old" };
  const harness = createWorkerHarness(attributes, [], {
    applyWrites: true,
    macroResults: [
      { Выбор: { result: 1 }, Фамилия: { result: 15 } },
      { Выбор: { result: 99 }, Фамилия: { result: 1 } },
    ],
  });
  harness.trigger("clicked:random_name");
  assert.equal(attributes.character_name, "Абгейл Бррлин");
  harness.trigger("clicked:random_name");
  assert.equal(attributes.character_name, "Абгейл Бррлин");
  assert.match(attributes.personal_random_status, /некорректный/);
});

test("random starting money honors deprived and slave backgrounds without touching savings", () => {
  for (const [past, multiplier, amount] of [["deprived", 50, 700], ["slave", 0, 0], ["veteran", 10, 140]]) {
    const attributes = { past, pocket_money: "4", pension_balance: "1" };
    const harness = createWorkerHarness(attributes, [], { applyWrites: true, macroResults: { Сумма: { result: amount } } });
    harness.trigger("clicked:random_money");
    assert.match(harness.rolls[0], new RegExp(`4d6\\*${multiplier}`));
    assert.equal(attributes.pocket_money, String(amount));
    assert.equal(attributes.pension_balance, "1");
  }
});

test("veteran search uses a collision rather than inventing a d6 friend-search chance", () => {
  const harness = createWorkerHarness({ past: "veteran" }, []);
  harness.trigger("clicked:past_action_1");
  assert.match(harness.rolls[0], /4\+\?\{Дополнительные d6/);
  assert.match(harness.rolls[0], /Осложнения/);
  assert.match(harness.writes[0].past_roll_result, /Проверка отправлена/);
});

test("past d6 checks distinguish success and failure and old invisible actions cannot roll", () => {
  for (const [roll, text] of [[1, /Товарищ просит/], [2, /не просит/]]) {
    const attributes = { past: "veteran" };
    const harness = createWorkerHarness(attributes, [], { applyWrites: true, macroResults: [{ Бросок: { result: roll } }, {}] });
    harness.trigger("clicked:past_action_2");
    assert.match(attributes.past_roll_result, text);
    attributes.past = "hard_worker";
    const rollCount = harness.rolls.length;
    harness.trigger("clicked:past_action_2");
    assert.equal(harness.rolls.length, rollCount);
  }
});

test("gambler encounter rolls the indicated amounts and retains the combination instruction on six", () => {
  const attributes = { past: "gambler", pocket_money: "75" };
  const harness = createWorkerHarness(attributes, [], {
    applyWrites: true,
    macroResults: [{ Бросок: { result: 4 } }, { Сумма: { result: 4000 }, Громилы: { result: 7 } }, { Бросок: { result: 6 } }, {}],
  });
  harness.trigger("clicked:past_action_3");
  assert.match(harness.rolls[1], /Сумма=\[\[1d6\*1000\]\]/);
  assert.match(attributes.past_roll_result, /4000 ог/);
  assert.match(attributes.past_roll_result, /7 опасно/);
  assert.equal(attributes.pocket_money, "75");
  harness.trigger("clicked:past_action_3");
  assert.match(attributes.past_roll_result, /ещё два раза/);
});

test("hiring history rolls values without silently paying them into personal money", () => {
  const attributes = { hiring_history: "pitiful", pocket_money: "7" };
  const harness = createWorkerHarness(attributes, [], {
    applyWrites: true, macroResults: [{ Бросок: { result: 1500 } }, {}],
  });
  harness.trigger("clicked:hiring_action");
  assert.match(harness.rolls[0], /1d6\*500/);
  assert.match(attributes.hiring_roll_result, /1500/);
  assert.equal(attributes.pocket_money, "7");
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

test("the ship counts only unoccupied mounts available to its current class", () => {
  const attributes = {
    ship_class: "0",
    stanine_1: "slagthrower",
    stanine_3: "harpoon",
  };
  const harness = createWorkerHarness(attributes, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(attributes.stanine_count, "1");

  attributes.stanine_2 = "winch";
  harness.trigger("change:stanine_2");
  assert.equal(attributes.stanine_count, "0");

  attributes.stanine_1 = "";
  harness.trigger("change:stanine_1");
  assert.equal(attributes.stanine_count, "1");

  attributes.ship_class = "2";
  harness.trigger("change:ship_class");
  assert.equal(attributes.stanine_count, "2");
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

test("travel buttons switch modes independently and roll on both boost transitions", () => {
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

  assert.equal(illumination.attributes.illumination_mode, "1");
  assert.equal(illumination.attributes.forced_mode, "1");
  const illuminatedShip = illumination.writes.find((write) => write.ship_fuel_rate);
  assert.equal(illuminatedShip.ship_fuel_rate, "8");
  assert.equal(illuminatedShip.ship_speed, "2");
  illumination.trigger("clicked:toggle_illumination_mode");
  assert.equal(illumination.attributes.illumination_mode, "0");
  assert.equal(illumination.attributes.forced_mode, "1");

  const enabling = createWorkerHarness({
    ship_class: "0",
    crew_count: "10",
    forced_mode: "0",
    illumination_mode: "1",
    ce_pre_deduction: "0",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
  }, [6, 6, 1, 2], {
    applyWrites: true, macroResults: { "Успехов": { result: 2 } },
  });

  enabling.trigger("clicked:toggle_forced_mode");

  assert.equal(enabling.attributes.forced_mode, "1");
  assert.equal(enabling.attributes.illumination_mode, "1");
  assert.equal(enabling.attributes.ship_fuel_rate, "4");
  assert.equal(enabling.rolls.length, 1);
  assert.match(enabling.rolls[0], /Включение форсажа/);

  const disabling = createWorkerHarness({
    ship_class: "0",
    crew_count: "10",
    forced_mode: "1",
    illumination_mode: "1",
    ce_pre_deduction: "0",
    unrest: "0",
    cargo_load: "0",
    hold_bonus: "0",
  }, [6, 6, 1, 2], { applyWrites: true });

  disabling.trigger("clicked:toggle_forced_mode");

  assert.ok(disabling.writes.some((write) => write.forced_mode === "0"));
  assert.equal(disabling.attributes.illumination_mode, "1");
  assert.equal(disabling.attributes.ship_fuel_rate, "2");
  assert.equal(disabling.rolls.length, 1);
  assert.match(disabling.rolls[0], /Выключение форсажа/);
});

test("boost enables only after a successful check and leaves illumination untouched", () => {
  for (const event of ["clicked:toggle_forced_mode", "change:forced_mode"]) {
    for (const successes of [-1, 0, 1, 2, undefined]) {
      const harness = createWorkerHarness({
        ship_class: "0", crew_count: "10", illumination_mode: "1",
        forced_mode: event === "change:forced_mode" ? "1" : "0",
        fuel_stock: "10", provisions_stock: "10", unrest: "0",
      }, [], {
        applyWrites: true,
        macroResults: successes === undefined ? {} : { "Успехов": { result: successes } },
      });

      harness.trigger(event, { newValue: "1", sourceType: "player" });

      const enabled = successes > 0;
      assert.equal(harness.attributes.forced_mode, enabled ? "1" : "0");
      assert.equal(harness.attributes.illumination_mode, "1");
      assert.equal(harness.attributes.ship_speed, enabled ? "2" : "1");
      assert.equal(harness.attributes.ship_fuel_rate, enabled ? "4" : "2");
      assert.equal(harness.rolls.length, 1);
      assert.equal(harness.finishes.length, 1);
      if (!enabled) {
        assert.ok(harness.writes.every((write) => write.forced_mode !== "1"));
        assert.match(harness.attributes.travel_status, /Форсаж не включён/);
      }
    }
  }
});

test("only full failures add one damage on both boost transitions and event paths", () => {
  for (const source of ["clicked:toggle_forced_mode", "change:forced_mode"]) {
    for (const enabling of [true, false]) {
      for (const successes of [-1, 0, 1, 2, undefined]) {
        const harness = createWorkerHarness({
          ship_class: "0", crew_count: "10", illumination_mode: "1",
          forced_mode: (source === "change:forced_mode" ? enabling : !enabling) ? "1" : "0",
          fuel_stock: "10", provisions_stock: "10", unrest: "0",
          ship_damage_1: "1", ship_damage_3: "1",
        }, [], {
          applyWrites: true,
          macroResults: successes === undefined ? {} : { "Успехов": { result: successes } },
        });

        harness.trigger(source, { newValue: enabling ? "1" : "0", sourceType: "player" });

        const failed = Number.isInteger(successes) && successes <= 0;
        const damageWrites = harness.writes.flatMap((write) =>
          Object.keys(write).filter((name) => /^ship_damage_\d+$/.test(name)));
        assert.deepEqual(damageWrites, failed ? ["ship_damage_2"] : []);
        assert.equal(harness.attributes.ship_damage_1, "1");
        assert.equal(harness.attributes.ship_damage_3, "1");
        assert.equal(harness.attributes.ship_durability, failed ? "3" : "2");
        assert.equal(harness.attributes.forced_mode, enabling && successes > 0 ? "1" : "0");
        assert.equal(harness.attributes.illumination_mode, "1");
        assert.equal(harness.finishes.length, 1);
        if (failed) assert.match(harness.attributes.travel_status, /Добавлен 1 полом/);
      }
    }
  }
});

test("repeated boost failures fill damage gaps and report a full damage track", () => {
  const harness = createWorkerHarness({
    ship_class: "0", crew_count: "10", forced_mode: "0",
    ship_damage_1: "1", ship_damage_3: "1",
  }, [], { applyWrites: true, macroResults: { "Успехов": { result: 0 } } });

  for (const expected of [2, 4, 5, 6, 7, 8, 9, 10, 11]) {
    harness.trigger("clicked:toggle_forced_mode");
    assert.equal(harness.attributes[`ship_damage_${expected}`], "1");
  }
  assert.equal(harness.attributes.ship_durability, "11");
  const writes = harness.writes.length;
  harness.trigger("clicked:toggle_forced_mode");
  assert.ok(harness.writes.slice(writes).every((write) =>
    !Object.keys(write).some((name) => /^ship_damage_/.test(name))));
  assert.equal(harness.attributes.ship_durability, "11");
  assert.match(harness.attributes.travel_status, /Все ячейки поломов уже отмечены/);
});

test("opening and direct mode changes preserve simultaneous modes", () => {
  const harness = createWorkerHarness({
    ship_class: "0", crew_count: "10", forced_mode: "1", illumination_mode: "1",
    unrest: "0", cargo_load: "0", hold_bonus: "0", ce_pre_deduction: "0",
  }, [], {
    applyWrites: true, macroResults: { "Успехов": { result: 2 } },
  });

  for (const event of ["sheet:opened", "change:forced_mode", "change:illumination_mode"]) {
    harness.trigger(event, { newValue: "1", sourceType: "player" });
    assert.equal(harness.attributes.forced_mode, "1");
    assert.equal(harness.attributes.illumination_mode, "1");
    assert.equal(harness.attributes.ship_fuel_rate, "4");
    assert.equal(harness.attributes.ship_speed, "2");
  }
});

test("sector travel and undo support both modes without disabling either", () => {
  const harness = createWorkerHarness({
    ship_class: "0", crew_count: "10", forced_mode: "1", illumination_mode: "1",
    fuel_stock: "10", provisions_stock: "10", unrest: "0",
  }, [], { applyWrites: true });

  harness.trigger("clicked:travel_sector");
  assert.equal(harness.attributes.fuel_stock, "6");
  assert.equal(harness.attributes.provisions_stock, "9.5");
  assert.equal(harness.attributes.unrest, "0.5");
  assert.equal(harness.attributes.travel_watches, "0.5");
  assert.equal(harness.attributes.forced_mode, "1");
  assert.equal(harness.attributes.illumination_mode, "1");

  harness.trigger("clicked:undo_sector");
  assert.equal(harness.attributes.fuel_stock, "10");
  assert.equal(harness.attributes.provisions_stock, "10");
  assert.equal(harness.attributes.unrest, "0");
  assert.equal(harness.attributes.forced_mode, "1");
  assert.equal(harness.attributes.illumination_mode, "1");
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

test("repeating cargo volumes add to manual cargo, supplies and compartments on open, edits and deletion", () => {
  const harness = createWorkerHarness({
    ship_class: "0", cargo_load: "100", fuel_stock: "20", provisions_stock: "18",
    compartment_1: "passenger",
    repeating_cargo_a_cargo_item_name: "Ящики",
    repeating_cargo_a_cargo_item_quantity: "100",
    repeating_cargo_a_cargo_item_volume: "300",
    repeating_cargo_b_cargo_item_volume: "400.5",
    repeating_cargo_blank_cargo_item_name: "Без объёма",
  }, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(harness.attributes.cargo_occupied, "1241.5");
  assert.equal(harness.attributes.cargo_near_full, "0");
  harness.attributes.repeating_cargo_b_cargo_item_volume = "700";
  harness.trigger("change:repeating_cargo:cargo_item_volume");
  assert.equal(harness.attributes.cargo_occupied, "1541");
  assert.equal(harness.attributes.cargo_near_full, "1");
  delete harness.attributes.repeating_cargo_b_cargo_item_volume;
  harness.trigger("remove:repeating_cargo");
  assert.equal(harness.attributes.cargo_occupied, "841");
  assert.equal(harness.attributes.cargo_near_full, "0");
  harness.trigger("clicked:travel_sector");
  assert.equal(harness.attributes.cargo_occupied, "840");
  harness.attributes.repeating_cargo_a_cargo_item_volume = "-1";
  harness.trigger("change:repeating_cargo:cargo_item_volume");
  assert.equal(harness.attributes.cargo_occupied, "");
  assert.match(harness.attributes.ship_status, /Объём груза/);
});

test("cargo occupancy warning starts with 100 free units and follows capacity and supplies", () => {
  const harness = createWorkerHarness({
    ship_class: "0", repeating_cargo_a_cargo_item_volume: "1499",
  }, [], { applyWrites: true });
  for (const [volume, warning] of [["1499", "0"], ["1500", "1"], ["1600", "1"], ["1700", "1"]]) {
    harness.attributes.repeating_cargo_a_cargo_item_volume = volume;
    harness.trigger("change:repeating_cargo:cargo_item_volume");
    assert.equal(harness.attributes.cargo_near_full, warning);
  }
  harness.attributes.repeating_cargo_a_cargo_item_volume = "1499";
  harness.attributes.fuel_stock = "1";
  harness.trigger("change:fuel_stock");
  assert.equal(harness.attributes.cargo_near_full, "1");
  harness.attributes.ship_merit_1 = "large_hold";
  harness.attributes.hold_bonus = "100";
  harness.trigger("change:hold_bonus");
  assert.equal(harness.attributes.cargo_capacity, "1700");
  assert.equal(harness.attributes.cargo_near_full, "0");
  harness.attributes.ship_class = "1";
  harness.trigger("change:ship_class");
  assert.equal(harness.attributes.cargo_capacity, "3300");
  assert.equal(harness.attributes.cargo_near_full, "0");
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
    assert.equal(harness.attributes.crew_warning,
      warning === "1" ? `Мало матросов. Экипаж: ${crew} из 10.` : "");
    assert.equal(harness.attributes.ship_speed, speed);
  }
  harness.attributes.ship_class = "1";
  harness.attributes.crew_count = "8";
  harness.trigger("change:ship_class");
  assert.equal(harness.attributes.crew_half_or_less, "0");
  assert.equal(harness.attributes.crew_warning, "");
  harness.attributes.crew_count = "7";
  harness.trigger("change:crew_count");
  assert.equal(harness.attributes.crew_half_or_less, "1");
  assert.equal(harness.attributes.crew_warning, "Мало матросов. Экипаж: 7 из 15.");
  harness.attributes.crew_count = "-1";
  harness.trigger("change:crew_count");
  assert.equal(harness.attributes.crew_warning, "");
  assert.equal(harness.attributes.crew_half_or_less, "0");
});

test("no crew blocks travel without spending supplies and hiring restores movement", () => {
  const harness = createWorkerHarness({
    ship_class: "0", crew_count: "0", fuel_stock: "100", provisions_stock: "100",
    travel_sectors: "4", travel_watches: "5", unrest: "2",
    travel_last_sector: "previous",
  }, [], { applyWrites: true });
  harness.trigger("sheet:opened");
  assert.equal(harness.attributes.crew_empty, "1");
  assert.equal(harness.attributes.crew_warning, "Мало матросов. Экипаж: 0 из 10.");
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

(function () {
  "use strict";

  const PERSONAL_SELECTIONS = [
    ["specialty", "specialty_description", "specialty"],
    ["past", "past_description", "past"],
    ["character_merit", "merit_description", "merit"],
    ["character_flaw", "flaw_description", "flaw"],
    ["hiring_history", "hiring_description", "hiring"],
    ["cooperative_reputation", "reputation_description", "reputation"],
    ["shared_memory", "shared_memory_description", "memory"],
  ];

  const SHIP_SELECTIONS = [
    "ship_merit_1", "ship_merit_2", "ship_merit_3", "ship_merit_4",
    "ship_flaw_1", "ship_flaw_2", "ship_flaw_3", "ship_flaw_4",
    "stanine_1", "stanine_2", "stanine_3", "stanine_4",
    "stanine_5", "stanine_6", "stanine_7", "stanine_8",
    "compartment_1", "compartment_2", "compartment_3", "compartment_4",
    "gear_1", "gear_2",
  ];

  function isChecked(value) {
    return value === "1" || value === 1 || value === true || value === "on";
  }

  function setMoneyStatus(attribute, outputAttribute, label) {
    getAttrs([attribute], function (values) {
      if (values[attribute] === undefined || values[attribute] === "") {
        setAttrs({ [outputAttribute]: "" });
        return;
      }
      try {
        Ouw25Rules.validateMoney(values[attribute], label);
        setAttrs({ [outputAttribute]: "" });
      } catch (error) {
        setAttrs({ [outputAttribute]: error.message });
      }
    });
  }

  function updatePersonal() {
    const names = PERSONAL_SELECTIONS.map(([attribute]) => attribute);
    getAttrs(names, function (values) {
      const updates = {};
      PERSONAL_SELECTIONS.forEach(([attribute, output, category]) => {
        updates[output] = Ouw25Rules.describe(category, values[attribute]);
      });
      setAttrs(updates);
    });
  }

  function findDuplicates(values) {
    const selected = values.filter(Boolean);
    return new Set(selected).size !== selected.length;
  }

  function equipmentDescription(values) {
    const names = SHIP_SELECTIONS.filter((name) =>
      name.startsWith("compartment_") || name.startsWith("stanine_") || name.startsWith("gear_")
    );
    return names.map((name) => Ouw25Rules.describe("equipment", values[name]))
      .filter(Boolean)
      .join(" ");
  }

  function clearShipStats(message) {
    setAttrs({
      ship_speed: "",
      ship_fuel_rate: "",
      ship_provision_rate: "",
      ship_durability: "",
      ship_durability_max: "",
      crew_capacity: "",
      stanine_count: "",
      cargo_occupied: "",
      cargo_capacity: "",
      cargo_progress: "0",
      cargo_meter_label: "",
      crew_progress: "0",
      crew_meter_label: "",
      crew_low: "0",
      unrest_progress: "0",
      unrest_meter_label: "",
      unrest_high: "0",
      ship_status: message,
    });
  }

  function updateShip() {
    const damageNames = Array.from({ length: 11 }, (_, index) => `ship_damage_${index + 1}`);
    const names = [
      "ship_class", "crew_count", "forced_mode", "illumination_mode", "unrest",
      "cargo_load", "hold_bonus", ...SHIP_SELECTIONS, ...damageNames,
    ];
    getAttrs(names, function (values) {
      const merits = [1, 2, 3, 4].map((index) => values[`ship_merit_${index}`]);
      const flaws = [1, 2, 3, 4].map((index) => values[`ship_flaw_${index}`]);
      const compartments = [1, 2, 3, 4].map((index) => values[`compartment_${index}`]);
      const damage = damageNames.map((name) => isChecked(values[name]));
      let forced = isChecked(values.forced_mode);
      let illumination = isChecked(values.illumination_mode);
      let modeStatus = "";

      if (flaws.includes("worn_engine") && forced) {
        forced = false;
        modeStatus = "Изношенное двигло не позволяет включить форсаж.";
        setAttrs({ forced_mode: "0" });
      }
      if (forced && illumination) {
        illumination = false;
        setAttrs({ illumination_mode: "0" });
        modeStatus = "Форсаж и иллюминация — взаимоисключающие режимы.";
      }

      try {
        const stats = Ouw25Rules.calculateShip({
          shipClass: values.ship_class || "0",
          crewCount: values.crew_count || "10",
          forced,
          illumination,
          unrest: values.unrest || "0",
          cargoLoad: values.cargo_load || "0",
          holdBonus: values.hold_bonus || "0",
          merits,
          compartments,
          damage,
        });
        const status = [
          modeStatus,
          stats.status,
          stats.damageOverLimit ? "Число поломов превышает запас прочности." : "",
          findDuplicates(merits) ? "Достоинства судна нельзя выбирать повторно." : "",
          findDuplicates(flaws) ? "Недостатки судна нельзя выбирать повторно." : "",
        ].filter(Boolean).join(" ");
        const equipmentDescriptionText = equipmentDescription(values);

        setAttrs({
          ship_speed: String(stats.speed),
          ship_fuel_rate: String(stats.fuel),
          ship_provision_rate: String(stats.provisions),
          ship_durability: String(stats.damaged),
          ship_durability_max: String(stats.durability),
          crew_capacity: String(stats.crewCapacity),
          stanine_count: String(Ouw25Rules.SHIP_CLASSES[stats.classIndex].stanines),
          cargo_occupied: String(stats.cargoOccupied),
          cargo_capacity: String(stats.holdCapacity),
          cargo_progress: String(stats.cargoProgress),
          cargo_meter_label: `${stats.cargoOccupied} / ${stats.holdCapacity} ст.`,
          crew_progress: String(stats.crewProgress),
          crew_meter_label: `${stats.crew} / ${stats.crewCapacity}`,
          crew_low: stats.crewLow ? "1" : "0",
          unrest_progress: String(stats.unrestProgress),
          unrest_meter_label: `${stats.unrest} / 25`,
          unrest_high: stats.unrestHigh ? "1" : "0",
          ship_merit_description: Ouw25Rules.describeMany("shipMerit", merits),
          ship_flaw_description: Ouw25Rules.describeMany("shipFlaw", flaws),
          equipment_description: equipmentDescriptionText,
          travel_status: [
            forced ? "Форсаж включён: требуется проверка удачи механика при каждом переключении." : "",
          ].filter(Boolean).join(" "),
          ship_status: status,
        });
      } catch (error) {
        clearShipStats(error.message);
      }
    });
  }

  function readDiceCount(callback) {
    const query = "!{{query=[[0[answer=?{Кости проверки механика|4|5|6|7|8|9|10}]]}}";
    startRoll(query, function (results) {
      const answer = results.results.query.expression
        .replace(/^.*?answer=/, "")
        .replace(/\].*$/, "");
      finishRoll(results.rollId);
      callback(answer);
    });
  }

  function rollForcedCheck(isEnabling) {
    getAttrs(["ce_pre_deduction"], function (values) {
      readDiceCount(function (diceValue) {
        let input;
        try {
          input = Ouw25Rules.parseCollisionInput(diceValue, values.ce_pre_deduction || "0");
        } catch (error) {
          setAttrs({ travel_status: error.message });
          return;
        }

        const roll = [
          "&{template:ouw25}",
          `{{title=Проверка удачи: ${isEnabling ? "включение" : "выключение"} форсажа}}`,
          `{{pool=[[${input.diceCount}d6]]}}`,
          `{{pre_deduction=${input.preDeduction}}}`,
          "{{risk=При провале механик получает +1 полом ходовой части.}}",
        ].join(" ");

        startRoll(roll, function (results) {
          try {
            const outcome = Ouw25Rules.resolveCollision(
              results.results.pool.dice,
              input.preDeduction
            );
            finishRoll(results.rollId, { pool: outcome.remaining });
            const labels = {
              success: "Проверка удачи: успех.",
              partial: "Проверка удачи: успех, но…",
              failure: "Проверка удачи: провал.",
            };
            setAttrs({ travel_status: labels[outcome.outcome] });
          } catch (error) {
            setAttrs({ travel_status: error.message });
          }
        });
      });
    });
  }

  function onForcedModeChange(eventInfo) {
    const enabling = isChecked(eventInfo && eventInfo.newValue);
    getAttrs(["illumination_mode", "ship_flaw_1", "ship_flaw_2", "ship_flaw_3", "ship_flaw_4"], function (values) {
      const wornEngine = ["ship_flaw_1", "ship_flaw_2", "ship_flaw_3", "ship_flaw_4"]
        .some((name) => values[name] === "worn_engine");
      if (enabling && wornEngine) {
        setAttrs({ forced_mode: "0", travel_status: Ouw25Rules.describe("shipFlaw", "worn_engine") });
        updateShip();
        return;
      }
      if (enabling && isChecked(values.illumination_mode)) {
        setAttrs({ illumination_mode: "0" });
      }
      updateShip();
      if (eventInfo && eventInfo.sourceType === "player") {
        rollForcedCheck(enabling);
      }
    });
  }

  function onIlluminationModeChange(eventInfo) {
    if (isChecked(eventInfo && eventInfo.newValue)) {
      setAttrs({ forced_mode: "0" });
    }
    updateShip();
  }

  on("clicked:pension_deposit", function () {
    getAttrs(["pension_balance", "pension_deposit"], function (values) {
      try {
        const balance = Ouw25Rules.calculatePensionBalance(
          values.pension_balance || "0",
          values.pension_deposit
        );
        setAttrs({
          pension_balance: String(balance),
          pension_deposit: "",
          pension_status: "Счёт пополнен.",
        });
      } catch (error) {
        setAttrs({ pension_status: error.message });
      }
    });
  });

  on("change:pocket_money", function () {
    setMoneyStatus("pocket_money", "pocket_money_status", "Карманные деньги");
  });
  on("change:cooperative_budget", function () {
    setMoneyStatus("cooperative_budget", "cooperative_budget_status", "Оперативный бюджет");
  });

  on("clicked:roll_collision", function () {
    getAttrs(["ce_dice_count", "ce_pre_deduction"], function (values) {
      let input;
      try {
        input = Ouw25Rules.parseCollisionInput(
          values.ce_dice_count,
          values.ce_pre_deduction
        );
      } catch (error) {
        setAttrs({ ce_status: error.message });
        return;
      }

      const roll = [
        "&{template:ouw25}",
        "{{title=Проверка удачи}}",
        `{{pool=[[${input.diceCount}d6]]}}`,
        `{{pre_deduction=${input.preDeduction}}}`,
      ].join(" ");

      startRoll(roll, function (results) {
        try {
          const outcome = Ouw25Rules.resolveCollision(results.results.pool.dice, input.preDeduction);
          finishRoll(results.rollId, { pool: outcome.remaining });
          const labels = {
            success: "Это успех!",
            partial: "Это успех, но…",
            failure: "Это провал.",
          };
          setAttrs({
            ce_raw_sixes: String(outcome.rawSixes),
            ce_remaining_sixes: String(outcome.remaining),
            ce_status: labels[outcome.outcome],
          });
        } catch (error) {
          setAttrs({ ce_status: error.message });
        }
      });
    });
  });

  on(
    "sheet:opened change:specialty change:past change:character_merit change:character_flaw change:hiring_history change:cooperative_reputation change:shared_memory",
    updatePersonal
  );
  on(
    "sheet:opened change:ship_class change:crew_count change:unrest change:cargo_load change:hold_bonus change:ship_damage_1 change:ship_damage_2 change:ship_damage_3 change:ship_damage_4 change:ship_damage_5 change:ship_damage_6 change:ship_damage_7 change:ship_damage_8 change:ship_damage_9 change:ship_damage_10 change:ship_damage_11 change:ship_merit_1 change:ship_merit_2 change:ship_merit_3 change:ship_merit_4 change:ship_flaw_1 change:ship_flaw_2 change:ship_flaw_3 change:ship_flaw_4 change:stanine_1 change:stanine_2 change:stanine_3 change:stanine_4 change:stanine_5 change:stanine_6 change:stanine_7 change:stanine_8 change:compartment_1 change:compartment_2 change:compartment_3 change:compartment_4 change:gear_1 change:gear_2",
    updateShip
  );
  on("change:forced_mode", onForcedModeChange);
  on("change:illumination_mode", onIlluminationModeChange);
})();

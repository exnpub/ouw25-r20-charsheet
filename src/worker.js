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

  function updatePersonal(eventInfo) {
    const names = [...PERSONAL_SELECTIONS.map(([attribute]) => attribute), "wound_fragile"];
    getAttrs(names, function (values) {
      const updates = {};
      PERSONAL_SELECTIONS.forEach(([attribute, output, category]) => {
        updates[output] = Ouw25Rules.describe(category, values[attribute]);
      });
      const move = Ouw25Rules.SPECIAL_MOVES[values.specialty];
      updates.special_move_title = move ? move.title : "";
      updates.special_move_description = move ? move.text : "";
      const past = Ouw25Rules.PAST_MOVES[values.past];
      updates.past_rules = past ? past.text : "";
      updates.wounds_two = values.past === "artist" || (values.past === "deprived" && isChecked(values.wound_fragile)) ? "1" : "0";
      updates.wounds_four = values.past === "hard_worker" ? "1" : "0";
      for (let index = 0; index < 4; index += 1) {
        const action = past && past.actions[index];
        updates[`past_action_${index + 1}_visible`] = action ? "1" : "0";
        updates[`past_action_${index + 1}_label`] = action ? action.label : "";
      }
      const hiring = hiringAction(values.hiring_history);
      updates.hiring_action_visible = hiring ? "1" : "0";
      updates.hiring_action_label = hiring ? hiring.label : "";
      if (eventInfo && eventInfo.sourceAttribute === "past") updates.past_roll_result = "";
      if (eventInfo && eventInfo.sourceAttribute === "hiring_history") updates.hiring_roll_result = "";
      setAttrs(updates);
    });
  }

  function updateRepeatingTraits(section, category) {
    getSectionIDs(section, function (ids) {
      const names = ids.map((id) => `${section}_${id}_trait`);
      getAttrs(names, function (values) {
        const updates = {};
        names.forEach((name) => {
          updates[`${name}_description`] = Ouw25Rules.describe(category, values[name]);
        });
        if (names.length) setAttrs(updates);
      });
    });
  }

  function hiringAction(value) {
    if (value === "tale") {
      return { label: "Стоимость истории · d6 × 1 000", dice: "1d6*1000", unit: "ог. — стоимость истории; доступно раз в три встречи." };
    }
    if (value === "pitiful") {
      return { label: "Помощь фонда · d6 × 500", dice: "1d6*500", unit: "ог. — помощь фонда; раз в две встречи в крупном порту." };
    }
    if (value === "ate") {
      return { label: "Действует ли яд? · d6", dice: "1d6", threshold: 3, yes: "Яд действует.", no: "Яд не действует." };
    }
    return null;
  }

  function updateDebtTotal() {
    getSectionIDs("repeating_creditors", function (ids) {
      const names = ids.map((id) => `repeating_creditors_${id}_creditor_amount`);
      getAttrs(names, function (values) {
        const total = names.reduce((sum, name) => {
          const amount = Number(values[name]);
          return sum + (Number.isFinite(amount) && amount >= 0 ? amount : 0);
        }, 0);
        setAttrs({ debt_total: String(total) });
      });
    });
  }

  function updatePensionStage() {
    getAttrs(["pension_balance", "pension_status"], function (values) {
      const updates = {};
      if (values.pension_status === "Счёт пополнен.") updates.pension_status = "";
      try {
        updates.pension_stage_status = Ouw25Rules.pensionStage(values.pension_balance || "0");
      } catch (error) {
        updates.pension_stage_status = error.message;
      }
      setAttrs(updates);
    });
  }

  function changeLuck(delta) {
    getAttrs(["luck_points"], function (values) {
      try {
        const current = Ouw25Rules.validateMoney(values.luck_points == null || values.luck_points === "" ? "1" : values.luck_points, "Метки удачи");
        const next = Ouw25Rules.validateMoney(String(current + delta), "Метки удачи");
        setAttrs({ luck_points: String(next), luck_status: "" });
      } catch {
        setAttrs({ luck_status: delta < 0 && values.luck_points === "0" ? "Нет меток удачи для списания." : "Не удалось изменить число меток удачи." });
      }
    });
  }

  function randomizePersonal(category, attribute) {
    const options = Ouw25Rules.PERSONAL_RANDOM[category];
    const surnameRoll = category === "name" ? " {{Фамилия=[[1d15]]}}" : "";
    startRoll(`&{template:default} {{name=Случайный выбор}} {{Выбор=[[${options.dice}]]}}${surnameRoll}`, function (results) {
      finishRoll(results.rollId);
      try {
        let value = Ouw25Rules.randomPersonalChoice(category, results.results["Выбор"].result);
        if (category === "name") {
          value += ` ${Ouw25Rules.randomPersonalChoice("surname", results.results["Фамилия"].result)}`;
        }
        setAttrs({
          [attribute]: value,
          personal_random_status: `Случайный выбор: ${Ouw25Rules.describe(category, value) || value}`,
        }, { silent: true }, function () {
          updatePersonal({ sourceAttribute: attribute });
          if (category === "merit" || category === "flaw") {
            updateRepeatingTraits(category === "merit" ? "repeating_merits" : "repeating_flaws", category);
          }
        });
      } catch (error) {
        setAttrs({ personal_random_status: error.message });
      }
    });
  }

  function randomizePocketMoney() {
    getAttrs(["past"], function (values) {
      const multiplier = values.past === "deprived" ? 50 : values.past === "slave" ? 0 : 10;
      startRoll(`&{template:default} {{name=Стартовые карманные деньги}} {{Сумма=[[4d6*${multiplier}]]}}`, function (results) {
        finishRoll(results.rollId);
        try {
          const amount = Ouw25Rules.validateMoney(results.results["Сумма"].result, "Карманные деньги");
          setAttrs({ pocket_money: String(amount), pocket_money_status: "", personal_random_status: `Стартовые карманные деньги: ${amount} ог.` });
        } catch (error) {
          setAttrs({ personal_random_status: error.message });
        }
      });
    });
  }

  function publishPersonalResult(title, outcome, attribute) {
    const entry = typeof outcome === "string" ? { text: outcome } : outcome;
    const extraRolls = Object.entries(entry.rolls || {});
    let chatText = entry.text;
    extraRolls.forEach(([label]) => { chatText = chatText.replaceAll(`{${label}}`, `см. «${label}»`); });
    const expression = [
      `&{template:default} {{name=${title}}} {{Описание=${chatText}}}`,
      ...extraRolls.map(([label, dice]) => `{{${label}=[[${dice}]]}}`),
    ].join(" ");
    startRoll(expression, function (results) {
      finishRoll(results.rollId);
      try {
        let text = entry.text;
        extraRolls.forEach(([label]) => {
          const value = Ouw25Rules.validateMoney(results.results[label].result, label);
          text = text.replaceAll(`{${label}}`, String(value));
        });
        setAttrs({ [attribute]: `${title}: ${text}` });
      } catch (error) {
        setAttrs({ [attribute]: error.message });
      }
    });
  }

  function rollPersonalAction(action, attribute) {
    if (!action) return;
    if (action.collision) {
      startRoll([
        `&{template:default} {{name=${action.label}}}`,
        "{{Успехов=[[ [[ [[4+?{Дополнительные d6|0}]]d6>6 ]] - ?{Осложнения|0} ]]}}",
      ].join(" "), function (results) {
        finishRoll(results.rollId);
        setAttrs({ [attribute]: "Проверка отправлена в чат. Примените исход по памятке прошлого; последствия не меняются автоматически." });
      });
      return;
    }
    startRoll(`&{template:default} {{name=${action.label}}} {{Бросок=[[${action.dice}]]}}`, function (results) {
      finishRoll(results.rollId);
      try {
        const value = Ouw25Rules.validateMoney(results.results["Бросок"].result, "Результат броска");
        let outcome;
        if (action.outcomes) {
          outcome = action.outcomes[value - 1];
          if (!outcome) throw new Error("Таблица: некорректный результат броска.");
        } else if (action.threshold !== undefined) {
          if (value < 1 || value > 6) throw new Error("Проверка d6: некорректный результат броска.");
          outcome = value <= action.threshold ? action.yes : action.no;
        } else {
          outcome = `${value} ${action.unit}`;
        }
        publishPersonalResult(action.label, outcome, attribute);
      } catch (error) {
        setAttrs({ [attribute]: error.message });
      }
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
      cargo_near_full: "0",
      cargo_progress: "0",
      cargo_meter_label: "",
      crew_progress: "0",
      crew_meter_label: "",
      crew_low: "0",
      crew_half_or_less: "0",
      crew_empty: "0",
      unrest_progress: "0",
      unrest_meter_label: "",
      unrest_display: "",
      unrest_high: "0",
      unrest_max: "0",
      travel_blocked: "1",
      travel_warning: message,
      fuel_low: "0",
      fuel_warning: "",
      ship_status: message,
    });
  }

  function getShipAttrs(names, callback) {
    getSectionIDs("repeating_cargo", function (ids) {
      const volumes = ids.map((id) => `repeating_cargo_${id}_cargo_item_volume`);
      getAttrs([...names, ...volumes], function (values) {
        callback(values, volumes.map((name) => values[name]));
      });
    });
  }

  function updateShip(onComplete) {
    const damageNames = Array.from({ length: 11 }, (_, index) => `ship_damage_${index + 1}`);
    const names = [
      "ship_class", "crew_count", "forced_mode", "illumination_mode", "unrest",
      "cargo_load", "fuel_stock", "provisions_stock", "hold_bonus", ...SHIP_SELECTIONS, ...damageNames,
    ];
    getShipAttrs(names, function (values, cargoVolumes) {
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
          cargoVolumes,
          fuelStock: values.fuel_stock || "0",
          provisionsStock: values.provisions_stock || "0",
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
        const fuelStock = Number(values.fuel_stock || "0");
        const provisionsStock = Number(values.provisions_stock || "0");
        const fuelLow = fuelStock > 0 && fuelStock <= stats.fuel * 5;
        const shortages = [];
        if (stats.crew === 0) {
          shortages.push("Движение дальше невозможно: не осталось матросов.");
        }
        if (fuelStock < stats.fuel) {
          shortages.push(fuelStock === 0
            ? "Топливо закончилось."
            : `Недостаточно топлива: осталось ${fuelStock}, требуется ${stats.fuel}.`);
        }
        if (provisionsStock < stats.provisions) {
          shortages.push(provisionsStock === 0
            ? "Провиант закончился."
            : `Недостаточно провианта: осталось ${provisionsStock}, требуется ${stats.provisions}.`);
        }

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
          cargo_near_full: stats.holdCapacity - stats.cargoOccupied <= 100 ? "1" : "0",
          cargo_progress: String(stats.cargoProgress),
          cargo_meter_label: `${stats.cargoOccupied} / ${stats.holdCapacity} ст.`,
          crew_progress: String(stats.crewProgress),
          crew_meter_label: `${stats.crew} / ${stats.crewCapacity}`,
          crew_low: stats.crewLow ? "1" : "0",
          crew_half_or_less: stats.crew * 2 <= stats.crewCapacity ? "1" : "0",
          crew_empty: stats.crew === 0 ? "1" : "0",
          unrest_progress: String(stats.unrestProgress),
          unrest_meter_label: `${Math.ceil(stats.unrest)} / 25`,
          unrest_display: String(Math.ceil(stats.unrest)),
          unrest: String(stats.unrest),
          unrest_high: Math.ceil(stats.unrest) >= 20 ? "1" : "0",
          unrest_max: Math.ceil(stats.unrest) >= 25 ? "1" : "0",
          ship_merit_description: Ouw25Rules.describeMany("shipMerit", merits),
          ship_flaw_description: Ouw25Rules.describeMany("shipFlaw", flaws),
          equipment_description: equipmentDescriptionText,
          fuel_empty: fuelStock === 0 ? "1" : "0",
          fuel_low: fuelLow ? "1" : "0",
          fuel_warning: fuelLow
            ? `Мало топлива. Полных секторов в запасе: ${Math.floor(fuelStock / stats.fuel)} (расход ${stats.fuel} ст./сектор).`
            : "",
          provisions_empty: provisionsStock === 0 ? "1" : "0",
          travel_blocked: shortages.length ? "1" : "0",
          travel_warning: shortages.length ? `${shortages.join(" ")} Переход недоступен.` : "",
          travel_status: "",
          ship_status: status,
        }, { silent: true }, function () {
          if (typeof onComplete === "function") onComplete();
        });
      } catch (error) {
        clearShipStats(error.message);
      }
    });
  }

  function rollForcedCheck(isEnabling) {
    const roll = [
      "&{template:default}",
      `{{name=${isEnabling ? "Включение" : "Выключение"} форсажа}}`,
      "{{Успехов=[[ [[ [[4+?{Дополнительные d6|0}]]d6>6 ]] - ?{Осложнения|0} ]]}}",
      "{{Риск=+1 полом}}",
    ].join(" ");

    startRoll(roll, function (results) {
      finishRoll(results.rollId);
    });
  }

  function hasWornEngine(values) {
    return ["ship_flaw_1", "ship_flaw_2", "ship_flaw_3", "ship_flaw_4"]
      .some((name) => values[name] === "worn_engine");
  }

  function onForcedModeChange(eventInfo) {
    const enabling = isChecked(eventInfo && eventInfo.newValue);
    getAttrs(["illumination_mode", "ship_flaw_1", "ship_flaw_2", "ship_flaw_3", "ship_flaw_4"], function (values) {
      if (enabling && hasWornEngine(values)) {
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

  function toggleForcedMode() {
    getAttrs([
      "forced_mode", "illumination_mode",
      "ship_flaw_1", "ship_flaw_2", "ship_flaw_3", "ship_flaw_4",
    ], function (values) {
      const enabling = !isChecked(values.forced_mode);
      if (enabling && hasWornEngine(values)) {
        setAttrs({ travel_status: Ouw25Rules.describe("shipFlaw", "worn_engine") });
        return;
      }

      setAttrs({
        forced_mode: enabling ? "1" : "0",
        ...(enabling ? { illumination_mode: "0" } : {}),
      }, { silent: true }, function () {
        updateShip();
        rollForcedCheck(enabling);
      });
    });
  }

  function toggleIlluminationMode() {
    getAttrs(["illumination_mode"], function (values) {
      const enabling = !isChecked(values.illumination_mode);
      setAttrs({
        illumination_mode: enabling ? "1" : "0",
        ...(enabling ? { forced_mode: "0" } : {}),
      }, { silent: true }, updateShip);
    });
  }

  function saveTravelAction(updates, message) {
    if (updates.unrest !== undefined) {
      updates.unrest = String(Ouw25Rules.parseUnrest(updates.unrest));
    }
    setAttrs(updates, { silent: true }, function () {
      updateShip(function () {
        setAttrs({ travel_status: message });
      });
    });
  }

  function travelSector() {
    getShipAttrs([
      "ship_class", "crew_count", "forced_mode", "illumination_mode",
      "unrest", "fuel_stock", "provisions_stock", "cargo_load", "hold_bonus",
      "travel_sectors", "travel_watches", ...SHIP_SELECTIONS,
    ], function (values, cargoVolumes) {
      try {
        const stats = Ouw25Rules.calculateShip({
          shipClass: values.ship_class || "0",
          crewCount: values.crew_count || "10",
          forced: isChecked(values.forced_mode) && !hasWornEngine(values),
          illumination: isChecked(values.illumination_mode),
          unrest: values.unrest || "0",
          cargoLoad: values.cargo_load || "0",
          cargoVolumes,
          fuelStock: values.fuel_stock || "0",
          provisionsStock: values.provisions_stock || "0",
          holdBonus: values.hold_bonus || "0",
          merits: [1, 2, 3, 4].map((index) => values[`ship_merit_${index}`]),
          compartments: [1, 2, 3, 4].map((index) => values[`compartment_${index}`]),
          damage: [],
        });
        const fuel = Ouw25Rules.parseResource(values.fuel_stock || "0", "Запас топлива");
        const provisions = Ouw25Rules.parseResource(values.provisions_stock || "0", "Запас провианта");
        if (stats.crew === 0) {
          throw new Error("Движение дальше невозможно: не осталось матросов.");
        }
        if (fuel < stats.fuel || provisions < stats.provisions) {
          throw new Error("Недостаточно топлива или провианта для перехода.");
        }
        const sectors = Ouw25Rules.parseResource(values.travel_sectors || "0", "Секторы");
        const watches = Ouw25Rules.parseResource(values.travel_watches || "0", "Вахты");
        const cost = {
          fuel: stats.fuel, provisions: stats.provisions,
          unrest: Math.min(stats.unrestPerSector, 25 - stats.unrest), watches: 1 / stats.speed,
        };
        saveTravelAction({
          fuel_stock: String(fuel - cost.fuel),
          provisions_stock: String(provisions - cost.provisions),
          unrest: String(stats.unrest + cost.unrest),
          travel_sectors: String(sectors + 1),
          travel_watches: String(watches + cost.watches),
          travel_last_sector: JSON.stringify(cost),
        }, `Пройден сектор: −${cost.fuel} топлива, −${cost.provisions} провианта, +${cost.unrest} смуты, ${cost.watches} вахт.`);
      } catch (error) {
        setAttrs({ travel_status: error.message });
      }
    });
  }

  function undoSector() {
    getAttrs([
      "travel_last_sector", "fuel_stock", "provisions_stock", "unrest",
      "travel_sectors", "travel_watches",
    ], function (values) {
      try {
        if (!values.travel_last_sector) throw new Error("Нет перехода для отката.");
        const cost = JSON.parse(values.travel_last_sector);
        for (const key of ["fuel", "provisions", "unrest", "watches"]) {
          cost[key] = Ouw25Rules.parseResource(cost[key], "Данные последнего перехода");
        }
        const current = (name) => Ouw25Rules.parseResource(values[name] || "0", name);
        saveTravelAction({
          fuel_stock: String(current("fuel_stock") + cost.fuel),
          provisions_stock: String(current("provisions_stock") + cost.provisions),
          unrest: String(Math.max(0, Ouw25Rules.parseUnrest(values.unrest || "0") - cost.unrest)),
          travel_sectors: String(Math.max(0, current("travel_sectors") - 1)),
          travel_watches: String(Math.max(0, current("travel_watches") - cost.watches)),
          travel_last_sector: "",
        }, "Последний сектор отменён. Броски в чате не отменены.");
      } catch (error) {
        setAttrs({ travel_status: error.message });
      }
    });
  }

  function psychotherapy() {
    startRoll([
      "&{template:ouw25therapy}",
      "{{successes=[[ [[ [[4+?{Дополнительные d6|0}]]d6>6 ]] - ?{Осложнения|0} ]]}}",
      "{{relief=[[1d6]]}}",
    ].join(" "), function (results) {
      try {
        const successes = results.results.successes.result;
        const die = results.results.relief.result;
        if (!Number.isInteger(successes) || !Number.isInteger(die) || die < 1 || die > 6) {
          throw new Error("Не удалось прочитать результат психотерапии.");
        }
        const reduction = successes >= 2 ? die : successes === 1 ? Math.floor(die / 2) : 0;
        getAttrs(["unrest"], function (values) {
          try {
            const unrest = Ouw25Rules.parseUnrest(values.unrest || "0");
            const actualReduction = Math.min(unrest, reduction);
            saveTravelAction({ unrest: String(unrest - actualReduction) },
              `Психотерапия: смута снижена на ${actualReduction}.`);
            finishRoll(results.rollId, { relief: actualReduction });
          } catch (error) {
            finishRoll(results.rollId, { relief: 0 });
            setAttrs({ travel_status: error.message });
          }
        });
      } catch (error) {
        finishRoll(results.rollId, { relief: 0 });
        setAttrs({ travel_status: error.message });
      }
    });
  }

  function increaseUnrest() {
    startRoll([
      "&{template:default} {{name=Нарастить смуту}}",
      "{{Прирост=[[?{Прирост смуты|+1,1|+d6,1d6|+2d6,2d6|+3d6,3d6|Своё количество,?{Количество смуты&#124;1&#125;}]]}}",
    ].join(" "), function (results) {
      finishRoll(results.rollId);
      getAttrs(["unrest"], function (values) {
        try {
          const gain = Ouw25Rules.parseResource(results.results["Прирост"].result, "Прирост смуты");
          const unrest = Ouw25Rules.parseUnrest(values.unrest || "0");
          const nextUnrest = Math.min(25, unrest + gain);
          saveTravelAction({ unrest: String(nextUnrest) }, `Смута увеличена на ${nextUnrest - unrest}.`);
        } catch (error) {
          setAttrs({ travel_status: error.message });
        }
      });
    });
  }

  on("clicked:pension_deposit", function () {
    getAttrs(["pension_balance", "pension_deposit"], function (values) {
      try {
        const balance = Ouw25Rules.calculatePensionBalance(
          values.pension_balance || "0",
          values.pension_deposit
        );
        const previousThreshold = Math.min(8, Math.floor(Number(values.pension_balance || "0") / 30000));
        const threshold = Math.min(8, Math.floor(balance / 30000));
        const crossed = Array.from({ length: threshold - previousThreshold }, (_, index) =>
          ((previousThreshold + index + 1) * 30000).toLocaleString("ru-RU")
        );
        setAttrs({
          pension_balance: String(balance),
          pension_deposit: "",
          pension_status: crossed.length
            ? `Поздравляем! Новые пенсионные пороги: ${crossed.join(", ")} ог. ${threshold === 8 ? "Можно завершить контракт!" : "Открыто право на плановый отпуск."}`
            : "",
          pension_stage_status: Ouw25Rules.pensionStage(String(balance)),
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
  on("sheet:opened change:pension_balance", updatePensionStage);
  on("sheet:opened change:repeating_creditors:creditor_amount remove:repeating_creditors", updateDebtTotal);
  on("sheet:opened", function () {
    setAttrs({ luck_status: "" });
  });
  on("clicked:luck_add", function () { changeLuck(1); });
  on("clicked:luck_spend", function () { changeLuck(-1); });
  [
    ["name", "character_name"], ["specialty", "specialty"], ["past", "past"],
    ["merit", "character_merit"], ["flaw", "character_flaw"], ["hiring", "hiring_history"],
    ["dream", "big_dream"],
  ].forEach(([category, attribute]) => {
    on(`clicked:random_${category}`, function () { randomizePersonal(category, attribute); });
  });
  on("clicked:random_money", randomizePocketMoney);
  ["merit", "flaw"].forEach((category) => {
    const section = category === "merit" ? "repeating_merits" : "repeating_flaws";
    on(`sheet:opened change:${section}:trait`, function () { updateRepeatingTraits(section, category); });
    on(`clicked:${section}:random_trait`, function (eventInfo) {
      const source = eventInfo && eventInfo.sourceAttribute;
      if (!source || !source.startsWith(`${section}_`) || !source.endsWith("_random_trait")) return;
      const prefix = source.slice(0, -"_random_trait".length);
      randomizePersonal(category, `${prefix}_trait`);
    });
  });
  for (let index = 0; index < 4; index += 1) {
    on(`clicked:past_action_${index + 1}`, function () {
      getAttrs(["past"], function (values) {
        const past = Ouw25Rules.PAST_MOVES[values.past];
        rollPersonalAction(past && past.actions[index], "past_roll_result");
      });
    });
  }
  on("clicked:hiring_action", function () {
    getAttrs(["hiring_history"], function (values) {
      rollPersonalAction(hiringAction(values.hiring_history), "hiring_roll_result");
    });
  });

  on("change:unrest_display", function (eventInfo) {
    if (!eventInfo || eventInfo.sourceType !== "player") return;
    getAttrs(["unrest_display"], function (values) {
      try {
        const unrest = Ouw25Rules.parseUnrest(values.unrest_display);
        setAttrs({ unrest: String(unrest) }, { silent: true }, updateShip);
      } catch (error) {
        setAttrs({ ship_status: error.message });
      }
    });
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
    "sheet:opened change:specialty change:past change:wound_fragile change:character_merit change:character_flaw change:hiring_history change:cooperative_reputation change:shared_memory",
    updatePersonal
  );
  on(
    "sheet:opened change:ship_class change:crew_count change:unrest change:cargo_load change:fuel_stock change:provisions_stock change:hold_bonus change:ship_damage_1 change:ship_damage_2 change:ship_damage_3 change:ship_damage_4 change:ship_damage_5 change:ship_damage_6 change:ship_damage_7 change:ship_damage_8 change:ship_damage_9 change:ship_damage_10 change:ship_damage_11 change:ship_merit_1 change:ship_merit_2 change:ship_merit_3 change:ship_merit_4 change:ship_flaw_1 change:ship_flaw_2 change:ship_flaw_3 change:ship_flaw_4 change:stanine_1 change:stanine_2 change:stanine_3 change:stanine_4 change:stanine_5 change:stanine_6 change:stanine_7 change:stanine_8 change:compartment_1 change:compartment_2 change:compartment_3 change:compartment_4 change:gear_1 change:gear_2",
    updateShip
  );
  on("change:forced_mode", onForcedModeChange);
  on("change:illumination_mode", onIlluminationModeChange);
  on("change:repeating_cargo:cargo_item_volume remove:repeating_cargo", updateShip);
  on("clicked:toggle_forced_mode", toggleForcedMode);
  on("clicked:toggle_illumination_mode", toggleIlluminationMode);
  on("clicked:travel_sector", travelSector);
  on("clicked:undo_sector", undoSector);
  on("clicked:reset_sectors", function () {
    setAttrs({ reset_sectors_pending: "1" });
  });
  on("clicked:confirm_reset_sectors", function () {
    getAttrs(["reset_sectors_pending"], function (values) {
      if (!isChecked(values.reset_sectors_pending)) return;
      setAttrs({
        travel_sectors: "0",
        travel_watches: "0",
        reset_sectors_pending: "0",
      });
    });
  });
  on("clicked:cancel_reset_sectors", function () {
    setAttrs({ reset_sectors_pending: "0" });
  });
  on("clicked:psychotherapy", psychotherapy);
  on("clicked:increase_unrest", increaseUnrest);
})();

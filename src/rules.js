var Ouw25Rules = (function () {
  "use strict";

  const SHIP_CLASSES = [
    { fuel: 1, provisions: 1, crew: 10, durability: 3, stanines: 2, hold: 1600 },
    { fuel: 2, provisions: 1, crew: 15, durability: 4, stanines: 3, hold: 3200 },
    { fuel: 2, provisions: 2, crew: 20, durability: 5, stanines: 4, hold: 6400 },
    { fuel: 4, provisions: 2, crew: 25, durability: 6, stanines: 5, hold: 12800 },
    { fuel: 4, provisions: 3, crew: 30, durability: 7, stanines: 6, hold: 25200 },
    { fuel: 8, provisions: 3, crew: 35, durability: 8, stanines: 7, hold: 50400 },
    { fuel: 10, provisions: 5, crew: 50, durability: 9, stanines: 8, hold: 100000 },
  ];

  const DESCRIPTIONS = {
    specialty: {
      quartermaster: "Профессионален в снабжении, бюджете, контрактах и приёмке товаров.",
      navigator: "Профессионален в навигации, картах, справочниках, маршрутах и ориентировании.",
      medic: "Профессионален в лечении, здоровье экипажа, стрессовых состояниях и ядах.",
      mechanic: "Профессионален в двигателях, ремонте, оборудовании и технических устройствах.",
    },
    past: {
      veteran: "Ветеран: боевой опыт и полезные связи фронтовиков; старые товарищи могут втянуть в рискованные дела.",
      seeker: "Ищущий: доступ к научным кругам, библиотекам и археологическим сведениям; завистники устраивают подставы.",
      colonist: "Колонист: знание сельского хозяйства и фуражировки, шанс покупать припасы дешевле; городская жизнь приносит неприятности.",
      deprived: "Обделённый: связи среди торговой аристократии и пятикратные стартовые сбережения; выберите две серьёзные неприятности.",
      savage: "Дикарь: охота, выживание и добыча провианта; ограниченный выбор специальностей и осложнения в социальных ситуациях.",
      reconstructed: "Перекроенный: криминальные связи, юриспруденция и обман; подчинение властям и риск встреч с бывшими подельниками.",
      remnant: "Останец: запас удачи 3 и стойкость; смута растёт быстрее, социальные конфликты осложнены.",
      augur: "Авгур: гадание и убеждение; нет меток удачи, а смута растёт быстрее.",
      gambler: "Игрок: азартные игры и побег; долги, пари и кредиторы регулярно создают проблемы.",
      champion: "Чемпион: переговоры и связи элит; старые травмы и вызовы на соревнования могут навредить.",
      writer: "Щелкопёр: слежка, сбор сведений и убедительное письмо; внимание властей и неприятности после развлечений.",
      artist: "Артист: мирное урегулирование социальных конфликтов и связи в богеме; две раны до смерти и недоброжелатели.",
      hard_worker: "Трудяга: +2d6 в переговорах с начальством; только механик или навигатор, четвёртая рана смертельна.",
      sleeper: "Спящий: скрытая агентская способность после ранения; периодические исчезновения и ограниченные связи.",
      defect: "Дефект: военная подготовка даёт преимущество в тактике и спецоборудовании; знакомые в армии могут предлагать опасные сделки.",
      slave: "Невольник: +2 преимущества при чтении намерений, маскировке и адаптации к иерархии; +2 осложнения при демонстрации силы, не может быть капитаном и начинает без денег.",
    },
    merit: {
      stress_resistant: "Стойкость к стрессу и панике.",
      erudite: "Широкие теоретические знания в самых разных областях.",
      charismatic: "Легко располагает собеседников и управляет впечатлением.",
      connections: "Связи, помощь и нужная информация в портах.",
      famous: "Известность открывает двери и приносит помощь или скидки.",
      agile: "Ловкость помогает уклоняться, ловить и действовать незаметно.",
      strong: "Выдающаяся сила; помогает при подъёме, переноске и силовых действиях.",
      taste: "Эстетическое чутьё, полезное в торговле и оценке произведений.",
      manners: "Безупречный этикет и поведение в высшем свете.",
      trader: "Торговая хватка помогает оценивать сделки и избегать невыгодных.",
      prepared: "Запасливость: нужные мелочи и инструменты часто оказываются под рукой.",
      buoyant: "Не тонет без дополнительного груза.",
      stealthy: "Скрытность помогает затеряться и остаться незамеченным.",
      enduring: "Выносливость к лишениям, болезням и недосыпу.",
      intuitive: "Интуиция предупреждает об опасностях и удачных возможностях.",
      empathetic: "Понимание эмоций и мотивов помогает в непростых ситуациях.",
    },
    flaw: {
      addiction: "Химическая зависимость управляет поведением и требует регулярного внимания.",
      cruel: "Склонность к жестокости осложняет отношения и провоцирует вред окружающим.",
      apathetic: "Апатия мешает действовать и включаться в происходящее.",
      schizophrenia: "Галлюцинации и собственная альтернативная реальность влияют на решения.",
      paranoid: "Паранойя заставляет видеть угрозы и осложняет доверие.",
      greedy: "Жадность мешает тратить ресурсы и делиться.",
      sex_addiction: "Навязчивое сексуальное поведение осложняет общение и сделки.",
      distracted: "Рассеянность приводит к ошибкам и дополнительным расходам.",
      overconfident: "Самоуверенность мешает принимать предупреждения и компромиссы.",
      unhealthy: "Подорванное здоровье усиливает последствия нагрузок и травм.",
      injury: "Заметная старая травма мешает жить и влияет на отношение окружающих.",
      forgetful: "Забывчивость приводит к потере вещей, денег и важных договорённостей.",
      insensitive: "Нарушение чувств и коммуникативных навыков осложняет взаимодействие.",
      indecisive: "Нерешительность мешает действовать в ситуации нехватки времени.",
      kleptomaniac: "Клептомания ведёт к непроизвольному присвоению чужих вещей.",
      notoriety: "Нежелательная известность привлекает внимание и создаёт проблемы.",
    },
    hiring: {
      dance: "Танец на собеседовании: кооператив вдвое экономит на танцевальных салонах.",
      tale: "Чудовищная байка: раз в три встречи продажная история стоимостью d6 × 1 000 ог.",
      bar: "Поход в бар: нет похмелья и штрафов от посещения дурманных притонов.",
      checkers: "Шашки на контракт: +1 кость в азартных играх.",
      pitiful: "Жалкий вид: раз в две встречи в крупном порту можно выманить d6 × 500 ог. у фонда.",
      letters: "Рекомендательные письма: профессионально подделывает почерк и печати.",
      bomb: "Самодельная бомба: всегда имеет преимущество при блефе.",
      punctual: "Единственный, кто не опоздал: преимущество при организации подстав.",
      kerwetka: "Ручная керветка благородных кровей всегда при персонаже.",
      ate: "Съел пресс-папье и запил стекломоем: яды действуют только в половине случаев.",
      charming: "Неотразимость: умеет рассказывать шутки и при удаче гипнотизировать людей.",
    },
    reputation: {
      profiteers: "Рвачи: преимущество в торге за оплату задач; законники могут быть настроены хуже; половина заказа авансом.",
      hunters: "Охотники: преимущество в поиске и преследовании, дополнительный успех при отступлении; заказчики назначают штрафы за невыполнение.",
      purists: "Чистоплюи: преимущество при взаимодействии с законопослушными; осложнение в сделках с негодяями; добропорядочный заказчик даст второй шанс.",
      smart: "Умники: преимущество при осторожных и сложных действиях, осложнение при поспешных; часть оплаты — редкости или информация.",
      daredevils: "Сорвиголовы: две общие метки удачи за встречу; осложнение при осторожных действиях; риск странных или неоплаченных заказов.",
      ordinary: "Заурядности: преимущество в ожидаемых действиях, осложнение при импровизации; средняя цена и новый похожий заказ.",
    },
    memory: {
      rescue: "Чудесное спасение: кого или что вы спасли, чем обязаны спасителю и какая опасность осталась?",
      lost_profit: "Упущенная выгода: кто был контрагентом, куда исчезли деньги и какие последствия остались?",
      scandal: "Публичный скандал: с кем вы оказались в центре шума и кто затаил обиду?",
      secret: "Ужасная тайна: какую катастрофу вы вызвали, кто знает правду и кто помогает её скрывать?",
      fame: "Пять токков славы: за что вас прославили, кто помог, какие связи и недоброжелатели появились?",
      blood: "Кровь и смерть: какая бойня изменила вас, кого вы вините и какие детали преследуют?",
    },
    shipMerit: {
      large_hold: "Вместительный трюм: бонус к объёму +d6 × 100 стаунтов (укажите выпавшее значение).",
      unremarkable: "Непримечательность: в половине случаев судно не опознают случайные свидетели.",
      quiet: "Шумоизоляция: преимущество при попытках остаться незамеченными.",
      low_profile: "Низкий профиль: преимущество при попытках избежать дистанционной атаки.",
      strong_hull: "Прочный корпус: +2 к запасу прочности.",
      seaworthy: "Ходкость: преимущество при погоне и уходе от преследования.",
    },
    shipFlaw: {
      clumsy: "Неповоротливость: осложнение в ситуациях, требующих манёвренности.",
      cursed: "Проклятие: на судне бесчинствуют блазни; смута не снижается ниже 5.",
      worn_hull: "Изношенный корпус: первый полученный полом действует с дополнительным осложнением.",
      worn_engine: "Изношенное двигло не может работать в форсированном режиме.",
      stolen: "Судно ворованное: прежний владелец хочет вернуть его.",
      vermin: "Паразиты на борту: надоедливы, вредоносны и, возможно, разумны.",
    },
    equipment: {
      passenger: "Пассажирский отсек занимает 420 стаунтов трюма.",
      premium: "Пассажирский отсек премиум-класса занимает 525 стаунтов трюма.",
      diving: "Погружной отсек занимает 800 стаунтов трюма.",
      slagthrower: "Шлакомёт установлен на станине; работает, пока есть топливо.",
      harpoon: "Гарпунная пушка требует приобретаемых отдельно гарпунов.",
      water_cannon: "Водомёт подаёт мощную струю воды.",
      winch: "Моторная лебёдка притягивает объекты и сочетается с гарпунной пушкой.",
      sandshoes: "Пескоходы позволяют самостоятельно сниматься с морских отмелей.",
      tow: "Буксировочная оснастка позволяет надёжно тащить плавучие объекты.",
    },
  };

  function parseInteger(value, label, min, max = Number.MAX_SAFE_INTEGER) {
    const text = String(value ?? "").trim();
    if (!/^(0|[1-9]\d*)$/.test(text)) {
      throw new Error(`${label}: введите целое неотрицательное число.`);
    }

    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      throw new Error(`${label}: допустимо значение от ${min} до ${max}.`);
    }
    return parsed;
  }

  function parseCollisionInput(diceValue, deductionValue) {
    return {
      diceCount: parseInteger(diceValue, "Количество костей", 4),
      preDeduction: parseInteger(deductionValue, "Вычет шестёрок", 0),
    };
  }

  function calculatePensionBalance(balanceValue, depositValue) {
    const balance = parseInteger(balanceValue, "Пенсионный счёт", 0);
    const deposit = parseInteger(depositValue, "Сумма пополнения", 1);
    const updatedBalance = balance + deposit;
    if (!Number.isSafeInteger(updatedBalance)) {
      throw new Error("Пенсионный счёт: сумма превышает допустимое значение.");
    }
    return updatedBalance;
  }

  function validateMoney(value, label) {
    return parseInteger(value, label, 0);
  }

  function resolveCollision(dice, preDeduction) {
    if (!Array.isArray(dice) || dice.length < 4 || dice.some((value) =>
      !Number.isInteger(value) || value < 1 || value > 6
    )) {
      throw new Error("Roll20 вернул некорректный набор костей.");
    }

    const deduction = parseInteger(preDeduction, "Вычет шестёрок", 0);
    const rawSixes = dice.filter((value) => value === 6).length;
    const remaining = rawSixes - deduction;
    const outcome = remaining >= 2 ? "success" : remaining === 1 ? "partial" : "failure";
    return { rawSixes, remaining, outcome };
  }

  function describe(category, value) {
    return (DESCRIPTIONS[category] && DESCRIPTIONS[category][value]) || "";
  }

  function describeMany(category, values) {
    return values.map((value) => describe(category, value)).filter(Boolean).join(" ");
  }

  function calculateShip({
    shipClass,
    crewCount,
    forced,
    illumination,
    unrest,
    cargoLoad,
    holdBonus,
    merits,
    compartments,
    damage,
  }) {
    const classIndex = parseInteger(shipClass, "Класс судна", 0, SHIP_CLASSES.length - 1);
    const ship = SHIP_CLASSES[classIndex];
    const crew = parseInteger(crewCount, "Число матросов", 0, ship.crew);
    const seaUnrest = parseInteger(unrest, "Морская смута", 0);
    const load = parseInteger(cargoLoad, "Груз в трюме", 0);
    const hasLargeHold = merits.includes("large_hold");
    const expansion = hasLargeHold
      ? parseInteger(holdBonus || "0", "Бонус вместимости", 0, 600)
      : 0;
    if (expansion > 0 && expansion % 100 !== 0) {
      throw new Error("Бонус вместимости: укажите сумму, кратную 100 стаунтам.");
    }
    if (forced && illumination) {
      throw new Error("Форсаж и иллюминация не включаются одновременно.");
    }

    const doubledCrew = crew * 2;
    const crewBand = doubledCrew > ship.crew
      ? "above-half"
      : doubledCrew === ship.crew ? "half" : "below-half";
    const belowHalf = crewBand === "below-half";
    const fuel = ship.fuel * (belowHalf ? 2 : 1) * (forced || illumination ? 2 : 1);
    let provisions = ship.provisions * (crewBand === "above-half" ? 1 : 0.5);
    if (forced && !belowHalf) provisions *= 0.5;

    const compartmentSpace = compartments.reduce((sum, item) => {
      const size = { passenger: 420, premium: 525, diving: 800 }[item] || 0;
      return sum + size;
    }, 0);
    const holdCapacity = ship.hold + expansion;
    const cargoOccupied = load + compartmentSpace;
    const durability = ship.durability + (merits.includes("strong_hull") ? 2 : 0);
    const damaged = damage.filter(Boolean).length;
    const crewProgress = Math.min(100, Math.floor((crew / ship.crew) * 100));
    const cargoProgress = Math.min(100, Math.floor((cargoOccupied / holdCapacity) * 100));

    return {
      classIndex,
      crew,
      crewCapacity: ship.crew,
      crewBand,
      crewProgress,
      crewLow: belowHalf,
      speed: (forced ? 2 : 1) * (belowHalf ? 0.5 : 1),
      fuel,
      provisions,
      unrestPerSector: illumination ? 0.5 : 1,
      unrest: seaUnrest,
      unrestProgress: Math.min(25, seaUnrest),
      unrestHigh: seaUnrest >= 20,
      stanines: ship.stanines,
      holdCapacity,
      cargoOccupied,
      cargoProgress,
      durability,
      damaged,
      damageOverLimit: damaged > durability,
      requiresMechanicCheck: Boolean(forced),
      status: [
        cargoOccupied > holdCapacity && "Груз + спец. отсеки превышают вместимость трюма.",
        hasLargeHold && expansion === 0 && "(укажите результат d6 × 100)",
      ].filter(Boolean).join(" "),
    };
  }

  return {
    SHIP_CLASSES,
    parseCollisionInput,
    resolveCollision,
    calculatePensionBalance,
    validateMoney,
    calculateShip,
    describe,
    describeMany,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Ouw25Rules;
}

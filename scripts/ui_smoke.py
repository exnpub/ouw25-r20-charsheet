from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def main():
    html = (ROOT / "dist" / "ouw25.html").read_text()
    css = (ROOT / "dist" / "ouw25.css").read_text()
    page_html = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<style>{css}</style>"
        "<style>.charsheet h2, .charsheet h3, .charsheet h4, "
        ".charsheet label, .charsheet .sheet-inline-label { font-weight: bold !important; }"
        ".charsheet label { display: block !important; align-items: flex-start !important; }</style>"
        f"</head><body><div class='charsheet'>{html}</div></body></html>"
    )

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 755, "height": 1200})
        page.set_content(page_html)

        personal_panels = page.locator(".sheet-panel-personal")
        assert personal_panels.first.is_visible()
        assert personal_panels.nth(1).is_visible()
        assert not page.locator(".sheet-panel-cooperative").is_visible()
        assert page.locator("input[name='attr_sheet_mode'][value='merchant']").is_checked()
        assert page.locator(".sheet-brand-banner").evaluate(
            "(element) => getComputedStyle(element).backgroundColor"
        ) == "rgb(138, 43, 226)"
        assert page.locator(".sheet-app").evaluate(
            "(element) => getComputedStyle(element).backgroundImage"
        ) == 'url("https://i.imgur.com/Z28BrcA.jpeg")'
        assert page.locator(".sheet-inline-fields").first.evaluate(
            "(element) => getComputedStyle(element).gridTemplateColumns.split(' ').length"
        ) == 2
        assert page.locator(".sheet-inline-fields").first.evaluate(
            "(element) => parseFloat(getComputedStyle(element).columnGap)"
        ) > 16
        assert page.locator(".sheet-money-field").evaluate(
            "(element) => element.nextElementSibling.classList.contains('sheet-subpanel')"
        )
        assert page.locator("select[name='attr_past']").evaluate(
            "(element) => element.closest('.sheet-card-field').querySelector('label').nextElementSibling.classList.contains('sheet-card-description')"
        )
        assert page.locator("input[name='attr_pocket_money']").evaluate(
            "(element) => getComputedStyle(element).width"
        ) == "288px"
        assert page.locator("input[name='attr_big_dream']").evaluate(
            "(element) => element.getBoundingClientRect().width"
        ) > 500
        assert page.locator(".sheet-panel-personal h3").first.evaluate(
            "(element) => getComputedStyle(element).fontWeight"
        ) == "400"
        assert page.locator(".sheet-panel-personal label.sheet-field-inline").first.evaluate(
            "(element) => getComputedStyle(element).fontWeight"
        ) == "400"
        specialty_label = page.locator("select[name='attr_specialty']").locator("xpath=..")
        assert specialty_label.evaluate(
            "(element) => getComputedStyle(element).display"
        ) == "flex"
        assert specialty_label.evaluate(
            "(element) => getComputedStyle(element).alignItems"
        ) == "center"
        assert specialty_label.evaluate(
            "(element) => Math.abs((() => {"
            "const range = document.createRange();"
            "range.selectNodeContents(element.firstChild);"
            "const text = range.getBoundingClientRect();"
            "const select = element.querySelector('select').getBoundingClientRect();"
            "return text.top + text.height / 2 - (select.top + select.height / 2);"
            "})())"
        ) <= 2
        assert page.locator(".sheet-mode-option").first.evaluate(
            "(element) => getComputedStyle(element).fontWeight"
        ) == "400"
        assert page.locator(".sheet-meter-group label").first.evaluate(
            "(element) => getComputedStyle(element).fontWeight"
        ) == "400"
        assert page.locator(".sheet-app").evaluate(
            "(element) => {"
            "const heading = document.createElement('h4');"
            "element.appendChild(heading);"
            "return getComputedStyle(heading).fontWeight;"
            "}"
        ) == "400"

        page.locator("select[name='attr_past']").select_option("hard_worker")
        assert page.locator(".sheet-wound-fourth").is_visible()
        page.locator("select[name='attr_past']").select_option("")
        assert not page.locator(".sheet-wound-fourth").is_visible()
        wound_label = page.locator(".sheet-wounds:not(.sheet-ship-damage) label").first
        assert wound_label.locator("span").evaluate(
            "(element) => getComputedStyle(element).display"
        ) == "none"
        assert wound_label.evaluate(
            "(element) => getComputedStyle(element).borderWidth"
        ) == "0px"
        assert page.locator(".sheet-wounds:not(.sheet-ship-damage)").evaluate(
            "(element) => {"
            "const centers = Array.from(element.children)"
            ".filter((child) => getComputedStyle(child).display !== 'none')"
            ".map((child) => { const rect = child.getBoundingClientRect(); return rect.top + rect.height / 2; });"
            "return Math.max(...centers) - Math.min(...centers);"
            "}"
        ) <= 1

        page.locator("input[name='attr_sheet_mode'][value='cooperative']").check()
        assert page.locator(".sheet-panel-cooperative").is_visible()
        assert page.locator(".sheet-panel-cooperative h2").first.evaluate(
            "(element) => getComputedStyle(element).fontWeight"
        ) == "400"
        assert all(
            not personal_panels.nth(index).is_visible()
            for index in range(personal_panels.count())
        )
        assert page.locator("input[name='attr_cooperative_budget']").evaluate(
            "(element) => getComputedStyle(element).width"
        ) == "288px"
        assert not page.locator(".sheet-cooperative-ship").is_visible()
        assert page.locator(".sheet-cooperative-attributes").is_visible()
        assert not page.locator(".sheet-cooperative-contracts").is_visible()
        assert page.locator(".sheet-cooperative-tabs").evaluate(
            "(element) => getComputedStyle(element).flexDirection"
        ) == "row"
        assert page.locator(".sheet-cooperative-tabs").evaluate(
            "(element) => {"
            "const tabs = Array.from(element.children).map((child) => child.getBoundingClientRect());"
            "return Math.max(...tabs.map((tab) => tab.top)) - Math.min(...tabs.map((tab) => tab.top)) <= 1;"
            "}"
        )
        assert page.locator(".sheet-cooperative-tabs").evaluate(
            "(element) => {"
            "const panel = element.closest('.sheet-panel-cooperative');"
            "return element.scrollWidth <= panel.clientWidth && "
            "element.getBoundingClientRect().right <= panel.getBoundingClientRect().right;"
            "}"
        )
        for tab_panel in page.locator(".sheet-cooperative-tab-panel").all():
            assert tab_panel.evaluate(
                "(element) => getComputedStyle(element).minHeight"
            ) == "200px"
        assert page.locator(".sheet-cooperative-cards").evaluate(
            "(element) => getComputedStyle(element).gridTemplateColumns.split(' ').length"
        ) == 2
        assert page.locator(".sheet-cooperative-cards").evaluate(
            "(element) => parseFloat(getComputedStyle(element).columnGap)"
        ) > 16
        page.locator("input[name='attr_cooperative_budget']").fill("1234567")
        page.locator("input[name='attr_cooperative_tab'][value='contracts']").check()
        assert page.locator("input[name='attr_cooperative_budget']").input_value() == "1234567"
        assert not page.locator(".sheet-cooperative-attributes").is_visible()
        assert page.locator(".sheet-cooperative-contracts").is_visible()
        assert not page.locator(".sheet-cooperative-ship").is_visible()
        assert page.locator(".sheet-panel-cooperative").is_visible()
        assert page.locator("input[name='attr_sheet_mode'][value='cooperative']").is_checked()
        assert all(
            not personal_panels.nth(index).is_visible()
            for index in range(personal_panels.count())
        )
        assert page.locator(".repeating_contracts .sheet-contract-row").evaluate(
            "(element) => getComputedStyle(element).gridTemplateColumns.split(' ').length"
        ) == 4
        assert page.locator(".sheet-contract-header [role='columnheader']").all_text_contents() == [
            "Что", "Куда", "Когда", "Стоимость"
        ]
        assert page.locator(".repeating_contracts .sheet-contract-row").evaluate(
            "(element) => {"
            "const fields = Array.from(element.children).map((child) => child.getBoundingClientRect());"
            "return Math.max(...fields.map((field) => field.top)) - "
            "Math.min(...fields.map((field) => field.top)) <= 1;"
            "}"
        )
        assert page.locator(".repeating_contracts").evaluate(
            "(element) => {"
            "const rows = document.createElement('div');"
            "rows.className = 'repcontainer';"
            "const first = document.createElement('div');"
            "const second = document.createElement('div');"
            "first.className = second.className = 'repitem';"
            "rows.append(first, second);"
            "element.append(rows);"
            "const margin = getComputedStyle(second).marginTop;"
            "rows.remove();"
            "return margin;"
            "}"
        ) == "12px"
        contract_fields = [
            "attr_contract_what",
            "attr_contract_destination",
            "attr_contract_when",
            "attr_contract_cost",
        ]
        for field in contract_fields:
            control = page.locator(f"input[name='{field}']")
            assert control.is_visible()
            assert control.input_value() == ""
        page.locator("input[name='attr_contract_what']").fill("Провиант")
        page.locator("input[name='attr_contract_destination']").fill("Порт Тихой воды")
        page.locator("input[name='attr_contract_when']").fill("До следующего прилива")
        page.locator("input[name='attr_contract_cost']").fill("1200")
        for textarea in page.locator(".sheet-app textarea").all():
            assert textarea.evaluate(
                "(element) => getComputedStyle(element).margin"
            ) == "8px"
            assert textarea.evaluate(
                "(element) => getComputedStyle(element).height"
            ) == "60px"
        page.locator("input[name='attr_cooperative_tab'][value='attributes']").check()
        assert page.locator(".sheet-cooperative-attributes").is_visible()
        assert not page.locator(".sheet-cooperative-ship").is_visible()
        assert page.locator("input[name='attr_contract_what']").input_value() == "Провиант"
        assert page.locator("input[name='attr_contract_destination']").input_value() == "Порт Тихой воды"
        assert page.locator("input[name='attr_contract_when']").input_value() == "До следующего прилива"
        assert page.locator("input[name='attr_contract_cost']").input_value() == "1200"

        page.locator("input[name='attr_cooperative_tab'][value='ship']").check()
        assert page.locator(".sheet-cooperative-ship").is_visible()
        assert not page.locator(".sheet-cooperative-attributes").is_visible()
        assert not page.locator(".sheet-cooperative-contracts").is_visible()
        assert page.locator(".sheet-ship-quality-columns").evaluate(
            "(element) => getComputedStyle(element).gridTemplateColumns.split(' ').length"
        ) == 2
        assert page.locator(".sheet-ship-quality-columns").evaluate(
            "(element) => {"
            "const groups = Array.from(element.children).map((child) => child.getBoundingClientRect());"
            "return groups[0].left < groups[1].left && "
            "Math.abs(groups[0].top - groups[1].top) <= 1;"
            "}"
        )
        assert page.locator(".sheet-ship-quality-group h3").all_text_contents() == [
            "Достоинства", "Недостатки"
        ]
        assert page.locator(".sheet-ship-quality-list select").count() == 8
        assert page.locator("label:has(select[name^='attr_ship_merit_'])").count() == 0
        assert page.locator("label:has(select[name^='attr_ship_flaw_'])").count() == 0
        for quality_list in page.locator(".sheet-ship-quality-list").all():
            assert quality_list.evaluate(
                "(element) => getComputedStyle(element).gridTemplateColumns.split(' ').length"
            ) == 1

        assert page.locator(".sheet-ship-stats .sheet-stat").count() == 5
        assert page.locator(".sheet-ship-stats").evaluate(
            "(element) => getComputedStyle(element).gridTemplateColumns.split(' ').length"
        ) == 5
        assert page.locator(".sheet-ship-stats").evaluate(
            "(element) => {"
            "const parent = element.parentElement.getBoundingClientRect();"
            "const stats = element.getBoundingClientRect();"
            "return Math.abs(parent.width - stats.width) <= 1 && "
            "stats.right <= parent.right + 1;"
            "}"
        )
        assert page.locator(".sheet-ship-stats").evaluate(
            "(element) => {"
            "const cards = Array.from(element.children).map((child) => child.getBoundingClientRect());"
            "return Math.max(...cards.map((card) => card.top)) - "
            "Math.min(...cards.map((card) => card.top)) <= 1;"
            "}"
        )
        assert page.locator(".sheet-ship-resources").evaluate(
            "(element) => getComputedStyle(element).gridTemplateColumns.split(' ').length"
        ) == 4
        assert page.locator(".sheet-ship-resources").evaluate(
            "(element) => getComputedStyle(element).columnGap"
        ) == "15px"
        assert page.locator(".sheet-ship-resources").evaluate(
            "(element) => {"
            "const parent = element.parentElement.getBoundingClientRect();"
            "const resources = element.getBoundingClientRect();"
            "const cards = Array.from(element.children).map((child) => child.getBoundingClientRect());"
            "return Math.abs(parent.width - resources.width) <= 1 && "
            "Math.max(...cards.map((card) => card.top)) - "
            "Math.min(...cards.map((card) => card.top)) <= 1;"
            "}"
        )
        assert page.locator(".sheet-ship-resources").evaluate(
            "(element) => Array.from(element.children).map((resource) => resource.firstChild.textContent.trim())"
        ) == ["Матросы", "Провиант, мер", "Топливо, стаунтов", "Смута"]
        assert page.locator(".sheet-ship-stats .sheet-stat").first.evaluate(
            "(element) => {"
            "const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);"
            "const valueSize = parseFloat(getComputedStyle(element.querySelector('strong')).fontSize);"
            "const labelSize = parseFloat(getComputedStyle(element.querySelector(':scope > span')).fontSize);"
            "return Math.abs(valueSize - rootSize * 1.725) < 0.1 && "
            "Math.abs(labelSize - rootSize * 0.85) < 0.1;"
            "}"
        )
        assert not page.locator(".sheet-hold-bonus").is_visible()
        page.locator("select[name='attr_ship_merit_1']").select_option("large_hold")
        assert page.locator(".sheet-hold-bonus").is_visible()
        assert page.locator(".sheet-hold-bonus").evaluate(
            "(element) => {"
            "const parent = element.parentElement.getBoundingClientRect();"
            "const bonus = element.getBoundingClientRect();"
            "return Math.abs(parent.width - bonus.width) <= 1 && "
            "getComputedStyle(element).gridColumn === '1 / -1';"
            "}"
        )

        page.locator("select[name='attr_ship_class']").select_option("2")
        assert page.locator(".sheet-stanine-3").is_visible()
        assert page.locator(".sheet-stanine-4").is_visible()
        assert not page.locator(".sheet-stanine-5").is_visible()

        damage_label = page.locator(".sheet-ship-damage label").first
        assert page.locator(".sheet-ship-damage h3").inner_text() == "Поломы:"
        assert damage_label.locator("span").evaluate(
            "(element) => getComputedStyle(element).display"
        ) == "none"
        assert page.locator(".sheet-ship-damage").evaluate(
            "(element) => {"
            "const centers = Array.from(element.children)"
            ".filter((child) => getComputedStyle(child).display !== 'none')"
            ".map((child) => { const rect = child.getBoundingClientRect(); return rect.top + rect.height / 2; });"
            "return Math.max(...centers) - Math.min(...centers);"
            "}"
        ) <= 1
        assert page.locator(".sheet-ship-damage").evaluate(
            "(element) => element.scrollWidth <= element.clientWidth"
        )
        page.locator("select[name='attr_ship_merit_2']").select_option("strong_hull")
        page.locator("select[name='attr_ship_class']").select_option("6")
        assert page.locator(".sheet-ship-damage label:visible").count() == 11
        assert page.locator(".sheet-ship-damage").evaluate(
            "(element) => {"
            "const centers = Array.from(element.children)"
            ".filter((child) => getComputedStyle(child).display !== 'none')"
            ".map((child) => { const rect = child.getBoundingClientRect(); return rect.top + rect.height / 2; });"
            "return Math.max(...centers) - Math.min(...centers);"
            "}"
        ) <= 1
        low_crew = page.locator("input[name='attr_crew_low']")
        low_crew.evaluate("(element) => { element.checked = true; }")
        assert page.locator("input[name='attr_crew_count']").evaluate(
            "(element) => getComputedStyle(element).color"
        ) == "rgb(179, 38, 30)"

        illumination_label = page.locator(".sheet-tooltip-toggle").nth(1)
        illumination_label.hover()
        assert illumination_label.evaluate(
            "(element) => getComputedStyle(element, '::after').content"
        ) != "none"
        illumination_label.locator("input").check()
        illumination_label.hover()
        assert illumination_label.evaluate(
            "(element) => getComputedStyle(element, '::after').content"
        ) == "none"
        forced_label = page.locator(".sheet-tooltip-toggle").first
        forced_label.hover()
        assert forced_label.evaluate(
            "(element) => getComputedStyle(element, '::after').content"
        ) != "none"
        forced_label.locator("input").check()
        forced_label.hover()
        assert forced_label.evaluate(
            "(element) => getComputedStyle(element, '::after').content"
        ) == "none"

        assert page.locator(".repeating_contracts").count() == 1

        browser.close()

    print("UI smoke test passed")


if __name__ == "__main__":
    main()

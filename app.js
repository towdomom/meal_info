var API_BASE = "https://open.neis.go.kr/hub";
var API_KEY = "sample";
var DEFAULT_OFFICE_CODE = "D10";
var DEFAULT_SCHOOL_NAME = "함지고등학교";
var DEFAULT_SCHOOL_CODE = "7240273";
var FIXED_SCHOOLS = {
    "함지고등학교": { officeCode: "D10", schoolCode: "7240273" },
    "칠곡중학교": { officeCode: "D10", schoolCode: "7261015" },
    "수남중학교": { officeCode: "S10", schoolCode: "9091210" }
};

var officeCodeEl = null;
var schoolNameEl = null;
var mealDateEl = null;
var searchBtnEl = null;
var themeToggleBtnEl = null;
var statusTextEl = null;
var mealInfoEl = null;
var mealDateFlatpickr = null;

function initializeApp() {
    officeCodeEl = document.getElementById("officeCode");
    schoolNameEl = document.getElementById("schoolName");
    mealDateEl = document.getElementById("mealDate");
    searchBtnEl = document.getElementById("searchBtn");
    themeToggleBtnEl = document.getElementById("themeToggleBtn");
    statusTextEl = document.getElementById("statusText");
    mealInfoEl = document.getElementById("mealInfo");

    if (!officeCodeEl || !schoolNameEl || !mealDateEl || !searchBtnEl || !statusTextEl || !mealInfoEl) {
        return;
    }

    applyInitialValues();
    applySavedTheme();
    initMealDatePicker();

    searchBtnEl.addEventListener("click", function () {
        fetchMealInfo();
    });

    schoolNameEl.addEventListener("change", function () {
        syncOfficeBySelectedSchool();
        fetchMealInfo();
    });

    if (themeToggleBtnEl) {
        themeToggleBtnEl.addEventListener("click", function () {
            toggleTheme();
        });
    }

    fetchMealInfo();
}

function initMealDatePicker() {
    if (typeof flatpickr === "undefined" || !mealDateEl) {
        return;
    }
    var todayStr = toInputDate(new Date());
    if (!mealDateEl.value || String(mealDateEl.value).trim() === "") {
        mealDateEl.value = todayStr;
    }

    var fetchOnCalendarChangeAllowed = false;
    var koLocale = typeof flatpickr !== "undefined" && flatpickr.l10ns && flatpickr.l10ns.ko
        ? flatpickr.l10ns.ko
        : undefined;

    function setDateFieldExpanded(fp, isOpen) {
        var target = fp && fp.altInput ? fp.altInput : mealDateEl;
        target.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    mealDateFlatpickr = flatpickr(mealDateEl, {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "Y년 n월 j일 (l)",
        altInputClass: "form-control rounded-3 border-slate-200 shadow-sm meal-date-trigger",
        locale: koLocale,
        defaultDate: mealDateEl.value || todayStr,
        allowInput: false,
        disableMobile: true,
        clickOpens: true,
        onOpen: function (_dates, _str, fp) {
            setDateFieldExpanded(fp, true);
        },
        onClose: function (_dates, _str, fp) {
            setDateFieldExpanded(fp, false);
        },
        onChange: function () {
            if (!fetchOnCalendarChangeAllowed) {
                return;
            }
            fetchMealInfo();
        },
        onReady: function (_dates, _str, fp) {
            var alt = fp.altInput;
            if (alt) {
                alt.setAttribute("role", "button");
                alt.setAttribute("aria-haspopup", "dialog");
                alt.setAttribute("aria-expanded", "false");
                alt.setAttribute("aria-labelledby", "labelMealDate");
                alt.tabIndex = 0;
            }
            window.setTimeout(function () {
                fetchOnCalendarChangeAllowed = true;
            }, 0);
        }
    });
}

function applyInitialValues() {
    var today = new Date();
    mealDateEl.value = toInputDate(today);

    var savedOfficeCode = localStorage.getItem("meal.officeCode");
    var savedSchoolName = localStorage.getItem("meal.schoolName");

    officeCodeEl.value = savedOfficeCode || DEFAULT_OFFICE_CODE;
    schoolNameEl.value = savedSchoolName || DEFAULT_SCHOOL_NAME;
    syncOfficeBySelectedSchool();
}

function toInputDate(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
}

function toYmdString(inputDate) {
    return (inputDate || "").replace(/-/g, "");
}

function syncOfficeBySelectedSchool() {
    var selected = (schoolNameEl && schoolNameEl.value) ? schoolNameEl.value.trim() : "";
    var fixed = FIXED_SCHOOLS[selected];
    if (fixed && fixed.officeCode) {
        officeCodeEl.value = fixed.officeCode;
    }
}

function applySavedTheme() {
    var savedTheme = localStorage.getItem("meal.theme");
    var isDark = savedTheme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.body.classList.toggle("dark", isDark);
    updateThemeButtonText(isDark);
}

function toggleTheme() {
    var isDark = document.body.classList.toggle("dark");
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("meal.theme", isDark ? "dark" : "light");
    updateThemeButtonText(isDark);
}

function updateThemeButtonText(isDark) {
    if (!themeToggleBtnEl) {
        return;
    }
    themeToggleBtnEl.textContent = isDark ? "☀️ 라이트모드" : "🌙 다크모드";
}

async function fetchMealInfo() {
    var officeCode = officeCodeEl.value;
    var schoolName = (schoolNameEl.value || "").trim();
    var selectedDate = mealDateEl.value;

    if (!schoolName) {
        schoolName = DEFAULT_SCHOOL_NAME;
        schoolNameEl.value = schoolName;
    }

    localStorage.setItem("meal.officeCode", officeCode);
    localStorage.setItem("meal.schoolName", schoolName);

    setStatus("급식 정보를 조회하는 중...");
    clearMealInfo();

    try {
        var schoolCode = getFixedSchoolCode(officeCode, schoolName);
        if (!schoolCode) {
            schoolCode = await fetchSchoolCodeByName(officeCode, schoolName);
        }
        if (!schoolCode) {
            setStatus("학교명을 찾을 수 없습니다. 정확한 학교명을 입력해주세요.");
            return;
        }

        var ymd = toYmdString(selectedDate);
        var meals = await fetchMealsAsXml(officeCode, schoolCode, ymd);

        if (!meals.length) {
            setStatus((schoolName || "선택한 학교") + " - 해당 날짜의 급식 정보가 없습니다.");
            return;
        }

        var viewSchoolName = meals[0].SCHUL_NM || schoolName || "선택한 학교";
        setStatus(viewSchoolName + " - 급식 정보");
        renderMeals(meals);
    } catch (error) {
        setStatus("조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
}

async function fetchSchoolCodeByName(officeCode, schoolName) {
    var url = API_BASE + "/schoolInfo?Type=json&KEY=" + encodeURIComponent(API_KEY)
        + "&pIndex=1&pSize=5&ATPT_OFCDC_SC_CODE=" + encodeURIComponent(officeCode)
        + "&SCHUL_NM=" + encodeURIComponent(schoolName);

    var response = await fetch(url);
    if (!response.ok) {
        throw new Error("School API request failed.");
    }

    var data = await response.json();
    var rows = data && data.schoolInfo && data.schoolInfo[1] && data.schoolInfo[1].row;
    if (!rows || !rows.length) {
        return "";
    }

    return rows[0].SD_SCHUL_CODE || "";
}

function getFixedSchoolCode(officeCode, schoolName) {
    var normalized = normalizeSchoolName(schoolName);
    var keys = Object.keys(FIXED_SCHOOLS);
    for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        var candidate = FIXED_SCHOOLS[key];
        if (normalizeSchoolName(key) === normalized && officeCode === candidate.officeCode) {
            return candidate.schoolCode;
        }
    }
    return "";
}

function normalizeSchoolName(name) {
    return (name || "").replace(/\s/g, "").toLowerCase();
}

async function fetchMealsAsXml(officeCode, schoolCode, ymd) {
    var url = API_BASE + "/mealServiceDietInfo?ATPT_OFCDC_SC_CODE=" + encodeURIComponent(officeCode)
        + "&SD_SCHUL_CODE=" + encodeURIComponent(schoolCode)
        + "&MLSV_YMD=" + encodeURIComponent(ymd);

    var response = await fetch(url);
    if (!response.ok) {
        throw new Error("Meal API request failed.");
    }

    var xmlText = await response.text();
    return parseMealRowsFromXml(xmlText);
}

function renderMeals(meals) {
    mealInfoEl.innerHTML = "";

    meals.forEach(function (meal) {
        var block = document.createElement("article");
        block.className = "meal-block card rounded-4 p-4 p-md-4 shadow-sm";

        var heading = document.createElement("div");
        heading.className = "d-flex flex-wrap align-items-baseline gap-2 mb-3";

        var title = document.createElement("h2");
        title.className = "meal-title h5 fw-bold mb-0 meal-type-name";
        title.textContent = meal.MMEAL_SC_NM || getMealTypeName(meal.MMEAL_SC_CODE);

        var calBadge = document.createElement("span");
        calBadge.className = "text-secondary fw-semibold small";
        calBadge.textContent = "(칼로리 " + formatCalorieForTitle(meal.CAL_INFO) + ")";

        heading.appendChild(title);
        heading.appendChild(calBadge);

        var meta = document.createElement("div");
        meta.className = "meal-meta";

        var nutritionLabel = document.createElement("h3");
        nutritionLabel.className = "h6 fw-semibold text-secondary mb-2";
        nutritionLabel.textContent = "영양 정보";

        meta.appendChild(nutritionLabel);
        meta.appendChild(buildNutritionTable(meal.NTR_INFO || ""));

        var originWrap = document.createElement("div");
        originWrap.className = "origin-wrap border-top border-2 border-secondary-subtle mt-4 pt-4";

        var originTitle = document.createElement("h3");
        originTitle.className = "h6 fw-semibold text-secondary mb-2";
        originTitle.textContent = "원산지";

        originWrap.appendChild(originTitle);
        originWrap.appendChild(buildOriginGrid(parseNutritionRows(meal.ORPLC_INFO || "")));

        meta.appendChild(originWrap);

        block.appendChild(heading);
        block.appendChild(buildMealMenuSection(meal.DDISH_NM || ""));
        block.appendChild(meta);
        mealInfoEl.appendChild(block);
    });
}

function buildMealMenuSection(ddishRaw) {
    var section = document.createElement("section");
    section.className = "meal-menu-section mb-4";

    var menuLabel = document.createElement("h3");
    menuLabel.className = "h6 fw-semibold text-secondary mb-2";
    menuLabel.textContent = "급식 메뉴";

    var listWrap = document.createElement("div");
    listWrap.className = "meal-dish-list row row-cols-1 row-cols-sm-2 g-2";
    listWrap.setAttribute("role", "list");

    var dishes = parseMealDishes(ddishRaw);
    if (!dishes.length) {
        var emptyCol = document.createElement("div");
        emptyCol.className = "col-12";
        var empty = document.createElement("p");
        empty.className = "text-secondary small fst-italic mb-0";
        empty.textContent = "등록된 메뉴가 없습니다.";
        emptyCol.appendChild(empty);
        listWrap.appendChild(emptyCol);
    } else {
        dishes.forEach(function (name) {
            var col = document.createElement("div");
            col.className = "col";
            col.setAttribute("role", "listitem");
            var item = document.createElement("div");
            item.className = "meal-dish-item rounded-3 border border-secondary-subtle px-3 py-2 shadow-sm small text-body lh-base";
            item.textContent = name;
            col.appendChild(item);
            listWrap.appendChild(col);
        });
    }

    section.appendChild(menuLabel);
    section.appendChild(listWrap);

    return section;
}

function parseMealDishes(raw) {
    var withBreaks = String(raw || "").replace(/<br\s*\/?>/gi, "\n");
    var lines = withBreaks.split(/\n/).map(function (line) {
        return line
            .replace(/\s*\(\d+(\.\d+)?\)\s*/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
    }).filter(Boolean);

    if (lines.length === 1 && lines[0].indexOf(",") !== -1) {
        lines = lines[0].split(/,\s*/).map(function (s) {
            return s.trim();
        }).filter(Boolean);
    }

    return lines;
}

function formatCalorieForTitle(calInfo) {
    if (!calInfo || String(calInfo).trim() === "") {
        return "-";
    }
    var s = String(calInfo).trim();
    s = s.replace(/^칼로리\s*[:\.]?\s*/i, "").trim();
    return s || "-";
}

function buildNutritionTable(ntrRaw) {
    var wrap = document.createElement("div");
    wrap.className = "table-responsive rounded-3 border border-secondary-subtle shadow-sm";

    var table = document.createElement("table");
    table.className = "table table-sm table-striped table-hover mb-0 align-middle";
    table.setAttribute("aria-label", "영양 정보");

    var thead = document.createElement("thead");
    thead.className = "table-light";
    var headRow = document.createElement("tr");
    var thName = document.createElement("th");
    thName.scope = "col";
    thName.className = "ps-3 py-2";
    thName.textContent = "항목";
    var thVal = document.createElement("th");
    thVal.scope = "col";
    thVal.className = "py-2";
    thVal.textContent = "함량·비고";
    headRow.appendChild(thName);
    headRow.appendChild(thVal);
    thead.appendChild(headRow);

    var tbody = document.createElement("tbody");

    var rows = parseNutritionRows(ntrRaw);
    if (!rows.length) {
        var trEmpty = document.createElement("tr");
        var tdEmpty = document.createElement("td");
        tdEmpty.colSpan = 2;
        tdEmpty.className = "text-secondary text-center py-3";
        tdEmpty.textContent = "영양 정보가 없습니다.";
        trEmpty.appendChild(tdEmpty);
        tbody.appendChild(trEmpty);
    } else {
        rows.forEach(function (row) {
            var tr = document.createElement("tr");
            var tdName = document.createElement("td");
            tdName.className = "ps-3 text-nowrap fw-medium";
            tdName.textContent = row.name;
            var tdVal = document.createElement("td");
            tdVal.textContent = row.value || "—";
            tr.appendChild(tdName);
            tr.appendChild(tdVal);
            tbody.appendChild(tr);
        });
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);

    return wrap;
}

function buildOriginGrid(rows) {
    var wrap = document.createElement("div");
    wrap.className = "origin-items row row-cols-1 row-cols-sm-2 row-cols-xl-3 g-2";
    wrap.setAttribute("role", "list");

    if (!rows.length) {
        var empty = document.createElement("p");
        empty.className = "text-secondary small fst-italic col-12 mb-0";
        empty.textContent = "원산지 정보가 없습니다.";
        wrap.appendChild(empty);
        return wrap;
    }

    rows.forEach(function (row) {
        var namePart = (row.name || "").trim();
        var valuePart = (row.value || "").trim();
        if (!namePart && !valuePart) {
            return;
        }

        var col = document.createElement("div");
        col.className = "col";
        col.setAttribute("role", "listitem");

        var box = document.createElement("div");
        box.className =
            "origin-item rounded-3 border border-secondary-subtle px-2 py-2 small lh-sm h-100 bg-body-secondary bg-opacity-10";

        var nameEl = document.createElement("div");
        nameEl.className = "fw-semibold origin-item-label";
        nameEl.textContent = namePart || "—";

        var valEl = document.createElement("div");
        valEl.className = "text-body mt-1 origin-item-value";
        valEl.textContent = valuePart === "" ? "—" : valuePart;

        box.appendChild(nameEl);
        box.appendChild(valEl);
        col.appendChild(box);
        wrap.appendChild(col);
    });

    if (wrap.childElementCount === 0) {
        var emptyRow = document.createElement("p");
        emptyRow.className = "text-secondary small fst-italic col-12 mb-0";
        emptyRow.textContent = "원산지 정보가 없습니다.";
        wrap.appendChild(emptyRow);
    }

    return wrap;
}

function parseNutritionRows(ntrRaw) {
    var normalized = formatMealText(String(ntrRaw || "").replace(/<br\s*\/?>/gi, "\n"));
    var lines = normalized.split(/\n/).map(function (l) {
        return l.trim();
    }).filter(Boolean);

    var out = [];
    lines.forEach(function (line) {
        var idx = line.indexOf(":");
        if (idx === -1) {
            out.push({ name: line, value: "" });
            return;
        }
        out.push({
            name: line.slice(0, idx).trim(),
            value: line.slice(idx + 1).trim()
        });
    });
    return out;
}

function getMealTypeName(code) {
    if (code === "1") return "아침";
    if (code === "2") return "점심";
    if (code === "3") return "저녁";
    return "급식";
}

function formatMealText(text) {
    return text
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/\s*\(\d+(\.\d+)?\)\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function clearMealInfo() {
    mealInfoEl.innerHTML = "";
}

function setStatus(message) {
    statusTextEl.textContent = message;
}

function parseMealRowsFromXml(xmlText) {
    var parser = new DOMParser();
    var xml = parser.parseFromString(xmlText, "application/xml");
    var resultCode = getXmlTagText(xml, "CODE");
    if (resultCode && resultCode !== "INFO-000") {
        return [];
    }

    var rows = [];
    var rowNodes = xml.getElementsByTagName("row");

    for (var i = 0; i < rowNodes.length; i += 1) {
        var node = rowNodes[i];
        rows.push({
            SCHUL_NM: getNodeText(node, "SCHUL_NM"),
            MMEAL_SC_CODE: getNodeText(node, "MMEAL_SC_CODE"),
            MMEAL_SC_NM: getNodeText(node, "MMEAL_SC_NM"),
            DDISH_NM: getNodeText(node, "DDISH_NM"),
            CAL_INFO: getNodeText(node, "CAL_INFO"),
            NTR_INFO: getNodeText(node, "NTR_INFO"),
            ORPLC_INFO: getNodeText(node, "ORPLC_INFO")
        });
    }

    return rows;
}

function getXmlTagText(xml, tagName) {
    var nodes = xml.getElementsByTagName(tagName);
    if (!nodes || !nodes.length) {
        return "";
    }
    return (nodes[0].textContent || "").trim();
}

function getNodeText(node, tagName) {
    var nodes = node.getElementsByTagName(tagName);
    if (!nodes || !nodes.length) {
        return "";
    }
    return (nodes[0].textContent || "").trim();
}

document.addEventListener("DOMContentLoaded", initializeApp);

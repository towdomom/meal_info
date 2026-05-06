var API_BASE = "https://open.neis.go.kr/hub";
var API_KEY = "sample";
var DEFAULT_OFFICE_CODE = "D10";
var DEFAULT_SCHOOL_NAME = "함지고등학교";
var DEFAULT_SCHOOL_CODE = "7240273";

var officeCodeEl = null;
var schoolNameEl = null;
var mealDateEl = null;
var searchBtnEl = null;
var statusTextEl = null;
var mealInfoEl = null;

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

    searchBtnEl.addEventListener("click", function () {
        fetchMealInfo();
    });

    schoolNameEl.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            fetchMealInfo();
        }
    });

    fetchMealInfo();
}

function applyInitialValues() {
    var today = new Date();
    mealDateEl.value = toInputDate(today);

    var savedOfficeCode = localStorage.getItem("meal.officeCode");
    var savedSchoolName = localStorage.getItem("meal.schoolName");

    officeCodeEl.value = savedOfficeCode || DEFAULT_OFFICE_CODE;
    schoolNameEl.value = savedSchoolName || DEFAULT_SCHOOL_NAME;
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

function applySavedTheme() {
    var savedTheme = localStorage.getItem("meal.theme");
    var isDark = savedTheme === "dark";
    document.body.classList.toggle("dark", isDark);
    updateThemeButtonText(isDark);
}

function toggleTheme() {
    var isDark = document.body.classList.toggle("dark");
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
        setStatus(viewSchoolName + " - " + selectedDate + " 급식 정보");
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
    if (officeCode === DEFAULT_OFFICE_CODE && normalizeSchoolName(schoolName) === normalizeSchoolName(DEFAULT_SCHOOL_NAME)) {
        return DEFAULT_SCHOOL_CODE;
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
        block.className = "meal-block";

        var title = document.createElement("h2");
        title.className = "meal-title";
        title.textContent = meal.MMEAL_SC_NM || getMealTypeName(meal.MMEAL_SC_CODE);

        var menu = document.createElement("p");
        menu.className = "meal-menu";
        menu.textContent = formatMealText(meal.DDISH_NM || "");

        var meta = document.createElement("div");
        meta.className = "meal-meta";

        var calories = document.createElement("p");
        calories.textContent = "칼로리: " + (meal.CAL_INFO || "-");

        var nutrition = document.createElement("p");
        nutrition.textContent = "영양 정보\n" + formatMealText(meal.NTR_INFO || "-");

        var origin = document.createElement("p");
        origin.textContent = "원산지\n" + formatMealText(meal.ORPLC_INFO || "-");

        meta.appendChild(calories);
        meta.appendChild(nutrition);
        meta.appendChild(origin);

        block.appendChild(title);
        block.appendChild(menu);
        block.appendChild(meta);
        mealInfoEl.appendChild(block);
    });
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

/* ────────────────────────────────────────────────
   schedule.js  —  학사일정 탭 로직
   NEIS API: /hub/SchoolSchedule
   ──────────────────────────────────────────────── */

var SCHEDULE_API_BASE = "https://open.neis.go.kr/hub";
var SCHEDULE_API_KEY  = "sample";

/* DOM 참조 */
var scheduleYearEl       = null;
var scheduleMonthEl      = null;
var scheduleSearchBtnEl  = null;
var scheduleStatusEl     = null;
var scheduleListEl       = null;
var scheduleListViewEl   = null;
var scheduleCalViewEl    = null;
var calTitleEl           = null;
var calGridEl            = null;
var viewListBtnEl        = null;
var viewCalBtnEl         = null;
var calPrevBtnEl         = null;
var calNextBtnEl         = null;

/* 현재 조회된 데이터 보관 */
var currentScheduleRows  = [];
var currentScheduleYear  = 0;
var currentScheduleMonth = 0;

/* ── 초기화 ─────────────────────────────────── */
function initScheduleTab() {
    scheduleYearEl       = document.getElementById("scheduleYear");
    scheduleMonthEl      = document.getElementById("scheduleMonth");
    scheduleSearchBtnEl  = document.getElementById("scheduleSearchBtn");
    scheduleStatusEl     = document.getElementById("scheduleStatusText");
    scheduleListEl       = document.getElementById("scheduleList");
    scheduleListViewEl   = document.getElementById("scheduleListView");
    scheduleCalViewEl    = document.getElementById("scheduleCalView");
    calTitleEl           = document.getElementById("calTitle");
    calGridEl            = document.getElementById("scheduleCalendar");
    viewListBtnEl        = document.getElementById("viewListBtn");
    viewCalBtnEl         = document.getElementById("viewCalBtn");
    calPrevBtnEl         = document.getElementById("calPrevBtn");
    calNextBtnEl         = document.getElementById("calNextBtn");

    if (!scheduleYearEl || !scheduleSearchBtnEl) { return; }

    populateYears();
    setDefaultYearMonth();

    scheduleSearchBtnEl.addEventListener("click", function () {
        fetchSchedule();
    });

    viewListBtnEl.addEventListener("click", function () {
        setScheduleView("list");
    });

    viewCalBtnEl.addEventListener("click", function () {
        setScheduleView("calendar");
    });

    calPrevBtnEl.addEventListener("click", function () {
        shiftCalendarMonth(-1);
    });

    calNextBtnEl.addEventListener("click", function () {
        shiftCalendarMonth(1);
    });

    /* 탭이 처음 열릴 때 한 번 자동 조회 */
    var scheduleTabBtn = document.getElementById("tab-schedule-btn");
    if (scheduleTabBtn) {
        scheduleTabBtn.addEventListener("shown.bs.tab", function () {
            if (currentScheduleRows.length === 0) {
                fetchSchedule();
            }
        });
    }
}

function populateYears() {
    var today = new Date();
    var thisYear = today.getFullYear();
    for (var y = thisYear - 1; y <= thisYear + 1; y += 1) {
        var opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = y + "년";
        if (y === thisYear) { opt.selected = true; }
        scheduleYearEl.appendChild(opt);
    }
}

function setDefaultYearMonth() {
    var today = new Date();
    var mm = String(today.getMonth() + 1).padStart(2, "0");
    scheduleMonthEl.value = mm;
}

/* ── API 호출 ───────────────────────────────── */
async function fetchSchedule() {
    /* 공통 조건에서 학교 정보 읽기 */
    var officeCodeEl = document.getElementById("officeCode");
    var schoolNameEl = document.getElementById("schoolName");
    if (!officeCodeEl || !schoolNameEl) { return; }

    var officeCode = officeCodeEl.value;
    var schoolName = (schoolNameEl.value || "").trim();

    var schoolCode = (window.FIXED_SCHOOLS && window.FIXED_SCHOOLS[schoolName])
        ? window.FIXED_SCHOOLS[schoolName].schoolCode
        : "";

    if (!schoolCode) {
        setScheduleStatus("학교 코드를 찾을 수 없습니다. 학교명을 확인해주세요.");
        return;
    }

    var year  = scheduleYearEl.value;
    var month = scheduleMonthEl.value;
    var aaYmd = year + month;   /* YYYYMM */

    setScheduleStatus("학사일정을 조회하는 중...");
    clearScheduleResult();

    try {
        var rows = await fetchScheduleRows(officeCode, schoolCode, aaYmd);

        currentScheduleYear  = parseInt(year, 10);
        currentScheduleMonth = parseInt(month, 10);
        currentScheduleRows  = rows;

        if (!rows.length) {
            setScheduleStatus(schoolName + " - " + year + "년 " + parseInt(month, 10) + "월 학사일정이 없습니다.");
            return;
        }

        setScheduleStatus(schoolName + " — " + year + "년 " + parseInt(month, 10) + "월 학사일정");
        renderScheduleList(rows);
        renderScheduleCalendar(currentScheduleYear, currentScheduleMonth, rows);
    } catch (e) {
        setScheduleStatus("조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
}

async function fetchScheduleRows(officeCode, schoolCode, aaYmd) {
    /* aaYmd = "YYYYMM" → 해당 월 1일~말일로 변환 */
    var year  = parseInt(aaYmd.slice(0, 4), 10);
    var month = parseInt(aaYmd.slice(4, 6), 10);
    var fromYmd = aaYmd + "01";
    var lastDay = new Date(year, month, 0).getDate();
    var toYmd   = aaYmd + String(lastDay).padStart(2, "0");

    var url = SCHEDULE_API_BASE + "/SchoolSchedule"
        + "?Type=json"
        + "&pIndex=1&pSize=200"
        + "&ATPT_OFCDC_SC_CODE=" + encodeURIComponent(officeCode)
        + "&SD_SCHUL_CODE="      + encodeURIComponent(schoolCode)
        + "&AA_FROM_YMD="        + encodeURIComponent(fromYmd)
        + "&AA_TO_YMD="          + encodeURIComponent(toYmd);

    var resp = await fetch(url);
    if (!resp.ok) { throw new Error("Schedule API error"); }

    var data = await resp.json();

    /* head[1].RESULT.CODE 로 성공 여부 확인 */
    var head = data && data.SchoolSchedule && data.SchoolSchedule[0] && data.SchoolSchedule[0].head;
    if (head) {
        var resultObj = head[1] && head[1].RESULT;
        if (resultObj && resultObj.CODE && resultObj.CODE !== "INFO-000") { return []; }
    } else {
        /* RESULT가 최상위에 바로 있는 에러 응답 처리 */
        if (data && data.RESULT && data.RESULT.CODE !== "INFO-000") { return []; }
    }

    var rows = data
        && data.SchoolSchedule
        && data.SchoolSchedule[1]
        && data.SchoolSchedule[1].row;

    return rows || [];
}

/* ── 목록 렌더 ──────────────────────────────── */
function renderScheduleList(rows) {
    scheduleListEl.innerHTML = "";

    var DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

    rows.forEach(function (row) {
        var ymd   = String(row.AA_YMD || "");
        var name  = (row.EVENT_NM || "").trim();
        if (!name) { return; }

        var dateObj   = parseDateFromYmd(ymd);
        var dateLabel = dateObj
            ? parseInt(ymd.slice(4, 6), 10) + "월 " + parseInt(ymd.slice(6, 8), 10) + "일 (" + DAY_KO[dateObj.getDay()] + ")"
            : ymd;

        var sbtr   = (row.SBTR_DD_SC_NM || "").trim();
        var grades = buildGradeList(row);

        /* 휴업구분에 따라 좌측 테두리 색 결정 */
        var borderClass = "schedule-item-default";
        if (sbtr === "공휴일")       { borderClass = "schedule-item-holiday"; }
        else if (sbtr === "휴업일")  { borderClass = "schedule-item-offday"; }

        var item = document.createElement("div");
        item.className = "schedule-item " + borderClass + " rounded-3 border border-secondary-subtle px-3 py-2 shadow-sm";

        var header = document.createElement("div");
        header.className = "d-flex flex-wrap align-items-center gap-2";

        var dateEl = document.createElement("span");
        dateEl.className = "schedule-item-date";
        dateEl.textContent = dateLabel;

        var nameEl = document.createElement("span");
        nameEl.className = "schedule-item-name";
        nameEl.textContent = name;

        header.appendChild(dateEl);
        header.appendChild(nameEl);

        /* 휴업구분 뱃지 */
        if (sbtr && sbtr !== "해당없음") {
            var sbtrBadge = document.createElement("span");
            sbtrBadge.className = sbtr === "공휴일"
                ? "badge bg-danger-subtle text-danger-emphasis ms-auto"
                : "badge bg-warning-subtle text-warning-emphasis ms-auto";
            sbtrBadge.textContent = sbtr;
            header.appendChild(sbtrBadge);
        }

        item.appendChild(header);

        /* 학년 뱃지 */
        if (grades.length) {
            var badgeWrap = document.createElement("div");
            badgeWrap.className = "schedule-grade-badges d-flex flex-wrap gap-1 mt-1";
            grades.forEach(function (g) {
                var badge = document.createElement("span");
                badge.className = "badge bg-primary-subtle text-primary-emphasis";
                badge.textContent = g + "학년";
                badgeWrap.appendChild(badge);
            });
            item.appendChild(badgeWrap);
        }

        scheduleListEl.appendChild(item);
    });
}

/* ── 캘린더 렌더 ─────────────────────────────── */
function renderScheduleCalendar(year, month, rows) {
    if (!calGridEl) { return; }
    calGridEl.innerHTML = "";
    calTitleEl.textContent = year + "년 " + month + "월";

    /* 날짜별 이벤트 맵 만들기 */
    var eventMap = {};
    rows.forEach(function (row) {
        var ymd  = String(row.AA_YMD || "");
        var name = (row.EVENT_NM || "").trim();
        if (!name || ymd.length < 8) { return; }
        var day  = parseInt(ymd.slice(6, 8), 10);
        if (!eventMap[day]) { eventMap[day] = []; }
        eventMap[day].push({ name: name, sbtr: (row.SBTR_DD_SC_NM || "").trim() });
    });

    var today = new Date();
    var todayStr = toYmdKey(today.getFullYear(), today.getMonth() + 1, today.getDate());

    var table = document.createElement("table");
    table.className = "schedule-cal-grid";

    /* 요일 헤더 */
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    var dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    var dayClasses = ["sun", "", "", "", "", "", "sat"];
    dayNames.forEach(function (d, i) {
        var th = document.createElement("th");
        th.textContent = d;
        if (dayClasses[i]) { th.className = dayClasses[i]; }
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    /* 날짜 셀 */
    var tbody = document.createElement("tbody");
    var firstDay = new Date(year, month - 1, 1).getDay();
    var daysInMonth = new Date(year, month, 0).getDate();
    var daysInPrevMonth = new Date(year, month - 1, 0).getDate();
    var cellCount = 0;
    var tr = null;

    for (var pos = 0; pos < 42; pos += 1) {
        if (pos % 7 === 0) {
            tr = document.createElement("tr");
        }

        var td = document.createElement("td");
        td.className = "cal-cell";

        var dayNum, isOther = false, isThisMonth = false;
        if (pos < firstDay) {
            dayNum  = daysInPrevMonth - firstDay + pos + 1;
            isOther = true;
        } else if (pos - firstDay < daysInMonth) {
            dayNum       = pos - firstDay + 1;
            isThisMonth  = true;
        } else {
            dayNum  = pos - firstDay - daysInMonth + 1;
            isOther = true;
        }

        if (isOther) { td.classList.add("other-month"); }

        var cellYmdKey = toYmdKey(
            isOther && pos < firstDay  ? (month === 1 ? year - 1 : year) : year,
            isOther && pos < firstDay  ? (month === 1 ? 12 : month - 1)
                : isOther              ? (month === 12 ? 1 : month + 1) : month,
            dayNum
        );
        if (cellYmdKey === todayStr) { td.classList.add("today"); }

        var dow = pos % 7;
        var dateSpan = document.createElement("span");
        dateSpan.className = "cal-date" + (dow === 0 ? " sun" : dow === 6 ? " sat" : "");
        dateSpan.textContent = dayNum;
        td.appendChild(dateSpan);

        /* 이 날짜에 이벤트가 있으면 표시 */
        if (isThisMonth && eventMap[dayNum]) {
            var evWrap = document.createElement("div");
            evWrap.className = "cal-events";
            eventMap[dayNum].forEach(function (ev) {
                var chip = document.createElement("div");
                var chipClass = "cal-event-chip";
                if (ev.sbtr === "공휴일")      { chipClass += " cal-chip-holiday"; }
                else if (ev.sbtr === "휴업일") { chipClass += " cal-chip-offday"; }
                chip.className = chipClass;
                chip.title = ev.name;
                chip.textContent = ev.name.length > 8 ? ev.name.slice(0, 7) + "…" : ev.name;
                evWrap.appendChild(chip);
            });
            td.appendChild(evWrap);
        }

        tr.appendChild(td);
        cellCount += 1;

        if (pos % 7 === 6) {
            tbody.appendChild(tr);
        }
    }

    table.appendChild(tbody);
    calGridEl.appendChild(table);
}

/* ── 캘린더 월 이동 ─────────────────────────── */
function shiftCalendarMonth(delta) {
    var m = currentScheduleMonth + delta;
    var y = currentScheduleYear;
    if (m < 1)  { m = 12; y -= 1; }
    if (m > 12) { m = 1;  y += 1; }

    currentScheduleYear  = y;
    currentScheduleMonth = m;

    /* 연월 드롭다운도 맞추기 */
    scheduleYearEl.value  = String(y);
    scheduleMonthEl.value = String(m).padStart(2, "0");

    /* 현재 캐시된 데이터와 달이 같으면 그냥 다시 그리고, 다르면 새로 조회 */
    var cachedMonth = currentScheduleRows.length > 0
        && parseInt(String(currentScheduleRows[0].AA_YMD || "").slice(4, 6), 10) === m
        && parseInt(String(currentScheduleRows[0].AA_YMD || "").slice(0, 4), 10) === y;

    if (cachedMonth) {
        renderScheduleCalendar(y, m, currentScheduleRows);
    } else {
        fetchSchedule();
    }
}

/* ── 뷰 전환 ────────────────────────────────── */
function setScheduleView(mode) {
    if (mode === "list") {
        scheduleListViewEl.classList.remove("d-none");
        scheduleCalViewEl.classList.add("d-none");
        viewListBtnEl.classList.add("active");
        viewCalBtnEl.classList.remove("active");
    } else {
        scheduleListViewEl.classList.add("d-none");
        scheduleCalViewEl.classList.remove("d-none");
        viewListBtnEl.classList.remove("active");
        viewCalBtnEl.classList.add("active");
        if (currentScheduleRows.length) {
            renderScheduleCalendar(currentScheduleYear, currentScheduleMonth, currentScheduleRows);
        }
    }
}

/* ── 유틸 ───────────────────────────────────── */
function setScheduleStatus(msg) {
    if (scheduleStatusEl) { scheduleStatusEl.textContent = msg; }
}

function clearScheduleResult() {
    if (scheduleListEl) { scheduleListEl.innerHTML = ""; }
    if (calGridEl)      { calGridEl.innerHTML = ""; }
    if (calTitleEl)     { calTitleEl.textContent = ""; }
}

function parseDateFromYmd(ymd) {
    if (!ymd || ymd.length < 8) { return null; }
    return new Date(
        parseInt(ymd.slice(0, 4), 10),
        parseInt(ymd.slice(4, 6), 10) - 1,
        parseInt(ymd.slice(6, 8), 10)
    );
}

function toYmdKey(y, m, d) {
    return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function buildGradeList(row) {
    /* 실제 API 필드명: ONE / TW / THREE / FR / FIV / SIX */
    var fields = [
        "ONE_GRADE_EVENT_YN",
        "TW_GRADE_EVENT_YN",
        "THREE_GRADE_EVENT_YN",
        "FR_GRADE_EVENT_YN",
        "FIV_GRADE_EVENT_YN",
        "SIX_GRADE_EVENT_YN"
    ];
    var result = [];
    fields.forEach(function (f, i) {
        if (row[f] === "Y") { result.push(i + 1); }
    });
    return result;
}

/* ── DOMContentLoaded 연결 ──────────────────── */
document.addEventListener("DOMContentLoaded", initScheduleTab);

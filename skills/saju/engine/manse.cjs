#!/usr/bin/env node
'use strict';
/* ============================================================
   manse.cjs — 만세력 CLI (평생사주 스킬 전용)

   LLM이 만세력을 암산하면 절기/일진 경계에서 틀리므로,
   정확한 명식은 반드시 이 CLI로 계산한다.

   사용법:
     node manse.cjs "2008-03-15 06:30 남"
     node manse.cjs --date 2008-03-15 --time 06:30 --gender 여
     node manse.cjs "1996-11-02 여 음력"     (시 미상 → 정오 가정, 시주 불확실 표시)
     node manse.cjs --json "2008-03-15 06:30 남"   (JSON 출력)

   토큰(순서 무관):
     YYYY-MM-DD | YYYY.MM.DD | YYYY/MM/DD   생년월일
     HH:MM | HH시                            시각(생략 가능)
     남|여 (남자|여자|m|f)                   성별
     음력 | --lunar                          음력 입력
     윤달 | --leap                           음력 윤달
     --json                                  JSON 출력
     [경도 보정 — 기본 ON: 서울 −32분]
     서울|부산|대구|… (도시명)               출생지 경도로 보정
     경도127.0 | --lon=127.0                  경도 직접 지정
     표준시 | --no-lon                        보정 끄기(시계 시각 그대로)
   ============================================================ */

const path = require('path');

let Solar, Lunar;
try {
  ({ Solar, Lunar } = require('lunar-javascript'));
} catch (e) {
  console.error('[오류] lunar-javascript 미설치. engine 폴더에서: npm install');
  process.exit(2);
}
globalThis.Solar = Solar;
globalThis.Lunar = Lunar;
require(path.join(__dirname, 'saju.js'));
const Engine = globalThis.SajuEngine;

const pad2 = (n) => String(n).padStart(2, '0');

// ---------- 경도(진태양시) 보정 ----------
// 한국 표준시(KST)는 동경 135°(일본 아카시) 기준인데, 한국 실제 위치는 약 127°라
// 진태양시가 시계보다 늦다. 보정(분) = (실제경도 − 135) × 4분/도. 서울이면 약 −32분.
// 절기·일진은 그대로, 오직 "시각"만 보정되어 시지/시간(천간) 경계가 정확해진다.
const KST_MERIDIAN = 135;
const CITY_LONGITUDE = {
  '서울': 126.98, '인천': 126.70, '수원': 127.03, '춘천': 127.73, '강릉': 128.90,
  '대전': 127.39, '세종': 127.29, '청주': 127.49, '천안': 127.11, '전주': 127.15,
  '광주': 126.85, '목포': 126.39, '여수': 127.66, '대구': 128.60, '안동': 128.73,
  '포항': 129.36, '부산': 129.08, '울산': 129.31, '창원': 128.68, '제주': 126.53,
  '평양': 125.75, '개성': 126.55,
};
const DEFAULT_LONGITUDE = CITY_LONGITUDE['서울']; // 출생지 미상 시 서울 기준
const longitudeOffsetMinutes = (lon) => Math.round((lon - KST_MERIDIAN) * 4);

// ---------- 입력 파싱 ----------
// 각 토큰을 순서와 무관하게 매칭한다. 먼저 매칭되는 규칙이 소비하고,
// 남은 토큰은 두 번째 패스에서 날짜/시각 패턴으로 다시 검사한다.
const FLAG_MATCHERS = [
  { test: (t) => t === '--json', apply: (a) => { a.json = true; } },
  { test: (t) => t === '--lunar' || t === '음력' || t === '음', apply: (a) => { a.isLunar = true; } },
  { test: (t) => t === '--leap' || t === '윤달' || t === '윤', apply: (a) => { a.isLeap = true; } },
  { test: (t) => t === '--date' || t === '--time' || t === '--gender', apply: () => {} }, // 플래그 키 무시(값만 사용)
  { test: (t) => /^(남|남자|m|M|male)$/.test(t), apply: (a) => { a.gender = '남'; a.genderGiven = true; } },
  { test: (t) => /^(여|여자|f|F|female)$/.test(t), apply: (a) => { a.gender = '여'; a.genderGiven = true; } },
  { test: (t) => /^(--no-lon|--표준시|표준시|시계시각|무보정|보정없음)$/.test(t), apply: (a) => { a.lonOff = true; } },
  {
    test: (t) => /^(?:--lon=?|경도)(\d{2,3}(?:\.\d+)?)$/.test(t),
    apply: (a, t) => {
      const m = t.match(/^(?:--lon=?|경도)(\d{2,3}(?:\.\d+)?)$/);
      a.lon = +m[1];
      a.lonLabel = `경도 ${m[1]}°E`;
    },
  },
  {
    test: (t) => Object.prototype.hasOwnProperty.call(CITY_LONGITUDE, t),
    apply: (a, t) => { a.lon = CITY_LONGITUDE[t]; a.lonLabel = `${t} ${CITY_LONGITUDE[t]}°E`; },
  },
];

const DATE_PATTERNS = [
  { re: /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/, apply: (a, m) => { a.year = +m[1]; a.month = +m[2]; a.day = +m[3]; } },
  { re: /^(\d{8})$/, apply: (a, m) => { a.year = +m[1].slice(0, 4); a.month = +m[1].slice(4, 6); a.day = +m[1].slice(6, 8); } },
  { re: /^(\d{1,2}):(\d{2})$/, apply: (a, m) => { a.hour = +m[1]; a.minute = +m[2]; a.hourGiven = true; } },
  { re: /^(\d{1,2})시$/, apply: (a, m) => { a.hour = +m[1]; a.hourGiven = true; } },
];

function parseArgs(argv) {
  const args = { gender: '', genderGiven: false, isLunar: false, isLeap: false, json: false, hour: null, minute: 0, hourGiven: false };
  const tokens = argv.slice(2).flatMap((s) => String(s).split(/\s+/)).filter(Boolean);
  const unmatched = [];

  tokens.forEach((raw) => {
    const t = raw.trim();
    if (!t) return;
    const matcher = FLAG_MATCHERS.find((m) => m.test(t));
    if (matcher) matcher.apply(args, t);
    else unmatched.push(t);
  });

  unmatched.forEach((t) => {
    const pattern = DATE_PATTERNS.find((p) => p.re.test(t));
    if (pattern) pattern.apply(args, t.match(pattern.re));
  });

  return args;
}

function fail(msg) {
  console.error('[입력 오류] ' + msg);
  console.error('예) node manse.cjs "2008-03-15 06:30 남"   /   node manse.cjs "1996-11-02 여 음력"');
  process.exit(1);
}

const args = parseArgs(process.argv);
if (!args.year || !args.month || !args.day) fail('생년월일(YYYY-MM-DD)이 필요해.');
if (!args.gender) args.gender = '남'; // 미상 시 가정(아래 경고)
if (args.hour == null) { args.hour = 12; args.minute = 0; } // 시 미상 → 정오 가정

// ---------- 진태양시 보정 적용 ----------
// 입력(양/음력)을 양력 시각으로 환산한 뒤 경도 오프셋(분)만큼 시프트해서 계산한다.
// 보정은 "시각"에만 적용 — 절기/일진 계산은 보정된 양력 시각 기준으로 자연스럽게 따라간다.
args.offsetMin = 0;
let calcInput = { year: args.year, month: args.month, day: args.day, hour: args.hour, minute: args.minute, isLunar: args.isLunar };
if (!args.lonOff) {
  if (args.lon == null) { args.lon = DEFAULT_LONGITUDE; args.lonLabel = `서울(기본) ${DEFAULT_LONGITUDE}°E`; }
  args.offsetMin = longitudeOffsetMinutes(args.lon);

  let sy = args.year, sm = args.month, sd = args.day, sh = args.hour, smin = args.minute;
  if (args.isLunar) {
    const s = Lunar.fromYmdHms(args.year, args.month, args.day, args.hour, args.minute, 0).getSolar();
    sy = s.getYear(); sm = s.getMonth(); sd = s.getDay(); sh = s.getHour(); smin = s.getMinute();
  }
  args.solarBefore = { year: sy, month: sm, day: sd, hour: sh, minute: smin };

  const shifted = new Date(sy, sm - 1, sd, sh, smin + args.offsetMin, 0);
  args.solarAfter = { year: shifted.getFullYear(), month: shifted.getMonth() + 1, day: shifted.getDate(), hour: shifted.getHours(), minute: shifted.getMinutes() };
  args.dateShifted = (args.solarAfter.day !== sd || args.solarAfter.month !== sm || args.solarAfter.year !== sy);
  calcInput = { ...args.solarAfter, isLunar: false }; // 보정된 양력으로 계산
}

let result;
try {
  result = Engine.analyze({
    year: calcInput.year, month: calcInput.month, day: calcInput.day,
    hour: calcInput.hour, minute: calcInput.minute,
    gender: args.gender, isLunar: calcInput.isLunar, isLeap: args.isLeap,
  });
  Engine.attachPillarDetail(result);
} catch (e) {
  fail('명식 계산 실패: ' + (e && e.message ? e.message : e));
}
const isStrong = result._isStrong;
delete result._isStrong; // JSON에는 신강/신약 판정 근거만 counts로 노출, 내부 플래그는 숨김

// ---------- 개수 기반 요약 (소수점 가중치 대신 실제 글자 개수로 풀이) ----------
// 일반 대중 사주는 "재성이 0.9" 같은 가중치를 절대 안 쓴다. 천간4+지지4 글자에서
// 오행/십신이 몇 개 나타나는지(개수)로 강약을 말한다. 그 개수를 여기서 계산해 준다.
const TEN_GOD_GROUP = {
  비견: '비겁', 겁재: '비겁', 식신: '식상', 상관: '식상', 편재: '재성',
  정재: '재성', 편관: '관성', 정관: '관성', 편인: '인성', 정인: '인성',
};
const gradeOf = (n) => (n === 0 ? '없음' : n === 1 ? '약함' : n === 2 ? '보통' : n === 3 ? '강함' : '과다');

function summarizeCounts(r, strong) {
  const pillars = ['year', 'month', 'day', 'hour'].map((k) => r.manse[k]);

  const ohaeng = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  pillars.forEach((p) => { ohaeng[p.stemOhaeng]++; ohaeng[p.branchOhaeng]++; });

  const shipsinDetail = { 비견: 0, 겁재: 0, 식신: 0, 상관: 0, 편재: 0, 정재: 0, 편관: 0, 정관: 0, 편인: 0, 정인: 0 };
  const shipsinGroup = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  pillars.forEach((p) => {
    [p.stemShipsinKo, p.branchShipsinKo].forEach((s) => {
      if (s && Object.prototype.hasOwnProperty.call(shipsinDetail, s)) {
        shipsinDetail[s]++;
        shipsinGroup[TEN_GOD_GROUP[s]]++;
      }
    });
  });

  const ohaengGrade = {}; Object.keys(ohaeng).forEach((k) => { ohaengGrade[k] = gradeOf(ohaeng[k]); });
  const shipsinGroupGrade = {}; Object.keys(shipsinGroup).forEach((k) => { shipsinGroupGrade[k] = gradeOf(shipsinGroup[k]); });

  return {
    ohaeng,
    ohaengGrade,
    lacking: Object.keys(ohaeng).filter((k) => ohaeng[k] === 0),
    shipsinDetail,
    shipsinGroup,
    shipsinGroupGrade,
    missingShipsin: Object.keys(shipsinGroup).filter((k) => shipsinGroup[k] === 0),
    sinKangYak: strong ? '신강' : '신약',
  };
}
const counts = summarizeCounts(result, isStrong);

if (args.json) {
  console.log(JSON.stringify({ input: args, result, counts }, null, 2));
  process.exit(0);
}

// ---------- 사람이 읽는 출력 ----------
const warnings = [];
if (!args.hourGiven) warnings.push('시(時) 미상 → 정오로 가정함. 시주·일부 신살은 불확실 (정확히 보려면 태어난 시간 필요).');
if (!args.genderGiven) warnings.push('성별 미입력 → 남자로 가정함 (대운 방향·일부 해석은 성별에 따라 달라짐).');

const lines = [];
lines.push('═══ 명식 계산 결과 (이 데이터에 근거해서만 답글 작성) ═══');
lines.push(`[입력] ${args.isLunar ? '음력' : '양력'} ${args.year}-${pad2(args.month)}-${pad2(args.day)} ${args.hourGiven ? pad2(args.hour) + ':' + pad2(args.minute) : '(시 미상)'} / ${args.gender}`);
if (args.lonOff) {
  lines.push('[진태양시 보정] 끄짐(표준시 그대로) — 시지 경계가 시계 시각 기준');
} else if (args.offsetMin !== 0) {
  const before = args.solarBefore, after = args.solarAfter;
  const shift = args.dateShifted ? `, ${after.year}-${pad2(after.month)}-${pad2(after.day)}로 날짜 넘어감` : '';
  lines.push(`[진태양시 보정] ${args.lonLabel} → ${args.offsetMin}분 적용  (계산시각 ${pad2(before.hour)}:${pad2(before.minute)} → ${pad2(after.hour)}:${pad2(after.minute)}${shift})`);
}
lines.push('');
lines.push(Engine.toReadingContext(result));
lines.push('');
lines.push('[오행 개수] (소수점 가중치 아님 — 실제 글자 개수로 풀이할 것)');
lines.push(['木', '火', '土', '金', '水'].map((k) => `${k} ${counts.ohaeng[k]}개(${counts.ohaengGrade[k]})`).join(' / '));
if (counts.lacking.length) lines.push(`→ 아예 없는 오행: ${counts.lacking.join('·')}`);
lines.push('[십신 그룹 개수]');
lines.push(['비겁', '식상', '재성', '관성', '인성'].map((k) => `${k} ${counts.shipsinGroup[k]}개(${counts.shipsinGroupGrade[k]})`).join(' / '));
if (counts.missingShipsin.length) lines.push(`→ 없는 십신: ${counts.missingShipsin.join('·')}`);
lines.push(`[신강/신약] ${counts.sinKangYak}`);
lines.push('');

const shinsalSummary = [];
['year', 'month', 'day', 'hour'].forEach((k) => {
  const m = result.manse[k];
  if (m.shinsals.length) {
    const pos = { year: '연지', month: '월지', day: '일지', hour: '시지' }[k];
    shinsalSummary.push(`${pos} ${m.branchKo}: ${m.shinsals.join('·')}`);
  }
});
lines.push('[신살] ' + (shinsalSummary.length ? shinsalSummary.join(' / ') : '주요 신살 없음'));
lines.push('');
lines.push('[일주] ' + result.palja.dayPillar.stem + result.palja.dayPillar.branch +
  ' (' + Engine.tables.STEMS.find((s) => s.char === result.palja.dayPillar.stem).hangul +
  Engine.tables.BRANCH_HANGUL[result.palja.dayPillar.branch] + ')');

if (warnings.length) {
  lines.push('');
  lines.push('⚠ 주의: ' + warnings.join(' / '));
}
console.log(lines.join('\n'));

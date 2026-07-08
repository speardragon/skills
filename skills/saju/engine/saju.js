/* ============================================================
   saju.js — 사주(四柱) 계산 라이브러리
   ============================================================
   lunar-javascript로 얻은 연월일시 간지(干支)를 바탕으로
   오행 분포·십신·격국·용신·대운·12운성·신살을 계산한다.

   Dependencies (호출 전에 로드):
     require('lunar-javascript')  → globalThis.Solar / globalThis.Lunar

   Export: globalThis.SajuEngine
   {
     analyze(input)        → { palja, ilgan, ohaeng, shipsin, kyukguk, yongshin, daewoon, meta }
     attachPillarDetail(r) → result.manse.{year,month,day,hour} 추가
     toReadingContext(r)   → 사람이 읽기 쉬운 컨텍스트 문자열
     tables                → { STEM_HANGUL, BRANCH_HANGUL, TEN_GOD_HANGUL }
   }
   ============================================================ */

(function (global) {
  'use strict';

  // ============== 기초 상수 ==============

  // 오행 순환 순서 — 상생(相生) 방향. index 차이로 십신·용신을 유도한다.
  const ELEMENT_CYCLE = ['木', '火', '土', '金', '水'];
  const elementRank = (el) => ELEMENT_CYCLE.indexOf(el);

  const STEMS = [
    { char: '甲', hangul: '갑', element: '木', polarity: 1 },
    { char: '乙', hangul: '을', element: '木', polarity: 0 },
    { char: '丙', hangul: '병', element: '火', polarity: 1 },
    { char: '丁', hangul: '정', element: '火', polarity: 0 },
    { char: '戊', hangul: '무', element: '土', polarity: 1 },
    { char: '己', hangul: '기', element: '土', polarity: 0 },
    { char: '庚', hangul: '경', element: '金', polarity: 1 },
    { char: '辛', hangul: '신', element: '金', polarity: 0 },
    { char: '壬', hangul: '임', element: '水', polarity: 1 },
    { char: '癸', hangul: '계', element: '水', polarity: 0 },
  ];
  const stemOf = (char) => STEMS.find((s) => s.char === char);

  const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const BRANCH_HANGUL = { 子:'자',丑:'축',寅:'인',卯:'묘',辰:'진',巳:'사',午:'오',未:'미',申:'신',酉:'유',戌:'술',亥:'해' };
  const branchIndex = (b) => BRANCHES.indexOf(b);

  // 지장간(支藏干) — 지지 속에 숨은 천간과 그 비중(본기/중기/여기). 명리학 표준 배분표.
  const HIDDEN_STEMS = {
    子: [{ stem: '癸', weight: 1.0 }],
    丑: [{ stem: '己', weight: 0.6 }, { stem: '癸', weight: 0.2 }, { stem: '辛', weight: 0.2 }],
    寅: [{ stem: '甲', weight: 0.6 }, { stem: '丙', weight: 0.2 }, { stem: '戊', weight: 0.2 }],
    卯: [{ stem: '乙', weight: 1.0 }],
    辰: [{ stem: '戊', weight: 0.6 }, { stem: '乙', weight: 0.2 }, { stem: '癸', weight: 0.2 }],
    巳: [{ stem: '丙', weight: 0.6 }, { stem: '戊', weight: 0.2 }, { stem: '庚', weight: 0.2 }],
    午: [{ stem: '丁', weight: 0.7 }, { stem: '己', weight: 0.3 }],
    未: [{ stem: '己', weight: 0.6 }, { stem: '丁', weight: 0.2 }, { stem: '乙', weight: 0.2 }],
    申: [{ stem: '庚', weight: 0.6 }, { stem: '壬', weight: 0.2 }, { stem: '戊', weight: 0.2 }],
    酉: [{ stem: '辛', weight: 1.0 }],
    戌: [{ stem: '戊', weight: 0.6 }, { stem: '辛', weight: 0.2 }, { stem: '丁', weight: 0.2 }],
    亥: [{ stem: '壬', weight: 0.7 }, { stem: '甲', weight: 0.3 }],
  };
  const dominantHiddenStem = (branch) => HIDDEN_STEMS[branch][0].stem;

  // 십신(十神) 이름 — [일간과 오행 관계 diff][같은 음양?0:1]
  // diff: 0=비겁 1=식상(내가 생) 2=재성(내가 극) 3=관성(나를 극) 4=인성(나를 생)
  // 다섯 관계 모두 "같은 음양 = 편(偏)/무표기, 다른 음양 = 정(正)/표기" 규칙 하나로 통일된다.
  const TEN_GOD_NAMES = [
    ['比肩', '劫財'],
    ['食神', '傷官'],
    ['偏財', '正財'],
    ['偏官', '正官'],
    ['偏印', '正印'],
  ];
  const TEN_GOD_HANGUL = {
    比肩: '비견', 劫財: '겁재', 食神: '식신', 傷官: '상관',
    偏財: '편재', 正財: '정재', 偏官: '편관', 正官: '정관',
    偏印: '편인', 正印: '정인',
  };

  function tenGodBetween(dayStemChar, otherStemChar) {
    const day = stemOf(dayStemChar);
    const other = stemOf(otherStemChar);
    if (!day || !other) return null;
    const diff = (elementRank(other.element) - elementRank(day.element) + ELEMENT_CYCLE.length) % ELEMENT_CYCLE.length;
    const samePolarity = day.polarity === other.polarity;
    return TEN_GOD_NAMES[diff][samePolarity ? 0 : 1];
  }

  // ============== 12운성 ==============
  // 순행(양간)은 장생 지지부터 지지 순서대로, 역행(음간)은 거꾸로 12단계를 돈다.
  const TWELVE_STAGES = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양'];
  const STAGE_START_BRANCH = { 甲:'亥', 丙:'寅', 戊:'寅', 庚:'巳', 壬:'申', 乙:'午', 丁:'酉', 己:'酉', 辛:'子', 癸:'卯' };
  function twelveStageOf(stemChar, branch) {
    const stem = stemOf(stemChar);
    const startIdx = branchIndex(STAGE_START_BRANCH[stemChar]);
    const idx = branchIndex(branch);
    const forward = stem.polarity === 1; // 양간 순행, 음간 역행
    const stageIdx = forward ? (idx - startIdx + 12) % 12 : (startIdx - idx + 12) % 12;
    return TWELVE_STAGES[stageIdx];
  }

  // ============== 신살(연지 삼합 기준) ==============
  // 연지가 속한 삼합 그룹별로 도화·역마·화개·장성의 위치가 정해진다.
  const SAMHAP_GROUPS = [
    { members: ['寅', '午', '戌'], dohwa: '卯', yeokma: '申', hwagae: '戌', jangseong: '午' },
    { members: ['申', '子', '辰'], dohwa: '酉', yeokma: '寅', hwagae: '辰', jangseong: '子' },
    { members: ['亥', '卯', '未'], dohwa: '子', yeokma: '巳', hwagae: '未', jangseong: '卯' },
    { members: ['巳', '酉', '丑'], dohwa: '午', yeokma: '亥', hwagae: '丑', jangseong: '酉' },
  ];
  const samhapGroupOf = (branch) => SAMHAP_GROUPS.find((g) => g.members.includes(branch));
  function shinsalsAt(yearBranch, branch) {
    const group = samhapGroupOf(yearBranch);
    if (!group) return [];
    const found = [];
    if (group.dohwa === branch) found.push('도화');
    if (group.yeokma === branch) found.push('역마');
    if (group.hwagae === branch) found.push('화개');
    if (group.jangseong === branch) found.push('장성');
    return found;
  }

  // ============== 팔자(八字) 추출 ==============
  function pillarsFromEightChar(ec) {
    return {
      yearPillar: { stem: ec.getYearGan(), branch: ec.getYearZhi() },
      monthPillar: { stem: ec.getMonthGan(), branch: ec.getMonthZhi() },
      dayPillar: { stem: ec.getDayGan(), branch: ec.getDayZhi() },
      hourPillar: { stem: ec.getTimeGan(), branch: ec.getTimeZhi() },
    };
  }
  const PILLAR_KEYS = ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar'];

  // ============== 오행 분포 ==============
  // 천간은 1.0, 지지는 지장간 비중만큼 더한다.
  function distributeElements(palja) {
    const totals = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    PILLAR_KEYS.forEach((key) => {
      const p = palja[key];
      totals[stemOf(p.stem).element] += 1.0;
      HIDDEN_STEMS[p.branch].forEach((h) => {
        totals[stemOf(h.stem).element] += h.weight;
      });
    });
    ELEMENT_CYCLE.forEach((el) => { totals[el] = Math.round(totals[el] * 10) / 10; });
    const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return { ...totals, dominant: ranked[0][0], lacking: ranked[ranked.length - 1][0] };
  }

  // ============== 십신 분포 ==============
  // 천간: 일간을 제외한 연/월/시 3개(가중 1.0). 지지: 4개 기둥의 지장간(가중치 그대로).
  function distributeTenGods(palja) {
    const dayStem = palja.dayPillar.stem;
    const totals = { 比肩:0, 劫財:0, 食神:0, 傷官:0, 偏財:0, 正財:0, 偏官:0, 正官:0, 偏印:0, 正印:0 };
    const add = (name, weight) => { if (name) totals[name] += weight; };

    [palja.yearPillar.stem, palja.monthPillar.stem, palja.hourPillar.stem]
      .forEach((stem) => add(tenGodBetween(dayStem, stem), 1));

    PILLAR_KEYS.map((key) => palja[key].branch)
      .forEach((branch) => {
        HIDDEN_STEMS[branch].forEach((h) => add(tenGodBetween(dayStem, h.stem), h.weight));
      });

    Object.keys(totals).forEach((k) => { totals[k] = Math.round(totals[k] * 10) / 10; });
    return totals;
  }

  // ============== 격국(格局) 추정 ==============
  // 월지 본기가 일간에 대해 어떤 십신인지로 격국명을 정한다 (간단 룰).
  const PATTERN_BY_TEN_GOD = {
    正官: '정관격', 偏官: '편관격(칠살격)',
    正財: '정재격', 偏財: '편재격',
    正印: '정인격', 偏印: '편인격',
    食神: '식신격', 傷官: '상관격',
    比肩: '건록격', 劫財: '양인격',
  };
  function estimatePattern(palja) {
    const monthTenGod = tenGodBetween(palja.dayPillar.stem, dominantHiddenStem(palja.monthPillar.branch));
    return PATTERN_BY_TEN_GOD[monthTenGod] || '잡격';
  }

  // ============== 용신(用神) 추정 ==============
  // 일간 오행의 총량이 임계치 이상이면 신강 → 설기하는 오행이 약, 미만이면 신약 → 생조하는 오행이 약.
  const STRONG_THRESHOLD = 3.0;
  function estimateUsefulGod(ilganElement, elementTotals) {
    const isStrong = elementTotals[ilganElement] >= STRONG_THRESHOLD;
    const idx = elementRank(ilganElement);
    if (isStrong) {
      const drain = ELEMENT_CYCLE[(idx + 1) % 5]; // 일간이 생하는 오행으로 설기
      return { ohaeng: drain, reason: '신강 — 설기 필요', isStrong };
    }
    const support = ELEMENT_CYCLE[(idx + 4) % 5]; // 일간을 생하는 오행으로 보강
    return { ohaeng: support, reason: '신약 — 보강 필요', isStrong };
  }

  // ============== 대운(大運) ==============
  function buildLuckCycles(eightChar, gender) {
    const yun = eightChar.getYun(gender === '남' ? 1 : 0);
    return yun.getDaYun().slice(0, 9).map((d) => {
      const ganZhi = d.getGanZhi();
      const entry = { startYear: d.getStartYear(), startAge: d.getStartAge(), ganZhi };
      if (ganZhi) { entry.stem = ganZhi[0]; entry.branch = ganZhi[1]; }
      return entry;
    });
  }

  // ============== 메인: analyze ==============
  /**
   * @param {Object} input year, month, day, hour, minute, gender('남'|'여'), isLunar, isLeap
   */
  function analyze(input) {
    if (!global.Lunar || !global.Solar) {
      throw new Error('lunar-javascript 라이브러리가 로드되지 않았습니다.');
    }
    const { year, month, day, hour, minute = 0, gender, isLunar = false } = input;

    const solar = isLunar
      ? global.Lunar.fromYmdHms(year, month, day, hour, minute, 0).getSolar()
      : global.Solar.fromYmdHms(year, month, day, hour, minute, 0);
    const lunar = solar.getLunar();
    const eightChar = lunar.getEightChar();

    const palja = pillarsFromEightChar(eightChar);
    const dayStem = stemOf(palja.dayPillar.stem);
    const ilgan = { char: dayStem.char, ko: dayStem.hangul, ohaeng: dayStem.element, yinyang: dayStem.polarity ? '양' : '음' };

    const ohaeng = distributeElements(palja);
    const shipsin = distributeTenGods(palja);
    const kyukguk = estimatePattern(palja);
    const yongshin = estimateUsefulGod(ilgan.ohaeng, ohaeng);

    return {
      palja,
      ilgan,
      ohaeng,
      shipsin,
      kyukguk,
      yongshin: { ohaeng: yongshin.ohaeng, reason: yongshin.reason },
      daewoon: buildLuckCycles(eightChar, gender),
      meta: {
        gender,
        solar: { y: solar.getYear(), m: solar.getMonth(), d: solar.getDay(), h: solar.getHour() },
        lunar: { y: lunar.getYear(), m: lunar.getMonth(), d: lunar.getDay(), isLeap: lunar.getMonth() < 0 },
      },
      // 내부 전용 — sinKangYak 판정에 재사용, JSON 출력에는 포함하지 않음
      _isStrong: yongshin.isStrong,
    };
  }

  // ============== 기둥별 상세(위치별 십신·12운성·신살) ==============
  function attachPillarDetail(result) {
    if (!result || !result.palja || !result.ilgan) return result;
    const dayStemChar = result.palja.dayPillar.stem;
    const yearBranch = result.palja.yearPillar.branch;

    const manse = {};
    PILLAR_KEYS.forEach((key) => {
      const posKey = key.replace('Pillar', ''); // yearPillar -> year
      const pillar = result.palja[key];
      const stem = stemOf(pillar.stem);
      const mainHidden = dominantHiddenStem(pillar.branch);
      const mainHiddenStem = stemOf(mainHidden);
      const stemTenGod = posKey === 'day' ? null : tenGodBetween(dayStemChar, pillar.stem);
      const branchTenGod = tenGodBetween(dayStemChar, mainHidden);

      manse[posKey] = {
        stem: pillar.stem,
        branch: pillar.branch,
        stemKo: stem.hangul,
        branchKo: BRANCH_HANGUL[pillar.branch],
        stemOhaeng: stem.element,
        stemYinyang: stem.polarity ? '양' : '음',
        branchOhaeng: mainHiddenStem.element,
        branchYinyang: mainHiddenStem.polarity ? '양' : '음',
        stemShipsin: stemTenGod,
        stemShipsinKo: stemTenGod ? TEN_GOD_HANGUL[stemTenGod] : null,
        branchShipsin: branchTenGod,
        branchShipsinKo: branchTenGod ? TEN_GOD_HANGUL[branchTenGod] : null,
        unseong: twelveStageOf(dayStemChar, pillar.branch),
        shinsals: shinsalsAt(yearBranch, pillar.branch),
      };
    });
    result.manse = manse;
    return result;
  }

  // ============== 사람이 읽는 컨텍스트(해석 프롬프트용) ==============
  function toReadingContext(result) {
    const p = result.palja;
    const label = (key) => `${p[key].stem}${p[key].branch} (${stemOf(p[key].stem).hangul}${BRANCH_HANGUL[p[key].branch]})`;
    const lines = [];

    lines.push('[사주 명식]');
    lines.push(`연주: ${label('yearPillar')}`);
    lines.push(`월주: ${label('monthPillar')}`);
    lines.push(`일주: ${label('dayPillar')} ★ 일간`);
    lines.push(`시주: ${label('hourPillar')}`);

    lines.push('');
    lines.push('[일간]');
    lines.push(`${result.ilgan.char} (${result.ilgan.ko}) — ${result.ilgan.ohaeng} ${result.ilgan.yinyang}`);

    lines.push('');
    lines.push('[오행 분포]');
    ELEMENT_CYCLE.forEach((k) => lines.push(`${k}: ${result.ohaeng[k]}`));
    lines.push(`강한 오행: ${result.ohaeng.dominant} / 부족한 오행: ${result.ohaeng.lacking}`);

    lines.push('');
    lines.push('[십신 분포]');
    Object.entries(result.shipsin).forEach(([k, v]) => { if (v > 0) lines.push(`${k}: ${v}`); });

    lines.push('');
    lines.push(`[격국 후보] ${result.kyukguk}`);
    lines.push(`[용신 후보] ${result.yongshin.ohaeng} — ${result.yongshin.reason}`);

    lines.push('');
    lines.push('[대운 (10년 단위)]');
    result.daewoon.forEach((d) => lines.push(`${d.startYear}년~ (${d.startAge}세~) ${d.ganZhi}`));

    return lines.join('\n');
  }

  // ============== Export ==============
  global.SajuEngine = {
    analyze,
    attachPillarDetail,
    toReadingContext,
    tables: {
      STEMS,
      BRANCHES,
      BRANCH_HANGUL,
      TEN_GOD_HANGUL,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);

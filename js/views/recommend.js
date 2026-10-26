import { state } from '../store.js';
import { recommend, seasonOf, fmtHours, SEASONS, TRIPS, ORIGINS } from '../recommend.js';
import { esc, storage, toast } from '../util.js';
import { openPamphletSheet } from './pamphlet-sheet.js';

const PREF_KEY = 'korea100.recommend';
const SEASON_ICON = { 봄: '🌸', 여름: '🌊', 가을: '🍁', 겨울: '❄️' };
const MODE_TEXT = {
  car: (h) => `자동차 편도 약 ${fmtHours(h)}`,
  air: () => '항공 이동 (공항 오가는 시간 포함 편도 약 3시간 30분)',
  ferry: (h) => `여객선 이동 (항구까지 포함 편도 약 ${fmtHours(h)}, 기상 따라 결항 가능)`,
};

function loadPrefs() {
  return { tripKey: '1n2d', originName: '서울', season: 'auto', here: null, ...storage.get(PREF_KEY, {}) };
}

function items() {
  return state.places.map((p) => ({ ...p, ...state.guide[p.id] })).filter((p) => p.area);
}

function chip(group, value, label, active) {
  return `<button type="button" class="chip${active ? ' active' : ''}" data-group="${group}" data-value="${esc(value)}" aria-pressed="${active}">${label}</button>`;
}

function stopHtml(s, season, first) {
  const inSeason = s.seasons.includes(season) && s.seasons.length < 4;
  return `
    ${!first && s.leg ? `<li class="leg">차로 약 ${fmtHours(s.leg)}</li>` : ''}
    <li class="stop">
      <a href="#/place/${s.id}">
        <span class="stop-name">${esc(s.name)}</span>
        <span class="stop-meta">${esc(s.sido)} · ${esc(s.sigungu)} · 약 ${fmtHours(s.hours)}${inSeason ? ` <span class="season-tag">${SEASON_ICON[season]} ${season} 추천</span>` : ''}</span>
      </a>
    </li>`;
}

function emptyDayText(i, days) {
  if (i === 0) return '출발하는 날: 이동한 뒤 숙소 근처를 둘러보거나 맛집을 찾아보세요.';
  if (i === days.length - 1) return '돌아오는 날: 여유롭게 이동하거나 근처 맛집을 들러 보세요.';
  if (days[i - 1].some((s) => s.hours >= 10)) return '앞 일정을 이어서 둘러보는 날이에요.';
  return '여유 일정: 앞에서 마음에 든 곳을 더 둘러보세요.';
}

function courseHtml(c, season, idx) {
  const inSeason = c.stops.filter((s) => s.seasons.includes(season) && s.seasons.length < 4).length;
  return `
    <article class="course">
      <header>
        <span class="course-num">코스 ${idx + 1}</span>
        <h2>${esc(c.title)}</h2>
        <p class="course-meta">${MODE_TEXT[c.mode](c.oneWay)}</p>
        <p class="course-meta">${c.stops.length}곳 · 관광과 지역 내 이동 약 ${fmtHours(c.tourHours)}${inSeason ? ` · ${season} 추천 ${inSeason}곳` : ''}</p>
      </header>
      ${c.days.map((d, i) => `
        <section class="day">
          <h3>${c.days.length > 1 ? `${i + 1}일차` : '일정'}</h3>
          ${d.length ? `<ol class="stops">${d.map((s, j) => stopHtml(s, season, j === 0)).join('')}</ol>`
            : `<p class="hint">${emptyDayText(i, c.days)}</p>`}
        </section>`).join('')}
      <button type="button" class="btn pamphlet-btn" data-course="${idx}">📄 이 코스로 팜플렛 만들기</button>
    </article>`;
}

export function renderRecommend(root) {
  const prefs = loadPrefs();
  const shown = new Set();
  const seen = new Set();

  const save = () => storage.set(PREF_KEY, prefs);
  const currentSeason = () => (prefs.season === 'auto' ? seasonOf(new Date().getMonth() + 1) : prefs.season);
  const origin = () => (prefs.originName === 'here' && prefs.here
    ? { name: '현재 위치', ...prefs.here }
    : ORIGINS.find((o) => o.name === prefs.originName) || ORIGINS[0]);

  const autoSeason = seasonOf(new Date().getMonth() + 1);

  root.innerHTML = `
    <header class="page-head">
      <h1>다음 여행 추천</h1>
      <p class="sub">아직 안 가 본 <strong>${state.places.length - state.visits.size}</strong>곳 중에서 골라 드려요</p>
    </header>

    <section class="panel rec-form">
      <div class="field">
        <span>여행 일정</span>
        <div class="seg">${Object.entries(TRIPS).map(([k, t]) => chip('tripKey', k, t.label, prefs.tripKey === k)).join('')}</div>
      </div>
      <div class="field">
        <span>계절</span>
        <div class="seg">
          ${chip('season', 'auto', `지금 (${SEASON_ICON[autoSeason]} ${autoSeason})`, prefs.season === 'auto')}
          ${SEASONS.map((s) => chip('season', s, `${SEASON_ICON[s]} ${s}`, prefs.season === s)).join('')}
        </div>
      </div>
      <label class="field">
        <span>출발지</span>
        <div class="origin-row">
          <select id="origin">
            ${prefs.here ? `<option value="here" ${prefs.originName === 'here' ? 'selected' : ''}>📍 현재 위치</option>` : ''}
            ${ORIGINS.map((o) => `<option value="${o.name}" ${prefs.originName === o.name ? 'selected' : ''}>${o.name}</option>`).join('')}
          </select>
          <button type="button" class="btn small" id="locate">📍 현재 위치</button>
        </div>
      </label>
    </section>

    <div id="rec-results" aria-live="polite"></div>`;

  const results = root.querySelector('#rec-results');

  function run(more = false) {
    if (!more) {
      shown.clear();
      seen.clear();
    }
    const season = currentSeason();
    const { results: courses, poolSize } = recommend(items(), {
      season,
      tripKey: prefs.tripKey,
      origin: origin(),
      visited: new Set(state.visits.keys()),
      skip: shown,
      seen: more ? seen : null,
      limit: 3,
    });
    courses.forEach((c) => {
      shown.add(c.key);
      c.stops.forEach((s) => seen.add(s.id));
    });

    if (state.visits.size >= state.places.length) {
      results.innerHTML = '<p class="empty">🎉 100곳을 모두 방문했어요!</p>';
      return;
    }
    if (!courses.length) {
      results.innerHTML = `<p class="empty">${more ? '더 보여 드릴 코스가 없어요.' : `${origin().name} 출발 ${TRIPS[prefs.tripKey].label}로 갈 수 있는 미방문 관광지가 없어요.`}<br><small>일정을 늘리거나 출발지를 바꿔 보세요.</small></p>
        ${more ? '<button type="button" class="btn" id="rec-reset">처음 추천으로</button>' : ''}`;
      results.querySelector('#rec-reset')?.addEventListener('click', () => run());
      return;
    }
    results.innerHTML = `
      <p class="result-count">${esc(origin().name)} 출발 · ${TRIPS[prefs.tripKey].label} · ${SEASON_ICON[season]} ${season} · 후보 ${poolSize}곳</p>
      ${courses.map((c, i) => courseHtml(c, season, i)).join('')}
      <button type="button" class="btn" id="rec-more">다른 코스 보기</button>
      <p class="hint small">이동 시간은 직선거리로 추정한 값이에요. 실제 경로와 소요 시간은 지도 앱에서 확인하세요. 운영 시간과 예약 필요 여부도 방문 전에 확인해 주세요.</p>`;
    results.querySelectorAll('.pamphlet-btn').forEach((b) => b.addEventListener('click', () => {
      const c = courses[Number(b.dataset.course)];
      openPamphletSheet({
        title: c.title,
        season,
        mode: c.mode,
        oneWay: c.oneWay,
        originName: origin().name,
        days: c.days.map((d) => d.map((s) => ({ id: s.id, leg: s.leg }))),
      });
    }));
    results.querySelector('#rec-more').addEventListener('click', () => {
      run(true);
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  root.querySelectorAll('.rec-form .chip').forEach((btn) => btn.addEventListener('click', () => {
    const { group, value } = btn.dataset;
    prefs[group] = value;
    save();
    btn.parentElement.querySelectorAll('.chip').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-pressed', b === btn);
    });
    run();
  }));

  root.querySelector('#origin').addEventListener('change', (e) => {
    prefs.originName = e.target.value;
    save();
    run();
  });

  root.querySelector('#locate').addEventListener('click', () => {
    if (!navigator.geolocation) {
      toast('이 브라우저에서는 위치를 쓸 수 없어요');
      return;
    }
    toast('현재 위치를 확인하는 중…');
    navigator.geolocation.getCurrentPosition((pos) => {
      prefs.here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      prefs.originName = 'here';
      save();
      renderRecommend(root);
    }, () => toast('위치를 가져오지 못했어요. 출발지를 직접 골라 주세요.'), { timeout: 10000, maximumAge: 600000 });
  });

  run();
}

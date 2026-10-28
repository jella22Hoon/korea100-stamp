import { state, allPlaces, isCustom, officialVisits } from '../store.js';
import { SIDO_ORDER, CATEGORIES, esc, formatDate, stars, storage, toast, naverMap } from '../util.js';
import { km, driveHours, fmtHours, planCourse, seasonOf, TRIPS } from '../recommend.js';
import { plan, savePlan, inPlan, togglePlan, prunePlan, planOrigin, setPlanOrigin, originOptions } from '../plan.js';
import { openPamphletSheet } from './pamphlet-sheet.js';
import { openOriginSheet } from './origin-sheet.js';
import { openPlaceForm } from './place-form.js';

const FILTER_KEY = 'korea100.filters';

// 사용자가 버튼을 눌렀을 때만 한 번 위치를 가져온다. 화면을 오가도 마지막 결과를 유지하고 자동 갱신은 하지 않는다.
let nearby = null; // { lat, lng, at }
let locating = false;

function nearestPlaces(pos, n = 3) {
  const here = [pos.lat, pos.lng];
  return allPlaces()
    .map((p) => ({ place: p, area: state.guide[p.id]?.area }))
    .filter((x) => x.area)
    .map((x) => ({ ...x, dist: km(here, x.area), drive: driveHours(here, x.area) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n);
}

function fmtKm(d) {
  return d < 1 ? '1km 이내' : `약 ${d < 10 ? d.toFixed(1) : Math.round(d)}km`;
}

function renderNearby(box) {
  if (locating) {
    box.innerHTML = '<p class="nearby-msg">📍 현재 위치를 확인하는 중…</p>';
    return;
  }
  if (!nearby) {
    box.innerHTML = `
      <button type="button" class="btn nearby-find" id="nearby-find">📍 내 주변 관광지 찾기</button>
      <p class="hint small">버튼을 누를 때만 위치를 한 번 확인해요. 계속 추적하지 않아요.</p>`;
  } else {
    const at = new Date(nearby.at);
    const time = `${at.getHours()}시 ${String(at.getMinutes()).padStart(2, '0')}분`;
    box.innerHTML = `
      <div class="nearby-head">
        <h2>📍 내 주변 관광지</h2>
        <button type="button" class="btn small" id="nearby-find">다시 찾기</button>
      </div>
      <ol class="nearby-list">
        ${nearestPlaces(nearby).map(({ place, dist, drive }) => {
          const visited = state.visits.has(place.id);
          return `
            <li><a href="#/place/${place.id}" class="${visited ? 'visited' : ''}">
              <span class="nearby-name">${esc(place.name)}${visited ? ' <span class="mini-stamp">방문</span>' : ''}</span>
              <span class="nearby-meta">${esc(place.sido)} · ${esc(place.sigungu)} · ${fmtKm(dist)}${dist >= 1 ? ` · 차로 약 ${fmtHours(drive)}` : ''}</span>
            </a></li>`;
        }).join('')}
      </ol>
      <p class="hint small">${time} 위치 기준이에요. 거리는 직선거리와 대략 위치로 계산한 추정값이에요.</p>`;
  }
  box.querySelector('#nearby-find').addEventListener('click', () => locate(box));
}

function locate(box) {
  if (!navigator.geolocation || !window.isSecureContext) {
    box.querySelector('.nearby-err')?.remove();
    box.insertAdjacentHTML('beforeend', '<p class="nearby-msg nearby-err">이 화면에서는 위치를 쓸 수 없어요. https 주소로 접속했는지 확인해 주세요.</p>');
    return;
  }
  locating = true;
  renderNearby(box);
  navigator.geolocation.getCurrentPosition((pos) => {
    locating = false;
    nearby = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() };
    renderNearby(box);
  }, (err) => {
    locating = false;
    renderNearby(box);
    const msg = err.code === 1
      ? '위치 권한이 꺼져 있어요. 브라우저나 휴대폰 설정에서 이 사이트의 위치 권한을 허용해 주세요.'
      : '위치를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.';
    box.insertAdjacentHTML('beforeend', `<p class="nearby-msg nearby-err">${msg}</p>`);
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
}

const filters = { q: '', sido: '', category: '', status: 'all', set: '', ...storage.get(FILTER_KEY, {}) };
let picking = false; // 목록에서 일정에 담을 곳을 고르는 중

const MODE_TEXT = {
  car: (h) => `자동차 편도 약 ${fmtHours(h)}`,
  air: () => '항공 이동 (편도 약 3시간 30분)',
  ferry: (h) => `여객선 이동 (편도 약 ${fmtHours(h)})`,
};

const planItems = () => plan.ids.map((id) => state.placeById.get(id)).filter(Boolean)
  .map((p) => ({ ...state.guide[p.id], ...p }));

function planHtml() {
  if (!plan.ids.length && !picking) {
    return `
      <button type="button" class="btn nearby-find" data-plan="pick">🧳 여행 일정 짜서 팜플렛 만들기</button>
      <p class="hint small">당일치기·1박 2일 같은 일정을 고르고 목록에서 가고 싶은 곳을 담으면, 날짜별로 나눠 팜플렛을 만들어요.</p>`;
  }
  const origin = planOrigin();
  const c = plan.ids.length ? planCourse(planItems(), plan.tripKey, origin) : null;
  const trip = TRIPS[plan.tripKey];
  const warn = [];
  if (c && c.tourHours > c.budget) warn.push(`${trip.label}에 비해 둘러볼 곳이 많아요. 일정을 늘리거나 몇 곳을 빼 보세요.`);
  if (c?.tooFar) warn.push(`${origin.name}에서 멀어 ${trip.label}로는 빠듯해요.`);
  if (c?.mixed) warn.push('섬(제주·울릉도)과 육지가 섞여 있어 이동 시간이 정확하지 않아요.');
  return `
    <div class="nearby-head">
      <h2>🧳 내 여행 일정</h2>
      ${plan.ids.length ? '<button type="button" class="btn small ghost" data-plan="clear">비우기</button>' : ''}
    </div>
    <div class="seg plan-trip" role="group" aria-label="여행 일정">
      ${Object.entries(TRIPS).map(([k, t]) => chip('trip', k, t.label, plan.tripKey === k)).join('')}
    </div>
    <div class="plan-origin"><span>출발지</span>
      <select id="plan-origin" aria-label="출발지">${originOptions()}</select>
      <button type="button" class="btn small" data-plan="origin">🗺 지도</button>
    </div>
    ${origin.address ? `<p class="plan-addr">${esc(origin.address)} <a href="${esc(naverMap(origin.address))}" target="_blank" rel="noopener noreferrer">네이버 지도에서 확인 ↗</a></p>` : ''}
    ${c ? `
      <p class="plan-meta">${MODE_TEXT[c.mode](c.oneWay)} · 관광과 지역 내 이동 약 ${fmtHours(c.tourHours)}</p>
      <ol class="plan-days">${c.days.map((d, i) => `
        <li><b>${c.days.length > 1 ? `${i + 1}일차` : '일정'}</b>
          ${d.length ? d.map((x) => `<span class="plan-stop">${esc(x.name)}<button type="button" data-remove="${x.id}" aria-label="${esc(x.name)} 빼기">✕</button></span>`).join('')
            : '<span class="hint small">이동·자유 일정</span>'}
        </li>`).join('')}</ol>
      ${warn.map((w) => `<p class="nearby-msg nearby-err">${w}</p>`).join('')}`
    : '<p class="hint small">아래 목록에서 가고 싶은 곳을 눌러 담아 주세요.</p>'}
    <div class="row">
      <button type="button" class="btn${picking ? ' primary' : ''}" data-plan="pick">${picking ? '✓ 다 골랐어요' : '+ 목록에서 담기'}</button>
      <button type="button" class="btn" data-plan="pamphlet" ${c ? '' : 'disabled'}>📄 팜플렛</button>
    </div>
    <p class="hint small">방문 순서와 날짜는 출발지에서 가까운 곳부터 자동으로 나눠요. 이동 시간은 직선거리로 추정한 값이에요.</p>`;
}

function saveFilters() {
  storage.set(FILTER_KEY, filters);
}

function chip(group, value, label, active) {
  return `<button type="button" class="chip${active ? ' active' : ''}" data-group="${group}" data-value="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
}

function matches(place) {
  if (filters.set === 'official' && isCustom(place)) return false;
  if (filters.set === 'custom' && !isCustom(place)) return false;
  const visited = state.visits.has(place.id);
  if (filters.status === 'visited' && !visited) return false;
  if (filters.status === 'unvisited' && visited) return false;
  if (filters.sido && place.sido !== filters.sido) return false;
  if (filters.category && place.category !== filters.category) return false;
  if (filters.q) {
    const q = filters.q.trim().toLowerCase();
    const hay = `${place.name} ${place.sido} ${place.sigungu}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

const cardNum = (place) => (isCustom(place) ? '+' : Number(place.id.slice(1)));

export function card(place) {
  const visit = state.visits.get(place.id);
  const on = inPlan(place.id);
  // 일정에 담는 중에는 누르면 담기/빼기
  const open = picking
    ? `<button type="button" class="card pickable${visit ? ' visited' : ''}${on ? ' picked' : ''}" data-pick="${place.id}" aria-pressed="${on}">`
    : `<a class="card${visit ? ' visited' : ''}${isCustom(place) ? ' custom' : ''}" href="#/place/${place.id}">`;
  return `
    ${open}
      <span class="card-num">${picking && on ? '✓' : cardNum(place)}</span>
      <span class="card-body">
        <span class="card-name">${esc(place.name)}</span>
        <span class="card-meta">${esc(place.sido)} · ${esc(place.sigungu)} <span class="tag">${esc(place.category)}</span></span>
        ${visit ? `<span class="card-visit">${formatDate(visit.visitedAt)} <span class="stars" aria-label="별점 ${visit.rating}점">${stars(visit.rating)}</span></span>` : ''}
      </span>
      ${visit ? '<span class="stamp" aria-label="방문 완료">VISITED</span>' : ''}
    ${picking ? '</button>' : '</a>'}`;
}

export function renderList(root) {
  picking = false;
  prunePlan((id) => state.placeById.has(id));
  const sidoCounts = new Map();
  allPlaces().forEach((p) => sidoCounts.set(p.sido, (sidoCounts.get(p.sido) || 0) + 1));

  root.innerHTML = `
    <header class="page-head">
      <h1>한국관광 100선</h1>
      <p class="sub"><strong>${officialVisits()}</strong> / ${state.places.length} 곳 방문${state.custom.length ? ` · 추가한 여행지 ${state.custom.length}곳` : ''}</p>
    </header>
    <section class="panel nearby" id="nearby" aria-live="polite"></section>
    <section class="panel nearby plan" id="plan"></section>
    <div class="filters">
      <label class="search">
        <span class="sr-only">검색</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" id="q" placeholder="관광지, 지역 검색" value="${esc(filters.q)}" autocomplete="off">
      </label>
      <div class="seg" role="group" aria-label="방문 상태">
        ${[['all', '전체'], ['unvisited', '미방문'], ['visited', '방문']].map(([v, l]) => chip('status', v, l, filters.status === v)).join('')}
      </div>
      <div class="chips" role="group" aria-label="시·도">
        ${chip('sido', '', '전국', !filters.sido)}
        ${SIDO_ORDER.filter((s) => sidoCounts.has(s)).map((s) => chip('sido', s, `${s} ${sidoCounts.get(s)}`, filters.sido === s)).join('')}
      </div>
      <div class="chips" role="group" aria-label="분류">
        ${chip('category', '', '모든 분류', !filters.category)}
        ${CATEGORIES.map((c) => chip('category', c, c, filters.category === c)).join('')}
      </div>
      ${state.custom.length ? `<div class="chips" role="group" aria-label="구분">
        ${chip('set', '', '전체', !filters.set)}${chip('set', 'official', '100선', filters.set === 'official')}${chip('set', 'custom', '내가 추가', filters.set === 'custom')}
      </div>` : ''}
    </div>
    <p class="result-count" id="count" aria-live="polite"></p>
    <div class="cards" id="results"></div>
    <button type="button" class="btn add-place" id="add-place">➕ 100선에 없는 여행지 추가</button>
    <div class="plan-bar" id="plan-bar" hidden></div>`;

  const results = root.querySelector('#results');
  const count = root.querySelector('#count');

  const planBox = root.querySelector('#plan');
  const planBar = root.querySelector('#plan-bar');

  function renderPlan() {
    planBox.innerHTML = planHtml();
    planBar.hidden = !picking;
    planBar.innerHTML = `<span>${TRIPS[plan.tripKey].label} · <b>${plan.ids.length}곳</b> 담음</span>
      <button type="button" class="btn small primary" data-plan="done">다 골랐어요</button>`;
  }

  function onPlan(e) {
    const t = e.target.closest('[data-plan], [data-remove], .chip[data-group="trip"]');
    if (!t || t.disabled) return;
    if (t.dataset.remove) {
      togglePlan(t.dataset.remove);
    } else if (t.dataset.group === 'trip') {
      plan.tripKey = t.dataset.value;
      savePlan();
    } else if (t.dataset.plan === 'pick' || t.dataset.plan === 'done') {
      picking = t.dataset.plan === 'pick' ? !picking : false;
      if (picking) toast('목록에서 가고 싶은 곳을 눌러 담아 주세요');
    } else if (t.dataset.plan === 'clear') {
      if (!confirm('담아 둔 여행지를 모두 뺄까요?')) return;
      plan.ids = [];
      savePlan();
    } else if (t.dataset.plan === 'origin') {
      openOriginSheet(renderPlan);
      return;
    } else if (t.dataset.plan === 'pamphlet') {
      const origin = planOrigin();
      const c = planCourse(planItems(), plan.tripKey, origin);
      if (!c) return;
      openPamphletSheet({
        title: c.title,
        season: seasonOf(new Date().getMonth() + 1),
        mode: c.mode,
        oneWay: c.oneWay,
        originName: origin.name,
        days: c.days.map((d) => d.map((x) => ({ id: x.id, leg: x.leg }))),
      });
      return;
    }
    const wasPicking = t.dataset.plan === 'done' || (t.dataset.plan === 'pick' && !picking);
    renderPlan();
    renderResults();
    if (wasPicking) planBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  planBox.addEventListener('click', onPlan);
  planBar.addEventListener('click', onPlan);
  planBox.addEventListener('change', (e) => {
    if (e.target.id !== 'plan-origin') return;
    if (e.target.value === '__search') {
      renderPlan(); // 선택을 원래대로 돌려 두고 찾기 시트를 연다
      openOriginSheet(renderPlan);
      return;
    }
    setPlanOrigin(e.target.value);
    renderPlan();
  });
  results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const on = togglePlan(b.dataset.pick);
    b.classList.toggle('picked', on);
    b.setAttribute('aria-pressed', on);
    b.querySelector('.card-num').textContent = on ? '✓' : cardNum(state.placeById.get(b.dataset.pick));
    renderPlan();
  });
  root.querySelector('#add-place').addEventListener('click', () => openPlaceForm());

  function renderResults() {
    const list = allPlaces().filter(matches);
    count.textContent = `${list.length}곳`;
    results.innerHTML = list.length
      ? list.map(card).join('')
      : '<p class="empty">조건에 맞는 관광지가 없어요.</p>';
  }

  root.querySelector('#q').addEventListener('input', (e) => {
    filters.q = e.target.value;
    saveFilters();
    renderResults();
  });

  root.querySelectorAll('.filters .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { group, value } = btn.dataset;
      filters[group] = value;
      saveFilters();
      btn.parentElement.querySelectorAll('.chip').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on);
      });
      renderResults();
    });
  });

  renderResults();
  renderPlan();
  renderNearby(root.querySelector('#nearby'));
}

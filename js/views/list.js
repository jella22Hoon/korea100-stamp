import { state } from '../store.js';
import { SIDO_ORDER, CATEGORIES, esc, formatDate, stars, storage } from '../util.js';
import { km, driveHours, fmtHours } from '../recommend.js';

const FILTER_KEY = 'korea100.filters';

// 사용자가 버튼을 눌렀을 때만 한 번 위치를 가져온다. 화면을 오가도 마지막 결과를 유지하고 자동 갱신은 하지 않는다.
let nearby = null; // { lat, lng, at }
let locating = false;

function nearestPlaces(pos, n = 3) {
  const here = [pos.lat, pos.lng];
  return state.places
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

const filters = storage.get(FILTER_KEY, { q: '', sido: '', category: '', status: 'all' });

function saveFilters() {
  storage.set(FILTER_KEY, filters);
}

function chip(group, value, label, active) {
  return `<button type="button" class="chip${active ? ' active' : ''}" data-group="${group}" data-value="${esc(value)}" aria-pressed="${active}">${esc(label)}</button>`;
}

function matches(place) {
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

export function card(place) {
  const visit = state.visits.get(place.id);
  const num = Number(place.id.slice(1));
  return `
    <a class="card${visit ? ' visited' : ''}" href="#/place/${place.id}">
      <span class="card-num">${num}</span>
      <span class="card-body">
        <span class="card-name">${esc(place.name)}</span>
        <span class="card-meta">${esc(place.sido)} · ${esc(place.sigungu)} <span class="tag">${esc(place.category)}</span></span>
        ${visit ? `<span class="card-visit">${formatDate(visit.visitedAt)} <span class="stars" aria-label="별점 ${visit.rating}점">${stars(visit.rating)}</span></span>` : ''}
      </span>
      ${visit ? '<span class="stamp" aria-label="방문 완료">VISITED</span>' : ''}
    </a>`;
}

export function renderList(root) {
  const sidoCounts = new Map();
  state.places.forEach((p) => sidoCounts.set(p.sido, (sidoCounts.get(p.sido) || 0) + 1));

  root.innerHTML = `
    <header class="page-head">
      <h1>한국관광 100선</h1>
      <p class="sub"><strong>${state.visits.size}</strong> / ${state.places.length} 곳 방문</p>
    </header>
    <section class="panel nearby" id="nearby" aria-live="polite"></section>
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
    </div>
    <p class="result-count" id="count" aria-live="polite"></p>
    <div class="cards" id="results"></div>`;

  const results = root.querySelector('#results');
  const count = root.querySelector('#count');

  function renderResults() {
    const list = state.places.filter(matches);
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

  root.querySelectorAll('.chip').forEach((btn) => {
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
  renderNearby(root.querySelector('#nearby'));
}

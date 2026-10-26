import { state } from '../store.js';
import { SIDO_ORDER, CATEGORIES, esc, formatDate, stars, storage } from '../util.js';

const FILTER_KEY = 'korea100.filters';

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
}

// 홈에서 입력한 목적지 주변 여행지 추천 결과
import { state, registerSpot } from '../store.js';
import { esc, toast, formatDate } from '../util.js';
import { TRIPS, fmtHours, driveHours } from '../recommend.js';
import { plan, inPlan, togglePlan, planOrigin } from '../plan.js';
import { trip } from '../trip.js';
import { resolveDest, findSpots, searchLinks, RADIUS } from '../explore.js';

const ICON = { 자연: '🌿', 역사: '🏯', 문화: '🏛', 도시: '🏙', 레저: '🎡' };

// 같은 조건으로 다시 들어오면(상세 화면에서 뒤로) 다시 찾지 않는다
let last = null; // { key, dest, list, done }

function cardHtml(s, dest) {
  const id = s.placeId || state.spots.find((x) => x.key?.startsWith(`${s.wikiTitle || s.name}|`))?.id;
  const on = id && inPlan(id);
  const badge = s.official ? '<span class="badge-100">🏅 100선</span>' : s.custom ? '<span class="badge-mine">내 여행지</span>' : '';
  const dist = s.rough ? '' : s.dist < 1 ? '1km 이내' : `${dest.near ? '출발지에서' : '중심에서'} 약 ${Math.round(s.dist)}km`;
  const meta = [s.kindLabel || s.category, dist, s.source].filter(Boolean).join(' · ');
  return `
    <li class="spot${s.official ? ' official' : ''}">
      <button type="button" class="spot-open" data-key="${esc(s.key)}">
        ${s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'spot-ico',textContent:'${ICON[s.category] || '📍'}'}))">`
          : `<span class="spot-ico" aria-hidden="true">${ICON[s.category] || '📍'}</span>`}
        <span class="spot-body">
          <span class="spot-name">${esc(s.name)} ${badge}</span>
          <span class="spot-meta">${esc(meta)}</span>
          ${s.note ? `<span class="spot-note">${esc(s.note.length > 60 ? `${s.note.slice(0, 60)}…` : s.note)}</span>` : ''}
        </span>
      </button>
      <button type="button" class="spot-add${on ? ' on' : ''}" data-add="${esc(s.key)}" aria-pressed="${!!on}" aria-label="${esc(s.name)} 일정에 담기">${on ? '✓' : '+'}</button>
    </li>`;
}

export function renderExplore(root) {
  const t = TRIPS[plan.tripKey];
  const origin = planOrigin();
  const key = `${trip.dest}|${plan.tripKey}|${origin.name}`;
  const summary = [t.label, trip.startDate ? formatDate(trip.startDate) : '', `${trip.people}명`, `${origin.name} 출발`].filter(Boolean);

  root.innerHTML = `
    <a class="back" href="#/home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg> 조건 바꾸기</a>
    <header class="page-head">
      <h1 id="ex-title">${trip.dest ? `${esc(trip.dest)} 여행지` : `${esc(origin.name)} 주변 여행지`}</h1>
      <p class="sub">${summary.map(esc).join(' · ')}</p>
    </header>
    <div class="ex-search" id="ex-search"></div>
    <p class="hint small" id="ex-status" aria-live="polite">여행지를 찾는 중…</p>
    <ul class="spots" id="ex-list"></ul>
    <p class="hint small ex-src">🏅 표시는 한국관광 100선이에요. 추천은 앱의 100선·내 여행지와 위키백과·오픈스트리트맵 공개 자료를 합친 것이라 빠진 곳이 있을 수 있어요. 네이버·구글 검색으로 더 찾아보세요.</p>
    <a class="plan-bar ex-bar" id="ex-bar" href="#/list" hidden></a>`;

  const list = root.querySelector('#ex-list');
  const status = root.querySelector('#ex-status');
  const bar = root.querySelector('#ex-bar');
  let dest = null;
  let spots = [];

  const paintBar = () => {
    bar.hidden = !plan.ids.length;
    bar.innerHTML = `<span>🧳 <b>${plan.ids.length}곳</b> 담음</span><span class="btn small primary">일정·팜플렛 보기</span>`;
  };

  function paint(items, done) {
    spots = items;
    const n100 = items.filter((s) => s.official).length;
    list.innerHTML = items.map((s) => cardHtml(s, dest)).join('');
    status.textContent = done
      ? (items.length ? `${items.length}곳을 찾았어요${n100 ? ` · 그중 한국관광 100선 ${n100}곳` : ''}. 눌러서 자세히 보거나 + 로 일정에 담으세요.` : '주변에서 찾은 여행지가 없어요. 네이버·구글 검색으로 찾아보세요.')
      : `찾는 중… ${items.length ? `${items.length}곳` : ''}`;
    paintBar();
  }

  const spotId = (s) => s.placeId || registerSpot({ ...s, sido: dest.sido, sigungu: dest.sigungu });

  list.addEventListener('click', (e) => {
    const open = e.target.closest('[data-key]');
    const add = e.target.closest('[data-add]');
    const s = spots.find((x) => x.key === (open?.dataset.key || add?.dataset.add));
    if (!s) return;
    const id = spotId(s);
    if (open) {
      location.hash = `#/place/${id}`;
      return;
    }
    const on = togglePlan(id);
    add.classList.toggle('on', on);
    add.textContent = on ? '✓' : '+';
    add.setAttribute('aria-pressed', on);
    toast(on ? `일정에 담았어요 (${plan.ids.length}곳)` : '일정에서 뺐어요');
    paintBar();
  });

  function showSearch(name) {
    const l = searchLinks(name);
    root.querySelector('#ex-search').innerHTML = `
      <a class="maplink naver" href="${esc(l.naver)}" target="_blank" rel="noopener noreferrer"><b>N</b> 네이버에서 더 보기</a>
      <a class="maplink google" href="${esc(l.google)}" target="_blank" rel="noopener noreferrer"><b>G</b> 구글에서 더 보기</a>`;
  }

  function showDest() {
    const near = !!dest.near;
    root.querySelector('#ex-title').textContent = near ? `${dest.name} 주변 여행지` : `${dest.name} 여행지`;
    showSearch(near ? (dest.sigungu || '근처') : dest.name);
    // 출발지에서 목적지까지 차로 얼마나 걸리는지 한 줄 덧붙인다
    if (!near) {
      const h = driveHours([origin.lat, origin.lng], [dest.lat, dest.lng]);
      root.querySelector('.sub').textContent = `${summary.join(' · ')} · 차로 약 ${fmtHours(h)}(어림)`;
    }
  }

  if (last?.key === key && last.done) {
    dest = last.dest;
    showDest();
    paint(last.list, true);
    return;
  }

  (async () => {
    try {
      dest = await resolveDest(trip.dest, origin);
    } catch (err) {
      status.innerHTML = trip.dest
        ? `${esc(err.message || '목적지를 찾지 못했어요')}. 지역 이름(예: 강릉, 경주)이나 관광지 이름으로 다시 찾아 주세요. <a href="#/home">조건 바꾸기</a>`
        : '지금 위치를 확인하지 못했어요. 위치 권한을 허용하거나, 홈에서 가고 싶은 곳을 적어 주세요. <a href="#/home">조건 바꾸기</a>';
      if (trip.dest) showSearch(trip.dest);
      return;
    }
    if (!root.isConnected || location.hash !== '#/explore') return;
    showDest();
    const result = await findSpots(dest, RADIUS[plan.tripKey] || 25, (items) => {
      if (root.isConnected) paint(items, false);
    });
    last = { key, dest, list: result, done: true };
    if (root.isConnected && location.hash === '#/explore') paint(result, true);
  })();
}

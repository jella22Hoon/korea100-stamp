// 첫 화면: 한 문장과 입력 칸 몇 개, 버튼 하나
import { allPlaces } from '../store.js';
import { esc, today } from '../util.js';
import { TRIPS } from '../recommend.js';
import { plan, originOptions, setPlanOrigin, planOrigin } from '../plan.js';
import { trip, saveTrip } from '../trip.js';
import { openOriginSheet } from './origin-sheet.js';

const MAX_PEOPLE = 20;

export function renderHome(root) {
  const names = [...new Set(allPlaces().flatMap((p) => [p.name, p.sigungu]).filter((x) => x && !/외|전역/.test(x)))];

  root.innerHTML = `
    <section class="home">
      <h1 class="home-title">이번엔 어디로<br>떠나 볼까요?</h1>
      <form class="home-form" autocomplete="off">
        <label class="home-dest">
          <span class="sr-only">가고 싶은 곳</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" name="dest" list="home-dest-list" maxlength="40" value="${esc(trip.dest)}" placeholder="가고 싶은 곳 (비워 두면 출발지 주변)" enterkeyhint="search">
          <datalist id="home-dest-list">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        </label>
        <div class="home-grid">
          <label class="home-field"><span>여행 기간</span>
            <select name="tripKey">${Object.entries(TRIPS).map(([k, t]) => `<option value="${k}" ${plan.tripKey === k ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
          </label>
          <label class="home-field"><span>출발일</span>
            <input type="date" name="startDate" min="${today()}" value="${trip.startDate >= today() ? esc(trip.startDate) : ''}">
          </label>
          <div class="home-field"><span id="people-label">인원</span>
            <div class="stepper" role="group" aria-labelledby="people-label">
              <button type="button" data-step="-1" aria-label="한 명 줄이기">−</button>
              <output name="people">${trip.people}명</output>
              <button type="button" data-step="1" aria-label="한 명 늘리기">+</button>
            </div>
          </div>
          <div class="home-field"><span>출발지</span>
            <div class="home-origin">
              <select name="origin" aria-label="출발지">${originOptions()}</select>
              <button type="button" id="home-map" aria-label="지도에서 출발지 고르기">🗺</button>
            </div>
          </div>
        </div>
        <button type="submit" class="btn primary big home-go" id="home-go"></button>
      </form>
      <p class="home-foot">한국관광 100선 목록·방문 기록은 아래 메뉴에서 볼 수 있어요</p>
    </section>`;

  const form = root.querySelector('form');
  const go = root.querySelector('#home-go');
  const label = () => {
    const d = form.elements.dest.value.trim();
    go.textContent = d ? `🔍 '${d}' 여행지 추천받기` : `📍 '${planOrigin().name}' 주변 여행지 추천받기`;
  };
  label();

  form.elements.dest.addEventListener('input', label);
  form.elements.tripKey.addEventListener('change', (e) => saveTrip({ tripKey: e.target.value }));
  form.elements.startDate.addEventListener('change', (e) => saveTrip({ startDate: e.target.value }));
  form.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const n = Math.min(MAX_PEOPLE, Math.max(1, trip.people + Number(b.dataset.step)));
    saveTrip({ people: n });
    form.elements.people.value = `${n}명`;
  }));
  const pickOnMap = () => openOriginSheet(() => {
    form.elements.origin.innerHTML = originOptions();
    label();
  });
  root.querySelector('#home-map').addEventListener('click', pickOnMap);
  form.elements.origin.addEventListener('change', (e) => {
    if (e.target.value === '__search') {
      e.target.innerHTML = originOptions();
      pickOnMap();
      return;
    }
    setPlanOrigin(e.target.value);
    label();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveTrip({ dest: form.elements.dest.value.trim() });
    location.hash = '#/explore';
  });
}

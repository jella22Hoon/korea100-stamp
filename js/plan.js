// 목록 화면의 '내 여행 일정': 직접 고른 관광지와 여행 일정(당일치기, 1박 2일 …)을 이 기기에 저장한다
import { storage, esc } from './util.js';
import { ORIGINS } from './recommend.js';

const PLAN_KEY = 'korea100.plan';
const PREF_KEY = 'korea100.recommend'; // 출발지는 '다음 여행 추천'과 같은 값을 쓴다
const MAX_SAVED = 5;

export const plan = { tripKey: '1n2d', ids: [], ...storage.get(PLAN_KEY, {}) };

export function savePlan() {
  storage.set(PLAN_KEY, { tripKey: plan.tripKey, ids: plan.ids });
}

export const inPlan = (id) => plan.ids.includes(id);

export function togglePlan(id) {
  plan.ids = inPlan(id) ? plan.ids.filter((x) => x !== id) : [...plan.ids, id];
  savePlan();
  return inPlan(id);
}

// 지운 여행지 등 없어진 id는 빼 둔다
export function prunePlan(exists) {
  const before = plan.ids.length;
  plan.ids = plan.ids.filter(exists);
  if (plan.ids.length !== before) savePlan();
}

// ── 출발지: 주요 도시, 현재 위치, 주소로 찾아 저장한 곳(saved: [{ id, name, lat, lng, address }]) ──

const prefs = () => ({ originName: '서울', here: null, saved: [], ...storage.get(PREF_KEY, {}) });

export const savedOrigins = () => prefs().saved || [];

export function resolveOrigin(p = prefs()) {
  if (p.originName === 'here' && p.here) return { name: '현재 위치', ...p.here };
  if (p.originName?.startsWith('saved:')) {
    const s = (p.saved || []).find((x) => `saved:${x.id}` === p.originName);
    if (s) return s;
  }
  return ORIGINS.find((o) => o.name === p.originName) || ORIGINS[0];
}

export const planOrigin = () => resolveOrigin();

export function setPlanOrigin(value) {
  storage.set(PREF_KEY, { ...storage.get(PREF_KEY, {}), originName: value });
}

// 같은 이름은 바꿔 저장하고, 고른 곳을 출발지로 정한다
export function addSavedOrigin({ name, lat, lng, address }) {
  const p = prefs();
  const old = (p.saved || []).find((x) => x.name === name);
  const item = { id: old?.id || Date.now().toString(36), name, lat, lng, address };
  const saved = [item, ...(p.saved || []).filter((x) => x.name !== name)].slice(0, MAX_SAVED);
  storage.set(PREF_KEY, { ...storage.get(PREF_KEY, {}), saved, originName: `saved:${item.id}` });
  return item;
}

export function removeSavedOrigin(id) {
  const p = prefs();
  const next = { ...storage.get(PREF_KEY, {}), saved: (p.saved || []).filter((x) => x.id !== id) };
  if (p.originName === `saved:${id}`) next.originName = '서울';
  storage.set(PREF_KEY, next);
}

// 출발지 <select>의 선택지. 저장한 곳을 맨 위에 둔다
export function originOptions(p = prefs()) {
  const cur = p.originName;
  return [
    ...(p.saved || []).map((s) => `<option value="saved:${esc(s.id)}" ${cur === `saved:${s.id}` ? 'selected' : ''}>🏠 ${esc(s.name)}</option>`),
    p.here ? `<option value="here" ${cur === 'here' ? 'selected' : ''}>📍 현재 위치</option>` : '',
    ...ORIGINS.map((o) => `<option value="${o.name}" ${cur === o.name ? 'selected' : ''}>${o.name}</option>`),
    '<option value="__search">🗺 지도에서 고르기…</option>',
  ].join('');
}

// 목록 화면의 '내 여행 일정': 직접 고른 관광지와 여행 일정(당일치기, 1박 2일 …)을 이 기기에 저장한다
import { storage } from './util.js';
import { ORIGINS } from './recommend.js';

const PLAN_KEY = 'korea100.plan';
const PREF_KEY = 'korea100.recommend'; // 출발지는 '다음 여행 추천'과 같은 값을 쓴다

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

export function planOrigin() {
  const prefs = { originName: '서울', here: null, ...storage.get(PREF_KEY, {}) };
  if (prefs.originName === 'here' && prefs.here) return { name: '현재 위치', ...prefs.here };
  return ORIGINS.find((o) => o.name === prefs.originName) || ORIGINS[0];
}

export function setPlanOrigin(name) {
  storage.set(PREF_KEY, { ...storage.get(PREF_KEY, {}), originName: name });
}

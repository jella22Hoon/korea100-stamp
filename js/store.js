// 앱 전역 상태: 관광지 목록(읽기 전용)과 방문 기록(IndexedDB 캐시)
import * as db from './db.js';
import { storage } from './util.js';
import { km } from './recommend.js';
import { lookupPlace } from './enrich.js';

const INFO_KEY = 'korea100.placeInfo';
// 외부 자료 좌표가 기존 대략 위치에서 이보다 멀면 다른 곳으로 보고 쓰지 않는다
const MAX_SHIFT_KM = 30;
let loadedGuide = ''; // 새 버전 비교용(좌표를 덮어쓰기 전 원본)

export const state = {
  meta: null,
  places: [],
  placeById: new Map(),
  visits: new Map(),
  guide: {},
  guideMeta: null,
  // 사용자가 '관광지 정보 새로 받기'로 받아 둔 설명·사진·좌표 { updatedAt, items: { p001: {...} } }
  info: { updatedAt: null, items: {} },
  approx: {}, // guide.json의 원래 대략 위치
};

export async function load() {
  const res = await fetch('data/places.json');
  if (!res.ok) throw new Error(`places.json을 불러오지 못했습니다 (${res.status})`);
  const data = await res.json();
  state.meta = data.meta;
  state.places = data.places;
  state.placeById = new Map(data.places.map((p) => [p.id, p]));
  // 여행 정보는 없어도 앱이 동작하도록 실패를 허용한다
  try {
    const g = await fetch('data/guide.json').then((r) => (r.ok ? r.json() : null));
    loadedGuide = JSON.stringify(g);
    state.guideMeta = g?.meta || null;
    state.guide = g?.guide || {};
  } catch {
    state.guide = {};
  }
  state.approx = Object.fromEntries(Object.entries(state.guide).filter(([, g]) => g.area).map(([id, g]) => [id, g.area]));
  applyInfo(storage.get(INFO_KEY, null));
  await reloadVisits();
}

// 받아 둔 좌표가 믿을 만하면 대략 위치 대신 쓴다(내 주변·길찾기·추천 모두에 반영)
function applyInfo(info) {
  state.info = info?.items ? info : { updatedAt: null, items: {} };
  for (const [id, approx] of Object.entries(state.approx)) {
    const it = state.info.items[id];
    const ok = it?.lat && it?.lng && km(approx, [it.lat, it.lng]) <= MAX_SHIFT_KM;
    state.guide[id].area = ok ? [it.lat, it.lng] : approx;
    state.guide[id].areaExact = !!ok;
  }
}

/**
 * 100곳의 설명·사진·좌표를 TourAPI/위키백과에서 새로 받아 이 기기에 저장한다.
 * 못 찾은 곳은 예전에 받아 둔 값을 그대로 둔다. onProgress(done, total, found)
 */
export async function refreshPlaceInfo(onProgress, isCancelled = () => false) {
  const items = { ...state.info.items };
  let done = 0;
  let found = 0;
  const queue = [...state.places];
  // 위키백과가 요청이 몰리면 거절하므로 두 개씩만 동시에 보낸다
  await Promise.all([0, 1].map(async () => {
    while (queue.length && !isCancelled()) {
      const p = queue.shift();
      const r = await lookupPlace({ ...p, guide: state.guide[p.id] }).catch(() => null);
      if (r) {
        found++;
        items[p.id] = { text: r.text, image: r.image, source: r.source, url: r.url, title: r.title, lat: r.lat, lng: r.lng };
      }
      onProgress?.(++done, state.places.length, found);
    }
  }));
  const info = { updatedAt: new Date().toISOString(), items };
  storage.set(INFO_KEY, info);
  applyInfo(info);
  return { done, found, cancelled: isCancelled() };
}

export function clearPlaceInfo() {
  storage.set(INFO_KEY, null);
  applyInfo(null);
}

/**
 * 앱 파일과 기본 데이터(places.json, guide.json)의 새 버전이 있는지 확인한다.
 * 바뀐 게 있으면 true → 화면을 다시 불러오면 새 버전이 적용된다.
 */
export async function checkForUpdate() {
  let changed = false;
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (reg) {
    await reg.update().catch(() => {});
    if (reg.installing || reg.waiting) changed = true;
  }
  const [p, g] = await Promise.all(['data/places.json', 'data/guide.json']
    .map((u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))));
  if (p && JSON.stringify(p.places) !== JSON.stringify(state.places)) changed = true;
  if (g && JSON.stringify(g) !== loadedGuide) changed = true;
  return changed;
}

export async function reloadVisits() {
  const visits = await db.getAllVisits();
  state.visits = new Map(visits.map((v) => [v.placeId, v]));
}

export function isUnverified(place, field) {
  return place.unverified?.includes(field) || place[field] == null || place[field] === '';
}

export async function saveVisit(visit, photos) {
  const record = await db.saveVisit(visit, photos);
  state.visits.set(record.placeId, record);
  return record;
}

export async function deleteVisit(placeId) {
  await db.deleteVisit(placeId);
  state.visits.delete(placeId);
}

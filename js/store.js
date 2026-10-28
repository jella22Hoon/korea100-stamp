// 앱 전역 상태: 관광지 목록(읽기 전용)과 방문 기록(IndexedDB 캐시)
import * as db from './db.js';
import { storage } from './util.js';
import { km } from './recommend.js';
import { lookupPlace } from './enrich.js';
import { SIDO_CENTER } from './util.js';

const INFO_KEY = 'korea100.placeInfo';
export const CUSTOM_KEY = 'korea100.customPlaces';
const SPOT_KEY = 'korea100.spots'; // 홈 화면 검색으로 찾아 열어 본 곳(최근 순, 백업에는 넣지 않음)
const MAX_SPOTS = 80;
const ALL_SEASONS = ['봄', '여름', '가을', '겨울'];
// 외부 자료 좌표가 기존 대략 위치에서 이보다 멀면 다른 곳으로 보고 쓰지 않는다
const MAX_SHIFT_KM = 30;
const ROUGH_SHIFT_KM = 120;
let loadedGuide = ''; // 새 버전 비교용(좌표를 덮어쓰기 전 원본)

export const state = {
  meta: null,
  places: [], // 공식 100선(읽기 전용)
  custom: [], // 사용자가 직접 추가한 여행지
  spots: [], // 검색으로 찾아 열어 본 곳(내 여행지로 저장하기 전)
  placeById: new Map(), // 100선 + 추가한 여행지
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
  // 여행 정보는 없어도 앱이 동작하도록 실패를 허용한다
  try {
    const g = await fetch('data/guide.json').then((r) => (r.ok ? r.json() : null));
    // 한 줄 소개가 붙은 주요 관광 포인트(points.json)가 있으면 guide의 포인트 목록을 대신한다
    const pts = await fetch('data/points.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    loadedGuide = JSON.stringify([g, pts]);
    for (const [id, list] of Object.entries(pts?.points || {})) {
      if (!g?.guide?.[id]) continue;
      g.guide[id].points = list.map((x) => x.n);
      g.guide[id].pointDesc = Object.fromEntries(list.map((x) => [x.n, x.d]));
    }
    state.guideMeta = g?.meta || null;
    state.guide = g?.guide || {};
  } catch {
    state.guide = {};
  }
  state.approx = Object.fromEntries(Object.entries(state.guide).filter(([, g]) => g.area).map(([id, g]) => [id, g.area]));
  loadCustom();
  applyInfo(storage.get(INFO_KEY, null));
  await reloadVisits();
}

export const allPlaces = () => [...state.places, ...state.custom];
export const isCustom = (place) => !!place?.custom;
export const isSpot = (place) => !!place?.spot;
// 100선 진행률에는 공식 관광지 방문만 센다
export const officialVisits = () => state.places.filter((p) => state.visits.has(p.id)).length;

// 추가한 여행지도 100선과 같은 모양의 여행 정보(guide)를 만들어 둔다
function customGuide(c) {
  const hasXY = Number.isFinite(c.lat) && Number.isFinite(c.lng);
  const area = hasXY ? [c.lat, c.lng] : c.approxArea || SIDO_CENTER[c.sido] || null;
  return {
    q: c.q || c.name,
    points: (c.points || []).map((x) => x.n),
    pointDesc: Object.fromEntries((c.points || []).filter((x) => x.d).map((x) => [x.n, x.d])),
    foods: c.foods || [],
    seasons: c.seasons?.length ? c.seasons : ALL_SEASONS,
    hours: c.hours || 3,
    area,
    // 시·도 중심으로 대신한 위치는 '관광지 정보 새로 받기'의 좌표로 바꿀 수 있다
    areaRough: !hasXY,
    areaExact: hasXY,
    island: /울릉/.test(c.sigungu || '') ? 'ulleung' : undefined,
  };
}

function loadCustom() {
  for (const c of [...state.custom, ...state.spots]) {
    delete state.guide[c.id];
    delete state.approx[c.id];
  }
  state.custom = (storage.get(CUSTOM_KEY, []) || []).filter((c) => c?.id && c.name);
  state.spots = (storage.get(SPOT_KEY, []) || []).filter((c) => c?.id && c.name);
  for (const c of [...state.custom, ...state.spots]) {
    state.guide[c.id] = customGuide(c);
    if (state.guide[c.id].areaRough && state.guide[c.id].area) state.approx[c.id] = state.guide[c.id].area;
  }
  state.placeById = new Map([...allPlaces(), ...state.spots].map((p) => [p.id, p]));
}

/**
 * 검색 결과를 상세 화면에서 열 수 있게 기억해 둔다. 같은 곳이면 같은 id를 돌려준다.
 * spot: { name, lat, lng, sido, sigungu, category, note, image, wikiTitle, source, url, rough }
 */
export function registerSpot(spot) {
  const key = `${spot.wikiTitle || spot.name}|${spot.lat.toFixed(3)}|${spot.lng.toFixed(3)}`;
  const old = state.spots.find((x) => x.key === key);
  const id = old?.id || `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const item = {
    id, key, spot: true,
    name: spot.name, sido: spot.sido || '', sigungu: spot.sigungu || '', category: spot.category || '도시',
    description: null, note: spot.note || '', image: spot.image || '',
    lat: spot.rough ? null : spot.lat, lng: spot.rough ? null : spot.lng,
    approxArea: spot.rough ? [spot.lat, spot.lng] : null, // 좌표가 없는 문서는 목적지 중심으로 대신한다
    q: spot.sigungu && !spot.name.includes(spot.sigungu.replace(/(시|군|구)$/, '')) ? `${spot.sigungu} ${spot.name}` : spot.name,
    wikiTitle: spot.wikiTitle || '', source: spot.source || '', url: spot.url || '', hours: 2,
  };
  storage.set(SPOT_KEY, [item, ...state.spots.filter((x) => x.id !== id)].slice(0, MAX_SPOTS));
  loadCustom();
  applyInfo(state.info);
  return id;
}

export function saveCustomPlace(place) {
  const list = state.custom.filter((c) => c.id !== place.id);
  const i = state.custom.findIndex((c) => c.id === place.id);
  list.splice(i < 0 ? list.length : i, 0, { ...place, custom: true });
  storage.set(CUSTOM_KEY, list);
  loadCustom();
  applyInfo(state.info);
}

export async function deleteCustomPlace(id) {
  await db.deleteVisit(id).catch(() => {});
  for (const p of await db.getPicks(id)) await db.deletePick(p.id);
  storage.set(CUSTOM_KEY, state.custom.filter((c) => c.id !== id));
  if (state.info.items[id]) {
    delete state.info.items[id];
    storage.set(INFO_KEY, state.info);
  }
  loadCustom();
  applyInfo(state.info);
  state.visits.delete(id);
}

// 백업에서 가져온 여행지를 합친다(같은 id는 백업 내용으로 바꾼다)
export function importCustomPlaces(list, mode) {
  const incoming = (list || []).filter((c) => c?.id && c.name && /^u/.test(c.id));
  const base = mode === 'overwrite' ? [] : state.custom.filter((c) => !incoming.some((x) => x.id === c.id));
  storage.set(CUSTOM_KEY, [...base, ...incoming.map((c) => ({ ...c, custom: true }))]);
  loadCustom();
  applyInfo(state.info);
  return incoming.length;
}

// 받아 둔 좌표가 믿을 만하면 대략 위치 대신 쓴다(내 주변·길찾기·추천 모두에 반영)
function applyInfo(info) {
  state.info = info?.items ? info : { updatedAt: null, items: {} };
  for (const [id, approx] of Object.entries(state.approx)) {
    const it = state.info.items[id];
    // 시·도 중심으로 대신한 위치는 실제 위치와 멀 수 있어 더 넓게 허용한다
    const limit = state.guide[id].areaRough ? ROUGH_SHIFT_KM : MAX_SHIFT_KM;
    const ok = it?.lat && it?.lng && km(approx, [it.lat, it.lng]) <= limit;
    state.guide[id].area = ok ? [it.lat, it.lng] : approx;
    state.guide[id].areaExact = !!ok;
  }
}

/**
 * 100곳과 추가한 여행지의 설명·사진·좌표를 TourAPI/위키백과에서 새로 받아 이 기기에 저장한다.
 * 못 찾은 곳은 예전에 받아 둔 값을 그대로 둔다. onProgress(done, total, found)
 */
export async function refreshPlaceInfo(onProgress, isCancelled = () => false) {
  const items = { ...state.info.items };
  let done = 0;
  let found = 0;
  const places = allPlaces();
  const queue = [...places];
  // 위키백과가 요청이 몰리면 거절하므로 두 개씩만 동시에 보낸다
  await Promise.all([0, 1].map(async () => {
    while (queue.length && !isCancelled()) {
      const p = queue.shift();
      const r = await lookupPlace({ ...p, guide: state.guide[p.id] }).catch(() => null);
      if (r) {
        found++;
        items[p.id] = infoItem(r);
      }
      onProgress?.(++done, places.length, found);
    }
  }));
  const info = { updatedAt: new Date().toISOString(), items };
  storage.set(INFO_KEY, info);
  applyInfo(info);
  return { done, found, cancelled: isCancelled() };
}

const infoItem = (r) => ({ text: r.text, image: r.image, source: r.source, url: r.url, title: r.title, lat: r.lat, lng: r.lng });

// 한 곳만 정보를 받는다(여행지를 추가하거나 고쳤을 때). 찾으면 true
export async function refreshOnePlace(id) {
  const p = state.placeById.get(id);
  if (!p) return false;
  const r = await lookupPlace({ ...p, guide: state.guide[id] }).catch(() => null);
  const items = { ...state.info.items };
  if (r) items[id] = infoItem(r);
  else delete items[id];
  const info = { updatedAt: state.info.updatedAt || new Date().toISOString(), items };
  storage.set(INFO_KEY, info);
  applyInfo(info);
  return !!r;
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
  const [p, g, pts] = await Promise.all(['data/places.json', 'data/guide.json', 'data/points.json']
    .map((u) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  if (p && JSON.stringify(p.places) !== JSON.stringify(state.places)) changed = true;
  if (g && JSON.stringify([g, pts]) !== loadedGuide) changed = true;
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

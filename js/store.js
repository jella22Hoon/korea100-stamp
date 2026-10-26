// 앱 전역 상태: 관광지 목록(읽기 전용)과 방문 기록(IndexedDB 캐시)
import * as db from './db.js';

export const state = {
  meta: null,
  places: [],
  placeById: new Map(),
  visits: new Map(),
  guide: {},
  guideMeta: null,
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
    state.guideMeta = g?.meta || null;
    state.guide = g?.guide || {};
  } catch {
    state.guide = {};
  }
  await reloadVisits();
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

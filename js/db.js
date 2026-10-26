// IndexedDB 저장소: visits(관광지당 방문 기록 1건), photos(사진 Blob), picks(내가 저장한 맛집·숙소)
const DB_NAME = 'korea100';
const DB_VERSION = 2;

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('visits')) {
        db.createObjectStore('visits', { keyPath: 'placeId' });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('placeId', 'placeId');
      }
      if (!db.objectStoreNames.contains('picks')) {
        const picks = db.createObjectStore('picks', { keyPath: 'id' });
        picks.createIndex('placeId', 'placeId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAllVisits() {
  const db = await open();
  return promisify(db.transaction('visits').objectStore('visits').getAll());
}

export async function getPhotos(placeId) {
  const db = await open();
  const index = db.transaction('photos').objectStore('photos').index('placeId');
  return promisify(index.getAll(placeId));
}

export async function getAllPhotos() {
  const db = await open();
  return promisify(db.transaction('photos').objectStore('photos').getAll());
}

// 방문 기록과 사진을 한 트랜잭션으로 저장. photos: 남길 사진 전체 [{id, blob}]
export async function saveVisit(visit, photos) {
  const db = await open();
  const tx = db.transaction(['visits', 'photos'], 'readwrite');
  const photoStore = tx.objectStore('photos');
  const existing = await promisify(photoStore.index('placeId').getAllKeys(visit.placeId));
  const keep = new Set(photos.map((p) => p.id));
  existing.filter((id) => !keep.has(id)).forEach((id) => photoStore.delete(id));
  photos.forEach((p) => photoStore.put({ id: p.id, placeId: visit.placeId, blob: p.blob }));
  const record = { ...visit, photoIds: photos.map((p) => p.id), updatedAt: Date.now() };
  tx.objectStore('visits').put(record);
  await done(tx);
  return record;
}

export async function deleteVisit(placeId) {
  const db = await open();
  const tx = db.transaction(['visits', 'photos'], 'readwrite');
  const photoStore = tx.objectStore('photos');
  const keys = await promisify(photoStore.index('placeId').getAllKeys(placeId));
  keys.forEach((id) => photoStore.delete(id));
  tx.objectStore('visits').delete(placeId);
  await done(tx);
}

export async function getPicks(placeId) {
  const db = await open();
  const index = db.transaction('picks').objectStore('picks').index('placeId');
  return promisify(index.getAll(placeId));
}

export async function getAllPicks() {
  const db = await open();
  return promisify(db.transaction('picks').objectStore('picks').getAll());
}

export async function savePick(pick) {
  const db = await open();
  const tx = db.transaction('picks', 'readwrite');
  const record = { ...pick, updatedAt: Date.now() };
  tx.objectStore('picks').put(record);
  await done(tx);
  return record;
}

export async function deletePick(id) {
  const db = await open();
  const tx = db.transaction('picks', 'readwrite');
  tx.objectStore('picks').delete(id);
  await done(tx);
}

// 백업 복원. mode: 'overwrite'(전부 교체) | 'merge'(updatedAt이 더 최근인 기록 우선)
export async function importData(visits, photos, picks, mode) {
  const db = await open();
  const tx = db.transaction(['visits', 'photos', 'picks'], 'readwrite');
  const visitStore = tx.objectStore('visits');
  const photoStore = tx.objectStore('photos');
  const pickStore = tx.objectStore('picks');
  if (mode === 'overwrite') {
    visitStore.clear();
    photoStore.clear();
    pickStore.clear();
  }
  const currentPicks = mode === 'merge' ? await promisify(pickStore.getAll()) : [];
  const pickById = new Map(currentPicks.map((p) => [p.id, p]));
  for (const p of picks) {
    const mine = pickById.get(p.id);
    if (!mine || (mine.updatedAt || 0) < (p.updatedAt || 0)) pickStore.put(p);
  }
  const current = mode === 'merge' ? await promisify(visitStore.getAll()) : [];
  const currentById = new Map(current.map((v) => [v.placeId, v]));
  let applied = 0;
  for (const v of visits) {
    const mine = currentById.get(v.placeId);
    if (mine && (mine.updatedAt || 0) >= (v.updatedAt || 0)) continue;
    if (mine) {
      const old = await promisify(photoStore.index('placeId').getAllKeys(v.placeId));
      old.forEach((id) => photoStore.delete(id));
    }
    visitStore.put(v);
    photos.filter((p) => p.placeId === v.placeId).forEach((p) => photoStore.put(p));
    applied++;
  }
  await done(tx);
  return applied;
}

export async function clearAll() {
  const db = await open();
  const tx = db.transaction(['visits', 'photos', 'picks'], 'readwrite');
  tx.objectStore('visits').clear();
  tx.objectStore('photos').clear();
  tx.objectStore('picks').clear();
  await done(tx);
}

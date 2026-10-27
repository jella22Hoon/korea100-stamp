import { state, reloadVisits } from '../store.js';
import { getAllVisits, getAllPhotos, getAllPicks, importData, clearAll } from '../db.js';
import { esc, blobToDataURL, dataURLToBlob, downloadFile, today, toast, storage } from '../util.js';
import { TOUR_KEY } from '../enrich.js';

// v2: 맛집·숙소 메모(picks) 추가. v1 백업도 그대로 가져올 수 있다.
const BACKUP_VERSION = 2;
const THEME_KEY = 'korea100.theme';

export function applyTheme(theme = storage.get(THEME_KEY, 'system')) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1c1714' : '#fbf6ef');
}

async function exportBackup() {
  const visits = await getAllVisits();
  const photos = await getAllPhotos();
  const picks = await getAllPicks();
  const payload = {
    app: 'korea100',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    visits,
    picks,
    photos: await Promise.all(photos.map(async (p) => ({
      id: p.id, placeId: p.placeId, data: await blobToDataURL(p.blob),
    }))),
  };
  downloadFile(`한국관광100선-백업-${today()}.json`, JSON.stringify(payload));
  toast(`방문 ${visits.length}곳, 사진 ${photos.length}장, 메모 ${picks.length}개를 내보냈어요`);
}

async function restoreBackup(file, mode) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('JSON 파일을 읽지 못했어요');
  }
  if (payload?.app !== 'korea100' || !Array.isArray(payload.visits)) {
    throw new Error('이 앱의 백업 파일이 아니에요');
  }
  const visits = payload.visits.filter((v) => v && state.placeById.has(v.placeId));
  const photos = await Promise.all((payload.photos || []).map(async (p) => ({
    id: p.id, placeId: p.placeId, blob: await dataURLToBlob(p.data),
  })));
  const picks = (payload.picks || []).filter((p) => p && state.placeById.has(p.placeId));
  const applied = await importData(visits, photos, picks, mode);
  await reloadVisits();
  return applied;
}

export function renderSettings(root) {
  const theme = storage.get(THEME_KEY, 'system');
  const meta = state.meta || {};

  root.innerHTML = `
    <header class="page-head"><h1>설정</h1></header>

    <section class="panel">
      <h2>화면 테마</h2>
      <div class="seg" role="radiogroup" aria-label="화면 테마">
        ${[['system', '시스템'], ['light', '라이트'], ['dark', '다크']].map(([v, l]) => `
          <button type="button" class="chip${theme === v ? ' active' : ''}" role="radio" aria-checked="${theme === v}" data-theme="${v}">${l}</button>`).join('')}
      </div>
    </section>

    <section class="panel">
      <h2>백업과 복원</h2>
      <p class="hint">방문 기록은 이 기기의 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 기기를 바꾸기 전에 백업 파일을 내보내 두세요.</p>
      <button type="button" class="btn primary" id="export">백업 파일 내보내기</button>
      <div class="restore">
        <label class="radio"><input type="radio" name="mode" value="merge" checked> 병합 (더 최근에 수정한 기록 우선)</label>
        <label class="radio"><input type="radio" name="mode" value="overwrite"> 덮어쓰기 (지금 기록을 모두 지우고 교체)</label>
        <button type="button" class="btn" id="import">백업 파일 가져오기</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </div>
    </section>

    <section class="panel">
      <h2>팜플렛 사진·설명</h2>
      <p class="hint">팜플렛의 관광 포인트 사진·설명은 한국어 위키백과에서 찾아요. 한국관광공사 TourAPI 인증키를 넣으면 공식 사진·소개글을 먼저 써요. 인증키는 공공데이터포털(data.go.kr)에서 '한국관광공사_국문 관광정보 서비스'를 활용 신청하면 무료로 받을 수 있어요.</p>
      <label class="field">
        <span>TourAPI 인증키 (선택, 일반 인증키 Decoding)</span>
        <input type="password" id="tour-key" autocomplete="off" spellcheck="false" value="${esc(storage.get(TOUR_KEY, ''))}">
      </label>
      <p class="hint small">인증키는 이 기기에만 저장되고 백업 파일에는 들어가지 않아요.</p>
    </section>

    <section class="panel">
      <h2>데이터 정보</h2>
      <p><strong>${esc(meta.title || '')}</strong></p>
      <p class="hint">${esc(meta.source || '')}</p>
      <ul class="notes">${(meta.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      ${state.guideMeta ? `
        <p style="margin-top:12px"><strong>${esc(state.guideMeta.title)}</strong> <span class="hint">(${esc(state.guideMeta.written)} 작성)</span></p>
        <ul class="notes">${state.guideMeta.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        <p class="hint" style="margin-top:8px">맛집·숙소는 특정 가게를 추천하지 않고, 네이버지도·카카오맵에서 최신 리뷰로 찾도록 연결합니다.</p>` : ''}
    </section>

    <section class="panel">
      <h2>초기화</h2>
      <button type="button" class="btn ghost danger" id="reset">모든 방문 기록 삭제</button>
    </section>`;

  root.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
    storage.set(THEME_KEY, b.dataset.theme);
    applyTheme(b.dataset.theme);
    root.querySelectorAll('[data-theme]').forEach((x) => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-checked', x === b);
    });
  }));

  root.querySelector('#tour-key').addEventListener('change', (e) => {
    storage.set(TOUR_KEY, e.target.value.trim());
    toast(e.target.value.trim() ? 'TourAPI 인증키를 저장했어요' : 'TourAPI 인증키를 지웠어요');
  });

  root.querySelector('#export').addEventListener('click', () => exportBackup().catch((e) => {
    console.error(e);
    toast('내보내기에 실패했어요');
  }));

  const fileInput = root.querySelector('#import-file');
  root.querySelector('#import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const mode = root.querySelector('input[name="mode"]:checked').value;
    if (mode === 'overwrite' && !confirm('지금 기기의 방문 기록을 모두 지우고 백업으로 교체할까요?')) return;
    try {
      const n = await restoreBackup(file, mode);
      toast(`${n}곳의 기록을 가져왔어요`);
    } catch (e) {
      console.error(e);
      toast(e.message || '가져오기에 실패했어요');
    }
  });

  root.querySelector('#reset').addEventListener('click', async () => {
    if (!confirm('모든 방문 기록, 사진, 맛집·숙소 메모를 삭제할까요? 되돌릴 수 없어요.')) return;
    await clearAll();
    await reloadVisits();
    toast('모든 기록을 삭제했어요');
  });
}

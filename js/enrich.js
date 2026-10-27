// 팜플렛에 넣을 관광 포인트 사진·설명을 외부 자료에서 가져온다. 직접 지어내지 않고 출처를 함께 남긴다.
// 1순위 한국관광공사 TourAPI(설정에 인증키가 있을 때), 2순위 한국어 위키백과.
import { storage } from './util.js';

export const TOUR_KEY = 'korea100.tourapiKey';
const TOUR = 'https://apis.data.go.kr/B551011/KorService2';
const WIKI = 'https://ko.wikipedia.org/w/api.php';
const cache = new Map();
// 본문에는 보통 '경상남도'처럼 정식 이름이 나온다
const SIDO_FULL = { 경남: '경상남도', 경북: '경상북도', 전남: '전라남도', 전북: '전라북도', 충남: '충청남도', 충북: '충청북도' };

const norm = (s) => String(s || '').replace(/\([^)]*\)/g, '').replace(/[\s·・,.\-_'"]/g, '').toLowerCase();
// 검색 결과 제목이 찾는 이름과 실제로 같은 대상인지(엉뚱한 문서의 사진을 넣지 않도록)
const sameThing = (a, b) => {
  const x = norm(a); const y = norm(b);
  if (x.length < 2 || y.length < 2) return false;
  // 결과 제목이 이름을 품거나(수원 화성행궁 ⊃ 화성행궁), 이름이 제목을 품되 너무 짧은 일반어가 아닐 때.
  // 제목에 덧붙은 말은 지역 이름 정도(5자)까지만 허용한다(정읍 내장사 조선동종 ✗)
  return (x.includes(y) && x.length - y.length <= 5) || (y.includes(x) && x.length / y.length >= 0.75);
};
// '방화수류정과 용연', '장안문·화서문 성곽길', '선자령 트레킹' 같은 이름에서 검색할 후보를 만든다.
// strict 후보('성곽 야경' → '성곽')는 일반 낱말일 수 있어서, 결과 제목에 지역·관광지 이름이 있을 때만 쓴다
const GENERIC = /\s*(트레킹|등산|산책|산책로|낙조|야경|일출|일몰|초원|거리|체험|투어|코스|풍경|공간|숲)$/;
function candidates(name) {
  const first = name.split(/·|,|&|과\s|와\s|및\s/)[0].trim();
  const list = [{ n: name, strict: false }, { n: name.replace(GENERIC, ''), strict: true }];
  if (first.length >= 3) list.push({ n: first, strict: false });
  list.push({ n: first.replace(GENERIC, ''), strict: true });
  const seen = new Set();
  return list.filter((c) => c.n.length >= 2 && !seen.has(c.n) && seen.add(c.n));
}
const clip = (t, n = 160) => {
  const s = String(t || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = cut.lastIndexOf('다.');
  return end > 40 ? cut.slice(0, end + 2) : `${cut}…`;
};
// 볼거리 문서가 이 관광지의 것인지: 본문이나 주소에 지역·관광지 이름이 나와야 한다
const inContext = (hay, ctx) => !ctx.length || ctx.some((c) => norm(c) && norm(hay).includes(norm(c)));
const https = (u) => (u ? String(u).replace(/^http:\/\//i, 'https://') : '');

// 요청이 몰려 거절(429)되거나 잠깐 끊기면 한 번만 다시 시도한다
async function getJSON(url, ms = 8000) {
  try {
    return await getOnce(url, ms);
  } catch {
    await new Promise((r) => setTimeout(r, 900));
    return getOnce(url, ms);
  }
}

async function getOnce(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fromTour(name, key, ctx) {
  const base = { serviceKey: key, MobileOS: 'ETC', MobileApp: 'korea100', _type: 'json' };
  const list = await getJSON(`${TOUR}/searchKeyword2?${new URLSearchParams({ ...base, keyword: name, numOfRows: 5, pageNo: 1 })}`);
  let items = list?.response?.body?.items?.item || [];
  if (!Array.isArray(items)) items = [items];
  const hit = items.find((i) => sameThing(i.title, name) && inContext(`${i.title} ${i.addr1}`, ctx));
  if (!hit) return null;
  let text = '';
  try {
    const d = await getJSON(`${TOUR}/detailCommon2?${new URLSearchParams({ ...base, contentId: hit.contentid })}`);
    const it = d?.response?.body?.items?.item;
    text = clip((Array.isArray(it) ? it[0] : it)?.overview);
  } catch { /* 설명 없이 사진만 쓴다 */ }
  const image = https(hit.firstimage || hit.firstimage2);
  if (!image && !text) return null;
  const lat = Number(hit.mapy); const lng = Number(hit.mapx);
  return { title: hit.title, image, text, source: '한국관광공사', url: '', ...(lat && lng ? { lat, lng } : {}) };
}

async function fromWiki(name, ctx) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: name, gsrlimit: 5,
    prop: 'extracts|pageimages|info|coordinates', exintro: 1, explaintext: 1, exsentences: 3, exlimit: 5,
    piprop: 'thumbnail', pithumbsize: 640, inprop: 'url', redirects: 1,
  });
  const data = await getJSON(`${WIKI}?${params}`);
  const pages = Object.values(data?.query?.pages || {}).sort((a, b) => a.index - b.index);
  const ok = pages.filter((p) => sameThing(p.title, name) && inContext(`${p.title} ${p.extract}`, ctx));
  // 제목이 이름과 똑같은 문서를 먼저 고른다
  const hit = ok.find((p) => norm(p.title) === norm(name)) || ok[0];
  if (!hit || (!hit.thumbnail && !hit.extract)) return null;
  const c = hit.coordinates?.[0];
  return {
    title: hit.title, image: https(hit.thumbnail?.source), text: clip(hit.extract), source: '위키백과', url: hit.fullurl,
    ...(c ? { lat: c.lat, lng: c.lon } : {}),
  };
}

// 하나의 이름(관광지 또는 볼거리)에 대한 사진·설명. ctx는 같은 대상인지 확인할 지역·관광지 단어들. 못 찾으면 null
export async function lookup(name, ctx = []) {
  const ck = `${name}|${ctx.join(',')}`;
  if (cache.has(ck)) return cache.get(ck);
  const job = (async () => {
    const key = storage.get(TOUR_KEY, '');
    if (key) {
      try {
        const r = await fromTour(name, key, ctx);
        if (r) return r;
      } catch { /* 키 오류·한도 초과면 위키백과로 */ }
    }
    try {
      return await fromWiki(name, ctx);
    } catch {
      return null;
    }
  })();
  cache.set(ck, job);
  const r = await job;
  if (r === null) cache.delete(ck); // 네트워크 실패일 수 있으니 다음에 다시 시도
  return r;
}

// 시·도와 시·군·구 이름(○○시 → ○○)으로 같은 이름의 다른 곳을 걸러 낸다
function regionWords(p) {
  return [p.sido, SIDO_FULL[p.sido], ...String(p.sigungu || '').split(/[\s,·]+/).map((w) => w.replace(/(특별자치시|광역시|시|군|구)$/, ''))]
    .filter((w) => w && w.length >= 2);
}

// 관광지 자체의 사진·설명·좌표. '경주 대릉원' → '대릉원'처럼 앞의 지역 이름을 뗀 이름도 찾아본다
export async function lookupPlace(p) {
  const q = p.guide?.q || p.name;
  const region = regionWords(p);
  const names = [...new Set([q, q.replace(/^(\S+)\s+/, (m, w) => (region.some((c) => norm(c) === norm(w)) ? '' : m))])];
  for (const n of names) {
    const r = await lookup(n, region);
    if (r) return r;
  }
  return null;
}

// 관광지와 볼거리 이름 목록을 한꺼번에 찾는다. onProgress(done, total)
export async function enrichPlaces(places, onProgress) {
  const jobs = [];
  for (const p of places) {
    // 볼거리는 지역 이름과 관광지 이름으로 같은 대상인지 확인한다
    const ctx = [p.guide?.q || p.name, ...regionWords(p)];
    jobs.push([p.id, '', p, null]);
    (p.guide?.points || []).forEach((pt) => jobs.push([p.id, pt, pt, ctx]));
  }
  let done = 0;
  const out = {};
  const run = async ([id, point, name, ctx]) => {
    let r = null;
    if (!point) r = await lookupPlace(name);
    else for (const { n, strict } of candidates(name)) {
      r = await lookup(n, ctx);
      // 제목이 찾은 이름보다 짧으면(메타세쿼이아길 → 메타세쿼이아) 다른 대상일 수 있어 strict로 본다
      const shorter = r && norm(r.title).length < norm(n).length;
      if (r && point && (strict || shorter) && !ctx.some((c) => norm(r.title).includes(norm(c)))) r = null;
      if (r) break;
    }
    // 볼거리 이름이 관광지 문서로 잡히면 중복이므로 버린다
    const dup = point && r && out[id]?.place?.title === r.title;
    out[id] ??= { place: null, points: {} };
    if (!point) out[id].place = r;
    else if (r && !dup) out[id].points[point] = r;
    onProgress?.(++done, jobs.length);
  };
  // 관광지 문서를 먼저 받아야 중복 판단이 되므로 두 단계로 나눈다
  await Promise.all(jobs.filter((j) => !j[1]).map(run));
  const rest = jobs.filter((j) => j[1]);
  for (let i = 0; i < rest.length; i += 4) await Promise.all(rest.slice(i, i + 4).map(run));
  return out;
}

// 목적지 주변 여행지 찾기. 서버 없이 공개 자료만 쓴다:
// 1) 앱에 들어 있는 100선·내가 추가한 여행지  2) 위키백과(위치 검색 + '○○시의 관광지' 분류)  3) 오픈스트리트맵(응답할 때만)
// 네이버·구글 검색은 앱에서 직접 부를 수 없어(키·서버 필요) 결과 화면에 검색 링크로 연결한다.
import { state, allPlaces, isCustom } from './store.js';
import { km } from './recommend.js';
import { SIDO_ORDER } from './util.js';

const WIKI = 'https://ko.wikipedia.org/w/api.php';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// 여행 기간이 길수록 넓게 찾는다(목적지 중심에서 km)
export const RADIUS = { day: 12, '1n2d': 25, '2n3d': 35, '3n4d': 45 };

const SIDO_NAMES = {
  서울: ['서울특별시'], 부산: ['부산광역시'], 대구: ['대구광역시'], 인천: ['인천광역시'], 광주: ['광주광역시'],
  대전: ['대전광역시'], 울산: ['울산광역시'], 세종: ['세종특별자치시'], 경기: ['경기도'],
  강원: ['강원특별자치도', '강원도'], 충북: ['충청북도'], 충남: ['충청남도'], 전북: ['전북특별자치도', '전라북도'],
  전남: ['전라남도'], 경북: ['경상북도'], 경남: ['경상남도'], 제주: ['제주특별자치도', '제주도'],
};
export const sidoOf = (text = '') => SIDO_ORDER.find((s) => SIDO_NAMES[s].some((n) => text.includes(n))) || '';

// 탑·불상·전각처럼 큰 관광지 안의 작은 문화유산(따로 찾아갈 곳은 아니라 뒤로 보낸다)
const MINOR = /탱화|불상|좌상|입상|반가상|마애|석탑|층탑|다보탑|석가탑|부도|승탑|사리탑|범종|종각|당간지주|비$|석비|석등|석조|지장|시왕상|일괄|요사|명부전|대웅전|극락전|산신각|칠성각|당간|귀부|이수|석불|나무$|백송|우물$|가옥$/;

const norm = (s) => String(s || '').replace(/\([^)]*\)/g, '').replace(/[\s·・,.\-_'"]/g, '').toLowerCase();

// 위키백과 분류·설명으로 관광할 만한 곳인지 가른다
const GOOD = /관광지|관광 명소|명소|문화유산|문화재|국가유산|국보|보물|사적|명승|천연기념물|국립공원|도립공원|군립공원|산$|산 \(|봉$|사찰|절$|암자|박물관|미술관|기념관|문학관|전시관|공원|정원|수목원|휴양림|해수욕장|해변|해안|폭포|계곡|호수|저수지|섬$|섬 \(|동굴|전망대|성곽|산성|읍성|궁궐|궁$|왕릉|서원|향교|고택|한옥|민속|탑$|석탑|등대|전통시장|시장$|거리$|마을$|다리$|유원지|테마파크|놀이공원|워터파크|동물원|수족관|아쿠아리움|온천|스키장|둘레길|올레|생태|습지|누정|정자|성당|교회 건축|건축물/;
const BAD = /학교|대학교|교육청|교육지원청|관공서|청사|의회|법원|검찰|공소청|경찰|소방|병무청|우체국|병원|아파트|주식회사|기업|회사|은행|정당|선거구|행정 구역|법정동|행정동|읍·면·동|군부대|기지$|발전소|공장|방송|신문|교통|도로$|국도|고속도로|지방도|노선|정류장|버스|터미널|전철역|철도역|역$|공항|체육관|경기장|스포츠|교회$|단체|협회|재단|연구소|센터$|도서관/;
// 박물관에 있는 유물(국보·보물이어도 찾아갈 곳은 아니다)
const ARTIFACT = /소장품|소장 유물|토기|도자기|금관|공예품|서적|문서$|유물$|책$|성경|복음|경전|언해|간행본|목판본|필사본|활자본|적삼|저고리|의복|복식|초상$|초상-|화첩|병풍|족자|권 ?d|권상|권하|상여|의대$|교지|호패|어새|국새|녹권|일구$|묵서|사경|대전 권|율$|백자|청자|분청|병$|서기석|측우|화재$|사건$|사고$|도심$/;
const ARTIFACT_CAT = /의 책$|책$|서적|문헌|고문서|문서$|공예|회화|불화|서예|금속|도자|인장|천문 기구|의복|복식|불경|법전|목판|유물$|조각 작품|소장품|고지도|의 지도$|무신도|현판|도기$|무형문화|노동요|작품$|초조본|호텔$|의 도로$|지방도|국도|품종|가축|음식|요리|동물$/;
// 문화유산 지정 분류만 있고 장소라고 볼 단어가 없으면 책·문서 같은 유물로 본다(예: 연방록)
const PLACEISH = /건축물|사찰|절$|궁|성곽|산성|읍성|왕릉|고분|유적|서원|향교|고택|한옥|정자|누정|공원|산$|섬$|해수욕장|박물관|미술관|마을|시장|거리|다리|석탑|탑$|사지|터$|문$|각$|당$|루$|정$|사$|암$|동굴|폭포|계곡|호수|관광지|교회|성당|묘$|능$|비$/;
const HERITAGE_ONLY = /유형문화|보물|국보|문화유산|문화재/;

// 앞에 있는 분류가 먼저 맞는다('문화유산'이 '산'으로 끝나 자연으로 잘못 가지 않도록 역사부터 본다)
const KIND = [
  [/사찰|절$|암자|문화유산|문화재|국가유산|국보|보물|사적|성곽|산성|읍성|궁$|궁궐|왕릉|서원|향교|고택|석탑|탑$|누정|정자|민속/, '역사'],
  [/박물관|미술관|기념관|문학관|전시관|성당|건축물|한옥/, '문화'],
  [/테마파크|놀이공원|유원지|워터파크|동물원|수족관|아쿠아리움|온천|스키장|케이블카|리조트/, '레저'],
  [/산$|산 \(|봉$|섬$|섬 \(|해수욕장|해변|해안|폭포|계곡|호수|호$|저수지|댐$|동굴|국립공원|도립공원|수목원|화목원|휴양림|정원|생태|습지|천연기념물|명승|올레|둘레길/, '자연'],
];
// 제목·설명·분류를 ' / '로 이은 글에서 조각마다 맞춰 본다($가 조각 끝을 뜻하도록)
const anyPart = (re, text) => text.split(' / ').some((t) => re.test(t.trim()));
const kindOf = (text) => KIND.find(([re]) => anyPart(re, text))?.[1] || '도시';

const OSM_KIND = {
  viewpoint: ['전망 명소', '자연'], museum: ['박물관', '문화'], gallery: ['미술관', '문화'], theme_park: ['테마파크', '레저'],
  zoo: ['동물원', '레저'], aquarium: ['아쿠아리움', '레저'], attraction: ['명소', '도시'],
  castle: ['성', '역사'], fort: ['성곽', '역사'], monument: ['기념물', '역사'], archaeological_site: ['유적', '역사'],
};

async function getJSON(url, opts = {}, ms = 12000) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

const wikiURL = (params) => `${WIKI}?${new URLSearchParams({ format: 'json', formatversion: 2, origin: '*', ...params })}`;

function wikiPage(p, fallback) {
  const cats = (p.categories || []).map((c) => c.title.replace(/^분류:/, '')).join(' / ');
  const text = `${p.title} / ${p.description || ''} / ${cats}`;
  return {
    name: p.title.replace(/\s*\([^)]*\)$/, ''),
    wikiTitle: p.title,
    lat: p.coordinates?.[0]?.lat ?? fallback?.lat,
    lng: p.coordinates?.[0]?.lon ?? fallback?.lng,
    rough: !p.coordinates?.[0],
    image: p.thumbnail?.source || '',
    note: p.description || '',
    category: kindOf(text),
    kindLabel: '',
    source: '위키백과',
    url: `https://ko.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
    cats: (p.categories || []).map((c) => c.title.replace(/^분류:/, '')),
    tour: /관광지|관광 명소|국립공원|도립공원|박물관|미술관|궁궐|궁전|전통시장|해수욕장|테마파크|놀이공원|전망대|수목원|세계유산/.test(text),
    good: anyPart(GOOD, text),
    bad: (anyPart(BAD, text) && !/관광지|문화유산|국가유산|보물|사적|명승/.test(cats)) || ARTIFACT.test(p.title) || anyPart(ARTIFACT_CAT, cats)
      || (HERITAGE_ONLY.test(cats) && !anyPart(PLACEISH, `${p.title} / ${cats}`)),
  };
}

const PAGE_PROPS = { prop: 'categories|description|coordinates|pageimages', cllimit: 'max', colimit: 'max', clshow: '!hidden', piprop: 'thumbnail', pithumbsize: 400 };

// 위키백과 위치 검색(한 번에 반경 10km까지라 넓으면 주변 여러 지점을 함께 찾는다)
async function wikiNearby(center, radiusKm, onBatch) {
  const pts = [center];
  if (radiusKm > 12) {
    const off = Math.min(radiusKm * 0.55, 16);
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      pts.push({ lat: center.lat + (off / 111) * Math.sin(a), lng: center.lng + (off / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.cos(a) });
    }
  }
  // 도심은 관공서·학교 문서가 많아 가운데는 넉넉히 받고, 제목만 보고 걸러 낸 뒤 분류·사진을 50개씩 묻는다.
  // 지점마다 찾은 것을 바로 onBatch로 넘겨 화면에 먼저 보여 준다
  const seen = new Set();
  const out = [];
  // 위치 검색은 한꺼번에 보내면 '검색이 바쁘다'며 거절하므로 하나씩, 거절되면 잠시 뒤 다시 보낸다
  for (const [i, p] of pts.entries()) {
    const url = wikiURL({ action: 'query', list: 'geosearch', gscoord: `${p.lat}|${p.lng}`, gsradius: 10000, gslimit: i === 0 ? 300 : 80 });
    let r = await getJSON(url).catch(() => null);
    for (const wait of [900, 1800]) {
      if (r?.query) break;
      await new Promise((ok) => setTimeout(ok, wait));
      r = await getJSON(url).catch(() => null);
    }
    const pos = new Map(); // 위치 검색이 준 좌표(문서 정보에 좌표가 빠졌을 때 쓴다)
    for (const g of r?.query?.geosearch || []) {
      if (seen.has(g.pageid) || (anyPart(BAD, g.title) && !anyPart(GOOD, g.title))) continue;
      seen.add(g.pageid);
      pos.set(g.pageid, { lat: g.lat, lng: g.lon });
    }
    const ids = [...pos.keys()];
    const batches = [];
    for (let j = 0; j < ids.length; j += 50) batches.push(ids.slice(j, j + 50));
    const rs = await Promise.all(batches.map((b) => getJSON(wikiURL({ action: 'query', pageids: b.join('|'), ...PAGE_PROPS })).catch(() => null)));
    const items = rs.flatMap((x) => x?.query?.pages || []).map((pg) => ({ ...wikiPage(pg, pos.get(pg.pageid)), rough: false }));
    out.push(...items);
    onBatch?.(items);
  }
  return out;
}

// '춘천시의 관광지' 같은 위키백과 분류에 든 곳(좌표가 없으면 목적지 중심으로 둔다)
async function wikiCategory(region, center) {
  if (!region) return [];
  const r = await getJSON(wikiURL({
    action: 'query', generator: 'categorymembers', gcmtitle: `분류:${region}의 관광지`, gcmtype: 'page', gcmlimit: 50, ...PAGE_PROPS,
  })).catch(() => null);
  return (r?.query?.pages || []).map((p) => ({ ...wikiPage(p, center), good: true, tour: true, bad: ARTIFACT.test(p.title) || anyPart(ARTIFACT_CAT, (p.categories || []).map((c) => c.title.replace(/^분류:/, '')).join(' / ')) }));
}

// 오픈스트리트맵 관광지. 서버가 바쁘면 자주 늦어서 짧게 기다리고 못 받으면 넘어간다
async function osmNearby(center, radiusKm) {
  const r = Math.round(Math.min(radiusKm, 30) * 1000);
  const q = `[out:json][timeout:10];(nwr["tourism"~"^(attraction|viewpoint|museum|gallery|theme_park|zoo|aquarium)$"]["name"](around:${r},${center.lat},${center.lng});nwr["historic"~"^(castle|fort|monument|archaeological_site)$"]["name"](around:${r},${center.lat},${center.lng}););out center tags 80;`;
  const body = new URLSearchParams({ data: q });
  const j = await Promise.any(OVERPASS.map((u) => getJSON(u, { method: 'POST', body }, 10000))).catch(() => null);
  return (j?.elements || []).map((e) => {
    const t = e.tags || {};
    const [label, category] = OSM_KIND[t.tourism] || OSM_KIND[t.historic] || ['명소', '도시'];
    const wiki = /^ko:/.test(t.wikipedia || '') ? t.wikipedia.slice(3) : '';
    return {
      name: t['name:ko'] || t.name,
      wikiTitle: wiki,
      lat: e.lat ?? e.center?.lat,
      lng: e.lon ?? e.center?.lon,
      rough: false,
      image: '',
      note: '',
      category,
      kindLabel: label,
      source: '오픈스트리트맵',
      url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      good: !!(t.wikipedia || t.wikidata) || t.tourism !== 'attraction',
      tour: !!t.tourism && t.tourism !== 'attraction',
      bad: false,
    };
  }).filter((x) => x.name && /[가-힣]/.test(x.name));
}

/**
 * 목적지 글자를 위치로 바꾼다. 비어 있으면 현재 위치.
 * → { name, lat, lng, sido, sigungu, placeId? }
 */
export async function resolveDest(text) {
  const q = text.trim();
  if (!q) {
    const pos = await new Promise((ok, fail) => {
      if (!navigator.geolocation || !window.isSecureContext) fail(new Error('위치를 쓸 수 없어요'));
      else navigator.geolocation.getCurrentPosition(ok, fail, { timeout: 15000, maximumAge: 60000 });
    });
    const here = { name: '내 주변', lat: pos.coords.latitude, lng: pos.coords.longitude, sido: '', sigungu: '' };
    const rev = await getJSON(`https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ lat: here.lat, lon: here.lng, format: 'jsonv2', 'accept-language': 'ko', zoom: 10 })}`).catch(() => null);
    if (rev?.address) Object.assign(here, regionOf(rev.address, rev.display_name));
    if (!here.sido) here.sido = nearestSido(here);
    return here;
  }
  // 앱에 있는 관광지 이름이면 그곳을 중심으로
  const n = norm(q);
  // '경주'·'강릉시'처럼 지역 이름이면 관광지가 아니라 그 지역 중심에서 찾는다
  const isRegion = allPlaces().some((p) => [p.sido, p.sigungu, p.sigungu?.replace(/(시|군|구)$/, '')].some((w) => w && norm(w) === n))
    || SIDO_ORDER.some((sd) => norm(sd) === n || SIDO_NAMES[sd].some((x) => norm(x) === n));
  const known = allPlaces().find((p) => norm(p.name) === n)
    || (!isRegion && n.length >= 2 ? allPlaces().find((p) => norm(p.name).includes(n)) : null);
  if (known && state.guide[known.id]?.area) {
    const [lat, lng] = state.guide[known.id].area;
    return { name: known.name, lat, lng, sido: known.sido, sigungu: known.sigungu, placeId: known.id };
  }
  // 지역 이름은 시청·군청 쪽 중심을 주는 '도시' 검색을 먼저 써 본다
  const city = isRegion ? (await geocodeRaw(q, 'city').catch(() => []))[0] : null;
  const hit = city || (await geocodeRaw(q))[0];
  if (!hit) throw new Error(`'${q}'의 위치를 찾지 못했어요`);
  const out = { name: q, lat: Number(hit.lat), lng: Number(hit.lon), ...regionOf(hit.address, hit.display_name) };
  if (!out.sido) out.sido = nearestSido(out);
  return out;
}

const geoCache = new Map();
function geocodeRaw(q, featureType = '') {
  const k = `${q}|${featureType}`;
  if (!geoCache.has(k)) {
    const p = { q, format: 'jsonv2', limit: 1, countrycodes: 'kr', 'accept-language': 'ko', addressdetails: 1, ...(featureType ? { featureType } : {}) };
    geoCache.set(k, getJSON(`https://nominatim.openstreetmap.org/search?${new URLSearchParams(p)}`).catch((e) => { geoCache.delete(k); throw e; }));
  }
  return geoCache.get(k);
}

// 주소에서 시·도를 못 읽으면 가장 가까운 100선 관광지의 시·도로 어림한다
function nearestSido(p) {
  let best = null;
  for (const x of state.places) {
    const a = state.guide[x.id]?.area;
    if (!a) continue;
    const d = km([p.lat, p.lng], a);
    if (!best || d < best.d) best = { d, sido: x.sido };
  }
  return best && best.d < 60 ? best.sido : '';
}

function regionOf(a = {}, display = '') {
  const sido = sidoOf(`${a.province || ''} ${a.state || ''} ${a.city || ''} ${display}`);
  const top = SIDO_NAMES[sido] || [];
  const sigungu = [a.city, a.county, a.borough, /(구|군|시)$/.test(a.suburb || '') ? a.suburb : ''].find((x) => x && !top.includes(x)) || '';
  return { sido, sigungu };
}

// 지역 단어로 같은 곳인지 가린 뒤 이름이 같으면 하나로 합친다
function sameName(a, b) {
  const x = norm(a); const y = norm(b);
  return x.length >= 2 && y.length >= 2 && (x === y || (x.includes(y) && y.length >= 3) || (y.includes(x) && x.length >= 3));
}

/**
 * dest 주변 여행지. onPartial(list)로 먼저 찾은 것부터 보여 줄 수 있다.
 * → [{ key, name, lat, lng, dist, category, kindLabel, source, image, note, url, wikiTitle, placeId?, official, custom }]
 */
export async function findSpots(dest, radiusKm, onPartial) {
  const center = { lat: dest.lat, lng: dest.lng };
  const here = [center.lat, center.lng];
  const local = allPlaces()
    .map((p) => ({ p, area: state.guide[p.id]?.area }))
    .filter((x) => x.area && km(here, x.area) <= radiusKm * 1.2)
    .map(({ p, area }) => ({
      key: p.id, placeId: p.id, name: p.name, lat: area[0], lng: area[1], category: p.category,
      kindLabel: '', source: '', image: state.info.items[p.id]?.image || '', note: state.info.items[p.id]?.text || p.description || '',
      official: !isCustom(p), custom: isCustom(p),
    }));
  // 100선 이름의 각 부분('불국사&석굴암' → 불국사, 석굴암). 그 안의 작은 문화유산은 빼고 100선 쪽을 보게 한다
  const cores = local.flatMap((l) => l.name.split(/[&·,()（）]/)).map(norm).filter((x) => x.length >= 2);
  const finish = (ext) => {
    const parents = new Set(ext.map((x) => norm(x.wikiTitle || x.name)));
    const seen = new Set(local.map((x) => norm(x.name)));
    const others = [];
    for (const s of ext) {
      if (!s.name || s.bad || !s.good || !Number.isFinite(s.lat)) continue;
      if (km(here, [s.lat, s.lng]) > radiusKm * 1.15) continue;
      if (local.some((l) => sameName(l.name, s.name)) || others.some((o) => sameName(o.name, s.name))) continue;
      if (seen.has(norm(s.name))) continue;
      // 분류 이름이 다른 후보나 100선 이름이면 그 안의 건물·유물이다(예: 교태전 → 분류:경복궁)
      if (s.cats?.some((c) => { const n = norm(c); return n !== norm(s.wikiTitle) && (parents.has(n) || cores.includes(n)); })) continue;
      const minor = MINOR.test(s.name);
      if (minor && cores.some((c) => norm(s.name).includes(c))) continue;
      seen.add(norm(s.name));
      others.push({ ...s, minor, key: `${s.source}:${s.wikiTitle || s.name}` });
    }
    const all = [...local, ...others].map((s) => ({ ...s, dist: km(here, [s.lat, s.lng]) }));
    // 100선 → 내가 추가한 곳 → 관광지 분류 → 사진이 있는 곳 → 설명만 있는 곳 → 작은 문화유산 순으로, 같은 무리 안에서는 가까운 순
    const rank = (s) => (s.official ? 0 : s.custom ? 1 : s.minor ? 6 : s.tour ? 2 : s.image ? 3 : s.wikiTitle ? 4 : 5);
    const sorted = all.sort((a, b) => rank(a) - rank(b) || a.dist - b.dist);
    const minorCap = 6;
    return sorted.filter((x) => !x.minor || sorted.filter((y) => y.minor).indexOf(x) < minorCap).slice(0, 36);
  };
  onPartial?.(finish([]));
  const region = dest.sigungu && /(시|군)$/.test(dest.sigungu) ? dest.sigungu : '';
  const ext = [];
  const jobs = [
    wikiNearby(center, radiusKm, (r) => { ext.push(...r); onPartial?.(finish(ext)); }).catch(() => {}),
    wikiCategory(region, center).then((r) => { ext.push(...r); onPartial?.(finish(ext)); }).catch(() => {}),
    osmNearby(center, radiusKm).then((r) => { ext.push(...r); onPartial?.(finish(ext)); }).catch(() => {}),
  ];
  await Promise.all(jobs);
  return finish(ext);
}

export const searchLinks = (destName) => {
  const q = `${destName} 가볼만한 곳`;
  return {
    naver: `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`,
    google: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  };
};


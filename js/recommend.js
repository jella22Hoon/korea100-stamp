// 다음 여행지 추천: 미방문 관광지를 계절·일정·출발지 기준으로 묶어 코스를 만든다.
// 이동 시간은 직선거리로 추정한 값이라 실제와 다를 수 있다. (DOM에 의존하지 않음)

export const SEASONS = ['봄', '여름', '가을', '겨울'];

// radius: 첫 방문지에서 이 시간 이내인 곳만 함께 묶는다
// distWeight: 편도 1시간당 점수. 짧은 일정은 가까운 곳, 긴 일정은 평소 못 가는 먼 곳을 우대
export const TRIPS = {
  day: { label: '당일치기', days: 1, maxOneWay: 2.5, radius: 0.8, distWeight: -0.6 },
  '1n2d': { label: '1박 2일', days: 2, maxOneWay: 4.5, radius: 1.1, distWeight: 0 },
  '2n3d': { label: '2박 3일', days: 3, maxOneWay: 6.5, radius: 1.3, distWeight: 0.5 },
  '3n4d': { label: '3박 4일', days: 4, maxOneWay: 99, radius: 1.5, distWeight: 0.8 },
};

export const ORIGINS = [
  ['서울', 37.566, 126.978], ['인천', 37.456, 126.705], ['수원', 37.263, 127.029],
  ['춘천', 37.881, 127.730], ['강릉', 37.752, 128.876], ['청주', 36.642, 127.489],
  ['천안', 36.815, 127.114], ['대전', 36.351, 127.385], ['전주', 35.824, 127.148],
  ['광주', 35.160, 126.852], ['목포', 34.812, 126.392], ['여수', 34.760, 127.662],
  ['대구', 35.871, 128.601], ['포항', 36.019, 129.343], ['울산', 35.539, 129.311],
  ['부산', 35.180, 129.075], ['창원', 35.228, 128.681], ['제주', 33.499, 126.531],
].map(([name, lat, lng]) => ({ name, lat, lng }));

const DAY_HOURS = 10; // 하루에 이동+관광에 쓸 수 있는 시간
const DAYTRIP_HOURS = 12;
const AIR_HOURS = 3.5; // 제주 항공: 공항 이동·수속 포함 편도
const FERRY_HOURS = 3.5; // 울릉도 여객선 편도
const ULLEUNG_PORTS = [[36.03, 129.37], [37.77, 128.95], [37.55, 129.11]]; // 포항, 강릉, 묵호

export function seasonOf(month) {
  if (month >= 3 && month <= 5) return '봄';
  if (month >= 6 && month <= 8) return '여름';
  if (month >= 9 && month <= 11) return '가을';
  return '겨울';
}

export function km(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 자동차 이동 시간 추정: 직선거리 × 도로 우회 1.3 ÷ 평균 70km/h + 출발 준비 0.2h
export function driveHours(a, b) {
  const d = km(a, b);
  return d < 1 ? 0 : (d * 1.3) / 70 + 0.2;
}

const isJeju = (p) => p[0] < 34;

// 출발지 → 관광지 편도 이동. mode: car | air | ferry
export function access(origin, item) {
  const o = [origin.lat, origin.lng];
  const dest = item.area;
  if (item.island === 'ulleung') {
    const toPort = Math.min(...ULLEUNG_PORTS.map((port) => driveHours(o, port)));
    return { mode: 'ferry', hours: toPort + FERRY_HOURS };
  }
  if (isJeju(o) !== isJeju(dest)) return { mode: 'air', hours: AIR_HOURS };
  return { mode: 'car', hours: driveHours(o, dest) };
}

function seasonScore(item, season) {
  if (item.seasons.includes(season)) return item.seasons.length === 4 ? 1.5 : 3;
  return item.seasons.length <= 2 ? -3 : 0;
}

// 이동 수단별 최소 일정: 제주 1박2일, 울릉도 2박3일
function allowed(trip, acc) {
  if (acc.mode === 'air') return trip.days >= 2;
  if (acc.mode === 'ferry') return trip.days >= 3;
  return acc.hours <= trip.maxOneWay;
}

// 코스 안 방문 순서: 출발지에서 가장 가까운 곳부터 가까운 곳 순서로
function orderStops(stops, origin) {
  const left = [...stops];
  const out = [];
  let cur = [origin.lat, origin.lng];
  if (left.some((s) => s.acc.mode !== 'car')) {
    // 섬 지역은 도착 지점(첫 방문지)에서 시작
    left.sort((a, b) => a.acc.hours - b.acc.hours);
    cur = left[0].area;
  }
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (driveHours(cur, left[i].area) < driveHours(cur, left[best].area)) best = i;
    }
    const [next] = left.splice(best, 1);
    out.push({ ...next, leg: out.length ? driveHours(cur, next.area) : 0 });
    cur = next.area;
  }
  return out;
}

// 일자별로 나눈다. 첫날·마지막 날은 오가는 이동 시간을 뺀다.
function splitDays(stops, trip, oneWay) {
  const n = trip.days;
  const budget = (d) => {
    if (n === 1) return DAYTRIP_HOURS - 2 * oneWay;
    let b = DAY_HOURS;
    if (d === 0) b -= oneWay;
    if (d === n - 1) b -= oneWay;
    return b;
  };
  const days = Array.from({ length: n }, () => []);
  const used = Array(n).fill(0);
  const LEG = 0.5; // 같은 날 다른 곳으로 옮겨 가는 평균 이동

  // 오래 걸리는 곳(한라산 등반, 울릉도 등)은 오가는 이동이 없는 중간 날에 먼저 둔다
  const long = stops.filter((s) => s.hours >= 6);
  const rest = stops.filter((s) => s.hours < 6);
  const middle = n >= 3 ? days.map((_, i) => i).slice(1, -1) : days.map((_, i) => i);
  for (const s of long) {
    const d = middle.reduce((best, i) => (budget(i) - used[i] > budget(best) - used[best] ? i : best), middle[0]);
    days[d].push(s);
    used[d] += s.hours;
  }

  // 나머지는 방문 순서를 지키며 앞날부터 채운다
  let d = 0;
  for (const s of rest) {
    while (d < n - 1 && used[d] > 0 && used[d] + LEG + s.hours > budget(d)) d++;
    days[d].push(s);
    used[d] += (days[d].length > 1 ? LEG : 0) + s.hours;
  }

  // 하루 안의 순서는 전날 마지막 장소에서 가까운 순으로 다시 정하고, 구간 이동을 다시 계산한다
  let prev = null;
  return days.map((list) => {
    const left = [...list];
    const out = [];
    let cur = prev;
    while (left.length) {
      let best = 0;
      if (cur) {
        for (let i = 1; i < left.length; i++) {
          if (driveHours(cur, left[i].area) < driveHours(cur, left[best].area)) best = i;
        }
      }
      const [next] = left.splice(best, 1);
      out.push({ ...next, leg: cur ? driveHours(cur, next.area) : 0 });
      cur = next.area;
    }
    if (out.length) prev = cur;
    return out;
  });
}

function totalBudget(trip, oneWay) {
  return trip.days === 1 ? DAYTRIP_HOURS - 2 * oneWay : trip.days * DAY_HOURS - 2 * oneWay;
}

function buildCourse(anchor, pool, trip, origin) {
  const { radius } = trip;
  const oneWay = anchor.acc.hours;
  const budget = totalBudget(trip, oneWay);
  if (budget < Math.min(anchor.hours, 2)) return null;

  const near = pool
    .filter((p) => p.id !== anchor.id && p.acc.mode === anchor.acc.mode
      && isJeju(p.area) === isJeju(anchor.area) && p.island === anchor.island
      && driveHours(anchor.area, p.area) <= radius)
    .sort((a, b) => b.score - a.score || driveHours(anchor.area, a.area) - driveHours(anchor.area, b.area));

  const chosen = [anchor];
  const cost = (list) => {
    const ordered = orderStops(list, origin);
    return ordered.reduce((sum, s) => sum + s.leg + s.hours, 0);
  };
  for (const p of near) {
    if (p.score < 0) continue;
    // 이미 고른 곳 중 하나와는 가까워야 코스가 흩어지지 않는다
    if (Math.min(...chosen.map((c) => driveHours(c.area, p.area))) > radius * 0.8) continue;
    if (cost([...chosen, p]) <= budget) chosen.push(p);
  }

  const stops = orderStops(chosen, origin);
  const tourHours = stops.reduce((s, x) => s + x.leg + x.hours, 0);
  // 비는 시간이 많으면 감점 (일정 대비 볼거리가 부족한 코스)
  const idle = Math.max(0, budget - tourHours);
  // 숙박 일정인데 2시간 안쪽이면 당일치기로 갈 수 있는 곳이라 감점
  const nearHome = trip.days >= 2 ? Math.max(0, 2 - oneWay) * 3 * trip.days : 0;
  // 항공으로 가는 제주는 볼거리 수는 적어도 긴 일정에 잘 맞아 가산점
  const flyBonus = anchor.acc.mode === 'air' ? (trip.days - 1) * 2 : 0;
  const score = chosen.reduce((s, x) => s + x.score + 1, 0)
    + Math.min(oneWay, 6) * trip.distWeight - idle * 0.25 - nearHome + flyBonus;
  return {
    stops,
    days: splitDays(stops, trip, oneWay),
    oneWay,
    mode: anchor.acc.mode,
    tourHours,
    score,
  };
}

function regionTitle(course) {
  const counts = new Map();
  course.stops.forEach((s) => counts.set(s.sido, (counts.get(s.sido) || 0) + 1));
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return sorted.slice(0, 2).join('·');
}

/**
 * items: [{ id, name, sido, sigungu, seasons, hours, area, island }]
 * opts: { season, tripKey, origin, visited:Set, skip:Set(이미 보여 준 코스 key), seen:Set(이미 보여 준 관광지 id), limit }
 */
export function recommend(items, opts) {
  const trip = TRIPS[opts.tripKey];
  const pool = items
    .filter((it) => !opts.visited.has(it.id) && it.area)
    .map((it) => ({ ...it, acc: access(opts.origin, it), score: seasonScore(it, opts.season) }))
    .filter((it) => allowed(trip, it.acc));

  // 미방문 관광지마다 그곳을 첫 방문지로 하는 코스를 만들어 점수순으로 정렬한다
  const candidates = [];
  for (const a of pool) {
    if (a.score < 0) continue;
    const c = buildCourse(a, pool, trip, opts.origin);
    if (c) candidates.push({ ...c, anchorId: a.id, key: c.stops.map((s) => s.id).sort().join() });
  }
  candidates.sort((a, b) => b.score - a.score);

  // 방문지가 겹치지 않고, 대표 권역도 서로 다른 코스를 고른다
  const results = [];
  const taken = new Set();
  const regions = new Set();
  for (const c of candidates) {
    if (results.length >= (opts.limit || 3)) break;
    if (opts.skip?.has(c.key)) continue;
    if (c.stops.some((s) => taken.has(s.id))) continue;
    // "다른 코스 보기": 앞에서 보여 준 관광지가 절반 넘게 겹치면 비슷한 코스라 건너뛴다
    if (opts.seen && c.stops.filter((s) => opts.seen.has(s.id)).length * 2 > c.stops.length) continue;
    const region = regionTitle(c);
    if (regions.has(region)) continue;
    c.stops.forEach((s) => taken.add(s.id));
    regions.add(region);
    results.push({ ...c, title: `${region} ${trip.label}` });
  }

  // 섬 여행(제주 항공·울릉도 배)은 관광지 수가 적어 점수에서 밀리기 쉽다.
  // 첫 화면에 하나도 없고 점수가 1위의 70% 이상이면 마지막 자리에 넣는다.
  const limit = opts.limit || 3;
  if (!opts.seen && results.length === limit && !results.some((r) => r.mode !== 'car')) {
    const island = candidates.find((c) => c.mode !== 'car' && !opts.skip?.has(c.key));
    if (island && island.score >= results[0].score * 0.7) {
      results[limit - 1] = { ...island, title: `${regionTitle(island)} ${trip.label}` };
    }
  }
  return { results, poolSize: pool.length };
}

export function fmtHours(h) {
  const total = Math.max(0, Math.round(h * 6) / 6);
  const hh = Math.floor(total);
  const mm = Math.round((total - hh) * 60);
  if (hh === 0) return `${mm}분`;
  return mm ? `${hh}시간 ${mm}분` : `${hh}시간`;
}

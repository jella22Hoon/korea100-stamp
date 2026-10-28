// 출발지 → 여행지 가는 방법.
// 자동차: 오픈스트리트맵 도로망으로 실제 경로를 계산(OSRM 공개 서버). 교통 상황은 반영되지 않는다.
// 대중교통: 무료로 쓸 수 있는 국내 대중교통 경로 API가 없어 거리로 수단과 시간을 어림하고, 정확한 노선은 네이버 지도로 연결한다.
import { km, driveHours } from './recommend.js';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const cache = new Map();

const isJeju = (p) => p[0] < 34;
const isUlleung = (p) => p[1] > 130.5;

/** → { km, hours, roads: ['서울양양고속도로', …] } | null(못 구함) */
export async function carRoute(from, to) {
  const key = [from, to].map((p) => p.map((n) => n.toFixed(4)).join(',')).join(';');
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    if (isJeju(from) !== isJeju(to) || isUlleung(to)) return null; // 바다 건너는 길은 차로 계산하지 않는다
    const url = `${OSRM}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false&steps=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(String(res.status));
    const r = (await res.json()).routes?.[0];
    if (!r) return null;
    // 오래 달리는 도로 이름 순서대로(같은 도로는 한 번만)
    const long = new Map();
    for (const s of r.legs[0].steps) {
      const name = s.name || (s.ref ? `${s.ref}번 도로` : '');
      if (!name) continue;
      long.set(name, (long.get(name) || 0) + s.distance);
    }
    const order = [];
    for (const s of r.legs[0].steps) {
      const name = s.name || (s.ref ? `${s.ref}번 도로` : '');
      if (name && long.get(name) >= Math.max(3000, r.distance * 0.08) && !order.includes(name)) order.push(name);
    }
    return { km: r.distance / 1000, hours: r.duration / 3600, roads: order.slice(0, 4) };
  })();
  cache.set(key, job);
  return job.catch((e) => {
    cache.delete(key);
    throw e;
  });
}

/**
 * 대중교통 어림. 직선거리로 수단을 고르고 시간 범위를 낸다.
 * → { hours: [min, max], steps: ['…'], kind: 'walk'|'city'|'region'|'long'|'air'|'ferry', note }
 */
export function transitGuide(from, to, destLabel) {
  const d = km(from, to);
  const where = destLabel || '목적지';
  if (isJeju(from) !== isJeju(to)) {
    return {
      kind: 'air', hours: [3, 4.5],
      steps: ['가까운 공항(김포·김해·청주 등)으로 이동', '제주공항까지 비행기 약 1시간', `공항에서 ${where}까지 버스·택시·렌터카`],
    };
  }
  if (isUlleung(to)) {
    return {
      kind: 'ferry', hours: [5, 7],
      steps: ['포항·강릉·묵호·후포 여객선터미널로 이동', '울릉도까지 여객선 약 3시간 안팎(날씨에 따라 결항)', '도착 항구에서 버스·택시'],
    };
  }
  if (d < 2) return { kind: 'walk', hours: [0.2, 0.5], steps: [`걸어서 가거나 시내버스로 ${where}까지`] };
  if (d < 25) {
    return {
      kind: 'city', hours: [0.3 + d / 22, 0.5 + d / 14],
      steps: ['지하철·시내버스로 이동(갈아타기 1~2번 정도)', `내린 곳에서 ${where}까지 걷기 또는 택시`],
    };
  }
  if (d < 80) {
    return {
      kind: 'region', hours: [0.6 + d / 45, 1 + d / 30],
      steps: ['광역버스·시외버스나 전철로 목적지 근처 도시까지', `그곳에서 시내버스·택시로 ${where}까지`],
    };
  }
  return {
    kind: 'long', hours: [0.9 + d / 110, 1.5 + d / 70],
    steps: ['KTX·SRT·ITX 같은 열차나 고속·시외버스로 목적지 근처 역·터미널까지', `역·터미널에서 시내버스·택시로 ${where}까지`, '관광지 가는 버스는 하루 몇 대뿐인 곳도 있어 시간표를 꼭 확인하세요'],
  };
}

// 표 예매 사이트(공식)
export const TICKET_LINKS = {
  long: [['코레일(KTX·ITX)', 'https://www.letskorail.com/'], ['SRT', 'https://etk.srail.kr/'], ['고속버스', 'https://www.kobus.co.kr/'], ['시외버스', 'https://www.bustago.or.kr/']],
  region: [['시외버스', 'https://www.bustago.or.kr/'], ['코레일', 'https://www.letskorail.com/']],
};

// 직선거리로 어림한 자동차 시간(경로 계산을 못 했을 때)
export const roughDrive = (from, to) => ({ km: km(from, to) * 1.3, hours: driveHours(from, to) });

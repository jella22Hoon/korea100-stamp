// tools/points/*.mjs(한 줄 소개가 붙은 관광 포인트)를 앱이 읽는 data/points.json으로 합친다.
// 실행: node tools/points/build.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import a from './a.mjs';
import b from './b.mjs';
import c from './c.mjs';
import d from './d.mjs';

const places = JSON.parse(readFileSync(new URL('../../data/places.json', import.meta.url))).places;
const all = { ...a, ...b, ...c, ...d };
const points = {};
for (const p of places) {
  const list = all[p.id];
  if (!list?.length) throw new Error(`${p.id} ${p.name}: 관광 포인트가 없어요`);
  const names = new Set();
  points[p.id] = list.map(([n, d]) => {
    if (names.has(n)) throw new Error(`${p.id}: '${n}' 중복`);
    names.add(n);
    return { n, d };
  });
}
const out = {
  meta: {
    title: '주요 관광 포인트',
    written: '2026-10',
    notes: [
      '관광지마다 널리 알려진 볼거리를 골라 한 줄 소개를 붙였어요. 확실하지 않은 내용은 넣지 않았어요.',
      '운영 시간·요금·예약·축제 일정은 바뀔 수 있어 "확인"이라고 적었어요. 방문 전에 확인하세요.',
    ],
  },
  points,
};
writeFileSync(new URL('../../data/points.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
const n = Object.values(points).reduce((s, l) => s + l.length, 0);
console.log(`${places.length}곳 · 포인트 ${n}개 (곳당 평균 ${(n / places.length).toFixed(1)})`);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick } from '../src/random.ts';

test('rechaza listas vacías y valores aleatorios inválidos', () => {
  assert.throws(() => pick([]), /No hay opciones/);
  for (const n of [-0.1, 1, NaN, Infinity]) assert.throws(() => pick([1], () => n), /fuera de rango/);
});
test('una opción y los extremos del intervalo', () => {
  assert.equal(pick(['único'], () => 0.99), 'único');
  assert.equal(pick(['a', 'b', 'c'], () => 0), 'a');
  assert.equal(pick(['a', 'b', 'c'], () => 1 - Number.EPSILON), 'c');
  assert.equal(pick(['a', 'b'], () => 0.5), 'b');
});
test('temporadas con distinta longitud tienen igual probabilidad', () => {
  const seasons = [[1, 2], [3, 4, 5, 6, 7, 8]];
  const seasonCounts = [0, 0];
  const episodeCounts = new Map<number, number>();
  // Exhaustive equal-width bins, not a flaky statistical test.
  for (let s = 0; s < 120; s++) {
    const season = pick(seasons, () => (s + 0.5) / 120);
    seasonCounts[seasons.indexOf(season)]!++;
    for (let e = 0; e < 120; e++) {
      const selected = pick(season, () => (e + 0.5) / 120);
      episodeCounts.set(selected, (episodeCounts.get(selected) ?? 0) + 1);
    }
  }
  assert.deepEqual(seasonCounts, [60, 60]);
  assert.equal(episodeCounts.get(1), 3600);
  assert.equal(episodeCounts.get(2), 3600);
  for (const e of seasons[1]!) assert.equal(episodeCounts.get(e), 1200);
});

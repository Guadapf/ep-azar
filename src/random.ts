// Injectable randomness makes the probability boundaries directly testable.
export function pick<T>(items: readonly T[], random: () => number = Math.random): T {
  if (!items.length) throw new Error('No hay opciones disponibles para sortear.');
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Valor aleatorio fuera de rango.');
  return items[Math.floor(value * items.length)]!;
}

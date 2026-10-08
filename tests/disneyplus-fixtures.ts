import { JSDOM } from 'jsdom';
export const disneyId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const disneyShow = disneyId(900);
export const disneyUrl = `https://www.disneyplus.com/es-419/browse/entity-${disneyShow}`;
export function disneyEpisode(season: number, number: number) {
  const id = disneyId(season * 100 + number);
  return `<a data-testid="set-item" data-item-id="${id}" href="/es-419/play/${id}?source=card" aria-label="Temporada ${season} Episodio ${number} Título y descripción"><span data-testid="standard-regular-list-item-title">${number}. Capítulo ${number}</span><span data-testid="standard-regular-list-metadata">(23 min)23 minutos,26 s</span></a>`;
}
export function disneyFixture(single = false) {
  const dom = new JSDOM(`<title>Serie de prueba | Disney+</title><div data-testid="explore-details-view"><div data-testid="details-title-treatment"><img alt="Serie de prueba"></div><div data-testid="masthead-metadata">${single ? 1 : 2} temporadas • Comedia</div><div id="episodes" role="tabpanel">${single ? '' : `<button data-testid="dropdown-button" aria-expanded="false">Temporada 1</button><ul>${[1, 2].map(n => `<li role="option" id="${disneyId(n)}" title="Temporada ${n}">Temporada ${n}</li>`).join('')}</ul>`}<section data-testid="set-section" data-set-id="${disneyId(1)}"><div id="rows">${disneyEpisode(1, 1)}</div><div data-testid="grid-pagination-spy"></div></section></div></div>`, { url: disneyUrl });
  const doc = dom.window.document;
  const set = doc.querySelector<HTMLElement>('section')!;
  const rows = doc.getElementById('rows')!;
  let active = 1, scrolls = 0;
  Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollIntoView', { value: function(this: HTMLElement) {
    if (this.matches('[data-testid="grid-pagination-spy"]')) {
      scrolls++;
      const length = rows.querySelectorAll('a').length;
      if (length < active + 1) rows.insertAdjacentHTML('beforeend', disneyEpisode(active, length + 1));
    }
  } });
  const toggle = doc.querySelector('button');
  toggle?.addEventListener('click', () => toggle.setAttribute('aria-expanded', 'true'));
  for (const option of doc.querySelectorAll<HTMLElement>('[role="option"]')) option.addEventListener('click', () => {
    active = Number(option.title.match(/\d+/)![0]);
    toggle!.textContent = option.title; toggle!.setAttribute('aria-expanded', 'false');
    set.dataset.setId = option.id;
    // Simulate an asynchronous SPA replacement, retaining stale cards briefly.
    queueMicrotask(() => { rows.innerHTML = disneyEpisode(active, 1); });
  });
  return { dom, doc, set, rows, scrolls: () => scrolls };
}

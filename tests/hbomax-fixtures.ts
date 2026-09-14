import { JSDOM } from 'jsdom';

export const showId = '11111111-1111-4111-8111-111111111111';
export const episodeId = (number: number) => `22222222-2222-4222-8222-${String(number).padStart(12, '0')}`;
export function hboEpisode(season: number, number: number, total: number, repeat = false) {
  const id = episodeId(season * 100 + number);
  return `<a data-sonic-id="${id}" href="/video/watch/${id}${repeat ? '?pos=0' : ''}" aria-label="⁦⁨${repeat ? 'Ver de nuevo: ' : ''}Temporada ${season}, Episodio ${number}: ⁨Un título. Con puntuación⁩⁩. ⁨${number} de ${total}⁩. Duración: 22 minutos"><p>E${number}: Un título. Con puntuación</p></a>`;
}
export function hboFixture(single = false) {
  const url = `https://play.hbomax.com/show/${showId}?season=1`;
  const dom = new JSDOM(`<!doctype html><html><head><link rel="canonical" href="/show/${showId}"></head><body>
    <main aria-label="Serie de prueba"><div role="heading" aria-level="1" aria-label="Serie de prueba"></div>
    <div role="tabpanel" aria-label="Episodios">
      ${single ? '' : `<div data-dropdown="tabbedContentDropdown"><button aria-haspopup="true" aria-expanded="false">Temporada 1</button>
      <ul role="listbox"><li role="option" aria-label="Temporada 1">Temporada 1</li><li role="option" aria-label="Temporada 2">Temporada 2</li></ul></div>`}
      <div id="rows">${hboEpisode(1, 1, 2, true)}${hboEpisode(1, 2, 2)}</div>
    </div><aside><a href="/video/watch/${episodeId(999)}" aria-label="Tráiler">Tráiler</a></aside></main>
    </body></html>`, { url });
  const doc = dom.window.document;
  const toggle = doc.querySelector('button')!;
  toggle?.addEventListener('click', () => toggle.setAttribute('aria-expanded', toggle.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'));
  for (const option of doc.querySelectorAll<HTMLElement>('[role="option"]')) {
    option.addEventListener('click', () => {
      toggle.textContent = option.textContent;
      toggle.setAttribute('aria-expanded', 'false');
      if (option.textContent === 'Temporada 2') {
        // HBO leaves season-one links visible while the new season is loading.
        dom.reconfigure({ url: url.replace('season=1', 'season=2') });
        setTimeout(() => { doc.getElementById('rows')!.innerHTML = hboEpisode(2, 1, 3) + hboEpisode(2, 2, 3); }, 100);
        setTimeout(() => { doc.getElementById('rows')!.insertAdjacentHTML('beforeend', hboEpisode(2, 3, 3)); }, 300);
      }
    });
  }
  return { dom, doc };
}

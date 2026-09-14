import { JSDOM } from 'jsdom';

// Minimal synthetic fixture with the attributes observed in Netflix on 2026-09-12.
// No cookies, profile data, synopsis text or captured tracking payloads are stored.
export function episode(id: number, number: number) {
  return `<div class="episode-item" role="button" aria-label="Episodio ${number}"><span class="titleCard-title_index">${number}</span><span data-ui-tracking-context="${encodeURIComponent(JSON.stringify({ video_id: id }))}"></span></div>`;
}
export function fixture(single = false) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div role="dialog" data-uia="modal-motion-container-DETAIL_MODAL">
      <h3>Acerca de <strong>Serie de prueba</strong></h3>
      <a href="/watch/101?tctx=Video%3A123%2CdetailsPagePlayButton">Reproducir</a>
      <div class="videoMetadata--line"><span class="duration">${single ? '2 episodios' : '2 temporadas'}</span></div>
      <div data-uia="episode-selector">
        ${single ? '' : `<button data-uia="dropdown-toggle" aria-expanded="false">Temporada 1</button>
        <ul><li data-uia="dropdown-menu-item" data-index="0" role="menuitem">Temporada 1 (2 episodios)</li>
        <li data-uia="dropdown-menu-item" data-index="1" role="menuitem">Temporada 2 (3 episodios)</li>
        <li data-uia="dropdown-menu-item" role="menuitem">Ver todos los episodios</li></ul>`}
        <div id="rows">${episode(101, 1)}${episode(102, 2)}</div>
      </div>
    </div></body></html>`, { url: 'https://www.netflix.com/browse?jbv=123' });
  const doc = dom.window.document;
  const toggle = doc.querySelector<HTMLButtonElement>('[data-uia="dropdown-toggle"]');
  toggle?.addEventListener('click', () => toggle.setAttribute('aria-expanded', toggle.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'));
  for (const option of doc.querySelectorAll<HTMLElement>('[data-index]')) {
    option.addEventListener('click', () => {
      toggle!.textContent = option.dataset.index === '0' ? 'Temporada 1' : 'Temporada 2';
      toggle!.setAttribute('aria-expanded', 'false');
      if (option.dataset.index === '1') {
        doc.getElementById('rows')!.innerHTML = '';
        setTimeout(() => {
          doc.getElementById('rows')!.innerHTML = episode(201, 1) + episode(202, 2);
          const expand = doc.createElement('button');
          expand.dataset.uia = 'section-expand';
          expand.onclick = () => { doc.getElementById('rows')!.insertAdjacentHTML('beforeend', episode(203, 3)); expand.remove(); };
          doc.querySelector('[data-uia="episode-selector"]')!.append(expand);
        }, 200);
      }
    });
  }
  return { dom, doc };
}

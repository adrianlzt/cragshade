<script lang="ts">
  import { onMount } from 'svelte'
  import { listPhotos } from '../lib/api'
  import { baseMap, dotIcon, L } from '../lib/leaflet'

  const VIEW_KEY = 'cragshade.mapView'

  let el: HTMLDivElement
  let map: L.Map
  let error = $state('')
  let count = $state<number | null>(null)

  function savedView(): { center: [number, number]; zoom: number } {
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '')
      if (Array.isArray(v.center) && typeof v.zoom === 'number') return v
    } catch {
      /* sin vista guardada */
    }
    return { center: [40.2, -3.7], zoom: 6 }
  }

  function escape(s: string) {
    return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  }

  onMount(() => {
    const v = savedView()
    map = baseMap(el, v.center, v.zoom)
    map.on('moveend', () => {
      const c = map.getCenter()
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify({ center: [c.lat, c.lng], zoom: map.getZoom() }))
      } catch {
        /* almacenamiento no disponible */
      }
    })

    const cluster = L.markerClusterGroup({ maxClusterRadius: 40 })
    map.addLayer(cluster)
    listPhotos()
      .then((photos) => {
        count = photos.length
        for (const p of photos) {
          const html = `<a class="cs-popup" href="#/photo/${p.id}">
              <img src="${p.thumb_url}" alt="" loading="lazy" />
              <strong>${escape(p.wall_name)}</strong><small>por ${escape(p.alias)}</small></a>`
          L.marker([p.lat, p.lon], { icon: dotIcon() }).bindPopup(html, { minWidth: 200 }).addTo(cluster)
        }
      })
      .catch((e) => (error = `No se pudieron cargar las fotos: ${e.message}`))

    return () => map.remove()
  })

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) => map.setView([p.coords.latitude, p.coords.longitude], 14),
      (e) => (error = `Sin ubicación: ${e.message}`),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }
</script>

<div class="screen">
  <header class="bar">
    <strong class="brand">☀ CragShade</strong>
    <small>{count == null ? '' : `${count} ${count === 1 ? 'foto' : 'fotos'}`}</small>
  </header>
  <div class="map" bind:this={el}></div>
  {#if error}<p class="toast">{error}</p>{/if}
  <div class="fabs">
    <button type="button" class="fab secondary" onclick={locate} aria-label="Mi ubicación">◎</button>
    <a class="fab" href="#/upload">＋ Subir foto 360</a>
  </div>
</div>

<style>
  .screen {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .map {
    flex: 1;
  }
  .brand {
    flex: 1;
  }
  .fabs {
    position: absolute;
    right: 1rem;
    bottom: calc(1.5rem + env(safe-area-inset-bottom));
    display: flex;
    gap: 0.75rem;
    align-items: center;
    z-index: 1000;
  }
  .toast {
    position: absolute;
    left: 1rem;
    right: 1rem;
    top: 4rem;
    z-index: 1000;
    background: var(--danger);
    color: #fff;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
  }
</style>

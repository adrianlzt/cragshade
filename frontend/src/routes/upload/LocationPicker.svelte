<script lang="ts">
  import { onMount } from 'svelte'
  import { baseMap, dotIcon, L } from '../../lib/leaflet'

  interface Props {
    lat: number | null
    lon: number | null
    /** Pedir la ubicación del móvil al abrir si no hay punto. */
    autoLocate?: boolean
  }

  let { lat = $bindable(), lon = $bindable(), autoLocate = false }: Props = $props()

  let el: HTMLDivElement
  let map: L.Map
  let marker: L.Marker | null = null
  let locating = $state(false)
  let error = $state('')

  function place(la: number, lo: number, zoom?: number) {
    lat = la
    lon = lo
    if (!marker) {
      marker = L.marker([la, lo], { draggable: true, icon: dotIcon('pin') }).addTo(map)
      marker.on('dragend', () => {
        const p = marker!.getLatLng()
        lat = p.lat
        lon = p.lng
      })
    } else marker.setLatLng([la, lo])
    map.setView([la, lo], zoom ?? map.getZoom())
  }

  onMount(() => {
    map = baseMap(el, [40.2, -3.7], 5)
    if (lat != null && lon != null) place(lat, lon, 16)
    else if (autoLocate) locate()
    map.on('click', (e: L.LeafletMouseEvent) => place(e.latlng.lat, e.latlng.lng))
    return () => map.remove()
  })

  function locate() {
    locating = true
    error = ''
    navigator.geolocation.getCurrentPosition(
      (p) => {
        locating = false
        place(p.coords.latitude, p.coords.longitude, 17)
      },
      (e) => {
        locating = false
        error = e.message
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }
</script>

<div class="picker">
  <div class="map" bind:this={el}></div>
  <div class="row">
    <small>
      {#if lat != null && lon != null}
        {lat.toFixed(5)}, {lon.toFixed(5)} · arrastra el punto para ajustarlo
      {:else}
        Toca el mapa para marcar la pared
      {/if}
    </small>
    <button type="button" onclick={locate} disabled={locating}>{locating ? 'Buscando…' : 'Mi ubicación'}</button>
  </div>
  {#if error}<p class="warn">{error}</p>{/if}
</div>

<style>
  .map {
    height: 240px;
    border-radius: 10px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }
</style>

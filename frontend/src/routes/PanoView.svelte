<script lang="ts">
  import type { Viewer } from '@photo-sphere-viewer/core'
  import { getPhoto, type Photo } from '../lib/api'
  import { cardinal, yawForAzimuth } from '../lib/heading'
  import { cardinalMarkers, sunMarker, sunPathMarkers } from '../lib/overlays'
  import Pano from '../lib/Pano.svelte'
  import SunControls from '../lib/SunControls.svelte'
  import { sunPath, sunPosition } from '../lib/sun'
  import { dateToZoned, tzFor, zonedToDate } from '../lib/time'

  let { params = {} }: { params?: { id?: string } } = $props()

  const METHOD: Record<string, string> = {
    sun: 'orientada con el sol',
    compass: 'orientada con brújula',
    exif: 'orientación del móvil (poco fiable)',
    manual: 'orientación manual',
  }

  let photo = $state<Photo | null>(null)
  let error = $state('')
  let viewer = $state<Viewer>()
  let day = $state('')
  let minutes = $state(0)
  let showPanel = $state(true)

  const tz = $derived(photo ? (photo.tz ?? tzFor(photo.lat, photo.lon)) : 'UTC')

  function setNow() {
    const z = dateToZoned(new Date(), tz)
    day = z.day
    minutes = Math.round(z.minutes / 10) * 10
  }

  $effect(() => {
    const id = params.id
    if (!id) return
    photo = null
    error = ''
    getPhoto(id)
      .then((p) => {
        photo = p
        setNow()
      })
      .catch((e) => (error = e.message))
  })

  const sun = $derived(photo && day ? sunPosition(zonedToDate(day, minutes, tz), photo.lat, photo.lon) : null)
  const path = $derived(photo && day ? sunPath(day, tz, photo.lat, photo.lon) : [])
  const markers = $derived(
    photo && sun
      ? [...cardinalMarkers(photo.heading_true), ...sunPathMarkers(path, photo.heading_true), ...sunMarker(sun, photo.heading_true)]
      : [],
  )

  function lookAtSun() {
    if (!viewer || !sun || !photo) return
    viewer.animate({
      yaw: `${yawForAzimuth(sun.azimuth, photo.heading_true)}deg`,
      pitch: `${Math.max(-10, sun.altitude)}deg`,
      speed: '3rpm',
    })
  }
</script>

<div class="screen">
  <header class="bar">
    <a href="#/" class="back" aria-label="Volver al mapa">←</a>
    <div class="title">
      {#if photo}
        <strong>{photo.wall_name}</strong>
        <small>por {photo.alias} · {METHOD[photo.orientation_method]}{photo.orientation_residual_deg != null
            ? ` (±${photo.orientation_residual_deg.toFixed(0)}°)`
            : ''}</small>
      {:else}
        <strong>Cargando…</strong>
      {/if}
    </div>
  </header>

  {#if error}
    <p class="error">{error}</p>
  {:else if photo}
    <div class="viewer">
      <Pano src={photo.web_url} panoData={photo.pano_data} {markers} bind:viewer />
    </div>
    <section class="sheet">
      <button type="button" class="handle" onclick={() => (showPanel = !showPanel)}>
        {#if sun && sun.altitude > -1}
          ☀ {cardinal(sun.azimuth)} · {sun.azimuth.toFixed(0)}° · altura {sun.altitude.toFixed(0)}°
        {:else}
          🌙 Sol bajo el horizonte
        {/if}
        <span class="chev">{showPanel ? '▾' : '▴'}</span>
      </button>
      {#if showPanel}
        <SunControls bind:day bind:minutes {tz} lat={photo.lat} lon={photo.lon} onnow={setNow} onlook={lookAtSun} />
      {/if}
    </section>
  {/if}
</div>

<style>
  .screen {
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .viewer {
    flex: 1;
    min-height: 0;
  }
  .back {
    font-size: 1.4rem;
    text-decoration: none;
    padding: 0 0.5rem;
  }
  .title {
    display: grid;
    min-width: 0;
  }
  .title small {
    opacity: 0.75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .handle {
    width: 100%;
    display: flex;
    justify-content: space-between;
    background: none;
    border: none;
    color: inherit;
    padding: 0 0 0.5rem;
    font-size: 0.95rem;
  }
  .error {
    padding: 1rem;
  }
</style>

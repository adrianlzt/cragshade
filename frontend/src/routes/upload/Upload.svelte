<script lang="ts">
  import { onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { createPhoto, type OrientationMethod } from '../../lib/api'
  import { looksEquirectangular, readPhotoMeta, type PhotoMeta } from '../../lib/exif'
  import { cardinal, norm360 } from '../../lib/heading'
  import { cardinalMarkers, sunMarker, sunPathMarkers } from '../../lib/overlays'
  import Pano from '../../lib/Pano.svelte'
  import { sunPath, sunPosition } from '../../lib/sun'
  import { dateToZoned, formatMinutes, parseExifDate, tzFor, zonedToDate } from '../../lib/time'
  import LocationPicker from './LocationPicker.svelte'
  import OrientCompass from './OrientCompass.svelte'
  import OrientSun from './OrientSun.svelte'

  const ALIAS_KEY = 'cragshade.alias'

  type Step = 'photo' | 'details' | 'orient' | 'verify'
  let step = $state<Step>('photo')
  let error = $state('')
  let busy = $state(false)
  let progress = $state('')

  let file = $state<File | null>(null)
  let url = $state('')
  let meta = $state<PhotoMeta | null>(null)

  let alias = $state(loadAlias())
  let wallName = $state('')
  let lat = $state<number | null>(null)
  let lon = $state<number | null>(null)
  let day = $state('')
  let time = $state('12:00')

  let method = $state<OrientationMethod>('sun')
  let tab = $state<'sun' | 'compass'>('sun')
  let heading = $state(0)
  let adjust = $state(0)
  let residual = $state<number | null>(null)
  let accuracy = $state<number | null>(null)

  function loadAlias() {
    try {
      return localStorage.getItem(ALIAS_KEY) ?? ''
    } catch {
      return ''
    }
  }

  const tz = $derived(lat != null && lon != null ? tzFor(lat, lon) : Intl.DateTimeFormat().resolvedOptions().timeZone)
  const capturedAt = $derived.by(() => {
    if (!day || !/^\d{2}:\d{2}$/.test(time)) return null
    const [h, m] = time.split(':').map(Number)
    return zonedToDate(day, h * 60 + m, tz)
  })
  const captureSun = $derived(capturedAt && lat != null && lon != null ? sunPosition(capturedAt, lat, lon) : null)
  const finalHeading = $derived(norm360(heading + adjust))

  async function pickFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]
    if (!f) return
    error = ''
    busy = true
    if (url) URL.revokeObjectURL(url)
    url = URL.createObjectURL(f)
    try {
      const m = await readPhotoMeta(f, url)
      if (!looksEquirectangular(m)) {
        error = `La imagen (${m.width}×${m.height}) no parece una foto esférica: tiene que ser equirectangular 2:1.`
        return
      }
      file = f
      meta = m
      lat = m.lat
      lon = m.lon
      const spotTz = m.lat != null && m.lon != null ? tzFor(m.lat, m.lon) : tz
      const date = (m.dateRaw && parseExifDate(m.dateRaw, m.dateOffset ?? undefined, spotTz)) || new Date(f.lastModified)
      const z = dateToZoned(date, spotTz)
      day = z.day
      time = formatMinutes(z.minutes)
      step = 'details'
    } catch (err) {
      error = (err as Error).message
    } finally {
      busy = false
    }
  }

  function setOrientation(h: number, m: OrientationMethod, res: number | null = null, acc: number | null = null) {
    heading = h
    method = m
    residual = res
    accuracy = acc
    adjust = 0
    step = 'verify'
  }

  async function submit() {
    if (!file || lat == null || lon == null) return
    busy = true
    error = ''
    try {
      try {
        localStorage.setItem(ALIAS_KEY, alias.trim())
      } catch {
        /* almacenamiento no disponible */
      }
      const photo = await createPhoto({
        image: file,
        alias: alias.trim(),
        wall_name: wallName.trim(),
        lat,
        lon,
        alt: meta?.alt,
        captured_at: capturedAt?.toISOString(),
        tz,
        heading_true: finalHeading,
        orientation_method: method,
        orientation_residual_deg: residual != null ? Math.max(residual, Math.abs(adjust)) : null,
        compass_accuracy_deg: accuracy,
        pano_data: meta?.panoData,
      }, (sent, total) => (progress = ` ${Math.round((sent / total) * 100)} %`))
      push(`/photo/${photo.id}`)
    } catch (err) {
      error = `No se pudo subir: ${(err as Error).message}`
    } finally {
      busy = false
      progress = ''
    }
  }

  onDestroy(() => url && URL.revokeObjectURL(url))

  const detailsOk = $derived(alias.trim() && wallName.trim() && lat != null && lon != null && capturedAt)

  const verifyMarkers = $derived(
    captureSun && lat != null && lon != null
      ? [
          ...cardinalMarkers(finalHeading),
          ...sunPathMarkers(sunPath(day, tz, lat, lon), finalHeading),
          ...sunMarker(captureSun, finalHeading),
        ]
      : [],
  )

  const STEPS: [Step, string][] = [
    ['photo', 'Foto'],
    ['details', 'Datos'],
    ['orient', 'Orientar'],
    ['verify', 'Comprobar'],
  ]
</script>

<div class="screen scroll">
  <header class="bar">
    <a href="#/" class="back" aria-label="Cancelar">✕</a>
    <strong>Subir foto 360</strong>
  </header>

  <ol class="steps">
    {#each STEPS as [s, label], i}
      <li class:active={s === step} class:done={STEPS.findIndex(([x]) => x === step) > i}>{label}</li>
    {/each}
  </ol>

  <main class="content">
    {#if error}<p class="warn">{error}</p>{/if}

    {#if step === 'photo'}
      <p>
        Elige una <strong>foto esférica</strong> (Photo Sphere / panorámica 360) hecha desde la pared. Mejor si en la foto
        se ve el sol: así podremos orientarla con mucha precisión.
      </p>
      <label class="file">
        <input type="file" accept="image/jpeg" onchange={pickFile} disabled={busy} />
        <span class="primary button">{busy ? 'Leyendo…' : 'Elegir foto'}</span>
      </label>
    {:else if step === 'details'}
      <div class="form">
        <label>Tu alias <input bind:value={alias} maxlength="40" autocomplete="nickname" /></label>
        <label>Pared / sector <input bind:value={wallName} maxlength="80" placeholder="p. ej. La Pedriza · El Yelmo" /></label>
        <fieldset>
          <legend>Ubicación {meta?.lat != null ? '(de la foto)' : ''}</legend>
          {#if meta?.lat == null}
            <p class="muted">
              La foto no trae ubicación: muchos móviles (Android sobre todo) la borran al subir fotos desde el navegador.
              Usamos la ubicación actual del móvil; si no estás en la pared, mueve el punto.
            </p>
          {/if}
          <LocationPicker bind:lat bind:lon autoLocate={meta?.lat == null} />
        </fieldset>
        <fieldset>
          <legend>Fecha y hora de la foto <small>(hora local de la pared, {tz})</small></legend>
          <div class="row">
            <input type="date" bind:value={day} />
            <input type="time" bind:value={time} />
          </div>
          {#if !meta?.dateRaw}<p class="warn">La foto no trae fecha; revisa que sea correcta.</p>{/if}
        </fieldset>
        <div class="row end">
          <button type="button" onclick={() => (step = 'photo')}>Atrás</button>
          <button type="button" class="primary" disabled={!detailsOk} onclick={() => (step = 'orient')}>Siguiente</button>
        </div>
      </div>
    {:else if step === 'orient' && lat != null && lon != null && captureSun}
      <div class="tabs">
        <button type="button" class:active={tab === 'sun'} onclick={() => (tab = 'sun')}>☀ Con el sol</button>
        <button type="button" class:active={tab === 'compass'} onclick={() => (tab = 'compass')}>🧭 Con brújula</button>
      </div>
      {#if tab === 'sun'}
        {#if captureSun.altitude < 0}
          <p class="warn">A la hora de la foto ({time}) el sol estaba bajo el horizonte. Usa la brújula o revisa la hora.</p>
        {:else}
          <OrientSun src={url} panoData={meta?.panoData ?? null} sun={captureSun} ondone={(h) => setOrientation(h, 'sun', 2)} />
        {/if}
      {:else}
        <OrientCompass
          src={url}
          panoData={meta?.panoData ?? null}
          {lat}
          {lon}
          ondone={(h, res, acc) => setOrientation(h, 'compass', res, acc)}
        />
      {/if}
      {#if meta?.poseHeading != null}
        <p class="muted">
          El móvil guardó una orientación ({meta.poseHeading.toFixed(0)}°), pero suele ser poco fiable.
          <button type="button" class="link" onclick={() => setOrientation(meta!.poseHeading!, 'exif')}>Usarla igualmente</button>
        </p>
      {/if}
      <div class="row end">
        <button type="button" onclick={() => (step = 'details')}>Atrás</button>
      </div>
    {:else if step === 'verify' && lat != null && lon != null}
      <p>
        Comprueba que los puntos cardinales cuadran y que el sol (a la hora de la foto, {time}) cae donde debe. Si hace
        falta, ajusta un poco.
      </p>
      <div class="pano-box">
        <Pano src={url} panoData={meta?.panoData ?? null} markers={verifyMarkers} />
      </div>
      <label>
        Ajuste fino: {adjust > 0 ? '+' : ''}{adjust}° → el centro mira a {finalHeading.toFixed(0)}° ({cardinal(finalHeading)})
        <input type="range" min="-10" max="10" step="0.5" bind:value={adjust} />
      </label>
      {#if method === 'exif'}
        <p class="warn">Orientación tomada del móvil: compruébala bien con los puntos cardinales.</p>
      {/if}
      <div class="row end">
        <button type="button" onclick={() => (step = 'orient')}>Atrás</button>
        <button type="button" class="primary" disabled={busy} onclick={submit}>{busy ? `Subiendo…${progress}` : 'Publicar'}</button>
      </div>
    {/if}
  </main>
</div>

<style>
  .steps {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0.5rem 1rem;
    gap: 0.25rem;
    font-size: 0.8rem;
  }
  .steps li {
    flex: 1;
    text-align: center;
    padding: 0.3rem 0;
    border-bottom: 3px solid var(--line);
    opacity: 0.6;
  }
  .steps li.active {
    border-color: var(--accent);
    opacity: 1;
    font-weight: 600;
  }
  .steps li.done {
    border-color: var(--ok);
  }
  .content {
    padding: 0 1rem calc(2rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 0.75rem;
  }
  .form {
    display: grid;
    gap: 0.9rem;
  }
  .form label {
    display: grid;
    gap: 0.25rem;
  }
  fieldset {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.6rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .row.end {
    justify-content: flex-end;
  }
  .file input {
    display: none;
  }
  .tabs {
    display: flex;
    gap: 0.5rem;
  }
  .tabs button {
    flex: 1;
  }
  .tabs button.active {
    background: var(--accent);
    color: #1d2a36;
    border-color: var(--accent);
  }
  .back {
    font-size: 1.2rem;
    text-decoration: none;
    padding: 0 0.5rem;
  }
  input[type='range'] {
    width: 100%;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    text-decoration: underline;
    padding: 0;
  }
</style>

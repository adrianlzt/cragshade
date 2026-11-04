<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { PanoData } from '@photo-sphere-viewer/core'
  import type { MarkerConfig } from '@photo-sphere-viewer/markers-plugin'
  import {
    CalibrationTracker,
    IOS_MAX_ACCURACY,
    StabilityWindow,
    detectCompass,
    requestCompassPermission,
    startCompass,
    type CompassPlatform,
    type CompassReading,
  } from '../../lib/compass'
  import {
    COMPASS_MIN_REFS,
    COMPASS_MIN_SEPARATION,
    MAX_RESIDUAL,
    cardinal,
    compassSolutionOk,
    solveCompass,
    type CompassReference,
  } from '../../lib/heading'
  import Pano from '../../lib/Pano.svelte'

  interface Props {
    src: string
    panoData: PanoData | null
    lat: number
    lon: number
    ondone: (heading: number, residual: number, accuracy: number | null) => void
  }

  let { src, panoData, lat, lon, ondone }: Props = $props()

  type Phase = 'start' | 'unsupported' | 'calibrate' | 'refs'
  let phase = $state<Phase>('start')
  let platform = $state<CompassPlatform | null>(null)
  let reading = $state<CompassReading | null>(null)
  let progress = $state(0)
  let stable = $state(false)
  let jitter = $state(Infinity)
  let viewYaw = $state(0)
  let refs = $state<CompassReference[]>([])
  let stop: (() => void) | null = null

  const tracker = new CalibrationTracker()
  const window_ = new StabilityWindow()

  const accuracyOk = $derived(
    platform !== 'ios' || (reading?.accuracy != null && reading.accuracy >= 0 && reading.accuracy <= IOS_MAX_ACCURACY),
  )
  const canFix = $derived(!!reading && !reading.flat && stable && accuracyOk)
  const solution = $derived(solveCompass(refs))
  const ok = $derived(compassSolutionOk(solution, refs.length))

  async function begin() {
    if (!(await requestCompassPermission())) {
      phase = 'unsupported'
      return
    }
    platform = await detectCompass(lat, lon)
    if (!platform) {
      phase = 'unsupported'
      return
    }
    stop = startCompass(lat, lon, (r) => {
      reading = r
      window_.add(r)
      stable = window_.stable
      jitter = window_.jitter
      if (phase === 'calibrate') {
        tracker.add(r)
        progress = tracker.progress
      }
    })
    phase = 'calibrate'
  }

  function fix() {
    if (!reading || !canFix) return
    refs = [...refs, { azimuth: reading.heading, yaw: viewYaw }]
  }

  onDestroy(() => stop?.())

  const markers = $derived<MarkerConfig[]>(
    refs.map((r, i) => ({
      id: `ref-${i}`,
      position: { yaw: (r.yaw * Math.PI) / 180, pitch: 0 },
      html: `<span class="cs-ref">${i + 1}</span>`,
      anchor: 'center center',
    })),
  )
</script>

{#if phase === 'start'}
  <p>
    Para este método tienes que estar <strong>en el sitio donde hiciste la foto</strong>. Vamos a comprobar la brújula
    y después apuntarás con el móvil a varios elementos que se vean en la foto.
  </p>
  <button type="button" class="primary" onclick={begin}>Activar brújula</button>
{:else if phase === 'unsupported'}
  <p class="warn">
    Este navegador no da acceso a la brújula (o se ha denegado el permiso). Prueba con Chrome en Android o Safari en
    iPhone, o usa el método del sol.
  </p>
{:else if phase === 'calibrate'}
  <p>
    <strong>Calibra la brújula:</strong> aléjate de coches y objetos metálicos y mueve el móvil dibujando un
    <strong>ocho</strong> en el aire, girando la muñeca en todas las direcciones.
  </p>
  <div class="figure8" aria-hidden="true">∞</div>
  <progress max="1" value={progress}></progress>
  {#if platform === 'ios'}
    <p class={accuracyOk ? 'ok' : 'warn'}>
      Precisión del iPhone: {reading?.accuracy != null && reading.accuracy >= 0 ? `±${reading.accuracy.toFixed(0)}°` : 'no válida'}
      (hace falta ±{IOS_MAX_ACCURACY}° o mejor)
    </p>
  {/if}
  <button type="button" class="primary" disabled={progress < 1 || !accuracyOk} onclick={() => (phase = 'refs')}>
    {progress < 1 ? `Sigue moviendo… ${(progress * 100).toFixed(0)}%` : 'Hecho'}
  </button>
{:else}
  <p>
    Sujeta el móvil <strong>en vertical, como para hacer una foto</strong>, con la parte de atrás apuntando a algo
    reconocible (la pared, un árbol, una cima). Arrastra la foto hasta que ese mismo elemento quede bajo la cruz y pulsa
    <em>Fijar</em>. Repite con {COMPASS_MIN_REFS} referencias en direcciones bien distintas (≥{COMPASS_MIN_SEPARATION}°).
  </p>
  <div class="pano-box">
    <Pano {src} {panoData} {markers} crosshair onview={(yaw) => (viewYaw = yaw)} />
  </div>
  <div class="live">
    <span>🧭 {reading ? `${reading.heading.toFixed(0)}° ${cardinal(reading.heading)}` : '—'}</span>
    <span class={canFix ? 'ok' : 'warn'}>
      {#if !reading}Sin lectura
      {:else if reading.flat}Pon el móvil en vertical
      {:else if !accuracyOk}Precisión insuficiente
      {:else if !stable}Quieto… (±{Number.isFinite(jitter) ? jitter.toFixed(1) : '?'}°)
      {:else}Estable{/if}
    </span>
  </div>
  <div class="row">
    <button type="button" class="primary" disabled={!canFix} onclick={fix}>Fijar referencia {refs.length + 1}</button>
    {#if refs.length}<button type="button" onclick={() => (refs = [])}>Borrar</button>{/if}
  </div>
  {#if solution && refs.length > 1}
    <p class={ok ? 'ok' : 'warn'}>
      Diferencia entre referencias: ±{solution.residual.toFixed(1)}° (máx. {MAX_RESIDUAL}°) · separación mínima
      {solution.minSeparation.toFixed(0)}°.
      {#if solution.residual > MAX_RESIDUAL}
        La brújula no es coherente: vuelve a calibrar o usa el método del sol.
      {:else if refs.length < COMPASS_MIN_REFS || solution.minSeparation < COMPASS_MIN_SEPARATION}
        Añade referencias en otras direcciones.
      {/if}
    </p>
  {/if}
  {#if solution && solution.residual > MAX_RESIDUAL}
    <button type="button" onclick={() => ((refs = []), (phase = 'calibrate'))}>Volver a calibrar</button>
  {/if}
  {#if ok && solution}
    <button
      type="button"
      class="primary"
      onclick={() => ondone(solution.heading, solution.residual, platform === 'ios' ? (reading?.accuracy ?? null) : null)}
    >
      Usar esta orientación
    </button>
  {/if}
{/if}

<style>
  .figure8 {
    font-size: 5rem;
    text-align: center;
    line-height: 1;
    animation: wobble 2.4s ease-in-out infinite;
  }
  @keyframes wobble {
    0%,
    100% {
      transform: rotate(-20deg) translateX(-10px);
    }
    50% {
      transform: rotate(20deg) translateX(10px);
    }
  }
  progress {
    width: 100%;
  }
  .live {
    display: flex;
    justify-content: space-between;
    margin: 0.5rem 0;
    font-variant-numeric: tabular-nums;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
</style>

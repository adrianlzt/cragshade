<script lang="ts">
  import type { PanoData } from '@photo-sphere-viewer/core'
  import type { MarkerConfig } from '@photo-sphere-viewer/markers-plugin'
  import { headingFromReference } from '../../lib/heading'
  import { cardinalMarkers } from '../../lib/overlays'
  import Pano from '../../lib/Pano.svelte'
  import type { SunPosition } from '../../lib/sun'

  interface Props {
    src: string
    panoData: PanoData | null
    /** Posición del sol calculada para la hora de la foto. */
    sun: SunPosition
    ondone: (heading: number) => void
  }

  let { src, panoData, sun, ondone }: Props = $props()

  const MAX_ALT_ERROR = 5
  const RAD = Math.PI / 180

  let tap = $state<{ yaw: number; pitch: number } | null>(null)

  const heading = $derived(tap ? headingFromReference(sun.azimuth, tap.yaw) : null)
  const altError = $derived(tap ? tap.pitch - sun.altitude : 0)

  const markers = $derived<MarkerConfig[]>(
    tap && heading != null
      ? [
          ...cardinalMarkers(heading),
          {
            id: 'tap',
            position: { yaw: tap.yaw * RAD, pitch: tap.pitch * RAD },
            html: '<div class="cs-target"></div>',
            anchor: 'center center',
          },
          {
            // Dónde debería estar el sol (misma yaw por construcción; la altura sirve de control).
            id: 'sun-expected',
            position: { yaw: tap.yaw * RAD, pitch: sun.altitude * RAD },
            html: '<div class="cs-sun ghost"></div>',
            anchor: 'center center',
          },
        ]
      : [],
  )
</script>

<p>
  Busca el <strong>sol</strong> en la foto y tócalo justo en el centro. Con la hora y el lugar de la foto calculamos
  dónde está el norte, sin depender de la brújula.
</p>
<div class="pano-box">
  <Pano {src} {panoData} {markers} onpick={(yaw, pitch) => (tap = { yaw, pitch })} />
</div>
{#if tap && heading != null}
  {#if Math.abs(altError) > MAX_ALT_ERROR}
    <p class="warn">
      El punto tocado está {Math.abs(altError).toFixed(0)}° {altError > 0 ? 'más alto' : 'más bajo'} de donde debería estar
      el sol a esa hora (círculo punteado). Revisa la hora de la foto o vuelve a tocar el sol.
    </p>
  {:else}
    <p class="ok">La altura coincide (±{Math.abs(altError).toFixed(1)}°). El centro de la foto mira a {heading.toFixed(0)}°.</p>
  {/if}
  <button type="button" class="primary" disabled={Math.abs(altError) > MAX_ALT_ERROR} onclick={() => ondone(heading)}>
    Usar esta orientación
  </button>
{/if}

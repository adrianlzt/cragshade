<script lang="ts">
  import { onMount } from 'svelte'
  import { EquirectangularAdapter, Viewer, type PanoData } from '@photo-sphere-viewer/core'
  import { MarkersPlugin, type MarkerConfig } from '@photo-sphere-viewer/markers-plugin'
  import '@photo-sphere-viewer/core/index.css'
  import '@photo-sphere-viewer/markers-plugin/index.css'

  const DEG = 180 / Math.PI

  interface Props {
    src: string
    panoData?: PanoData | null
    markers?: MarkerConfig[]
    /** Cruz en el centro, para apuntar a una referencia. */
    crosshair?: boolean
    /** yaw/pitch en grados del punto tocado. */
    onpick?: (yaw: number, pitch: number) => void
    /** yaw/pitch en grados del centro de la vista. */
    onview?: (yaw: number, pitch: number) => void
    viewer?: Viewer
  }

  let { src, panoData = null, markers = [], crosshair = false, onpick, onview, viewer = $bindable() }: Props = $props()

  let el: HTMLDivElement
  let plugin: MarkersPlugin | undefined
  let ready = $state(false)

  onMount(() => {
    const v = new Viewer({
      container: el,
      panorama: src,
      // Ignoramos el XMP: la orientación la calculamos nosotros (PoseHeading del móvil no es fiable).
      adapter: EquirectangularAdapter.withConfig({ useXmpData: false }),
      panoData: panoData ?? undefined,
      navbar: ['zoom', 'fullscreen'],
      defaultZoomLvl: 20,
      loadingTxt: 'Cargando…',
      lang: { zoom: 'Zoom', zoomOut: 'Alejar', zoomIn: 'Acercar', fullscreen: 'Pantalla completa' },
      plugins: [MarkersPlugin],
    })
    plugin = v.getPlugin(MarkersPlugin) as MarkersPlugin
    v.addEventListener('ready', () => (ready = true), { once: true })
    v.addEventListener('click', ({ data }) => {
      if (data.rightclick) return
      onpick?.(data.yaw * DEG, data.pitch * DEG)
    })
    v.addEventListener('position-updated', ({ position }) => onview?.(position.yaw * DEG, position.pitch * DEG))
    viewer = v
    // Para las pruebas end-to-end (scripts/e2e.py).
    if (import.meta.env.DEV) (window as unknown as { __psv: Viewer }).__psv = v
    return () => {
      v.destroy()
      viewer = undefined
    }
  })

  $effect(() => {
    const m = markers
    if (ready && plugin) plugin.setMarkers(m)
  })
</script>

<div class="pano">
  <div class="viewer" bind:this={el}></div>
  {#if crosshair}
    <div class="crosshair" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .pano {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .viewer {
    position: absolute;
    inset: 0;
  }
  .crosshair {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 44px;
    height: 44px;
    margin: -22px 0 0 -22px;
    pointer-events: none;
    z-index: 100;
    background:
      linear-gradient(#fff, #fff) center / 2px 100% no-repeat,
      linear-gradient(#fff, #fff) center / 100% 2px no-repeat;
    filter: drop-shadow(0 0 2px #000);
    border-radius: 50%;
  }
</style>

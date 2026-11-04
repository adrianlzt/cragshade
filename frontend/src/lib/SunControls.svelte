<script lang="ts">
  import { dayFromOrdinal, dayOfYear, formatDay, formatMinutes, formatTime } from './time'
  import { sunTimes } from './sun'

  interface Props {
    day: string
    minutes: number
    tz: string
    lat: number
    lon: number
    onnow?: () => void
    onlook?: () => void
  }

  let { day = $bindable(), minutes = $bindable(), tz, lat, lon, onnow, onlook }: Props = $props()

  const year = $derived(Number(day.slice(0, 4)))
  const times = $derived(sunTimes(day, tz, lat, lon))

  const shortcuts: [string, string][] = [
    ['Inv.', '12-21'],
    ['Prim.', '03-20'],
    ['Ver.', '06-21'],
    ['Oto.', '09-22'],
  ]
</script>

<div class="controls">
  <label>
    <span class="row">
      <span>📅 {formatDay(day)}</span>
      <span class="chips">
        {#each shortcuts as [label, md]}
          <button type="button" class="chip" onclick={() => (day = `${year}-${md}`)}>{label}</button>
        {/each}
      </span>
    </span>
    <input
      type="range"
      min="1"
      max="365"
      value={dayOfYear(day)}
      oninput={(e) => (day = dayFromOrdinal(year, Number(e.currentTarget.value)))}
    />
  </label>
  <label>
    <span class="row">
      <span>🕒 <strong>{formatMinutes(minutes)}</strong></span>
      <span class="muted">☀ {formatTime(times.sunrise, tz)} – {formatTime(times.sunset, tz)}</span>
    </span>
    <input type="range" min="0" max="1430" step="10" bind:value={minutes} />
  </label>
  <div class="row">
    {#if onnow}<button type="button" onclick={onnow}>Ahora</button>{/if}
    {#if onlook}<button type="button" onclick={onlook}>Mirar al sol</button>{/if}
  </div>
</div>

<style>
  .controls {
    display: grid;
    gap: 0.5rem;
  }
  label {
    display: grid;
    gap: 0.25rem;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .chips {
    display: flex;
    gap: 0.25rem;
  }
  .chip {
    padding: 0.15rem 0.45rem;
    font-size: 0.75rem;
  }
  .muted {
    opacity: 0.75;
    font-size: 0.85rem;
  }
  input[type='range'] {
    width: 100%;
  }
</style>

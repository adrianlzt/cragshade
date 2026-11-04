<script lang="ts">
  import Router from 'svelte-spa-router'
  import MapView from './routes/MapView.svelte'
  import PanoView from './routes/PanoView.svelte'
  import Upload from './routes/upload/Upload.svelte'

  const routes = {
    '/': MapView,
    '/photo/:id': PanoView,
    '/upload': Upload,
    '*': MapView,
  }
</script>

<Router {routes} />

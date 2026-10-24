import { defineConfig } from 'vite';
import path from 'node:path';
import { scanModels, root } from './scripts/scan-models.mjs';

/**
 * Models are a drop-in folder, so the manifest has to keep up with it: rebuild
 * it at server start and every time a .glb/.gltf lands in (or leaves) public/models.
 */
function modelManifest() {
  const dir = path.join(root, 'public', 'models');
  return {
    name: 'model-manifest',
    buildStart() {
      scanModels({ quiet: true });
    },
    configureServer(server) {
      scanModels({ quiet: true });
      server.watcher.add(dir);
      const refresh = (file) => {
        if (!/\.(glb|gltf)$/i.test(file)) return;
        const { models } = scanModels({ quiet: true });
        const name = path.basename(file);
        server.config.logger.info(`[models] ${name} changed — ${Object.keys(models).length} model(s) in the manifest, reloading`);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
      server.watcher.on('change', refresh);
    },
  };
}

export default defineConfig({
  plugins: [modelManifest()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // the sandbox preview is served from a proxied host; allow any origin host
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          post: [
            'three/examples/jsm/postprocessing/EffectComposer.js',
            'three/examples/jsm/postprocessing/RenderPass.js',
            'three/examples/jsm/postprocessing/UnrealBloomPass.js',
            'three/examples/jsm/postprocessing/OutputPass.js',
          ],
        },
      },
    },
  },
});

// index.ts
//
// Operator entrypoint.
//
// This file:
// 1. Loads the Kubernetes configuration (in-cluster when running in a pod,
//    or from ~/.kube/config when running locally for development)
// 2. Creates a "List+Watch" Informer for RafikiInstance objects
// 3. Calls reconcile() on ADD and UPDATE events
// 4. Calls cleanup() on DELETE events
//
// HOW AN INFORMER WORKS:
//   An Informer is a long-running watch connection to the Kubernetes API.
//   Instead of polling "give me all RafikiInstances every 5 seconds", it
//   opens a persistent HTTP stream and receives push notifications whenever
//   any RafikiInstance changes. It also re-lists periodically to catch any
//   missed events (e.g. if the connection dropped).

import * as http from 'http';
import * as k8s from '@kubernetes/client-node';
import { RafikiInstance, RafikiInstanceSpec } from './types.js';
import { reconcile, cleanup } from './controller.js';

// ---------------------------------------------------------------------------
// Health server
//
// deploy/operator.yaml defines a livenessProbe against GET /healthz:8080 —
// Kubernetes restarts the pod if this stops responding. A liveness probe
// only needs to prove the process is alive and its event loop isn't
// blocked, so this always returns 200; it is not a readiness/dependency
// check (there's no readinessProbe here, so no need to model that).
// ---------------------------------------------------------------------------
function startHealthServer(port: number): void {
  http
    .createServer((req, res) => {
      if (req.url === '/healthz') {
        res.writeHead(200);
        res.end('ok');
        return;
      }
      res.writeHead(404);
      res.end();
    })
    .listen(port, () => {
      console.log(`Health server listening on :${port}/healthz`);
    });
}

let isReconciling = false;
let isDeleting = false;

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
let backoffMs = BACKOFF_BASE_MS;

async function reconcileWrapper(
  kc: k8s.KubeConfig,
  name: string,
  namespace: string,
  spec: RafikiInstanceSpec,
  generation: number
): Promise<void> {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    isReconciling = true;

    reconcile(kc, name, namespace, spec, generation).then(()=>{
      isReconciling = false;
      return resolve();
    }).catch((err) => {
      // Add ±20% jitter to avoid thundering-herd if multiple operators restart
      // at the same time (e.g. after a cluster-wide network partition).
      const jitter = 1 + (Math.random() * 0.4 - 0.2);
      const delay = Math.min(backoffMs * jitter, BACKOFF_MAX_MS);

      console.error('[Informer] Error:', err.message);
      console.log(
        `[Informer] Restarting in ${Math.round(delay)}ms (backoff: ${backoffMs}ms)...`
      );

      if(isDeleting)
        return resolve();

      setTimeout(async () => {
        backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
        return reconcileWrapper(kc, name, namespace, spec, generation);
      }, delay);
    });
  });
}

async function main() {
  startHealthServer(8080);

  // -------------------------------------------------------------------------
  // Step 1: Load kubeconfig
  //
  // KubeConfig.loadFromDefault() tries in order:
  //   1. KUBECONFIG environment variable
  //   2. ~/.kube/config (standard local development path)
  //   3. In-cluster config (projected ServiceAccount token) — used when the
  //      operator itself runs as a Pod inside Kubernetes
  // -------------------------------------------------------------------------
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  console.log('Rafiki-v2 Kubernetes Operator starting...');
  console.log(
    `Connected to cluster: ${kc.getCurrentCluster()?.name ?? 'unknown'}`
  );

  // -------------------------------------------------------------------------
  // Step 2: Set up the custom API client for RafikiInstance
  //
  // RafikiInstance is not a built-in Kubernetes type, so we use the
  // CustomObjectsApi which works with any CRD.
  // -------------------------------------------------------------------------
  const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);

  // The list function tells the informer HOW to enumerate existing
  // RafikiInstance objects and HOW to watch for new ones.
  const listFn = () =>
    customObjectsApi.listClusterCustomObject({
      group: 'rafiki.interledger.org',
      version: 'v1alpha1',
      plural: 'rafikiinstances'
    });

  // -------------------------------------------------------------------------
  // Step 3: Create and start the Informer
  //
  // makeInformer() creates a controller that:
  //   - First does a LIST to get all existing RafikiInstance objects
  //   - Then opens a WATCH for all future changes
  //   - Fires event handlers (onAdded, onUpdated, onDeleted) as changes occur
  // -------------------------------------------------------------------------
  const informer = k8s.makeInformer<RafikiInstance>(
    kc,
    '/apis/rafiki.interledger.org/v1alpha1/rafikiinstances',
    listFn as k8s.ListPromise<RafikiInstance>
  );

  // ADDED: Fired when a new RafikiInstance is created
  informer.on('add', async (obj: RafikiInstance) => {
    if (isReconciling)
      return;

    const { name, namespace, generation } = obj.metadata;
    console.log(`[Informer] ADD event: ${namespace}/${name}`);
    await reconcileWrapper(kc, name, namespace, obj.spec, generation ?? 0);
  });

  // UPDATED: Fired when an existing RafikiInstance is modified (e.g. spec
  // changes) OR when its status is patched. Status patches (including the
  // ones this operator writes) don't bump metadata.generation, so skip
  // reconciling when we've already observed this generation — otherwise
  // reconcile()'s own status update triggers another UPDATE event forever.
  informer.on('update', async (obj: RafikiInstance) => {
    if (isReconciling)
      return;

    const { name, namespace, generation } = obj.metadata;
    if (generation !== undefined && generation === obj.status?.observedGeneration) {
      return;
    }
    console.log(`[Informer] UPDATE event: ${namespace}/${name}`);
    await reconcileWrapper(kc, name, namespace, obj.spec, generation ?? 0);
  });

  // DELETED: Fired when a RafikiInstance is deleted. Cleans up child resources.
  informer.on('delete', async (obj: RafikiInstance) => {
    isDeleting = true;
    const { name, namespace } = obj.metadata;
    console.log(`[Informer] DELETE event: ${namespace}/${name}`);
    await cleanup(kc, namespace).catch(console.error);
    isDeleting = false;
  });

  // ERROR: Lost connection or list error. Retry after a delay.
  informer.on('error', (err: Error) => {
    console.error('[Informer] Error:', err.message);
    console.log('[Informer] Restarting in 5s...');
    setTimeout(() => {
      informer.start().catch(console.error);
    }, 5000);
  });

  // -------------------------------------------------------------------------
  // Step 4: Start the informer (begins the LIST + WATCH)
  // -------------------------------------------------------------------------
  await informer.start();
  console.log('Operator is watching for RafikiInstance resources...');

  // Keep the process alive. The informer runs asynchronously in the background.
  // Node.js would exit once all synchronous code finishes, so we prevent that.
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    informer.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    informer.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

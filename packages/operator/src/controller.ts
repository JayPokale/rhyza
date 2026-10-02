import http from 'http';
import { IncomingMessage, Server, ServerResponse } from 'node:http';
import * as k8s from '@kubernetes/client-node';
import { RafikiInstance, RafikiInstanceSpec } from './types.js';
import { KubernetesHelpers } from './helpers';
import {
  ObjectCoreV1Api,
  ObjectCustomObjectsApi
} from '@kubernetes/client-node/dist/gen/types/ObjectParamAPI';
import {
  kafkaService,
  kafkaStatefulSet,
  mongodbService,
  mongodbStatefulSet,
  redisService,
  redisStatefulSet
} from './manifests/infrastructure';
import { kafkaInitJob } from './manifests/kafkaInit';
import { allAppServices } from './manifests/appServices';
import {
  createExternalGateway,
  createExternalGatewayRoutes
} from './manifests/gateway-and-routes';
import {
  grafanaDeployment,
  grafanaService,
  otelCollectorDeployment,
  otelCollectorService,
  prometheusDeployment,
  prometheusService,
  redpandaConsoleDeployment,
  redpandaConsoleService,
  tempoDeployment,
  tempoService
} from './manifests/observability';
import { ApiException } from '@kubernetes/client-node';

// HOW AN INFORMER WORKS:
//   An Informer is a long-running watch connection to the Kubernetes API.
//   Instead of polling "give me all RafikiInstances every 5 seconds", it
//   opens a persistent HTTP stream and receives push notifications whenever
//   any RafikiInstance changes. It also re-lists periodically to catch any
//   missed events (e.g. if the connection dropped).

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;

const LOG_PREFIX = 'Rafiki-v2 Kubernetes Operator -';

export interface IControllerConfig {
  apiPort: number;
  systemNamespace: string;
  gatewayClassName: string;
  gatewayName: string;
  group: string;
  version: string;
  plural: string;
}

export class RafikiOperatorController {
  private _config: IControllerConfig;
  private _kubeConfig: k8s.KubeConfig;
  private _state: 'idle' | 'reconciling' | 'deleting';
  private _server?: Server<typeof IncomingMessage, typeof ServerResponse>;
  private _informer: k8s.Informer<RafikiInstance> | undefined;
  private _backoffMs = BACKOFF_BASE_MS;

  constructor(kubeConfig: k8s.KubeConfig, config: IControllerConfig) {
    this._kubeConfig = kubeConfig;
    this._config = config;
    this._state = 'idle';
  }

  async init(): Promise<void> {
    console.log(`${LOG_PREFIX} starting...`);
    console.log(
      `Connected to cluster: ${this._kubeConfig.getCurrentCluster()?.name ?? 'unknown'}`
    );

    // -------------------------------------------------------------------------
    // Step 2: Set up the custom API client for RafikiInstance
    //
    // RafikiInstance is not a built-in Kubernetes type, so we use the
    // CustomObjectsApi which works with any CRD.
    // ------------------------------------------------------------------------->

    // The list function tells the informer HOW to enumerate existing
    // RafikiInstance objects and HOW to watch for new ones.
    const listFn = () =>
      KubernetesHelpers.getInstance().customObjectsApi.listClusterCustomObject({
        group: this._config.group,
        version: this._config.version,
        plural: this._config.plural
      });

    console.log(`${LOG_PREFIX} Setting up the helpers...`);
    await KubernetesHelpers.Setup(
      this._kubeConfig,
      this._config.systemNamespace
    );

    try {
      const resp = await listFn();
      console.log(resp);
      console.log(`${LOG_PREFIX} CRDs found`);
      if (resp.items.length > 0) {
        console.log(
          `${LOG_PREFIX} ${resp.items.length} instance(s) installed.`
        );
      } else {
        console.log(`${LOG_PREFIX} no installed instance(s) found.`);
      }

      // Ensure system namespace and RBAC
      await KubernetesHelpers.getInstance().ensureNamespace(
        this._config.systemNamespace
      );
      await KubernetesHelpers.getInstance().ensureJobReaderRbac(
        this._config.systemNamespace
      );
    } catch (err) {
      // Usually this means the CRD is not installed, must
      // install the files in the deploy directory
      if (err instanceof ApiException && err.code === 404) {
        console.log(
          `${LOG_PREFIX} Error starting the operator, are the 'deploy' files installed onto the cluster?`
        );
      } else {
        console.log(
          `${LOG_PREFIX} Unknown Error starting the operator - ${err}`
        );
      }

      throw err;
    }


    // -------------------------------------------------------------------------
    // Step 3: Create and start the Informer
    //
    // makeInformer() creates a controller that:
    //   - First does a LIST to get all existing RafikiInstance objects
    //   - Then opens a WATCH for all future changes
    //   - Fires event handlers (onAdded, onUpdated, onDeleted) as changes occur
    // -------------------------------------------------------------------------
    this._informer = k8s.makeInformer<RafikiInstance>(
      this._kubeConfig,
      `/apis/${this._config.group}/${this._config.version}/${this._config.plural}`,
      listFn as k8s.ListPromise<RafikiInstance>
    );

    // ADDED: Fired when a new RafikiInstance is created
    this._informer.on('add', async (obj: RafikiInstance) => {
      if (this._state !== 'idle') return;

      // TODO set status

      const { name, generation } = obj.metadata;
      // TODO check if name needs parsing to be a namespace
      const instanceNamespace = name;
      console.log(`[Informer] ADD event: ${instanceNamespace}/${name}`);
      await this._reconcileWrapper(
        name,
        instanceNamespace,
        obj.spec,
        generation ?? 0
      );
    });

    // UPDATED: Fired when an existing RafikiInstance is modified (e.g. spec
    // changes) OR when its status is patched. Status patches (including the
    // ones this operator writes) don't bump metadata.generation, so skip
    // reconciling when we've already observed this generation — otherwise
    // reconcile()'s own status update triggers another UPDATE event forever.
    this._informer.on('update', async (obj: RafikiInstance) => {
      if (this._state !== 'idle') return;

      const { name, generation } = obj.metadata;
      // TODO check if name needs parsing to be a namespace
      const instanceNamespace = name;
      if (
        generation !== undefined &&
        generation === obj.status?.observedGeneration
      ) {
        return;
      }
      console.log(`[Informer] UPDATE event: ${instanceNamespace}/${name}`);
      await this._reconcileWrapper(
        name,
        instanceNamespace,
        obj.spec,
        generation ?? 0
      );
    });

    // DELETED: Fired when a RafikiInstance is deleted. Cleans up child resources.
    this._informer.on('delete', async (obj: RafikiInstance) => {
      this._state = 'deleting';

      const { name } = obj.metadata;
      // TODO check if name needs parsing to be a namespace
      const instanceNamespace = name;

      console.log(`[Informer] DELETE event: ${instanceNamespace}/${name}`);
      await this._cleanup(instanceNamespace).catch(console.error);

      this._state = 'idle';
    });

    // ERROR: Lost connection or list error. Retry after a delay.
    this._informer.on('error', (err: Error) => {
      console.error('[Informer] Error:', err.message);
      console.log('[Informer] Restarting in 5s...');
      setTimeout(() => {
        this._informer?.start().catch(console.error);
      }, 5000);
    });

    // -------------------------------------------------------------------------
    // Step 4: Start the informer (begins the LIST + WATCH)
    // -------------------------------------------------------------------------
    await this._informer.start();
    console.log(`${LOG_PREFIX} is watching for RafikiInstance resources.`);

    await this._startHttpServer();
    console.log(`${LOG_PREFIX} api server started.`);
  }

  async stop(): Promise<void> {
    await this._informer?.stop();
  }

  private async _startHttpServer(): Promise<void> {
    this._server = http
      .createServer((req, res) => {
        if (req.url === '/healthz') {
          res.writeHead(200);
          res.end('ok');
          return;
        }
        res.writeHead(404);
        res.end();
      })
      .listen(this._config.apiPort, () => {
        console.log(
          `Health server listening on :${this._config.apiPort}/healthz`
        );
      });
  }

  private _reconcileWrapper(
    name: string,
    instanceNamespace: string,
    spec: RafikiInstanceSpec,
    generation: number
  ): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve) => {
      if (this._state === 'deleting') {
        console.error('[Informer] is deleting, cannot reconcile now');
        return resolve();
      }

      this._state = 'reconciling';

      try {
        await this._reconcile(name, instanceNamespace, spec, generation);
        this._state = 'idle';
        return resolve();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        // Add ±20% jitter to avoid thundering-herd if multiple operators restart
        // at the same time (e.g. after a cluster-wide network partition).
        const jitter = 1 + (Math.random() * 0.4 - 0.2);
        const delay = Math.min(this._backoffMs * jitter, BACKOFF_MAX_MS);

        console.error('[Informer] Error:', err.message);
        console.log(
          `[Informer] Restarting in ${Math.round(delay)}ms (backoff: ${this._backoffMs}ms)...`
        );

        setTimeout(async () => {
          this._backoffMs = Math.min(this._backoffMs * 2, BACKOFF_MAX_MS);
          return this._reconcileWrapper(
            name,
            instanceNamespace,
            spec,
            generation
          );
        }, delay);
      }
    });
  }

  /**
   * Reconciles a RafikiInstance resource.
   *
   * Steps:
   * 1. Ensure the target namespace exists
   * 2. Verify the integrator-supplied MongoDB password secret exists
   * 3. Apply infrastructure StatefulSets + Services (MongoDB, Redis, Kafka)
   * 4. Apply the Kafka topic init Job
   * 5. Apply all application service Deployments + Services
   * 6. Apply the observability stack (if enabled)
   * 7. Update the CRD status to report success or failure
   *
   * @param name    - Name of the RafikiInstance custom resource
   * @param instanceNamespace    - Namespace of the RafikiInstance resources
   * @param spec    - The spec from the custom resource (user's intent)
   * @param generation - metadata.generation being reconciled, recorded onto
   *                      status.observedGeneration so status-only updates
   *                      (which don't bump generation) can be skipped
   */
  private async _reconcile(
    name: string,
    instanceNamespace: string,
    spec: RafikiInstanceSpec,
    generation: number
  ): Promise<void> {
    console.log(
      `\n--- Reconciling RafikiInstance "${name}" in namespace "${instanceNamespace}"`
    );

    const coreApi: ObjectCoreV1Api = KubernetesHelpers.getInstance().coreApi;
    const customApi: ObjectCustomObjectsApi =
      KubernetesHelpers.getInstance().customObjectsApi;
    //const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);

    try {
      // -------------------------------------------------------------------------
      // Step 1: Ensure namespace and RBAC
      // -------------------------------------------------------------------------
      await KubernetesHelpers.getInstance().ensureNamespace(instanceNamespace);
      await KubernetesHelpers.getInstance().ensureJobReaderRbac(
        instanceNamespace
      );

      // TODO: ensure pre-requisites
      // Gateway API crds->

      // -------------------------------------------------------------------------
      // Step 2: MongoDB password secret
      //
      // The integrator owns this Secret — created and rotated outside the
      // operator (see spec.mongoPasswordSecretRef in types.ts). The operator
      // never generates or stores the password itself; it only verifies the
      // Secret exists here, so a typo fails reconciliation immediately
      // instead of every app pod crash-looping on a missing secretKeyRef.
      // -------------------------------------------------------------------------
      const mongoSecretRef = spec.mongoPasswordSecretRef;
      await coreApi
        .readNamespacedSecret({
          name: mongoSecretRef.name,
          namespace: instanceNamespace
        })
        .catch(() => {
          throw new Error(
            `mongoPasswordSecretRef points to Secret "${mongoSecretRef.name}" in namespace "${instanceNamespace}", but it does not exist`
          );
        });

      // -------------------------------------------------------------------------
      // Step 3: Infrastructure StatefulSets + Services
      // -------------------------------------------------------------------------
      console.log('\n[Phase 1] Applying infrastructure...');

      await KubernetesHelpers.getInstance().applyStatefulSet(
        mongodbStatefulSet(instanceNamespace, spec)
      );
      await KubernetesHelpers.getInstance().applyService(
        mongodbService(instanceNamespace)
      );

      await KubernetesHelpers.getInstance().applyStatefulSet(
        redisStatefulSet(instanceNamespace)
      );
      await KubernetesHelpers.getInstance().applyService(
        redisService(instanceNamespace)
      );

      await KubernetesHelpers.getInstance().applyStatefulSet(
        kafkaStatefulSet(instanceNamespace)
      );
      await KubernetesHelpers.getInstance().applyService(
        kafkaService(instanceNamespace)
      );

      // -------------------------------------------------------------------------
      // Step 4: Kafka init Job
      //
      // Application pods use an initContainer that waits for this Job to succeed
      // before starting. This replicates docker-compose's:
      //   depends_on:
      //     init-kafka:
      //       condition: service_completed_successfully
      // -------------------------------------------------------------------------
      console.log('\n[Phase 2] Applying Kafka init job...');

      // TODO: add generation check
      await KubernetesHelpers.getInstance().applyJob(
        kafkaInitJob(instanceNamespace),
        true
      );

      // -------------------------------------------------------------------------
      // Step 5: Application services
      // -------------------------------------------------------------------------
      console.log('\n[Phase 3] Applying application services...');

      const appManifests = allAppServices(instanceNamespace, spec);
      for (const { deployment, service } of appManifests) {
        await KubernetesHelpers.getInstance().applyDeployment(deployment);
        if (service) {
          await KubernetesHelpers.getInstance().applyService(service);
        }
      }

      // -------------------------------------------------------------------------
      // Step 5b: Ingress for open-payments-resource-service (the only service
      // exposed outside the cluster). Only created when spec.host is set.
      // -------------------------------------------------------------------------
      // const ingress = openPaymentsIngress(this._config.namespace, spec);
      // if (ingress) {
      //   console.log('\n[Phase 3b] Applying Ingress...');
      //   await applyIngress(networkingApi, this._config.namespace, ingress);
      // }

      await KubernetesHelpers.getInstance().updateStatus(name, {
        phase: 'Pending',
        message: 'Creating External Gateway and Routes...',
        lastReconciled: new Date().toISOString(),
        observedGeneration: generation,
        instanceNamespace: instanceNamespace
      });

      // -------------------------------------------------------------------------
      // Step 5b: HttpRouts for K8s Gateway for open-payments-resource-service
      // and admin-api-service (the only services exposed outside the cluster).
      // Only created when spec.host is set.
      // -------------------------------------------------------------------------
      console.log('\n[Phase 5b] Applying External Gateway...');
      await createExternalGateway(
        instanceNamespace,
        this._config.gatewayClassName,
        this._config.gatewayName
      );

      console.log('\n[Phase 5c] Applying HTTP Routes...');
      await createExternalGatewayRoutes(
        instanceNamespace,
        spec,
        this._config.gatewayName
      );

      // -------------------------------------------------------------------------
      // Step 6: Observability stack (optional)
      // -------------------------------------------------------------------------
      if (spec.observability !== false) {
        console.log('\n[Phase 4] Applying observability stack...');

        await KubernetesHelpers.getInstance().applyDeployment(
          otelCollectorDeployment(instanceNamespace)
        );
        await KubernetesHelpers.getInstance().applyService(
          otelCollectorService(instanceNamespace)
        );

        await KubernetesHelpers.getInstance().applyDeployment(
          prometheusDeployment(instanceNamespace)
        );
        await KubernetesHelpers.getInstance().applyService(
          prometheusService(instanceNamespace)
        );

        await KubernetesHelpers.getInstance().applyDeployment(
          tempoDeployment(instanceNamespace)
        );
        await KubernetesHelpers.getInstance().applyService(
          tempoService(instanceNamespace)
        );

        await KubernetesHelpers.getInstance().applyDeployment(
          grafanaDeployment(instanceNamespace)
        );
        await KubernetesHelpers.getInstance().applyService(
          grafanaService(instanceNamespace)
        );

        await KubernetesHelpers.getInstance().applyDeployment(
          redpandaConsoleDeployment(instanceNamespace)
        );
        await KubernetesHelpers.getInstance().applyService(
          redpandaConsoleService(instanceNamespace)
        );
      }

      // -------------------------------------------------------------------------
      // Step 7: Update status — tell Kubernetes the reconcile succeeded
      // -------------------------------------------------------------------------
      await KubernetesHelpers.getInstance().updateStatus(name, {
        phase: 'Running',
        message: 'All resources applied successfully',
        lastReconciled: new Date().toISOString(),
        observedGeneration: generation,
        instanceNamespace: instanceNamespace
      });

      console.log('\n--- Reconciliation complete ---\n');
    } catch (err) {
      console.error('[Reconcile] Error during reconciliation:', err);

      // Report the error back onto the CRD so users can see it with:
      //   kubectl get rafikiinstances
      await KubernetesHelpers.getInstance().updateStatus(name, {
        phase: 'Error',
        message: String(err),
        lastReconciled: new Date().toISOString(),
        instanceNamespace: instanceNamespace
      });

      throw err;
    }
  }

  /**
   * Cleans up all resources owned by a RafikiInstance when it is deleted.
   *
   * In production operators you would use OwnerReferences so Kubernetes
   * cascades deletes automatically. For simplicity, we delete the namespace
   * which removes all resources inside it.
   *
   * WARNING: Only do this if the namespace is dedicated to Rafiki.
   */
  private async _cleanup(instanceNamespace: string): Promise<void> {
    console.log(`[Cleanup] Deleting namespace ${instanceNamespace}...`);
    const coreApi = this._kubeConfig.makeApiClient(k8s.CoreV1Api);
    try {
      await coreApi.deleteNamespace({ name: instanceNamespace });
      console.log(`[Cleanup] Namespace ${instanceNamespace} deleted`);
    } catch (err) {
      console.error('[Cleanup] Error:', err);
    }
  }
}

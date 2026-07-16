// controller.ts
//
// The RECONCILE LOOP — the core of the operator.
//
// Reconcile means: "look at what the user declared they want (the CRD spec),
// look at what currently exists in Kubernetes, and make them match."
//
// This function is called by the informer (index.ts) whenever a RafikiInstance
// resource is created, modified, or needs re-syncing. It is idempotent:
// running it multiple times has the same effect as running it once.

import * as k8s from '@kubernetes/client-node';
import { RafikiInstanceSpec } from './types.js';
import {
  mongodbStatefulSet,
  mongodbService,
  redisStatefulSet,
  redisService,
  kafkaStatefulSet,
  kafkaService
} from './manifests/infrastructure.js';
import { kafkaInitJob } from './manifests/kafkaInit.js';
import { allAppServices } from './manifests/appServices.js';
// import { openPaymentsIngress } from './manifests/ingress.js';
import {
  otelCollectorDeployment,
  otelCollectorService,
  prometheusDeployment,
  prometheusService,
  tempoDeployment,
  tempoService,
  grafanaDeployment,
  grafanaService,
  redpandaConsoleDeployment,
  redpandaConsoleService
} from './manifests/observability.js';
import {
  KubernetesHelpers,
} from './helpers';
import {
  createExternalRoutesGateway,
  createRafikiExternalGateway
} from './manifests/gateway-and-routes';
import {
  ObjectCoreV1Api,
  ObjectCustomObjectsApi
} from '@kubernetes/client-node/dist/gen/types/ObjectParamAPI';

// ---------------------------------------------------------------------------
// Main reconcile function
// ---------------------------------------------------------------------------



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
 * @param kc      - Loaded kubeconfig (used to build API clients)
 * @param name    - Name of the RafikiInstance custom resource
 * @param namespace - Namespace where all resources should be created
 * @param spec    - The spec from the custom resource (user's intent)
 * @param generation - metadata.generation being reconciled, recorded onto
 *                      status.observedGeneration so status-only updates
 *                      (which don't bump generation) can be skipped
 */
export async function reconcile(
  kc: k8s.KubeConfig,
  name: string,
  namespace: string,
  spec: RafikiInstanceSpec,
  generation: number
): Promise<void> {
  console.log(
    `\n--- Reconciling RafikiInstance "${name}" in namespace "${namespace}" ---`
  );

  const coreApi: ObjectCoreV1Api = KubernetesHelpers.getInstance().coreApi;
  const customApi: ObjectCustomObjectsApi = KubernetesHelpers.getInstance().customObjectsApi;
  //const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);

  try {
    // -------------------------------------------------------------------------
    // Step 1: Ensure namespace and RBAC
    // -------------------------------------------------------------------------
    await KubernetesHelpers.getInstance().ensureNamespace();
    await KubernetesHelpers.getInstance().ensureJobReaderRbac();

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
      .readNamespacedSecret({ name: mongoSecretRef.name, namespace })
      .catch(() => {
        throw new Error(
          `mongoPasswordSecretRef points to Secret "${mongoSecretRef.name}" in namespace "${namespace}", but it does not exist`
        );
      });

    // -------------------------------------------------------------------------
    // Step 3: Infrastructure StatefulSets + Services
    // -------------------------------------------------------------------------
    console.log('\n[Phase 1] Applying infrastructure...');

    await KubernetesHelpers.getInstance().applyStatefulSet(
      mongodbStatefulSet(namespace, spec)
    );
    await KubernetesHelpers.getInstance().applyService(
      mongodbService(namespace)
    );

    await KubernetesHelpers.getInstance().applyStatefulSet(
      redisStatefulSet(namespace)
    );
    await KubernetesHelpers.getInstance().applyService(
      redisService(namespace)
    );

    await KubernetesHelpers.getInstance().applyStatefulSet(
      kafkaStatefulSet(namespace)
    );
    await KubernetesHelpers.getInstance().applyService(
      kafkaService(namespace)
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
    await KubernetesHelpers.getInstance().applyJob(
      kafkaInitJob(namespace)
    );

    // -------------------------------------------------------------------------
    // Step 5: Application services
    // -------------------------------------------------------------------------
    console.log('\n[Phase 3] Applying application services...');

    const appManifests = allAppServices(namespace, spec);
    for (const { deployment, service } of appManifests) {
      await KubernetesHelpers.getInstance().applyDeployment(
        deployment
      );
      if (service) {
        await KubernetesHelpers.getInstance().applyService(
          service
        );
      }
    }

    // -------------------------------------------------------------------------
    // Step 5b: Ingress for open-payments-resource-service (the only service
    // exposed outside the cluster). Only created when spec.host is set.
    // -------------------------------------------------------------------------
    // const ingress = openPaymentsIngress(namespace, spec);
    // if (ingress) {
    //   console.log('\n[Phase 3b] Applying Ingress...');
    //   await applyIngress(networkingApi, namespace, ingress);
    // }

    // -------------------------------------------------------------------------
    // Step 5b: HttpRouts for K8s Gateway for open-payments-resource-service
    // and admin-api-service (the only services exposed outside the cluster).
    // Only created when spec.host is set.
    // -------------------------------------------------------------------------
    console.log('\n[Phase 5b] Applying External Gateway...');
    await createRafikiExternalGateway(kc, customApi, namespace, spec);

    console.log('\n[Phase 5c] Applying HTTP Routes...');
    await createExternalRoutesGateway(kc, customApi, namespace, spec);


    // -------------------------------------------------------------------------
    // Step 6: Observability stack (optional)
    // -------------------------------------------------------------------------
    if (spec.observability !== false) {
      console.log('\n[Phase 4] Applying observability stack...');

      await KubernetesHelpers.getInstance().applyDeployment(
        otelCollectorDeployment(namespace)
      );
      await KubernetesHelpers.getInstance().applyService(
        otelCollectorService(namespace)
      );

      await KubernetesHelpers.getInstance().applyDeployment(
        prometheusDeployment(namespace)
      );
      await KubernetesHelpers.getInstance().applyService(prometheusService(namespace));

      await KubernetesHelpers.getInstance().applyDeployment(tempoDeployment(namespace));
      await KubernetesHelpers.getInstance().applyService(tempoService(namespace));

      await KubernetesHelpers.getInstance().applyDeployment(
        grafanaDeployment(namespace)
      );
      await KubernetesHelpers.getInstance().applyService(grafanaService(namespace));

      await KubernetesHelpers.getInstance().applyDeployment(redpandaConsoleDeployment(namespace)
      );
      await KubernetesHelpers.getInstance().applyService(
        redpandaConsoleService(namespace)
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
    });

    console.log('\n--- Reconciliation complete ---\n');
  } catch (err) {
    console.error('[Reconcile] Error during reconciliation:', err);

    // Report the error back onto the CRD so users can see it with:
    //   kubectl get rafikiinstances
    await KubernetesHelpers.getInstance().updateStatus(name,
      {
        phase: 'Error',
        message: String(err),
        lastReconciled: new Date().toISOString()
      }
    );

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
export async function cleanup(
  kc: k8s.KubeConfig,
  namespace: string
): Promise<void> {
  console.log(`[Cleanup] Deleting namespace ${namespace}...`);
  const coreApi = kc.makeApiClient(k8s.CoreV1Api);
  try {
    await coreApi.deleteNamespace({ name: namespace });
    console.log(`[Cleanup] Namespace ${namespace} deleted`);
  } catch (err) {
    console.error('[Cleanup] Error:', err);
  }
}

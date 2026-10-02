import * as k8s from '@kubernetes/client-node';
import { ApiException, V1ConfigMap, V1Job } from '@kubernetes/client-node';
import { RafikiInstanceSpec, RafikiInstanceStatus } from './types';
import { PromiseMiddlewareWrapper } from '@kubernetes/client-node/dist/gen/middleware';
import {
  ObjectAppsV1Api,
  ObjectBatchV1Api,
  ObjectCoreV1Api,
  ObjectCustomObjectsApi,
  ObjectRbacAuthorizationV1Api
} from '@kubernetes/client-node/dist/gen/types/ObjectParamAPI';

const FIELD_MANAGER = 'rafiki-operator';
const SSA_OPTIONS = {
  contentType: 'application/apply-patch+yaml'
};

export class KubernetesHelpers {
  private static _instance: KubernetesHelpers;
  private _kc: k8s.KubeConfig;
  private _systemNamespace!: string;
  private _coreApi: ObjectCoreV1Api;
  private _appsApi: ObjectAppsV1Api;
  private _batchApi: ObjectBatchV1Api;
  private _customObjectsApi: ObjectCustomObjectsApi;
  private _rbacApi: ObjectRbacAuthorizationV1Api;
  private _cachedSsaConfiguration!: k8s.Configuration<k8s.ObservableMiddleware>;

  private constructor(kc: k8s.KubeConfig, namespace: string) {
    this._kc = kc;
    this._systemNamespace = namespace;

    this._coreApi = kc.makeApiClient(k8s.CoreV1Api);
    this._appsApi = kc.makeApiClient(k8s.AppsV1Api);
    this._batchApi = kc.makeApiClient(k8s.BatchV1Api);
    this._customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);
    this._rbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api);
  }

  get coreApi(): ObjectCoreV1Api {
    return this._coreApi;
  }
  get appsApi(): ObjectAppsV1Api {
    return this._appsApi;
  }
  get batchApi(): ObjectBatchV1Api {
    return this._batchApi;
  }
  get customObjectsApi(): ObjectCustomObjectsApi {
    return this._customObjectsApi;
  }
  get rbacApi(): ObjectRbacAuthorizationV1Api {
    return this._rbacApi;
  }

  get systemNamespace(): string {
    return this._systemNamespace;
  }

  public static getInstance(): KubernetesHelpers {
    if (this._instance) {
      return this._instance;
    }

    throw new Error('KubernetesHelpers instance not initialized');
  }

  public static async Setup(kc: k8s.KubeConfig, namespace: string) {
    this._instance = new KubernetesHelpers(kc, namespace);
    await this._instance._setupConfiguration();
  }

  private async _setupConfiguration() {
    // Define a middleware that forces the SSA content-type
    const ssaMiddleware = new PromiseMiddlewareWrapper({
      pre: async (requestContext) => {
        // Note: Use exact casing 'Content-Type' (lowercase 'content-type' may fail to overwrite)
        requestContext.setHeaderParam(
          'Content-Type',
          'application/apply-patch+yaml'
        );
        return requestContext;
      },
      post: async (responseContext) => responseContext
    });

    // Re-build the Configuration instance with the middleware
    const currentContext = this._kc.getCurrentContext();
    const currentCluster = this._kc.getCluster(currentContext);
    if (!currentCluster || !currentCluster.server) {
      throw new Error('Could not determine active cluster configuration');
    }

    const baseServerConfig = new k8s.ServerConfiguration(
      currentCluster.server,
      {}
    );
    this._cachedSsaConfiguration = k8s.createConfiguration({
      middleware: [ssaMiddleware],
      baseServer: baseServerConfig,
      authMethods: {
        default: this._kc
      }
    });
  }

  async ensureNamespace(namespace: string): Promise<void> {
    try {
      await this._coreApi.readNamespace({ name: namespace });
    } catch {
      await this._coreApi.createNamespace({
        body: {
          apiVersion: 'v1',
          kind: 'Namespace',
          metadata: { name: namespace }
        }
      });
      console.log(`[Namespace] Created ${namespace}`);
    }
  }

  /**
   * Update the status of a RafikiInstance custom resource.
   *
   * @param name The name of the RafikiInstance.
   * @param status The new status to set.
   */
  public async updateStatus(
    name: string,
    status: RafikiInstanceStatus
  ): Promise<void> {
    try {
      await this._customObjectsApi.patchNamespacedCustomObjectStatus(
        {
          name,
          namespace: this._systemNamespace,
          group: 'rafiki.interledger.org',
          version: 'v1alpha1',
          plural: 'rafikiinstances',
          body: {
            // CRITICAL: SSA requires Type Metadata to be defined in the payload!
            apiVersion: 'rafiki.interledger.org/v1alpha1',
            kind: 'RafikiInstance',

            // Keep your metadata and status updates here
            metadata: {
              name: name,
              namespace: this._systemNamespace
            },
            status
          },
          fieldManager: FIELD_MANAGER,
          force: true,
          ...SSA_OPTIONS
        },
        this._cachedSsaConfiguration
      );
    } catch (err) {
      console.error('[Status] Failed to update status:', err);
    }
  }

  public async applyStatefulSet(
    manifest: k8s.V1StatefulSet
  ): Promise<void> {
    if (
      !manifest.metadata ||
      !manifest.metadata.name ||
      !manifest.metadata.namespace
    ) {
      throw new Error('Missing metadata, metadata.name or metadata.namespace');
    }

    await this._appsApi.patchNamespacedStatefulSet(
      {
        name: manifest.metadata.name,
        namespace: manifest.metadata.namespace,
        body: manifest,
        fieldManager: FIELD_MANAGER,
        force: true,
        ...SSA_OPTIONS
      },
      this._cachedSsaConfiguration
    );

    console.log(`[StatefulSet] Applied ${manifest.metadata.name}`);
  }

  public async applyDeployment(
    manifest: k8s.V1Deployment
  ): Promise<void> {
    if (!manifest.metadata || !manifest.metadata.name || !manifest.metadata.namespace) {
      throw new Error('Missing metadata, metadata.name or metadata.namespace');
    }

    await this._appsApi.patchNamespacedDeployment(
      {
        name: manifest.metadata.name,
        namespace: manifest.metadata.namespace,
        body: manifest,
        fieldManager: FIELD_MANAGER,
        force: true,
        ...SSA_OPTIONS
      },
      this._cachedSsaConfiguration
    );

    console.log(`[Deployment] Applied ${manifest.metadata.name}`);
  }

  async applyService(
    manifest: k8s.V1Service
  ): Promise<void> {
    if (
      !manifest.metadata ||
      !manifest.metadata.name ||
      !manifest.metadata.namespace
    ) {
      throw new Error('Missing metadata, metadata.name or metadata.namespace');
    }

    await this._coreApi.patchNamespacedService(
      {
        name: manifest.metadata.name,
        namespace: manifest.metadata.namespace,
        body: manifest,
        fieldManager: FIELD_MANAGER,
        force: true,
        ...SSA_OPTIONS
      },
      this._cachedSsaConfiguration
    );

    console.log(`[Service] Applied ${manifest.metadata.name}`);
  }

  // NOTE: jobs are immutable, so without the runAgain param it will
  // not run again is the job was already executed
  async applyJob(manifest: k8s.V1Job,runAgain: boolean,): Promise<void> {
    if (
      !manifest.metadata ||
      !manifest.metadata.name ||
      !manifest.metadata.namespace
    ) {
      throw new Error('Missing metadata, metadata.name or metadata.namespace');
    }

    let existingJob: V1Job | null = null;
    try {
      // not existing will throw
      existingJob = await this._batchApi.readNamespacedJob({
        name: manifest.metadata.name,
        namespace: manifest.metadata.namespace
      });

      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (e instanceof ApiException) {
        console.log(`[Job] with name: ${manifest.metadata.name} doesn't exist`);
      } else {
        throw e;
      }
    }

    if (existingJob && !runAgain) {
      console.log(
        `[Job] with name: ${manifest.metadata.name} already exists exist`
      );
      return;
    }

    if (existingJob) {
      // delete
      await this._batchApi.deleteNamespacedJob({
        name: manifest.metadata.name,
        namespace: manifest.metadata.namespace
      });
    }

    try {
      // create it
      await this._batchApi.createNamespacedJob({
        namespace: manifest.metadata.namespace,
        body: manifest
      });
      console.log(`[Job] Created ${manifest.metadata.name}`);
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.log(`[Job] Error creating job: ${manifest.metadata.name} - ${e}`);
    }
  }

  // ---------------------------------------------------------------------------
  // RBAC helper — let app pods' initContainers read the Kafka init Job
  //
  // App Deployments don't set serviceAccountName, so their pods (and the
  // waitForKafkaInit initContainer) run as the "default" ServiceAccount in
  // the instance's namespace. That account has no permissions by default,
  // so "kubectl get job init-kafka" from an initContainer is forbidden
  // unless we grant it here.
  // ---------------------------------------------------------------------------

  async ensureJobReaderRbac(namespace: string): Promise<void> {
    const roleName = 'rafiki-job-reader';

    try {
      await this._rbacApi.readNamespacedRole({
        name: roleName,
        namespace: namespace
      });
    } catch {
      await this._rbacApi.createNamespacedRole({
        namespace: namespace,
        body: {
          apiVersion: 'rbac.authorization.k8s.io/v1',
          kind: 'Role',
          metadata: { name: roleName, namespace: namespace },
          rules: [{ apiGroups: ['batch'], resources: ['jobs'], verbs: ['get'] }]
        }
      });
      console.log(`[RBAC] Created Role ${roleName}`);
    }

    try {
      await this._rbacApi.readNamespacedRoleBinding({
        name: roleName,
        namespace: namespace
      });
    } catch {
      await this._rbacApi.createNamespacedRoleBinding({
        namespace: namespace,
        body: {
          apiVersion: 'rbac.authorization.k8s.io/v1',
          kind: 'RoleBinding',
          metadata: { name: roleName, namespace: namespace },
          subjects: [
            {
              kind: 'ServiceAccount',
              name: 'default',
              namespace: namespace
            }
          ],
          roleRef: {
            kind: 'Role',
            name: roleName,
            apiGroup: 'rbac.authorization.k8s.io'
          }
        }
      });

      console.log(`[RBAC] Created RoleBinding ${roleName}`);
    }
  }

  getSimpleDeployment(
    name: string,
    namespace: string,
    image: string,
    ports: number[],
    env: k8s.V1EnvVar[] = [],
    args: string[] = [],
    volumeMounts: k8s.V1VolumeMount[] = [],
    volumes: k8s.V1Volume[] = []
  ): k8s.V1Deployment {
    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name, namespace: namespace, labels: { app: name } },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: name } },
        template: {
          metadata: { labels: { app: name } },
          spec: {
            volumes,
            containers: [
              {
                name,
                image,
                args: args.length > 0 ? args : undefined,
                env: env.length > 0 ? env : undefined,
                ports: ports.map((p) => ({ containerPort: p })),
                volumeMounts: volumeMounts.length > 0 ? volumeMounts : undefined
              }
            ]
          }
        }
      }
    };
  }

  /** Builds a standard Deployment object. */
  makeDeployment(
    name: string,
    namespace: string,
    replicas: number,
    image: string,
    env: k8s.V1EnvVar[],
    ports: Array<{ containerPort: number }>,
    initContainers?: k8s.V1Container[]
  ): k8s.V1Deployment {
    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name, namespace, labels: { app: name } },
      spec: {
        replicas,
        selector: { matchLabels: { app: name } },
        template: {
          metadata: { labels: { app: name } },
          spec: {
            initContainers: initContainers ?? [],
            containers: [
              {
                name,
                image,
                // IfNotPresent works for both a locally-built dev image (never
                // pushed to a registry, so it must come from the node's local
                // cache) and a real registry image (pulled the first time it's
                // needed, cached after that).
                imagePullPolicy: 'IfNotPresent',
                env,
                ports: ports.map((p) => ({ containerPort: p.containerPort }))
              }
            ]
          }
        }
      }
    };
  }

  clusterIpService(
    name: string,
    namespace: string,
    ports: Array<{ port: number; targetPort: number; name?: string }>
  ): k8s.V1Service {
    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name, namespace, labels: { app: name } },
      spec: {
        type: 'ClusterIP',
        selector: { app: name },
        ports: ports.map((p) => ({
          name: p.name ?? String(p.port),
          port: p.port
        }))
      }
    };
  }

  async createConfigMap(): Promise<V1ConfigMap> {
    const configMap: k8s.V1ConfigMap = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'otel-collector-config',
        namespace: 'default'
      },
      data: {
        'config.yaml': `
receivers:
  otlp:
    protocols:
      grpc:
exporters:
  logging:
    verbosity: detailed
`
      }
    };

    return configMap;
  }

  async createCustomObject(
    namespace: string,
    objectManifest: k8s.KubernetesObject
  ): Promise<boolean> {
    try {
      // Automatically extract Group and Version from the manifest apiVersion (e.g., 'gateway.networking.k8s.io/v1')
      const [group, version] = (objectManifest.apiVersion || '').split('/');
      const plural = objectManifest.kind
        ? `${objectManifest.kind.toLowerCase()}s`
        : null;
      const name = objectManifest.metadata?.name;

      if (!name) {
        console.log(
          `Skipping createCustomObject "${objectManifest.metadata?.name}" in namespace "${namespace}"...`
        );
        return false;
      }

      console.log(
        `Creating createCustomObject "${objectManifest.metadata?.name}" in namespace "${namespace}"...`
      );

      const response = await this._customObjectsApi.patchNamespacedCustomObject(
        {
          name: name,
          group: group || 'rafiki.interledger.org',
          version: version || 'v1alpha1',
          plural: plural || 'customObjects',
          namespace: namespace,
          body: objectManifest,
          fieldManager: FIELD_MANAGER,
          force: true,
          ...SSA_OPTIONS
        },
        this._cachedSsaConfiguration
      ); //

      console.log(`${name} created successfully!`);
      console.log('API Response:', response.body);

      return true;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      // Elegant error logging to read detailed API server validation failures
      if (err instanceof k8s.HttpException || err.body) {
        console.error(
          'Failed to create Gateway:',
          JSON.stringify(err.body, null, 2)
        );
      } else {
        console.error('An unexpected error occurred:', err);
      }

      return false;
    }
  }
}

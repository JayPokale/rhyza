// manifests/infrastructure.ts
//
// Factory functions that return Kubernetes API objects for the three
// stateful infrastructure services: MongoDB, Redis, and Kafka.
//
// WHY StatefulSet instead of Deployment?
//   Deployments are for stateless pods — any pod can be replaced and the
//   app still works. StatefulSets give each pod a stable network identity
//   and a dedicated PersistentVolume that stays attached to that specific
//   pod even after restarts. Databases need this guarantee.

import * as k8s from '@kubernetes/client-node';
import { RafikiInstanceSpec } from '../types.js';

const KAFKA_IMAGE = 'apache/kafka:4.0.0';
const MONGO_IMAGE = 'mongo:7';
const REDIS_IMAGE = 'redis:7';

// ---------------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------------

/**
 * Returns a Kubernetes StatefulSet for MongoDB.
 *
 * In the docker-compose file this was:
 *   image: mongo
 *   environment:
 *     MONGO_INITDB_ROOT_USERNAME: root
 *     MONGO_INITDB_ROOT_PASSWORD: mongoPass
 *   volumes:
 *     - mongodb-data:/data/db
 *
 * The password comes from the Secret the integrator supplies via
 * spec.mongoPasswordSecretRef — controller.ts only verifies it exists.
 */
export function mongodbStatefulSet(
  namespace: string,
  spec: RafikiInstanceSpec
): k8s.V1StatefulSet {
  const secretRef = spec.mongoPasswordSecretRef;
  return {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'mongodb', namespace, labels: { app: 'mongodb' } },
    spec: {
      serviceName: 'mongodb', // must match the headless Service name
      replicas: 1,
      selector: { matchLabels: { app: 'mongodb' } },
      template: {
        metadata: { labels: { app: 'mongodb' } },
        spec: {
          containers: [
            {
              name: 'mongodb',
              image: MONGO_IMAGE,
              ports: [{ containerPort: 27017 }],
              env: [
                { name: 'MONGO_INITDB_ROOT_USERNAME', value: 'root' },
                {
                  name: 'MONGO_INITDB_ROOT_PASSWORD',
                  // Read the password from a Kubernetes Secret at runtime.
                  valueFrom: {
                    secretKeyRef: {
                      name: secretRef.name,
                      key: secretRef.key
                    }
                  }
                }
              ],
              // Liveness probe: MongoDB answers to this check when healthy.
              livenessProbe: {
                exec: {
                  command: [
                    'mongosh',
                    '--quiet',
                    '--eval',
                    'db.runCommand("ping").ok'
                  ]
                },
                initialDelaySeconds: 30,
                periodSeconds: 10,
                failureThreshold: 5
              },
              readinessProbe: {
                exec: {
                  command: [
                    'mongosh',
                    '--quiet',
                    '--eval',
                    'db.runCommand("ping").ok'
                  ]
                },
                initialDelaySeconds: 10,
                periodSeconds: 10,
                failureThreshold: 5
              },
              // Mount the persistent storage at /data/db (where Mongo stores data)
              volumeMounts: [{ name: 'mongodb-data', mountPath: '/data/db' }]
            }
          ]
        }
      },
      // volumeClaimTemplates automatically creates a PersistentVolumeClaim
      // for each replica. The pod gets its own dedicated volume.
      volumeClaimTemplates: [
        {
          metadata: { name: 'mongodb-data' },
          spec: {
            accessModes: ['ReadWriteOnce'], // one node can mount this at a time
            resources: { requests: { storage: '5Gi' } }
          }
        }
      ]
    }
  };
}

/**
 * A Service exposes a set of pods on a stable DNS name within the cluster.
 * "mongodb:27017" in env vars resolves because of this Service.
 */
export function mongodbService(namespace: string): k8s.V1Service {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'mongodb', namespace, labels: { app: 'mongodb' } },
    spec: {
      // ClusterIP: accessible only inside the cluster (no external traffic)
      type: 'ClusterIP',
      selector: { app: 'mongodb' },
      ports: [{ port: 27017 }]
    }
  };
}

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

export function redisStatefulSet(namespace: string): k8s.V1StatefulSet {
  return {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'redis', namespace, labels: { app: 'redis' } },
    spec: {
      serviceName: 'redis',
      replicas: 1,
      selector: { matchLabels: { app: 'redis' } },
      template: {
        metadata: { labels: { app: 'redis' } },
        spec: {
          containers: [
            {
              name: 'redis',
              image: REDIS_IMAGE,
              ports: [{ containerPort: 6379 }],
              readinessProbe: {
                exec: { command: ['redis-cli', 'ping'] },
                initialDelaySeconds: 10,
                periodSeconds: 10,
                failureThreshold: 10
              },
              livenessProbe: {
                exec: { command: ['redis-cli', 'ping'] },
                initialDelaySeconds: 10,
                periodSeconds: 10
              }
            }
          ]
        }
      }
    }
  };
}

export function redisService(namespace: string): k8s.V1Service {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'redis', namespace, labels: { app: 'redis' } },
    spec: {
      type: 'ClusterIP',
      selector: { app: 'redis' },
      ports: [{ port: 6379 }]
    }
  };
}

// ---------------------------------------------------------------------------
// Kafka (single-broker KRaft mode — no ZooKeeper needed)
// ---------------------------------------------------------------------------

/**
 * Kafka runs in KRaft mode (self-managed metadata, no Zookeeper).
 * The env vars match the docker-compose configuration exactly.
 *
 * Two listeners are configured:
 *   INTERNAL://kafka:19092  — used by other pods inside the cluster
 *   CONTROLLER://kafka:19093 — used internally by KRaft
 *
 * Only the INTERNAL listener is needed by application services since
 * everything runs inside the cluster.
 */
export function kafkaStatefulSet(namespace: string): k8s.V1StatefulSet {
  return {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'kafka', namespace, labels: { app: 'kafka' } },
    spec: {
      serviceName: 'kafka',
      replicas: 1,
      selector: { matchLabels: { app: 'kafka' } },
      template: {
        metadata: { labels: { app: 'kafka' } },
        spec: {
          containers: [
            {
              name: 'kafka',
              image: KAFKA_IMAGE,
              ports: [
                { containerPort: 19092 }, // INTERNAL
                { containerPort: 19093 }, // CONTROLLER
                { containerPort: 9092 } // EXTERNAL (unused inside cluster)
              ],
              env: [
                { name: 'KAFKA_BROKER_ID', value: '1' },
                { name: 'KAFKA_NODE_ID', value: '1' },
                { name: 'KAFKA_PROCESS_ROLES', value: 'broker,controller' },
                {
                  name: 'KAFKA_LISTENER_SECURITY_PROTOCOL_MAP',
                  value:
                    'INTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT,EXTERNAL:PLAINTEXT'
                },
                {
                  name: 'KAFKA_ADVERTISED_LISTENERS',
                  value: 'INTERNAL://kafka:19092,EXTERNAL://kafka:9092'
                },
                {
                  name: 'KAFKA_LISTENERS',
                  value:
                    'INTERNAL://:19092,CONTROLLER://:19093,EXTERNAL://:9092'
                },
                { name: 'KAFKA_INTER_BROKER_LISTENER_NAME', value: 'INTERNAL' },
                {
                  name: 'KAFKA_CONTROLLER_LISTENER_NAMES',
                  value: 'CONTROLLER'
                },
                {
                  name: 'KAFKA_CONTROLLER_QUORUM_VOTERS',
                  value: '1@kafka:19093'
                },
                { name: 'KAFKA_NUM_PARTITIONS', value: '1' },
                { name: 'KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR', value: '1' },
                {
                  name: 'KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR',
                  value: '1'
                },
                { name: 'KAFKA_TRANSACTION_STATE_LOG_MIN_ISR', value: '1' }
              ],
              readinessProbe: {
                // nc (netcat) checks if port 19092 is open.
                // Matches the healthcheck in docker-compose.
                exec: { command: ['nc', '-z', 'localhost', '19092'] },
                initialDelaySeconds: 30,
                periodSeconds: 10,
                failureThreshold: 10
              },
              livenessProbe: {
                exec: { command: ['nc', '-z', 'localhost', '19092'] },
                initialDelaySeconds: 30,
                periodSeconds: 10
              }
            }
          ]
        }
      }
    }
  };
}

/**
 * Kafka needs a headless Service (clusterIP: None) so that StatefulSet pods
 * get stable DNS entries like kafka-0.kafka.<namespace>.svc.cluster.local.
 * App services just use "kafka:19092" which routes to the single broker.
 */
export function kafkaService(namespace: string): k8s.V1Service {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'kafka', namespace, labels: { app: 'kafka' } },
    spec: {
      // clusterIP: None makes this a "headless" service. Pods in a
      // StatefulSet need this for stable network identities.
      clusterIP: 'None',
      // Kafka's own KRaft controller quorum voter is configured as
      // "kafka:19093" (its own headless-service hostname). By default
      // Kubernetes only publishes a pod's IP once it passes its readiness
      // probe — but that probe requires Kafka to already be listening,
      // which requires it to resolve its own quorum voter address first.
      // publishNotReadyAddresses breaks that deadlock by publishing the
      // pod's IP as soon as it exists, before it's marked Ready.
      publishNotReadyAddresses: true,
      selector: { app: 'kafka' },
      ports: [
        {
          name: 'internal',
          port: 19092
        },
        {
          name: 'controller',
          port: 19093
        },
        { name: 'external', port: 9092 }
      ]
    }
  };
}

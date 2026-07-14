// manifests/kafkaInit.ts
//
// The Kafka init Job creates all the required Kafka topics before any
// application service starts consuming or producing.
//
// WHY a Job?
//   A Kubernetes Job runs a pod to completion and then stops — it's
//   "run once" logic. This mirrors the docker-compose "init-kafka" service
//   which uses `condition: service_completed_successfully`.
//
// The operator creates this Job after the Kafka StatefulSet is ready,
// and application Deployments use an initContainer that waits for the
// Job to complete before starting.

import * as k8s from '@kubernetes/client-node';

const KAFKA_IMAGE = 'apache/kafka:4.0.0';

/**
 * Returns a Kubernetes Job that creates all the Kafka topics needed by
 * the Rafiki-v2 services.
 *
 * The topic list mirrors the docker-compose init-kafka command exactly.
 */
export function kafkaInitJob(namespace: string): k8s.V1Job {
  // The shell script that creates all topics.
  // --if-not-exists means it's safe to re-run; it won't fail if the topic
  // already exists. This is important because the operator may reconcile
  // multiple times.
  const initScript = `
#!/bin/sh
set -e
echo "Waiting for Kafka to be ready..."
until /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:19092 --list; do
  echo "Kafka not ready yet, retrying in 5s..."
  sleep 5
done

echo "Creating Kafka topics..."

create() {
  /opt/kafka/bin/kafka-topics.sh \\
    --bootstrap-server kafka:19092 \\
    --create --if-not-exists \\
    "$@"
}

# Single-partition topics (control plane / audit)
create --topic audits
create --topic logs

# High-throughput topics with 24 partitions
# Partitions allow multiple consumers to read in parallel for throughput.
create --partitions 24 --topic payment-commands
create --partitions 24 --topic payment-domain-events
create --partitions 24 --topic asset-domain-events
create --partitions 24 --topic peer-domain-events
create --partitions 24 --topic ledger-commands
create --partitions 24 --topic ledger-domain-events
create --partitions 24 --topic ledger-snapshot-events
create --partitions 24 --topic ledger-state-events
create --partitions 24 --topic wallet-address-domain-events
create --partitions 24 --topic ilp-domain-events
create --partitions 24 --topic ilp-commands
create --partitions 24 --topic ilp-connector-commands
create --partitions 24 --topic notification-commands

echo "All Kafka topics created successfully."
/opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:19092 --list
`;

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: 'init-kafka',
      namespace,
      labels: { app: 'init-kafka', 'rafiki/role': 'init' }
    },
    spec: {
      // If the Job fails (e.g. Kafka is temporarily unavailable), retry up to 5 times.
      backoffLimit: 5,
      template: {
        metadata: { labels: { app: 'init-kafka' } },
        spec: {
          // restartPolicy: OnFailure means if the container exits non-zero,
          // Kubernetes restarts it (up to backoffLimit).
          restartPolicy: 'OnFailure',
          containers: [
            {
              name: 'init-kafka',
              image: KAFKA_IMAGE,
              command: ['/bin/sh', '-c', initScript]
            }
          ]
        }
      }
    }
  };
}

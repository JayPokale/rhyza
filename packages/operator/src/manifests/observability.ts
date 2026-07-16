import * as k8s from '@kubernetes/client-node';

// manifests/observability.ts
//
// Deployment manifests for the observability stack:
// - OpenTelemetry Collector (receives traces/metrics from app services)
// - Prometheus (scrapes metrics)
// - Tempo (stores distributed traces)
// - Grafana (dashboards UI)
// - Redpanda Console (Kafka topic browser)
//
// All of these are standard third-party images — no custom builds needed.
// ConfigMaps (otel-collector-config.yaml, prometheus.yaml, tempo.yaml) must
// be applied separately (or created from the docker/ config files).

import { clusterIpService, simpleDeployment } from '../helpers';



// ---------------------------------------------------------------------------
// OpenTelemetry Collector
// ---------------------------------------------------------------------------

export function otelCollectorDeployment(namespace: string): k8s.V1Deployment {
  return simpleDeployment(
    'otel-collector',
    namespace,
    'otel/opentelemetry-collector:latest',
    [4317, 4318],
    [],
    ['--config=/etc/otel-collector-config.yaml'],
    [
      {
        name: 'otel-config',
        mountPath: '/etc/otel-collector-config.yaml',
        subPath: 'otel-collector-config.yaml'
      }
    ],
    [{ name: 'otel-config', configMap: { name: 'otel-collector-config' } }]
  );
}

export function otelCollectorService(namespace: string): k8s.V1Service {
  return clusterIpService('otel-collector', namespace, [
    { port: 4317, targetPort: 4317, name: 'grpc' },
    { port: 4318, targetPort: 4318, name: 'http' }
  ]);
}

// ---------------------------------------------------------------------------
// Prometheus
// ---------------------------------------------------------------------------

export function prometheusDeployment(namespace: string): k8s.V1Deployment {
  return simpleDeployment(
    'prometheus',
    namespace,
    'prom/prometheus:latest',
    [9090],
    [],
    [
      '--config.file=/etc/prometheus/prometheus.yaml',
      '--web.enable-remote-write-receiver'
    ],
    [
      {
        name: 'prometheus-config',
        mountPath: '/etc/prometheus/prometheus.yaml',
        subPath: 'prometheus.yaml'
      }
    ],
    [{ name: 'prometheus-config', configMap: { name: 'prometheus-config' } }]
  );
}

export function prometheusService(namespace: string): k8s.V1Service {
  return clusterIpService('prometheus', namespace, [
    { port: 9090, targetPort: 9090 }
  ]);
}

// ---------------------------------------------------------------------------
// Tempo (distributed tracing backend)
// ---------------------------------------------------------------------------

export function tempoDeployment(namespace: string): k8s.V1Deployment {
  return simpleDeployment(
    'tempo',
    namespace,
    'grafana/tempo:latest',
    [3200],
    [],
    ['-config.file=/etc/tempo.yaml'],
    [
      {
        name: 'tempo-config',
        mountPath: '/etc/tempo.yaml',
        subPath: 'tempo.yaml'
      }
    ],
    [{ name: 'tempo-config', configMap: { name: 'tempo-config' } }]
  );
}

export function tempoService(namespace: string): k8s.V1Service {
  return clusterIpService('tempo', namespace, [
    { port: 3200, targetPort: 3200 }
  ]);
}

// ---------------------------------------------------------------------------
// Grafana
// ---------------------------------------------------------------------------

export function grafanaDeployment(namespace: string): k8s.V1Deployment {
  return simpleDeployment(
    'grafana',
    namespace,
    'grafana/grafana:latest',
    [3000],
    [
      { name: 'GF_AUTH_ANONYMOUS_ENABLED', value: 'true' },
      { name: 'GF_AUTH_ANONYMOUS_ORG_ROLE', value: 'Admin' }
    ]
  );
}

export function grafanaService(namespace: string): k8s.V1Service {
  return clusterIpService('grafana', namespace, [
    { port: 3000, targetPort: 3000 }
  ]);
}

// ---------------------------------------------------------------------------
// Redpanda Console (Kafka browser)
// ---------------------------------------------------------------------------

export function redpandaConsoleDeployment(namespace: string): k8s.V1Deployment {
  return simpleDeployment(
    'redpanda-console',
    namespace,
    'redpandadata/console:latest',
    [8080],
    [{ name: 'KAFKA_BROKERS', value: 'kafka:19092' }]
  );
}

export function redpandaConsoleService(namespace: string): k8s.V1Service {
  return clusterIpService('redpanda-console', namespace, [
    { port: 8080, targetPort: 8080 }
  ]);
}

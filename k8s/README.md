# install


## Install prerequisites

https://cert-manager.io/docs/installation/

``` bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.18.0/cert-manager.yaml```
```
---

## Install Monitoring components

#### Start by installing OpenTelemetry's k8s operator
REF: https://opentelemetry.io/docs/platforms/kubernetes/operator/

Install the latest operator with:

``` bash
kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml
```

Apply the configuration to the operator with:

``` bash
cd monitoring
kubectl apply -f opentelemetry.yaml
```

Install Prometheus and Grafana

Apply all manifests in the monitoring directory:
``` bash
cd monitoring
kubectl apply -f .
```


---


## Install infrastructure components

Install the infrastructure directories
- [kafka](infrastructure/kafka)
- [postgresql](infrastructure/postgresql)
- [tigerbeetle](infrastructure/tigerbeetle)




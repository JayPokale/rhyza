# install
REF: https://cloudnative-pg.io/documentation/1.25/installation_upgrade/


You can install the latest operator manifest for this minor release as follows:

``` bash
kubectl apply --server-side -f \
https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.25/releases/cnpg-1.25.2.yaml
```

You can verify that with:

``` bash
kubectl get deployment -n cnpg-system cnpg-controller-manager
```

then apply the manifests in this dir

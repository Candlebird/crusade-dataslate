#!/usr/bin/env bash
# One-time setup so .github/workflows/firestore-rules.yml can publish firestore.rules without any stored key.
# Run in Google Cloud Shell for the crusade-dataslate project. Safe to re-run: steps that already exist are skipped.
#   - rules-deployer: a service account that can only manage Firebase security rules.
#   - Workload Identity pool "github" / provider "crusade-dataslate": trusts GitHub's OIDC tokens, but only from
#     Candlebird/crusade-dataslate on main, and only to act as rules-deployer.
set -euo pipefail
P=crusade-dataslate
R=Candlebird/crusade-dataslate
SA=rules-deployer@$P.iam.gserviceaccount.com
N=$(gcloud projects describe $P --format='value(projectNumber)')

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com firebaserules.googleapis.com --project $P

gcloud iam service-accounts describe $SA --project $P >/dev/null 2>&1 ||
  gcloud iam service-accounts create rules-deployer --display-name='GitHub: deploy Firestore rules' --project $P
for role in roles/firebaserules.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding $P --member=serviceAccount:$SA --role=$role --condition=None --format=none
done

gcloud iam workload-identity-pools describe github --location=global --project $P >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create github --location=global --display-name=GitHub --project $P
gcloud iam workload-identity-pools providers describe crusade-dataslate --location=global --workload-identity-pool=github --project $P >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc crusade-dataslate --location=global --workload-identity-pool=github \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
    --attribute-condition="assertion.repository=='$R' && assertion.ref=='refs/heads/main'" --project $P

gcloud iam service-accounts add-iam-policy-binding $SA --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/github/attribute.repository/$R" \
  --project $P --format=none

echo "RULES-DEPLOY-SETUP-OK project number $N"

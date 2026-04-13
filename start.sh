#!/bin/sh
set -e

export GOOGLE_CLOUD_PROJECT=teknoir
export GCLOUD_STORAGE_BUCKET=teknoir-ai.teknoir.cloud
export GOOGLE_APPLICATION_CREDENTIALS=/Volumes/GIT/ai/gcs-media-service/teknoir-admin-credentials.json

npm start
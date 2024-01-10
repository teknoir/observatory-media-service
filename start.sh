#!/bin/sh
set -e

export GOOGLE_CLOUD_PROJECT=teknoir-poc
export GCLOUD_STORAGE_BUCKET=demonstrations.teknoir.dev
export GOOGLE_APPLICATION_CREDENTIALS=/Volumes/GIT/ai/authui/teknoir-poc-admin-credentials.json

npm start
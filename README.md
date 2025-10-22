# GCS Media Service
This app does the following:
1. It serve a rest API to the current namespace bucket, ex: "demostrations.teknoir.dev"
2. It serves only files that ends with '.mp4'
3. It only serve mediafiles with contentType: 'video/mp4'
4. It only serve mediafiles by streaming them, not downloading
5. The API route is the file/objects path and filename on the bucket, ex: http://teknoir.dev/demonstrations/media-service/api/mp4/videos/boxer_property_3.mp4 becomes demonstrations.teknoir.dev/videos/boxer_property_3.mp4

# MP4 file requirements
Files taken directly from the "NVR" has to be reencoded with new keyframes to work.
Example:
```bash
ffmpeg -i ParkingSurfaceSouth210_video00194.mp4 -codec:v libx264 \
    -x264opts "keyint=48:min-keyint=48:no-scenecut" \
    -c:a copy \
    -y ParkingSurfaceSouth210_video00194_reencoded.mp4
```

# Test downloading mp4 file locally

## Pass google credentials to the image
```bash
# Assuming there is creds.json file in ./creds directory
```

## Build and run docker container
```bash
docker build -t gcs-media-service .
docker run -p 9982:8000 -e GOOGLE_APPLICATION_CREDENTIALS=/creds/creds.json -e GOOGLE_CLOUD_PROJECT=teknoir -e GCLOUD_STORAGE_BUCKET=victra-poc.teknoir.cloud -v ./creds:/creds -v ./tmp:/video -e LOG_LEVEL=debug --rm --name gcs-media gcs-media-service
```

## Make a request for a downloading

```bash
wget "http://localhost:9982/api/annotated/mp4/media/videos/nc0009-salefloor-270/line-crossing/2025-09-15T15-28-19.102Z.mp4?timestamp=2025-09-13T13:02:31.629Z&location=NC-Durham&camera=nc0009-salefloor-279&timezone=America/New_York" -O annotated_video1.mp4
```

# Build image in cloud and push

```bash
gcloud builds submit . --config=cloudbuild.yaml --project=teknoir-mgmt --substitutions=SHORT_SHA="$(date +%Y%m%d-%H%M%S)",BRANCH_NAME="local"
```

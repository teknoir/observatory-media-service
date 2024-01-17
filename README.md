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
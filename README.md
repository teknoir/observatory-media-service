docker run -it --rm -v $(pwd):/app --env=GOOGLE_APPLICATION_CREDENTIALS=/app/teknoir-admin-credentials.json --workdir=/app tekn0ir/gcs-gst-media-service:base bash

GST_DEBUG=*:2 LD_PRELOAD="/usr/lib/aarch64-linux-gnu/libgomp.so.1 /lib/aarch64-linux-gnu/libGLdispatch.so /usr/local/lib/libgoogle_cloud_cpp_storage.so /usr/local/lib/libgoogle_cloud_cpp_common.so /usr/local/lib/libgoogle_cloud_cpp_rest_internal.so" gst-launch-1.0 --verbose --gst-plugin-load="/lib/aarch64-linux-gnu/gstreamer-1.0/libgstgs.so" gssrc location=gs://boxer-property.teknoir.cloud/videos/boxer_property_3.mp4 ! fakevideosink



# GStreamer MQTT Capture App
This app does the following:
1. It subscribes to a MQTT broker on a camera discovery topic 
2. Captures video from each camera via its RTSP source 
3. Stores the videos in local files that can be rotated 
4. Publishes images from the videos to a MQTT broker

Basically the app can do anything that GStreamer can do. The app is configured with a GStreamer pipeline. 
The pipeline is a string that is passed to the app as an environment variable: GST_PIPELINE_TEMPLATE.
The pipeline must contain one appsink named `mqttsink`.

## Build sequence
The base image take a long time to build. The base image is preferably built once and cached in the container registry.
```
gcloud --project=teknoir builds submit . --config=cloudbuild_gstreamer.yaml --substitutions=SHORT_SHA="1.22.6",BRANCH_NAME="main"
```

or
```
make gcloud-gstreamer-build
```

The app image is built with the base image as a cache.
```
gcloud --project=teknoir builds submit . --config=cloudbuild.yaml --substitutions=SHORT_SHA="1.22.6",BRANCH_NAME="main"
```

or
```
make gcloud-build
```

## Local Build
```
GO111MODULE=on CGO_ENABLED=1 go build -o gcs-gst-media-service -a .
```
or
```
make build
```

## Local Build Docker Image
```
docker build --tag  gcr.io/teknoir/gcs-gst-media-service:local-test .
```
or
```
make docker-build
```

## Run
Start MQTT broker:
```
ssh -L 1883:localhost:31883 teknoir@rpi4-8gb-black.local
```
or
```
docker run -ti --rm -p 1883:1883 -p 9001:9001 eclipse-mosquitto
```
or
```
kubectl port-forward --namespace demonstrations svc/mqtt 1883:1883
```
or
```
make mqtt
```

### Run with MQTT
```
MQTT_SERVICE_HOST=localhost DEBUG_LEVEL=DEBUG CLIENT_ID=cc-test ./gcs-gst-media-service
```
or
```
make run
```

### Run as Docker Container
```
docker run -ti --rm --env=MQTT_SERVICE_HOST=<host-ip> --env=MQTT_SERVICE_PORT=31883 --net=host gcr.io/teknoir/gcs-gst-media-service:local-test
```

## Pipeline
The pipeline is a string that is passed to the app as an environment variable: GST_PIPELINE_TEMPLATE.

```
"rtspsrc location={{.uri}} ! queue ! rtpjitterbuffer latency=15 ! rtph264depay ! queue ! h264parse ! h264timestamper ! tee name=t \
! queue ! avdec_h264 ! videoconvert ! video/x-raw,format=RGB ! queue ! videorate ! video/x-raw,framerate=5/1 ! queue ! videoscale ! video/x-raw,width=[1,800],height=[1,600],pixel-aspect-ratio=1/1 ! queue ! jpegenc ! appsink sync=0 name=mqttsink t. \
! queue ! splitmuxsink location=/app/videos/{{.camera_id}}_video%05d.mp4 max-size-time=300000000000 max-files=288"
```
Quick explanation of the pipeline:
1. `rtspsrc` is the source of the video. It is a GStreamer element that can read from a RTSP source.
2. `tee` is a GStreamer element that splits the video stream into two streams. One stream is sent to the `mqttsink` and the other stream is sent to the `splitmuxsink`.
3. `mqttsink` is a GStreamer element that publishes the video stream to a MQTT broker.
   1. `videorate` is a GStreamer element that sets the frame rate of the video stream.
      1. The frame rate is set to 5 frames per second.
   2. `videoscale` is a GStreamer element that sets the size of the video stream.
      1. The size is set to a maximum of 800x600.
   3. The images are encoded as JPEG.
4. `splitmuxsink` is a GStreamer element that stores the video stream in a local file. The files are rotated every 5 minutes. The files are stored in the `/app/videos` directory.
   1. The files are named with the camera id and a sequence number.
   2. The files are stored in the mp4 format.
   3. Each file is 5 minutes long. Maximum of 288 files are stored. The maximum number of files is 24 hours worth of video.

### Pipeline Template w/ Hardware Acceleration
```
"rtspsrc location={{.uri}} ! queue ! rtpjitterbuffer latency=150 ! tee name=t \
! rtph264depay ! nvv4l2decoder ! nvvidconv ! queue ! videorate ! video/x-raw(memory:NVMM),width=[1,800],height=[1,600],pixel-aspect-ratio=1/1,framerate=3/1 ! queue ! nvjpegenc ! appsink sync=0 name=mqttsink t. \
! rtph264depay ! queue ! h264parse ! h264timestamper ! queue ! splitmuxsink location=/app/videos/{{.camera_id}}_video%05d.mp4 max-size-time=300000000000 max-files=288"
```

# TODO:
- [ ] Add instrumentation to the app. Send metrics via state topic(metrics format) to be picked up by Prometheus in Teknoir cloud.
- [ ] Give the splitmuxsink a unique name and pick it up in Golang code for alternative file naming, as date etc., and storage options.
- [ ] Add unit tests

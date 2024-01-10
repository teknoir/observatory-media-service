#!/bin/sh
set -e

ffmpeg -i ParkingSurfaceSouth210_video00194.mp4 -codec:v libx264 \
-x264opts "keyint=48:min-keyint=48:no-scenecut" \
-c:a copy \
-y test_keyint_48.mp4

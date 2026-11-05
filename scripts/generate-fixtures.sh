#!/usr/bin/env sh
set -eu

fixture_dir="$(CDPATH= cd -- "$(dirname -- "$0")/../test/fixtures" && pwd)"

ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=black:s=32x32:r=10:d=1 \
  -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart -y "$fixture_dir/head-moov.mp4"
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=black:s=32x32:r=10:d=1 \
  -an -c:v libx264 -pix_fmt yuv420p -y "$fixture_dir/tail-moov.mp4"
ffmpeg -hide_banner -loglevel error -f lavfi -i anullsrc=r=8000:cl=mono -t 1 \
  -c:a aac -b:a 16k -movflags +faststart -y "$fixture_dir/audio.m4a"
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=black:s=32x32:r=10:d=1 \
  -an -c:v libx264 -pix_fmt yuv420p -movflags frag_keyframe+empty_moov \
  -y "$fixture_dir/fragmented.mp4"

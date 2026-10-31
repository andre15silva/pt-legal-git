#!/bin/bash
# The full reel: intro card, the seven clips, end card, each fading in and out.
set -e
cd "$(dirname "$0")/out"
mkdir -p reel
enc=(-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30)
clips=(1-constituicao 2-alteracoes 3-quem-fez-lei 4-origem 5-quem-fez-cada-alteracao 6-historias 7-no-parlamento)
card() { ffmpeg -loglevel error -y -loop 1 -t "$2" -i "$1.png" -vf "scale=1920:1080,fade=in:0:9,fade=out:st=$(echo "$2-0.3" | bc):d=0.3" "${enc[@]}" "reel/$1.mp4"; }
clip() {
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1.mp4")
  ffmpeg -loglevel error -y -i "$1.mp4" -vf "fade=in:0:6,fade=out:st=$(echo "$d-0.25" | bc):d=0.25" "${enc[@]}" "reel/$1.mp4"
}
card card-intro 3.5
for c in "${clips[@]}"; do clip "$c"; done
card card-fim 4
: > reel/lista.txt
for f in card-intro "${clips[@]}" card-fim; do echo "file '$f.mp4'" >> reel/lista.txt; done
ffmpeg -loglevel error -y -f concat -safe 0 -i reel/lista.txt -c copy -movflags +faststart redacao-demo.mp4
ffprobe -v error -show_entries format=duration,size -of default=nw=1 redacao-demo.mp4

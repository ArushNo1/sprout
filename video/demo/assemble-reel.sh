#!/usr/bin/env bash
# Builds renders/graphics-reel.mp4: every graphic in script order, with labelled slates
# where your screen recordings go. Overlays (G07, G08, G13) sit on top of their slate.
# Run after rendering every scene into renders/.
set -euo pipefail
cd "$(dirname "$0")"
R=renders
T=$(mktemp -d)
FONT=assets/InstrumentSerif-Italic.ttf

slate() { # slate <seconds> <label> <out>
  ffmpeg -v error -y -f lavfi -i "color=c=0x2f3a32:s=1920x1080:r=30:d=$1" \
    -vf "drawtext=fontfile=$FONT:text='Screen recording\: $2':fontcolor=0xf4eadf:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=fontfile=$FONT:text='%{eif\:t+$4\:d}s':fontcolor=0xa4d7a2:fontsize=40:x=(w-text_w)/2:y=h/2+60" \
    -c:v libx264 -pix_fmt yuv420p -crf 18 "$3"
}
full() { ffmpeg -v error -y -i "$R/$1.mp4" -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -an "$2"; }
over() { # over <id> <seconds> <label> <out> <reel start>
  slate "$2" "$3" "$T/base.mp4" "$5"
  ffmpeg -v error -y -i "$T/base.mp4" -i "$R/$1.mov" -filter_complex "[0][1]overlay=0:0:shortest=1,format=yuv420p" \
    -c:v libx264 -crf 18 -r 30 "$4"
}

n=0; add() { n=$((n+1)); printf "file '%s'\n" "$1" >> "$T/list.txt"; }
seg() { echo "$T/$(printf %02d $n).mp4"; }

for id in G01 G02 G03 G04 G05 G06; do o=$(seg); full $id "$o"; add "$o"; done
o=$(seg); slate 2 "syllabus submission" "$o" 72; add "$o"
o=$(seg); over G07 12 "concept map appears" "$o" 74; add "$o"
o=$(seg); over G08 8 "tap Looks right" "$o" 86; add "$o"
for id in G09 G10 G11 G12; do o=$(seg); full $id "$o"; add "$o"; done
o=$(seg); slate 4 "close chat, open a new one" "$o" 160; add "$o"
o=$(seg); over G13 14 "welcome-back card" "$o" 164; add "$o"
o=$(seg); slate 8 "multiplayer host and player" "$o" 178; add "$o"
o=$(seg); full G14 "$o"; add "$o"
o=$(seg); slate 4 "leaderboard" "$o" 204; add "$o"
for id in G15 G16; do o=$(seg); full $id "$o"; add "$o"; done

ffmpeg -v error -y -f concat -safe 0 -i "$T/list.txt" -c copy "$R/graphics-reel.mp4"
rm -rf "$T"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$R/graphics-reel.mp4"

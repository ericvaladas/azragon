#!/usr/bin/env bash
# Encodes the WAV masters (kept outside the repo) to the AAC files the game ships.
# Main 1 is cut after its final hit and a short part of its reverb tail (end point tuned by ear).
# Usage: scripts/encode-music.sh [masters dir, default ..]
set -euo pipefail
SRC="${1:-..}"
OUT="public/cdn-assets/audio"
MAIN1_END=207.9
MAIN1_FADE=0.3
mkdir -p "$OUT"
enc() { ffmpeg -hide_banner -loglevel error -y -i "$1" "${@:3}" -c:a aac -b:a 128k -movflags +faststart "$OUT/$2"; }
enc "$SRC/Intro.wav" intro.m4a
enc "$SRC/Main gameplay 1.wav" main1.m4a -t "$MAIN1_END" -af "afade=t=out:st=$(echo "$MAIN1_END - $MAIN1_FADE" | bc):d=$MAIN1_FADE"
ls -l "$OUT"

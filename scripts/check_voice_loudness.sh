#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <audio-or-video-file>"
  exit 1
fi

INPUT="$1"

if [[ ! -f "$INPUT" ]]; then
  echo "File not found: $INPUT"
  exit 1
fi

echo "Analyzing loudness for: $INPUT"
ffmpeg -hide_banner -i "$INPUT" -af "loudnorm=I=-16:TP=-3:LRA=11:print_format=summary" -f null - 2>&1 \
  | sed -n '/Input Integrated:/,/Target Offset:/p'

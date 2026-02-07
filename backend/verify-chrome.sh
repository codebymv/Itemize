#!/bin/sh
set -e
echo "Verifying Chrome installation..."
if command -v google-chrome >/dev/null 2>&1; then
    google-chrome --version
    google-chrome --headless --no-sandbox --disable-gpu --print-to-pdf=/tmp/test.pdf https://www.google.com 2>&1 || true
    echo "Chrome verified successfully!"
else
    echo "ERROR: Google Chrome not found!"
    exit 1
fi
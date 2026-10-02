#!/bin/sh
# Rebuilds five-a-day.html (the single-file page) from its sources.
cd "$(dirname "$0")"
{ cat shell.html; echo '<script>'; cat data.js app.js; echo '</script>'; } > five-a-day.html

#!/usr/bin/env python3
"""FUEL palette migration — replaces legacy BK/Zomato hexes with FUEL tokens.
Neutral grays and already-FUEL colors are left untouched. Skin-only change."""
import re, glob, os

MOBILE_MAP = {
    '#502314': '#15140F', '#2c2c3e': '#15140F', '#1c1c2e': '#15140F',
    '#d62300': '#15140F', '#e23744': '#15140F', '#ff8732': '#15140F',
    '#ff6b35': '#15140F',
    '#f5ebdc': '#F4F1E9', '#8b6f61': '#6B6A5E', '#e8ddd4': '#E6E1D4',
    '#509e2f': '#3FA34D', '#267e3e': '#3FA34D', '#4caf50': '#3FA34D',
    '#6db84d': '#5E9E4E',
    '#ff9f0a': '#D69A35', '#ff6b6b': '#C0392B',
    '#5b5fe0': '#5E97B8', '#2f6f8f': '#5E97B8', '#ff6b9d': '#C77DA0',
    '#fde8e4': '#F1E7E1', '#fed7d7': '#F1E7E1', '#fce4ec': '#F1E7E1',
    '#fff5f5': '#F7F4EC', '#fff0e0': '#F2EEE0', '#fff9f0': '#F7F4EC',
    '#fff8f0': '#F7F4EC', '#fff3e0': '#F2EEE0',
    '#e8f5e1': '#EAF2DD', '#e8f5e9': '#EAF2DD', '#f0fff4': '#F1F7E9',
    '#c6f6d5': '#D8ECC0',
    '#f0f0ff': '#EEF1EC', '#f8f5ff': '#F7F4EC', '#f0eeff': '#EEF1EC',
    '#f0e8ff': '#EEF1EC', '#e8e0ff': '#E6E1D4', '#f0f0f5': '#EEF1EC',
    '#ede7f6': '#EEF1EC', '#e8eaf6': '#EEF1EC',
    '#d4c4b0': '#CFC8B8', '#c4a99a': '#CFCBBE', '#c4a882': '#CFC8B8',
}

WEB_MAP = {
    '#e23744': '#15140F', '#5b5fe0': '#15140F', '#1c1c2e': '#15140F',
    '#9c27b0': '#15140F',
    '#267e3e': '#3FA34D', '#4caf50': '#3FA34D',
    '#ff9f0a': '#D69A35', '#e65100': '#9A6E1E', '#ff6b6b': '#C0392B',
    '#00bcd4': '#5E97B8', '#795548': '#26251D', '#5b6b2e': '#A6D62E',
    '#fde8ea': '#F1E7E1', '#fdecec': '#F1E7E1', '#fff3e0': '#F2EEE0',
    '#e8f5e9': '#EAF2DD', '#f0fff4': '#F1F7E9', '#f0f7e0': '#EAF2DD',
    '#f8f5ff': '#F7F4EC',
}

def migrate(globpat, mapping):
    total = 0
    for path in glob.glob(globpat, recursive=True):
        with open(path) as f:
            src = f.read()
        orig = src
        for old, new in mapping.items():
            src = re.sub(re.escape(old), new, src, flags=re.IGNORECASE)
        if src != orig:
            with open(path, 'w') as f:
                f.write(src)
            total += 1
            print(f"  updated {path}")
    return total

print("== mobile ==")
m = migrate('/app/frontend/app/**/*.tsx', MOBILE_MAP)
print(f"mobile files changed: {m}")
print("== web-panel ==")
w = migrate('/app/web-panel/src/**/*.tsx', WEB_MAP)
print(f"web-panel files changed: {w}")

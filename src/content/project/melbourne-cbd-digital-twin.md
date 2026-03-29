---
title: Melbourne CBD Digital Twin
url: cbd
description: Live 3D visualisation of Melbourne CBD — tram positions, pedestrian density, urban heat, and air quality. Zero-server, zero-egress architecture targeting $1/month at 1,000 users/day.
author: Alan Huynh
tags: project
image: /assets/images/cbd-preview.jpg
---

A real-time 3D digital twin of Melbourne CBD built on CesiumJS, deck.gl, and pure public data. No server runs between data fetches — GitHub Actions cron jobs ingest GTFS-RT tram positions, pedestrian sensor counts, BOM weather, and EPA air quality, writing flat JSON to Cloudflare R2 every five minutes. The browser fetches, diffs, and renders only what changed.

## Stack

- **3D renderer**: CesiumJS with OSM Buildings and world terrain
- **Data overlay**: deck.gl IconLayer (trams) + HeatmapLayer (pedestrian density)
- **Storage**: Cloudflare R2 — zero egress fees
- **Frontend**: React 19 + Vite, served via Cloudflare Pages
- **Ingestion**: GitHub Actions cron, ~1,728 min/month of free tier

## Cost model

| Service | Free tier | Usage |
|---|---|---|
| Cloudflare R2 | 10 GB storage, zero egress | ~5 GB tiles, ~3 TB/month transfer |
| Cloudflare Pages | Unlimited bandwidth | Full site delivery |
| GitHub Actions | 2,000 min/month | ~1,728 min/month |
| Domain | — | ~$1/month |

**Total: ~$1/month.** AWS S3 at equivalent usage would cost ~$255/month in egress alone.

## Architecture

Three independent layers: static geospatial assets (processed once, cached aggressively), live feed ingestion (GitHub Actions → R2), and a browser-side renderer that polls R2 every 30 seconds and updates only what changed. DuckDB-WASM handles analytical queries entirely in the browser with no backend required.

[View live →](/cbd/)

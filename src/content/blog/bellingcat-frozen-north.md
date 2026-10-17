---
title: My First Bellingcat Challenge, "The Frozen North"
url: bellingcat-frozen-north
description: How I used shadow angles, sun azimuth, snow cover, and Sentinel-2
  to solve my first Bellingcat Expert
  challenge.
author: Alan Huynh
date: 2025-10-17T12:00:00.000Z
image: /assets/images/blog/bellingcat-frozen-north/challenge-satellite-image.jpg
imageAlt: Satellite image of a snowy coastal area with a lake, islands, and a vessel near a port
tags:
  - osint
  - satellite-imagery
  - geospatial
---

After a project digging up Hatsuki Yura’s career dating back to two decades ago from dead blogs, Wayback Machine, the lot (I’ll write about that another time), I got a taste for archaeological, detective-style work. I still hadn’t really heard of OSINT until this morning, when I lurked on Reddit and found out what Bellingcat is. People using public information to solve problems, exactly what I'm longing for. And better yet, they publish challenges I can try, so what would I be waiting for? Straight to the site I went.

They have a lot of challenges. And with me being me, I filtered by Expert Challenge and picked the very first one.

## The challenge

It’s a satellite imagery puzzle: find the IMO number of a vessel from a random image. Which is great, because I spent two and a half years of my career on satellite imagery in ML work.

![The challenge image: a coastal satellite scene with a lake containing two small islands to the northwest, a smaller lake to the northeast, snow on the ground, and a vessel near the port](/assets/images/blog/bellingcat-frozen-north/challenge-satellite-image.jpg)

First step is getting the image onto my machine and checking EXIF and anything else I can find. At Expert level I wouldn’t expect much, and I didn’t get much. But the download filename was `20220901_091318.png` which is... still not much, but it's way more than nothing!

If that’s true (and that’s a big if, if it’s wrong this gets much harder, and knowing it’s Expert level I braced for that), the image was taken on 1 September 2022 at 09:13 UTC.

Assuming north is up like usual satellite imagery, this is a south-east facing port (another big if) with a vessel. Useful features in the scene:

- A lake with two smaller islands in it on the north-west side
- Another smaller lake on the north-east side of the port
- Snow on the surface, but not full cover
- And on zoom a road on the left of the north-west lake, and some buildings on the left of the north-east lake

## Cheese

I tried cheesing it with online reverse geolocation tools. They pointed at Sweden and Antarctica. On inspection, neither fits.

The bias of the difficulty told me that shouldn’t be that easy, so I started doing the physics-y work.

## Shadow angle and azimuth

Import the image to Canva (very professional, I know) and use the angle of a line drawn against a building shadow on the left of the north-east lake.

![Shadow measurement in Canva lol](/assets/images/blog/bellingcat-frozen-north/shadow-angle-canva.jpg)

That shadow angle seems to be about 10° checked with another building, which puts the sun azimuth around 190°.

I already had a date and time from the filename. With sun azimuth ~190° at 09:13 UTC on 1 Sep 2022, I dropped into suncalc.org and worked out roughly where the sun had to be for the shadows to fall that way.

![SunCalc for 1 Sep 2022, 09:13 UTC](/assets/images/blog/bellingcat-frozen-north/suncalc-azimuth.jpg)

![Just me triangulate the thing](/assets/images/blog/bellingcat-frozen-north/suncalc-longitude-east.jpg)

That points us at roughly 50°E longitude. To be safe I used a 45–55°E band for the search later.
![Should be around here!](/assets/images/blog/bellingcat-frozen-north/suncalc-final.jpeg)

## The latitude

Since it should be in the northern hemisphere, and there’s snow. I pulled up a snow cover map for 1 September around that region, and that gives us the island groups of Arkhangelsk Oblast.

![Snow cover map over the Arctic on 1 September 2022, highlighting island groups in the Barents/Kara Sea region](/assets/images/blog/bellingcat-frozen-north/snow-cover-ventusky.jpg)

Based on the azimuth estimate I’d focus on the west side of the archipelagos, but just in case, both the Novaya Zemlya and the Franz Josef Land will be used in the search since the azimuth is an estimate, and further west or east is open water anyway, so searching those two island groups is a safe box.

![Search box drawn over Novaya Zemlya and Franz Josef Land between the estimated longitudes](/assets/images/blog/bellingcat-frozen-north/search-box-archipelagos.jpg)

## Finding it in Sentinel-2

Here I used Sentinel-2 via the Copernicus Browser, since you can specify a day range and the quality is good too, unlike Google Earth / Map. After about half an hour checking any piece of land with a southern coast, we found it, you can even see the vessel.

The island is home to Nagurskoye, a Russian military airfield in Franz Josef Land. Coordinates came out around 80.78°N, 47.67°E.

![Sentinel-2 view of Nagurskoye on Franz Josef Land, with the vessel visible off the southern coast](/assets/images/blog/bellingcat-frozen-north/nagurskoye-sentinel2.jpg)

## Vessel to IMO

Then I used the Global Fishing Watch map and narrowed the time window. Only one vessel in that area.

That gives us the IMO for the challenge!

![Global Fishing Watch vessel record for Mekhanik Pyatlin showing IMO 8904434](/assets/images/blog/bellingcat-frozen-north/global-fishing-watch-vessel.jpg)

## In the end
It's pretty fun, same tools I use but pointed at a puzzle instead of a model. I’m definitely trying another challenge soon :D

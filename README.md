# TensorFlow Camera Object Detector

A browser-based object detection app built with Vite, TensorFlow.js, and the COCO-SSD model. It opens the computer camera, detects common objects in real time, draws bounding boxes over the live feed, and lists detected objects with confidence scores.

## Features

- Live camera access through `getUserMedia`
- TensorFlow.js object detection with `@tensorflow-models/coco-ssd`
- Bounding boxes and confidence labels drawn on a canvas overlay
- Adjustable minimum confidence threshold
- Start, stop, and camera-switch controls
- Responsive layout for desktop and mobile browsers

## Local Development

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. The app must run from `localhost`, `127.0.0.1`, or HTTPS for browser camera access.

## Production Build

```bash
npm run build
```

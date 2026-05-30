import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import replaceElement from 'lucide/dist/esm/replaceElement.js';
import Camera from 'lucide/dist/esm/icons/camera.js';
import CircleStop from 'lucide/dist/esm/icons/circle-stop.js';
import LoaderCircle from 'lucide/dist/esm/icons/loader-circle.js';
import Play from 'lucide/dist/esm/icons/play.js';
import RotateCcw from 'lucide/dist/esm/icons/rotate-ccw.js';
import ScanSearch from 'lucide/dist/esm/icons/scan-search.js';
import Settings2 from 'lucide/dist/esm/icons/settings-2.js';
import './styles.css';

const icons = {
  Camera,
  CircleStop,
  LoaderCircle,
  Play,
  RotateCcw,
  ScanSearch,
  Settings2,
};

replaceElement(document.querySelector('[data-lucide="scan-search"]'), {
  nameAttr: 'data-lucide',
  icons,
  attrs: { width: 24, height: 24, 'stroke-width': 1.8 },
});

document.querySelectorAll('[data-icon]').forEach((element) => {
  replaceElement(element, {
    nameAttr: 'data-icon',
    icons,
    attrs: { width: 18, height: 18, 'stroke-width': 1.9 },
  });
});

const state = {
  model: null,
  stream: null,
  animationFrame: null,
  running: false,
  facingMode: 'environment',
  confidence: 0.55,
  lastPredictions: [],
};

const elements = {
  video: document.querySelector('#cameraFeed'),
  overlay: document.querySelector('#overlay'),
  startButton: document.querySelector('#startButton'),
  stopButton: document.querySelector('#stopButton'),
  flipButton: document.querySelector('#flipButton'),
  status: document.querySelector('#statusText'),
  modelStatus: document.querySelector('#modelStatus'),
  cameraStatus: document.querySelector('#cameraStatus'),
  objectCount: document.querySelector('#objectCount'),
  fps: document.querySelector('#fps'),
  confidence: document.querySelector('#confidence'),
  confidenceValue: document.querySelector('#confidenceValue'),
  detectionList: document.querySelector('#detectionList'),
  emptyState: document.querySelector('#emptyState'),
};

const context = elements.overlay.getContext('2d');

function setStatus(message, tone = 'idle') {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function setBusy(button, isBusy) {
  button.disabled = isBusy;
  button.classList.toggle('loading', isBusy);
}

async function loadModel() {
  if (state.model) return state.model;

  elements.modelStatus.textContent = 'Loading';
  setStatus('Loading TensorFlow model...', 'loading');
  setBusy(elements.startButton, true);

  state.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
  elements.modelStatus.textContent = 'Ready';
  setStatus('Model ready. Start the camera to detect objects.', 'ready');
  setBusy(elements.startButton, false);
  return state.model;
}

async function startCamera() {
  await loadModel();

  stopCamera(false);
  setStatus('Requesting camera access...', 'loading');
  elements.cameraStatus.textContent = 'Opening';

  const constraints = {
    audio: false,
    video: {
      facingMode: state.facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };

  state.stream = await navigator.mediaDevices.getUserMedia(constraints);
  elements.video.srcObject = state.stream;
  await elements.video.play();

  state.running = true;
  document.body.classList.add('camera-live');
  elements.startButton.disabled = true;
  elements.stopButton.disabled = false;
  elements.flipButton.disabled = false;
  elements.cameraStatus.textContent = 'Live';
  setStatus('Scanning live camera feed.', 'ready');
  detectFrame();
}

function stopCamera(clearStatus = true) {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }

  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  state.running = false;
  document.body.classList.remove('camera-live');
  elements.video.pause();
  elements.video.srcObject = null;
  elements.startButton.disabled = false;
  elements.stopButton.disabled = true;
  elements.flipButton.disabled = !state.model;
  elements.cameraStatus.textContent = 'Off';
  elements.fps.textContent = '0';
  state.lastPredictions = [];
  drawPredictions([]);
  updateDetectionList([]);

  if (clearStatus) {
    setStatus('Camera stopped.', 'idle');
  }
}

async function flipCamera() {
  state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
  if (state.running) {
    await startCamera();
  }
}

async function detectFrame() {
  if (!state.running || !state.model) return;

  const start = performance.now();
  const predictions = await state.model.detect(elements.video);
  const filtered = predictions.filter((prediction) => prediction.score >= state.confidence);
  const elapsed = performance.now() - start;

  state.lastPredictions = filtered;
  elements.fps.textContent = Math.max(1, Math.round(1000 / elapsed)).toString();
  elements.objectCount.textContent = filtered.length.toString();
  drawPredictions(filtered);
  updateDetectionList(filtered);

  state.animationFrame = requestAnimationFrame(detectFrame);
}

function syncCanvasSize() {
  const { videoWidth, videoHeight } = elements.video;
  if (!videoWidth || !videoHeight) return false;

  if (elements.overlay.width !== videoWidth || elements.overlay.height !== videoHeight) {
    elements.overlay.width = videoWidth;
    elements.overlay.height = videoHeight;
  }

  return true;
}

function drawPredictions(predictions) {
  if (!syncCanvasSize()) {
    context.clearRect(0, 0, elements.overlay.width, elements.overlay.height);
    return;
  }

  context.clearRect(0, 0, elements.overlay.width, elements.overlay.height);
  context.lineWidth = Math.max(3, elements.overlay.width / 420);
  context.textBaseline = 'top';
  context.font = `${Math.max(16, Math.round(elements.overlay.width / 54))}px Inter, system-ui, sans-serif`;

  predictions.forEach((prediction, index) => {
    const [x, y, width, height] = prediction.bbox;
    const label = `${prediction.class} ${Math.round(prediction.score * 100)}%`;
    const hue = (index * 47 + 184) % 360;
    const color = `hsl(${hue} 84% 56%)`;
    const labelWidth = context.measureText(label).width + 18;
    const labelHeight = Math.max(28, elements.overlay.width / 32);
    const labelY = Math.max(0, y - labelHeight);

    context.strokeStyle = color;
    context.fillStyle = color;
    context.strokeRect(x, y, width, height);
    context.fillRect(x, labelY, labelWidth, labelHeight);
    context.fillStyle = '#061014';
    context.fillText(label, x + 9, labelY + 6);
  });
}

function updateDetectionList(predictions) {
  elements.emptyState.hidden = predictions.length > 0;
  elements.detectionList.innerHTML = '';

  predictions.slice(0, 8).forEach((prediction) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    const confidence = document.createElement('strong');

    name.textContent = prediction.class;
    confidence.textContent = `${Math.round(prediction.score * 100)}%`;
    item.append(name, confidence);
    elements.detectionList.append(item);
  });
}

function updateConfidence(value) {
  state.confidence = Number(value) / 100;
  elements.confidenceValue.textContent = `${value}%`;
  const filtered = state.lastPredictions.filter((prediction) => prediction.score >= state.confidence);
  drawPredictions(filtered);
  updateDetectionList(filtered);
  elements.objectCount.textContent = filtered.length.toString();
}

async function withErrorHandling(action) {
  try {
    await action();
  } catch (error) {
    stopCamera(false);
    elements.modelStatus.textContent = state.model ? 'Ready' : 'Failed';
    const message =
      error?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access and try again.'
        : error?.message || 'Something went wrong while starting detection.';
    setStatus(message, 'error');
  } finally {
    setBusy(elements.startButton, false);
  }
}

elements.startButton.addEventListener('click', () => withErrorHandling(startCamera));
elements.stopButton.addEventListener('click', () => stopCamera());
elements.flipButton.addEventListener('click', () => withErrorHandling(flipCamera));
elements.confidence.addEventListener('input', (event) => updateConfidence(event.target.value));

if (!navigator.mediaDevices?.getUserMedia) {
  elements.startButton.disabled = true;
  setStatus('This browser does not support camera access.', 'error');
} else {
  loadModel().catch((error) => {
    elements.modelStatus.textContent = 'Failed';
    setStatus(error?.message || 'Could not load the TensorFlow model.', 'error');
    elements.startButton.disabled = true;
  });
}

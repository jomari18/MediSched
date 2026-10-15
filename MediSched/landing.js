// Decorative only: this module never reads forms, Auth sessions or patient data.
export const SCENE_URL = 'https://prod.spline.design/lL8ek7tP5fWSrnlq/scene.splinecode';
const RUNTIME_MODULE = 'https://unpkg.com/@splinetool/runtime@2.0.75/build/runtime.js';
export function sceneAllowed({
  reducedMotion = false,
  mobile = false,
  saveData = false,
  hidden = false,
  paused = false
} = {}) {
  return !reducedMotion && !mobile && !saveData && !hidden && !paused;
}

export function initializeLanding({ loadRuntime = () => import(RUNTIME_MODULE) } = {}) {
  const stage = document.getElementById('sceneStage');
  if (!stage) return;
  const host = document.getElementById('sceneHost'),
    message = document.getElementById('sceneStatus');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'),
    mobile = matchMedia('(max-width: 767px)'),
    connection = navigator.connection;
  let application = null,
    pendingApplication = null,
    generation = 0,
    timer = null,
    failed = false,
    pointerInside = false;
  function dispose(instance) {
    try {
      instance?.dispose();
    } catch {
      /* A failed renderer must not prevent the static fallback. */
    }
  }
  function removeScene() {
    ++generation;
    clearTimeout(timer);
    timer = null;
    const active = application,
      loading = pendingApplication;
    application = null;
    pendingApplication = null;
    dispose(active);
    if (loading !== active) dispose(loading);
    host.replaceChildren();
    stage.dataset.state = 'static';
    stage.removeAttribute('aria-busy');
  }
  function unavailable() {
    removeScene();
    failed = true;
    stage.dataset.state = 'fallback';
    message.textContent = 'The 3D view is unavailable. You can still sign in.';
  }
  async function update() {
    removeScene();
    if (
      !sceneAllowed({
        reducedMotion: reduced.matches,
        mobile: mobile.matches,
        saveData: connection?.saveData,
        hidden: document.hidden
      })
    ) {
      message.textContent = reduced.matches
        ? 'Still view · reduced motion'
        : mobile.matches || connection?.saveData
          ? 'Lightweight view'
          : '3D view paused while away';
      return;
    }
    if (failed) {
      unavailable();
      return;
    }
    const current = generation;
    stage.dataset.state = 'loading';
    stage.setAttribute('aria-busy', 'true');
    message.textContent = 'Loading the 3D view…';
    timer = setTimeout(() => {
      if (current === generation) unavailable();
    }, 15000);
    let candidate = null;
    try {
      const { Application } = await loadRuntime();
      if (current !== generation) return;
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('tabindex', '-1');
      canvas.addEventListener('webglcontextlost', () => {
        if (current === generation) unavailable();
      });
      host.append(canvas);
      // Prefer the established WebGL pipeline: WebGPU teardown emitted GPU errors
      // on Windows. HTML authored inside the decorative scene is not displayed.
      candidate = new Application(canvas, { renderer: 'webgl', htmlContentMode: 'none' });
      pendingApplication = candidate;
      await candidate.load(SCENE_URL);
      if (current !== generation) {
        dispose(candidate);
        return;
      }
      // The licensed reference includes demo navigation/text. Hide that named
      // artwork group, keeping the interactive cubes and Spline branding intact.
      const demoUI = candidate.findObjectByName('UI');
      if (demoUI) demoUI.visible = false;
      pendingApplication = null;
      application = candidate;
      candidate = null;
      if (!pointerInside) application.stop();
      clearTimeout(timer);
      stage.dataset.state = 'ready';
      stage.removeAttribute('aria-busy');
      message.textContent = '';
    } catch {
      if (pendingApplication === candidate) pendingApplication = null;
      dispose(candidate);
      if (current === generation) unavailable();
    }
  }
  stage.addEventListener('pointerenter', () => {
    pointerInside = true;
    application?.play();
  });
  stage.addEventListener('pointerleave', () => {
    pointerInside = false;
    application?.stop();
  });
  reduced.addEventListener('change', update);
  mobile.addEventListener('change', update);
  connection?.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pagehide', removeScene);
  update();
}
if (typeof document !== 'undefined') initializeLanding();

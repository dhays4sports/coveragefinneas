(function (global) {
  'use strict';

  var VERSION = '0.2.0';
  var REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

  function getMediaQuery() {
    if (!global || typeof global.matchMedia !== 'function') return null;
    try { return global.matchMedia(REDUCED_MOTION_QUERY); } catch (error) { return null; }
  }

  function prefersReducedMotion() {
    var query = getMediaQuery();
    return Boolean(query && query.matches);
  }

  function getDuration(name) {
    if (prefersReducedMotion()) return 0;
    var durations = {
      instant: 0,
      fast: 160,
      normal: 220,
      slow: 320
    };
    return Object.prototype.hasOwnProperty.call(durations, name) ? durations[name] : durations.normal;
  }

  function nextFrame(callback) {
    if (typeof callback !== 'function') return function () {};
    var cancelled = false;
    var schedule = global && typeof global.requestAnimationFrame === 'function'
      ? global.requestAnimationFrame.bind(global)
      : function (fn) { return global && typeof global.setTimeout === 'function' ? global.setTimeout(fn, 0) : (fn(), 0); };
    var cancel = global && typeof global.cancelAnimationFrame === 'function'
      ? global.cancelAnimationFrame.bind(global)
      : function (id) { if (global && typeof global.clearTimeout === 'function') global.clearTimeout(id); };
    var id = schedule(function () { if (!cancelled) callback(); });
    return function () { cancelled = true; cancel(id); };
  }

  function wait(durationName) {
    var duration = typeof durationName === 'number' ? Math.max(0, durationName) : getDuration(durationName);
    if (!global || typeof global.Promise !== 'function') return null;
    return new global.Promise(function (resolve) {
      if (!duration || typeof global.setTimeout !== 'function') { resolve(); return; }
      global.setTimeout(resolve, duration);
    });
  }


  var classTimers = typeof global.WeakMap === 'function' ? new global.WeakMap() : null;

  function getTimerBucket(element) {
    if (!element || !classTimers) return null;
    var bucket = classTimers.get(element);
    if (!bucket) { bucket = {}; classTimers.set(element, bucket); }
    return bucket;
  }

  function cancelClassCleanup(element, className) {
    var bucket = getTimerBucket(element);
    if (!bucket || !bucket[className]) return false;
    if (global && typeof global.clearTimeout === 'function') global.clearTimeout(bucket[className]);
    delete bucket[className];
    return true;
  }

  function scheduleClassCleanup(element, className, durationName, buffer) {
    if (!element || !className) return function () {};
    cancelClassCleanup(element, className);
    var duration = typeof durationName === 'number' ? Math.max(0, durationName) : getDuration(durationName);
    var delay = duration + Math.max(0, Number(buffer) || 0);
    if (!delay || !global || typeof global.setTimeout !== 'function') {
      element.classList && element.classList.remove && element.classList.remove(className);
      return function () {};
    }
    var bucket = getTimerBucket(element);
    var id = global.setTimeout(function () {
      element.classList && element.classList.remove && element.classList.remove(className);
      if (bucket) delete bucket[className];
    }, delay);
    if (bucket) bucket[className] = id;
    return function () { cancelClassCleanup(element, className); };
  }

  function restartClass(element, className, durationName, buffer) {
    if (!element || !className) return function () {};
    cancelClassCleanup(element, className);
    element.classList && element.classList.remove && element.classList.remove(className);
    if (typeof element.offsetWidth !== 'undefined') void element.offsetWidth;
    element.classList && element.classList.add && element.classList.add(className);
    return scheduleClassCleanup(element, className, durationName, buffer);
  }

  function onPreferenceChange(listener) {
    if (typeof listener !== 'function') return function () {};
    var query = getMediaQuery();
    if (!query) return function () {};
    var handler = function (event) { listener(Boolean(event.matches)); };
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handler);
      return function () { query.removeEventListener('change', handler); };
    }
    if (typeof query.addListener === 'function') {
      query.addListener(handler);
      return function () { query.removeListener(handler); };
    }
    return function () {};
  }

  global.CoverageFitWorkspaceMotion = Object.freeze({
    VERSION: VERSION,
    REDUCED_MOTION_QUERY: REDUCED_MOTION_QUERY,
    prefersReducedMotion: prefersReducedMotion,
    getDuration: getDuration,
    nextFrame: nextFrame,
    wait: wait,
    onPreferenceChange: onPreferenceChange,
    cancelClassCleanup: cancelClassCleanup,
    scheduleClassCleanup: scheduleClassCleanup,
    restartClass: restartClass
  });
})(typeof window !== 'undefined' ? window : globalThis);

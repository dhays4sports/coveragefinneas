(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.CoverageFitHomeBranchRecovery = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var BUILD = 'CF-HOME-2.9';
  var ACTIVE_WINDOW_MS = 30 * 60 * 1000;
  var TRANSITION_KEY = 'coveragefit_transition_v1';
  var PROFILE_KEY = 'coveragefit_prospect_profile_v1';
  var RECOVERY_ROUTE = 'https://408farmers.com/contact/?intent=renters&recovery=coveragefit_branch';

  function readJson(store, key) {
    try { return JSON.parse(store?.getItem?.(key) || 'null'); } catch (_) { return null; }
  }

  function clean(value, max) {
    return String(value || '').trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, max || 120);
  }

  function resolve(input, now) {
    var source = input && typeof input === 'object' ? input : {};
    var profile = source.profile || null;
    var context = source.context || null;
    var conversion = source.conversion || null;
    var transition = source.transition || null;
    var housing = clean(context?.journey?.housingContext || profile?.housingContext, 40).toLowerCase();
    var received = Date.parse(profile?.receivedAt || '');
    var currentTime = Number.isFinite(now) ? now : Date.now();
    var recent = Number.isFinite(received) && currentTime >= received && currentTime - received <= ACTIVE_WINDOW_MS;
    var trusted = Boolean(conversion?.flags?.isHomeHandoff);
    var active = Boolean(transition?.hasProfile || recent);
    var renter = housing === 'renter';
    return Object.freeze({
      active: trusted && active,
      trusted: trusted,
      housingContext: housing,
      branch: renter ? 'renter' : housing,
      shouldRecover: trusted && active && renter,
      destination: trusted && active && renter ? RECOVERY_ROUTE : '',
      containsPersonalData: false
    });
  }

  function current() {
    var profile = root.CoverageFitPrefill?.get?.()
      || readJson(root.sessionStorage, PROFILE_KEY)
      || readJson(root.localStorage, PROFILE_KEY);
    var context = root.CoverageFitPersonalization?.get?.() || null;
    var conversion = root.CoverageFitConversionHandoff?.get?.() || null;
    var transition = readJson(root.sessionStorage, TRANSITION_KEY);
    return resolve({ profile: profile, context: context, conversion: conversion, transition: transition });
  }

  function guard(options) {
    var settings = options || {};
    var result = settings.result || current();
    var pathname = clean(settings.pathname === undefined ? root.location?.pathname : settings.pathname, 120);
    var supportedPath = ['/transition', '/transition/', '/assessment', '/assessment/'].indexOf(pathname) !== -1;
    if (!result.shouldRecover || !supportedPath) return result;
    try {
      root.sessionStorage?.setItem?.('coveragefit_home_branch_recovery_v1', JSON.stringify({
        version: VERSION,
        build: BUILD,
        branch: 'renter',
        destination: '408farmers_renters_contact',
        createdAt: new Date().toISOString()
      }));
    } catch (_) {}
    if (settings.navigate !== false) {
      try { root.location.replace(result.destination); } catch (_) { if (root.location) root.location.href = result.destination; }
    }
    return result;
  }

  var api = Object.freeze({ VERSION: VERSION, BUILD: BUILD, ACTIVE_WINDOW_MS: ACTIVE_WINDOW_MS, RECOVERY_ROUTE: RECOVERY_ROUTE, resolve: resolve, current: current, guard: guard });
  if (root.document) guard();
  return api;
});

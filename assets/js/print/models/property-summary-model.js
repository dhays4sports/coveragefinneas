(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../consumer-language.js'));
  } else {
    root.CoverageFitPropertySummaryModel = factory(root.CoverageFitConsumerLanguage);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (consumerLanguage) {
  'use strict';

  const VERSION = '1.2.0';
  const SCHEMA_VERSION = 1;

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function text(value) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  }

  function finiteNumber(value) {
    if (value == null || value === '') return null;
    const normalized = typeof value === 'string' ? value.replace(/[$,%\s,]/g, '') : value;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function firstText() {
    for (let index = 0; index < arguments.length; index += 1) {
      const candidate = text(arguments[index]);
      if (candidate) return candidate;
    }
    return null;
  }

  function firstNumber() {
    for (let index = 0; index < arguments.length; index += 1) {
      const candidate = finiteNumber(arguments[index]);
      if (candidate != null) return candidate;
    }
    return null;
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    (Array.isArray(values) ? values : []).forEach(value => {
      const normalized = text(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(normalized);
    });
    return result;
  }

  function readerText(value) {
    return typeof consumerLanguage?.simplifySystemText === 'function'
      ? consumerLanguage.simplifySystemText(value)
      : text(value);
  }

  function splitAddress(address) {
    const raw = text(address);
    const result = { full: raw, street: null, city: null, state: null, zip: null };
    if (!raw) return result;

    const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
    if (parts.length >= 3) {
      result.street = parts.slice(0, -2).join(', ');
      result.city = parts[parts.length - 2];
      const stateZip = parts[parts.length - 1].match(/^([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
      if (stateZip) {
        result.state = stateZip[1].toUpperCase();
        result.zip = stateZip[2] || null;
      }
    }
    return result;
  }

  function riskHighlights(property) {
    const values = [];
    const explicit = property.riskHighlights || property.risks || property.highlights;
    if (Array.isArray(explicit)) {
      explicit.forEach(item => values.push(typeof item === 'object' ? item.title || item.label || item.message : item));
    }

    const quality = property.quality;
    if (quality && typeof quality === 'object') {
      const warnings = quality.warnings || quality.issues || quality.highlights;
      if (Array.isArray(warnings)) warnings.forEach(item => values.push(typeof item === 'object' ? item.message || item.label : item));
    }

    if (property.pool === true || String(property.pool).toLowerCase() === 'yes') values.push('Swimming pool details should be reviewed.');
    if (property.detachedStructures === true || String(property.detachedStructures).toLowerCase() === 'yes') values.push('Detached structures should be included in the home protection review.');
    if (property.roof) values.push(`Roof details reported: ${property.roof}.`);

    return uniqueStrings(values.map(readerText));
  }

  function create(printModel) {
    const source = printModel && typeof printModel === 'object' ? printModel : {};
    const property = source.propertySummary && typeof source.propertySummary === 'object' ? source.propertySummary : {};
    const coverage = property.coverage && typeof property.coverage === 'object' ? property.coverage : {};
    const parsedAddress = splitAddress(property.address);

    const model = {
      schemaVersion: SCHEMA_VERSION,
      modelVersion: VERSION,
      available: property.available !== false && Boolean(Object.keys(property).length),
      property: {
        address: firstText(property.address),
        street: firstText(property.street, property.streetAddress, parsedAddress.street),
        city: firstText(property.city, parsedAddress.city),
        state: firstText(property.state, parsedAddress.state),
        zip: firstText(property.zip, property.postalCode, parsedAddress.zip)
      },
      construction: {
        yearBuilt: firstNumber(property.yearBuilt),
        squareFeet: firstNumber(property.squareFeet, property.livingArea, property.livingAreaSqFt),
        stories: firstNumber(property.stories),
        constructionType: firstText(property.constructionType, property.construction),
        foundationType: firstText(property.foundationType, property.foundation),
        roof: firstText(property.roof)
      },
      coverage: {
        replacementCost: firstNumber(
          coverage.replacementCost,
          property.replacementCost,
          property.rebuildValue,
          property.dwellingLimit
        ),
        deductible: firstNumber(
          coverage.deductible,
          property.deductible,
          property.allOtherPerilsDeductible
        ),
        currentCarrier: firstText(
          coverage.currentCarrier,
          coverage.carrier,
          property.currentCarrier,
          property.carrier
        ),
        currentPremium: firstNumber(
          coverage.currentPremium,
          coverage.annualPremium,
          property.currentPremium,
          property.annualPremium
        ),
        renewalDate: firstText(
          coverage.renewalDate,
          coverage.expirationDate,
          property.renewalDate,
          property.expirationDate
        )
      },
      riskHighlights: riskHighlights(property),
      source: {
        printSchemaVersion: source.schemaVersion ?? null,
        printEngineVersion: firstText(source.engineVersion),
        generatedAt: firstText(source.generatedAt),
        confirmation: property.confirmation && typeof property.confirmation === 'object' ? property.confirmation : null
      }
    };

    return deepFreeze(model);
  }

  function hasContent(model) {
    if (!model || typeof model !== 'object') return false;
    return Boolean(
      model.property?.address ||
      model.construction?.yearBuilt != null ||
      model.construction?.squareFeet != null ||
      model.construction?.stories != null ||
      model.construction?.constructionType ||
      model.construction?.foundationType ||
      model.coverage?.replacementCost != null ||
      model.coverage?.deductible != null ||
      model.coverage?.currentCarrier ||
      (Array.isArray(model.riskHighlights) && model.riskHighlights.length)
    );
  }

  function getDiagnostics(model) {
    const warnings = [];
    if (!model?.property?.address) warnings.push('Property address is unavailable.');
    if (model?.construction?.yearBuilt == null) warnings.push('Year built is unavailable.');
    if (model?.construction?.squareFeet == null) warnings.push('Square footage is unavailable.');
    if (model?.coverage?.replacementCost == null) warnings.push('Replacement cost is unavailable.');
    if (model?.coverage?.deductible == null) warnings.push('Deductible is unavailable.');
    if (!model?.coverage?.currentCarrier) warnings.push('Current carrier is unavailable.');

    return deepFreeze({
      valid: hasContent(model),
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      warningCount: warnings.length,
      warnings
    });
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    create,
    hasContent,
    getDiagnostics
  });
});

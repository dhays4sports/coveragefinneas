window.COVERAGEFIT_CONFIG = {
  slug:"home",
  toolId:"review-tool",
  reportPath:"/home/report/",
  defaultName:"Homeowner",
  finalButtonLabel:"Build My Protection Snapshot",
  warningPoint:-12,
  scoreMethodology:{
    id:'coveragefit-protection-score-v1',
    version:'1.1.0',
    measure:'review-readiness-and-clarity',
    description:'A response-based measure of how clearly important home protection topics are understood, confirmed, or identified for licensed review. It is not a coverage adequacy determination.'
  },
  thresholds:{wellPrepared:85,strongFoundation:70,reviewRecommended:50},
  priority:{
    strong:"Confirm your current policy details with a licensed producer.",
    review:"Schedule a coverage review to examine the areas identified in your report.",
    weak:"Prioritize a licensed review of the higher-concern areas identified in your report."
  },
  results:{
    strong:{badge:"Strong Starting Point",badgeClass:"good",title:"Your answers suggest a stronger protection starting point.",copy:"Several important areas appear understood or addressed. Your personalized report will show what looks strong and what is still worth confirming in the actual policy."},
    review:{badge:"Review Recommended",badgeClass:"medium",title:"Your answers identify areas worth a closer look.",copy:"Your score is not a coverage determination. It is a conversation starter designed to help you focus a licensed review on the areas most likely to matter."},
    weak:{badge:"Higher Review Priority",badgeClass:"weak",title:"Your answers show several areas that deserve attention.",copy:"Your personalized report will organize the highest-priority topics so you can have a more productive conversation before a claim forces the issue."}
  },
  questions:[
    {key:"dwelling",category:"Rebuilding",construct:"review-recency",weight:16,title:"When was the rebuilding estimate for your home last reviewed using current construction details?",help:"Why we're asking: a rebuilding estimate can change after renovations, material-cost increases, or changes in local construction expenses. This question asks about the review process, not your home's market value.",answers:[
      {label:"Within the past two years",sub:"A producer or insurer reviewed it using current details about my home.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Dwelling Rebuilding Estimate",insight:"Your rebuilding estimate was reviewed recently using current home details.",question:"What assumptions and home features were used in my current rebuilding estimate?"},
      {label:"More than two years ago or before major updates",sub:"The home or construction environment may have changed since the review.",points:-8,scoreImpact:.5,impactLevel:"moderate",findingType:"consideration",tag:"Dwelling Rebuilding Estimate",insight:"Your rebuilding estimate may be ready for a current-information refresh.",question:"Can we update the rebuilding estimate using current construction costs and recent home improvements?"},
      {label:"I know the amount, but not how it was calculated",sub:"I have seen the limit but do not know the assumptions behind it.",points:-8,scoreImpact:.5,impactLevel:"moderate",findingType:"uncertainty",tag:"Dwelling Rebuilding Estimate",insight:"The rebuilding amount is known, but the calculation behind it has not been confirmed.",question:"How was my rebuilding estimate calculated, and which home characteristics were included?"},
      {label:"I do not know",sub:"I do not know the amount or when it was last reviewed.",points:-12,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Dwelling Rebuilding Estimate",insight:"Your current rebuilding amount and review history are unclear.",question:"What is my current rebuilding estimate, and when was it last updated?"}]},
    {key:"extendedReplacement",category:"Rebuilding",construct:"policy-term-verification",weight:8,title:"Which best describes what you know about protection above your stated dwelling limit if rebuilding costs rise after a major disaster?",help:"Why we're asking: some policies provide an additional percentage or amount above the dwelling limit, while others do not. The appropriate structure depends on the policy and property.",answers:[
      {label:"Included, and I know the amount or percentage",sub:"I have confirmed the provision and its basic conditions.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Additional Rebuilding Protection",insight:"You have confirmed the amount of additional rebuilding protection in your policy.",question:"What conditions or maximum amounts apply to my additional rebuilding protection?"},
      {label:"I believe it is included, but I do not know the amount",sub:"I have not confirmed the percentage, limit, or conditions.",points:-4,scoreImpact:.5,impactLevel:"moderate",findingType:"uncertainty",tag:"Additional Rebuilding Protection",insight:"Additional rebuilding protection may be included, but its amount and conditions are unconfirmed.",question:"What additional rebuilding protection is included, and what conditions apply?"},
      {label:"I confirmed it is not included",sub:"The policy does not provide an additional amount above the dwelling limit.",points:-4,scoreImpact:.5,impactLevel:"moderate",findingType:"consideration",tag:"Additional Rebuilding Protection",insight:"You report that additional rebuilding protection is not included, which is worth evaluating with the dwelling estimate and your risk tolerance.",question:"Given my rebuilding estimate and local cost volatility, should protection above the dwelling limit be considered?"},
      {label:"Not sure",sub:"I have not reviewed this policy term.",points:-6,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Additional Rebuilding Protection",insight:"You have not confirmed whether the policy provides protection above the dwelling limit.",question:"Does my policy provide protection above the dwelling limit, and how much?"}]},
    {key:"ordinanceLaw",category:"Rebuilding",construct:"policy-term-verification",weight:8,title:"Which best describes what you know about coverage for required building-code upgrades after a covered rebuilding loss?",help:"Why we're asking: a covered repair or rebuild can require electrical, plumbing, structural, or safety upgrades under current codes. This question does not assume a particular limit is appropriate.",answers:[
      {label:"Included, and I know the limit or percentage",sub:"I have confirmed the basic amount available.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Building-Code Upgrade Coverage",insight:"You have confirmed the amount of building-code upgrade coverage in your policy.",question:"Is that amount still appropriate for my home's age and local code requirements?"},
      {label:"I believe it is included, but I do not know the amount",sub:"I have not confirmed the limit or conditions.",points:-4,scoreImpact:.5,impactLevel:"moderate",findingType:"uncertainty",tag:"Building-Code Upgrade Coverage",insight:"Building-code upgrade coverage may be included, but its amount is unconfirmed.",question:"What building-code upgrade coverage is included, and what conditions apply?"},
      {label:"I confirmed it is not included",sub:"The policy does not provide a separate amount for required code upgrades.",points:-6,scoreImpact:.75,impactLevel:"material",findingType:"identified-gap",tag:"Building-Code Upgrade Coverage",insight:"You report that separate protection for required building-code upgrades is not included.",question:"How would required code upgrades be funded after a covered rebuilding loss?"},
      {label:"Not sure",sub:"I have not reviewed this policy term.",points:-6,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Building-Code Upgrade Coverage",insight:"You have not confirmed how the policy handles required building-code upgrades.",question:"What building-code upgrade coverage is included in my policy?"}]},
    {key:"water",category:"Water",construct:"policy-term-verification",weight:13,title:"Which best describes your understanding of how your policy handles common types of water loss?",help:"Why we're asking: sudden pipe damage, water backup, hidden leaks, seepage, and mitigation requirements can be handled differently. The goal is to identify what has and has not been confirmed.",answers:[
      {label:"I reviewed the main water-loss terms",sub:"I understand sudden water damage, backup or drain limits, major exclusions, and any separate deductible.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Water-Loss Terms",insight:"You have reviewed the main water-loss terms, limitations, and deductibles.",question:"Have any water-loss terms, deductibles, or mitigation requirements changed since my last review?"},
      {label:"I understand sudden water damage, but not the other details",sub:"Backup, hidden leak, seepage, or mitigation terms are still unclear.",points:-7,scoreImpact:.5,impactLevel:"moderate",findingType:"uncertainty",tag:"Water-Loss Terms",insight:"You understand the basic sudden-water provision, but other water-loss terms remain unclear.",question:"How does my policy handle backup, hidden leaks, seepage, and mitigation requirements?"},
      {label:"I know there may be a separate deductible or requirement",sub:"I have not confirmed the amount or conditions.",points:-7,scoreImpact:.5,impactLevel:"moderate",findingType:"uncertainty",tag:"Water-Loss Terms",insight:"A separate water deductible or mitigation requirement may apply, but the details are unconfirmed.",question:"Are there separate water deductibles or required protective devices, and when do they apply?"},
      {label:"I have not reviewed the water-loss terms",sub:"I do not know how the policy handles these situations.",points:-10,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Water-Loss Terms",insight:"The policy's treatment of common water losses has not been confirmed.",question:"Can we review sudden water damage, backup, hidden leaks, seepage, deductibles, and mitigation requirements?"}]},
    {key:"deductible",category:"Financial Readiness",construct:"financial-readiness",weight:10,title:"Which best describes your knowledge of your home deductibles and your ability to fund them after a covered loss?",help:"Why we're asking: policies can contain a standard deductible and separate deductibles for certain losses. This question considers both clarity and practical financial readiness.",answers:[
      {label:"I know the applicable deductibles and could fund the largest one",sub:"The amounts are clear and financially manageable.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Deductible Readiness",insight:"You know the applicable deductibles and report that the largest one is financially manageable.",question:"Have any separate deductibles changed since my last policy review?"},
      {label:"I know the main deductible, but not whether others apply",sub:"Separate water, wind, earthquake, or other deductibles may be unclear.",points:-5,scoreImpact:.5,impactLevel:"moderate",findingType:"uncertainty",tag:"Deductible Readiness",insight:"Your main deductible is known, but other applicable deductibles have not been confirmed.",question:"What deductibles can apply to my policy, and which would be the largest out-of-pocket amount?"},
      {label:"I know the amount, but paying it would cause financial strain",sub:"I could likely pay it, but doing so would disrupt my finances.",points:-8,scoreImpact:.75,impactLevel:"material",findingType:"identified-gap",tag:"Deductible Readiness",insight:"Your current deductible could create meaningful financial strain after a loss.",question:"Would another deductible structure better balance premium and out-of-pocket risk?"},
      {label:"I could not reasonably fund the deductible",sub:"I would struggle to access the amount after a loss.",points:-10,scoreImpact:1,impactLevel:"full",findingType:"identified-gap",tag:"Deductible Readiness",insight:"You report that the deductible would not be reasonably fundable after a loss.",question:"What deductible options could make a covered loss more financially manageable?"},
      {label:"I do not know the deductible amount or amounts",sub:"I have not confirmed the standard or separate deductibles.",points:-8,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Deductible Readiness",insight:"The applicable deductible amounts have not been confirmed.",question:"What standard and separate deductibles apply to my home policy?"}]},
    {key:"liability",category:"Liability",construct:"exposure-review",weight:13,title:"Which best describes how your personal liability limit was selected and reviewed?",help:"Why we're asking: an appropriate liability discussion considers the limit together with assets, income, household members, property features, drivers, activities, and risk tolerance. CoverageFit does not assume one dollar amount fits every household.",answers:[
      {label:"I know the limit, and it was reviewed against my current exposures",sub:"Assets, income, household, property, drivers, and activities were considered.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Personal Liability Review",insight:"Your liability limit was reviewed against your current household exposures.",question:"Have any assets, income, drivers, property features, or activities changed since that review?"},
      {label:"I know the limit, but it has not been reviewed recently",sub:"The amount may not reflect my current household or financial exposure.",points:-7,scoreImpact:.5,impactLevel:"moderate",findingType:"consideration",tag:"Personal Liability Review",insight:"Your liability limit is known but has not been compared with current household exposures recently.",question:"Can we compare my current liability limit with my assets, income, household, property, and activities?"},
      {label:"I believe the limit is $100,000 or less, and it has not been reviewed",sub:"The limit is known generally, but its fit has not been evaluated.",points:-10,scoreImpact:.75,impactLevel:"material",findingType:"consideration",tag:"Personal Liability Review",insight:"You report a liability limit of $100,000 or less that has not been evaluated against current exposures.",question:"What financial exposure could remain if a serious liability claim exceeds my current limit?"},
      {label:"I do not know my current limit",sub:"The amount and its relationship to my exposures are unclear.",points:-10,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Personal Liability Review",insight:"Your current personal liability limit has not been confirmed.",question:"What is my current personal liability limit, and how was it selected?"}]},
    {key:"personalProperty",category:"Property",construct:"policy-term-verification",weight:8,title:"Have you reviewed both how your belongings would be valued after a loss and whether valuable items have special limits?",help:"Why we're asking: replacement cost and depreciated value can produce different claim outcomes, while jewelry, art, electronics, collections, and other items may have special limits.",answers:[
      {label:"Yes, I reviewed both",sub:"I know the settlement method and have considered items with special limits.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Belongings and Valuable Items",insight:"You have reviewed both the settlement method for belongings and special limits for valuable items.",question:"Have any valuable items or household contents changed since that review?"},
      {label:"I know the settlement method, but have not reviewed valuable items",sub:"Special limits or scheduling needs may not reflect what I own today.",points:-4,scoreImpact:.5,impactLevel:"moderate",findingType:"consideration",tag:"Belongings and Valuable Items",insight:"The settlement method is known, but valuable-item limits have not been reviewed recently.",question:"Do any of my valuable items need separate limits, scheduling, or documentation?"},
      {label:"I reviewed valuable items, but not the settlement method",sub:"I do not know whether losses are settled at replacement cost or depreciated value.",points:-4,scoreImpact:.5,impactLevel:"moderate",findingType:"uncertainty",tag:"Belongings and Valuable Items",insight:"Valuable items were considered, but the loss-settlement method for general belongings is unclear.",question:"Does my policy settle personal property at replacement cost or depreciated value?"},
      {label:"I have not reviewed either",sub:"The settlement method and special limits are unclear.",points:-6,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Belongings and Valuable Items",insight:"The settlement method and special limits for valuable items have not been confirmed.",question:"How are my belongings valued after a loss, and what special limits apply?"}]},
    {key:"lossOfUse",category:"Recovery",construct:"policy-term-verification",weight:7,title:"Which best describes your understanding of temporary housing and additional living expense protection?",help:"Why we're asking: recovery after a covered loss can take months. The amount, time period, eligible expenses, and household needs all affect how useful this protection may be.",answers:[
      {label:"I know the amount or duration, and it was reviewed for my household",sub:"The available protection was compared with my household's likely recovery needs.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Temporary Living Expenses",insight:"Your temporary living-expense protection was reviewed against your household's needs.",question:"Would the current amount or duration still support my household in today's housing market?"},
      {label:"I know the amount or duration, but not whether it would be enough",sub:"The policy term is known, but its practical fit has not been reviewed.",points:-4,scoreImpact:.5,impactLevel:"moderate",findingType:"consideration",tag:"Temporary Living Expenses",insight:"The temporary living-expense term is known, but its practical fit has not been evaluated.",question:"How long could the current amount realistically support my household after a major loss?"},
      {label:"I know it is included, but not the amount or duration",sub:"The available limit or time period is unclear.",points:-4,scoreImpact:.5,impactLevel:"moderate",findingType:"uncertainty",tag:"Temporary Living Expenses",insight:"Temporary living-expense protection appears to be included, but the amount or duration is unconfirmed.",question:"What amount or time period applies, and which expenses qualify?"},
      {label:"I do not know",sub:"I have not reviewed this protection.",points:-5,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Temporary Living Expenses",insight:"The available temporary housing and added living-expense protection has not been confirmed.",question:"How much temporary living-expense protection is available and for how long?"}]},
    {key:"umbrella",category:"Liability",construct:"exposure-review",weight:4,title:"Has your need for an umbrella liability policy been reviewed based on your household and financial exposures?",help:"Why we're asking: an umbrella can provide an additional liability layer, but carrying one is not automatically appropriate for every household. The important issue is whether the decision was evaluated deliberately.",answers:[
      {label:"Yes, and I currently carry an umbrella",sub:"The policy was selected after reviewing my broader exposures.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Umbrella Liability Review",insight:"Your umbrella decision was reviewed and you currently carry additional liability protection.",question:"Are all underlying policies, drivers, properties, and activities coordinated with the umbrella?"},
      {label:"Yes, and I decided not to carry one at this time",sub:"My exposures were reviewed and the decision was intentional.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Umbrella Liability Review",insight:"Your umbrella need was reviewed and the current decision not to carry one was deliberate.",question:"Have my assets, income, drivers, properties, or activities changed since that decision?"},
      {label:"No, it has not been reviewed",sub:"I have not compared an umbrella with my current exposures.",points:-2,scoreImpact:.5,impactLevel:"moderate",findingType:"consideration",tag:"Umbrella Liability Review",insight:"Your need for an umbrella has not been evaluated against current household exposures.",question:"Do my assets, income, drivers, properties, or activities warrant an umbrella review?"},
      {label:"I am not sure what an umbrella covers",sub:"The purpose and relationship to home and auto liability are unclear.",points:-3,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Umbrella Liability Review",insight:"The purpose and scope of umbrella liability protection are unclear.",question:"How would an umbrella work with my home and auto liability limits?"}]},
    {key:"lifeEvents",category:"Life Changes",construct:"change-alignment",weight:6,title:"Since your last full insurance review, which statement best describes changes to your household, property, or how the home is used?",help:"Why we're asking: renovations, new household members, home-based work, rentals, trusts, ownership changes, major purchases, and other changes can affect what should be discussed in a licensed review.",answers:[
      {label:"No material changes",sub:"My household, ownership, property, and use of the home are generally unchanged.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Household and Property Changes",insight:"No material household, ownership, property, or use changes were identified since the last review.",question:"Are there any smaller changes that should still be documented at the next review?"},
      {label:"Changes occurred and were reviewed",sub:"I discussed the changes with a licensed professional.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Household and Property Changes",insight:"Recent household or property changes were discussed with a licensed professional.",question:"Were all affected home, auto, umbrella, life, or business policies updated as needed?"},
      {label:"Changes occurred but were not reviewed",sub:"My household, ownership, property, activities, or home use changed.",points:-5,scoreImpact:.75,impactLevel:"material",findingType:"identified-gap",tag:"Household and Property Changes",insight:"A reported household or property change has not yet been discussed in an insurance review.",question:"How should the reported changes affect my home and related protection?"},
      {label:"I am not sure when my last full review occurred",sub:"I cannot confirm whether later changes were evaluated.",points:-5,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Household and Property Changes",insight:"The timing and scope of your last full insurance review are unclear.",question:"When was my last full review, and what household or property changes have occurred since then?"}]},
    {key:"separatePerils",category:"Separate Hazards",construct:"exposure-review",weight:7,title:"Have you reviewed whether risks commonly handled separately from a standard home policy, such as earthquake or flood, are relevant to your property?",help:"Why we're asking: some causes of loss may be excluded, limited, or insured through a separate policy. CoverageFit is not determining that you need a particular product; this question checks whether those risks were evaluated.",answers:[
      {label:"Yes, the relevant risks were reviewed and decisions were made",sub:"I understand which separate policies or protections I chose or declined.",points:0,scoreImpact:0,impactLevel:"none",findingType:"strength",tag:"Separate Hazard Review",insight:"Risks commonly handled separately from a standard home policy were reviewed and decisions were made.",question:"Have the property's exposures or available coverage options changed since that review?"},
      {label:"A relevant risk was identified, and I am still evaluating options",sub:"The issue is known but the protection decision is not complete.",points:-4,scoreImpact:.5,impactLevel:"moderate",findingType:"consideration",tag:"Separate Hazard Review",insight:"A separately handled hazard was identified, but the protection decision is still open.",question:"What options, deductibles, exclusions, and tradeoffs should I compare for that hazard?"},
      {label:"No, these risks have not been reviewed",sub:"I have not evaluated whether separate protection is relevant.",points:-5,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Separate Hazard Review",insight:"Risks commonly handled separately from a standard home policy have not been evaluated.",question:"Which excluded or separately insured hazards are relevant to my property and location?"},
      {label:"I am not sure what may be excluded or handled separately",sub:"I do not know which hazards require a separate discussion.",points:-5,scoreImpact:.75,impactLevel:"material",findingType:"uncertainty",tag:"Separate Hazard Review",insight:"The hazards excluded or handled separately from the home policy are unclear.",question:"Which major hazards are excluded, limited, or insured separately from my home policy?"}]}
  ]
};

(() => {
  'use strict';

  const config = window.COVERAGEFIT_CONFIG;
  if (!config) return;

  const PROPERTY_PROFILE_KEY = 'coveragefit_property_profile_v1';
  const CURRENT_YEAR = new Date().getFullYear();

  function confirmedValue(profile, field) {
    const value = profile?.data?.[field];
    const meta = profile?.fieldMeta?.[field];
    if (value === null || value === undefined || value === '') return null;
    return meta?.verifiedByUser === true ? value : null;
  }

  function confirmedNumber(profile, field) {
    const value = Number(confirmedValue(profile, field));
    return Number.isFinite(value) ? value : null;
  }

  function ageFromYear(profile, field) {
    const year = confirmedNumber(profile, field);
    return year && year <= CURRENT_YEAR ? CURRENT_YEAR - year : null;
  }

  function factList(profile) {
    const facts = [];
    const yearBuilt = confirmedNumber(profile, 'yearBuilt');
    const squareFeet = confirmedNumber(profile, 'squareFeet');
    const stories = confirmedNumber(profile, 'stories');
    if (yearBuilt) facts.push(`built in ${yearBuilt}`);
    if (squareFeet) facts.push(`${Math.round(squareFeet).toLocaleString('en-US')} sq ft`);
    if (stories) facts.push(`${stories} ${stories === 1 ? 'story' : 'stories'}`);
    return facts;
  }

  function normalizeReviewReason(value) {
    return String(value || '').trim().toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
  }

  function reviewReasonKeyFor(value) {
    const context = normalizeReviewReason(value);
    if (!context) return 'general';
    if (/\bnon[\s-]*renew|not\s+(?:being\s+)?renew|coverage\s+(?:is\s+)?ending|carrier\s+(?:is\s+)?leaving|cancel(?:led|ation)?\b/.test(context)) return 'non-renewal';
    if (/\bhomebuyer\b|buying|purchas|new home|closing|escrow/.test(context)) return 'homebuyer';
    if (/premium|rate increase|price increase|cost increase|rates? went up|premium went up/.test(context)) return 'premium-increase';
    if (/renew|annual review/.test(context)) return 'renewal';
    return 'general';
  }

  function currentReviewReason() {
    const personalization = window.CoverageFitPersonalization?.get?.() || window.CoverageFitAssessmentPrefill?.context || null;
    return personalization?.journey?.reviewReason
      || window.CoverageFitAssessmentPrefill?.reviewContext
      || window.CoverageFitTrigger
      || '';
  }

  function resolveQuestion(question, profile, reviewReasonKey) {
    const resolved = { ...question };
    if (typeof question.resolveForProperty === 'function') {
      Object.assign(resolved, question.resolveForProperty(profile) || {});
    }

    const propertyPriorityBoost = Math.max(0, Number(resolved.priorityBoost || 0));
    const journeyRule = config.reviewReasonRules?.[reviewReasonKey]?.questions?.[question.key] || null;
    const reviewReasonPriorityBoost = Math.max(0, Number(journeyRule?.priorityBoost || 0));
    if (journeyRule) {
      resolved.reviewReasonAware = true;
      resolved.reviewReasonKey = reviewReasonKey;
      resolved.reviewReasonLabel = config.reviewReasonRules[reviewReasonKey].label;
      resolved.reviewReasonContext = journeyRule.context || '';
      resolved.reviewReasonApplicabilityReason = journeyRule.applicabilityReason || '';
      resolved.reviewReasonPriorityBoost = reviewReasonPriorityBoost;
    }
    resolved.propertyPriorityBoost = propertyPriorityBoost;
    resolved.priorityBoost = propertyPriorityBoost + reviewReasonPriorityBoost;
    return resolved;
  }

  function mergeQuestions(coreQuestions, propertyQuestions) {
    const merged = [...coreQuestions];
    propertyQuestions.forEach(question => {
      const insertAfter = question.insertAfter;
      const index = merged.findIndex(item => item.key === insertAfter);
      if (index >= 0) merged.splice(index + 1, 0, question);
      else merged.push(question);
    });
    return merged;
  }

  config.profileStorageKey = PROPERTY_PROFILE_KEY;
  config.propertyPersonalization = {
    id: 'coveragefit-home-property-personalization-v1',
    version: '1.0.0',
    source: 'homeowner-confirmed-property-profile',
    description: 'Conditionally adds and prioritizes educational review questions using property details the homeowner confirmed. It does not use those details to make underwriting, eligibility, valuation, hazard, or coverage conclusions.'
  };

  config.reviewReasonPersonalization = {
    id: 'coveragefit-home-review-reason-prioritization-v1',
    version: '1.0.0',
    source: 'homeowner-selected-review-reason',
    description: 'Adds bounded question context and priority-ordering adjustments based on why the homeowner requested a review. It does not change question weights, answer impacts, the Protection Score, eligibility, pricing, or coverage conclusions.'
  };

  config.evidenceQualityMethodology = {
    id: 'coveragefit-assessment-evidence-quality-v1',
    version: '1.0.0',
    source: 'homeowner-recorded-assessment-responses',
    description: 'Classifies each response as confirmed, partial, needing verification, or missing so the completed review distinguishes clear evidence from follow-up items. It adds no questions and does not change question weights, answer impacts, category scores, or the Protection Score formula.'
  };

  config.reviewReasonRules = {
    homebuyer: {
      label: 'Home purchase',
      summary: 'Prioritizes rebuilding assumptions, deductible readiness, separate hazards, and foundational liability decisions before the new-home coverage structure is finalized.',
      questions: {
        dwelling: {priorityBoost: 2.5, context: 'Because you are preparing for a home purchase, this topic is prioritized to confirm the rebuilding basis before coverage options are finalized.', applicabilityReason: 'The homeowner selected a home-purchase review.'},
        deductible: {priorityBoost: 2, context: 'A home purchase is a useful time to confirm the largest deductible you could face and whether it fits your post-closing finances.', applicabilityReason: 'The homeowner selected a home-purchase review.'},
        separatePerils: {priorityBoost: 1.5, context: 'Before closing or binding coverage, it is useful to identify whether earthquake, flood, or other separately handled hazards require a separate decision.', applicabilityReason: 'The homeowner selected a home-purchase review.'},
        liability: {priorityBoost: 1, context: 'A new home can change household assets, visitors, and property exposures, so the liability discussion is prioritized as part of the initial protection structure.', applicabilityReason: 'The homeowner selected a home-purchase review.'}
      }
    },
    renewal: {
      label: 'Annual renewal',
      summary: 'Prioritizes changes since the last review, rebuilding updates, water terms, deductibles, and liability before the renewal decision.',
      questions: {
        lifeEvents: {priorityBoost: 2.5, context: 'At renewal, changes to the household, property, or use of the home are prioritized so the policy discussion reflects current circumstances.', applicabilityReason: 'The homeowner selected an annual-renewal review.'},
        dwelling: {priorityBoost: 1.5, context: 'The renewal is a natural checkpoint for confirming whether the rebuilding estimate still reflects current home details and construction costs.', applicabilityReason: 'The homeowner selected an annual-renewal review.'},
        water: {priorityBoost: 1.5, context: 'Water-loss terms, deductibles, and protective-device requirements can change, so this topic is prioritized before renewal.', applicabilityReason: 'The homeowner selected an annual-renewal review.'},
        deductible: {priorityBoost: 1, context: 'Before renewal, it is useful to confirm that all applicable deductibles remain clear and financially manageable.', applicabilityReason: 'The homeowner selected an annual-renewal review.'},
        liability: {priorityBoost: 1, context: 'The renewal review should confirm whether household and financial changes affect the liability discussion.', applicabilityReason: 'The homeowner selected an annual-renewal review.'}
      }
    },
    'non-renewal': {
      label: 'Non-renewal or cancellation',
      summary: 'Prioritizes current property facts, rebuilding assumptions, deductible readiness, and separately handled hazards while preparing for replacement coverage.',
      questions: {
        dwelling: {priorityBoost: 2.5, context: 'Because current coverage is ending, this topic is prioritized to organize accurate rebuilding information for the next licensed conversation. CoverageFit does not infer why the carrier acted or predict eligibility.', applicabilityReason: 'The homeowner selected a non-renewal or cancellation review.'},
        lifeEvents: {priorityBoost: 2, context: 'Changes to the property, household, or use of the home are prioritized so replacement-coverage discussions begin with current information.', applicabilityReason: 'The homeowner selected a non-renewal or cancellation review.'},
        deductible: {priorityBoost: 1.5, context: 'When comparing replacement options, it is useful to understand the deductible amounts you could realistically fund.', applicabilityReason: 'The homeowner selected a non-renewal or cancellation review.'},
        separatePerils: {priorityBoost: 1.5, context: 'A replacement-coverage review is a useful time to separate standard home-policy questions from earthquake, flood, or other separately handled hazards.', applicabilityReason: 'The homeowner selected a non-renewal or cancellation review.'},
        roofTermsReview: {priorityBoost: 1.5, context: 'Because you confirmed an older roof and current coverage is ending, roof policy terms are prioritized for accurate discussion only. This does not identify the reason for non-renewal or predict eligibility.', applicabilityReason: 'The homeowner selected a non-renewal or cancellation review and confirmed a roof that activates the property-aware question.'}
      }
    },
    'premium-increase': {
      label: 'Premium increase',
      summary: 'Prioritizes deductible tradeoffs and the protection terms most likely to be changed when responding to price, without treating lower cost as the only objective.',
      questions: {
        deductible: {priorityBoost: 2.5, context: 'Because price increased, this topic is prioritized to compare premium savings against the largest out-of-pocket amount you could face after a loss.', applicabilityReason: 'The homeowner selected a premium-increase review.'},
        extendedReplacement: {priorityBoost: 2, context: 'Before changing coverage to reduce price, it is useful to confirm what protection above the dwelling limit is included and what would be lost or retained.', applicabilityReason: 'The homeowner selected a premium-increase review.'},
        liability: {priorityBoost: 1.5, context: 'Liability limits can materially affect protection and price, so this topic is prioritized before making a price-driven change.', applicabilityReason: 'The homeowner selected a premium-increase review.'},
        umbrella: {priorityBoost: 1.5, context: 'The umbrella decision should be reviewed alongside the underlying liability limits before changing protection based on premium alone.', applicabilityReason: 'The homeowner selected a premium-increase review.'},
        dwelling: {priorityBoost: 1, context: 'A premium increase can prompt coverage changes, but the rebuilding basis should be understood before reducing or restructuring protection.', applicabilityReason: 'The homeowner selected a premium-increase review.'}
      }
    }
  };

  const coreByKey = key => config.questions.find(question => question.key === key);

  const dwelling = coreByKey('dwelling');
  if (dwelling) {
    dwelling.resolveForProperty = profile => {
      const facts = factList(profile);
      if (!facts.length) return {};
      return {
        propertyAware: true,
        propertyContext: `Based on details you confirmed: ${facts.join(' · ')}. These details help frame what should be reflected in a rebuilding review; CoverageFit is not calculating a rebuilding estimate.`,
        applicabilityReason: 'Confirmed age, size, or story information provides context for the rebuilding-estimate review.'
      };
    };
  }

  const ordinanceLaw = coreByKey('ordinanceLaw');
  if (ordinanceLaw) {
    ordinanceLaw.resolveForProperty = profile => {
      const yearBuilt = confirmedNumber(profile, 'yearBuilt');
      const homeAge = ageFromYear(profile, 'yearBuilt');
      if (!yearBuilt || homeAge === null || homeAge < 40) return {};
      return {
        propertyAware: true,
        priorityBoost: 2,
        propertyContext: `You confirmed the home was built in ${yearBuilt}. This topic is prioritized to verify how the policy handles required code upgrades; the home's age alone does not establish a coverage need or gap.`,
        applicabilityReason: 'A homeowner-confirmed construction year of at least 40 years ago makes code-upgrade terms especially useful to verify.'
      };
    };
  }

  config.propertyQuestions = [
    {
      key: 'poolLiabilityReview',
      category: 'Liability',
      construct: 'property-exposure-review',
      weight: 6,
      insertAfter: 'liability',
      propertyAware: true,
      priorityBoost: 2,
      condition: (_selections, profile) => confirmedValue(profile, 'pool') === true,
      resolveForProperty: () => ({
        propertyContext: 'You confirmed that the property has a swimming pool. This question reviews whether that household exposure has been discussed; it does not determine that a particular liability limit is adequate.',
        applicabilityReason: 'The homeowner confirmed a swimming pool.'
      }),
      title: 'Since you confirmed a swimming pool, how has that exposure been addressed in your liability review?',
      help: "Why we're asking: a pool can change who uses the property and the types of household liability questions worth discussing. This asks whether the exposure was reviewed, not whether a particular limit or policy is required.",
      answers: [
        {label:'Reviewed with current household use and safety details',sub:'The pool, who uses it, relevant safeguards, and liability structure were discussed.',points:0,scoreImpact:0,impactLevel:'none',findingType:'strength',tag:'Swimming Pool Liability Review',insight:'The swimming pool exposure was reviewed using current household and property details.',question:'Have the pool use, safeguards, household drivers, and liability structure changed since that review?'},
        {label:'The pool is disclosed, but the liability discussion was limited',sub:'I have not recently connected pool use and household circumstances to the liability review.',points:-3,scoreImpact:.5,impactLevel:'moderate',findingType:'consideration',tag:'Swimming Pool Liability Review',insight:'The pool is known, but its current use and household context have not been fully connected to the liability review.',question:'How should the pool, household use, and current liability structure be evaluated together?'},
        {label:'The pool or how it is used changed after the last review',sub:'The policy and liability discussion have not been updated since that change.',points:-5,scoreImpact:.75,impactLevel:'material',findingType:'identified-gap',tag:'Swimming Pool Liability Review',insight:'The pool or its use changed after the last liability review and has not yet been revisited.',question:'What current pool-use and household details should be updated before comparing liability options?'},
        {label:'I am not sure whether the pool was included in the review',sub:'I cannot confirm what information was discussed or reflected.',points:-5,scoreImpact:.75,impactLevel:'material',findingType:'uncertainty',tag:'Swimming Pool Liability Review',insight:'It is unclear whether the swimming pool exposure was included in the current liability review.',question:'Was the pool included in the most recent liability review, and what assumptions were used?'}
      ]
    },
    {
      key: 'detachedStructuresReview',
      category: 'Property',
      construct: 'property-use-and-limit-verification',
      weight: 5,
      insertAfter: 'personalProperty',
      propertyAware: true,
      priorityBoost: 1,
      condition: (_selections, profile) => confirmedValue(profile, 'detachedStructures') === true,
      resolveForProperty: () => ({
        propertyContext: 'You confirmed detached structures on the property. This question checks whether their current use and policy treatment were reviewed; it does not estimate their value or determine coverage.',
        applicabilityReason: 'The homeowner confirmed one or more detached structures.'
      }),
      title: 'How recently were your detached structures and their current uses reviewed?',
      help: "Why we're asking: garages, sheds, workshops, guest spaces, and other detached structures may have different uses, contents, or policy treatment. The goal is to confirm that the current property details were discussed.",
      answers: [
        {label:'Reviewed with current structures and uses',sub:'The structures, their uses, and the relevant policy amount or treatment were discussed.',points:0,scoreImpact:0,impactLevel:'none',findingType:'strength',tag:'Detached Structures Review',insight:'The detached structures and their current uses were reviewed with the policy details.',question:'Have any structures, uses, contents, or occupancy details changed since that review?'},
        {label:'The structures are listed, but I do not know the amount or treatment',sub:'I have not confirmed how the policy responds to each structure and use.',points:-3,scoreImpact:.5,impactLevel:'moderate',findingType:'uncertainty',tag:'Detached Structures Review',insight:'The detached structures are known, but their policy amount or treatment is unclear.',question:'How are each of my detached structures and their current uses handled by the policy?'},
        {label:'A structure or its use changed after the last review',sub:'The policy details have not been revisited since the addition or change.',points:-4,scoreImpact:.75,impactLevel:'material',findingType:'identified-gap',tag:'Detached Structures Review',insight:'A detached structure or its use changed after the last policy review.',question:'What structure, use, value, or occupancy details should be updated before reviewing options?'},
        {label:'I am not sure whether they were reviewed',sub:'I cannot confirm whether the structures and uses were included.',points:-4,scoreImpact:.75,impactLevel:'material',findingType:'uncertainty',tag:'Detached Structures Review',insight:'It is unclear whether the detached structures and their current uses were included in the review.',question:'Were all detached structures and their current uses included in the policy review?'}
      ]
    },
    {
      key: 'roofTermsReview',
      category: 'Property',
      construct: 'property-term-verification',
      weight: 5,
      insertAfter: 'water',
      propertyAware: true,
      priorityBoost: 2,
      condition: (_selections, profile) => {
        const roofAge = ageFromYear(profile, 'roofYear');
        return roofAge !== null && roofAge >= 15;
      },
      resolveForProperty: profile => {
        const roofYear = confirmedNumber(profile, 'roofYear');
        const roofType = confirmedValue(profile, 'roofType');
        const descriptor = [roofType ? `${roofType} roof` : 'roof', roofYear ? `installed around ${roofYear}` : ''].filter(Boolean).join(', ');
        return {
          propertyContext: `You confirmed a roof ${descriptor || 'that is at least 15 years old'}. This question prioritizes verification of roof terms; it does not predict eligibility, condition, claim outcome, or replacement need.`,
          applicabilityReason: 'The homeowner confirmed a roof year at least 15 years before the current year.'
        };
      },
      title: 'Which best describes what you know about how the policy handles roof losses?',
      help: "Why we're asking: policies can differ in settlement method, deductibles, age-related terms, and documentation requirements. A confirmed older roof year makes those terms useful to verify, but it does not establish a condition or underwriting conclusion.",
      answers: [
        {label:'I reviewed the roof settlement method, deductible, and major conditions',sub:'I understand the basic terms that would apply to a covered roof loss.',points:0,scoreImpact:0,impactLevel:'none',findingType:'strength',tag:'Roof Policy Terms',insight:'The roof settlement method, deductible, and major policy conditions were reviewed.',question:'Have the roof terms or the roof itself changed since that review?'},
        {label:'I know the deductible, but not the settlement method or age-related terms',sub:'Some important policy details remain unconfirmed.',points:-3,scoreImpact:.5,impactLevel:'moderate',findingType:'uncertainty',tag:'Roof Policy Terms',insight:'The roof deductible may be known, but settlement and age-related terms remain unclear.',question:'What settlement method, age-related terms, and documentation requirements apply to roof losses?'},
        {label:'I confirmed that special roof terms apply',sub:'I know there are specific conditions or settlement provisions, but they still need to be evaluated with my preferences.',points:-3,scoreImpact:.5,impactLevel:'moderate',findingType:'consideration',tag:'Roof Policy Terms',insight:'Specific roof terms apply and are worth evaluating alongside the homeowner’s expectations and options.',question:'How would the confirmed roof terms affect a covered loss, and what alternatives are available?'},
        {label:'I have not reviewed the roof terms',sub:'I do not know the settlement method, deductible, or age-related conditions.',points:-4,scoreImpact:.75,impactLevel:'material',findingType:'uncertainty',tag:'Roof Policy Terms',insight:'The policy terms that would apply to a roof loss have not been confirmed.',question:'How does my policy handle a covered roof loss, including settlement method, deductible, and age-related terms?'}
      ]
    }
  ];

  config.reviewReasonKeyFor = reviewReasonKeyFor;
  config.resolveQuestions = function ({ selections = {}, profile = {}, reviewReason = '' } = {}) {
    const reasonKey = reviewReasonKeyFor(reviewReason || currentReviewReason());
    const applicablePropertyQuestions = this.propertyQuestions.filter(question => !question.condition || question.condition(selections, profile));
    return mergeQuestions(this.questions, applicablePropertyQuestions).map(question => resolveQuestion(question, profile, reasonKey));
  };
})();

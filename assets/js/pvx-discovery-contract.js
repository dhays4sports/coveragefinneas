(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoverageFitPVXDiscoveryContract = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.1.0';
  const BUILD = 'CF-DISCOVERY-1.1';
  const CONTRACT_ID = 'coveragefit-multi-product-discovery-v1';
  const TRACKS = Object.freeze(['home', 'auto', 'bundle', 'buyer', 'renter']);

  const shared = Object.freeze({
    shoppingReason: {
      id: 'shoppingReason', stage: 'Your goals', kicker: 'Why now?',
      title: 'What’s got you shopping right now?', description: 'Choose the closest answer.',
      help: 'Your reason for looking keeps the Snapshot relevant to this moment.', type: 'single', autoAdvance: true,
      options: [['renewal_increase', 'My renewal price changed'], ['buying_home', 'I’m buying a home'], ['service_change', 'I want a different service experience'], ['life_change', 'Something changed in my life'], ['comparison', 'I’m simply comparing'], ['something_else', 'Something else']]
    },
    improvementPriorities: {
      id: 'improvementPriorities', stage: 'Your goals', kicker: 'What would feel better?',
      title: 'Besides price, anything you’d like to improve?', description: 'Choose any that matter. “Only price” is valid.',
      help: 'These are your priorities, not findings about your policy.', type: 'multi',
      options: [['understanding', 'Understand what I have'], ['claim_support', 'Feel better supported in a claim'], ['agent_access', 'Have easier access to my agent'], ['coordination', 'Coordinate my insurance better'], ['price_only', 'Price is my only priority', 'exclusive'], ['not_sure', 'Not sure yet', 'exclusive']]
    },
    permissionToAdvise: {
      id: 'permissionToAdvise', stage: 'Your Snapshot', kicker: 'How Dylan can help',
      title: 'If Dylan sees something he would approach differently, are you open to seeing why?',
      description: 'This is permission to explain—not permission to change coverage.',
      help: 'Your answer guides the conversation. It is not recommendation buy-in or authorization to bind.', type: 'single', autoAdvance: true,
      options: [['yes', 'Yes, show me why'], ['simple', 'Maybe—keep it simple'], ['cost_first', 'Only if cost stays central'], ['not_sure', 'Not sure yet']]
    }
  });

  const home = Object.freeze({
    ownershipDuration: { id: 'ownershipDuration', stage: 'Your home', kicker: 'A little home context', title: 'How long have you owned the house?', description: 'A broad range is enough.', help: 'Time in the home can make changes and rebuilding assumptions worth discussing later.', type: 'single', autoAdvance: true, options: [['buying_now', 'I’m buying it now'], ['under_1', 'Less than a year'], ['1_4', '1–4 years'], ['5_9', '5–9 years'], ['10_plus', '10 years or more'], ['not_sure', 'Not sure']] },
    stayIntent: { id: 'stayIntent', stage: 'Your home', kicker: 'Looking ahead', title: 'Do you see yourself staying there?', description: 'Choose what feels closest today.', help: 'This helps distinguish a short-term comparison from long-term home planning.', type: 'single', autoAdvance: true, options: [['long_term', 'Yes, for the long term'], ['few_years', 'Probably a few more years'], ['may_move', 'I may move soon'], ['not_sure', 'Not sure yet']] },
    upgradeSummary: { id: 'upgradeSummary', stage: 'Your home', kicker: 'What has changed?', title: 'Any significant upgrades?', description: 'No technical details needed yet.', help: 'Updated homes can deserve a later look at reconstruction assumptions. This answer alone is not a policy finding.', type: 'single', autoAdvance: true, options: [['yes_major', 'Yes, meaningful updates'], ['some', 'A few smaller updates'], ['none', 'No significant updates'], ['not_sure', 'Not sure']] },
    otherProperties: { id: 'otherProperties', stage: 'Your home', kicker: 'The bigger picture', title: 'Any other properties?', description: 'We only need the broad picture for now.', help: 'Multiple properties can make account and liability coordination worth reviewing.', type: 'single', autoAdvance: true, options: [['rental', 'Yes, a rental property'], ['second_home', 'Yes, a second home'], ['multiple', 'Yes, more than one other property'], ['none', 'No'], ['not_sure', 'Not sure']] },
    claimExperience: { id: 'claimExperience', stage: 'Your experience', kicker: 'Past experience', title: 'Have you had any claims before?', description: 'A broad answer is enough before your Snapshot.', help: 'Claim experience can shape what service, deductibles, or prevention topics feel most relevant.', type: 'single', autoAdvance: true, options: [['yes_smooth', 'Yes, and it went smoothly'], ['yes_difficult', 'Yes, and it was difficult'], ['yes_neutral', 'Yes'], ['none', 'No'], ['prefer_not', 'Prefer not to say'], ['not_sure', 'Not sure']] }
  });

  const auto = Object.freeze({
    annualMileage: { id: 'annualMileage', stage: 'Your driving', kicker: 'Your routine', title: 'How much are you driving?', description: 'A broad range is enough.', help: 'Driving patterns provide context for the review. They do not determine eligibility.', type: 'single', autoAdvance: true, options: [['under_5k', 'Less than 5,000 miles a year'], ['5k_10k', 'About 5,000–10,000'], ['10k_15k', 'About 10,000–15,000'], ['over_15k', 'More than 15,000'], ['not_sure', 'Not sure']] },
    vehicleCount: { id: 'vehicleCount', stage: 'Your vehicles', kicker: 'The bigger picture', title: 'Is this your only vehicle?', description: 'Choose the closest answer.', help: 'The number of vehicles helps Dylan understand the household setup without creating a quote.', type: 'single', autoAdvance: true, options: [['only_vehicle', 'Yes, this is my only vehicle'], ['two_vehicles', 'No, we have two vehicles'], ['three_plus', 'No, we have three or more'], ['changing', 'A vehicle is being added or replaced'], ['not_sure', 'Not sure yet']] },
    drivers: { id: 'drivers', stage: 'Your household', kicker: 'Who uses the vehicles?', title: 'Who else drives?', description: 'No names or license details yet.', help: 'We only need the broad household picture for your first Snapshot.', type: 'single', autoAdvance: true, options: [['just_me', 'Just me'], ['partner', 'A spouse or partner'], ['household', 'Other household members'], ['young_driver', 'A younger driver'], ['other', 'Someone else'], ['not_sure', 'Not sure']] },
    liabilityKnowledge: { id: 'liabilityKnowledge', stage: 'Your current setup', kicker: 'What do you know today?', title: 'Do you know what liability limits you have now?', description: 'You do not need your policy in front of you.', help: 'This only records whether the limits are known. It does not evaluate them.', type: 'single', autoAdvance: true, options: [['know', 'Yes, I know them'], ['roughly', 'I know roughly'], ['not_sure', 'No, I’m not sure']] }
  });

  const renter = Object.freeze({
    renterProperty: { id: 'renterProperty', stage: 'Your place', kicker: 'A little context', title: 'What kind of place do you rent?', description: 'Choose the closest answer.', help: 'This keeps the renter Snapshot relevant without requiring an address.', type: 'single', autoAdvance: true, options: [['apartment', 'Apartment or condo'], ['house', 'House or townhome'], ['room', 'Room or shared home'], ['other', 'Something else'], ['not_sure', 'Not sure']] },
    renterPriorities: { id: 'renterPriorities', stage: 'What matters', kicker: 'Your belongings and liability', title: 'What would you most like to understand?', description: 'Choose the closest answer.', help: 'This is discovery, not a coverage finding.', type: 'single', autoAdvance: true, options: [['belongings', 'Protecting my belongings'], ['liability', 'Personal liability'], ['valuable_items', 'Valuable items or work equipment'], ['bundle', 'Renters and auto together'], ['not_sure', 'Not sure yet']] }
  });

  const catalogs = {
    home: [shared.shoppingReason, shared.improvementPriorities, home.ownershipDuration, home.upgradeSummary, home.claimExperience, shared.permissionToAdvise],
    buyer: [shared.shoppingReason, shared.improvementPriorities, home.ownershipDuration, home.upgradeSummary, home.otherProperties, home.claimExperience, shared.permissionToAdvise],
    auto: [shared.shoppingReason, shared.improvementPriorities, auto.annualMileage, auto.vehicleCount, auto.liabilityKnowledge, shared.permissionToAdvise],
    bundle: [shared.shoppingReason, shared.improvementPriorities, home.ownershipDuration, auto.annualMileage, auto.vehicleCount, shared.permissionToAdvise],
    renter: [shared.shoppingReason, shared.improvementPriorities, renter.renterProperty, renter.renterPriorities, shared.permissionToAdvise]
  };

  const freezeQuestion = question => Object.freeze({
    ...question,
    options: Object.freeze(question.options.map(option => Object.freeze({ value: option[0], label: option[1], exclusive: option[2] === 'exclusive' })))
  });
  const CATALOGS = Object.freeze(Object.fromEntries(Object.entries(catalogs).map(([track, questions]) => [track, Object.freeze(questions.map(freezeQuestion))])));
  const normalizeTrack = value => TRACKS.includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'home';
  const questionsFor = track => CATALOGS[normalizeTrack(track)];
  const orderFor = track => questionsFor(track).map(question => question.id);
  const firstUnanswered = (track, answers = {}, prefilled = []) => {
    const carried = new Set(Array.isArray(prefilled) ? prefilled : []);
    return orderFor(track).find(id => !(carried.has(id) && answers[id] != null) && answers[id] == null) || 'complete';
  };
  const validateCatalog = track => {
    const questions = questionsFor(track);
    const prohibited = /underinsured|qualified|eligible|approved|guaranteed savings|bind coverage/i;
    return {
      valid: questions.length <= 8 && questions.every(question => question.options.length > 0) && !questions.some(question => prohibited.test(`${question.title} ${question.description} ${question.help}`)),
      track: normalizeTrack(track), count: questions.length
    };
  };

  return Object.freeze({ VERSION, BUILD, CONTRACT_ID, TRACKS, CATALOGS, normalizeTrack, questionsFor, orderFor, firstUnanswered, validateCatalog });
});

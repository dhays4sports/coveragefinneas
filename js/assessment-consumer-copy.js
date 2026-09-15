(() => {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'ASMT-1.8';
  const TOTAL_MINUTES = 5;
  const MINUTES_PER_QUESTION = 0.42;

  const QUESTIONS = {
    dwelling: {
      title: "When was your home's rebuilding estimate last reviewed?",
      help: "Rebuilding costs can change after renovations and local construction-cost increases. This is about rebuilding the home, not its market value.",
      answers: [
        ["Within the past two years", "A producer or insurer used current details about my home."],
        ["More than two years ago or before major updates", "The home or local building costs may have changed since then."],
        ["I know the amount, but not how it was calculated", "I have seen the limit but not the assumptions behind it."],
        ["I do not know", "I have not confirmed the amount or review date."]
      ]
    },
    extendedReplacement: {
      title: "Do you know whether your policy can pay above the dwelling limit?",
      help: "Some policies include extra rebuilding protection if costs rise after a major loss. The amount and conditions vary by policy.",
      answers: [
        ["Yes, and I know the amount or percentage", "I have confirmed the provision and its basic conditions."],
        ["I think so, but I do not know how much", "I have not confirmed the percentage, limit, or conditions."],
        ["I confirmed it is not included", "The policy does not provide an additional amount above the dwelling limit."],
        ["Not sure", "I have not reviewed this policy term."]
      ]
    },
    ordinanceLaw: {
      title: "Do you know how your policy handles required building-code upgrades?",
      help: "A covered rebuild may require current electrical, plumbing, structural, or safety upgrades. This checks whether that protection has been reviewed.",
      answers: [
        ["Yes, and I know the limit or percentage", "I have confirmed the basic amount available."],
        ["I think it is included, but I do not know how much", "I have not confirmed the limit or conditions."],
        ["I confirmed it is not included", "The policy does not provide a separate amount for required code upgrades."],
        ["Not sure", "I have not reviewed this policy term."]
      ]
    },
    water: {
      title: "How familiar are you with your policy's water-damage terms?",
      help: "Sudden leaks, backups, hidden leaks, seepage, deductibles, and protective-device requirements can be handled differently.",
      answers: [
        ["I reviewed the main water-loss terms", "I understand the main limits, exclusions, and any separate deductible."],
        ["I understand sudden water damage, but not the other details", "Backup, hidden-leak, seepage, or mitigation terms are still unclear."],
        ["I know there may be a separate deductible or requirement", "I have not confirmed the amount or conditions."],
        ["I have not reviewed the water-loss terms", "I do not know how the policy handles these situations."]
      ]
    },
    deductible: {
      title: "Do you know your home deductibles, and could you pay the largest one?",
      help: "Some losses can have separate deductibles. This checks both what you know and how prepared you feel.",
      answers: [
        ["I know them and could fund the largest one", "The amounts are clear and manageable for me."],
        ["I know the main deductible, but not whether others apply", "Separate water, wind, earthquake, or other deductibles may be unclear."],
        ["I know the amount, but paying it would strain my finances", "I could likely pay it, but it would be disruptive."],
        ["I could not reasonably fund the deductible", "I would struggle to access the amount after a loss."],
        ["I do not know the deductible amount or amounts", "I have not confirmed the standard or separate deductibles."]
      ]
    },
    liability: {
      title: "When was your personal liability limit last reviewed for your household?",
      help: "A useful review considers assets, income, household members, property features, drivers, activities, and risk tolerance.",
      answers: [
        ["I know the limit, and it was reviewed for my current situation", "My household, property, drivers, activities, and finances were considered."],
        ["I know the limit, but it has not been reviewed recently", "The amount may not reflect my current circumstances."],
        ["I believe it is $100,000 or less and it was not reviewed", "I generally know the limit, but its fit was not evaluated."],
        ["I do not know my current limit", "The amount and how it relates to my situation are unclear."]
      ]
    },
    personalProperty: {
      title: "Have you reviewed how your belongings would be valued and whether valuable items have special limits?",
      help: "Replacement cost and depreciated value can lead to different claim payments. Jewelry, art, electronics, collections, and other items may also have special limits.",
      answers: [
        ["Yes, I reviewed both", "I know the settlement method and considered items with special limits."],
        ["I know the settlement method, but have not reviewed valuable items", "Special limits may not reflect what I own today."],
        ["I reviewed valuable items, but not the settlement method", "I do not know how ordinary belongings would be valued."],
        ["I have not reviewed either", "The settlement method and special limits are unclear."]
      ]
    },
    lossOfUse: {
      title: "Do you know how your policy would help with temporary housing after a covered loss?",
      help: "Recovery can take months. The amount, time period, eligible expenses, and your household's needs all matter.",
      answers: [
        ["I know the amount or duration, and it was reviewed for my household", "The protection was compared with my likely recovery needs."],
        ["I know the amount or duration, but not whether it would be enough", "I know the policy term, but its practical fit was not reviewed."],
        ["I know it is included, but not the amount or duration", "The available limit or time period is unclear."],
        ["I do not know", "I have not reviewed this protection."]
      ]
    },
    umbrella: {
      title: "Has anyone reviewed whether an umbrella policy makes sense for your household?",
      help: "An umbrella can add liability protection, but it is not automatically right for everyone. The important point is whether the decision was considered deliberately.",
      answers: [
        ["Yes, and I carry an umbrella", "It was selected after reviewing my broader exposures."],
        ["Yes, and I decided not to carry one", "My exposures were reviewed and the decision was intentional."],
        ["No, it has not been reviewed", "I have not compared an umbrella with my current exposures."],
        ["I am not sure what an umbrella covers", "Its purpose and relationship to home and auto liability are unclear."]
      ]
    },
    lifeEvents: {
      title: "Has anything important changed since your last full insurance review?",
      help: "Renovations, household changes, home-based work, rentals, trusts, ownership changes, and major purchases can all create new discussion points.",
      answers: [
        ["No material changes", "My household, ownership, property, and home use are generally unchanged."],
        ["Changes occurred and were reviewed", "I discussed the changes with a licensed professional."],
        ["Changes occurred but were not reviewed", "My household, property, ownership, activities, or home use changed."],
        ["I am not sure when my last full review occurred", "I cannot confirm whether later changes were evaluated."]
      ]
    },
    separatePerils: {
      title: "Have earthquake, flood, or other separately insured risks been discussed for your property?",
      help: "Some causes of loss may be excluded, limited, or insured separately. This checks whether those risks were considered, not whether you need a particular product.",
      answers: [
        ["Yes, the relevant risks were reviewed", "I understand which separate protections I chose or declined."],
        ["A risk was identified, and I am still considering options", "The issue is known, but the decision is not complete."],
        ["No, these risks have not been reviewed", "I have not evaluated whether separate protection is relevant."],
        ["I am not sure what may be handled separately", "I do not know which hazards need a separate discussion."]
      ]
    },
    poolLiabilityReview: {
      title: "Was your swimming pool included in your liability review?",
      help: "A pool can change the household liability questions worth discussing. This checks whether the pool and its current use were considered.",
      answers: [
        ["Yes, it was reviewed with current use and safety details", "The pool, who uses it, safeguards, and liability structure were discussed."],
        ["The pool is disclosed, but the liability discussion was limited", "Current pool use and household circumstances were not fully reviewed."],
        ["The pool or how it is used changed after the last review", "The liability discussion has not been updated since that change."],
        ["I am not sure whether the pool was included", "I cannot confirm what information was reviewed."]
      ]
    },
    detachedStructuresReview: {
      title: "Were your detached structures and how you use them reviewed?",
      help: "Garages, sheds, workshops, guest spaces, and other structures can have different uses and policy treatment.",
      answers: [
        ["Yes, the structures and current uses were reviewed", "The structures, their uses, and policy treatment were discussed."],
        ["They are listed, but I do not know the amount or treatment", "I have not confirmed how the policy handles each structure and use."],
        ["A structure or its use changed after the last review", "The policy details have not been revisited since the change."],
        ["I am not sure whether they were reviewed", "I cannot confirm whether all structures and uses were included."]
      ]
    },
    roofTermsReview: {
      title: "Do you know how your policy would handle a covered roof loss?",
      help: "Roof claims can have different settlement methods, deductibles, age-related terms, and documentation requirements.",
      answers: [
        ["I reviewed the settlement method, deductible, and main conditions", "I understand the basic terms for a covered roof loss."],
        ["I know the deductible, but not the other roof terms", "Settlement and age-related terms remain unclear."],
        ["I confirmed that special roof terms apply", "I know specific conditions apply, but still need to evaluate them."],
        ["I have not reviewed the roof terms", "I do not know the settlement method, deductible, or age-related conditions."]
      ]
    }
  };

  function question(question) {
    const copy = QUESTIONS[question?.key] || {};
    return {
      title: copy.title || question?.title || '',
      help: copy.help || String(question?.help || '').replace(/^Why we're asking:\s*/i, ''),
      answers: copy.answers || []
    };
  }

  function answer(question, index, original) {
    const row = QUESTIONS[question?.key]?.answers?.[index];
    return row
      ? { label: row[0], sub: row[1] }
      : { label: original?.label || '', sub: original?.sub || '' };
  }

  function remainingMinutes(questionCount, currentIndex) {
    const left = Math.max(1, Number(questionCount || 0) - Number(currentIndex || 0));
    return Math.max(1, Math.ceil(left * MINUTES_PER_QUESTION));
  }

  window.CoverageFitAssessmentConsumerCopy = Object.freeze({
    VERSION,
    BUILD,
    TOTAL_MINUTES,
    MINUTES_PER_QUESTION,
    question,
    answer,
    remainingMinutes
  });
})();

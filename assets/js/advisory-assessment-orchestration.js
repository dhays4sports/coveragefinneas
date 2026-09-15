(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoverageFitAdvisoryAssessmentOrchestration = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.8';
  const CONTRACT_ID = 'coveragefit-conversational-assessment-orchestration-v1';

  const CHAPTERS = Object.freeze([
    Object.freeze({
      id: 'why-reviewing',
      number: 1,
      title: 'Why you’re reviewing',
      description: 'What brought you here, what you want this review to accomplish, and what already works today.',
      mode: 'discovery'
    }),
    Object.freeze({
      id: 'home-household',
      number: 2,
      title: 'Your home and household',
      description: 'How this home fits your life and the practical details that shape the conversation.',
      mode: 'discovery'
    }),
    Object.freeze({
      id: 'depends-matters',
      number: 3,
      title: 'What you depend on / what matters',
      description: 'The outcomes and tradeoffs you want kept in view before any coverage recommendation is discussed.',
      mode: 'discovery'
    }),
    Object.freeze({
      id: 'current-protection',
      number: 4,
      title: 'How your current protection works',
      description: 'First, let’s make the policy itself understandable—what is known, what has been reviewed, and what still needs verification.',
      mode: 'scored-review'
    }),
    Object.freeze({
      id: 'planning-outcomes',
      number: 5,
      title: 'Outcomes worth planning for',
      description: 'Next, we’ll look at the parts of the policy that can matter when your household needs to recover or protect itself financially.',
      mode: 'scored-review'
    }),
    Object.freeze({
      id: 'worth-reviewing',
      number: 6,
      title: 'Things worth reviewing',
      description: 'Last, we’ll check for changes and separately handled risks that may deserve a focused conversation with Dylan.',
      mode: 'scored-review'
    })
  ]);

  const KEY_TO_CHAPTER = Object.freeze({
    dwelling: 'current-protection',
    extendedReplacement: 'current-protection',
    ordinanceLaw: 'current-protection',
    water: 'current-protection',
    roofTermsReview: 'current-protection',
    deductible: 'current-protection',
    personalProperty: 'current-protection',
    detachedStructuresReview: 'current-protection',

    liability: 'planning-outcomes',
    poolLiabilityReview: 'planning-outcomes',
    lossOfUse: 'planning-outcomes',
    umbrella: 'planning-outcomes',

    lifeEvents: 'worth-reviewing',
    separatePerils: 'worth-reviewing'
  });

  const chapterById = id => CHAPTERS.find(chapter => chapter.id === id) || CHAPTERS[3];
  const clone = value => { try { return value == null ? value : JSON.parse(JSON.stringify(value)); } catch (_) { return null; } };

  function chapterForQuestion(question) {
    const id = KEY_TO_CHAPTER[question?.key] || 'current-protection';
    return chapterById(id);
  }

  function annotate(question, sourceIndex) {
    const chapter = chapterForQuestion(question);
    return {
      ...question,
      advisoryChapterId: chapter.id,
      advisoryChapterNumber: chapter.number,
      advisoryChapterTitle: chapter.title,
      advisoryChapterDescription: chapter.description,
      advisoryOriginalIndex: sourceIndex
    };
  }

  function orchestrateQuestions(questions) {
    if (!Array.isArray(questions)) return [];
    return questions
      .map((question, index) => annotate(question, index))
      .sort((left, right) => {
        const chapterDelta = Number(left.advisoryChapterNumber || 4) - Number(right.advisoryChapterNumber || 4);
        return chapterDelta || Number(left.advisoryOriginalIndex || 0) - Number(right.advisoryOriginalIndex || 0);
      });
  }

  function questionContext(questions, currentIndex) {
    const list = Array.isArray(questions) ? questions : [];
    const question = list[currentIndex] || null;
    if (!question) return null;
    const chapter = chapterForQuestion(question);
    const chapterQuestions = list.filter(item => chapterForQuestion(item).id === chapter.id);
    const chapterIndex = chapterQuestions.findIndex(item => item.key === question.key);
    const previous = list[currentIndex - 1] || null;
    const previousChapter = previous ? chapterForQuestion(previous) : null;
    return {
      contractId: CONTRACT_ID,
      build: BUILD,
      chapter: clone(chapter),
      enteredChapter: !previousChapter || previousChapter.id !== chapter.id,
      coverageQuestionNumber: currentIndex + 1,
      coverageQuestionCount: list.length,
      chapterQuestionNumber: Math.max(1, chapterIndex + 1),
      chapterQuestionCount: chapterQuestions.length,
      progressPercent: list.length ? Math.round(((currentIndex + 1) / list.length) * 100) : 0,
      progressText: `Coverage question ${currentIndex + 1} of ${list.length}. Chapter ${chapter.number} of ${CHAPTERS.length}: ${chapter.title}.`
    };
  }

  function install(config) {
    if (!config || config.advisoryOrchestration?.contractId === CONTRACT_ID) return config;
    const originalResolve = typeof config.resolveQuestions === 'function'
      ? config.resolveQuestions.bind(config)
      : ({ selections = {}, profile = {} } = {}) => (config.questions || []).filter(question => !question.condition || question.condition(selections, profile));

    config.advisoryOrchestration = {
      contractId: CONTRACT_ID,
      version: VERSION,
      build: BUILD,
      chapters: clone(CHAPTERS),
      scoringBoundary: 'presentation-and-order-only',
      progressiveBranching: false,
      scoreFormulaChanged: false
    };

    config.resolveQuestions = function (args = {}) {
      return orchestrateQuestions(originalResolve(args));
    };
    return config;
  }

  if (root?.COVERAGEFIT_CONFIG?.slug === 'home') install(root.COVERAGEFIT_CONFIG);

  return Object.freeze({
    VERSION,
    BUILD,
    CONTRACT_ID,
    CHAPTERS,
    KEY_TO_CHAPTER,
    chapterForQuestion,
    orchestrateQuestions,
    questionContext,
    install
  });
});

(() => {
  const engine = window.CoverageFitRecommendationEngine;
  if (!engine) throw new Error('CoverageFitRecommendationEngine must load before business rules.');

  const industryRules = {
    contractor: [
      ['General Liability','recommended','Contracting work can create premises, ongoing-operations, and completed-operations liability exposures.'],
      ['Inland Marine','recommended','Contractors commonly move tools, equipment, and materials between jobsites.'],
      ['Commercial Auto','additional','Trucks, trailers, employee vehicles, and jobsite travel may create business auto exposure.'],
      ['Workers’ Compensation','additional','Employees, helpers, and worker classification should be reviewed as the operation grows.'],
      ['Commercial Umbrella','additional','Larger projects, severe accidents, and contract requirements may justify an additional liability layer.']
    ],
    restaurant: [
      ['Business Property','recommended','Restaurant operations depend on furnishings, kitchen equipment, inventory, and tenant improvements.'],
      ['Business Income','recommended','A covered shutdown can interrupt sales while rent, payroll, and other expenses continue.'],
      ['Equipment Breakdown','recommended','Cooking, refrigeration, electrical, and mechanical equipment are essential to daily operations.'],
      ['Spoilage','additional','Refrigerated or perishable inventory may be lost after certain equipment or utility failures.'],
      ['Liquor Liability','additional','Alcohol service can create a separate liability exposure when it is part of the operation.']
    ],
    'professional-office': [
      ['Professional Liability','recommended','Clients may allege that advice, services, errors, or missed deadlines caused financial loss.'],
      ['Cyber Liability','recommended','Professional offices commonly store client, employee, payment, or confidential information.'],
      ['Employment Practices Liability','additional','Hiring, supervision, discipline, and termination can create employment-related claims.'],
      ['Businessowners Policy','recommended','A BOP may combine common property, liability, and business income protections for eligible offices.']
    ],
    retail: [
      ['Businessowners Policy','recommended','Retail operations commonly need coordinated property, liability, and business income protection.'],
      ['Business Property','recommended','Inventory, fixtures, equipment, and tenant improvements can represent a major concentration of value.'],
      ['Business Income','recommended','A covered closure can stop sales while fixed operating expenses continue.'],
      ['Cyber Liability','additional','Point-of-sale systems, ecommerce, customer data, and payment processing create digital exposure.'],
      ['Crime Coverage','additional','Cash, inventory, employee access, and theft can create losses not fully addressed by basic property coverage.']
    ],
    nonprofit: [
      ['General Liability','recommended','Programs, events, volunteers, participants, and visitors can create third-party liability exposure.'],
      ['Directors & Officers Liability','recommended','Board and leadership decisions can lead to allegations involving governance, funds, or organizational management.'],
      ['Volunteer Accident','additional','Volunteer injuries may need a coordinated response beyond ordinary liability protection.'],
      ['Abuse & Molestation','additional','Organizations serving children or vulnerable participants should review safeguards and specialized protection.'],
      ['Business Property','additional','Owned equipment, donated property, offices, and event property may require protection.']
    ],
    healthcare: [
      ['Professional Liability','recommended','Patient care, advice, records, and licensed services can create professional liability exposure.'],
      ['Cyber Liability','recommended','Healthcare organizations often handle protected health information and depend on electronic systems.'],
      ['General Liability','recommended','Patient visits, premises activity, and nonprofessional incidents can create third-party liability claims.'],
      ['Equipment Breakdown','additional','Specialized diagnostic, treatment, refrigeration, or medical equipment may be essential to operations.'],
      ['Employment Practices Liability','additional','Healthcare staffing, credentialing, supervision, and employment decisions can create workplace claims.']
    ],
    technology: [
      ['Technology E&O','recommended','Clients may allege that an error, outage, implementation problem, or missed service commitment caused financial loss.'],
      ['Cyber Liability','recommended','Technology companies may access client systems, credentials, personal information, or critical infrastructure.'],
      ['Business Income','recommended','Revenue may depend on systems, cloud vendors, utilities, and digital services remaining available.'],
      ['Media Liability','additional','Web content, software, advertising, and digital publishing can create intellectual-property or content claims.'],
      ['Products Liability','additional','Hardware, devices, installation, or connected products can create physical product and completed-operations exposure.']
    ],
    'property-management': [
      ['Property Management E&O','recommended','Leasing, accounting, tenant screening, notices, maintenance decisions, and vendor selection can create financial-loss claims.'],
      ['General Liability','recommended','Office operations, property visits, inspections, and management activities can create third-party liability exposure.'],
      ['Crime / Fidelity','recommended','Collecting rents, deposits, assessments, or client funds can create employee dishonesty and funds-transfer exposure.'],
      ['Hired & Non-Owned Auto','additional','Employees or agents may use personal vehicles for inspections, showings, and property visits.'],
      ['Cyber Liability','additional','Tenant, owner, employee, payment, and banking information creates privacy and fraud exposure.']
    ],
    manufacturing: [
      ['Products Liability','recommended','Finished products and components can cause injury, property damage, shutdown, or downstream loss after leaving the facility.'],
      ['Business Property','recommended','Buildings, machinery, stock, raw materials, and work in process can create substantial property exposure.'],
      ['Equipment Breakdown','recommended','Specialized machinery, utilities, boilers, electrical systems, or refrigeration may be critical to production.'],
      ['Business Income','recommended','A breakdown, fire, supplier problem, or utility interruption can halt production and delay orders.'],
      ['Product Recall','additional','Traceability, notification, retrieval, testing, replacement, and disposal can create significant recall costs.']
    ],
    other: [
      ['General Liability','recommended','Most businesses have some combination of premises, customer, product, or off-site liability exposure.'],
      ['Business Property','additional','Equipment, inventory, mobile property, improvements, or customer property may require protection.'],
      ['Business Income','additional','A covered interruption can reduce revenue while necessary operating expenses continue.'],
      ['Cyber Liability','additional','Payments, email, customer information, employee records, and digital systems create cyber exposure for most businesses.'],
      ['Professional Liability','additional','Advice, services, designs, delays, or errors may create financial-loss claims not addressed by general liability.']
    ]
  };

  const val = (answers, key) => answers[key]?.value;
  const hasEmployees = profile => !/owner only|just me|none|0/i.test(`${profile.employees || ''} ${profile.businessSize || ''}`);

  function generate(report) {
    const answersArray = Array.isArray(report.answers) ? report.answers : [];
    const answers = Object.fromEntries(answersArray.map(answer => [answer.key, answer]));
    const industry = report.industry || report.profile?.industry || 'other';
    const profile = report.profile || {};
    const collector = engine.createCollector({ product: 'business' });
    const add = (name, priority, why, trigger = 'Industry profile', extra = {}) =>
      collector.add({ name, priority, why, trigger, ...extra, product: 'business' });

    (industryRules[industry] || industryRules.other).forEach(([name, priority, why]) => add(name, priority, why));

    if (['no','not-sure'].includes(val(answers,'general_liability_status'))) add('General Liability','high','You indicated general liability is missing or has not been confirmed.','Current coverage answer');
    if (['no','not-sure'].includes(val(answers,'property_status'))) add('Business Property','high','You indicated protection for business equipment, inventory, furnishings, or improvements is missing or uncertain.','Current coverage answer');
    if (['no','not-sure'].includes(val(answers,'business_income_status'))) add('Business Income','high','You indicated business income and extra expense protection is missing or uncertain.','Current coverage answer');
    if (['none','outdated','unknown'].includes(val(answers,'workers_comp_status')) && hasEmployees(profile)) add('Workers’ Compensation','high','Your profile indicates a workforce, while workers’ compensation is missing, outdated, or uncertain.','Workforce and current coverage answers');
    if (['no','not-sure'].includes(val(answers,'cyber_status'))) add('Cyber Liability','recommended','You indicated cyber or data breach coverage is missing or has not been confirmed.','Current coverage answer');
    if (['no','not-sure'].includes(val(answers,'umbrella_status'))) add('Commercial Umbrella','recommended','You indicated an additional liability layer is missing or uncertain.','Current coverage answer');
    if (['no','not-sure'].includes(val(answers,'professional_liability_status')) && ['professional-office','healthcare','technology','property-management'].includes(industry)) add(industry === 'technology' ? 'Technology E&O' : industry === 'property-management' ? 'Property Management E&O' : 'Professional Liability','high','Your industry can create financial-loss or professional-service claims, and specialized liability protection is missing or uncertain.','Industry and current coverage answers');
    if (['incomplete','unknown'].includes(val(answers,'shared_vehicles'))) add('Commercial Auto','high','You indicated business vehicle use exists but coverage may be incomplete or uncertain.','Vehicle-use answer');
    if (val(answers,'shared_vehicles') === 'covered') add('Commercial Auto','recommended','You indicated vehicles are used for business. The listed drivers, vehicles, radius, and hired or non-owned exposures should still be verified.','Vehicle-use answer');
    if (['reactive','unknown'].includes(val(answers,'certificate_contracts'))) add('Contracts & Additional Insured Requirements','high','You indicated insurance requirements may be reviewed only after agreements are signed or are not routinely confirmed.','Contract-requirements answer');

    if (industry === 'contractor') {
      if (['basic'].includes(val(answers,'contractor_tools'))) add('Inland Marine','high','You indicated mobile tools or equipment may rely only on basic property coverage.','Contractor tools answer');
      if (['company','mixed','employee'].includes(val(answers,'contractor_vehicles'))) add('Commercial Auto','recommended','You indicated company or employee vehicles are used in contracting operations.','Contractor vehicle answer');
      if (val(answers,'contractor_height') === 'yes') add('Commercial Umbrella','high','You indicated the business performs elevated work, which can increase the severity of a liability claim.','Height-exposure answer');
    }
    if (industry === 'restaurant') {
      if (val(answers,'restaurant_alcohol') === 'yes') add('Liquor Liability','high','You indicated the restaurant serves alcohol.','Alcohol-service answer');
      if (['full-kitchen','limited-cooking'].includes(val(answers,'restaurant_cooking'))) add('Equipment Breakdown','recommended','You indicated cooking or refrigeration equipment is central to the operation.','Cooking-equipment answer');
      if (['delivery','both'].includes(val(answers,'restaurant_service'))) add('Commercial Auto','recommended','You indicated delivery is part of the restaurant operation.','Service-model answer');
    }
    if (industry === 'professional-office' && hasEmployees(profile)) add('Employment Practices Liability','recommended','Your profile indicates employees, making hiring, supervision, discipline, and termination practices worth reviewing.','Business Profile');
    if (industry === 'retail') {
      if (['online','both'].includes(val(answers,'retail_sales'))) add('Cyber Liability','high','You indicated ecommerce or online sales are part of the operation.','Retail sales-channel answer');
      if (['high','seasonal'].includes(val(answers,'retail_inventory'))) add('Business Property','high','You indicated significant or fluctuating inventory values.','Inventory answer');
    }
    if (industry === 'nonprofit') {
      if (val(answers,'nonprofit_youth') === 'yes') add('Abuse & Molestation','high','You indicated programs involve children or other vulnerable participants.','Participant-safeguard answer');
    }
    if (industry === 'healthcare') {
      if (val(answers,'healthcare_procedures') === 'yes') add('Professional Liability','high','You indicated the business provides direct treatment, diagnosis, invasive procedures, or medication-related services.','Clinical-services answer');
      if (['electronic','mixed','substantial'].includes(val(answers,'healthcare_records'))) add('Cyber Liability','high','You indicated the business handles electronic patient or health information.','Patient-records answer');
      if (val(answers,'healthcare_home_visits') === 'yes') add('Commercial Auto','recommended','You indicated services, pickups, deliveries, or patient visits occur away from the main location.','Mobile-operations answer');
    }
    if (industry === 'technology') {
      if (val(answers,'technology_client_systems') === 'yes') add('Technology E&O','high','You indicated an error, outage, missed deadline, or security failure could cause a client financial loss.','Client-dependency answer');
      if (!['minimal',undefined].includes(val(answers,'technology_data'))) add('Cyber Liability','high','You indicated the business accesses, hosts, or manages client data or systems.','Technology-data answer');
      if (val(answers,'technology_products') === 'yes') add('Products Liability','recommended','You indicated the business manufactures, distributes, installs, or maintains hardware or connected devices.','Technology-products answer');
    }
    if (industry === 'property-management') {
      if (val(answers,'pm_professional') === 'yes') add('Property Management E&O','high','You indicated management decisions could cause an owner, tenant, or association financial loss.','Management-services answer');
      if (!['none',undefined].includes(val(answers,'pm_funds'))) add('Crime / Fidelity','high','You indicated the business handles rents, deposits, assessments, or other client funds.','Client-funds answer');
      if (!['none',undefined].includes(val(answers,'pm_showings'))) add('Hired & Non-Owned Auto','recommended','You indicated employees or agents drive for inspections, showings, collections, or property visits.','Property-visit answer');
    }
    if (industry === 'manufacturing') {
      if (val(answers,'manufacturing_products_liability') === 'yes') add('Products Liability','high','You indicated a defective product could cause injury, damage, or customer shutdown.','Product-hazard answer');
      if (['no','informal'].includes(val(answers,'manufacturing_recall'))) add('Product Recall','recommended','You indicated product traceability or recall planning is absent or informal.','Recall-planning answer');
      if (!['light',undefined].includes(val(answers,'manufacturing_process'))) add('Equipment Breakdown','high','You indicated production involves machinery, heat, chemicals, combustible materials, or other specialized processes.','Manufacturing-process answer');
    }
    if (industry === 'other') {
      if (val(answers,'other_advice') === 'yes') add('Professional Liability','high','You indicated advice, design, services, or work could cause a customer financial loss.','Professional-services answer');
      if (['substantial','routine'].includes(val(answers,'other_data'))) add('Cyber Liability','recommended','You indicated the business retains customer, payment, employee, or confidential information.','Data-handling answer');
      if (['inventory','mobile'].includes(val(answers,'other_property'))) add('Business Property','recommended','You indicated inventory, tools, or mobile equipment are essential to the business.','Essential-property answer');
    }

    return collector.values();
  }

  engine.registerProduct('business', { generate });
})();

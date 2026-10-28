import type { PropertyModel, ServiceCategory } from "../types";

/**
 * Approved-style writing library used by the offline proposal writer.
 * Language is deliberately careful: no invented response times, guarantees,
 * certifications or product claims. Treatments are always "selected according
 * to observed conditions and product labels".
 */

export interface ServiceCopy {
  card: string; // short coverage-card line
  coverageTitle: string;
  methodology: string;
  objective: string;
  responsibilities: string[];
  exclusions: string[];
  verification: string[]; // items requiring field verification (internal)
}

export const SERVICE_COPY: Record<ServiceCategory, ServiceCopy> = {
  general_pest: {
    coverageTitle: "General Pests",
    card: "Inspection, monitoring and targeted treatment of covered crawling insects and occasional invaders.",
    methodology:
      "Each visit begins with inspection of the contracted service areas to identify activity, harborage and conducive conditions. Treatments are targeted to the locations where pests live and travel, using crack-and-crevice and spot applications selected according to observed conditions and product labels.",
    objective: "Keep covered pests below the level at which they disrupt operations, occupants or inspections.",
    responsibilities: ["Report pest sightings to the Orkin Pro and site management promptly.", "Address sanitation and moisture conditions identified in service reports."],
    exclusions: [],
    verification: ["Confirm covered-pest list and contracted service areas."],
  },
  rodent: {
    coverageTitle: "Rodents",
    card: "Exterior monitoring, interior trapping and entry-point identification to intercept rodents before they establish.",
    methodology:
      "Rodent management is structured in layers. Exterior devices along the perimeter intercept rodents before they reach the structure; interior devices at entry points, wall lines and risk areas monitor and capture activity that reaches the building. Each serviced device is inspected, cleaned or replenished as required, and activity is recorded so trends can direct device placement and follow-up.",
    objective: "Intercept rodent pressure at the perimeter, detect interior activity early and reduce the conditions that allow entry.",
    responsibilities: [
      "Keep doors closed when not in use and maintain door sweeps and seals.",
      "Repair entry points and structural deficiencies identified in Orkin recommendations.",
      "Maintain clear access to installed devices; do not move or remove devices.",
    ],
    exclusions: ["Exclusion and structural repair work is quoted separately unless expressly included."],
    verification: ["Field-verify entry points, dock seals and door sweeps.", "Confirm device placement map and counts on site.", "Identify rodent species (mouse vs. rat) before finalizing device mix."],
  },
  german_cockroach: {
    coverageTitle: "German Cockroaches",
    card: "Targeted inspection, baiting and follow-up focused on harborage, sanitation and recurring activity.",
    methodology:
      "German cockroach control depends on locating harborage and treating it directly. Service combines detailed inspection of kitchens, baths and adjoining voids with targeted gel bait and crack-and-crevice applications rotated as conditions require. Monitoring identifies units or areas that need follow-up, and sanitation findings are documented so management can address the conditions that sustain populations.",
    objective: "Reduce active infestations, prevent spread between adjoining units or areas and document conditions that require management action.",
    responsibilities: [
      "Coordinate resident or occupant notices and provide access to scheduled areas.",
      "Address sanitation, clutter and moisture conditions identified in service reports.",
      "Identify units or areas with reported activity before each visit.",
    ],
    exclusions: ["Intensive cleanouts are quoted separately unless expressly included."],
    verification: ["Confirm number of affected units/areas and severity.", "Confirm access and preparation requirements."],
  },
  american_cockroach: {
    coverageTitle: "American Cockroaches",
    card: "Drain, utility and perimeter-focused inspection and treatment of large cockroach entry and harborage points.",
    methodology:
      "Large cockroaches typically enter from drains, sewer connections, utility chases and exterior harborage. Service focuses on those pathways with inspection, targeted treatment of harborage and drains, and recommendations for sealing and moisture control.",
    objective: "Reduce entry from drains, utilities and the exterior and limit interior sightings.",
    responsibilities: ["Keep floor drains maintained and trap primers functional.", "Seal utility penetrations recommended by Orkin."],
    exclusions: [],
    verification: ["Confirm drain locations and sewer-connection conditions."],
  },
  bed_bug: {
    coverageTitle: "Bed Bugs",
    card: "Inspection-driven treatment of confirmed activity with preparation and follow-up coordinated with management.",
    methodology:
      "Bed bug service begins with confirmation of activity. Treatment of affected units follows a documented plan with preparation guidance, targeted applications according to product labels and follow-up inspection to verify results. Adjacent units are inspected where the treatment plan calls for it.",
    objective: "Confirm and eliminate active bed bug infestations while limiting spread to adjoining areas.",
    responsibilities: ["Complete unit preparation according to the provided checklist.", "Provide access for treatment and follow-up visits."],
    exclusions: ["Replacement of furniture, mattresses or personal belongings is not included."],
    verification: ["Confirm activity before treatment.", "Confirm unit size/bedroom count for pricing."],
  },
  canine_bed_bug: {
    coverageTitle: "Canine Bed Bug Inspections",
    card: "Scent-detection inspections to screen rooms or units and focus confirmation where alerts occur.",
    methodology:
      "Canine inspections screen designated rooms or units efficiently. Alerts are followed by visual confirmation before any treatment is recommended, so treatment is directed to confirmed activity.",
    objective: "Screen large inventories of rooms or units quickly and target confirmation and treatment precisely.",
    responsibilities: ["Provide room/unit access lists and escort as required.", "Minimize cleaning chemicals and strong odors in inspection areas on inspection day."],
    exclusions: ["Treatment following an inspection is quoted separately unless expressly included."],
    verification: ["Confirm number of rooms/units and inspection logistics."],
  },
  bed_bug_heat: {
    coverageTitle: "Bed Bug Heat Treatment",
    card: "Whole-room heat treatment for confirmed infestations, with preparation and post-treatment verification.",
    methodology:
      "Heat treatment raises room temperatures to levels lethal to bed bugs throughout the treated space. Treatment requires preparation, temperature monitoring during treatment and follow-up inspection.",
    objective: "Eliminate confirmed bed bug activity in treated rooms in a single coordinated treatment event.",
    responsibilities: ["Remove heat-sensitive items per the preparation checklist.", "Provide electrical access as specified."],
    exclusions: ["Damage to heat-sensitive items not removed per preparation guidance is excluded."],
    verification: ["Confirm power availability and room count."],
  },
  exterior_pest: {
    coverageTitle: "Exterior Perimeter",
    card: "Perimeter inspection and targeted exterior treatment to reduce pest pressure before it reaches the building.",
    methodology:
      "Exterior service addresses foundations, entry points, landscape borders and other harborage. Targeted perimeter applications are made where conditions and product labels allow, and conducive conditions such as vegetation contact and moisture are documented.",
    objective: "Reduce pest pressure at the building envelope.",
    responsibilities: ["Maintain vegetation clearance from the structure as recommended."],
    exclusions: [],
    verification: ["Confirm perimeter length and treatable surfaces."],
  },
  mosquito: {
    coverageTitle: "Mosquitoes",
    card: "Breeding-site reduction and targeted treatment of resting areas during the active season.",
    methodology:
      "Mosquito service combines inspection for standing water and breeding sites with targeted treatment of resting vegetation and larval habitat where labels allow. Source-reduction recommendations are documented each visit.",
    objective: "Reduce mosquito activity in occupied outdoor areas during the active season.",
    responsibilities: ["Eliminate standing water identified in service reports."],
    exclusions: [],
    verification: ["Confirm treatment area square footage and sensitive areas (water bodies, gardens)."],
  },
  fly: {
    coverageTitle: "Flies",
    card: "Source identification, sanitation findings and appropriate control for filth and small flies.",
    methodology:
      "Fly management starts with locating breeding sources — drains, waste areas, organic buildup and moisture. Control combines source-reduction recommendations, drain treatments where needed and properly placed fly-management equipment away from food exposure.",
    objective: "Identify and reduce fly breeding sources and limit adult activity in sensitive areas.",
    responsibilities: ["Maintain drains, waste areas and floor-wall junctions per sanitation recommendations."],
    exclusions: [],
    verification: ["Identify fly species and breeding sources on site."],
  },
  drain: {
    coverageTitle: "Drain Treatments",
    card: "Treatment of organic buildup in drains that supports small-fly breeding.",
    methodology: "Drains associated with fly activity are treated to reduce organic buildup that supports breeding, alongside mechanical cleaning recommendations where buildup is significant.",
    objective: "Reduce drain-based small-fly breeding.",
    responsibilities: ["Perform mechanical drain cleaning when recommended."],
    exclusions: ["Plumbing repairs are excluded."],
    verification: ["Confirm number and location of drains."],
  },
  ant: {
    coverageTitle: "Ants",
    card: "Activity-focused inspection, treatment and identification of contributing conditions.",
    methodology: "Ant service identifies the species and trails activity back to nesting sites where possible, then applies baits or targeted treatments appropriate to the species and site.",
    objective: "Reduce ant activity and nesting near and inside the structure.",
    responsibilities: ["Address moisture and food sources identified in service reports."],
    exclusions: [],
    verification: ["Identify ant species before finalizing treatment approach."],
  },
  bird: {
    coverageTitle: "Birds",
    card: "Assessment of roosting and nesting activity with recommendations for deterrent solutions.",
    methodology: "Bird service begins with an assessment of roosting, nesting and loafing areas. Deterrent and exclusion options are recommended and quoted separately based on the structure.",
    objective: "Reduce bird activity at entrances, docks and building features.",
    responsibilities: ["Provide lift or roof access where required."],
    exclusions: ["Deterrent installation is quoted separately unless expressly included."],
    verification: ["Field-verify species and roosting areas; confirm any local or federal protections before any action."],
  },
  wildlife: {
    coverageTitle: "Wildlife",
    card: "Assessment of wildlife activity and entry points, with services scoped to applicable regulations.",
    methodology: "Wildlife-related services are scoped after an on-site assessment. Methods are selected only where permitted by applicable state and local regulations.",
    objective: "Address wildlife activity at the structure within applicable regulations.",
    responsibilities: ["Provide access to attics, crawl spaces and roof areas as needed."],
    exclusions: ["Wildlife methods are subject to applicable law and may require separate authorization."],
    verification: ["Legal review: confirm state wildlife regulations and permits for proposed methods."],
  },
  exterior_baiting: {
    coverageTitle: "Exterior Baiting",
    card: "Perimeter bait stations serviced on schedule to intercept rodent pressure.",
    methodology: "Exterior bait stations are placed along the perimeter and serviced on schedule; bait is replenished and activity recorded according to product labels.",
    objective: "Intercept rodents before they reach the structure.",
    responsibilities: ["Do not move or remove stations; report damaged stations."],
    exclusions: [],
    verification: ["Confirm station placement and label-compliant spacing."],
  },
  interior_trapping: {
    coverageTitle: "Interior Trapping",
    card: "Non-toxic interior trapping at entry points and risk areas.",
    methodology: "Interior trapping devices are placed at entry points, wall lines and risk areas and checked on schedule; captures and activity are recorded.",
    objective: "Detect and capture rodents that reach the interior.",
    responsibilities: ["Maintain access to devices."],
    exclusions: [],
    verification: ["Confirm device locations."],
  },
  sewer_baiting: {
    coverageTitle: "Sewer Baiting",
    card: "Targeted baiting of sewer access points where permitted.",
    methodology: "Sewer baiting is performed at accessible manholes and connections where permitted, with placements recorded each visit.",
    objective: "Reduce rat populations originating from sewer systems.",
    responsibilities: ["Coordinate manhole access and any required permits."],
    exclusions: [],
    verification: ["Confirm municipal permission and product-label requirements for sewer applications."],
  },
  burrow: {
    coverageTitle: "Burrow Treatments",
    card: "Treatment of active rodent burrows in landscaped and exterior areas.",
    methodology: "Active burrows are identified, treated according to product labels and monitored for re-opening.",
    objective: "Reduce exterior rat burrowing near the structure.",
    responsibilities: ["Report new burrow activity."],
    exclusions: [],
    verification: ["Confirm burrow counts and label restrictions near structures/water."],
  },
  seasonal: {
    coverageTitle: "Seasonal Program",
    card: "Service scheduled to match seasonal pest pressure.",
    methodology: "Seasonal service concentrates visits in the months when target pests are active.",
    objective: "Match service intensity to seasonal pest pressure.",
    responsibilities: [],
    exclusions: [],
    verification: ["Confirm active months."],
  },
  consulting: {
    coverageTitle: "Inspection & Consulting",
    card: "Scheduled inspections and written findings to support audits and facility decisions.",
    methodology: "Scheduled inspections evaluate pest risk, sanitation, structural conditions and program performance, with written findings and prioritized recommendations.",
    objective: "Provide documented, independent review of pest risk and program performance.",
    responsibilities: ["Provide access and a point of contact for inspection days."],
    exclusions: [],
    verification: ["Confirm inspection scope and report format."],
  },
  stinging_insect: {
    coverageTitle: "Stinging Insects",
    card: "Treatment or removal of accessible nests on structures when authorized.",
    methodology: "Accessible nests on structures are treated or removed when authorized. Nests that are elevated, off-structure or species-specific are quoted separately.",
    objective: "Reduce stinging-insect risk at entrances and occupied areas.",
    responsibilities: ["Report nests promptly and keep occupants clear of the area."],
    exclusions: ["Nests above 5 ft, off-structure, ground nests and bald-faced hornets may require a separate quote."],
    verification: ["Confirm nest height and species."],
  },
  flea: {
    coverageTitle: "Fleas",
    card: "Targeted treatment of affected units with preparation guidance.",
    methodology: "Flea treatment targets affected units and resting areas with preparation guidance and coordination of pet treatment by the owner.",
    objective: "Eliminate flea activity in affected units.",
    responsibilities: ["Ensure pets are treated by a veterinarian; complete preparation."],
    exclusions: [],
    verification: ["Confirm affected units."],
  },
  custom: {
    coverageTitle: "Custom Service",
    card: "Service scoped specifically for this property.",
    methodology: "Custom service is performed according to the scope described in this proposal.",
    objective: "Address the specific conditions described for this property.",
    responsibilities: [],
    exclusions: [],
    verification: ["Define custom scope in detail."],
  },
};

export const MODEL_CONTEXT: Record<PropertyModel, { risks: { title: string; body: string }[]; environment: string }> = {
  small_office: {
    environment: "office environment",
    risks: [
      { title: "Employee comfort", body: "Pest sightings in workspaces and break areas affect staff confidence and productivity." },
      { title: "Break rooms + food areas", body: "Shared food areas create the conditions pests need; routine inspection keeps small issues small." },
      { title: "Entry points", body: "Doors, utility penetrations and deliveries are the primary routes into an office." },
    ],
  },
  medium_commercial: {
    environment: "commercial property",
    risks: [
      { title: "Tenant experience", body: "Visible pest activity in common areas affects tenant confidence and retention." },
      { title: "Shared systems", body: "Common utilities and waste areas allow activity to move between suites." },
      { title: "Documentation", body: "Consistent records support property management and tenant communication." },
    ],
  },
  large_industrial: {
    environment: "industrial facility",
    risks: [
      { title: "Production continuity", body: "Pest activity in production and support areas can interrupt operations and inspections." },
      { title: "Docks + perimeter", body: "Loading docks and long perimeter walls are the most common rodent entry routes." },
      { title: "Audit readiness", body: "Device maps, service records and trend data support internal and third-party audits." },
      { title: "Scale", body: "Large footprints require a disciplined device layout and route so nothing is missed." },
    ],
  },
  warehouse: {
    environment: "warehouse and distribution operation",
    risks: [
      { title: "Inventory protection", body: "Rodents and stored-product pests can damage goods and packaging." },
      { title: "Dock doors", body: "Open dock doors, damaged seals and pallets carry pests inside." },
      { title: "Racking + wall lines", body: "Rodents travel along walls and racking; device placement follows those routes." },
    ],
  },
  multifamily: {
    environment: "multifamily community",
    risks: [
      { title: "Resident health + comfort", body: "Respond to confirmed activity and conditions affecting occupied living spaces." },
      { title: "Property + infrastructure", body: "Flag pests, entry points and environmental issues before damage compounds." },
      { title: "Reputation + retention", body: "Support resident confidence with predictable service and documented follow-up." },
    ],
  },
  restaurant: {
    environment: "food-service operation",
    risks: [
      { title: "Health inspections", body: "Pest evidence during an inspection can carry serious consequences for a food-service operation." },
      { title: "Guest experience", body: "A single sighting in the dining room can affect reviews and repeat business." },
      { title: "Back of house", body: "Kitchens, dish and storage areas provide food, water and harborage." },
    ],
  },
  healthcare: {
    environment: "healthcare environment",
    risks: [
      { title: "Patient + resident safety", body: "Sensitive populations require careful product selection and coordinated service." },
      { title: "Regulatory oversight", body: "Accurate documentation supports survey and accreditation readiness." },
      { title: "Food service + laundry", body: "Support areas present the highest pest pressure in most facilities." },
    ],
  },
  government: {
    environment: "government facility",
    risks: [
      { title: "Public trust", body: "Facilities serving the public must remain clean and pest-free." },
      { title: "Compliance + records", body: "Service documentation must stand up to procurement and oversight review." },
      { title: "Controlled access", body: "Service is planned around security procedures and restricted areas." },
    ],
  },
  campus: {
    environment: "campus environment",
    risks: [
      { title: "Multiple buildings", body: "Different building uses create different pest pressures across one campus." },
      { title: "Food service + housing", body: "Dining and residential buildings require more frequent attention." },
      { title: "Consistency", body: "A single program standard keeps service consistent across buildings." },
    ],
  },
  exterior_only: {
    environment: "property exterior",
    risks: [
      { title: "Perimeter pressure", body: "Most interior pest problems begin at the exterior." },
      { title: "Landscaping + waste", body: "Vegetation, moisture and refuse areas create harborage." },
    ],
  },
  specialty: {
    environment: "property",
    risks: [
      { title: "Active infestation", body: "Active infestations require an intensive, coordinated response." },
      { title: "Occupant coordination", body: "Preparation and access determine treatment success." },
    ],
  },
};

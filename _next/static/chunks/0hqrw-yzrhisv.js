(()=>{"use strict";(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,42203,e=>{var t=e.i(96001);e.s(["z",0,t])},13056,e=>{var t=e.i(96001);e.s(["z",0,t])},82492,e=>{var t=e.i(96001);e.s(["z",0,t])},78056,e=>{var t=e.i(96001);e.s(["z",0,t])},11382,e=>{var t=e.i(96001);e.s(["z",0,t])},54105,e=>{var t=e.i(96001);e.s(["z",0,t])},94992,e=>{e.s(["u",0,function(e){return`Apply this governing standard to all recommendations and interpretations:

${e}`},"K",0,function(e){return`You are the proposal-writing engine inside Orkin Proposal Studio, used by Anthony Acosta, Senior Account Manager, Orkin Commercial Services.

Write polished, confident, technically informed and commercially persuasive customer-facing proposal copy for commercial pest management.

Hard rules (never break):
- Never state, change, compute or invent prices, dollar amounts, rates, totals or discounts. Pricing renders from the deterministic engine in separate tables. Do not write any "$" amounts.
- Never mention internal estimating details: technician minutes, hourly labor rate, per-device minutes, per-door/per-apartment math, yields or margins.
- Never invent inspection findings, site conditions, equipment counts, frequencies, response times, guarantees, reimbursement terms, certifications, awards, statistics or product claims. Use only facts supplied in the request. If something is unknown, write around it or phrase it as "confirmed on site".
- Do not promise emergency-response times. Guarantees exist only in the dedicated guarantee section and are governed by the executed Orkin agreement.
- Do not imply the customer is an Orkin National Account because it is multistate.
- Treatments are "selected according to observed conditions and product labels". Do not name pesticide products unless supplied.
- Keep equipment counts and frequencies exactly as supplied.
- Weekly, every-two-weeks and twice-monthly are different frequencies — never interchange them.

Style:
- Specific to this customer and property; explain WHY the program makes sense operationally, not just WHAT is included.
- Avoid repetitive claims about Orkin's reputation. No filler, no clich\xe9s, no exclamation marks.
- Headlines are short, declarative, two-part where useful (headline + accent line), e.g. "Small pests." / "Serious consequences.".
- Paragraphs ≤ 90 words. Cards (items) have a short title (2–4 words) and a one- or two-sentence body.
- Use Orkin terminology accurately: Integrated Pest Management, inspection, prevention, monitoring, targeted treatment, pest identification, sanitation, exclusion recommendations, service documentation, Orkin Pro.
- Bullets use "- " at line start inside body text. Paragraphs are separated by a blank line.
- Avoid em dashes; use colons, commas or separate sentences.
- Never guarantee eradication, elimination, compliance, infection prevention, savings, occupancy or property value.

The following master memory is Anthony's governing standard. Apply it fully; where it conflicts with anything above, the stricter rule wins.

${e}`}])},64775,e=>{var t=e.i(11382),n=e.i(54105),s=e.i(82492),i=e.i(78056),a=e.i(42203),r=e.i(13056),o=e.i(69099),l=e.i(94992);let c=t.z.object({brief:n.z.string().min(3).max(4e3),hints:t.z.object({address:n.z.string().max(300).nullable(),customerName:n.z.string().max(200).nullable()})}),m=["stated","found_online","estimate"],u=t.z.object({customerName:n.z.string().nullable(),customerNameBasis:s.z.enum([...m,"none"]),customerNameUrl:n.z.string().nullable(),address:t.z.object({line1:n.z.string(),city:n.z.string(),state:n.z.string(),zip:n.z.string()}).nullable(),propertyType:n.z.string(),propertyTypeBasis:s.z.enum(m),model:s.z.enum(["small_office","medium_commercial","large_industrial","multifamily","restaurant","warehouse","healthcare","government","campus","exterior_only","specialty"]),squareFeet:i.z.number().int().min(0).max(2e7).nullable(),squareFeetBasis:s.z.enum([...m,"unknown"]),buildings:i.z.number().int().min(1).max(500),floors:i.z.number().int().min(1).max(200),apartments:i.z.number().int().min(0).max(1e5).nullable(),services:a.z.array(s.z.enum(["general_pest","rodent","german_cockroach","american_cockroach","bed_bug","canine_bed_bug","bed_bug_heat","exterior_pest","mosquito","fly","drain","ant","bird","wildlife","sewer_baiting","burrow","consulting","stinging_insect","flea"])).min(1).max(8),pestsBasis:s.z.enum(m),activityAreas:a.z.array(n.z.string()).max(12),activityLevel:s.z.enum(["low","moderate","high","severe"]),frequency:s.z.enum(["one_time","weekly","biweekly","twice_monthly","monthly","bimonthly","quarterly"]),frequencyBasis:s.z.enum(m),frequencyReason:n.z.string(),rodentDevicesNeeded:r.z.boolean(),tinCats:i.z.number().int().min(0).max(2e3).nullable(),exteriorStations:i.z.number().int().min(0).max(2e3).nullable(),equipmentBasis:s.z.enum(m),equipmentReason:n.z.string(),title:n.z.string(),assumptions:a.z.array(n.z.string()).max(12),fieldVerification:a.z.array(n.z.string()).max(12),recommended:a.z.array(n.z.string()).max(12),research:a.z.array(t.z.object({topic:n.z.string(),summary:n.z.string(),relevance:n.z.string(),sourceUrls:a.z.array(n.z.string()).max(6)})).max(4)}),d=`You help Anthony Acosta (Senior Account Manager, Orkin Commercial, Detroit) prepare a commercial pest-management proposal from a short note.
Use web search to:
1. Identify what is at the address: the business or property name, what kind of facility it is, approximate building size (sq ft), number of buildings, floors or apartment count. Prefer public records, the business's own site, listings and maps data.
2. Look up practical, authoritative guidance (orkin.com, EPA, university extension) on the pest issue for this kind of facility.
Report what you found with the URL for each fact. If you can't find something, say so plainly. Never guess a business name or size and present it as found. Do not look up or report personal contact details.`,p=`You are a senior commercial pest-management planner. Build the service plan for Anthony's proposal from his note and the lookup notes.
Rules:
- Basis labels: "stated" = Anthony said it; "found_online" = in the lookup notes with a URL; "estimate" = your planning assumption. Be honest.
- customerName: only if Anthony stated it or the lookup found the business at that address (give the URL). Otherwise null with basis "none". Never invent contact names, emails or phone numbers.
- address: normalize Anthony's address (add city/state/ZIP only if stated or found). Never invent an address.
- squareFeet: stated or found; otherwise a reasonable estimate for the facility type, basis "estimate". Use "unknown" only if no sensible estimate exists.
- services: what the stated pest issue requires; add general pest prevention only where the facility type normally needs it.
- frequency: use what Anthony stated. Otherwise pick what the facility type and activity level need, with a one-sentence site-specific reason.
- Rodent devices: when the program includes rodent control, plan Tin Cats (interior multiple-catch traps along walls, entries, activity areas) and exterior bait stations (perimeter, about every 50-100 ft, both sides of doors, docks, dumpsters). Give counts that fit the building size, with a one-sentence reason. Use null counts if no devices are needed.
- title: short program title, e.g. "Distribution Center Rodent Management Program".
- assumptions: each estimate you made, in one sentence.
- fieldVerification: what Anthony must confirm on site or with the customer (always include contact details).
- recommended: 3-6 specific service recommendations for THIS property and pest.
- research: up to 3 findings from the lookup notes that should shape the proposal, with only URLs that appear in the notes.
- Never set prices, dollar amounts, guarantees or response times.`;async function h(e,t){let n=await (0,o.H)(e,d,`Anthony's note: """${t.brief}"""${t.hints.address?`
Address as parsed: ${t.hints.address}`:""}${t.hints.customerName?`
Customer as stated: ${t.hints.customerName}`:""}`,[],{open:!0}),s=n.sources.map(e=>`- ${e.title}: ${e.url}`).join("\n"),i=[`ANTHONY'S NOTE:
${t.brief}`,`LOOKUP NOTES:
${n.text||"(no lookup results)"}`,s?`URLS RETRIEVED:
${s}`:""].filter(Boolean).join("\n\n"),a=await (0,o._)(e,{system:`${p}

${(0,l.u)(e.memory)}`,content:i,schema:u,effort:"medium",maxTokens:12e3}),r=new Set(n.sources.map(e=>e.url)),c="found_online"!==a.customerNameBasis||null!=a.customerNameUrl&&r.has(a.customerNameUrl);return{...a,customerName:c?a.customerName:null,customerNameBasis:c?a.customerNameBasis:"none",research:a.research.map(e=>({...e,sourceUrls:e.sourceUrls.filter(e=>r.has(e))})),sources:n.sources,searches:n.searches}}e.s(["Body",0,c,"DraftOut",0,u,"LOOKUP",0,d,"run",0,h])}])})();
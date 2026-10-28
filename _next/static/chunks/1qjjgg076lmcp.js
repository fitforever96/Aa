(()=>{"use strict";(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,42203,e=>{var t=e.i(96001);e.s(["z",0,t])},82492,e=>{var t=e.i(96001);e.s(["z",0,t])},68217,88826,e=>{var t=e.i(96001);e.s(["z",0,t],68217),e.s(["z",0,t],88826)},11382,e=>{var t=e.i(96001);e.s(["z",0,t])},40192,38620,e=>{var t=e.i(96001);e.s(["z",0,t],40192),e.s(["z",0,t],38620)},54105,e=>{var t=e.i(96001);e.s(["z",0,t])},94992,e=>{e.s(["u",0,function(e){return`Apply this governing standard to all recommendations and interpretations:

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

${e}`}])},91355,e=>{var t=e.i(11382),i=e.i(40192),r=e.i(54105),n=e.i(38620),a=e.i(42203),s=e.i(82492),o=e.i(68217),c=e.i(88826),l=e.i(69099),p=e.i(94992);let d=t.z.object({facts:i.z.record(r.z.string(),n.z.unknown()),priceKeys:a.z.array(t.z.object({key:r.z.string().max(80),label:r.z.string().max(200)})).max(20),length:s.z.enum(["one_page","two_page","short","full"]),instruction:r.z.string().max(2e3).optional()}),u=o.z.literal([1,2,3]).describe("1 essential, 2 supporting, 3 optional depth"),m=t.z.object({title:r.z.string(),body:r.z.string()}),g=c.z.union([t.z.object({kind:o.z.literal("heading"),priority:u,title:r.z.string(),accent:r.z.string(),lead:r.z.string()}),t.z.object({kind:o.z.literal("label"),priority:u,text:r.z.string()}),t.z.object({kind:o.z.literal("paragraph"),priority:u,text:r.z.string()}),t.z.object({kind:o.z.literal("callout"),priority:u,title:r.z.string(),text:r.z.string(),emphasis:r.z.string()}),t.z.object({kind:o.z.literal("checks"),priority:u,title:r.z.string(),items:a.z.array(m).max(6)}),t.z.object({kind:o.z.literal("darkColumns"),priority:u,title:r.z.string(),columns:a.z.array(m).min(2).max(3)}),t.z.object({kind:o.z.literal("stats"),priority:u,title:r.z.string(),stats:a.z.array(t.z.object({value:r.z.string(),label:r.z.string()})).min(2).max(4)}),t.z.object({kind:o.z.literal("scope"),priority:u,cards:a.z.array(t.z.object({eyebrow:r.z.string(),title:r.z.string(),priceKey:r.z.string(),priceSuffix:r.z.string(),bullets:a.z.array(r.z.string()).max(6)})).min(1).max(8)}),t.z.object({kind:o.z.literal("bigNumber"),priority:u,title:r.z.string(),value:r.z.string(),caption:r.z.string(),text:r.z.string()}),t.z.object({kind:o.z.literal("charge"),priority:u,title:r.z.string(),priceKey:r.z.string(),priceLabel:r.z.string(),text:r.z.string()}),t.z.object({kind:o.z.literal("note"),priority:u,text:r.z.string()}),t.z.object({kind:o.z.literal("steps"),priority:u,title:r.z.string(),items:a.z.array(m).max(5)})]),h=t.z.object({hero:t.z.object({eyebrow:r.z.string(),title:r.z.string(),subtitle:r.z.string(),tagline:r.z.string(),stats:a.z.array(t.z.object({value:r.z.string(),label:r.z.string()})).max(4)}),blocks:a.z.array(g).max(32)}),y={one_page:"ONE page: about 7 to 9 blocks. Short paragraphs (2 sentences). Skip optional depth.",two_page:"TWO pages: about 12 to 16 blocks.",short:"about THREE to FOUR pages: about 16 to 22 blocks.",full:"a complete proposal of about four to six dense pages: about 20 to 30 blocks, including depth on biology, method and evidence where the facts support it."},z=`You write commercial pest-management proposals for Anthony Acosta, Senior Account Manager, Orkin Commercial. Your output is a structured "story" rendered as a dense, portrait, designed PDF.

HOW ANTHONY'S BEST PROPOSALS WORK (follow this):
- They argue for a specific response at a specific building. Open with an assessment that classifies the condition from the facts given (where activity is, how it moves through this building type).
- Name the gap: a callout explaining why a lighter or complaint-only approach would fall short HERE (e.g. "Why a complaint-only response is not sufficient", "Fourteen days creates a blind interval"). End the callout with a one-line red "emphasis" conclusion.
- Objectives: 4 checks, each a 3-6 word title and a 1-2 sentence body tied to this site.
- One dark three-column insight: how this pest behaves or spreads in this kind of building (e.g. vertical pathways / concealed activity / control implication).
- "Control plan at a glance" stats using the exact counts provided.
- A "heading" before the scope (e.g. "Scope of service" with a one-line lead).
- Scope cards: a "First service / Initial setup" card and a "Thereafter / <frequency> service" card when both prices exist, each with 3-5 concrete bullets using the exact device counts, areas and capacities in the facts. Use priceKey to attach prices; priceSuffix like " / VISIT" for recurring.
- Capacity math in a bigNumber block when apartments/units and per-visit capacity are given (only the arithmetic provided in the facts).
- A charge block for each separately priced item, using its priceKey.
- A paragraph explaining why this frequency is required now, and how frequency and scope will be re-evaluated from documented findings.
- Headings and labels are short and punchy. Two-tone headings use "title" + red "accent" (e.g. title "Control incoming rats.", accent "Find hidden residency.").

RULES:
- Use only the facts provided. Never invent inspection findings, counts, dimensions, product names, case studies, statistics, certifications, response times or guarantees.
- Never write dollar amounts or prices in any text; prices appear only through priceKey (use only keys from the list).
- No promises of elimination, eradication or guaranteed results; say "reduce", "control", "intercept", "document".
- Do not write customer responsibilities, exclusions, guarantee terms or a price summary; those are added from approved wording.
- priority: 1 = essential (assessment, scope, charges), 2 = supporting argument, 3 = optional depth. Shorter versions drop 3, then 2.
- Plain, direct, professional. No buzzwords, no exclamation marks, minimal em dashes.
- hero: eyebrow like "COMMERCIAL RODENT CONTROL"; title = site or customer name; subtitle = program name; tagline = 3-4 method phrases separated by "  |  "; up to 4 stats from the facts (value + short label).`;async function b(e,t){let i=[t.instruction?`ANTHONY'S INSTRUCTION: ${t.instruction}`:"",`LENGTH: ${y[t.length]}`,`PRICE KEYS (attach with priceKey; never write amounts):
${t.priceKeys.map(e=>`- ${e.key}: ${e.label}`).join("\n")||"(none)"}`,`FACTS:
${JSON.stringify(t.facts,null,1)}`].filter(Boolean).join("\n\n");return(0,l._)(e,{system:`${z}

${(0,p.K)(e.memory)}`,content:i,schema:h,effort:"medium",maxTokens:24e3})}e.s(["BlockOut",0,g,"Body",0,d,"STORY_SYSTEM",0,z,"StoryOut",0,h,"run",0,b])}])})();
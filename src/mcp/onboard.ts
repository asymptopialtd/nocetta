/**
 * The seeding protocol, delivered as an on-demand MCP prompt (not the
 * always-present server instructions). It runs at most once per project —
 * when nocetta is dropped into a codebase or world that already exists and
 * the store is empty — so it must not ride every session's context budget the
 * way INSTRUCTIONS does. A prompt is invoked deliberately by the user in the
 * client, off the six-tool cap, which is exactly the shape a once-per-project
 * payload wants.
 *
 * Tone is investigative discipline, not persona: the failure mode this guards
 * against is an agent inventorying the whole corpus (the document-dump that
 * dogfood 2026-09-09 exposed), and a detective is the opposite of an archivist
 * — hunt the few load-bearing facts, demand a receipt for each, stop. The
 * receipt requirement leans on resolveAnchor's real refusal (unanchorable →
 * candidates), so the anti-prose gate enforces itself rather than asking
 * politely. Substrate-neutral by design: the same protocol seeds code or canon,
 * only the anchor surface (symbol vs heading) and kind (claim vs lore-fact)
 * differ.
 */
export const ONBOARD_PROMPT = `You're seeding nocetta for a project that already exists. The store is empty, and your job is to lay down the load-bearing beliefs it should have started with — not to catalog the project. Work like an investigator, not an archivist: read enough to know where the project's truth lives (its code, design docs, canon), then hunt for the few facts that carry weight and demand a receipt for every one.

A belief earns a place only if a future session would get it wrong, re-derive it, or silently violate it without it. If its absence wouldn't bite, leave it out. Here, completeness is the failure mode, not the goal.

Every belief cites its receipt — the exact place its truth lives:
- code behavior → memory_remember kind "claim", anchored with artifact_path + symbol_name
- a decision and its why → kind "value"
- a fact from a design doc or canon → kind "lore-fact", anchored with artifact_path + heading
If you can't name a receipt, you don't have a belief yet — either it isn't load-bearing, or you haven't found where it's decided. remember refuses an anchor it can't resolve and hands you candidates; treat that refusal as the signal to sharpen or drop, never to guess.

Go in this order, and keep each layer thin:

1. The rules. What must ALWAYS or NEVER hold here — the constraints someone could break without noticing? These are few. Capture each at authority "invariant", anchored to wherever the rule is decreed. Show these to me before you go on: authority is my call, not yours.

2. The load-bearing facts. For the parts of the project touched most, what behavior or canon would a future session re-derive or contradict? Anchor each to its receipt. Tens of these, not hundreds.

3. Stop. Don't sweep up the long tail — it gets captured later, when real work actually consults it. Over-seeding rebuilds a document dump, the one thing this store must not be.

Two habits throughout. Be skeptical of the corpus: when two sources disagree, that contradiction is itself a finding — capture both and let it surface, don't smooth it over. And when you're done, run memory_worklist once; it shows you the contradictions your own seeding just exposed. Then report what you captured and what you deliberately left out.`;

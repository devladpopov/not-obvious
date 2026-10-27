/** Divergence techniques. Each one is a short operator prompt applied against the cliché cloud. */

export interface Technique {
  id: string;
  name: string;
  instruction: string;
}

export const TECHNIQUES: Technique[] = [
  {
    id: "scamper",
    name: "SCAMPER",
    instruction:
      "Apply SCAMPER (Substitute, Combine, Adapt, Modify/Magnify, Put to other use, Eliminate, Reverse). For each idea name the letter you used and what exactly changed versus the closest cliché.",
  },
  {
    id: "triz",
    name: "TRIZ contradiction",
    instruction:
      "Find the core contradiction hidden in the task (improving X worsens Y). Resolve it with a TRIZ inventive principle (segmentation, taking out, local quality, asymmetry, nesting, prior action, the other way round, dynamics, partial or excessive action, another dimension, self-service, copying, cheap short-living objects). Name the principle.",
  },
  {
    id: "morphological",
    name: "Morphological matrix",
    instruction:
      "Break the problem into 3-5 independent dimensions, list 4 unusual options per dimension (skip the options the clichés already use), then pick combinations no cliché covers.",
  },
  {
    id: "far-analogy",
    name: "Far analogy",
    instruction:
      "Take mechanisms from distant domains (biology, military logistics, liturgy, sports refereeing, geology, theatre, insurance, ant colonies, etc.). Transfer the mechanism, not the surface. Name the source domain.",
  },
  {
    id: "constraint-flip",
    name: "Constraint flip",
    instruction:
      "List the assumptions every cliché silently shares. Flip one assumption per idea (make free what is paid, make slow what is fast, remove the main feature, serve the anti-customer) and build a working idea on the flipped assumption.",
  },
];

export function technique(id: string): Technique {
  const t = TECHNIQUES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown technique "${id}". Use one of: ${TECHNIQUES.map((x) => x.id).join(", ")}`);
  return t;
}

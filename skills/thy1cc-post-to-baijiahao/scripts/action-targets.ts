export interface ActionCandidate {
  id: number;
  tagName: string;
  role: string;
  text: string;
  ownText: string;
  area: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function scoreCandidate(candidate: ActionCandidate, label: string): number {
  const text = normalizeText(candidate.text);
  const ownText = normalizeText(candidate.ownText);

  const exactText = text === label;
  const exactOwnText = ownText === label;
  const includesText = text.includes(label);
  const includesOwnText = ownText.includes(label);

  if (!exactText && !exactOwnText && !includesText && !includesOwnText) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (exactText) score += 300;
  else if (exactOwnText) score += 260;
  else if (includesText) score += 120;
  else if (includesOwnText) score += 90;

  if (candidate.tagName === 'BUTTON') score += 80;
  else if (candidate.role === 'button') score += 60;
  else if (candidate.tagName === 'A') score += 40;

  if (ownText) score += 10;

  score -= Math.min(candidate.area / 1000, 40);
  score -= Math.min(text.length / 40, 20);
  return score;
}

export function pickActionCandidate(candidates: ActionCandidate[], labels: string[]): ActionCandidate | null {
  const normalizedLabels = labels.map(normalizeText).filter(Boolean);

  let best: ActionCandidate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const label of normalizedLabels) {
    for (const candidate of candidates) {
      const score = scoreCandidate(candidate, label);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best && bestScore >= 300) {
      break;
    }
  }

  return best;
}

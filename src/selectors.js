// Best-effort selectors for chat input, assistant bubbles, and points
export const INPUT_CANDIDATES = [
  'textarea',
  '[contenteditable="true"]',
  'input[type="text"]',
  'input[autocomplete="one-time-code"]'
];

export const ASSISTANT_BUBBLE_CANDIDATES = [
  '.message.assistant', '[data-role="assistant"]', '.ai', '.prose', '[class*="assistant"]', '[class*="AI"]'
];

export const POINTS_CANDIDATES = [
  '[data-testid="points"]', '.points', '[class*="points"]', '[aria-label*="points"]', '[title*="points"]'
];

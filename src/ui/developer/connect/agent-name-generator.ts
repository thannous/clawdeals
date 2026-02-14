const FRUITS = [
  "banana",
  "mango",
  "kiwi",
  "lime",
  "lemon",
  "orange",
  "melon",
  "papaya",
  "grape",
  "coco"
];

const ANIMALS = [
  "otter",
  "panda",
  "shark",
  "ferret",
  "lobster",
  "fox",
  "koala",
  "tiger"
];

const ADJECTIVES = [
  "happy",
  "spicy",
  "sneaky",
  "wild",
  "salty",
  "noisy",
  "tiny",
  "turbo"
];

const OBJECTS = [
  "toaster",
  "waffle",
  "noodle",
  "taco",
  "burrito",
  "pickle",
  "rocket",
  "radar"
];

const FINANCE_WORDS = [
  "alpha",
  "delta",
  "hedge",
  "broker",
  "candle",
  "swing",
  "grid",
  "maker",
  "scalper"
];

const VARIANTS = ["v2", "x", "mini"];

function pick(words: string[]): string {
  return words[Math.floor(Math.random() * words.length)];
}

export function generateFunnyAgentName(): string {
  const templates = [
    () => `bot-${pick(FRUITS)}-${pick(FINANCE_WORDS)}`,
    () => `bot-${pick(ADJECTIVES)}-${pick(ANIMALS)}-${pick(FINANCE_WORDS)}`,
    () => `bot-${pick(OBJECTS)}-${pick(FINANCE_WORDS)}`
  ];

  let result = templates[Math.floor(Math.random() * templates.length)]();
  if (Math.random() < 0.3) {
    result = `${result}-${pick(VARIANTS)}`;
  }

  return result;
}

export const ADJECTIVES = [
  'Amber', 'Blazing', 'Calm', 'Crimson', 'Drifting', 'Eager', 'Fading',
  'Gentle', 'Hidden', 'Iron', 'Jade', 'Keen', 'Lunar', 'Misty', 'Noble',
  'Olive', 'Pale', 'Quiet', 'Rapid', 'Silver', 'Tidal', 'Umber', 'Vivid',
  'Wandering', 'Xenial', 'Yellow', 'Zesty', 'Arctic', 'Brave', 'Cobalt',
  'Dusty', 'Electric', 'Frozen', 'Golden', 'Hollow', 'Indigo', 'Jolly',
  'Kinetic', 'Lively', 'Mossy', 'Neon', 'Ochre', 'Plum', 'Rusty', 'Sandy',
  'Turquoise', 'Urban', 'Violet', 'Warm', 'Xeric'
];

export const ANIMALS = [
  'Badger', 'Bear', 'Crane', 'Crow', 'Deer', 'Dove', 'Duck', 'Eagle',
  'Falcon', 'Finch', 'Fox', 'Frog', 'Gecko', 'Goat', 'Hawk', 'Heron',
  'Ibis', 'Jackal', 'Jay', 'Kite', 'Lemur', 'Lynx', 'Mink', 'Mole',
  'Newt', 'Otter', 'Owl', 'Panda', 'Parrot', 'Penguin', 'Pike', 'Puma',
  'Quail', 'Raven', 'Robin', 'Rooster', 'Salamander', 'Seal', 'Shrew',
  'Skunk', 'Sloth', 'Snipe', 'Sparrow', 'Stork', 'Swan', 'Swift', 'Toad',
  'Vole', 'Weasel', 'Wolf'
];

export function assignName(takenNames) {
  const maxAttempts = ADJECTIVES.length * ANIMALS.length;
  for (let i = 0; i < maxAttempts; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const ani = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const name = `${adj} ${ani}`;
    if (!takenNames.has(name)) return name;
  }
  // Systematic fallback: iterate all combinations
  for (const adj of ADJECTIVES) {
    for (const ani of ANIMALS) {
      const name = `${adj} ${ani}`;
      if (!takenNames.has(name)) return name;
    }
  }
  throw new Error('Name pool exhausted');
}

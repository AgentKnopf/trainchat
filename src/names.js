export const ADJECTIVES = [
  'Amber', 'Blazing', 'Calm', 'Crimson', 'Drifting', 'Eager', 'Fading',
  'Gentle', 'Hidden', 'Iron', 'Jade', 'Keen', 'Lunar', 'Misty', 'Noble',
  'Olive', 'Pale', 'Quiet', 'Rapid', 'Silver', 'Tidal', 'Umber', 'Vivid',
  'Wandering', 'Xenial', 'Yellow', 'Zesty', 'Arctic', 'Brave', 'Cobalt',
  'Dusty', 'Electric', 'Frozen', 'Golden', 'Hollow', 'Indigo', 'Jolly',
  'Kinetic', 'Lively', 'Mossy', 'Neon', 'Ochre', 'Plum', 'Rusty', 'Sandy',
  'Turquoise', 'Urban', 'Violet', 'Warm', 'Xeric',
  'Breezy', 'Cloudy', 'Copper', 'Dazzling', 'Emerald', 'Frosty', 'Glowing',
  'Hazy', 'Icy', 'Lanky', 'Mellow', 'Nimble', 'Onyx', 'Pastel', 'Radiant',
  'Scarlet', 'Shiny', 'Snowy', 'Stormy', 'Tiny', 'Twilight', 'Velvet',
  'Wispy', 'Ancient', 'Bitter', 'Clever', 'Fearless', 'Mighty', 'Smooth'
];

export const ANIMALS = [
  'Badger', 'Bear', 'Crane', 'Crow', 'Deer', 'Dove', 'Duck', 'Eagle',
  'Falcon', 'Finch', 'Fox', 'Frog', 'Gecko', 'Goat', 'Hawk', 'Heron',
  'Ibis', 'Jackal', 'Jay', 'Kite', 'Lemur', 'Lynx', 'Mink', 'Mole',
  'Newt', 'Otter', 'Owl', 'Panda', 'Parrot', 'Penguin', 'Pike', 'Puma',
  'Quail', 'Raven', 'Robin', 'Rooster', 'Salamander', 'Seal', 'Shrew',
  'Skunk', 'Sloth', 'Snipe', 'Sparrow', 'Stork', 'Swan', 'Swift', 'Toad',
  'Vole', 'Weasel', 'Wolf',
  'Albatross', 'Bison', 'Capybara', 'Cheetah', 'Dolphin', 'Elk',
  'Flamingo', 'Gorilla', 'Hamster', 'Hedgehog', 'Jaguar', 'Kangaroo',
  'Kingfisher', 'Koala', 'Llama', 'Lobster', 'Manatee', 'Narwhal',
  'Ocelot', 'Peacock', 'Pelican', 'Platypus', 'Quokka', 'Raccoon',
  'Tapir', 'Walrus', 'Wolverine', 'Yak', 'Axolotl', 'Chameleon'
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

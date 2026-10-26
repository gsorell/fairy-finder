// Sky Sketch words: things a kid can draw in a minute and a kid can guess.
export const WORDS = [
  'cat', 'dog', 'fish', 'bird', 'snake', 'turtle', 'whale', 'shark', 'octopus', 'crab',
  'bee', 'butterfly', 'ladybug', 'spider', 'snail', 'frog', 'rabbit', 'mouse', 'owl', 'penguin',
  'elephant', 'giraffe', 'lion', 'monkey', 'pig', 'cow', 'horse', 'duck', 'chicken', 'dinosaur',
  'unicorn', 'dragon', 'mermaid', 'fairy', 'ghost', 'robot', 'alien', 'snowman', 'pirate', 'king',
  'sun', 'moon', 'star', 'cloud', 'rainbow', 'lightning', 'snowflake', 'tornado', 'volcano', 'mountain',
  'tree', 'flower', 'sunflower', 'mushroom', 'cactus', 'leaf', 'island', 'beach', 'wave', 'river',
  'house', 'castle', 'tent', 'igloo', 'bridge', 'ladder', 'door', 'window', 'bed', 'chair',
  'car', 'train', 'boat', 'airplane', 'rocket', 'bicycle', 'bus', 'tractor', 'submarine', 'hot air balloon',
  'apple', 'banana', 'cherry', 'grapes', 'watermelon', 'strawberry', 'carrot', 'pizza', 'ice cream', 'cupcake',
  'donut', 'cookie', 'cake', 'lollipop', 'popcorn', 'sandwich', 'egg', 'cheese', 'pumpkin', 'pineapple',
  'ball', 'kite', 'balloon', 'crown', 'hat', 'glasses', 'shoe', 'sock', 'umbrella', 'key',
  'clock', 'book', 'pencil', 'scissors', 'guitar', 'drum', 'bell', 'magnet', 'wand', 'treasure chest',
  'heart', 'smile', 'eye', 'hand', 'tooth', 'bubble', 'anchor', 'flag', 'candle', 'present',
]

export function shuffled(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

import type { JournalCatalyst } from '../journalData';

// Crossroads Journal catalysts: what happens, the approaches (first check) and the climax (last check).

export const CATALYSTS_TABLE: JournalCatalyst[] = [
  {
    id: 'derelictSignal', name: 'A derelict’s signal', tags: ['salvage', 'tech', 'void'], tables: ['salvage', 'knowledge'],
    text: 'An old distress beacon starts up again, repeating a code no one has used since before the Nexus opened.',
    approaches: [
      { id: 'board', label: 'Board it and take what’s there', skill: 'might', tags: ['bold', 'salvage'], text: 'Cut through the hull and clear it deck by deck.' },
      { id: 'decode', label: 'Decode the signal first', skill: 'lore', tags: ['careful', 'knowledge'], text: 'Spend the hours to learn what the beacon is really saying.' },
      { id: 'shadow', label: 'Watch who else comes for it', skill: 'guile', tags: ['cunning', 'intel'], text: 'Hide nearby and let rivals spring any traps.' },
    ],
    climax: { text: 'Something in the hulk wakes as you reach its core.', skills: ['might', 'endurance', 'lore'] },
  },
  {
    id: 'rivalEnvoy', name: 'A rival’s envoy', tags: ['politics', 'court', 'intel'], tables: ['knowledge', 'glory'],
    text: 'An envoy from another faction arrives under a flag of truce, asking to speak to the Warlord alone.',
    approaches: [
      { id: 'parley', label: 'Hear them out', skill: 'command', tags: ['diplomacy', 'honour'], text: 'Receive the envoy with every courtesy and bargain hard.' },
      { id: 'spy', label: 'Have them watched', skill: 'guile', tags: ['cunning', 'intel'], text: 'Smile, and set your agents on every one of their retinue.' },
      { id: 'test', label: 'Test their nerve', skill: 'resolve', tags: ['pride', 'intimidation'], text: 'Make them wait, then meet them armed in the trophy hall.' },
    ],
    climax: { text: 'The envoy’s true offer — or threat — comes out at last.', skills: ['command', 'guile', 'resolve'] },
  },
  {
    id: 'shardFall', name: 'A shard-fall', tags: ['void', 'umbra', 'race'], tables: ['void', 'relics'],
    text: 'A streak of black fire crosses the sky and comes down nearby: a raw lump of Umbra crystal, still singing.',
    approaches: [
      { id: 'race', label: 'Race to the crater', skill: 'speed', tags: ['bold', 'race'], text: 'Take the fastest troops and get there before anyone else.' },
      { id: 'secure', label: 'Seal the area first', skill: 'command', tags: ['military', 'careful'], text: 'Throw a cordon round it and move in methodically.' },
      { id: 'attune', label: 'Listen to its song', skill: 'lore', tags: ['arcane', 'warp'], text: 'Approach alone, and try to understand what it wants.' },
    ],
    climax: { text: 'The crystal reacts to your touch.', skills: ['endurance', 'lore', 'resolve'] },
  },
  {
    id: 'mutiny', name: 'Whispers of mutiny', tags: ['military', 'loyalty', 'people'], tables: ['glory', 'salvage'],
    text: 'Officers in the detachment are muttering; the last orders cost too many lives, and someone is stoking it.',
    approaches: [
      { id: 'address', label: 'Address the troops', skill: 'command', tags: ['honour', 'leadership'], text: 'Stand before the whole detachment and answer them.' },
      { id: 'rootOut', label: 'Find the ringleader', skill: 'guile', tags: ['cunning', 'intel'], text: 'Work quietly through informants and old favours.' },
      { id: 'example', label: 'Make an example', skill: 'might', tags: ['ruthless', 'fear'], text: 'Discipline must be seen to be done.' },
    ],
    climax: { text: 'The ringleader moves before you are ready.', skills: ['might', 'command', 'resolve'] },
  },
  {
    id: 'lostArchive', name: 'A forbidden index', tags: ['knowledge', 'lore', 'tech'], tables: ['knowledge', 'relics'],
    text: 'A scholar brings a cracked index-slate listing a vault that, officially, never existed.',
    approaches: [
      { id: 'study', label: 'Study the index', skill: 'lore', tags: ['careful', 'knowledge'], text: 'Cross-reference every entry before moving.' },
      { id: 'force', label: 'Break the vault open', skill: 'might', tags: ['bold', 'salvage'], text: 'Melta-charges are a kind of key.' },
      { id: 'bribe', label: 'Buy the keeper', skill: 'command', tags: ['diplomacy', 'trade'], text: 'Every guardian has a price.' },
    ],
    climax: { text: 'The vault’s last ward stirs.', skills: ['lore', 'endurance', 'guile'] },
  },
  {
    id: 'echoWhisper', name: 'A voice from the Echoes', tags: ['echoes', 'warp', 'horror'], tables: ['void', 'peril'],
    text: 'The Warlord begins to hear a voice in the static, offering knowledge of where the Void Echoes will strike next.',
    approaches: [
      { id: 'listen', label: 'Listen, carefully', skill: 'resolve', tags: ['risk', 'warp'], text: 'Hear what it has to say without giving it anything.' },
      { id: 'trace', label: 'Trace the voice', skill: 'lore', tags: ['knowledge', 'intel'], text: 'Find where it is truly coming from.' },
      { id: 'silence', label: 'Silence it', skill: 'endurance', tags: ['faith', 'denial'], text: 'Shut it out, whatever it costs.' },
    ],
    climax: { text: 'The voice makes its bargain plain.', skills: ['resolve', 'endurance', 'guile'] },
  },
  {
    id: 'refugees', name: 'A column of refugees', tags: ['people', 'supply', 'honour'], tables: ['salvage', 'glory'],
    text: 'Thousands of refugees reach the detachment’s lines, fleeing something they will not name.',
    approaches: [
      { id: 'shelter', label: 'Take them in', skill: 'command', tags: ['honour', 'mercy'], text: 'Organise food, shelter and order.' },
      { id: 'question', label: 'Find out what they fled', skill: 'guile', tags: ['intel', 'careful'], text: 'Listen at the campfires.' },
      { id: 'press', label: 'Press the able into service', skill: 'might', tags: ['ruthless', 'military'], text: 'Every hand can hold a lasgun.' },
    ],
    climax: { text: 'What they fled catches up with them.', skills: ['might', 'speed', 'command'] },
  },
  {
    id: 'duelChallenge', name: 'A champion’s challenge', tags: ['honour', 'glory', 'military'], tables: ['glory', 'relics'],
    text: 'A famed champion of a broken warband calls out the Warlord by name, for single combat.',
    approaches: [
      { id: 'accept', label: 'Accept, openly', skill: 'might', tags: ['honour', 'bold'], text: 'Meet them before both hosts.' },
      { id: 'study', label: 'Study their style', skill: 'lore', tags: ['careful', 'knowledge'], text: 'Watch their old bouts first.' },
      { id: 'cheat', label: 'Stack the odds', skill: 'guile', tags: ['cunning', 'ruthless'], text: 'A drugged cup, a weakened blade.' },
    ],
    climax: { text: 'The duel itself.', skills: ['might', 'speed', 'endurance'] },
  },
  {
    id: 'saboteur', name: 'Sabotage in the works', tags: ['tech', 'industry', 'intel'], tables: ['salvage', 'knowledge'],
    text: 'A forge-line explodes, then another. Someone is sabotaging the faction’s industry.',
    approaches: [
      { id: 'repair', label: 'Save the forges', skill: 'lore', tags: ['tech', 'careful'], text: 'Get the lines running before the damage spreads.' },
      { id: 'hunt', label: 'Hunt the saboteur', skill: 'speed', tags: ['bold', 'intel'], text: 'Chase down every lead before the trail goes cold.' },
      { id: 'lockdown', label: 'Lock everything down', skill: 'command', tags: ['military', 'order'], text: 'No one moves without your seal.' },
    ],
    climax: { text: 'The saboteur is cornered — and armed.', skills: ['might', 'guile', 'speed'] },
  },
  {
    id: 'oracle', name: 'The blind oracle', tags: ['faith', 'warp', 'lore'], tables: ['knowledge', 'void'],
    text: 'A blind oracle has foretold the Warlord’s death, and the troops have heard.',
    approaches: [
      { id: 'consult', label: 'Seek the oracle out', skill: 'resolve', tags: ['faith', 'risk'], text: 'Face the prophecy in person.' },
      { id: 'discredit', label: 'Discredit the prophecy', skill: 'guile', tags: ['cunning', 'politics'], text: 'Show the troops that it is a fraud.' },
      { id: 'decipher', label: 'Read the omen yourself', skill: 'lore', tags: ['knowledge', 'arcane'], text: 'Old texts may say what the oracle really saw.' },
    ],
    climax: { text: 'The foretold hour arrives.', skills: ['resolve', 'endurance', 'lore'] },
  },
  {
    id: 'beastHunt', name: 'A void-beast loose', tags: ['danger', 'nature', 'void'], tables: ['relics', 'glory'],
    text: 'Something has got loose from a cargo hold: a void-beast, and it is feeding.',
    approaches: [
      { id: 'hunt', label: 'Hunt it yourself', skill: 'might', tags: ['bold', 'glory'], text: 'Lead the hunt from the front.' },
      { id: 'trap', label: 'Set a trap', skill: 'guile', tags: ['cunning', 'careful'], text: 'Bait it somewhere you choose.' },
      { id: 'track', label: 'Track it to its lair', skill: 'speed', tags: ['careful', 'nature'], text: 'Follow the trail before it goes cold.' },
    ],
    climax: { text: 'The beast turns at bay.', skills: ['might', 'endurance', 'speed'] },
  },
  {
    id: 'smugglers', name: 'Smugglers’ offer', tags: ['crime', 'trade', 'salvage'], tables: ['salvage', 'void'],
    text: 'A smuggler captain offers a hold full of contraband — weapons, Umbra, and stranger things — for the right price.',
    approaches: [
      { id: 'haggle', label: 'Haggle', skill: 'command', tags: ['trade', 'diplomacy'], text: 'Drive the price down.' },
      { id: 'seize', label: 'Seize the ship', skill: 'might', tags: ['ruthless', 'bold'], text: 'Why pay at all?' },
      { id: 'inspect', label: 'Inspect the cargo', skill: 'lore', tags: ['careful', 'tech'], text: 'Make sure it’s what they claim.' },
    ],
    climax: { text: 'The smugglers try something.', skills: ['guile', 'speed', 'might'] },
  },
];

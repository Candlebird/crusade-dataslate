// Homebrew: things a force can do between games, once per campaign round. Worth about a quarter of a battle.

/** Solo patrol: a quick game against the AI with a small part of the force. */
export const SOLO_PATROL = {
  points: 500,
};

export const EXPEDITION = {
  /** Units in an expedition squad. */
  squadMax: 3,
  /** Encounters before the squad comes home on its own. */
  encounters: 3,
  /** Rewards grow the deeper the squad goes: encounter 1, 2, 3. */
  depth: [1, 1.5, 2],
  /** A squad with a unit of this level or higher gets +1 to its rolls. */
  veteranLevel: 3,
  /** Danger gained by a failed roll, and by a natural 1. */
  failDanger: 1,
  fumbleDanger: 2,
  /** Pressing on, roll a D6: equal to or under the danger, the squad is ambushed. On the ambush's D6, this or lower is a scar; higher, the unit is Lost (sits out the next battle). */
  ambushScarOn: 2,
};

export interface ExpeditionReward {
  /** XP for each unit in the squad. */
  xp?: number;
  supply?: number;
  rp?: number;
  us?: number;
}

export interface ExpeditionChoice {
  label: string;
  /** D6 roll needed (0 = no roll: it just happens). */
  target: number;
  reward: ExpeditionReward;
  win: string;
  lose: string;
}

export interface ExpeditionEncounter {
  id: string;
  title: string;
  text: string;
  choices: ExpeditionChoice[];
}

export interface ExpeditionSite {
  id: string;
  name: string;
  desc: string;
  /** Paid on top of the haul when the squad makes it through every encounter. */
  finish: { text: string; reward: ExpeditionReward };
  encounters: ExpeditionEncounter[];
}

const LEAVE: ExpeditionChoice = { label: 'Leave it be', target: 0, reward: {}, win: 'The squad moves on, none the richer.', lose: '' };

export const EXPEDITION_SITES: ExpeditionSite[] = [
  {
    id: 'hulk', name: 'Derelict Space Hulk', desc: 'A dead ship drifting through the Nexus. Salvage and old relics, if the dark lets you keep them.',
    finish: { text: 'Deep in the hulk the squad finds a sealed reliquary, still humming.', reward: { us: 1 } },
    encounters: [
      { id: 'reactor', title: 'Humming reactor', text: 'A reactor still hums behind a cracked bulkhead.', choices: [
        { label: 'Salvage its cells', target: 4, reward: { supply: 25 }, win: 'The cells come out whole.', lose: 'A coolant line bursts and the squad scatters.' },
        { label: 'Rig it to blow and test their nerve', target: 3, reward: { xp: 1 }, win: 'They hold steady as the deck shakes.', lose: 'The blast comes early.' },
        LEAVE,
      ] },
      { id: 'armoury', title: 'Sealed armoury', text: 'A vault door, its lock still glowing.', choices: [
        { label: 'Crack the lock', target: 5, reward: { rp: 1 }, win: 'Inside: well-kept wargear, ready to trade.', lose: 'The alarm wakes something in the vents.' },
        { label: 'Cut through the wall', target: 3, reward: { supply: 25 }, win: 'Slow work, but the racks are theirs.', lose: 'The cutter gives out halfway.' },
      ] },
      { id: 'swarm', title: 'Skittering in the vents', text: 'Something small and many-legged is following them.', choices: [
        { label: 'Hunt it down', target: 4, reward: { xp: 1 }, win: 'A short, ugly fight, and a good one.', lose: 'There were more than they thought.' },
        { label: 'Seal the vents behind you', target: 2, reward: {}, win: 'The noise fades away.', lose: 'One seal fails.' },
      ] },
      { id: 'bridge', title: 'The bridge', text: 'The captain is still in the chair, and the logs are intact.', choices: [
        { label: 'Pull the star charts', target: 4, reward: { rp: 1 }, win: 'The charts show routes no one else knows.', lose: 'The data core crumbles as they lift it.' },
        { label: 'Strip the command throne', target: 3, reward: { supply: 25 }, win: 'Gilded plating, worth a fortune.', lose: 'The deck gives way under them.' },
        LEAVE,
      ] },
    ],
  },
  {
    id: 'anomaly', name: 'Warp Anomaly', desc: 'Space folds in on itself here. Those who come back are changed: wiser, or worse.',
    finish: { text: 'At the heart of the anomaly the squad sees the Nexus as it truly is.', reward: { xp: 2 } },
    encounters: [
      { id: 'echo', title: 'Echo of themselves', text: 'The squad meets itself coming the other way.', choices: [
        { label: 'Fight the echo', target: 4, reward: { xp: 2 }, win: 'They learn their own weaknesses, and beat them.', lose: 'The echo knows every move they make.' },
        { label: 'Talk to it', target: 3, reward: { xp: 1 }, win: 'It tells them what is coming.', lose: 'It only screams.' },
      ] },
      { id: 'crystal', title: 'Singing crystals', text: 'Shards of solid light ring like bells.', choices: [
        { label: 'Harvest a shard', target: 5, reward: { us: 1 }, win: 'A perfect Umbra shard comes away in their hands.', lose: 'The song turns into a shriek.' },
        { label: 'Listen to the song', target: 3, reward: { xp: 1 }, win: 'Something in it makes them sharper.', lose: 'They lose hours to it.' },
        LEAVE,
      ] },
      { id: 'time', title: 'Lost time', text: 'Their chronometers spin backwards.', choices: [
        { label: 'Push through quickly', target: 3, reward: { supply: 25 }, win: 'They come out ahead of schedule, with spoils.', lose: 'They come out days late.' },
        { label: 'Map the rift', target: 4, reward: { rp: 1 }, win: 'A map like this is worth a lot to the right people.', lose: 'The map rewrites itself.' },
      ] },
      { id: 'whisper', title: 'Whispers', text: 'A voice offers each of them what they want most.', choices: [
        { label: 'Refuse it, together', target: 3, reward: { xp: 1 }, win: 'Their resolve hardens.', lose: 'One of them listened.' },
        { label: 'Bargain with it', target: 5, reward: { us: 1 }, win: 'It pays in shards, and asks nothing yet.', lose: 'It takes its price at once.' },
      ] },
    ],
  },
  {
    id: 'planet', name: 'Uncharted World', desc: 'A world off the maps, with ruins, beasts and whatever its last owners left behind.',
    finish: { text: 'The squad plants a beacon on the highest peak: the world is on your maps now.', reward: { supply: 50 } },
    encounters: [
      { id: 'beasts', title: 'Apex predator', text: 'Something huge is stalking them through the jungle.', choices: [
        { label: 'Turn and fight', target: 4, reward: { xp: 2 }, win: 'They bring it down. The trophies will be told about.', lose: 'It mauls them and slips away.' },
        { label: 'Lose it in the river', target: 3, reward: {}, win: 'It loses the scent.', lose: 'It was waiting downstream.' },
      ] },
      { id: 'ruins', title: 'Ancient ruins', text: 'Stone halls older than any empire they know.', choices: [
        { label: 'Search the vaults', target: 4, reward: { supply: 25 }, win: 'Old wargear, still usable.', lose: 'The roof comes down.' },
        { label: 'Copy the carvings', target: 3, reward: { rp: 1 }, win: 'Scholars back home will pay well for these.', lose: 'Rain washes the copies out.' },
        LEAVE,
      ] },
      { id: 'settlers', title: 'Lost settlers', text: 'A village of people who have never heard of the war.', choices: [
        { label: 'Trade with them', target: 3, reward: { supply: 25 }, win: 'Fresh food and fuel, fairly bought.', lose: 'The trade goes sour.' },
        { label: 'Train their militia', target: 3, reward: { xp: 1 }, win: 'Teaching sharpens the teachers.', lose: 'A drill goes wrong.' },
      ] },
      { id: 'storm', title: 'Ion storm', text: 'The sky turns green and every system flickers.', choices: [
        { label: 'Dig in and wait it out', target: 2, reward: {}, win: 'The storm passes over.', lose: 'Lightning finds them.' },
        { label: 'March through it', target: 4, reward: { xp: 1 }, win: 'Hard going, and they are harder for it.', lose: 'They lose their way.' },
      ] },
    ],
  },
  {
    id: 'fringe', name: 'Voidspawn Fringe', desc: 'The edge of Echo space. The richest pickings, and the Echoes notice who takes them.',
    finish: { text: 'The squad comes back with an Echo nest-core: the Void Echoes will feel this.', reward: { us: 1, rp: 1 } },
    encounters: [
      { id: 'scouts', title: 'Echo scouts', text: 'A pack of Void Echoes is moving through the dust.', choices: [
        { label: 'Ambush them', target: 4, reward: { xp: 2 }, win: 'The pack never sees them coming.', lose: 'The pack turns on them.' },
        { label: 'Shadow them back to their nest', target: 5, reward: { rp: 1 }, win: 'They mark the nest for the next offensive.', lose: 'They are spotted.' },
        LEAVE,
      ] },
      { id: 'shardfield', title: 'Shard field', text: 'Umbra shards grow here like crystals of frost.', choices: [
        { label: 'Mine as much as you can carry', target: 5, reward: { us: 1 }, win: 'Their packs are heavy with shards.', lose: 'The field wakes up.' },
        { label: 'Take a few and go', target: 3, reward: { supply: 25 }, win: 'Small shards, but they trade well.', lose: 'Even a few was too many.' },
      ] },
      { id: 'corrupted', title: 'Corrupted outpost', text: 'An outpost of your own faction, gone silent.', choices: [
        { label: 'Purge it', target: 4, reward: { xp: 1, supply: 25 }, win: 'The outpost is clean and its stores are yours.', lose: 'Whatever took it is still there.' },
        { label: 'Recover the data', target: 3, reward: { rp: 1 }, win: 'They learn what happened here.', lose: 'The data is corrupted too.' },
      ] },
      { id: 'void', title: 'Hungry void', text: 'The ground itself starts pulling them down.', choices: [
        { label: 'Run for it', target: 3, reward: {}, win: 'They make it out.', lose: 'Not everyone runs fast enough.' },
        { label: 'Take a sample', target: 5, reward: { us: 1 }, win: 'A jar of living void, worth its weight in shards.', lose: 'The void takes the jar, and more.' },
      ] },
    ],
  },
];

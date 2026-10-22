import type { JournalReward } from '../journalData';

// Crossroads Journal rewards: the endings' effects. Each tier must stay inside its value band (rewardValue, journal.test.ts).

export const REWARDS_TABLE: JournalReward[] = [
  // Peril & loss: nothing at all, or a price paid.
  { id: 'nothing', name: 'Nothing but the tale', desc: 'No reward — only a story to tell.', tier: 0, table: 'peril', tags: ['retreat', 'careful', 'patience'], effects: [] },
  { id: 'hardLesson', name: 'A hard lesson', desc: 'The Warlord gains 2 XP but takes a battle scar.', tier: 0, table: 'peril', tags: ['pain', 'bold', 'risk'], effects: [{ kind: 'xp', n: 2 }, { kind: 'scar' }] },
  { id: 'shardDrain', name: 'Shards spent', desc: 'Lose 2 Umbra Shards.', tier: -1, table: 'peril', tags: ['umbra', 'trade', 'greed'], effects: [{ kind: 'shards', n: -2 }] },
  { id: 'openWound', name: 'A wound that won’t close', desc: 'The Warlord takes a battle scar.', tier: -1, table: 'peril', tags: ['pain', 'danger', 'horror'], effects: [{ kind: 'scar' }] },
  { id: 'followed', name: 'Something followed you back', desc: 'Void Echoes threat +1.', tier: -1, table: 'peril', tags: ['echoes', 'warp', 'horror', 'void'], effects: [{ kind: 'threat', n: 1 }] },
  { id: 'raided', name: 'Stores raided', desc: 'Lose 30 banked Materials.', tier: -1, table: 'peril', tags: ['crime', 'betrayal', 'supply'], effects: [{ kind: 'materials', n: -30 }] },
  // Salvage & supply.
  { id: 'scrapHaul', name: 'Scrap haul', desc: '+25 Materials.', tier: 1, table: 'salvage', tags: ['salvage', 'tech', 'supply'], effects: [{ kind: 'materials', n: 25 }] },
  { id: 'taintedCache', name: 'A tainted cache', desc: '+60 Materials, but Void Echoes threat +1.', tier: 1, table: 'salvage', tags: ['salvage', 'greed', 'echoes', 'risk'], effects: [{ kind: 'materials', n: 60 }, { kind: 'threat', n: 1 }] },
  { id: 'supplyCache', name: 'Hidden supply cache', desc: '+50 Materials.', tier: 2, table: 'salvage', tags: ['supply', 'people', 'trade'], effects: [{ kind: 'materials', n: 50 }] },
  { id: 'foundryCore', name: 'An intact foundry core', desc: '+1 Building Expansion.', tier: 3, table: 'salvage', tags: ['industry', 'tech', 'salvage'], effects: [{ kind: 'cores', n: 1 }] },
  // Knowledge & secrets.
  { id: 'starCharts', name: 'Star charts', desc: 'Reveal the 3 nearest sectors the faction hasn’t seen.', tier: 1, table: 'knowledge', tags: ['intel', 'void', 'careful'], effects: [{ kind: 'reveal', n: 3 }] },
  { id: 'fieldNotes', name: 'Field notes', desc: '+2 Research.', tier: 1, table: 'knowledge', tags: ['knowledge', 'careful', 'lore'], effects: [{ kind: 'research', n: 2 }] },
  { id: 'datacore', name: 'A recovered datacore', desc: '+4 Research.', tier: 2, table: 'knowledge', tags: ['knowledge', 'tech'], effects: [{ kind: 'research', n: 4 }] },
  { id: 'blueprint', name: 'Stolen schematics', desc: '+1 Blueprint (a free tech).', tier: 2, table: 'knowledge', tags: ['tech', 'intel', 'cunning'], effects: [{ kind: 'blueprints', n: 1 }] },
  { id: 'spyNetwork', name: 'A spy network', desc: 'Reveal the 6 nearest unseen sectors and +2 Research.', tier: 2, table: 'knowledge', tags: ['intel', 'cunning', 'politics'], effects: [{ kind: 'reveal', n: 6 }, { kind: 'research', n: 2 }] },
  { id: 'archiveKey', name: 'An archive key', desc: '+1 Archive unlock (research any building, ignoring requirements).', tier: 3, table: 'knowledge', tags: ['knowledge', 'lore', 'arcane'], effects: [{ kind: 'archives', n: 1 }] },
  // The void & Umbra.
  { id: 'splinters', name: 'Umbra splinters', desc: '+1 Umbra Shard.', tier: 1, table: 'void', tags: ['umbra', 'void'], effects: [{ kind: 'shards', n: 1 }] },
  { id: 'shardVein', name: 'A shard vein', desc: '+3 Umbra Shards.', tier: 2, table: 'void', tags: ['umbra', 'void', 'salvage'], effects: [{ kind: 'shards', n: 3 }] },
  { id: 'voidBargain', name: 'A bargain with the void', desc: '+5 Umbra Shards, but Void Echoes threat +1.', tier: 2, table: 'void', tags: ['warp', 'echoes', 'greed', 'risk'], effects: [{ kind: 'shards', n: 5 }, { kind: 'threat', n: 1 }] },
  { id: 'sealedRift', name: 'A rift sealed', desc: 'Void Echoes threat −1.', tier: 2, table: 'void', tags: ['echoes', 'faith', 'honour', 'denial'], effects: [{ kind: 'threat', n: -1 }] },
  { id: 'echoBane', name: 'The Echoes driven back', desc: 'Void Echoes threat −1 and +2 Umbra Shards.', tier: 3, table: 'void', tags: ['echoes', 'glory', 'faith'], effects: [{ kind: 'threat', n: -1 }, { kind: 'shards', n: 2 }] },
  // Glory & renown.
  { id: 'renown', name: 'Renown', desc: 'The Warlord gains 2 XP.', tier: 1, table: 'glory', tags: ['glory', 'honour', 'leadership'], effects: [{ kind: 'xp', n: 2 }] },
  { id: 'legend', name: 'A legend grows', desc: 'The Warlord gains 4 XP.', tier: 2, table: 'glory', tags: ['glory', 'bold', 'military'], effects: [{ kind: 'xp', n: 4 }] },
  { id: 'nexusInsight', name: 'Nexus insight', desc: '+1 trait token (any Nexus trait when a unit levels up).', tier: 2, table: 'glory', tags: ['warp', 'arcane', 'knowledge'], effects: [{ kind: 'traitToken', n: 1 }] },
  { id: 'loyalty', name: 'Unshakeable loyalty', desc: 'The Warlord gains 3 XP and +20 Materials from grateful followers.', tier: 2, table: 'glory', tags: ['loyalty', 'people', 'mercy'], effects: [{ kind: 'xp', n: 3 }, { kind: 'materials', n: 20 }] },
  // Relics.
  { id: 'trinket', name: 'A curious trinket', desc: 'A random Common relic for the Warlord.', tier: 2, table: 'relics', tags: ['salvage', 'arcane', 'tech'], effects: [{ kind: 'relic', tier: 'Common' }] },
  { id: 'bloodPrice', name: 'Paid in blood', desc: 'A random Rare relic for the Warlord, but it takes a battle scar.', tier: 2, table: 'relics', tags: ['pain', 'risk', 'ruthless', 'glory'], effects: [{ kind: 'relic', tier: 'Rare' }, { kind: 'scar' }] },
  { id: 'heirloom', name: 'A lost heirloom', desc: 'A random Rare relic for the Warlord.', tier: 3, table: 'relics', tags: ['honour', 'glory', 'lore'], effects: [{ kind: 'relic', tier: 'Rare' }] },
  { id: 'cursedArtefact', name: 'A cursed artefact', desc: 'A random Legendary relic for the Warlord, but Void Echoes threat +2.', tier: 3, table: 'relics', tags: ['warp', 'horror', 'greed', 'arcane'], effects: [{ kind: 'relic', tier: 'Legendary' }, { kind: 'threat', n: 2 }] },
];

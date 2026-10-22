import type { JournalContext } from '../journalData';

// Crossroads Journal contexts: where the scene happens. `types`: the sector types it suits (none = anywhere).
// `rules`: the Warlord's special rules it suits (makes it likelier).

export const CONTEXTS_TABLE: JournalContext[] = [
  { id: 'throneHall', name: 'The cold throne hall', text: 'Deep in the home citadel, during the night watch, while petitioners wait in the dark.', types: ['home'], tags: ['court', 'politics', 'home'] },
  { id: 'musterField', name: 'The muster fields', text: 'On the parade grounds below the citadel, the morning a fresh levy is sworn in.', types: ['home', 'planet'], tags: ['military', 'home'] },
  { id: 'hiveUnderworks', name: 'The hive underworks', text: 'Kilometres below a crowded hive-spire, where the lights fail and the gangs rule.', types: ['planet'], tags: ['urban', 'crime', 'salvage'] },
  { id: 'harvestWorld', name: 'A drowned harvest world', text: 'On a farming world flooded by a broken weather engine, as the last crops rot.', types: ['planet'], tags: ['people', 'supply', 'nature'] },
  { id: 'cogitatorVault', name: 'A sealed cogitator vault', text: 'Inside a research station, behind blast doors that have not opened in a century.', types: ['research', 'archive'], tags: ['tech', 'knowledge'] },
  { id: 'dustArchive', name: 'The dust archive', text: 'Among endless shelves of data-slates, where the archivists speak only in whispers.', types: ['archive', 'research'], tags: ['knowledge', 'lore'] },
  { id: 'driftingHulk', name: 'A drifting hulk', text: 'Aboard a dead warship tumbling through the void, its reactor still faintly warm.', types: ['void', 'empty'], tags: ['void', 'salvage', 'tech'] },
  { id: 'starlessReach', name: 'The starless reach', text: 'In the empty dark between sectors, a day from any help, as the drive stutters.', types: ['empty', 'void'], tags: ['void', 'isolation'] },
  { id: 'anomalyEdge', name: 'The edge of the anomaly', text: 'Where space folds wrong, and every chronometer aboard disagrees.', types: ['anomaly'], tags: ['warp', 'strange', 'void'] },
  { id: 'echoScar', name: 'An Echo-scarred moon', text: 'On a moon the Void Echoes passed over, its people gone and its shadows long.', types: ['voidspawn', 'anomaly'], tags: ['echoes', 'horror', 'void'] },
  { id: 'warCamp', name: 'The war camp', text: 'In the detachment’s forward camp, the night before it moves on.', tags: ['military', 'camp'] },
  { id: 'feastHall', name: 'A victory feast', text: 'At the feast after the last battle, as the wine runs and tongues loosen.', tags: ['court', 'people', 'celebration'] },
  { id: 'stormLanding', name: 'A storm-wracked landing', text: 'On a landing field lashed by ion storms, with half the auspex blind.', tags: ['danger', 'military', 'nature'] },
  { id: 'shrineRuin', name: 'A ruined shrine', text: 'In the shell of an old temple, where the faithful of a dead creed still gather.', tags: ['faith', 'lore', 'people'] },
];

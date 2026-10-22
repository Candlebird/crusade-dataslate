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
  // Home
  { id: 'citadelGaol', name: 'The citadel gaol', text: 'In the cells beneath the citadel, where traitors and debtors scratch tallies into the stone and wait to be remembered.', types: ['home'], tags: ['crime', 'court', 'pain'] },
  { id: 'reliquaryCrypt', name: 'The ancestor crypt', text: 'Among the sealed reliquaries of the faction’s founders, where servo-skulls keep the candles lit and the dead keep their counsel.', types: ['home', 'archive'], tags: ['lore', 'faith', 'honour'] },
  { id: 'foundryForge', name: 'The great foundry', text: 'On the gantries above the home forges, where new war engines are cast and the air itself burns the throat.', types: ['home', 'planet'], tags: ['industry', 'tech', 'military'] },
  { id: 'orbitalDocks', name: 'The orbital docks', text: 'On a creaking dock-ring above the homeworld, as the fleet takes on fuel, crew and a few too many stowaways.', types: ['home', 'void'], tags: ['void', 'supply', 'trade'] },
  // Planet
  { id: 'plagueQuarantine', name: 'The quarantine line', text: 'At the cordon around a plague city, where the burn crews work in shifts and the sick press against the wire.', types: ['planet'], tags: ['horror', 'people', 'mercy'] },
  { id: 'frozenTrenches', name: 'The frozen trenches', text: 'In the trench lines of a forgotten war, where the dead of both sides still stand at their posts under the snow.', types: ['planet', 'empty'], tags: ['military', 'danger', 'lore'] },
  { id: 'ashMarket', name: 'The ash market', text: 'In a bazaar built in the crater of an old bombardment, where anything can be bought and nobody asks where it came from.', types: ['planet'], tags: ['trade', 'crime', 'greed'] },
  { id: 'skySpire', name: 'The sky-spires', text: 'Atop a needle-spire above the cloud sea, where the wind howls between the towers and only the bold or the winged can follow.', types: ['planet'], tags: ['danger', 'glory', 'urban'], rules: ['Flying'] },
  { id: 'deathJungle', name: 'The hungry jungle', text: 'Deep in a jungle that hunts, where the canopy shifts at night and the scouts stopped reporting two hours ago.', types: ['planet', 'research'], tags: ['nature', 'danger'], rules: ['Scout', 'Strider'] },
  { id: 'pilgrimConvoy', name: 'A pilgrim convoy', text: 'Riding with a crawler-convoy of ragged pilgrims across the salt flats, chanting toward a holy site that may not exist.', types: ['planet', 'empty'], tags: ['faith', 'people', 'supply'] },
  // Research
  { id: 'xenosRuins', name: 'The xenos ruins', text: 'Inside a necropolis of black stone left by a vanished race, where the glyphs on the walls rearrange themselves when no one looks.', types: ['research', 'anomaly'], tags: ['lore', 'strange', 'arcane'] },
  { id: 'specimenLab', name: 'The specimen labs', text: 'In a research station whose specimen tanks have all been opened, from the inside.', types: ['research'], tags: ['horror', 'tech', 'knowledge'] },
  { id: 'listeningPost', name: 'A deep listening post', text: 'At an auspex station on a dead rock, where the operators have been hearing the same voice in the static for a week.', types: ['research', 'empty'], tags: ['intel', 'isolation', 'strange'] },
  { id: 'machineShrine', name: 'The machine shrine', text: 'In a shrine where tech-priests chant to a cogitator older than the sector, and it has finally started to answer.', types: ['research', 'archive'], tags: ['tech', 'faith', 'knowledge'] },
  // Archive
  { id: 'forbiddenStacks', name: 'The forbidden stacks', text: 'In the chained-off wing of an archive, where the books are bound in iron and the readers in shackles.', types: ['archive'], tags: ['knowledge', 'arcane', 'danger'], rules: ['Caster'] },
  { id: 'starChartOrrery', name: 'The star-chart orrery', text: 'Beneath a vast brass orrery that maps routes no navigator has flown in a thousand years, some of them straight through stars.', types: ['archive', 'void'], tags: ['intel', 'lore', 'void'] },
  { id: 'scriptoriumRevolt', name: 'A scriptorium in revolt', text: 'In a scriptorium whose servitor-scribes have stopped copying and started writing something of their own.', types: ['archive'], tags: ['tech', 'strange', 'knowledge'] },
  // Void
  { id: 'shipGraveyard', name: 'The ship graveyard', text: 'Threading through a graveyard of ten thousand wrecks, where scavenger clans fight over every hull and the dead outnumber the living.', types: ['void', 'empty'], tags: ['salvage', 'void', 'crime'] },
  { id: 'boardingBreach', name: 'The breach', text: 'In the smoke-filled corridors of an enemy vessel moments after the boarding torpedo hits, with the bulkheads sealing behind.', types: ['void'], tags: ['military', 'void', 'danger'], rules: ['Furious', 'Impact'] },
  { id: 'prisonHulk', name: 'The prison hulk', text: 'Aboard a penal barge adrift with its engines dead, where the inmates have been running things for a long time.', types: ['void'], tags: ['crime', 'void', 'people'] },
  { id: 'asteroidMines', name: 'The asteroid mines', text: 'In the tunnels of a mining rock where the shifts never end and the overseers carry shock-mauls and ledgers of debt.', types: ['void', 'empty'], tags: ['industry', 'people', 'supply'] },
  // Empty
  { id: 'deadBeacon', name: 'The dead beacon', text: 'At a navigation beacon that went silent years ago, its keeper’s log still open on the final, unfinished entry.', types: ['empty'], tags: ['isolation', 'lore', 'void'] },
  { id: 'lifeboatDrift', name: 'A lifeboat adrift', text: 'Crammed into an escape pod with too many survivors and not enough air, counting the hours until rescue or the end.', types: ['empty', 'void'], tags: ['isolation', 'escape', 'people'] },
  // Anomaly
  { id: 'warpStormHeart', name: 'The heart of the storm', text: 'Inside a warp storm where the hull screams, the dead speak on the vox, and reality comes loose at the seams.', types: ['anomaly'], tags: ['warp', 'danger', 'horror'], rules: ['Fearless'] },
  { id: 'loopingStation', name: 'The looping station', text: 'On a waystation where the same five minutes keep repeating, and the crew insists, every time, that you have only just arrived.', types: ['anomaly'], tags: ['strange', 'warp'] },
  { id: 'psychicEcho', name: 'A psychic echo', text: 'In the ruins of a psychic academy, where the last scream of its students still hangs in the air for those who can hear it.', types: ['anomaly', 'voidspawn'], tags: ['arcane', 'warp', 'horror'], rules: ['Caster'] },
  // Voidspawn
  { id: 'voidspawnNest', name: 'The voidspawn nest', text: 'In the throbbing cavern of a voidspawn nest, where the walls breathe and something vast stirs beneath the floor.', types: ['voidspawn'], tags: ['echoes', 'horror', 'danger'], rules: ['Stealth', 'Ambush'] },
  { id: 'husklands', name: 'The husk-lands', text: 'On a world the Void Echoes stripped to grey husks, where the cities stand empty but the lights still come on at dusk.', types: ['voidspawn', 'planet'], tags: ['echoes', 'horror', 'isolation'] },
  { id: 'lastBastion', name: 'The last bastion', text: 'Behind the walls of the last fortress holding out against the voidspawn tide, where the defenders have stopped counting the days.', types: ['voidspawn', 'home'], tags: ['military', 'honour', 'echoes'], rules: ['Tough', 'Hero'] },
  // Anywhere
  { id: 'fieldHospital', name: 'The field hospital', text: 'In a mud-floored field hospital, where the medicae work by lamplight and the wounded argue about who goes next.', tags: ['people', 'mercy', 'military'], rules: ['Regeneration'] },
  { id: 'gamblingDen', name: 'A smoke-filled gambling den', text: 'In a backroom card game where the stakes are ship titles, favours and, by the third hand, fingers.', tags: ['crime', 'greed', 'cunning'] },
];

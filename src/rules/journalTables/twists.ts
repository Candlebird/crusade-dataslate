import type { JournalTwist } from '../journalData';

// Crossroads Journal twists: now and then, after the climax, the scene turns once more. One more check: pass and it
// counts as a success; fail and one more of the endings must be nothing or worse.
export const TWISTS_TABLE: JournalTwist[] = [
  { id: 'secondWave', name: 'The second wave', text: 'Just as the dust settles, more of them come over the ridge.', skills: ['might', 'endurance'] },
  { id: 'turncoat', name: 'A knife in the dark', text: 'One of your own has been paid to make sure you never leave.', skills: ['guile', 'resolve'] },
  { id: 'collapse', name: 'The floor gives way', text: 'The ground groans, cracks, and drops into blackness.', skills: ['speed', 'endurance'] },
  { id: 'voiceInTheVox', name: 'A voice in the vox', text: 'A dead officer’s voice on the channel, giving orders. Your troops are listening.', skills: ['command', 'resolve'] },
  { id: 'wrongPrize', name: 'Not what it seemed', text: 'The prize hums, warms, and starts counting down in a language nobody knows.', skills: ['lore', 'speed'] },
  { id: 'witnesses', name: 'Witnesses', text: 'Refugees saw everything. They will talk unless someone gives them a reason not to.', skills: ['command', 'guile'] },
  { id: 'hunger', name: 'The thing that followed', text: 'Something has been pacing you since the start, and now it is hungry.', skills: ['might', 'speed'] },
  { id: 'omen', name: 'An omen', text: 'Every compass, chrono and heart in the squad stops for one long second.', skills: ['resolve', 'lore'] },
  { id: 'toxicBloom', name: 'Spore bloom', text: 'The walls exhale a yellow mist. Masks hiss and fail one by one.', skills: ['endurance', 'lore'] },
  { id: 'mutiny', name: 'Grumbling ranks', text: 'The troops want to split the haul now, and they have the guns to insist.', skills: ['command', 'might'] },
  { id: 'echo', name: 'Your own echo', text: 'A figure in your colours walks out of the smoke wearing your face.', skills: ['resolve', 'guile'] },
  { id: 'lockdown', name: 'Lockdown', text: 'Blast doors slam. A pleasant machine voice begins purging the sector.', skills: ['lore', 'speed'] },
  { id: 'bounty', name: 'Bounty hunters', text: 'Your face is on a bill somewhere, and the hunters have read it.', skills: ['guile', 'might'] },
  { id: 'debtCollector', name: 'The bill comes due', text: 'A pale broker steps out of a shuttle with a ledger and your name in it.', skills: ['command', 'guile'] },
  { id: 'starfall', name: 'Starfall', text: 'Burning debris from the battle overhead begins to rain across the field.', skills: ['speed', 'endurance'] },
  { id: 'hymn', name: 'The hymn', text: 'A song rises from nowhere. Those who hum along stop answering to their names.', skills: ['resolve', 'lore'] },
];

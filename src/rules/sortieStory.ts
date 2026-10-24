import type { SortieEvent } from './downtimeData';

// The story of a Sortie, like an expedition's: every run crosses one region, with its own sights at each kind of node,
// its own encounters and a thread of three that builds from one to the next (each step needs the flag the last one
// set, and a thread followed to its end leaves the Echo lord wounded before the fight). The lord at the top is one of
// six, each a big Void Echoes datasheet with a signature ability of its own. sortie.ts does the rules.

export type SortieRegionId = 'ashfields' | 'foundry' | 'glass' | 'monastery' | 'wreck';

export interface SortieRegion {
  id: SortieRegionId;
  name: string;
  intro: string;
  /** The harder version a force unlocks by finishing the thread here (see SORTIE.deep). */
  deep: { name: string; intro: string };
  /** The thread's last step: making any choice there finishes the thread. */
  finale: string;
  /** A line for walking into each kind of node; one is picked at random. */
  flavor: { fight: string[]; elite: string[]; camp: string[]; cache: string[]; shop: string[] };
  /** How the run ends: the lord slain, home early (or turned back), or the party lost. */
  epilogue: { won: string; home: string; fell: string };
  /** Encounters only met here; a thread's later steps need the flag the step before set. */
  events: SortieEvent[];
}

export type SortieSignature = 'rage' | 'dive' | 'dirge' | 'tremor' | 'dread' | 'brood';

export interface SortieBoss {
  id: string;
  /** The Void Echoes datasheet it is. */
  unit: string;
  name: string;
  intro: string;
  sig: { id: SortieSignature; name: string; text: string };
  victory: string;
  /** What it says when it comes back as a nemesis, having beaten a party of this force before. */
  taunt: string;
  /** Its bestiary lore, unlocked by slaying it. */
  lore: string;
  /** What it says coming back after being slain by the force once, twice, and three times or more. */
  rematch: [string, string, string];
  /** Omens of it along the road (SORTIE.omens), read in order. */
  omens: [string, string, string];
}

export const SORTIE_BOSSES: SortieBoss[] = [
  {
    id: 'butcher', unit: 'Butcher Champion', name: 'Gorrhul, the Red Harvest',
    intro: 'A hulking shape stands in a field of hooks and chains, still chewing. It drops what it was eating and comes at you with a laugh like tearing metal.',
    sig: { id: 'rage', name: 'Mounting Rage', text: 'Every round it fights on, it makes more attacks.' },
    victory: 'Gorrhul falls at last, and the hooks stop swaying.',
    taunt: 'Gorrhul sniffs the air and grins. "You again. I kept the hooks warm."',
    lore: 'Gorrhul was a quartermaster once, they say, who fed a besieged city on whatever came to hand. The Void kept the appetite and threw away the rest.',
    rematch: [
      'Gorrhul pulls itself back together out of the hooks, seams still wet. ‘I remember the taste of you,’ it rumbles.',
      'Gorrhul has sewn plates of your dead armour into its hide. It laughs to see you again, and the laugh is deeper.',
      'Gorrhul no longer laughs. It just comes, stitched together from every time you have killed it.',
    ],
    omens: [
      'Hooks hang from a dead tree, each one picked clean. Something here eats as it walks.',
      'A ledger lies in the mud, columns of rations in a careful hand, and the last page is all teeth marks.',
      'You find where Gorrhul rested: it sleeps sitting up, and the chains on its left side drag. It favours that side.',
    ],
  },
  {
    id: 'horror', unit: 'Great Winged Horror', name: 'The Carrion Crown',
    intro: 'Wings blot out the sky. The Carrion Crown circles once, picks out the weakest of you, and folds into a dive.',
    sig: { id: 'dive', name: 'Diving Strike', text: 'Every other round it swoops past the line onto the Back unit.' },
    victory: 'The Carrion Crown crashes into the dirt and does not rise. Its shadow is gone from the sky.',
    taunt: 'The Carrion Crown circles lower than last time. It has learned which of you is slowest.',
    lore: 'Old pilots called it the Crown because it always hunts in a ring. It never lands while anything below it still moves.',
    rematch: [
      'The Carrion Crown circles lower than before. It has learned the shape of your guns.',
      'The ring of the Crown is wider now, and there are new bones woven into it: some of them yours.',
      'The sky goes dark long before the Crown arrives. It has stopped circling. It is only waiting.',
    ],
    omens: [
      'Every bone along the path lies in a ring. Something hunts from above, in circles.',
      'Feathers like sheet metal, shed in a dive. The Crown pulls up late, after it strikes.',
      'A scout’s log: the Crown never dives into the sun. You know now which way to face.',
    ],
  },
  {
    id: 'screecher', unit: 'Great Screecher', name: 'The Choir of Teeth',
    intro: 'You hear it long before you see it: a hundred voices singing one note, coming from one mouth.',
    sig: { id: 'dirge', name: 'Dirge', text: 'Every other round its song dazes the whole party (-1 to hit).' },
    victory: 'The Choir chokes on its last note. The silence after is the loudest thing you have ever heard.',
    taunt: 'The Choir has a new verse now, and it is about you: how you ran.',
    lore: 'Every voice in the Choir belonged to someone. Survivors swear they have heard their own names in the chorus.',
    rematch: [
      'The Choir is singing a new verse. It takes you a moment to realise it is about the last time you killed it.',
      'There are more voices in the Choir now, and they sing your names in harmony.',
      'The Choir has learned a single, perfect note. It has been saving it for you.',
    ],
    omens: [
      'A hum in the ground, one note, coming and going like breath.',
      'A soldier’s helmet, the inside scratched with a hundred tally marks: one for every voice she counted in the Choir.',
      'Silence in a ring of stones. Whatever sings out there cannot sing in here: you learn how to stop up its song.',
    ],
  },
  {
    id: 'behemoth', unit: 'Blind Behemoth', name: 'The Blind Mountain',
    intro: 'What you took for a hill gets up. It has no eyes. It does not need them: it feels you through the ground.',
    sig: { id: 'tremor', name: 'Tremor', text: 'Every third round it stamps, and every model of the party takes a wound.' },
    victory: 'The Blind Mountain topples, and the ground shakes one last time.',
    taunt: 'The Blind Mountain stops, and turns toward you. It remembers your footsteps.',
    lore: 'The Blind Mountain sleeps for years at a time. Whole outposts have been built on its back without anyone knowing.',
    rematch: [
      'The Blind Mountain does not sleep this time. It was waiting, head turned toward the sound of your boots.',
      'Old wounds have healed into ridges of stone across the Mountain’s back. It shrugs off the dust and comes.',
      'The ground was the Mountain all along. It has been listening to you walk across it since the first step.',
    ],
    omens: [
      'The ground has a heartbeat here. Slow. Very large.',
      'Outposts built in a line, every one tipped over the same way. It turns to the left when it wakes.',
      'A crater where it stamped, and the rock at the rim untouched. You learn to see the stamp coming.',
    ],
  },
  {
    id: 'terror', unit: 'Terror Beast', name: 'Dread Vashkar',
    intro: 'Vashkar does not charge. It waits, and lets you feel how small you are.',
    sig: { id: 'dread', name: 'Aura of Dread', text: 'Every round, each model at the Front tests morale.' },
    victory: 'Dread Vashkar dies, and the weight on every chest lifts.',
    taunt: 'Vashkar waits exactly where it beat you last. It knew you would come back.',
    lore: 'Vashkar feeds on fear, not flesh. The scouts who watched it longest say it grows a little every time someone runs.',
    rematch: [
      'Vashkar is bigger than you remember. It knows exactly how afraid you were last time.',
      'Vashkar wears the shape of your last victory like a trophy, and smiles with too many teeth.',
      'Vashkar does not hunt you any more. It simply stands there and lets you remember.',
    ],
    omens: [
      'Abandoned weapons, all dropped, none fired. The men who held them ran.',
      'A wall daubed in an old regiment’s hand: IT ONLY GROWS WHEN YOU RUN.',
      'A grave, and on it a single line: ‘We stood, and it was smaller than we thought.’ Your party steadies.',
    ],
  },
  {
    id: 'ascended', unit: 'Ascended Fiend', name: 'The Hollow Prince',
    intro: 'The Hollow Prince sits on a throne of its own young. When it stands, the throne stands with it.',
    sig: { id: 'brood', name: 'Spawn the Brood', text: 'Every third round a brood of Fiends claws its way up at Close.' },
    victory: 'The Hollow Prince is dead, and its brood shrivels with it.',
    taunt: 'The Hollow Prince has new young on its throne. Some of them wear what you left behind.',
    lore: 'A Fiend that ate enough of its own kind to remember having a name. It has spent every day since trying to forget it again.',
    rematch: [
      'The Hollow Prince bows. ‘You again. I had almost forgotten you, and I was so close.’',
      'The Hollow Prince has eaten something new since you killed it last. It wears your colours now.',
      '‘Every time you kill me I remember a little more,’ says the Hollow Prince. ‘Let us see what I remember today.’',
    ],
    omens: [
      'Tiny claw marks, hundreds of them, all leading one way.',
      'A nest, broken open from the inside. The brood hatches in threes.',
      'Scraps of an old name scratched into a wall, over and over, then scratched out. You know what the Prince is afraid to remember.',
    ],
  },
];

export const SORTIE_REGIONS: SortieRegion[] = [
  {
    id: 'ashfields', name: 'The Ashfields of Korvane',
    intro: 'A hive city burned here a century ago, and it is still snowing ash. Nothing grows. Something still walks.',
    deep: { name: 'The Deep Ashfields', intro: "Past the 9th's bunker the ash is waist-deep and still warm. This is where the hive burned hottest, and the Echoes here have never known anything else." },
    finale: 'ash-charges',
    flavor: {
      fight: [
        'Shapes rise out of the ash drifts, shaking themselves off like dogs.',
        'The wind drops, and in the quiet you hear them coming.',
        'A column of Echoes marches along a buried highway, in step, like soldiers.',
      ],
      elite: [
        'These ones wear the burnt colours of Korvane\'s old guard, and fight like they remember how.',
        'Ash falls around them but never lands on them.',
      ],
      camp: [
        'A collapsed hab-block keeps off the ash. Someone painted tally marks on the wall: 212 days.',
        'You dig into a buried tram car and get a fire going. For an hour, the world is small and warm.',
      ],
      cache: [
        'A rescue drop that never found anyone to rescue.',
        'A strongbox in a burnt-out shrine, its lock long since melted open.',
      ],
      shop: [
        'A scrap-trader in a gas mask runs a stall out of a crashed cargo-8. "Ash or Supply, friend. Ash I have."',
        'An old man with a cart has walked the Ashfields for thirty years. He sells what the dead don\'t need.',
      ],
    },
    epilogue: {
      won: 'With the lord dead, the ash settles. For the first time in a century, a little sunlight reaches the ground of Korvane.',
      home: 'You leave the Ashfields with grey in your hair and your lungs, and the work unfinished.',
      fell: 'The ash keeps falling, and in a few days there is no sign that anyone came this way.',
    },
    events: [
      {
        id: 'ash-beacon', name: 'A beacon in the ash',
        text: 'A distress beacon blinks on a ruined tower, still sending a call sign forty years out of date: the 9th Korvane Rifles.',
        choices: [
          { label: 'Trace the signal', win: { text: 'It comes from a bunker to the north. You mark it on the map.', flag: 'ash1' } },
          { label: 'Strip the beacon for parts', win: { text: 'Good components. The signal dies.', supply: 6 } },
          { label: 'Leave it blinking', win: { text: 'Whoever it calls for is long gone.' } },
        ],
      },
      {
        id: 'ash-bunker', name: 'The 9th\'s bunker', after: 'ash1',
        text: 'The bunker door is welded shut from the inside. Scratched into it: "THEY LEARN. DO NOT LET THEM LEARN."',
        choices: [
          { label: 'Cut your way in', chance: 0.7, win: { text: 'Inside, the patrol\'s log: they mapped the lord\'s nest, and how to reach it unseen.', flag: 'ash2', boon: true }, fail: { text: 'The door was rigged. You get in, but not cleanly.', hurt: 2, flag: 'ash2' } },
          { label: 'Find the air vent', needs: ['Scout', 'Strider', 'Stealth'], win: { text: 'Through the vent and into the log room without a scratch. The patrol mapped the lord\'s nest.', flag: 'ash2', heal: 0.25 } },
          { label: 'Respect their wish', win: { text: 'You leave the dead their quiet, and feel steadier for it.', heal: 0.25 } },
        ],
      },
      {
        id: 'ash-charges', name: 'The last charges', after: 'ash2',
        text: 'Following the log, you find what the 9th left behind: demolition charges, packed and primed under the lord\'s nest. They died before they could fire them.',
        choices: [
          { label: 'Finish what they started', win: { text: 'The ground heaves. Somewhere ahead, something huge screams. The 9th\'s war is over.', weaken: 0.3, rare: true } },
          { label: 'Take the charges with you', needs: ['ranged'], win: { text: 'You will find a better use for them.', boon: true, supply: 8 } },
        ],
      },
      {
        id: 'ash-storm', name: 'Ash storm',
        text: 'The sky turns black at midday. An ash storm is coming in, the kind that strips paint.',
        choices: [
          { label: 'Dig in and wait', win: { text: 'Hours in the dark, but you rest.', heal: 0.3 } },
          { label: 'Push through it', chance: 0.6, win: { text: 'You come out the far side ahead of schedule, and find something the storm uncovered.', boon: true }, fail: { text: 'Grit in every joint and wound.', hurt: 2 } },
          { label: 'Use it as cover', needs: ['Stealth', 'Scout'], win: { text: 'Under the storm you slip past an Echo camp and help yourself.', supply: 10 } },
        ],
      },
    ],
  },
  {
    id: 'foundry', name: 'The Drowned Foundry',
    intro: 'Once a forge world\'s pride, now flooded to the third deck. The machines still run in the dark, and the Echoes have learned to like the noise.',
    deep: { name: 'The Foundry Depths', intro: 'Below the third deck the water is black, and the machines are older than the foundry. Something down here built them.' },
    finale: 'foundry-furnace',
    flavor: {
      fight: [
        'Echoes wade out of the black water, pistons hissing around them.',
        'A crane swings overhead. Something is riding it.',
        'The lights flicker on all at once, and you are not alone on the gantry.',
      ],
      elite: [
        'These ones have grown into the machinery: half Echo, half furnace.',
        'They wait on a catwalk above the water, perfectly still, until they don\'t.',
      ],
      camp: [
        'A control room above the waterline, its door still sealing. The hum of the machines lulls you to sleep.',
        'You camp on a cooling tower, warm metal under your backs and the whole drowned foundry below.',
      ],
      cache: [
        'A sealed parts locker, bone dry inside.',
        'A drifting cargo pallet, wrapped in plastek and good as new.',
      ],
      shop: [
        'A servitor still runs the company store. It accepts Supply. It does not accept haggling.',
        'A tech-scavenger has rigged a raft into a floating workshop. "Everything here works. Mostly."',
      ],
    },
    epilogue: {
      won: 'The lord dies, and one by one the foundry\'s machines wind down into silence. Maybe someday someone will drain it.',
      home: 'You climb out of the Foundry wet to the bone. Behind you, the machines keep running.',
      fell: 'The water closes over the last of you, and the machines never miss a beat.',
    },
    events: [
      {
        id: 'foundry-servitor', name: 'A faithful servitor',
        text: 'A servitor is still trying to do its job: clearing a jammed valve, over and over, its arm worn down to the wire.',
        choices: [
          { label: 'Fix its arm', chance: 0.7, win: { text: 'It clicks, turns its lenses on you and follows. It knows the way down.', flag: 'foundry1' }, fail: { text: 'It sparks and bites. Still, after the shock it follows you.', hurt: 1, flag: 'foundry1' } },
          { label: 'Salvage it', win: { text: 'Good parts, and a power cell.', supply: 6 } },
          { label: 'Leave it working', win: { text: 'Some things should be allowed to keep going.' } },
        ],
      },
      {
        id: 'foundry-valves', name: 'The coolant valves', after: 'foundry1',
        text: 'The servitor leads you to a wall of valves and points, again and again, at the deepest hall: the lord\'s lair.',
        choices: [
          { label: 'Flood the lower halls', win: { text: 'Water roars below. The servitor chirps with something like joy.', flag: 'foundry2', supply: 4 } },
          { label: 'Vent the steam to cover your path', win: { text: 'In the fog, you rest unseen and slip on.', heal: 0.4, flag: 'foundry2' } },
        ],
      },
      {
        id: 'foundry-furnace', name: 'The furnace gate', after: 'foundry2',
        text: 'The flooded halls have pushed the lord up against the old furnace gate. The servitor has its arm on the lever. It looks at you.',
        choices: [
          { label: 'Open the furnace', win: { text: 'Fire meets water and the whole deck shakes. Something below howls, burned and scalded.', weaken: 0.3, rare: true } },
          { label: 'Keep the servitor safe', win: { text: 'You pull it back from the lever. It gives you its last power cell in thanks.', revive: 2, heal: 0.4 } },
        ],
      },
      {
        id: 'foundry-vault', name: 'The flooded vault',
        text: 'A vault door, half underwater. The lock still has power.',
        choices: [
          { label: 'Dive for it', chance: 0.5, win: { text: 'Through the door and up with an armful of good gear.', boon: true, supply: 4 }, fail: { text: 'Something lives in the water.', hurt: 2 } },
          { label: 'Hack the lock', needs: ['Caster', 'Scout'], win: { text: 'It opens with a sigh. Inside, a rack of prototypes.', boon: true } },
          { label: 'Not worth drowning for', win: { text: 'You move on.' } },
        ],
      },
    ],
  },
  {
    id: 'glass', name: 'The Glass Forest',
    intro: 'Warp-crystal has grown over a jungle world, tree by tree, until the forest is made of glass. It rings when the wind blows. It rings when you walk.',
    deep: { name: 'The Glass Heart', intro: 'The heart of the forest has grown back since you broke it, thicker and louder. The crystal sings your names.' },
    finale: 'glass-note',
    flavor: {
      fight: [
        'Your reflections in the glass trees start moving on their own. They step out.',
        'The forest rings in a new key. Echoes come in with the sound.',
        'A crystal shatters. Behind it, a pack of Echoes was waiting.',
      ],
      elite: [
        'These Echoes are part crystal, and the light bends wrong around them.',
        'They hum the same note as the forest, and it hums back.',
      ],
      camp: [
        'Inside a hollow crystal trunk, the ringing goes quiet. You sleep without dreaming.',
        'A clearing of dull, dead glass. Nothing rings here. It feels safe, which is how you know to keep watch.',
      ],
      cache: [
        'A survey team\'s supply crate, grown halfway into a crystal tree.',
        'A drop pod, its shell overgrown with glass. Inside, the kit is perfect.',
      ],
      shop: [
        'A blind crystal-cutter trades from a tent of cloth. "I hear what you need," she says.',
        'An Eldar-looking stranger with too many rings sells you things without saying where they came from.',
      ],
    },
    epilogue: {
      won: 'The lord falls, and the whole forest rings with one clear note. Then, for the first time, it is silent.',
      home: 'You leave the Glass Forest. For weeks after, you hear it ringing in your sleep.',
      fell: 'The glass grows over the last of you in a week. In a month, you are part of the forest.',
    },
    events: [
      {
        id: 'glass-shard', name: 'The singing shard',
        text: 'One crystal sings louder than the rest. If you listen, it is singing your names.',
        choices: [
          { label: 'Break off a splinter', win: { text: 'It cuts, but in your hand it points like a compass needle, always the same way.', hurt: 1, flag: 'glass1' } },
          { label: 'Listen to it', chance: 0.5, win: { text: 'It sings you something true.', boon: true }, fail: { text: 'It sings you something terrible. You don\'t sleep that night.', hurt: 2 } },
          { label: 'Cover your ears and go', win: { text: 'The song follows you, then fades.' } },
        ],
      },
      {
        id: 'glass-seer', name: 'The hermit in the hollow', after: 'glass1',
        text: 'The splinter leads you to a hollow where a hermit sits, half crystal herself. "You carry a piece of its song," she says. "I can teach you to sing it back."',
        choices: [
          { label: 'Learn the counter-note', win: { text: 'It takes an hour, and your throats bleed, but you have it.', flag: 'glass2', heal: 0.2 } },
          { label: 'Ask her to heal you', win: { text: 'Her hands are cold glass. The wounds close.', heal: 0.6, revive: 1 } },
        ],
      },
      {
        id: 'glass-note', name: 'The shattering note', after: 'glass2',
        text: 'At the forest\'s heart, the crystal is thickest, and the lord\'s armour is grown from the same glass. Sing the note here and the whole heart will hear.',
        choices: [
          { label: 'Sing it', win: { text: 'Crystal cracks for a mile around. Ahead, the lord\'s glass hide splits open.', weaken: 0.3, rare: true } },
          { label: 'Sing it softly, for yourselves', win: { text: 'The crystal around you softens and flows into your armour.', tough: 1 } },
        ],
      },
      {
        id: 'glass-pool', name: 'The mirror pool',
        text: 'A still pool of liquid glass shows you, but stronger, and smiling.',
        choices: [
          { label: 'Reach in', chance: 0.5, win: { text: 'Your reflection hands you something.', boon: true }, fail: { text: 'Your reflection pulls.', hurt: 2 } },
          { label: 'Strike the reflection', needs: ['melee'], win: { text: 'It breaks, and the pieces are worth something.', supply: 8 } },
          { label: 'Look away', win: { text: 'You leave it smiling.' } },
        ],
      },
    ],
  },
  {
    id: 'monastery', name: 'The Shattered Monastery',
    intro: 'A fortress-monastery on a mountain, broken open by something that came up from below. The bells still ring on their own at the old hours of prayer.',
    deep: { name: 'The Undercroft', intro: 'Under the monastery the catacombs go down further than any map. The bells cannot be heard here. That is worse.' },
    finale: 'monastery-rite',
    flavor: {
      fight: [
        'Echoes in the shape of monks file out of the chapel, chanting nothing.',
        'The bells ring, and the Echoes come running, as if called to prayer.',
        'They come up the old pilgrim stairs, a hundred steps at a time.',
      ],
      elite: [
        'These ones wear the shapes of the monastery\'s templars, down to the oaths on their armour.',
        'An honour guard, still guarding the wrong thing.',
      ],
      camp: [
        'A pilgrims\' hostel, its beds still made. Someone left a candle burning. It has not gone out in forty years.',
        'The scriptorium is quiet and dry. You sleep among a thousand books nobody will read again.',
      ],
      cache: [
        'The monastery\'s armoury, mostly looted. Mostly.',
        'An offering box at a roadside shrine, full of things pilgrims thought were worth giving up.',
      ],
      shop: [
        'A cellarer stayed behind when the others fled. He still keeps the stores, and still keeps the accounts.',
        'A pilgrim who never left sells relics, most of them fake. "This one\'s real," he says, every time.',
      ],
    },
    epilogue: {
      won: 'With the lord dead, the bells stop ringing on their own. For the first time in forty years, the monastery is at peace.',
      home: 'You go down the mountain. Behind you, the bells ring the hour of mourning.',
      fell: 'The bells ring for you that night, as they rang for the monks before you.',
    },
    events: [
      {
        id: 'monastery-bell', name: 'The last brother',
        text: 'An old monk, the last of them, still rings the evening bell. His hands are raw. "It keeps them at bay," he says. "Mostly."',
        choices: [
          { label: 'Ring it for him a while', win: { text: 'He sleeps for the first time in weeks. In the morning he says he has something to show you.', flag: 'monastery1', heal: 0.2 } },
          { label: 'Ask for his blessing', needs: ['Hero'], win: { text: 'His blessing is real.', tough: 1 } },
          { label: 'Leave him to it', win: { text: 'The bell rings on behind you.' } },
        ],
      },
      {
        id: 'monastery-reliquary', name: 'The reliquary', after: 'monastery1',
        text: 'The brother leads you down to a reliquary under the chapel. "We kept it sealed for a reason. Take what you need. Then I will tell you how to end this."',
        choices: [
          { label: 'Take a relic of warding', win: { text: 'It hums in your hand. The brother nods, and tells you of the Rite.', boon: true, flag: 'monastery2' } },
          { label: 'Take only his words', win: { text: 'He seems glad. He tells you of the Rite of Severance, and blesses your wounds.', heal: 0.5, flag: 'monastery2' } },
        ],
      },
      {
        id: 'monastery-rite', name: 'The Rite of Severance', after: 'monastery2',
        text: 'At the high altar, the rite the brother taught you. Say it and the lord is cut off from the monastery that feeds it. But the rite asks for blood.',
        choices: [
          { label: 'Pay in blood', win: { text: 'The altar takes its due. Far below, something shrieks and grows weaker.', hurt: 2, weaken: 0.35 } },
          { label: 'Pay in prayer', needs: ['Hero', 'Caster'], win: { text: 'The rite takes your faith instead of your blood. It is enough.', weaken: 0.3, rare: true } },
          { label: 'Leave the rite unspoken', win: { text: 'Some doors should stay shut.' } },
        ],
      },
      {
        id: 'monastery-ossuary', name: 'The ossuary',
        text: 'Ten thousand skulls in neat rows, each with a name carved over it. Some of them turn to watch you.',
        choices: [
          { label: 'Say the names aloud', chance: 0.6, win: { text: 'The skulls settle, satisfied. One drops something at your feet.', boon: true }, fail: { text: 'You get a name wrong.', hurt: 2 } },
          { label: 'Take the grave goods', win: { text: 'They do not like that, but they do not stop you.', supply: 12, curse: true } },
          { label: 'Back out quietly', win: { text: 'They watch you go.' } },
        ],
      },
    ],
  },
  {
    id: 'wreck', name: 'The Silent Wreck',
    intro: 'The battleship Mercy of Halvar fell out of orbit and broke across ten miles of desert. Her crew never left. Neither did whatever killed them.',
    deep: { name: 'The Reactor Deck', intro: 'The lance shot opened the Mercy of Halvar to her core. The reactor is still lit, and the Echoes crowd around it for warmth.' },
    finale: 'wreck-lance',
    flavor: {
      fight: [
        'Echoes wearing the shapes of the crew come down the corridor in formation, still saluting.',
        'The emergency lights turn red. The klaxons start. They are coming.',
        'Through a hull breach, a pack of Echoes pours in out of the sand.',
      ],
      elite: [
        'Echoes in the shape of the ship\'s marines, and they remember their drills.',
        'The officers\' deck. The Echoes here give orders.',
      ],
      camp: [
        'The chapel deck, its stained glass still whole. You camp under a saint who does not look happy to see you.',
        'A lifeboat that never launched. Snug, sealed, and stocked for six.',
      ],
      cache: [
        'A quartermaster\'s store, still on the manifest.',
        'An escape pod\'s survival kit, never opened.',
      ],
      shop: [
        'A deserter from some other army has set up shop in the galley. He takes Supply and asks no questions.',
        'The ship\'s purser\'s servitor still runs the slop-chest, and still charges ship\'s prices.',
      ],
    },
    epilogue: {
      won: 'The lord is dead. The klaxons finally stop. The Mercy of Halvar can rest.',
      home: 'You climb out of a hull breach into the desert sun. The wreck is silent behind you. It will wait.',
      fell: 'The Mercy of Halvar takes on more crew.',
    },
    events: [
      {
        id: 'wreck-recorder', name: 'The black box',
        text: 'The bridge is a ruin, but the flight recorder is intact. It still has power.',
        choices: [
          { label: 'Play the last log', win: { text: 'The captain\'s voice: "Lances are still charged. If anyone hears this, fire them." You know where the gunnery deck is now.', flag: 'wreck1' } },
          { label: 'Pull the power cell', win: { text: 'A good cell, worth hauling home.', supply: 6, rp: 1 } },
          { label: 'Leave the captain\'s voice in peace', win: { text: 'You salute, and move on.', heal: 0.2 } },
        ],
      },
      {
        id: 'wreck-gunnery', name: 'The gunnery deck', after: 'wreck1',
        text: 'The lance batteries are dark, but the capacitors still hold a charge. They need someone to bring the targeting back up.',
        choices: [
          { label: 'Restart the targeting', chance: 0.7, win: { text: 'The screens come up. The lord\'s lair is in range of one shot.', flag: 'wreck2' }, fail: { text: 'An arc of power throws you across the deck. But the screens come up.', hurt: 2, flag: 'wreck2' } },
          { label: 'Raid the armoury instead', win: { text: 'Ship\'s guns, and plenty of rounds for them.', boon: true } },
        ],
      },
      {
        id: 'wreck-lance', name: 'Broadside', after: 'wreck2',
        text: 'One shot. The firing key is in your hand. The Mercy of Halvar has one last broadside in her.',
        choices: [
          { label: 'Fire!', win: { text: 'The lance fires through the hull and the desert beyond. Something on the horizon screams.', weaken: 0.35 } },
          { label: 'Turn the guns on the Echoes around you', win: { text: 'The deck goes quiet, and the crew\'s stores are yours.', supply: 12, revive: 2 } },
        ],
      },
      {
        id: 'wreck-cryo', name: 'The cryo bay',
        text: 'Rows of sleeper pods, most of them broken. Three still glow green.',
        choices: [
          { label: 'Wake them', chance: 0.6, win: { text: 'Groggy marines, glad to fight. They join your wounded in the line.', revive: 3 }, fail: { text: 'What wakes up is not the crew.', fight: true } },
          { label: 'Take the stims from the pods', win: { text: 'Medical stims, still good.', heal: 0.5 } },
          { label: 'Let them sleep', win: { text: 'Better a dream than this.' } },
        ],
      },
    ],
  },
];

export type SortieVoiceKind = 'fort' | 'caster' | 'hero' | 'flyer' | 'big' | 'scout' | 'squad' | 'solo';

/** Lines that name a unit of the party and fit what it is; {name} is the unit's name. */
export const SORTIE_VOICE: Record<SortieVoiceKind, { camp: string[]; event: string[] }> = {
  fort: {
    camp: ['Nobody needs a tent tonight: everyone sleeps inside {name}.', 'The others sleep in the lee of {name}, out of the wind.'],
    event: ['{name} rumbles to a halt, guns traversing slowly.', 'Behind {name}’s walls, the party feels a little braver.'],
  },
  caster: {
    camp: ['{name} sits apart from the fire, listening to something nobody else hears.', '{name} reads the smoke and does not say what it says.'],
    event: ['{name} stops dead. "Something here is listening."', '{name} goes pale. "We are not the first to stand here."'],
  },
  hero: {
    camp: ['{name} walks the line, a word for everyone.', '{name} takes first watch, and won’t hear of anyone else doing it.'],
    event: ['{name} steps to the front without being asked.', '{name} raises a hand, and the others wait.'],
  },
  flyer: {
    camp: ['{name} circles once more before setting down. "All clear, as far as I can see."', 'The crew of {name} trade stories about what they saw from up there.'],
    event: ['{name} swoops low for a look and comes back with a report.', '{name} has seen this from the air already. It looked smaller from up there.'],
  },
  big: {
    camp: ['{name} settles down with a groan that shakes the ground.', 'The crew of {name} spend the night patching the worst of the dents.'],
    event: ['{name} gets stuck halfway in, and the rest have to dig it out.', '{name} shoulders aside what is in the way.'],
  },
  scout: {
    camp: ['{name} comes back late, muddy and grinning, with a map of tomorrow.', '{name} won’t sit by the fire. Too easy to see.'],
    event: ['{name} was here first, and is already waiting for the rest.', '{name} slips ahead to look, and signals: come on.'],
  },
  squad: {
    camp: ['{name} play cards for rations, and someone is cheating.', 'Somebody in {name} starts a song. Most of them join in.'],
    event: ['{name} fan out and cover every angle.', 'The sergeant of {name} counts heads twice, just in case.'],
  },
  solo: {
    camp: ['{name} keeps watch alone, as always.', '{name} cleans its weapon in silence.'],
    event: ['{name} goes in first, alone, as always.', '{name} looks around and says nothing.'],
  },
};

/** Bestiary lore for the Echoes a party meets, by Void Echoes datasheet name, unlocked by slaying one. */
export const SORTIE_LORE: Record<string, string> = {
  'Scourges': 'The rank and file of the Void: hollow soldiers that march until something stops them, and then march a little more.',
  'Scourge Champion': 'A Scourge that kept a scrap of rank. It still shouts orders, though none of them make sense any more.',
  'Tormentors': 'They come first and they come quiet, cutting the stragglers from a column before anyone hears a thing.',
  'Phantoms': 'Half here and half somewhere else. Blades go through them as often as not, and they never seem to mind.',
  'Phantom Champion': 'It flickers between the lines like a bad signal, and every time it comes back it is closer.',
  'Reapers': 'Built for killing big things. They are patient about it, and they wait for the biggest.',
  'Reaper Champion': 'It counts its kills in notches on its own arm. There is not much arm left.',
  'Spectres': 'Thin as smoke and cold as the void between stars. Where they pass, the frost stays for days.',
  'Spectre Champion': 'It leads the Spectres the way a draught leads the cold: you only notice when it is too late.',
  'Flayer Cavalry': 'Riders and mounts grown into one thing. The noise they make on the charge is not hooves.',
  'Butchers': 'Big, slow and very hard to kill. They do not chase. They do not need to.',
  'Butcher Champion': 'The biggest of the Butchers, and the hungriest. The others give it room at the table.',
  'Shadow Hounds': 'They run in packs and they run forever. A scout who hears them baying should already be moving.',
  'Fang Swarms': 'Hundreds of little mouths with one idea between them. Fire helps. Not much else does.',
  'Fiends': 'They wait under the ground, under the water, under the floor, and they come up all at once.',
  'Great Fiend': 'A Fiend that waited longer than the others, and grew while it waited.',
  'Great Winged Horror': 'It does not need to see you. It smells where you were, and dives on where you will be.',
  'Great Screecher': 'Its song is a weapon and a prayer at once. Nobody has worked out what it prays to.',
  'Terror Beast': 'A walking siege. Walls do not stop it; it simply leans on them until they agree.',
  'Blind Behemoth': 'Eyeless, earless, and still it always knows where the soldiers are standing.',
  'Ascended Fiend': 'What a Fiend becomes when it stops hiding. Its brood follows it like a shadow with teeth.',
  'Stalker Titan': 'The ground warns you before it arrives. By then, the warning is all there is time for.',
  'Omoshu & Kothiz': 'Two Echoes that came back from the Void together and will not be parted. Nobody knows which one leads.',
};

/** Lore for an Echo with no entry of its own. */
export const SORTIE_LORE_DEFAULT = 'Another shape the Void wears. The scouts can only say that it bleeds, and that it can die.';
/** Lore for the campaign's real lords as Training meets them (bestiary keys 'nexus:...'). */
export const NEXUS_LORE = {
  guardian: 'A hero of the Void Echoes, set to guard what they hold in the Nexus. Its echo walked the training maze, and fell there.',
};

/** What a party unit shouts as it makes a last stand; {name} is the unit's name. */
export const SORTIE_STAND: Record<SortieVoiceKind, string[]> = {
  fort: ['{name} locks its gates and opens up with everything it has left.', 'Smoke pours from {name}, but its guns keep turning.'],
  caster: ['{name} burns the last of itself into one great working.', 'Light pours from {name}’s eyes: ‘Not one step further.’'],
  hero: ['{name} plants the banner and will not be moved.', '‘To me!’ roars {name}, alone and unbowed.'],
  flyer: ['{name} climbs into the sun and dives with nothing held back.', '{name} screams down out of the smoke, wings torn and fighting on.'],
  big: ['{name} shakes off the wounds and bellows its defiance.', 'Smoking and broken, {name} rises one last time.'],
  scout: ['{name} stops running. There is nowhere left to go, and that is fine.', 'Out of hiding, {name} picks the closest Echo and makes it count.'],
  squad: ['The last of {name} stands over the bodies of the others and raises its weapon.', 'One left of {name}, and it fights for every one of them.'],
  solo: ['{name} spits blood and grins.', '{name} sets its feet: ‘Come on, then.’'],
};

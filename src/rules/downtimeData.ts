// Homebrew: things a force can do between games. Each unit can go on one a round. Worth about a quarter of a battle.

/** Solo patrol: a quick game against the AI with a small part of the force. */
export const SOLO_PATROL = {
  points: 500,
};

/** How hard a choice is. Each tier rolls its dice, adds the squad bonus, and needs the target or more. */
export type ExpeditionCheck = 'safe' | 'easy' | 'medium' | 'hard' | 'heroic';

export const EXPEDITION = {
  /** Units in an expedition squad. */
  squadMax: 3,
  /** Encounters before the squad comes home on its own. */
  encounters: 3,
  /** Rewards grow the deeper the squad goes: encounter 1, 2, 3. */
  depth: [1, 1.5, 2],
  /** Dice and target for each check. Rolling all 1s always fails. */
  checks: {
    safe: { dice: 1, target: 2 },
    easy: { dice: 2, target: 7 },
    medium: { dice: 3, target: 12 },
    hard: { dice: 3, target: 14 },
    heroic: { dice: 4, target: 19 },
  } as Record<ExpeditionCheck, { dice: number; target: number }>,
  /** Squad bonus: +1 for each unit after the first, +1 for every this many levels across the squad, up to the cap. */
  levelsPerBonus: 3,
  bonusCap: 6,
  /** Danger gained by a failed roll, and by a fumble (all 1s, or missing by this much or more). */
  failDanger: 1,
  fumbleDanger: 2,
  fumbleMiss: 6,
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
  /** The roll it takes (none: it just happens). */
  check?: ExpeditionCheck;
  reward: ExpeditionReward;
  win: string;
  lose: string;
}

/** One take on an encounter: what the squad sees and what it can do about it. */
export interface ExpeditionVariant {
  title: string;
  text: string;
  choices: ExpeditionChoice[];
}

/** An encounter at a site. It comes in a few variants, and the squad meets one of them at random. */
export interface ExpeditionEncounter {
  id: string;
  variants: ExpeditionVariant[];
}

export interface ExpeditionSite {
  id: string;
  name: string;
  desc: string;
  /** Paid on top of the haul when the squad makes it through every encounter. */
  finish: { text: string; reward: ExpeditionReward };
  encounters: ExpeditionEncounter[];
}

const ch = (label: string, check: ExpeditionCheck, reward: ExpeditionReward, win: string, lose: string): ExpeditionChoice => ({ label, check, reward, win, lose });
const v = (title: string, text: string, ...choices: ExpeditionChoice[]): ExpeditionVariant => ({ title, text, choices });

const LEAVE: ExpeditionChoice = { label: 'Leave it be', reward: {}, win: 'The squad moves on, none the richer.', lose: '' };

export const EXPEDITION_SITES: ExpeditionSite[] = [
  {
    id: 'hulk', name: 'Derelict Space Hulk', desc: 'A dead ship drifting through the Nexus. Salvage and old relics, if the dark lets you keep them.',
    finish: { text: 'Deep in the hulk the squad finds a sealed reliquary, still humming.', reward: { us: 1 } },
    encounters: [
      { id: 'reactor', variants: [
        v('Humming reactor', 'A reactor still hums behind a cracked bulkhead.',
          ch('Salvage its cells', 'medium', { supply: 25 }, 'The cells come out whole.', 'A coolant line bursts and the squad scatters.'),
          ch('Rig it to blow and test their nerve', 'easy', { xp: 1 }, 'They hold steady as the deck shakes.', 'The blast comes early.'),
          LEAVE),
        v('Leaking reactor', 'Green light pools on the deck around a cracked reactor housing. The air tastes of metal.',
          ch('Patch the leak and tap the power', 'hard', { xp: 1, supply: 25 }, 'Steady hands and a long night of work, and the power cells fill.', 'The patch blows out in a hiss of green steam.'),
          ch('Siphon off the coolant', 'easy', { supply: 25 }, 'Drum after drum, and every one will sell.', 'A drum splits and the deck starts to smoke.'),
          LEAVE),
        v('Reactor shrine', 'Someone turned the reactor room into a shrine. Candles still burn beside the core.',
          ch('Take the offerings', 'medium', { rp: 1 }, 'Old coins and medals, worth something to collectors.', 'Every candle gutters out at once.'),
          ch('Keep vigil until the candles die', 'easy', { xp: 1 }, 'The quiet steadies them.', 'Something walks past them in the dark.'),
          LEAVE),
      ] },
      { id: 'armoury', variants: [
        v('Sealed armoury', 'A vault door, its lock still glowing.',
          ch('Crack the lock', 'hard', { rp: 1 }, 'Inside: well-kept wargear, ready to trade.', 'The alarm wakes something in the vents.'),
          ch('Cut through the wall', 'easy', { supply: 25 }, 'Slow work, but the racks are theirs.', 'The cutter gives out halfway.')),
        v('Crew lockers', "A row of lockers, each stamped with a dead crewman's name.",
          ch('Force them open one by one', 'easy', { supply: 25 }, 'Ammunition, rations, a good knife.', 'One of the lockers was trapped.'),
          ch("Find the officer's locker", 'hard', { rp: 1, supply: 25 }, 'The officer kept a fine sidearm, and finer papers.', 'They spend far too long looking.')),
        v('Guarded armoury', 'A servitor arm still guards the racks, swivelling at every sound.',
          ch('Shoot it out', 'medium', { xp: 2 }, 'Sparks and smoke, and the racks are open.', 'The arm fires first.'),
          ch('Slip past it', 'medium', { supply: 25 }, 'They load up while it watches the wrong door.', 'It hears a boot scrape.'),
          ch('Reprogram it', 'hard', { rp: 1 }, 'It salutes them now, and will salute the next buyer too.', 'It forgets that anyone is a friend.')),
      ] },
      { id: 'swarm', variants: [
        v('Skittering in the vents', 'Something small and many-legged is following them.',
          ch('Hunt it down', 'medium', { xp: 1 }, 'A short, ugly fight, and a good one.', 'There were more than they thought.'),
          ch('Seal the vents behind you', 'safe', {}, 'The noise fades away.', 'One seal fails.')),
        v('Rat-things', "The crew's pets bred in the dark for a thousand years. Now they are the crew.",
          ch('Clear the nest', 'medium', { xp: 2 }, 'The nest burns, and the corridors go quiet.', 'The nest was bigger than it looked.'),
          ch('Lay out bait and slip by', 'safe', {}, 'The swarm feasts and lets them pass.', 'The bait runs out first.')),
        v('Chittering in the walls', 'The walls tick and scratch. Whatever it is, it lives inside the hull plating.',
          ch('Burn them out', 'easy', { xp: 1 }, 'The flamers do the talking.', 'The fire spreads into the corridor.'),
          ch('Collect the eggs', 'hard', { rp: 1 }, 'Xenobiologists back home will pay for these.', 'The eggs hatch on the way out.'),
          ch('Move fast and quiet', 'safe', {}, 'The scratching falls behind them.', 'The scratching keeps pace.')),
      ] },
      { id: 'bridge', variants: [
        v('The bridge', 'The captain is still in the chair, and the logs are intact.',
          ch('Pull the star charts', 'medium', { rp: 1 }, 'The charts show routes no one else knows.', 'The data core crumbles as they lift it.'),
          ch('Strip the command throne', 'easy', { supply: 25 }, 'Gilded plating, worth a fortune.', 'The deck gives way under them.'),
          LEAVE),
        v('Ghost on the bridge', "The captain's hologram still gives orders to an empty bridge.",
          ch('Answer its hails', 'easy', { xp: 1 }, 'It hands over command, and a few old lessons with it.', 'It declares them mutineers.'),
          ch("Download the ship's memory", 'medium', { rp: 1 }, 'Centuries of logs, coordinates and secrets.', 'The memory wipes itself as they watch.'),
          LEAVE),
        v("Mutineers' bridge", 'Barricades, bones and scratched tallies: the crew fought over this bridge.',
          ch('Search the barricades', 'easy', { supply: 25 }, 'The mutineers stockpiled well.', 'A tripwire is still live.'),
          ch("Find the mutineers' cache", 'heroic', { us: 1, rp: 1 }, "Under the captain's chair: a pouch of shards.", 'The chair was booby-trapped.'),
          LEAVE),
      ] },
      { id: 'cryo', variants: [
        v('Cryo bay', 'Rows of frosted pods. A few of the sleepers are still breathing.',
          ch('Wake one and ask what happened', 'medium', { rp: 1 }, 'A dazed officer tells them where the vault is.', 'The sleeper wakes up screaming.'),
          ch('Strip the pods for parts', 'easy', { supply: 25 }, 'Good medical kit, barely used.', 'A pod vents frozen gas over them.'),
          LEAVE),
        v('Thawed pods', 'Every pod is open. Wet footprints lead off into the dark.',
          ch('Follow the footprints', 'medium', { xp: 2 }, 'They find the sleepers, and the sleepers are not friendly.', 'The footprints lead them in circles.'),
          ch('Seal the bay and move on', 'safe', {}, 'The door locks with a heavy clunk.', 'Something was already on their side of the door.')),
        v('Frozen garden', "The cryo bay held seeds, not soldiers: a whole world's crops, frozen in rows.",
          ch('Take the whole seed stock', 'hard', { supply: 25, rp: 1 }, 'Farmers back home will bless their names.', 'The seeds crumble as the frost lifts.'),
          ch('Fill their packs', 'easy', { supply: 25 }, 'As much as they can carry, and it is enough.', 'The pods start to thaw around them.'),
          LEAVE),
      ] },
      { id: 'turrets', variants: [
        v('Point-defence turrets', 'Guns along the corridor ceiling wake as the squad passes.',
          ch('Charge through', 'medium', { xp: 2 }, 'Under fire and through, whooping like fresh recruits.', 'The guns find their range.'),
          ch('Pull the turrets for salvage', 'hard', { xp: 1, supply: 25 }, 'The guns come down, and come home with them.', 'One turret was only playing dead.'),
          ch('Crawl through the maintenance ducts', 'safe', {}, 'Tight, filthy and safe.', 'The ducts are not empty.')),
        v('Security drones', 'Hovering drones sweep the hall with red light.',
          ch('Shoot them down', 'easy', { xp: 1 }, 'The drones fall like hail.', 'More drones answer the alarm.'),
          ch('Capture one intact', 'hard', { rp: 1 }, "A working drone, and its maker's codes.", 'It self-destructs in their hands.'),
          ch('Wait for a gap', 'safe', {}, 'The sweep moves on, and so do they.', 'The sweep doubles back.')),
        v('Minefield', 'The deck plates are stencilled with warnings. Some of the plates are not plates.',
          ch('Lift the mines for later', 'medium', { supply: 25 }, 'Mines always come in handy.', 'One goes off in their hands.'),
          ch('Blast a path with grenades', 'easy', { xp: 1 }, 'Loud and quick, and good for morale.', 'The chain reaction comes far too close.'),
          ch('Pick a careful path', 'safe', {}, 'Step by slow step, they cross.', 'A plate clicks.')),
      ] },
    ],
  },
  {
    id: 'anomaly', name: 'Warp Anomaly', desc: 'Space folds in on itself here. Those who come back are changed: wiser, or worse.',
    finish: { text: 'At the heart of the anomaly the squad sees the Nexus as it truly is.', reward: { xp: 2 } },
    encounters: [
      { id: 'echo', variants: [
        v('Echo of themselves', 'The squad meets itself coming the other way.',
          ch('Fight the echo', 'medium', { xp: 2 }, 'They learn their own weaknesses, and beat them.', 'The echo knows every move they make.'),
          ch('Talk to it', 'easy', { xp: 1 }, 'It tells them what is coming.', 'It only screams.')),
        v('Echo of the fallen', 'Comrades lost in old battles stand in the mist, waiting.',
          ch('Ask them how they died', 'medium', { xp: 2 }, 'Hard lessons, well learned.', 'The answers stay with them for days.'),
          ch('Salute them and pass', 'easy', { xp: 1 }, 'The fallen salute back, and the squad walks taller.', 'The fallen turn away.')),
        v('Future selves', 'Older, scarred versions of the squad step out of the fog with a warning.',
          ch('Ask them about the war', 'hard', { xp: 1, rp: 1 }, 'They learn which battles will matter.', 'The future does not like being asked.'),
          ch('Heed the warning', 'easy', { xp: 1 }, 'They will not make that mistake now.', 'They misunderstood the warning.'),
          LEAVE),
      ] },
      { id: 'crystal', variants: [
        v('Singing crystals', 'Shards of solid light ring like bells.',
          ch('Harvest a shard', 'hard', { us: 1 }, 'A perfect Umbra shard comes away in their hands.', 'The song turns into a shriek.'),
          ch('Listen to the song', 'easy', { xp: 1 }, 'Something in it makes them sharper.', 'They lose hours to it.'),
          LEAVE),
        v('Crystal forest', 'Towers of glass rise out of nothing, humming in harmony.',
          ch('Climb to the singing heart', 'heroic', { us: 1, rp: 1 }, 'At the top, a shard hums in their hands.', 'The tower sings them off it.'),
          ch('Chip off the smaller ones', 'easy', { supply: 25 }, 'Pretty, and they sell.', 'The forest shatters around them.'),
          LEAVE),
        v('Bleeding light', 'Light leaks from cracks in the air and pools like water.',
          ch('Bottle it', 'hard', { us: 1 }, 'It sets into a shard inside the jar.', 'The jar cracks and the light burns.'),
          ch('Bathe in it', 'medium', { xp: 2 }, 'They come out seeing further.', 'It leaves them dizzy and half-blind.'),
          LEAVE),
      ] },
      { id: 'time', variants: [
        v('Lost time', 'Their chronometers spin backwards.',
          ch('Push through quickly', 'easy', { supply: 25 }, 'They come out ahead of schedule, with spoils.', 'They come out days late.'),
          ch('Map the rift', 'medium', { rp: 1 }, 'A map like this is worth a lot to the right people.', 'The map rewrites itself.')),
        v('Time loop', 'The squad walks down the same corridor for the third time.',
          ch('Use the loop to drill', 'heroic', { xp: 4 }, 'A hundred drills in an hour.', 'They lose a week.'),
          ch('Mark the walls and find the seam', 'easy', { xp: 1 }, 'On the fourth pass they find the way out.', 'On the tenth pass, they stop counting.')),
        v('Old battlefield', 'A battle from centuries ago plays out around them, in slow motion.',
          ch('Study the tactics', 'medium', { rp: 1 }, 'Generals will pay for what they saw.', 'The battle notices them.'),
          ch('Loot the frozen fallen', 'easy', { supply: 25 }, 'Wargear from another age, still sharp.', 'The battle speeds up.')),
      ] },
      { id: 'whisper', variants: [
        v('Whispers', 'A voice offers each of them what they want most.',
          ch('Refuse it, together', 'easy', { xp: 1 }, 'Their resolve hardens.', 'One of them listened.'),
          ch('Bargain with it', 'hard', { us: 1 }, 'It pays in shards, and asks nothing yet.', 'It takes its price at once.')),
        v('The merchant', 'A smiling figure in a coat of stars lays out wares on nothing at all.',
          ch('Trade fairly', 'easy', { supply: 25 }, 'The merchant is, for once, honest.', 'They pay twice what it was worth.'),
          ch('Steal from the stall', 'hard', { us: 1 }, 'They get away with a shard.', 'The merchant always gets paid.'),
          LEAVE),
        v('Song in the dark', 'A lullaby the squad half-remembers drifts out of nowhere.',
          ch('Follow it to its source', 'hard', { us: 1 }, 'A shard, singing to itself.', 'The source sings back.'),
          ch('Sing along', 'easy', { xp: 1 }, 'Old memories, and new strength.', 'They cannot stop singing.'),
          ch('Block their ears', 'safe', {}, 'The song fades behind them.', 'The song gets in anyway.')),
      ] },
      { id: 'door', variants: [
        v('A door in nothing', 'A plain wooden door stands in the void. It is unlocked.',
          ch('Open it', 'hard', { us: 1 }, 'Behind it: a quiet room, and a shard on the table.', 'Behind it: something that follows them out.'),
          ch('Knock first', 'easy', { xp: 1 }, 'Something knocks back, politely. They feel braver for it.', 'Something knocks back, hard.'),
          LEAVE),
        v('The iron gate', "A gate of black iron, carved with the squad's own names.",
          ch('Force it open', 'medium', { xp: 2 }, 'The gate gives, and so does their fear.', 'The gate pushes back.'),
          ch('Read the carvings', 'easy', { rp: 1 }, 'Below the names: a place on the map.', 'The names start to change.')),
        v('Hall of doors', 'Every door here opens onto another door.',
          ch('Trust their instinct', 'medium', { xp: 1, supply: 25 }, 'The right door, first time, and a storeroom behind it.', 'The wrong door, every time.'),
          ch('Map the doors', 'easy', { rp: 1 }, 'A pattern emerges, and it is worth something.', 'The doors move.')),
      ] },
      { id: 'drift', variants: [
        v('Drift of wrecks', 'Ships from a dozen ages hang still, tangled together.',
          ch('Board the oldest', 'hard', { us: 1 }, 'Its hold is full of old shards.', 'Its crew is still aboard.'),
          ch('Salvage the newest', 'easy', { supply: 25 }, 'Fresh parts, barely scorched.', 'It breaks apart around them.')),
        v('Lost patrol', 'A patrol of their own faction drifts past, still in formation, decades too late.',
          ch('Recover their orders', 'medium', { rp: 1 }, 'The orders were never delivered. Now they are.', 'The orders are for a war long over.'),
          ch('Give them a burial', 'easy', { xp: 1 }, 'The squad stands a little straighter.', 'The bodies will not stay still.')),
        v('Floating graveyard', 'Tombstones drift in a slow orbit around a dead star.',
          ch('Rob the graves', 'medium', { supply: 25 }, 'The dead had no more use for it.', 'The dead disagree.'),
          ch('Read the names', 'easy', { xp: 1 }, 'Heroes of a forgotten war. They will be remembered now.', 'One of the names is theirs.'),
          LEAVE),
      ] },
    ],
  },
  {
    id: 'planet', name: 'Uncharted World', desc: 'A world off the maps, with ruins, beasts and whatever its last owners left behind.',
    finish: { text: 'The squad plants a beacon on the highest peak: the world is on your maps now.', reward: { supply: 50 } },
    encounters: [
      { id: 'beasts', variants: [
        v('Apex predator', 'Something huge is stalking them through the jungle.',
          ch('Turn and fight', 'medium', { xp: 2 }, 'They bring it down. The trophies will be talked about.', 'It mauls them and slips away.'),
          ch('Lose it in the river', 'easy', {}, 'It loses the scent.', 'It was waiting downstream.')),
        v('Stampede', 'The ground shakes. A herd of horned giants is coming straight at them.',
          ch('Stand fast and fire', 'medium', { xp: 1, supply: 25 }, 'The herd splits around them, and there is meat for weeks.', 'Not all of them were stopped.'),
          ch('Run for the rocks', 'safe', {}, 'They watch the herd thunder past from above.', 'Not everyone reaches the rocks.')),
        v('Nest of eggs', 'Eggs the size of a man, still warm. Something will come back for them.',
          ch('Take an egg', 'hard', { rp: 1, supply: 25 }, 'Collectors will pay a fortune for it.', 'The mother comes back early.'),
          ch('Wait for the mother and fight', 'medium', { xp: 2 }, 'A hard fight, and a great trophy.', 'She was bigger than the eggs suggested.'),
          LEAVE),
      ] },
      { id: 'ruins', variants: [
        v('Ancient ruins', 'Stone halls older than any empire they know.',
          ch('Search the vaults', 'medium', { supply: 25 }, 'Old wargear, still usable.', 'The roof comes down.'),
          ch('Copy the carvings', 'easy', { rp: 1 }, 'Scholars back home will pay well for these.', 'Rain washes the copies out.'),
          LEAVE),
        v('Sunken temple', 'Steps lead down into flooded halls lit by glowing moss.',
          ch('Dive for the altar', 'medium', { rp: 1 }, 'Gold and old script, ready for the scholars.', 'The water is deeper and colder than it looks.'),
          ch('Search the dry halls', 'easy', { supply: 25 }, 'Old stores, still sealed.', 'The moss is not moss.'),
          LEAVE),
        v('Watchtower', 'A tower on the ridge, its guns still aimed at the sky.',
          ch('Restart the guns', 'hard', { xp: 1, supply: 25 }, 'The guns roar for the first time in an age.', 'The guns turn the wrong way.'),
          ch('Climb it and look', 'easy', { rp: 1 }, 'They map the whole valley from the top.', 'The stairs give way.')),
      ] },
      { id: 'settlers', variants: [
        v('Lost settlers', 'A village of people who have never heard of the war.',
          ch('Trade with them', 'easy', { supply: 25 }, 'Fresh food and fuel, fairly bought.', 'The trade goes sour.'),
          ch('Train their militia', 'easy', { xp: 1 }, 'Teaching sharpens the teachers.', 'A drill goes wrong.')),
        v('Village under siege', 'Raiders circle a walled village, and the villagers beg for help.',
          ch('Drive off the raiders', 'medium', { xp: 2 }, 'The raiders flee, and the village feasts the squad.', 'The raiders were better armed than they looked.'),
          ch('Take payment and leave', 'easy', { supply: 25 }, 'They pay in food and fuel, and ask no questions.', 'The raiders come for the squad instead.')),
        v('Village seer', 'An old seer says the squad has walked through their dreams for years.',
          ch("Buy the seer's maps", 'medium', { rp: 1 }, 'Every path on them is real.', 'The maps lead into a swamp.'),
          ch('Hear the prophecy', 'easy', { xp: 1 }, 'Strange words, but they steady the squad.', 'The prophecy is about their deaths.'),
          LEAVE),
      ] },
      { id: 'storm', variants: [
        v('Ion storm', 'The sky turns green and every system flickers.',
          ch('Dig in and wait it out', 'safe', {}, 'The storm passes over.', 'Lightning finds them.'),
          ch('March through it', 'medium', { xp: 1 }, 'Hard going, and they are harder for it.', 'They lose their way.')),
        v('Spore storm', 'Clouds of golden spores roll across the plain.',
          ch('Collect the spores', 'hard', { rp: 1 }, 'A medicae will pay well for these.', 'The spores take root.'),
          ch('Mask up and push on', 'easy', { xp: 1 }, 'They come through coughing, but tougher.', 'The masks clog.'),
          ch('Shelter in the rocks', 'safe', {}, 'The cloud rolls past.', 'The spores find the cracks.')),
        v('Earthquake', 'The ground opens in a long, grinding crack.',
          ch('Climb down into the crack', 'hard', { us: 1 }, 'Deep in the stone: a seam of shards.', 'The ground closes again.'),
          ch('Jump the gap', 'easy', { xp: 1 }, 'One by one they make it across.', 'One of them falls short.'),
          ch('Go the long way round', 'safe', {}, 'A long walk, but a safe one.', 'The long way crumbles too.')),
      ] },
      { id: 'caves', variants: [
        v('Glowing caves', 'Blue fungus lights a cave system running deep into the hills.',
          ch('Go deep', 'heroic', { us: 1, rp: 1 }, 'At the bottom, the glow comes from a shard.', 'The tunnels branch and branch.'),
          ch('Harvest the fungus', 'easy', { supply: 25 }, 'It glows, it heals, it sells.', 'It is poisonous.'),
          LEAVE),
        v('Echoing caves', 'Every word they say comes back a moment too late, in the wrong voice.',
          ch('Shout a challenge', 'medium', { xp: 2 }, 'Something answers, and they beat it.', 'Something answers, and it is big.'),
          ch('Creep through in silence', 'safe', {}, 'Not a word, not a sound, and out the other side.', 'Someone sneezes.')),
        v("Smugglers' cave", 'Crates, a cold fire and fresh footprints: someone uses these caves.',
          ch('Lie in wait', 'medium', { xp: 1, rp: 1 }, 'The smugglers talk, and pay to be let go.', 'The smugglers set an ambush of their own.'),
          ch('Take the crates', 'easy', { supply: 25 }, 'Whoever owned them will miss them.', 'They come back while the squad is loading up.')),
      ] },
      { id: 'crash', variants: [
        v('Crashed lander', 'A lander from their own faction, nose-first in the mud.',
          ch('Recover the cargo', 'medium', { supply: 25 }, 'The cargo is intact.', 'The fuel tanks go up.'),
          ch('Search for survivors', 'easy', { xp: 1 }, 'One survivor, and a grateful one.', 'Nobody survived, and something has been eating.')),
        v('Alien wreck', 'Something not built by human hands lies broken in a crater.',
          ch('Pry out its power core', 'hard', { us: 1 }, 'The core is a single great shard.', 'The core discharges.'),
          ch('Study the hull', 'medium', { rp: 1 }, 'The metal is unlike anything they know.', 'The hull is still warm, and still awake.'),
          LEAVE),
        v('Burning freighter', 'A freighter came down hours ago. Its hold is on fire.',
          ch('Brave the flames', 'medium', { xp: 1, supply: 25 }, 'They pull out crate after crate.', 'The fire wins.'),
          ch('Grab what fell clear', 'easy', { supply: 25 }, 'Scorched, but still good.', 'It was not clear enough.')),
      ] },
    ],
  },
  {
    id: 'fringe', name: 'Voidspawn Fringe', desc: 'The edge of Echo space. The richest pickings, and the Echoes notice who takes them.',
    finish: { text: 'The squad comes back with an Echo nest-core: the Void Echoes will feel this.', reward: { us: 1, rp: 1 } },
    encounters: [
      { id: 'scouts', variants: [
        v('Echo scouts', 'A pack of Void Echoes is moving through the dust.',
          ch('Ambush them', 'medium', { xp: 2 }, 'The pack never sees them coming.', 'The pack turns on them.'),
          ch('Shadow them back to their nest', 'hard', { rp: 1 }, 'They mark the nest for the next offensive.', 'They are spotted.'),
          LEAVE),
        v('Echo hunter', 'Something is hunting the squad, and it moves like smoke.',
          ch('Turn the trap on it', 'heroic', { xp: 4 }, 'The hunter becomes the hunted.', 'It was waiting for that.'),
          ch('Lose it in the dust', 'easy', {}, 'The trail goes cold.', 'It finds them again.')),
        v('Wounded Echo', 'A wounded Echo crawls through the dust, leaking light.',
          ch('Harvest its light', 'hard', { us: 1 }, 'The light sets into a shard.', 'The light goes out, and others come to see why.'),
          ch('Follow its trail', 'medium', { rp: 1 }, 'It leads them to a gathering ground.', 'It leads them into a trap.'),
          ch('Finish it', 'easy', { xp: 1 }, 'A clean kill.', 'It was only pretending.')),
      ] },
      { id: 'shardfield', variants: [
        v('Shard field', 'Umbra shards grow here like crystals of frost.',
          ch('Mine as much as you can carry', 'hard', { us: 1 }, 'Their packs are heavy with shards.', 'The field wakes up.'),
          ch('Take a few and go', 'easy', { supply: 25 }, 'Small shards, but they trade well.', 'Even a few was too many.')),
        v('Shard storm', 'Wind whips shards through the air like shrapnel.',
          ch('Catch them as they fly', 'hard', { us: 1 }, 'Bloodied hands, but full ones.', 'The storm cuts them up.'),
          ch('Shelter and collect what lands', 'easy', { supply: 25 }, 'A careful harvest.', 'The shelter collapses.')),
        v('Shard monolith', 'A single shard, tall as a tower, pulses like a heart.',
          ch('Chip off a piece', 'heroic', { us: 1, rp: 1 }, 'A piece breaks free, warm in their hands.', 'The monolith flares.'),
          ch('Study its pulse', 'medium', { rp: 1 }, 'The pulse matches the Echoes. That is worth knowing.', 'The pulse starts to match theirs.'),
          LEAVE),
      ] },
      { id: 'corrupted', variants: [
        v('Corrupted outpost', 'An outpost of your own faction, gone silent.',
          ch('Purge it', 'medium', { xp: 1, supply: 25 }, 'The outpost is clean and its stores are yours.', 'Whatever took it is still there.'),
          ch('Recover the data', 'easy', { rp: 1 }, 'They learn what happened here.', 'The data is corrupted too.')),
        v('Rotting depot', 'A supply depot full of stores, and full of void-rot.',
          ch('Find the sealed crates', 'hard', { supply: 25, rp: 1 }, 'Sealed tight, and worth it.', 'The seals were broken.'),
          ch('Burn the rot out', 'medium', { supply: 25 }, 'What survives the fire is clean.', 'The rot spreads faster than the fire.')),
        v('Last stand', 'The outpost fell, but its defenders took plenty of Echoes with them.',
          ch('Find what they died guarding', 'hard', { us: 1 }, 'A strongbox of shards.', 'Whatever it was is gone, and something else is here.'),
          ch('Take their weapons', 'medium', { supply: 25 }, 'The dead pass their guns to the living.', 'The guns are void-touched.'),
          ch('Recover their tags', 'easy', { xp: 1 }, 'Their names go home.', 'The Echoes left a guard.')),
      ] },
      { id: 'void', variants: [
        v('Hungry void', 'The ground itself starts pulling them down.',
          ch('Run for it', 'easy', {}, 'They make it out.', 'Not everyone runs fast enough.'),
          ch('Take a sample', 'hard', { us: 1 }, 'A jar of living void, worth its weight in shards.', 'The void takes the jar, and more.')),
        v('Void tide', 'Darkness rolls in like a tide, swallowing the stars one by one.',
          ch('Stand in it and endure', 'heroic', { xp: 4 }, 'They come out the other side, changed and hard.', 'The dark keeps something.'),
          ch('Outrun it', 'easy', {}, 'The tide falls short of them.', 'The tide comes in faster.')),
        v('Silent zone', 'Sound dies here. Their boots, their guns, their voices: nothing.',
          ch('Press on by hand signals', 'medium', { xp: 2 }, 'Drilled, disciplined, through.', 'A signal is missed.'),
          ch('Record the silence', 'medium', { rp: 1 }, 'Silence like this has a price.', 'The silence records them.')),
      ] },
      { id: 'beacon', variants: [
        v('Distress beacon', 'A beacon pulses an old rescue code from their own faction.',
          ch('Answer it', 'medium', { xp: 1, supply: 25 }, 'A lost squad, saved, and grateful.', 'It was bait.'),
          ch('Track the signal from a distance', 'easy', { rp: 1 }, 'The Echoes are using it as a lure. Good to know.', 'The signal tracks them back.')),
        v('Echo lure', 'A beacon sings in a voice the squad knows, calling them by name.',
          ch('Rewire it against the Echoes', 'hard', { us: 1 }, 'The Echoes come to it, and leave their shards behind.', 'The Echoes come to it, and to the squad.'),
          ch('Smash it', 'easy', { xp: 1 }, 'The voice stops mid-word.', 'The voice calls louder.'),
          LEAVE),
        v('Dead relay', 'A dark relay station, its antennae bent toward Echo space.',
          ch('Restore power and listen', 'medium', { rp: 1 }, 'They listen in on the Echoes for a while.', 'The Echoes were listening too.'),
          ch('Strip it', 'easy', { supply: 25 }, 'Good copper and better circuits.', 'The relay was rigged.')),
      ] },
      { id: 'husks', variants: [
        v('Husk field', 'Dead soldiers stand in rows, their eyes full of void-light.',
          ch('Put them to rest', 'medium', { xp: 2 }, 'It is grim work, and it makes them grim.', 'The husks fight back.'),
          ch('Sneak between them', 'easy', {}, 'Not one head turns.', 'Every head turns.')),
        v('Husk procession', 'Husks march in a long line toward the heart of the fringe.',
          ch('Join the line in disguise', 'heroic', { rp: 1, us: 1 }, 'They walk into the nest, and out again with its secrets.', 'The husks know their own.'),
          ch('Thin the line from cover', 'easy', { xp: 1 }, 'Shot by shot, the line gets shorter.', 'The line turns toward the shots.')),
        v('Husk of a hero', "Among the husks stands one in your faction's colours: a hero everyone knows.",
          ch('Take back their relic blade', 'hard', { us: 1 }, 'The blade glows with trapped shards.', 'The hero will not let go.'),
          ch('Give them peace', 'medium', { xp: 2 }, 'The hero falls, and the squad salutes.', 'The hero still fights like one.'),
          LEAVE),
      ] },
    ],
  },
];

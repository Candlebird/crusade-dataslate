// Homebrew: things a force can do between games. Each unit can go on one a round. Worth about a quarter of a battle.

/** Solo patrol: a quick game against the AI with a small part of the force. */
export const SOLO_PATROL = {
  points: 500,
  /** The enemy the patrol runs into: anywhere from enemyMin to enemyMax pts, in steps of enemyStep. */
  enemyMin: 400,
  enemyMax: 700,
  enemyStep: 50,
  /** XP each unit gets for spotting the enemy, when the patrol turns the fight down. */
  declineXp: 1,
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
    finish: { text: 'Deep in the hulk the squad finds a sealed reliquary, still humming.', reward: { us: 3 } },
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
          ch("Find the mutineers' cache", 'heroic', { us: 3, rp: 1 }, "Under the captain's chair: a pouch of shards.", 'The chair was booby-trapped.'),
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
          ch('Harvest a shard', 'hard', { us: 3 }, 'A perfect Umbra shard comes away in their hands.', 'The song turns into a shriek.'),
          ch('Listen to the song', 'easy', { xp: 1 }, 'Something in it makes them sharper.', 'They lose hours to it.'),
          LEAVE),
        v('Crystal forest', 'Towers of glass rise out of nothing, humming in harmony.',
          ch('Climb to the singing heart', 'heroic', { us: 3, rp: 1 }, 'At the top, a shard hums in their hands.', 'The tower sings them off it.'),
          ch('Chip off the smaller ones', 'easy', { supply: 25 }, 'Pretty, and they sell.', 'The forest shatters around them.'),
          LEAVE),
        v('Bleeding light', 'Light leaks from cracks in the air and pools like water.',
          ch('Bottle it', 'hard', { us: 3 }, 'It sets into a shard inside the jar.', 'The jar cracks and the light burns.'),
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
          ch('Bargain with it', 'hard', { us: 3 }, 'It pays in shards, and asks nothing yet.', 'It takes its price at once.')),
        v('The merchant', 'A smiling figure in a coat of stars lays out wares on nothing at all.',
          ch('Trade fairly', 'easy', { supply: 25 }, 'The merchant is, for once, honest.', 'They pay twice what it was worth.'),
          ch('Steal from the stall', 'hard', { us: 3 }, 'They get away with a shard.', 'The merchant always gets paid.'),
          LEAVE),
        v('Song in the dark', 'A lullaby the squad half-remembers drifts out of nowhere.',
          ch('Follow it to its source', 'hard', { us: 3 }, 'A shard, singing to itself.', 'The source sings back.'),
          ch('Sing along', 'easy', { xp: 1 }, 'Old memories, and new strength.', 'They cannot stop singing.'),
          ch('Block their ears', 'safe', {}, 'The song fades behind them.', 'The song gets in anyway.')),
      ] },
      { id: 'door', variants: [
        v('A door in nothing', 'A plain wooden door stands in the void. It is unlocked.',
          ch('Open it', 'hard', { us: 3 }, 'Behind it: a quiet room, and a shard on the table.', 'Behind it: something that follows them out.'),
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
          ch('Board the oldest', 'hard', { us: 3 }, 'Its hold is full of old shards.', 'Its crew is still aboard.'),
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
          ch('Climb down into the crack', 'hard', { us: 3 }, 'Deep in the stone: a seam of shards.', 'The ground closes again.'),
          ch('Jump the gap', 'easy', { xp: 1 }, 'One by one they make it across.', 'One of them falls short.'),
          ch('Go the long way round', 'safe', {}, 'A long walk, but a safe one.', 'The long way crumbles too.')),
      ] },
      { id: 'caves', variants: [
        v('Glowing caves', 'Blue fungus lights a cave system running deep into the hills.',
          ch('Go deep', 'heroic', { us: 3, rp: 1 }, 'At the bottom, the glow comes from a shard.', 'The tunnels branch and branch.'),
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
          ch('Pry out its power core', 'hard', { us: 3 }, 'The core is a single great shard.', 'The core discharges.'),
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
    finish: { text: 'The squad comes back with an Echo nest-core: the Void Echoes will feel this.', reward: { us: 3, rp: 1 } },
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
          ch('Harvest its light', 'hard', { us: 3 }, 'The light sets into a shard.', 'The light goes out, and others come to see why.'),
          ch('Follow its trail', 'medium', { rp: 1 }, 'It leads them to a gathering ground.', 'It leads them into a trap.'),
          ch('Finish it', 'easy', { xp: 1 }, 'A clean kill.', 'It was only pretending.')),
      ] },
      { id: 'shardfield', variants: [
        v('Shard field', 'Umbra shards grow here like crystals of frost.',
          ch('Mine as much as you can carry', 'hard', { us: 3 }, 'Their packs are heavy with shards.', 'The field wakes up.'),
          ch('Take a few and go', 'easy', { supply: 25 }, 'Small shards, but they trade well.', 'Even a few was too many.')),
        v('Shard storm', 'Wind whips shards through the air like shrapnel.',
          ch('Catch them as they fly', 'hard', { us: 3 }, 'Bloodied hands, but full ones.', 'The storm cuts them up.'),
          ch('Shelter and collect what lands', 'easy', { supply: 25 }, 'A careful harvest.', 'The shelter collapses.')),
        v('Shard monolith', 'A single shard, tall as a tower, pulses like a heart.',
          ch('Chip off a piece', 'heroic', { us: 3, rp: 1 }, 'A piece breaks free, warm in their hands.', 'The monolith flares.'),
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
          ch('Find what they died guarding', 'hard', { us: 3 }, 'A strongbox of shards.', 'Whatever it was is gone, and something else is here.'),
          ch('Take their weapons', 'medium', { supply: 25 }, 'The dead pass their guns to the living.', 'The guns are void-touched.'),
          ch('Recover their tags', 'easy', { xp: 1 }, 'Their names go home.', 'The Echoes left a guard.')),
      ] },
      { id: 'void', variants: [
        v('Hungry void', 'The ground itself starts pulling them down.',
          ch('Run for it', 'easy', {}, 'They make it out.', 'Not everyone runs fast enough.'),
          ch('Take a sample', 'hard', { us: 3 }, 'A jar of living void, worth its weight in shards.', 'The void takes the jar, and more.')),
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
          ch('Rewire it against the Echoes', 'hard', { us: 3 }, 'The Echoes come to it, and leave their shards behind.', 'The Echoes come to it, and to the squad.'),
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
          ch('Join the line in disguise', 'heroic', { rp: 1, us: 3 }, 'They walk into the nest, and out again with its secrets.', 'The husks know their own.'),
          ch('Thin the line from cover', 'easy', { xp: 1 }, 'Shot by shot, the line gets shorter.', 'The line turns toward the shots.')),
        v('Husk of a hero', "Among the husks stands one in your faction's colours: a hero everyone knows.",
          ch('Take back their relic blade', 'hard', { us: 3 }, 'The blade glows with trapped shards.', 'The hero will not let go.'),
          ch('Give them peace', 'medium', { xp: 2 }, 'The hero falls, and the squad salutes.', 'The hero still fights like one.'),
          LEAVE),
      ] },
    ],
  },
];

// Unit tasks (Nexus Wars): one unit, one task, for the whole round. A unit on a task is busy: it fights in no battle
// that round, the round's main Battle included. Each takes effect when it's set.

/** Mentoring: a veteran teaches a unit of the same category and a lower level. Both are busy. */
export const MENTORING = {
  /** XP the pupil gains for each of the mentor's levels. */
  xpPerLevel: 3,
};

/** Garrison: units stand guard on one of their faction's worlds through the round, against the Marauders. */
export const GARRISON = {
  /** The garrison throws a raid back when its points are at least this share of the band's Supply. */
  holdShare: 0.5,
  /** Weaker than that, the band still gets in but carries off only this share of what it would have. */
  weakTheft: 0.5,
  /** XP for each unit in the garrison when a band comes, held or not. */
  raidXp: 2,
  /** Rounds a garrison is kept on the sector after it stood, waiting for its units to take their XP. */
  keepRounds: 3,
};

/** Recon: a unit scouts beyond the faction's sight. */
export const RECON = {
  /** How far the target can be from one of the faction's sectors or detachments. */
  range: 3,
  /** The target and everything within this many hexes of it are seen. */
  radius: 1,
  /** Seen this round and the next. */
  rounds: 2,
};

export interface ProjectDef {
  id: string;
  name: string;
  desc: string;
  /** Progress it takes. Each unit set to it adds a D3. */
  goal: number;
  /** Not on a world already Reinforced (or Walled). */
  needsUnfortified?: boolean;
  reward: { reinforce?: boolean; materials?: number; research?: number; relic?: 'Common' | 'Rare' };
}

/** Projects: worked on a world the faction holds, one at a time per world, a D3 of progress per unit per round. */
export const PROJECT_DIE = 3;
export const PROJECTS: ProjectDef[] = [
  { id: 'fortify', name: 'Fortify', goal: 6, needsUnfortified: true, desc: 'Dig in: the world is Reinforced (+200 Supply defending it, and Marauders are thrown back).', reward: { reinforce: true } },
  { id: 'salvage', name: 'Salvage', goal: 4, desc: 'Strip wrecks and old works: +150 Materials into the world\'s bank.', reward: { materials: 150 } },
  { id: 'research', name: 'Research', goal: 6, desc: 'Study what the world holds: +2 Research for the faction.', reward: { research: 2 } },
  { id: 'relic', name: 'Forge a relic', goal: 8, desc: 'A free Common relic, taken in the Requisition shop by the force that finishes it.', reward: { relic: 'Common' } },
  { id: 'rareRelic', name: 'Forge a rare relic', goal: 18, desc: 'A free Rare relic, taken in the Requisition shop by the force that finishes it.', reward: { relic: 'Rare' } },
];

/** Off-table XP: the most a unit banks from free Sorties and Training runs together in a round (a week outside a campaign). */
export const OFF_TABLE_XP = { perRound: 5 };

/**
 * Training sim: a Gem TD-like run between games. Before every wave five Shards are drawn and set on the map, one is
 * kept and the rest crumble to rubble, so the map fills up into the maze the Echoes walk. Shards that match a unit's
 * recipe are crafted into that unit, a real tower with its own weapons and rules. Nothing in it touches the campaign
 * but XP: units don't become busy. The logic is in rules/training/; the game is components/training/.
 */
export const TRAINING = {
  /** Debug: the HUD's Auto button lets the balance bot (training/bot.ts) play the live run; a run that uses it banks
   *  nothing. Set false to take the button away. */
  debugAuto: true,
  /** XP each crafted unit earns for every `xpEvery` waves cleared since it was crafted, up to `xpCap` a run. */
  xpPerWave: 1,
  xpEvery: 5,
  xpCap: 5,
  /** The map is this many cells square; every piece on it (Shard, rubble, unit) is 2×2 cells. */
  mapSize: 62,
  /**
   * The enemy's route: it comes in on the spawn, walks over each pad in turn, then makes for the base, finding its own
   * way through the maze (every piece blocks its cells). Nothing can be built on a pad, the base, or where x and y are
   * both within `noBuild` of the corner, and no placement may cut the route off. Scouts come in on pad `scoutAt`;
   * Ambushers walk from the spawn and, reaching pad `ambushFrom`, vanish and come out on pad `ambushAt` (counting from 1).
   */
  route: {
    spawn: { x: 4, y: 4 },
    pads: [{ x: 4, y: 24 }, { x: 44, y: 24 }, { x: 44, y: 4 }, { x: 24, y: 4 }, { x: 24, y: 54 }],
    base: { x: 48, y: 54 },
    noBuild: 9,
    scoutAt: 1,
    ambushFrom: 1,
    ambushAt: 3,
  },
  /** Enemies walk this many cells a second for each point of their speed (a 1405-cell maze takes a drone about 70 s). */
  walkMul: 18,
  /**
   * Game time: a second of play at 1× runs this many seconds of the sim (walking, spawns, fire clocks, fx), so 2× and
   * 4× scale with it. Only the screen's loop reads it (clock.ts); the engine and the bot count in sim seconds.
   */
  timeScale: 0.5,
  /** Every shooting weapon (unit, Shard, default, relic shot, barrage) reaches this share of its listed range in cells. */
  rangeMul: 0.5,
  /** The base's HP, and what each leak costs it: an enemy's own `leak`, or `elite` for an elite (whichever is more); an
   *  Echo Lord its `leak` × the share of its wounds left (rounded up), never below `bossMin`. Four times the old 20,
   *  since waves come four times as thick (`wave.crowd`): a leaking wave costs the same share of the base as before. */
  baseHp: 80,
  leak: { elite: 3, bossMin: 4 },
  /** Melee weapons reach this many cells from the middle of their piece (so they hit walkers squeezing past). */
  meleeReach: 2,
  /** Seconds between a tower's volleys: shooting, and melee (every tower: units, Shards, defaults). A volley spreads its
   *  shots over `volleySpread` of the wait. A quarter of the old 2 s and 1.2 s, for waves four times as thick. */
  shootEvery: 0.5,
  meleeEvery: 0.3,
  volleySpread: 0.5,
  /** Blast(X) hits up to X enemies within this many cells of the target. */
  blastRadius: 2,
  /** A Hero's aura gives +1 to hit to every tower within this many cells of it, itself included. */
  auraRadius: 6,
  /** Every enemy has this many times its listed wounds (tuned with the balance bot, bot.balance.test.ts: a fresh sample force
   *  reaches about wave 20-25). */
  enemyHp: 0.16,
  /**
   * Holds: a crafted unit with Tough above 1 (not an Aircraft) grabs one walker in melee reach and holds it `perTough`
   * seconds per Tough, up to `max`; a boss or a monster is held `bigMul` as long. Let go, an enemy can't be grabbed
   * again (by anyone) for `regrab` seconds: `[at Defense 6+, at Defense 2+]`, straight between.
   */
  holds: { perTough: 0.3, max: 1.5, bigMul: 0.5, regrab: [3, 1.5] as [number, number] },
  /**
   * Level-ups, bought with credits between waves. A unit's cap by its points (`upTo` or less); the first costs `base` ×
   * points / `perPoints` (its Training points: economy.trainPoints) × `costMul`, at least `minCost`, each after `growth`
   * times the last. Each gives +1 Tough (a longer hold),
   * `dmg` a hit (`meleeDmg` in melee), `rate` faster fire and `range` cells to shooting weapons and auras.
   */
  /**
   * Immobile units (and Fortifications) are cheap in OPR for a rule that costs nothing in a tower defence: wherever
   * Training prices a unit by its points (recipe tier, level cap and cost, the waves' power) they count this many times
   * their points (economy.trainPoints). Their real points are untouched everywhere else.
   */
  immobileSurcharge: 1.125,
  levels: {
    caps: [{ upTo: 100, cap: 5 }, { upTo: 200, cap: 4 }, { upTo: 300, cap: 3 }, { upTo: 400, cap: 2 }, { upTo: Infinity, cap: 1 }],
    base: 30,
    perPoints: 100,
    costMul: 1.1,
    minCost: 5,
    growth: 1.25,
    dmg: 0.5,
    meleeDmg: 1,
    rate: 0.25,
    range: 1,
  },
  /** Credits: a kill pays its enemy's cost × `perCost` (at least 1), shared out over the `wave.crowd` that come in its
   *  place (all but the Lord: a fraction of a credit each, so a wave pays as before); a wave cleared pays `wave` + `perWave` × its number, and `noLeak` more if nothing got through. */
  credits: { start: 20, perCost: 0.5, wave: 8, perWave: 1, noLeak: 10 },
  /** Mending the base: +`hp` for `cost` credits (each mend this run `growth` times dearer), never above `baseHp`. */
  mend: { hp: 20, cost: 40, growth: 1.2 },
  /**
   * Waves. Wave w's enemies cost `base` for every `perPoints` points in the force × w^`curve` × `growth`^(w-1), each
   * point past `fullPoints` (the size the waves are tuned for) counting only `overRate` of one (waves.ts wavePoints: new
   * level-0 units are slow to earn their keep, so a bigger force mustn't fall sooner); past
   * `maxCount` enemies (`flyMax` on a flying wave) the rest of the budget makes them tougher instead. Every enemy has
   * `hpGrowth` times more wounds a wave from wave `hpFrom` to `hpTo`, `lateGrowth` times a wave after (waves.ts lateHp).
   * Ground waves (not a flying wave nor the sky boss's) are tougher again from `groundFrom`, about when the first units
   * are crafted: `groundGrowth` times a wave to `groundTo`, `groundLate` a wave after (waves.ts groundHpAt), since crafted
   * units with long guns rake the whole maze while flyers only cross their reach once; from `easeFrom` to `easeTo` they
   * are `ease` times as tough a wave (the run-up to the wave-25 Lord, held after: later waves climb as before from there).
   * The first waves, while a Shard or two holds the maze, are gentler: wave w has `earlyBudget`[w-1] of its budget (fewer
   * enemies), `earlyHp`[w-1] of its wounds and walks at `earlyPace`[w-1]. Every flying wave is as it was. Every `flyEvery`th wave flies, with `flyShare` of the budget (flyers skip the maze), its flyers `flyHp` × `flyFade`^(w-1)
   * as tough (thinner as the maze grows). Every `bossEvery`th brings an Echo Lord with `escorts` of its budget as escorts
   * (the rest toughens the boss, never below `bossMin` of its wounds), the Lord `bossHp` times tougher again (one entry a
   * boss wave, the last holding on); every `flyBossEvery`th the Lord flies (`flyBossHp` as tough; its escorts walk).
   * Scouts come in with `scoutHp` of their wounds, Ambushers with `ambushHp`. Enemies come in `gap` seconds apart
   * (about). Every enemy (the Lord too) costs the budget its `cost` / `crowd`, so a wave is `crowd` times as thick as
   * its costs say (towers fire as much faster); a kill pays `crowd` times less, bar the Lord's. Each wave is one kind (a boss wave the boss and one kind of escort), drawn by `kinds` weight from those that
   * can turn up (a flying wave's from the `main` ones); as many come as the budget buys, their wounds evened out so the
   * wave costs its budget. From wave `eliteFrom` every `eliteEvery`th is an elite, with `eliteHp` times the wounds (drawn
   * with a gold rim). Tuned with the balance bot (bot.balance.test.ts): a boss gets a pad or two into the maze, the bot leaks
   * now and then in waves 8-15, a fresh force reaches about wave 21, and no flying wave is a wall.
   */
  wave: {
    base: 1.6,
    perPoints: 1000,
    fullPoints: 850,
    overRate: 0.25,
    growth: 1.15,
    curve: 0.7,
    crowd: 4,
    maxCount: 96,
    hpFrom: 4,
    hpTo: 20,
    hpGrowth: 1.15,
    lateGrowth: 1.17,
    groundFrom: 8,
    groundTo: 16,
    groundGrowth: 1.05,
    groundLate: 1.02,
    earlyHp: [0.5, 0.65, 0.8] as number[],
    earlyPace: [0.5, 0.7, 0.9] as number[],
    earlyBudget: [0.4, 0.6, 1] as number[],
    easeFrom: 20,
    easeTo: 25,
    ease: 0.9,
    flyEvery: 4,
    flyShare: 0.4,
    flyMax: 48,
    flyHp: 1.8,
    flyFade: 0.9,
    bossEvery: 5,
    flyBossEvery: 20,
    escorts: 0.5,
    bossMin: 0.1,
    bossHp: [2.0, 2.6, 3.5, 1.7, 0.45, 0.375] as number[],
    flyBossHp: 0.75,
    scoutHp: 0.8,
    ambushHp: 0.65,
    gap: 0.15,
    kinds: { swarm: 3, drone: 3, spitter: 2, outrider: 1.5, carapace: 2, mirror: 1.5, stalker: 1.5, brute: 1.5 } as Partial<Record<TrainingEnemyKind, number>>,
    eliteFrom: 6,
    eliteEvery: 6,
    eliteHp: 2,
  },
  /**
   * Default towers (emplacements.ts): generic emplacements any force can build from Shards of exactly these types and
   * grades (Flawed means Flawed). Between them the recipes use each of the 40 Shard kinds once. Each slot brings its
   * type's rule; only the `guns` slots bring a gun (one weapon, two for the Citadel), scaled so the whole does `dpsShare` of the damage a crafted unit from Shards of
   * the same value does: `unitDps` a point of recipe value at Defense `dpsDefense` (dps.ts towerDps; the sample
   * forces' mean, measured, and checked by emplacements.test.ts). Quality is the best of its Shards' less
   * `qualityBonus` (lower is better), never below 2+. A default takes no XP, levels, traits or relics, and is hidden
   * while one of the force's uncrafted unit recipes can be filled from its Shards. Each can be upgraded once between
   * waves (emplacements.upgradeDefault): `upgrade.dmg` more damage and `upgrade.reach` cells more reach, for
   * `upgrade.perValue` credits a point of its Shards' value (Cracked 1 … Pristine 16; at least `upgrade.min`).
   */
  defaults: {
    upgrade: { dmg: 0.25, reach: 1, perValue: 4, min: 10 },
    dpsShare: 0.75,
    unitDps: 1.384,
    dpsDefense: 5,
    qualityBonus: 1,
    recipes: [
      { key: 'picket', name: 'Picket Post', text: 'A sentry nest that watches the sky.', slots: [['firepower', 1], ['swift', 1], ['command', 1]], guns: ['firepower'] },
      { key: 'barricade', name: 'Barricade', text: 'Sharpened stakes behind a sandbag wall.', slots: [['bulwark', 1], ['assault', 1], ['vigor', 1]], guns: ['assault'] },
      { key: 'mortar', name: 'Mortar Pit', text: 'Lobbed shells that burst among the pack.', slots: [['blast', 1], ['breach', 1], ['firepower', 2]], guns: ['blast'] },
      { key: 'razorwire', name: 'Razorwire Run', text: 'Coils of wire that slow and cut.', slots: [['assault', 2], ['swift', 2], ['bulwark', 2]], guns: ['swift'] },
      { key: 'shrine', name: 'Field Shrine', text: 'A blessed post that steadies the guns round it.', slots: [['vigor', 2], ['command', 2], ['blast', 2]], guns: ['command'] },
      { key: 'lascannon', name: 'Lascannon Nest', text: 'A heavy beam that cuts through armour.', slots: [['breach', 2], ['firepower', 3], ['command', 3]], guns: ['breach'] },
      { key: 'pylon', name: 'Bastion Pylon', text: 'A shield pylon that dazes what brushes it.', slots: [['bulwark', 3], ['vigor', 3], ['command', 4]], guns: ['bulwark'] },
      { key: 'flak', name: 'Flak Battery', text: 'Quick-firing guns that fill the sky.', slots: [['swift', 3], ['firepower', 4], ['blast', 3]], guns: ['firepower'] },
      { key: 'ram', name: 'Breaker Ram', text: 'Piston-driven blades for anything that comes close.', slots: [['assault', 3], ['breach', 3], ['bulwark', 4]], guns: ['assault'] },
      { key: 'hellfire', name: 'Hellfire Array', text: 'Burning shells that leave the road aflame.', slots: [['blast', 4], ['breach', 4], ['vigor', 4]], guns: ['blast'] },
      { key: 'spire', name: 'Storm Spire', text: 'A crackling mast that strikes fast and far.', slots: [['swift', 4], ['swift', 5], ['firepower', 5]], guns: ['swift'] },
      { key: 'titan', name: 'Titan Bulwark', text: 'A wall of iron fists.', slots: [['assault', 4], ['assault', 5], ['bulwark', 5]], guns: ['assault'] },
      { key: 'citadel', name: 'Nexus Citadel', text: 'A fortress that does a little of everything.', slots: [['breach', 5], ['blast', 5], ['command', 5], ['vigor', 5]], guns: ['breach', 'blast'] },
    ] as DefaultRecipeDef[],
  },
  /**
   * The flight lane: flyers go straight pad to pad. Building is open along it (only the pads and the spawn corner are
   * barred); a gun within reach of a leg can shoot what flies it. Firepower and Swift Shards (SHARD_TYPES `air`) do
   * more to flyers; a Firepower gun shoots only flyers and a Blast one only walkers (SHARD_TYPES `only`). `width` cells either side of a leg are drawn as the lane.
   */
  flightLane: { width: 1.5 },
  /** Cover: `patches` (a range) of `size`×`size` patches laid out each run, `onRoute` of them centred on cells of the
   * empty map's route. Cover never blocks building or walking; an enemy standing in it is at `hit` to be hit by shooting. */
  cover: { patches: [6, 8] as [number, number], size: 3, onRoute: 0.7, hit: -1 },
  /**
   * Boon cards: when a boss dies, pick one of `offer` drawn, each one's rarity drawn with these odds (Legendary first).
   * Numbers for the cards that need them: base HP a mend card adds, a bounty's share more credits, a hold card's longer
   * holds (×) and longer re-grab (+ seconds), cover patches a sandbag card lays. (`every` is only for the rules text.)
   */
  cards: { every: 5, offer: 3, odds: { Legendary: 0.1, Rare: 0.3 }, walls: 20, ramparts: 40, bounty: 0.25, holdMul: 1.5, regrabAdd: 1, patches: 2 },
  /** Seconds in an ability round: an ability that comes back every 2 rounds comes back every 12 seconds. */
  abilityRound: 6,
  /** Seconds each status lasts once a hit leaves it. */
  status: { stun: 1, slow: 2.5, daze: 3, mark: 4, bleed: 3 },
  /** A slowed enemy moves at this share of its speed. */
  slowMul: 0.5,
  /** A dazed enemy moves at this share of its speed (with a slow too, both apply). */
  dazeMul: 0.75,
  /** A marked enemy takes this much more damage from every hit. */
  markDmg: 1,
  /** A bleeding enemy loses this much a second, credited to whoever made it bleed. */
  bleedDps: 1,
  /** A heal skill is a bleed field instead: `n` × `dmg` over `secs` to every enemy within `radius` cells, every ability round it would heal. */
  bleedField: { dmg: 2, secs: 2, radius: 2 },
  /** A shield skill instead gives a random other tower +n × `perN` damage for one ability round. */
  shieldBoost: { perN: 0.1 },
  /** A knock pushes an enemy this many cells back up its route. */
  knock: 4,
  /** An execute finishes off an enemy (not the boss) below this share of its wounds. */
  executeAt: 0.25,
  /** A field's slow or daze lingers this many seconds after an enemy leaves it. */
  fieldLinger: 0.5,
  /**
   * Sortie quirks and trinkets count here too (habits.ts): each point of initiative attacks `rate` faster; Jumpy attacks
   * at `jumpyMul` for the first `jumpySecs` of a wave; Short-sighted is -1 to hit past `myopicFrom` of a gun's reach.
   * Morale becomes hold time: Steady holds `steady` longer, Shaky `shaky`; wounds become Tough: Hardy `hardy`, Frail
   * `frail` (never below 1). A region quirk is about cover: `native` times the cover penalty on its shots (none),
   * `haunted` times (twice). A trinket's Defense holds `def` longer a point, its morale `morale` a point, its stress
   * `stress` longer for each share of stress it takes off (shorter for each it adds), and its wounds are Tough at `hp`
   * a wound, rounded away from nothing.
   */
  habits: {
    rate: 0.1, jumpySecs: 5, jumpyMul: 0.6, myopicFrom: 2 / 3,
    steady: 0.1, shaky: -0.1, hardy: 1, frail: -1, native: 0, haunted: 2,
    trinket: { def: 0.15, morale: 0.05, stress: 0.2, hp: 0.5 },
  },
  /**
   * Shards. Each build phase `draw` are drawn, each of a random type and grade, the grade by the odds for the luck level
   * (bought with credits, `luckCost` each step). A grade's value is 2^(grade-1): a merge of two alike keeps the value
   * it took. A Shard's to-hit Quality by grade. Recipes: a unit costing `upTo` points or less needs `count` Shards, each
   * of grade `grades[0]`–`grades[1]`.
   */
  shards: {
    draw: 5,
    grades: ['Cracked', 'Chipped', 'Flawed', 'Flawless', 'Pristine'],
    odds: [
      [1, 0, 0, 0, 0],
      [0.85, 0.15, 0, 0, 0],
      [0.7, 0.3, 0, 0, 0],
      [0.6, 0.33, 0.07, 0, 0],
      [0.5, 0.35, 0.15, 0, 0],
      [0.42, 0.35, 0.18, 0.05, 0],
      [0.35, 0.35, 0.2, 0.1, 0],
      [0.3, 0.32, 0.23, 0.13, 0.02],
      [0.25, 0.3, 0.25, 0.15, 0.05],
      [0.2, 0.28, 0.27, 0.17, 0.08],
      [0.15, 0.25, 0.3, 0.2, 0.1],
    ],
    luckCost: [15, 20, 30, 40, 45, 55, 70, 90, 110, 130],
    quality: [5, 4, 4, 3, 3],
    recipes: [
      { upTo: 99, count: 2, grades: [1, 2] as [number, number] },
      { upTo: 249, count: 3, grades: [2, 3] as [number, number] },
      { upTo: Infinity, count: 4, grades: [3, 4] as [number, number] },
    ],
    /**
     * Picking a recipe: the dearer a unit within its tier, the more of its slots at the tier's higher grade (the top
     * tier counts `topSpan` points as its width). A type's second slot fits `repeat` as well as its first (the third
     * `repeat`² …); each slot more or fewer at the higher grade than its points call for costs `grade`, and a grade
     * outside the tier (only when every in-tier recipe is taken) `offTier` a step.
     */
    recipeFit: { topSpan: 250, repeat: 0.5, grade: 0.15, offTier: 2 },
  },
  /**
   * Living recipes (veterans.ts): a unit's crusade record reworks its recipe. Every `traitsPerLift` traits (net of
   * scars) are +1 grade on the lowest slot short of Pristine (of the first one's own Shard type when several are lowest:
   * `traitTypes`, else what its effect is: see veterans.ts), so a veteran asks for a commoner Shard, not a rarer one; with every slot Pristine a lift adds a slot (up to `maxSlots`). Each scar is −1 grade on the dearest slot, never below
   * Cracked. Traits and scars net out, at most `cap` grades either way. `notScars` don't count. What a trait or scar does
   * in a fight that never reaches a tower (towers are never attacked) comes in as `grit`: `hold` a share longer holds,
   * `tough` more Tough (holds, and grabs at all), `atk` a share more damage. Traits that move a unit mid-game (redeploy)
   * give `redeployInit` initiative a use; ones that bring it back from the dead (revive) `reviveHold` longer holds. A
   * weapon's +6" range trait adds `rangeTrait` cells. A veteran hits harder: each net trait (up to `cap`) is `liftDmg`
   * more damage, each grade a scar cracks `crackDmg` less. Grades are lifted softly (`traitsPerLift`) since recipes need
   * exact grades and the high ones are rare at the luck a run has.
   */
  veterans: {
    cap: 3,
    traitsPerLift: 2,
    maxSlots: 5,
    notScars: ['Comatose'],
    traitTypes: {
      'Tough +3': 'bulwark', 'Toughened Scars': 'bulwark', Resilient: 'bulwark', Fortified: 'bulwark', Enhanced: 'bulwark',
      'Dug In': 'bulwark', Protected: 'bulwark', 'Armoured Prow': 'bulwark', Ghostly: 'bulwark', 'Heroic Presence': 'bulwark',
      Regeneration: 'vigor',
      'Blade Master': 'assault', Berserkers: 'assault', 'Impact +3': 'assault', 'Impact +6': 'assault', Momentum: 'assault',
      'Point Blank': 'firepower', 'Targeting Array': 'firepower', '+6" range': 'firepower', 'Spread Shot': 'blast',
      Surge: 'firepower', Specialists: 'firepower', Elite: 'firepower', '+1 A': 'firepower',
      'Precise Strikes': 'breach', Mutations: 'breach', '+1 AP': 'breach', Rending: 'breach', Unstoppable: 'breach', Brutal: 'breach',
      Fast: 'swift', Swift: 'swift', Stealth: 'swift', Evasive: 'swift', 'Flying + Fast': 'swift',
      'Caster +1': 'command',
    } as Record<string, ShardType>,
    grit: {
      Resilient: { hold: 0.15 }, Fortified: { hold: 0.1 }, Protected: { hold: 0.1 }, Ghostly: { hold: 0.1 },
      'Heroic Presence': { hold: 0.1 }, Evasive: { hold: 0.1 }, Regeneration: { hold: 0.15 }, 'Dug In': { hold: 0.05 },
      'Armoured Prow': { hold: 0.05 }, Stealth: { hold: 0.05 }, 'Tough +3': { tough: 3 }, 'Toughened Scars': { tough: 3 },
      Enhanced: { tough: 3, hold: 0.1 }, 'Impact +3': { atk: 0.05 }, 'Impact +6': { atk: 0.1 }, Momentum: { atk: 0.05 },
      'Weakened Armor': { hold: -0.15 }, 'Weak Spot': { hold: -0.1 }, 'Lowered Constitution': { hold: -0.15 },
    } as Record<string, { hold?: number; tough?: number; atk?: number }>,
    redeployInit: 0.5,
    reviveHold: 0.2,
    /** Holds never drop below this share, however the record cuts them. */
    minHold: 0.25,
    liftDmg: 0.4,
    crackDmg: 0.18,
    rangeTrait: 6,
  },
  /**
   * Relic sockets (relics.ts): every relic on a crafted unit goes off by itself during waves, every `cd[tier]` seconds ×
   * `actMul` for what it does, the first time at `first` of that into the wave. A weapon relic keeps its gun and fires a
   * special shot: `shot.attacks` attacks at once. A relic with a mapped effect uses it; any other does what its kind
   * does: wargear a damage pulse (`pulse.share[tier]` of each enemy's wounds within `pulse.radius` cells, a boss
   * `pulse.bossShare` of that; the Weekly Siege's colossus counts as `pulse.siegeBase` wounds, about a 750 pt force's
   * wave-25 Final boss), armour a longer next hold (`brace.mul` ×; a unit that can't hold deals `brace.ward` more
   * for `brace.secs`), an artefact marks the enemies in its reach (+markDmg a hit), a banner or icon makes towers within
   * `rally.radius` attack `rally.mul` faster for `rally.secs`. A mapped hit status lands on up to `status.max` enemies in
   * reach; a mapped field holds its status on what is in it for `field.secs`; a mapped heal bleeds (as bleedField) with
   * `bleed.mul` × its wounds. A relic named in `named` does that act instead: a sunder (the Crown of the Last Lord)
   * picks one enemy in reach, a boss first, else the furthest along, and every hit on it has AP(+`sunder.ap`) for
   * `sunder.secs`.
   */
  relics: {
    cd: { Common: 20, Rare: 12, Legendary: 6 } as Record<string, number>,
    first: 0.25,
    actMul: { shot: 1, pulse: 1, brace: 0.75, mark: 0.75, rally: 1, barrage: 1, shield: 0.75, frenzy: 1.25, field: 1, bleed: 0.75, status: 0.75, sunder: 1 } as Record<string, number>,
    named: { 'Crown of the Last Lord': 'sunder' } as Record<string, string>,
    sunder: { ap: 1, secs: 6 },
    shot: { attacks: 4 },
    pulse: { radius: 4, share: { Common: 0.35, Rare: 0.45, Legendary: 0.55 } as Record<string, number>, bossShare: 0.25, siegeBase: 1100 },
    brace: { mul: 1.5, ward: 0.3, secs: 4 },
    rally: { radius: 4, mul: 0.5, secs: 5 },
    status: { max: 6 },
    field: { secs: 3 },
    bleed: { mul: 2 },
  },
  /**
   * The Sortie layer shared with Training (quirks.ts, bestiary.ts, trinkets.ts, nemesis.ts). Quirks: a run reaching
   * wave `goodFrom` gives its MVP a good quirk `good` of the time, picked by what it did most (`goods`: shots, blows or
   * holds, a hold counting as `holdDmg` damage; the first it hasn't got); a crafted unit a boss walked past in its
   * reach without taking a hit from it picks up a bad one (`bads`, the same way) `bad` of the time. Bestiary: each
   * Training kind counts as this Echo of the Sortie bestiary. Trinkets: a boss kill offers a trinket as a 4th card
   * (of `trinkets.rarity`) `trinkets.odds` of the time, until one is offered (one a run). Nemesis: see `nemesis`.
   */
  shared: {
    quirks: {
      goodFrom: 10, good: 0.3, bad: 0.2, holdDmg: 8,
      goods: { shot: ['eagle', 'quick', 'steady'], melee: ['brute', 'quick', 'hardy'], holds: ['hardy', 'steady', 'quick'] },
      bads: { shot: ['myopic', 'jumpy', 'shaky'], melee: ['clumsy', 'jumpy', 'frail'], holds: ['frail', 'shaky', 'jumpy'] },
    } as { goodFrom: number; good: number; bad: number; holdDmg: number; goods: Record<'shot' | 'melee' | 'holds', string[]>; bads: Record<'shot' | 'melee' | 'holds', string[]> },
    beasts: {
      swarm: 'Fang Swarms', drone: 'Scourges', spitter: 'Spectres', outrider: 'Shadow Hounds', carapace: 'Reapers',
      mirror: 'Phantoms', stalker: 'Fiends', brute: 'Butchers', lord: 'Terror Beast',
    } as Record<TrainingEnemyKind, string>,
    trinkets: { odds: 0.35, rarity: 'Rare' as 'Common' | 'Rare' | 'Legendary' },
    /**
     * A force's Sortie nemesis (the lord with the biggest grudge) is the boss of wave `wave`: `hp` more wounds per grudge
     * level, and its tricks. Rage: walks `rage.per` faster a second it lives, up to `rage.max`. Dive: every `dive.every`
     * seconds it leaps `dive.cells` cells on (out of any hold). Dirge: for `dirge.secs` of every `dirge.every` towers
     * within `dirge.radius` cells are at -1 to hit. Tremor: every `tremor.every` seconds the base takes `tremor.dmg`.
     * Dread: nothing can hold it. Brood: every `brood.every` seconds `brood.n` Swarmlings, `brood.hp` × as tough as the
     * wave's own, crawl out where it stands (`brood.spread` cells apart). Rematch tricks (one per time the force has slain it on a Sortie): Hardened +1 to
     * its saves, Vengeful `vengeful` × as fast, Regenerating mends `regen` of its wounds every `regenEvery` seconds.
     * Slain here, it starts the next Sortie fight against the force `bled` of its wounds down, a trick short.
     */
    nemesis: {
      wave: 25, hp: 0.2,
      rage: { per: 0.02, max: 0.6 },
      dive: { every: 8, cells: 5 },
      dirge: { every: 8, secs: 4, radius: 6 },
      tremor: { every: 6, dmg: 4 },
      brood: { every: 6, n: 8, hp: 1.5, spread: 0.3 },
      vengeful: 1.25, regen: 0.05, regenEvery: 2,
      bled: 0.15,
    },
  },
  /**
   * The Nexus in Training (F3, training/nexus.ts, affixes.ts, lords.ts), for a force in a campaign; outside one threat
   * is 0, there is no event and every boss is the generic lord. Threat is Campaign.threat (Rising Dark adds 1), up to
   * `threatMax`; earned credits are 1 + `credit` × threat times as many. A run takes one affix (Sortie's affixes and
   * pact marks, remapped) per `affixes.per` threat levels, rounded up, at most `affixes.max`, the same for every force
   * that round. Each affix scales with threat (the `per` numbers are per threat level):
   * - armoured: `share` of each wave's Echoes (at most `max`) save at +1.
   * - swift: Echoes walk `per` faster. - frenzied: `per` more wounds. - fierce: `per` bigger waves.
   * - regenerating: every Echo but a lord mends `per` of its wounds a second.
   * - vengeful: an Echo slain makes those within `radius` cells walk `mul` × as fast for `secs` × threat seconds.
   * - shrouded: shots at an Echo more than `from` − `per` × threat of the gun's reach away (at least `min`) are at -1.
   * - proud: `per` of the plain Echoes from wave 1 come as elites too. - bleed: the base starts `per` lower.
   * Events (`events`, by GALACTIC_EVENTS id) that map to the maze; any other is flavour on the start screen and HUD.
   * Lords: up to `lords.max` of the campaign's own (Echo-held guardians by tier, then the Nexus Crisis lord last)
   * take the boss waves from `lords.from` on, in tier order, skipping the nemesis's wave; their wounds × `lords.hp` by
   * tier (the crisis lord counts as Legendary). Each has one trick (`tricks`, by ECHO_LORDS id; a guardian's from its
   * rules, else by its name from `tricks.plain`); see lords.ts trickText for what each number means.
   */
  nexus: {
    threatMax: 7, credit: 0.1,
    affixes: { per: 2, max: 3 },
    armoured: { share: 0.1, max: 0.6 },
    swift: { per: 0.03 },
    frenzied: { per: 0.04 },
    fierce: { per: 0.03 },
    regenerating: { per: 0.003 },
    vengeful: { radius: 3, mul: 1.4, secs: 0.4 },
    shrouded: { from: 0.8, per: 0.05, min: 0.4 },
    proud: { per: 0.04 },
    bleed: { per: 8 },
    events: {
      warpCurrents: { walk: 1.1 },
      ionStorm: { from: 9 },
      shardRush: { luck: 1 },
      convoys: { credits: 25 },
      echoSurge: { budget: 1.1 },
      voidLull: { budget: 0.9 },
      risingDark: { threat: 1 },
      derelicts: { cover: 2 },
      glory: { xp: 1 },
    },
    lords: {
      max: 5, from: 5,
      hp: { Common: 1, Rare: 1.25, Legendary: 1.5 } as Record<'Common' | 'Rare' | 'Legendary', number>,
    },
    tricks: {
      teleport: { every: 7, cells: 4 },
      shield: { share: 0.25, every: 10 },
      summon: { every: 6, n: 8, hp: 1.5, spread: 0.3 },
      burst: { every: 8, secs: 2, mul: 2 },
      regen: { every: 2, share: 0.03 },
      fear: { radius: 5 },
      storm: { every: 8, secs: 2, radius: 6 },
      armour: { from: 12, mul: 0.5 },
      stealth: {},
      byLord: {
        devourer: 'regen', hollowKing: 'fear', stormHerald: 'storm', broodmother: 'summon', umbralTitan: 'armour',
        whisperer: 'teleport', shardEater: 'burst', nexusWarden: 'shield', mirrorWraith: 'stealth', rift: 'summon',
      } as Record<string, string>,
      /** A guardian's trick from the first of its rules found here, else one of `plain` by its name. */
      byRule: [
        ['Regeneration', 'regen'], ['Fear', 'fear'], ['Caster', 'storm'], ['Stealth', 'stealth'], ['Ambush', 'teleport'],
        ['Scout', 'teleport'], ['Fast', 'burst'], ['Flying', 'burst'], ['Shielded', 'shield'],
      ] as [string, string][],
      plain: ['teleport', 'shield', 'summon', 'burst'],
    },
  },
  /**
   * Unit titles (F4, training/titles.ts), ONE list shared by Training and Sorties: a unit keeps every title it earns and
   * shows the one its player picks (the latest, until then). Each title's `n` is its threshold (see titles.ts for what
   * it counts). Sortie: `roadWorn` / `ashWalker` / `hollowSworn` runs come home standing; `curseborn` a win at this
   * Ascension or higher; `pyreWalker` a lord slain under this pact heat. Training: `echoReaper` kills and `unmoved`
   * holds in one run; `wallWarden` waves cleared in a run; `gatekeeper` the first waves cleared with nothing getting through;
   * `unbowed` the MVP of a run of `n` waves with `scars` or more scars; `drillmaster` MVPs, `legionBane` kills and
   * `mazeHardened` runs over its Training record. Both: `lordbane` Echo lords slain on Sorties and in Training
   * together; `twiceTested` Sorties come home from and Training runs, each.
   */
  titles: {
    roadWorn: { name: 'Road-worn', n: 3 },
    ashWalker: { name: 'Ash-walker', n: 6 },
    hollowSworn: { name: 'Hollow-sworn', n: 10 },
    lordbane: { name: 'Lordbane', n: 3 },
    grudgebreaker: { name: 'Grudgebreaker', n: 1 },
    deepstrider: { name: 'Deepstrider', n: 1 },
    lastStanding: { name: 'Last One Standing', n: 1 },
    peakwalker: { name: 'Peakwalker', n: 1 },
    curseborn: { name: 'Curse-born', n: 4 },
    pyreWalker: { name: 'Pyre-walker', n: 6 },
    echoReaper: { name: 'Echo-reaper', n: 1200 },
    unmoved: { name: 'the Unmoved', n: 150 },
    lordslayer: { name: 'Lordslayer', n: 1 },
    wallWarden: { name: 'Wall-warden', n: 30 },
    gatekeeper: { name: 'Gatekeeper', n: 15 },
    unbowed: { name: 'Unbowed', n: 20, scars: 2 },
    drillmaster: { name: 'Drillmaster', n: 5 },
    legionBane: { name: 'Legion-bane', n: 10000 },
    mazeHardened: { name: 'Maze-hardened', n: 15 },
    twiceTested: { name: 'Twice-tested', n: 5 },
  },
  /**
   * Training records and tales (F4, training/records.ts, tales.ts): a run tells at most `tales` stories (a new best,
   * a real lord slain, the nemesis slain, a title earned; one each), and the force keeps its last `keep`.
   */
  records: { tales: 3, keep: 30 },
  /**
   * Drill Honours (F5, training/drill.ts): a force's season-long unlock track. A new force buys luck up to
   * `luckAtStart` and draws boss cards only from `cardsAtStart`; each goal reached (in any order)
   * unlocks a luck level, a card group, or a level of a small run perk. Perks, a level each: `purse` more starting
   * credits, `mend` more HP a base mend, `reroll` card offers re-drawn a run, `thrift` off the price of luck (a share),
   * `offer` more cards on offer (a draft is always TRAINING.shards.draw: no perk changes it); thrift never takes more than `thriftMax` off. Goals count
   * over every run (drill.ts goalText).
   */
  drill: {
    luckAtStart: 5,
    cardsAtStart: ['aim', 'whet', 'grip', 'walls', 'supply', 'rapid', 'promote', 'ramparts', 'heroes'],
    groups: {
      fieldcraft: { name: 'Fieldcraft cards', cards: ['sandbags', 'spotter', 'bounty'] },
      hold: { name: 'Hold-fast cards', cards: ['nets', 'thirst', 'chains', 'line'] },
      support: { name: 'Support cards', cards: ['medic', 'drill', 'banner'] },
      fury: { name: 'Fury cards', cards: ['trance', 'uplink'] },
    } as Record<string, { name: string; cards: string[] }>,
    perks: { purse: 10, mend: 8, reroll: 1, thrift: 0.1, offer: 1 },
    thriftMax: 0.9,
    goals: [
      { goal: 'runs', n: 1, unlock: { cards: 'fieldcraft' } },
      { goal: 'best', n: 5, unlock: { perk: 'purse' } },
      { goal: 'kills', n: 1000, unlock: { cards: 'hold' } },
      { goal: 'bosses', n: 3, unlock: { luck: 6 } },
      { goal: 'runs', n: 4, unlock: { perk: 'reroll' } },
      { goal: 'best', n: 10, unlock: { perk: 'mend' } },
      { goal: 'clean', n: 5, unlock: { cards: 'support' } },
      { goal: 'lords', n: 1, unlock: { perk: 'purse' } },
      { goal: 'kills', n: 4000, unlock: { perk: 'thrift' } },
      { goal: 'best', n: 15, unlock: { luck: 7 } },
      { goal: 'crafted', n: 6, unlock: { cards: 'fury' } },
      { goal: 'bosses', n: 12, unlock: { perk: 'mend' } },
      { goal: 'best', n: 20, unlock: { luck: 8 } },
      { goal: 'titles', n: 2, unlock: { perk: 'reroll' } },
      { goal: 'runs', n: 10, unlock: { perk: 'purse' } },
      { goal: 'sieges', n: 3, unlock: { perk: 'thrift' } },
      { goal: 'lore', n: 6, unlock: { perk: 'offer' } },
      { goal: 'clean', n: 12, unlock: { perk: 'mend' } },
      { goal: 'kills', n: 16000, unlock: { perk: 'purse' } },
      { goal: 'lords', n: 4, unlock: { perk: 'thrift' } },
      { goal: 'bosses', n: 25, unlock: { luck: 9 } },
      { goal: 'final', n: 25, unlock: { perk: 'offer' } },
      { goal: 'final', n: 30, unlock: { luck: 10 } },
      { goal: 'final', n: 35, unlock: { perk: 'purse' } },
      { goal: 'final', n: 50, unlock: { perk: 'reroll' } },
    ] as { goal: DrillGoal; n: number; unlock: DrillUnlock }[],
  },
  /**
   * The Weekly Siege (F5, training/siege.ts, siegeBoard.ts): one seed a week (the Sortie weekly's), the same cover,
   * drafts and waves for every force (waves still scaled by its points), every luck level and card open, no perks,
   * nemesis or Nexus. Score: the wave reached. A campaign's board keeps each force's best for the last `weeks` weeks;
   * the week's top score wins its faction one Strategic Asset (within NEXUS_ROUNDS.assetsMax) in the round it is
   * settled, and the last `keep` winners are kept.
   */
  siege: { weeks: 4, keep: 12 },
  /**
   * Final waves (training/finale.ts, veterancy.ts). A run has a Final wave: `from` at first, `step` more for each step
   * the force has opened, up to `to`; the run always uses the highest one open. Step N + step opens once the force has
   * won the Final at N and its veterancy (every XP its units have ever earned; it never drops) reaches `bars[N + step]`.
   * Killing the Final boss with the base standing is a Victory: bank it, or go on into Endless.
   * The bars are paced to a full campaign. A round (a week outside one) a unit takes about 3 XP from a table game
   * (participation 2, an agenda or Marked for Greatness now and then; 0-2 games a week, so about one) and most of its
   * off-table 5 (OFF_TABLE_XP.perRound: Training and Sorties), so about 7-8 XP; a force of about 8 units banks some 60
   * a round. A season of about 12 rounds is some 700: `to` opens near its end, a step every two rounds or so.
   * Past wave `from` every wave is planned at that wave's level (budget, wounds) and `climb` times tougher a wave up to
   * the Final; past the Final (Endless) `endless` a wave, `rise` more for every `riseEvery` waves gone, never more than
   * `endlessMax` a wave (so no wave is a cliff); its Echo Lords `endlessBoss` and its flyers `endlessFly` tougher a wave past the Final (on
   * top of the climb: neither is an escort the cliff check weighs). Going into Endless keeps at most `endlessCarry` of
   * the run's credits (a purse saved up is no road to wave 40), and Endless kills and waves pay `endlessCredits` as much. From `from` on a
   * boss wave's escorts take `escorts` of its budget (the boss keeps its old share), so a boss wave weighs about as
   * much as the waves round it and the one after is no cliff. The Final boss: the nemesis at `from`, the Nexus Crisis
   * lord at `to` (in a campaign), else `lords[N]` (ECHO_LORDS ids, its trick by TRAINING.nexus.tricks.byLord), with
   * `bossHp[N]` times the wounds a boss of its wave has; a ward or mending that goes by its wounds (Shield, Regeneration) is
   * `trick` as much, or the Crisis lord would be a wall. A Weekly Siege's Final is `from`: a lone Echo Lord of
   * `siegeHp` wounds and no escorts, the attempt over when it reaches the base; its score is the damage dealt to it.
   */
  finale: {
    from: 25,
    step: 5,
    to: 50,
    bars: { 30: 120, 35: 250, 40: 400, 45: 550, 50: 700 } as Record<number, number>,
    climb: 1.06,
    endless: 1.2,
    rise: 0.03,
    riseEvery: 2,
    endlessMax: 1.23,
    endlessBoss: 1.3,
    endlessFly: 1.25,
    endlessCarry: 60,
    endlessCredits: 0.5,
    escorts: 0.85,
    lords: { 25: 'whisperer', 30: 'hollowKing', 35: 'stormHerald', 40: 'umbralTitan', 45: 'mirrorWraith', 50: 'shardEater' } as Record<number, string>,
    bossHp: { 25: 0.5, 30: 0.8, 35: 1.4, 40: 4, 45: 3, 50: 3 } as Record<number, number>,
    trick: 0.3,
    siegeHp: 9_999_999,
  },
  /** A force's power (squadPower, which Sorties scale by too): its points, with each veteran level adding this share. */
  levelPower: 0.05,
  /** Legacy: only the old rules text and force page read these, until their rework. Nothing in the run uses them. */
  squadMax: 5,
  toughMul: 1,
  meleeDmgPerLevel: 2,
  heal: { share: 0, cost: 0 },
};

/** What a Drill Honour counts (training/drill.ts drillProgress). */
export type DrillGoal = 'runs' | 'best' | 'kills' | 'bosses' | 'lords' | 'clean' | 'crafted' | 'titles' | 'lore' | 'sieges' | 'final';
/** A small run option a Drill Honour unlocks a level of (TRAINING.drill.perks). */
export type DrillPerk = 'purse' | 'mend' | 'reroll' | 'thrift' | 'offer';
/** What a Drill Honour unlocks: a luck level, a card group (TRAINING.drill.groups) or a perk level. */
export type DrillUnlock = { luck: number } | { cards: string } | { perk: DrillPerk };

/** A default tower's recipe (TRAINING.defaults): Shards of exactly these types and grades. */
export interface DefaultRecipeDef {
  key: string;
  name: string;
  text: string;
  slots: [ShardType, number][];
  /** The slot types that carry its weapon (one, but for a theme that needs two), each at its slot's grade; every
   *  slot's rule (daze, slow, aura, bleed) still counts. */
  guns: ShardType[];
}

export type ShardType = 'assault' | 'firepower' | 'breach' | 'blast' | 'bulwark' | 'swift' | 'command' | 'vigor';

/**
 * Shard types. A kept Shard is a weak tower: its weapon (attacks per point of value, range in inches = cells) and its
 * own rule, which grows with grade. The rule numbers: `daze`/`slow`, the chance a hit leaves it; `aura`, cells of +1 to
 * hit round it at grade 1 and `perGrade` more each grade; `bleed`, a bleed field's damage per point of value each
 * ability round (2 cells round it).
 */
export const SHARD_TYPES: Record<ShardType, {
  name: string;
  color: string;
  text: string;
  gun: { melee?: boolean; range: number; attacks: number; ap: number; blast?: number };
  daze?: number;
  slow?: number;
  aura?: { radius: number; perGrade: number };
  bleed?: number;
  /** Damage against flyers, as a multiple (anti-air). */
  air?: number;
  /** Its gun attacks only flyers ('air') or only walkers ('land'). */
  only?: 'air' | 'land';
}> = {
  assault: { name: 'Assault', color: '#d0603a', text: 'Strikes hard in melee.', gun: { melee: true, range: 0, attacks: 2, ap: 1 } },
  firepower: { name: 'Firepower', color: '#e0b040', text: 'Shoots a long way, but only at flyers.', gun: { range: 24, attacks: 1, ap: 0 }, air: 1.5, only: 'air' },
  breach: { name: 'Breach', color: '#c04a8a', text: 'Few shots, but they punch through armour.', gun: { range: 18, attacks: 0.5, ap: 2 } },
  blast: { name: 'Blast', color: '#ff9a4a', text: 'Each hit spills onto the enemies round it; it can’t hit flyers.', gun: { range: 12, attacks: 0.5, ap: 0, blast: 3 }, only: 'land' },
  bulwark: { name: 'Bulwark', color: '#8d8778', text: 'Its blows leave enemies dazed (slower).', gun: { melee: true, range: 0, attacks: 1, ap: 0 }, daze: 0.4 },
  swift: { name: 'Swift', color: '#5fb3d0', text: 'Quick, short-ranged shots that slow what they hit; good against flyers.', gun: { range: 9, attacks: 1.5, ap: 0 }, slow: 0.25, air: 1.5 },
  command: { name: 'Command', color: '#c9a24a', text: 'Towers round it get +1 to hit.', gun: { range: 12, attacks: 0.5, ap: 0 }, aura: { radius: 4, perGrade: 1 } },
  vigor: { name: 'Vigor', color: '#6fdc6f', text: 'Enemies near it bleed.', gun: { range: 12, attacks: 0.5, ap: 0 }, bleed: 0.5 },
};

export type TrainingEnemyKind = 'swarm' | 'drone' | 'carapace' | 'mirror' | 'spitter' | 'outrider' | 'stalker' | 'brute' | 'lord';

/** An Echo in a Training wave. Enemies never attack: they only walk, and leak into the base. */
export interface TrainingEnemyDef {
  name: string;
  desc: string;
  hp: number;
  /** Speed: × walkMul cells a second. */
  speed: number;
  /** Its Defense: a hit is saved on this, plus the weapon's AP. */
  defense: number;
  /** Taken off the damage of every hit (a 6 to hit from a Rending weapon ignores it). */
  armor: number;
  /** Damage it takes from shooting and from melee, as multiples. */
  shotMul?: number;
  meleeMul?: number;
  /** Its share of the wave's budget; a kill pays credits by it. */
  cost: number;
  /** Base HP it costs if it reaches the base. */
  leak: number;
  /** A Vehicle/Monster-sized body: held half as long. */
  big?: boolean;
  /** The first wave it can turn up in. */
  from: number;
  /** Scout: comes in on a pad part-way along the route as the wave starts. Ambush: jumps ahead from one pad to a later one. */
  spawn: 'main' | 'scout' | 'ambush' | 'boss';
  color: string;
  /** Drawn radius, in cells. */
  size: number;
  shape: TrainingEnemyShape;
}

/** dart: a fast runner. diamond: line infantry. pentagon: a spitter. chevron: a scout. hexagon: armoured. shield: shrugs
 *  off shots. star: an ambusher. spikes: a heavy brute. crown: the boss. */
export type TrainingEnemyShape = 'dart' | 'diamond' | 'pentagon' | 'chevron' | 'hexagon' | 'shield' | 'star' | 'spikes' | 'crown';

export const TRAINING_ENEMIES: Record<TrainingEnemyKind, TrainingEnemyDef> = {
  swarm: { name: 'Swarmling', desc: 'Fast and frail, in numbers.', hp: 3, speed: 1.6, defense: 6, armor: 0, cost: 1, leak: 1, from: 1, spawn: 'main', color: '#c9b458', size: 0.4, shape: 'dart' },
  drone: { name: 'Echo Drone', desc: 'The line infantry of the Echoes.', hp: 6, speed: 1.1, defense: 5, armor: 0, cost: 2, leak: 1, from: 1, spawn: 'main', color: '#8fa7c4', size: 0.5, shape: 'diamond' },
  spitter: { name: 'Spitter', desc: 'Soft, but slick: Defense 4.', hp: 5, speed: 0.9, defense: 4, armor: 0, cost: 3, leak: 1, from: 2, spawn: 'main', color: '#7fbf6a', size: 0.45, shape: 'pentagon' },
  outrider: { name: 'Outrider', desc: `Scout: races in on pad ${TRAINING.route.scoutAt} as the wave starts.`, hp: 5, speed: 2, defense: 5, armor: 0, cost: 3, leak: 1, from: 2, spawn: 'scout', color: '#e0a040', size: 0.45, shape: 'chevron' },
  carapace: { name: 'Carapace', desc: 'Armour 1: each hit does 1 less damage. Bring AP.', hp: 10, speed: 0.8, defense: 4, armor: 1, cost: 4, leak: 2, from: 3, spawn: 'main', color: '#6c7a89', size: 0.55, shape: 'hexagon' },
  mirror: { name: 'Mirrorshell', desc: 'Mirrored hide: shots do 40% damage, melee 150%. Meet it with blades.', hp: 10, speed: 0.85, defense: 4, armor: 0, shotMul: 0.4, meleeMul: 1.5, cost: 5, leak: 2, from: 4, spawn: 'main', color: '#a8dce8', size: 0.6, shape: 'shield' },
  stalker: { name: 'Stalker', desc: `Ambush: on pad ${TRAINING.route.ambushFrom} it vanishes, and comes out on pad ${TRAINING.route.ambushAt}.`, hp: 7, speed: 1.3, defense: 5, armor: 0, cost: 4, leak: 1, from: 3, spawn: 'ambush', color: '#b05cc8', size: 0.5, shape: 'star' },
  brute: { name: 'Brute', desc: 'Slow and huge: held half as long.', hp: 22, speed: 0.6, defense: 4, armor: 0, cost: 6, leak: 2, big: true, from: 4, spawn: 'main', color: '#c0583e', size: 0.7, shape: 'spikes' },
  lord: { name: 'Echo Lord', desc: `Every ${TRAINING.wave.bossEvery}th wave. Held half as long; costs the base up to 16 if it gets there (less the more it is hurt). Kill it for a card.`, hp: 30, speed: 0.5, defense: 4, armor: 0, cost: 20, leak: 16, big: true, from: 1, spawn: 'boss', color: '#e04a6a', size: 0.9, shape: 'crown' },
};

/** One line each on what an enemy kind does, for the HUD's next-round icon (components/training/NextRound.tsx). */
export const TRAINING_ENEMY_BLURBS: Record<TrainingEnemyKind, string> = {
  swarm: 'Swarm: fast and frail, in big numbers.',
  drone: 'Line infantry: no special ability.',
  spitter: 'Slick: only Defense 4+, easy to wound.',
  outrider: `Scout: races in at pad ${TRAINING.route.scoutAt} as the wave starts.`,
  carapace: 'Carapace armour 1: each hit does 1 less damage. Bring AP.',
  mirror: 'Mirrored hide: shots do 40%, melee 150%.',
  stalker: `Ambusher: vanishes at pad ${TRAINING.route.ambushFrom} and teleports to pad ${TRAINING.route.ambushAt}.`,
  brute: 'Huge and slow: held half as long.',
  lord: 'Echo Lord: held half as long, costs the base up to 16; kill it for a card.',
};

/** One line each on a wave's marks, for the next-round icon. */
export const TRAINING_WAVE_BLURBS = {
  flies: 'Flyers: skip the maze, pad to pad. Never held.',
  elite: `Elites (gold rim): ×${TRAINING.wave.eliteHp} wounds, cost the base more.`,
  final: 'The Final wave: slay its boss with the base standing for a Victory; if it gets through the run ends.',
  siege: 'The Siege Final: a lone colossus that cannot fall. Hurt it all you can.',
  endless: 'Endless: every wave climbs steeper.',
};

/**
 * Sortie: a Darkest Dungeon-like run between games. A party of three units sets out across a branching map of fights
 * with the Void Echoes, camps, shrines and caches. Fights are turn based: the party stands in a line of front, middle
 * and back (a Fortification always at the back) that turns every round, the Echo squads stand at Close, Mid or Far
 * range (several can share one), and every model on both sides acts on its own initiative. A free run earns XP only; a
 * Shard run costs Umbra Shards and all three units' downtime task, earns more XP and brings home a haul, but each
 * unit wiped out takes a scar. The logic is in sortie.ts; the game is components/SortieModal.tsx.
 */
/** Sortie quirks, each with its opposite: picking one up drops the other. The region ones are `native:<region>` and
 * `haunted:<region>` (rules/sortie.ts quirkInfo). */
export const SORTIE_QUIRKS: Record<string, { name: string; text: string; good: boolean; foe: string }> = {
  steady: { name: 'Steady', text: '+1 to morale tests.', good: true, foe: 'shaky' },
  shaky: { name: 'Shaky', text: '-1 to morale tests.', good: false, foe: 'steady' },
  quick: { name: 'Quick', text: '+1 initiative.', good: true, foe: 'jumpy' },
  jumpy: { name: 'Jumpy', text: '-2 initiative in the first round of a fight.', good: false, foe: 'quick' },
  eagle: { name: 'Eagle-eyed', text: '+1 to hit when shooting.', good: true, foe: 'myopic' },
  myopic: { name: 'Short-sighted', text: '-1 to hit when shooting at Far.', good: false, foe: 'eagle' },
  brute: { name: 'Brawler', text: '+1 to hit in melee.', good: true, foe: 'clumsy' },
  clumsy: { name: 'Clumsy', text: '-1 to hit in melee.', good: false, foe: 'brute' },
  hardy: { name: 'Hardy', text: '+2 wounds on each model.', good: true, foe: 'frail' },
  frail: { name: 'Frail', text: '-2 wounds on each model.', good: false, foe: 'hardy' },
};

/** Sortie trinkets: each with a gain and a cost, one to a unit; they count on a Sortie and in Training. `init`, `morale`,
 * `melee`, `shoot` and `def` add to initiative, morale tests, hitting and Defense; `hp` to each model's wounds; `stress`
 * multiplies the stress the unit takes. */
export interface SortieTrinket {
  name: string;
  text: string;
  init?: number;
  morale?: number;
  melee?: number;
  shoot?: number;
  def?: number;
  hp?: number;
  stress?: number;
}

export const SORTIE_TRINKETS: Record<string, SortieTrinket> = {
  spurs: { name: 'Rusted Spurs', text: '+1 initiative, -1 to morale tests.', init: 1, morale: -1 },
  charm: { name: 'Bone Charm', text: '+1 to morale tests, -1 initiative.', morale: 1, init: -1 },
  lens: { name: 'Cracked Lens', text: '+1 to hit when shooting, -1 in melee.', shoot: 1, melee: -1 },
  knuckles: { name: 'Spiked Knuckles', text: '+1 to hit in melee, -1 when shooting.', melee: 1, shoot: -1 },
  plate: { name: 'Salvaged Plate', text: '+1 Defense, -1 initiative.', def: 1, init: -1 },
  flask: { name: 'Calming Flask', text: 'Half the stress, but -1 wound on each model.', stress: 0.5, hp: -1 },
  idol: { name: 'Hungry Idol', text: '+2 wounds on each model, but half again the stress.', hp: 2, stress: 1.5 },
  mask: { name: 'Mourning Mask', text: 'Half the stress, but -1 to hit when shooting.', stress: 0.5, shoot: -1 },
  shroud: { name: 'Echo Shroud', text: '+1 Defense, but half again the stress.', def: 1, stress: 1.5 },
  totem: { name: 'War Totem', text: '+1 to hit in melee and +1 initiative, but -2 wounds on each model.', melee: 1, init: 1, hp: -2 },
};

export const SORTIE = {
  /** Rows of the map before the boss (the last of them all camps); each row holds up to `width` nodes. */
  rows: { short: 5, long: 8 },
  width: 3,
  /** XP earned for each fight won, up to the cap of the run's mode and length. */
  xp: { fight: 0.5, elite: 1, boss: { short: 1, long: 2 } },
  caps: { free: { short: 2, long: 4 }, shard: { short: 4, long: 6 } },
  /** A Shard run's haul for each fight won and cache found. Falling loses it; heading home from a camp keeps it. */
  haul: {
    fight: { supply: 5 },
    elite: { supply: 10, rp: 1, us: 1 },
    boss: { supply: 15, rp: 1, us: 2 },
    cache: { supply: 5 },
    /** The boss of a long run drops one more Umbra Shard this often. */
    longShard: 0.5,
    /** The most Umbra Shards a run can bring home: one more than it cost. */
    maxUs: 4,
  },
  /** Umbra Shards a Shard run costs. */
  cost: 3,
  /** Every model's wounds are its Tough times this. */
  hpMul: 3,
  /** Sortie fights only: every attack (party and Echoes) rolls to hit twice and keeps the better, shown as one roll. */
  hitTwice: true,
  /**
   * Distances: 1 Close, 2 Mid, 3 Far, and each slot back in the party's line adds one. How far a gun reaches by its
   * range: up to 12" one step, up to 24" two, up to 36" three, longer four (so the Back is for the longest guns).
   */
  ranges: [[12, 1], [24, 2], [36, 3], [999, 4]] as [number, number][],
  /** How likely an Echo shot is to pick each slot, Front to Back. */
  aim: [3, 2, 1],
  /** The chance each boon offered is a rare one (an elite always offers one). */
  rareChance: 0.2,
  ranks: 3,
  /** Initiative is a d6 a model, +`fast` for Fast or Flying, −`slow` for Slow (or slowed). */
  fast: 2,
  slow: 2,
  /** Rounds before a skill can be used again. */
  cooldown: { charge: 2, regroup: 2, heal: 2, shield: 2, barrage: 2, field: 3, outflank: 3 } as Record<string, number>,
  /** Charge reaches this far (Jump Packs one more) and brings its target to Close. */
  chargeReach: 2,
  /** Fearless rerolls a failed morale test; a Hero (or Combat Stims) adds this to the roll. */
  heroMorale: 1,
  /**
   * A fight's Echoes cost this many times the unit's power (its points, with each level adding a share), as bent by
   * the size-up, climbing by `ramp` of that from the first row to the last before the boss, whatever the run's length.
   */
  budget: 1,
  /**
   * Sizing the unit up (sortie.ts sizeUp): trial fights per step, halving steps, the range of scales, and the share of
   * its wounds the fresh unit should keep on average (a loss keeps none) in each kind of fight.
   */
  sizeUp: { tries: 30, steps: 6, min: 0.2, max: 5, left: { fight: 0.82, elite: 0.65, boss: 0.4 } as Record<'fight' | 'elite' | 'boss', number> },
  ramp: 0.5,
  /** At most this many Echo squads in a fight. */
  squads: 3,
  /** The Echo lord comes in late, in a round from the first to the second of these, while its escorts hold the field
   * (the round after, if they all fall first); the lord's fight is won only once it falls too. */
  lordArrives: [2, 3] as [number, number],
  /** The share of the lord's fight's budget the lord takes in wounds; its escorts get the rest, enough to hold the
   * field until it comes. */
  lordShare: 0.5,
  /**
   * Camp: rest mends this share of each model's wounds and brings back `raise` of the squad's fallen (at least one).
   * After a fight, patching up mends `patch` and brings one back.
   */
  rest: 0.5,
  raise: 0.3,
  patch: 0.4,
  /** Node kinds by chance, rows 1 on (row 0 is all fights, the last row all camps). Elites only from 40% of the way in.
   * A camp, encounter, cache or shop never leads to another one. */
  odds: { fight: 0.42, elite: 0.15, camp: 0.11, shrine: 0.21, cache: 0.05, shop: 0.06 },
  /** Supply prices at a shop (for a common or rare boon, and a heal of `healShare`), on any run. */
  shop: { boon: 10, rare: 18, heal: 8, healShare: 0.4, boons: 3 },
  /** How a pick of the next encounter weighs a thread's next step, a region's own encounter and a common one. */
  storyWeight: { next: 12, region: 3, common: 1 },
  /** At most this share of the Echo lord's wounds can be taken by story choices before the fight. */
  maxWeaken: 0.5,
  /** An elite's lead-in: one affix each, at random. */
  affixes: {
    armoured: { name: 'Armoured', text: '+1 Defense.' },
    swift: { name: 'Swift', text: 'Fast: +2 initiative and they close in quicker.' },
    regenerating: { name: 'Regenerating', text: 'Every round each Echo mends a share of its wounds.' },
    vengeful: { name: 'Vengeful', text: 'When one of their squads is wiped out, the Front unit takes wounds.' },
    frenzied: { name: 'Frenzied', text: 'A quarter more attacks.' },
    shrouded: { name: 'Shrouded', text: 'Stealth: -1 to hit them from Mid or Far.' },
  },
  /** An Echo lord that wipes out or turns back a party is remembered: it turns up again `odds` of the time, a share
   * tougher per grudge level (up to `max`), and slaying it pays `bounty` RP per level. */
  nemesis: { odds: 0.5, tough: 0.2, max: 3, bounty: 1 },
  /** An Echo lord's own (Legendary) relic comes home with a win that slays it on tier `lordTier` or harder. */
  relics: { lordTier: 3 },
  /** Difficulty tiers, unlocked one at a time by winning a run at the hardest one open. Each adds its twist to those
   * before it, and multiplies the XP (cap included) and the haul by `pay`. */
  tiers: [
    { name: 'Standard', text: 'The Echoes as they come.', pay: 1 },
    { name: 'Tier 1', text: 'Elite Echoes come a fifth bigger.', pay: 1.2 },
    { name: 'Tier 2', text: 'Half the camps along the way are Echo packs instead.', pay: 1.4 },
    { name: 'Tier 3', text: 'The Echo lord has a second signature ability.', pay: 1.6 },
    { name: 'Tier 4', text: 'Every fight is a tenth bigger.', pay: 1.8 },
    { name: 'Tier 5', text: 'Echo packs carry an affix too.', pay: 2 },
  ],
  tierTwist: { elite: 1.2, camps: 0.5, fights: 1.1 },
  /** Quirks a unit picks up on a run: at most `max`; a unit still standing deep enough in (`depth` nodes) may pick up a
   * good one (`good`, `goodWon` if the run was won), a unit wiped out a bad one (`bad`); `region` of them are about the
   * region. */
  quirks: { max: 3, depth: 3, good: 0.25, goodWon: 0.5, bad: 0.5, region: 1 / 3 },
  /** A region's deep version (unlocked by finishing its thread): fights are bigger by `budget`, the haul by `haul`. */
  deep: { budget: 1.2, haul: 1.5 },
  /**
   * Stress, for the run only: each unit fills a bar up to `max` from wounds (`wounds` times the share of the unit's
   * wounds a fight cost it), a shaken model (`shaken`), a unit of the party wiped out (`lost`), a choice gone wrong
   * (`fail`), a curse or a shrine's wounds (`hurt`). A fight won takes off `won`, a camp `camp`, patching up or field
   * dressings `patch`. A full bar cracks the unit at the start of a round: it refuses its orders for the round, or
   * fights wild at -1 to hit, and comes back down to `after`.
   */
  stress: { max: 10, after: 5, wounds: 6, shaken: 1, lost: 3, fail: 2, hurt: 1, won: 1, camp: 6, patch: 3, refuse: 0.5 },
  /** Trinkets drop from an elite won (`elite`), a cache (`cache`) and a choice that pays off (`event`). */
  trinkets: { elite: 0.5, cache: 0.25, event: 0.15, spares: 12 },
  /** The weekly challenge: one seed a week, the same region, lord and map for every force, at this tier and length.
   * Its score is `depth` per node, `won` per fight won, `boss` for the lord and `alive` per unit still standing. */
  weekly: { tier: 1, length: 'long' as const, depth: 10, won: 5, boss: 50, alive: 10, weeks: 4 },
  /** Run recaps a force keeps, newest first. */
  recaps: 8,
  /** Hidden nodes: this share of the middle rows shows as '?' until the party can see it. It sees `sight` steps
   * ahead, one more with a scout (Scout, Strider or Ambush) in the party. */
  hidden: { share: 0.35, sight: 1 },
  /** Ambushes: stepping onto a fight that started hidden, the Echoes may strike first (`init` more initiative in the
   * first round), `odds` of the time. A scout in the party, or the lantern, stops it. */
  ambush: { odds: 0.25, init: 10 },
  /** Marauders (rules/raiders.ts): a run picks `pick` squads out of the other armies in the app; a plain or elite fight
   * is a band of them `odds` of the time, `ambush` of the time when it's an ambush. Never the lord's fight. */
  raiders: { pick: 6, odds: 0.15, ambush: 0.5 },
  /** Last stands: a party unit knocked down to its last model (or a lone model to a third of its wounds) may stand
   * fast, `odds` of the time and once a fight: for this round and the next it hits at +1, makes `mul` times the
   * attacks and takes no morale tests. */
  lastStand: { odds: 0.35, rounds: 2, mul: 1.5 },
  /** Pact marks: hardships a party takes on before a run (once the force has won one), each paying `pay` more XP and
   * Requisition per point of heat. The most heat a lord was slain under goes in the bestiary. Not on the weekly. */
  marks: {
    pay: 0.1,
    proud: 1 / 3,
    fierce: 1.15,
    bleed: 0.75,
    list: [
      { id: 'proud', name: 'Mark of Pride', heat: 2, text: 'A third of the plain fights are elites.' },
      { id: 'fierce', name: 'Mark of Fury', heat: 2, text: 'Every Echo makes 15% more attacks.' },
      { id: 'scarred', name: 'Mark of the Scarred', heat: 2, text: 'The lord comes with one more rematch trick (up to three).' },
      { id: 'bleed', name: 'Mark of Blood', heat: 1, text: 'The party sets out at three quarters of its wounds.' },
      { id: 'fuse', name: 'Mark of the Short Fuse', heat: 1, text: 'No last stands.' },
      { id: 'silent', name: 'Mark of Silence', heat: 1, text: 'No omens on the road.' },
    ] as { id: SortieMarkId; name: string; heat: number; text: string }[],
  },
  /** Battle scars: run-only traits a party unit earns once each, named in the recap. */
  scars: {
    blooded: { name: 'Blooded', text: '+1 to its morale tests.', how: 'made a last stand in a fight it won' },
    headhunter: { name: 'Headhunter', text: 'a tenth more attacks.', how: 'struck the last blow against elites', mul: 1.1 },
    survivor: { name: 'Survivor', text: 'more wounds on every model.', how: 'came through a won fight at a quarter of its wounds or less' },
  } as Record<SortieScarId, { name: string; text: string; how: string; mul?: number }>,
  /** Lord omens: nodes that tell of the lord. Reading `need` of them takes away a rematch trick, or else its own
   * signature ability. About `share` of the nodes past the first row have one, and never fewer than `need` + 1. */
  omens: { share: 0.2, need: 3 },
  /** Rematches: a lord slain by the force before comes back changed, with one more trick for each time (up to all three). */
  rematch: {
    def: 1,
    atk: 1.25,
    regen: 0.05,
    tricks: [
      { name: 'Hardened', text: '+1 to its saves.' },
      { name: 'Vengeful', text: 'a quarter more attacks.' },
      { name: 'Regenerating', text: 'mends a twentieth of its wounds at the start of each round.' },
    ],
  },
  /** Boons a force's parties are offered from the start; the rest unlock one by one as its runs reach `unlocks` goals.
   * Curses are always on offer, and the weekly challenge offers every boon. */
  boonsAtStart: ['scope', 'blades', 'bayonets', 'medic', 'drill', 'trophy', 'stims', 'wall', 'relay', 'spotter', 'dressing', 'grit'] as string[],
  unlocks: {
    rally: { goal: 'runs', n: 2 },
    salvo: { goal: 'wins', n: 1 },
    hymn: { goal: 'lore', n: 3 },
    respite: { goal: 'runs', n: 4 },
    ward: { goal: 'lords', n: 2 },
    lantern: { goal: 'beasts', n: 8 },
    hide: { goal: 'flawless', n: 1 },
    cells: { goal: 'tier', n: 2 },
    banner: { goal: 'wins', n: 3 },
    scavenge: { goal: 'deepest', n: 7 },
    packs: { goal: 'deep', n: 1 },
    rounds: { goal: 'relics', n: 2 },
  } as Record<string, { goal: SortieGoal; n: number }>,
  /** Ascension, past the top tier: each level adds the next curse in order, and pays `pay` more. */
  ascension: {
    pay: 0.1,
    curses: [
      { id: 'swollen', name: 'Swollen packs', text: 'Every fight but the lord’s is a tenth bigger again.' },
      { id: 'thin', name: 'Thin camps', text: 'Camps mend half as much.' },
      { id: 'dear', name: 'Dear wares', text: 'Shop prices are half again as much.' },
      { id: 'grim', name: 'Grim lord', text: 'The Echo lord has a quarter more wounds.' },
      { id: 'frayed', name: 'Frayed nerves', text: 'The party sets out with 3 stress each.' },
      { id: 'lean', name: 'Lean pickings', text: 'Fights won offer one boon fewer.' },
      { id: 'dark', name: 'Darker roads', text: 'More of the map is hidden.' },
      { id: 'hunted', name: 'Hunted', text: 'Ambushes come twice as often.' },
    ] as { id: SortieCurseId; name: string; text: string }[],
    fights: 1.1, rest: 0.5, prices: 1.5, lord: 1.25, stress: 3, hidden: 0.6, ambush: 2,
  },
};

/** What a boon's unlock counts: runs finished, runs won, wins with no unit wiped out, the deepest step reached, lords
 * slain, kinds of Echo met, Echo lore learned, the hardest tier unlocked, story threads finished, relics brought home. */
export type SortieGoal = 'runs' | 'wins' | 'flawless' | 'deepest' | 'lords' | 'beasts' | 'lore' | 'tier' | 'deep' | 'relics';

export type SortieMarkId = 'proud' | 'fierce' | 'scarred' | 'bleed' | 'fuse' | 'silent';
export type SortieScarId = 'blooded' | 'headhunter' | 'survivor';

export type SortieCurseId = 'swollen' | 'thin' | 'dear' | 'grim' | 'frayed' | 'lean' | 'dark' | 'hunted';

export type SortieAffix = keyof typeof SORTIE.affixes;

export type SortieMode = 'free' | 'shard';
export type SortieLength = 'short' | 'long';

export type SortieBoonId = 'scope' | 'blades' | 'ward' | 'medic' | 'drill' | 'cells' | 'packs' | 'hide' | 'trophy' | 'banner' | 'bayonets' | 'stims'
  | 'wall' | 'relay' | 'spotter' | 'dressing' | 'salvo' | 'grit' | 'rally' | 'rounds' | 'scavenge'
  | 'pact' | 'fury' | 'adrenal' | 'hymn' | 'respite' | 'lantern';

export const SORTIE_BOONS: Record<SortieBoonId, {
  name: string;
  text: string;
  ranged?: boolean;
  melee?: boolean;
  shard?: boolean;
  /** Turns up less often; an elite always offers one. */
  rare?: boolean;
  /** Strong with a cost, and only ever from a shrine. */
  curse?: boolean;
}> = {
  scope: { name: 'Targeting Scope', text: '+1 to hit when shooting at Far range.', ranged: true },
  cells: { rare: true, name: 'Overcharged Cells', text: 'Every ranged weapon reaches one step further.', ranged: true },
  blades: { name: 'Honed Blades', text: 'Melee weapons get +1 AP.', melee: true },
  bayonets: { name: 'Bayonets', text: 'Every model makes 1 more melee attack.' },
  packs: { rare: true, name: 'Jump Packs', text: 'Charge reaches Far range.', melee: true },
  ward: { rare: true, name: 'Echo-Ward', text: '+1 Defense in the first round of every fight.' },
  medic: { name: 'Field Medic', text: 'After each fight, one fallen model gets back up with a little health (or the most hurt mends some).' },
  drill: { name: 'Battle Drill', text: '+1 initiative for every model.' },
  hide: { rare: true, name: 'Thick Hide', text: 'Every model gets +1 Tough.' },
  trophy: { name: 'Echo Trophy', text: 'Every Echo a unit kills mends 1 wound on that unit.' },
  banner: { rare: true, name: 'Tattered Banner', text: 'Every unit starts each fight with a shield of 1 wound per model standing.' },
  stims: { name: 'Combat Stims', text: '+1 to every morale test.' },
  wall: { name: 'Shield Wall', text: 'The Front unit gets +1 Defense.' },
  relay: { name: 'Vox Relay', text: 'The Middle unit gets +1 to hit.' },
  spotter: { name: 'Spotter Drone', text: "The Back unit's guns reach one step further.", ranged: true },
  dressing: { name: 'Field Dressing', text: "When the line turns, the unit falling back from the Front mends a sixth of each model's wounds." },
  salvo: { rare: true, name: 'Opening Salvo', text: '+1 to hit in the first round of every fight.' },
  grit: { name: 'Grit', text: 'Models down to half their wounds or less get +1 Defense.' },
  rally: { name: 'Rally Cry', text: 'At the start of every round, shaken models steady.' },
  rounds: { rare: true, name: 'Rending Rounds', text: 'Ranged weapons get Rending (a 6 to hit gets AP(4)).', ranged: true },
  pact: { curse: true, name: 'Void Pact', text: '+1 to hit with everything, but every fight opens with each model losing a sixth of its wounds (never the last).' },
  fury: { curse: true, name: 'Berserk Rite', text: 'Melee weapons get +2 AP, but every unit has -1 Defense.', melee: true },
  adrenal: { curse: true, name: 'Adrenal Surge', text: '+2 initiative for every model, but -1 to every morale test.' },
  hymn: { name: 'Battle Hymn', text: 'The party takes half the stress.' },
  respite: { name: 'Brief Respite', text: 'Every fight won takes 2 more stress off each unit.' },
  lantern: { name: 'Pathfinder’s Lantern', text: 'Shows every hidden node on the map, and the party sees a step further ahead.' },
  scavenge: { name: 'Scavenger', text: 'Every fight won adds half again to the haul.', shard: true },
};

/** What a shrine choice does. A chance rolls once; `fail` happens instead when it misses. */
export interface SortieOutcome {
  text: string;
  boon?: boolean;
  /** Share of each model's wounds mended (1 = all), and fallen models brought back. */
  heal?: number;
  revive?: number;
  /** Wounds dealt, spread over the models (times the run's health multiplier). */
  hurt?: number;
  tough?: number;
  /** Haul, on a Shard run. */
  supply?: number;
  rp?: number;
  fight?: boolean;
  /** A cursed boon: strong, with a cost. */
  curse?: boolean;
  /** A rare boon instead of any. */
  rare?: boolean;
  /** Marks a step of a story thread done, so the next step can turn up. */
  flag?: string;
  /** The Echo lord starts the last fight short this share of its wounds (they add up, to at most `maxWeaken`). */
  weaken?: number;
}

export interface SortieChoice {
  label: string;
  /** Only for units with one of these rules, or 'ranged' / 'melee' for a weapon of that kind, or 'squad' / 'solo'. */
  needs?: string[];
  chance?: number;
  win: SortieOutcome;
  fail?: SortieOutcome;
}

export interface SortieEvent {
  id: string;
  name: string;
  text: string;
  choices: SortieChoice[];
  /** A story step: only turns up once a choice has set this flag. */
  after?: string;
}

export const SORTIE_EVENTS: SortieEvent[] = [
  {
    id: 'cache', name: 'Abandoned supply cache', text: 'Crates lie half-buried in ash, their seals cracked. Something has been at them, and may still be near.',
    choices: [
      { label: 'Take what lies on top', win: { text: 'A few sound crates.', supply: 5 } },
      { label: 'Dig through it all', chance: 0.5, win: { text: 'Deep in the pile: something worth carrying.', boon: true, supply: 5 }, fail: { text: 'Echoes boil out of the crates!', fight: true } },
      { label: 'Scout the area first', needs: ['Scout', 'Stealth', 'Ambush'], win: { text: 'You find the nest before it finds you, and the crates are yours.', boon: true, supply: 5 } },
    ],
  },
  {
    id: 'shrine', name: 'Void shrine', text: 'A spire of black glass hums at a pitch you feel in your teeth. Touching it would change you.',
    choices: [
      { label: 'Lay hands on it', win: { text: 'Strength floods in, and it burns going in.', tough: 1, hurt: 2 } },
      { label: 'Break it', needs: ['melee'], chance: 0.6, win: { text: 'It shatters, and the shards are worth something.', rp: 1 }, fail: { text: 'It bursts and cuts deep.', hurt: 3 } },
      { label: 'Leave it be', win: { text: 'You walk on, the hum fading behind you.' } },
    ],
  },
  {
    id: 'patrol', name: 'Echo patrol', text: 'A pack of Echoes drifts past, not yet aware of you.',
    choices: [
      { label: 'Strike first', win: { text: 'You fall on them.', fight: true } },
      { label: 'Let them pass', chance: 0.7, win: { text: 'They drift on.' }, fail: { text: 'One turns. They come for you.', fight: true } },
      { label: 'Slip past unseen', needs: ['Stealth', 'Scout', 'Strider', 'Flying'], win: { text: 'They never knew you were there, and you saw how they move.', boon: true } },
    ],
  },
  {
    id: 'battlefield', name: 'Old battlefield', text: 'Wrecks and bones from a fight nobody won. Some of the gear is still good.',
    choices: [
      { label: 'Scavenge the wrecks', win: { text: 'Salvage worth hauling home.', supply: 10 } },
      { label: 'Search for a weapon', chance: 0.5, win: { text: 'A fine piece, still working.', boon: true }, fail: { text: 'A booby trap.', hurt: 2 } },
      { label: 'Bury the fallen', needs: ['Hero'], win: { text: 'The rite steadies everyone.', heal: 1 } },
    ],
  },
  {
    id: 'rift', name: 'Rift in the ground', text: 'A crack in the world blocks the way, breathing cold. Going around would cost time.',
    choices: [
      { label: 'Fly over', needs: ['Flying'], win: { text: 'Easy, and you spot a safe place to rest.', heal: 0.5 } },
      { label: 'Climb across', needs: ['Strider', 'Scout'], win: { text: 'Sure-footed, you cross without a scratch, and find something on the far side.', boon: true } },
      { label: 'Jump it', chance: 0.5, win: { text: 'You make it, and something glints at the edge.', rp: 1 }, fail: { text: 'Some of you do not land well.', hurt: 3 } },
      { label: 'Go the long way', win: { text: 'Hours lost, but you rest on the way.', heal: 0.25 } },
    ],
  },
  {
    id: 'altar', name: 'Whispering altar', text: 'Something under the stone offers power, in a voice that sounds like your own. It will want something back.',
    choices: [
      { label: 'Take the bargain', win: { text: 'It is done, and you feel it settle in.', curse: true } },
      { label: 'Smash it', needs: ['melee'], chance: 0.5, win: { text: 'The voice cuts off. In the rubble, something useful.', boon: true }, fail: { text: 'It screams, and the stone bites back.', hurt: 3 } },
      { label: 'Walk away', win: { text: 'The whispering follows you a while, then stops.' } },
    ],
  },
  {
    id: 'survivor', name: 'A survivor', text: 'A lone soldier from a lost patrol stumbles out of the ruins, half-mad, clutching a field kit.',
    choices: [
      { label: 'Hear them out', win: { text: 'They teach you a hard-won trick and leave in the night.', boon: true } },
      { label: 'Take the kit', win: { text: 'Bandages and stims.', heal: 0.5, revive: 1 } },
      { label: 'Let them join', needs: ['squad'], chance: 0.5, win: { text: 'They fall in beside you. Two fallen get back up.', revive: 2 }, fail: { text: 'An Echo was wearing them.', fight: true } },
    ],
  },
];

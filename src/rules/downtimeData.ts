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
 * Training sim: a tower-defense run between games. The squad stands around a base and holds off endless waves of Echo
 * drones. Nothing in it touches the campaign but XP: units don't become busy, and a unit that dies there is only out of
 * the run. The logic is in training.ts; the game is components/TrainingModal.tsx.
 */
export const TRAINING = {
  squadMax: 5,
  /** XP each unit still standing earns for every `xpEvery` waves cleared, up to `xpCap` a run. */
  xpPerWave: 1,
  xpEvery: 3,
  xpCap: 3,
  /** The map is this many tiles square, with the base on the middle tile. Units can't stand on the outer ring. */
  mapSize: 17,
  baseHp: 20,
  /** A weapon reaches one tile for every this many inches of range. */
  inchesPerTile: 4,
  /** Melee weapons reach this far (tiles). */
  meleeReach: 1.5,
  /** Seconds between a unit's volleys: shooting, and melee. */
  shootEvery: 2,
  meleeEvery: 1.2,
  /** A unit's volley spreads its shots over this share of the wait before the next one. */
  volleySpread: 0.5,
  /** Seconds between an enemy's attacks, and between the shots of one with a gun. */
  enemyEvery: 1.2,
  enemyShootEvery: 2.5,
  /** Enemies stop to fight a unit they come within this many tiles of. */
  engage: 0.8,
  /** Blast(X) hits up to X enemies within this many tiles of the target. */
  blastRadius: 1,
  /** A Hero's aura gives +1 to hit to every unit within this many tiles of it, itself included. */
  auraRadius: 2,
  /** Fortifications have this many times their wounds. */
  fortificationHp: 2,
  /** Every unit's Tough counts this many times over, so a swarm that reaches it doesn't wipe it out at once (and a unit that ends up in melee lasts). */
  toughMul: 9,
  /** Every enemy has this many times its listed wounds. */
  enemyHp: 2,
  /** Each enemy fighting a Vehicle/Monster takes this much damage a second, plus a third of its Impact. */
  crushDps: 1,
  /** A level-up gives all at once: +1 Tough, +1 damage a hit, this much faster fire, +1 tile to shooting weapons and aura. */
  ratePerLevel: 0.7,
  /** Melee weapons get no reach from a level-up; they get this much damage a hit instead of +1. */
  meleeDmgPerLevel: 3,
  /** A unit's first level-up costs this many credits; each one after costs this many times its last (units level apart). */
  upgradeBase: 40,
  upgradeGrowth: 1.25,
  /** A wave drops credits enough for about this many level-ups, if every enemy in it dies (priced at the squad's average level by then). */
  upgradesPerWave: 0.9,
  /** A bought heal mends this share of a unit's wounds, for this share of its next level-up's cost. */
  heal: { share: 0.5, cost: 0.35 },
  /** Waves scale with the squad's power: its points, with each level adding this share. */
  levelPower: 0.05,
  /** Wave 1's enemies cost this much for every 100 power, growing by `budgetGrowth` a wave. */
  budgetPer100: 5.5,
  budgetGrowth: 1.16,
  /** Enemies also get this many times tougher each wave, to keep pace with the upgrades: faster for a smaller squad, which spreads them over fewer units (× squadMax / squad size). */
  hpGrowth: 1.08,
  /** The Echo Lord is as tough as this many points of squad would make it (scaled with the squad, within ×0.4–2). */
  bossPower: 700,
  /** Past this many cost-points in a wave, enemies get tougher instead of more numerous. */
  maxBudget: 70,
  /**
   * A squad of more than this much power is a big one: for every time over it is, a wave may hold that many times as many
   * enemies (up to `bigCountMax` times), and more of them come as veterans (`vetPer` more for each time over, up to `vetMax`).
   */
  bigSquad: 1000,
  bigCountMax: 2.5,
  /** Share of any squad's enemies (bar Echo Lords) that come as veterans, at random. */
  vetBase: 0.1,
  vetPer: 0.5,
  vetMax: 0.75,
  /** A veteran enemy: this many times the wounds, and +1 to hit and +1 AP on all its attacks. */
  vet: { hp: 2, hit: 1, ap: 1 },
  /** Each wave sends this many times the enemies its budget buys, for the same credits. */
  enemyCount: 1.5,
  /** An Echo Lord comes every this many waves. */
  bossEvery: 5,
  /** Share of a wave that comes from the direction shown before it, within `arc` degrees either side. */
  favoured: 0.9,
  arc: 20,
  /** Scouts and Ambushers come from the opposite side, within this many degrees of it. */
  flankArc: 40,
  /** Cover: short ridges of raised ground laid out at random each run, between `near` and `far` tiles from the base.
   * A shot that passes over a cover tile (other than the shooter's own) is at `hit` to hit; blows in melee ignore it. */
  /**
   * Boon cards: after every `every` waves cleared, pick one of `offer` drawn. Each card's rarity is drawn with these odds
   * (Legendary first). Numbers for the cards that need them: base HP a wall card adds, a bounty's share more credits, a
   * ration's share of wounds mended, a ridge card's ridges.
   */
  cards: { every: 3, offer: 3, odds: { Legendary: 0.1, Rare: 0.3 }, walls: 5, ramparts: 12, bounty: 0.25, rations: 0.5, ridges: 2 },
  cover: { ridges: 6, length: [1, 3] as [number, number], near: 2.5, far: 6.5, hit: -2 },
  /** Ambushers appear this far from the base (tiles). */
  ambushRange: [4.5, 6] as [number, number],
  /** Seconds in an ability round: an ability that comes back every 2 rounds comes back every 12 seconds. */
  abilityRound: 6,
  /** Seconds each status lasts once a hit leaves it. */
  status: { stun: 1, slow: 2.5, daze: 3, mark: 4, bleed: 3 },
  /** A slowed enemy moves at this share of its speed. */
  slowMul: 0.5,
  /** A marked enemy takes this much more damage from every hit. */
  markDmg: 1,
  /** A bleeding enemy loses this much a second, credited to whoever made it bleed. */
  bleedDps: 1,
  /** A knock pushes an enemy this many tiles straight back from the base. */
  knock: 1.5,
  /** An execute finishes off an enemy (not the boss) below this share of its wounds. */
  executeAt: 0.25,
  /** A field's slow or daze lingers this many seconds after an enemy leaves it. */
  fieldLinger: 0.5,
  /** Marauders: squads out of the other armies in the app. A run draws `pick` of them; from wave `from`, a wave has
   *  `odds` of sending them, as `share` of its budget. */
  raiders: { pick: 6, from: 3, odds: 0.3, share: 0.5 },
  /** Sortie quirks and trinkets count here too: each point of initiative attacks this much faster; Jumpy attacks at
   *  `jumpyMul` for the first `jumpySecs` of a wave; Short-sighted is -1 to hit past `myopicFrom` of a gun's reach. */
  habits: { rate: 0.1, jumpySecs: 5, jumpyMul: 0.6, myopicFrom: 2 / 3 },
};

export type TrainingEnemyKind = 'swarm' | 'drone' | 'carapace' | 'mirror' | 'spitter' | 'outrider' | 'stalker' | 'brute' | 'lord';

export interface TrainingEnemyDef {
  name: string;
  desc: string;
  hp: number;
  /** Tiles a second. */
  speed: number;
  /** Taken off the damage of every hit (a 6 to hit from a Rending weapon ignores it). */
  armor: number;
  attacks: number;
  quality: number;
  ap: number;
  /** A gun it fires on the move at the nearest unit in reach (tiles), as well as fighting in melee. */
  gun?: { range: number; attacks: number; ap: number };
  /** Damage it takes from shooting (guns, blasts, barrages) and from melee (blows, thorns, crushing), as multiples. */
  shotMul?: number;
  meleeMul?: number;
  /** Its share of the wave's budget, and of the credits. */
  cost: number;
  /** The first wave it can turn up in. */
  from: number;
  /** Scout: comes in from the opposite side as the wave starts. Ambush: appears mid-wave, close in on the opposite side. */
  spawn: 'main' | 'scout' | 'ambush' | 'boss';
  color: string;
  /** Drawn radius, in tiles. */
  size: number;
  /** How it's drawn, by role: pointed shapes rush in to fight, rounder ones hang back and shoot, heavy ones are thick-walled. */
  shape: TrainingEnemyShape;
}

/** dart: a melee rusher, pointing where it's going. diamond: a line shooter. pentagon: a heavy shooter, weak in melee.
 *  chevron: a fast raider. hexagon: armoured. shield: shrugs off shots. star: an ambusher's blades. spikes: a heavy
 *  brawler. crown: the boss. */
export type TrainingEnemyShape = 'dart' | 'diamond' | 'pentagon' | 'chevron' | 'hexagon' | 'shield' | 'star' | 'spikes' | 'crown';

export const TRAINING_ENEMIES: Record<TrainingEnemyKind, TrainingEnemyDef> = {
  swarm: { name: 'Swarmling', desc: 'Fast and frail, in numbers.', hp: 3, speed: 1.6, armor: 0, attacks: 1, quality: 5, ap: 0, cost: 1, from: 1, spawn: 'main', color: '#c9b458', size: 0.18, shape: 'dart' },
  drone: { name: 'Echo Drone', desc: 'The line infantry of the Echoes. Shoots on the move (4 tiles).', hp: 6, speed: 1.1, armor: 0, attacks: 2, quality: 4, ap: 0, gun: { range: 4, attacks: 1, ap: 0 }, cost: 2, from: 1, spawn: 'main', color: '#8fa7c4', size: 0.24, shape: 'diamond' },
  spitter: { name: 'Spitter', desc: 'Spits hard as it comes on (3 tiles); weak in melee.', hp: 5, speed: 0.9, armor: 0, attacks: 1, quality: 4, ap: 0, gun: { range: 3, attacks: 3, ap: 0 }, cost: 3, from: 2, spawn: 'main', color: '#7fbf6a', size: 0.22, shape: 'pentagon' },
  outrider: { name: 'Outrider', desc: 'Scout: races in from the opposite side as the wave starts, shooting (3 tiles).', hp: 5, speed: 2, armor: 0, attacks: 2, quality: 4, ap: 0, gun: { range: 3, attacks: 1, ap: 0 }, cost: 3, from: 2, spawn: 'scout', color: '#e0a040', size: 0.22, shape: 'chevron' },
  carapace: { name: 'Carapace', desc: 'Armour 1: each hit does 1 less damage. Bring AP. Shoots on the move (4 tiles).', hp: 10, speed: 0.8, armor: 1, attacks: 2, quality: 4, ap: 1, gun: { range: 4, attacks: 2, ap: 0 }, cost: 4, from: 3, spawn: 'main', color: '#6c7a89', size: 0.28, shape: 'hexagon' },
  mirror: { name: 'Mirrorshell', desc: 'Mirrored hide: shots do 40% damage, melee 150%. Meet it with blades.', hp: 10, speed: 0.85, armor: 0, attacks: 3, quality: 4, ap: 1, shotMul: 0.4, meleeMul: 1.5, cost: 5, from: 4, spawn: 'main', color: '#a8dce8', size: 0.3, shape: 'shield' },
  stalker: { name: 'Stalker', desc: 'Ambush: appears mid-wave, close in on the opposite side.', hp: 7, speed: 1.3, armor: 0, attacks: 3, quality: 4, ap: 1, cost: 4, from: 3, spawn: 'ambush', color: '#b05cc8', size: 0.24, shape: 'star' },
  brute: { name: 'Brute', desc: 'Slow, huge, and hits hard. Shoots on the move (3 tiles).', hp: 22, speed: 0.6, armor: 0, attacks: 4, quality: 3, ap: 1, gun: { range: 3, attacks: 2, ap: 1 }, cost: 6, from: 4, spawn: 'main', color: '#c0583e', size: 0.34, shape: 'spikes' },
  lord: { name: 'Echo Lord', desc: `Every ${TRAINING.bossEvery}th wave. Armour 1. Shoots on the move (5 tiles).`, hp: 80, speed: 0.5, armor: 1, attacks: 6, quality: 3, ap: 2, gun: { range: 5, attacks: 3, ap: 1 }, cost: 20, from: 1, spawn: 'boss', color: '#e04a6a', size: 0.45, shape: 'crown' },
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
  /** Veteran titles, by runs a unit came back from standing; slaying `lords` Echo lords adds the lord title. */
  veteran: { titles: [[3, 'Road-worn'], [6, 'Ash-walker'], [10, 'Hollow-sworn']] as [number, string][], lords: 3, lordTitle: 'Lordbane' },
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

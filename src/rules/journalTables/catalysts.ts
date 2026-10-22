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
  {
    id: 'plagueShip', name: 'A plague ship', tags: ['danger', 'people', 'horror'], tables: ['peril', 'salvage'],
    text: 'A transport limps into orbit with its hails unanswered, and the few faces at the viewports are covered in weeping sores.',
    approaches: [
      { id: 'quarantine', label: 'Quarantine it', skill: 'command', tags: ['careful', 'order'], text: 'Lock down the docks and let no one off.' },
      { id: 'treat', label: 'Go aboard and treat them', skill: 'endurance', tags: ['mercy', 'risk'], text: 'Walk among the sick and trust your constitution.' },
      { id: 'purge', label: 'Burn it', skill: 'resolve', tags: ['ruthless', 'fear'], text: 'Give the order, with whoever is still aboard.' },
    ],
    climax: { text: 'The sickness shows itself in your own ranks.', skills: ['endurance', 'resolve', 'lore'] },
  },
  {
    id: 'machineWakes', name: 'The machine wakes', tags: ['tech', 'strange', 'knowledge'], tables: ['knowledge', 'relics'],
    text: 'A salvaged cogitator has started answering questions nobody asked, and it knows the Warlord’s name.',
    approaches: [
      { id: 'converse', label: 'Talk to it', skill: 'lore', tags: ['careful', 'knowledge'], text: 'Learn what it is before it learns what you are.' },
      { id: 'pullPlug', label: 'Cut its power', skill: 'speed', tags: ['bold', 'denial'], text: 'Get to the breakers before it spreads to the network.' },
      { id: 'enslave', label: 'Order it to serve', skill: 'command', tags: ['pride', 'tech'], text: 'Bind it with every override code you hold.' },
    ],
    climax: { text: 'The machine decides what you are to it.', skills: ['resolve', 'guile', 'lore'] },
  },
  {
    id: 'ionStorm', name: 'An ion storm', tags: ['danger', 'nature', 'retreat'], tables: ['peril', 'salvage'],
    text: 'A wall of crackling ion-cloud rolls across the plain, frying vox and auspex alike, and the detachment is caught in the open.',
    approaches: [
      { id: 'weather', label: 'Weather it', skill: 'endurance', tags: ['careful', 'patience'], text: 'Lash down, cover up and wait it out.' },
      { id: 'outrun', label: 'Outrun it', skill: 'speed', tags: ['bold', 'retreat'], text: 'Every vehicle at full throttle for the ridge.' },
      { id: 'digIn', label: 'Dig in by the book', skill: 'command', tags: ['military', 'order'], text: 'Trenches, bunkers, and discipline.' },
    ],
    climax: { text: 'The eye of the storm passes over, and something walks in it.', skills: ['endurance', 'resolve', 'speed'] },
  },
  {
    id: 'blackAuction', name: 'A black-market auction', tags: ['crime', 'trade', 'greed'], tables: ['relics', 'salvage'],
    text: 'Invitations arrive for a masked auction in a drowned hab-block. The headline lot once belonged to your faction.',
    approaches: [
      { id: 'outbid', label: 'Outbid them all', skill: 'command', tags: ['trade', 'pride'], text: 'Empty the war chest if you must.' },
      { id: 'steal', label: 'Steal the lot', skill: 'guile', tags: ['cunning', 'crime'], text: 'Slip into the vaults while the bidding runs.' },
      { id: 'stare', label: 'Stare down the bidders', skill: 'resolve', tags: ['intimidation', 'fear'], text: 'Let every rival know what it costs to bid against you.' },
    ],
    climax: { text: 'The final lot is unveiled — and so is the ambush.', skills: ['guile', 'speed', 'command'] },
  },
  {
    id: 'ghostFleet', name: 'A ghost fleet', tags: ['echoes', 'horror', 'void'], tables: ['void', 'peril'],
    text: 'Long-range vox picks up a fleet that was lost a century ago, and its admiral is speaking in the Warlord’s voice.',
    approaches: [
      { id: 'answer', label: 'Answer the hail', skill: 'resolve', tags: ['risk', 'warp'], text: 'Speak to the dead and keep your wits.' },
      { id: 'jam', label: 'Retune the arrays', skill: 'lore', tags: ['careful', 'tech'], text: 'Find the frequency that drowns it out.' },
      { id: 'scout', label: 'Send a fast scout', skill: 'speed', tags: ['bold', 'intel'], text: 'Fly down the bearing and see what is there.' },
    ],
    climax: { text: 'The ghost fleet comes into view.', skills: ['resolve', 'lore', 'command'] },
  },
  {
    id: 'showTrial', name: 'A show trial', tags: ['politics', 'loyalty', 'honour'], tables: ['glory', 'knowledge'],
    text: 'One of the detachment’s heroes stands accused of cowardice by a commissar with powerful friends.',
    approaches: [
      { id: 'defend', label: 'Speak in their defence', skill: 'command', tags: ['honour', 'leadership'], text: 'Put your own name on the line before the tribunal.' },
      { id: 'evidence', label: 'Dig up the records', skill: 'lore', tags: ['careful', 'knowledge'], text: 'Find the battle logs that prove what really happened.' },
      { id: 'whoBenefits', label: 'Find who wants them gone', skill: 'guile', tags: ['cunning', 'politics'], text: 'Somebody profits from this verdict.' },
    ],
    climax: { text: 'The verdict falls, and the crowd turns.', skills: ['command', 'resolve', 'guile'] },
  },
  {
    id: 'forcedMarch', name: 'A desperate relief', tags: ['military', 'supply', 'honour'], tables: ['glory', 'salvage'],
    text: 'A cut-off outpost begs for relief. It is six days’ march away, and they say they can hold for four.',
    approaches: [
      { id: 'march', label: 'Cut every corner', skill: 'speed', tags: ['bold', 'risk'], text: 'Take the short roads, however dangerous.' },
      { id: 'carry', label: 'Never stop', skill: 'endurance', tags: ['pain', 'military'], text: 'Carry everything and march through the nights.' },
      { id: 'militia', label: 'Rally the locals', skill: 'command', tags: ['leadership', 'people'], text: 'Raise militia along the way to hold the gaps.' },
    ],
    climax: { text: 'You arrive as the walls fall.', skills: ['might', 'endurance', 'speed'] },
  },
  {
    id: 'kingsTomb', name: 'A dead king’s tomb', tags: ['lore', 'danger', 'arcane'], tables: ['relics', 'peril'],
    text: 'Bombardment has cracked open the sealed tomb of a forgotten warlord-king, and its wards are still humming.',
    approaches: [
      { id: 'decipher', label: 'Read the wards', skill: 'lore', tags: ['careful', 'arcane'], text: 'Learn the tomb’s rules before you break them.' },
      { id: 'dash', label: 'Run the gauntlet', skill: 'speed', tags: ['bold', 'risk'], text: 'Sprint through while the wards cycle.' },
      { id: 'endure', label: 'Walk the needle hall', skill: 'endurance', tags: ['pain', 'bold'], text: 'Take the punishment and keep walking.' },
    ],
    climax: { text: 'The dead king’s guardian rises from its throne.', skills: ['might', 'resolve', 'lore'] },
  },
  {
    id: 'convoyHeist', name: 'A treasury convoy', tags: ['crime', 'cunning', 'supply'], tables: ['salvage', 'relics'],
    text: 'An enemy pay-convoy is moving through the badlands with a light escort and a very heavy strongbox.',
    approaches: [
      { id: 'ambush', label: 'Ambush it', skill: 'might', tags: ['bold', 'military'], text: 'Hit it hard at the narrowest pass.' },
      { id: 'infiltrate', label: 'Get someone inside', skill: 'guile', tags: ['cunning', 'intel'], text: 'A driver can be bought, or replaced.' },
      { id: 'chase', label: 'Run it down', skill: 'speed', tags: ['bold', 'race'], text: 'Bikes and jetbikes, out of the dust.' },
    ],
    climax: { text: 'The convoy’s escort was never what it seemed.', skills: ['might', 'guile', 'endurance'] },
  },
  {
    id: 'undercityRite', name: 'A rite beneath the city', tags: ['warp', 'horror', 'faith'], tables: ['void', 'peril'],
    text: 'Chanting rises from the sewers under the hive, and three districts have stopped dreaming.',
    approaches: [
      { id: 'purge', label: 'Lead the purge', skill: 'command', tags: ['military', 'ruthless'], text: 'Flamers first, questions never.' },
      { id: 'disrupt', label: 'Break the pattern', skill: 'lore', tags: ['arcane', 'knowledge'], text: 'Find the flaw in the ritual and pull it apart.' },
      { id: 'deny', label: 'Step into the circle', skill: 'resolve', tags: ['faith', 'risk'], text: 'Stand at its heart and refuse it.' },
    ],
    climax: { text: 'What they summoned is half-way through.', skills: ['resolve', 'might', 'endurance'] },
  },
  {
    id: 'starvingGarrison', name: 'Empty larders', tags: ['supply', 'people', 'danger'], tables: ['salvage', 'peril'],
    text: 'The last supply drop was shot down, and the garrison is eating its boot leather. The wreck lies in no-man’s-land.',
    approaches: [
      { id: 'ration', label: 'Ration hard', skill: 'command', tags: ['order', 'careful'], text: 'Half portions, then quarter, and hanging for hoarders.' },
      { id: 'forage', label: 'Live off the land', skill: 'endurance', tags: ['nature', 'patience'], text: 'Grubs, roots and rainwater.' },
      { id: 'raid', label: 'Raid the wreck', skill: 'might', tags: ['bold', 'salvage'], text: 'Fight off whoever got there first.' },
    ],
    climax: { text: 'Hunger makes soldiers desperate, and the knives come out.', skills: ['command', 'resolve', 'might'] },
  },
  {
    id: 'fallenWalker', name: 'A fallen war-engine', tags: ['tech', 'salvage', 'danger'], tables: ['relics', 'salvage'],
    text: 'A towering war-walker lies dead in the ash, its reactor ticking toward meltdown and its great cannon still intact.',
    approaches: [
      { id: 'strip', label: 'Strip it fast', skill: 'speed', tags: ['bold', 'greed'], text: 'Take what you can carry before it goes.' },
      { id: 'stabilise', label: 'Stabilise the reactor', skill: 'lore', tags: ['careful', 'tech'], text: 'Talk the old core down from its rage.' },
      { id: 'workHot', label: 'Work in the radiation', skill: 'endurance', tags: ['pain', 'salvage'], text: 'Lead the crews in yourself and stay until it is done.' },
    ],
    climax: { text: 'The reactor reaches its last count.', skills: ['speed', 'lore', 'endurance'] },
  },
  {
    id: 'witchChild', name: 'A gifted child', tags: ['warp', 'people', 'mercy'], tables: ['void', 'knowledge'],
    text: 'Among the civilians is a child who knows what people will say before they say it, and the hunters who track such children are a day away.',
    approaches: [
      { id: 'hide', label: 'Hide the child', skill: 'guile', tags: ['cunning', 'mercy'], text: 'Forge papers and bury the records.' },
      { id: 'testGift', label: 'Test the gift', skill: 'lore', tags: ['arcane', 'risk'], text: 'Find out how strong the child really is.' },
      { id: 'flee', label: 'Get them off-world', skill: 'speed', tags: ['bold', 'retreat'], text: 'A fast shuttle, no questions asked.' },
    ],
    climax: { text: 'The child’s power breaks loose.', skills: ['resolve', 'endurance', 'lore'] },
  },
  {
    id: 'hostages', name: 'An exchange of hostages', tags: ['politics', 'military', 'honour'], tables: ['glory', 'knowledge'],
    text: 'The enemy holds three of your officers and wants a prisoner of yours in return — one you swore would never go free.',
    approaches: [
      { id: 'negotiate', label: 'Negotiate the terms', skill: 'command', tags: ['diplomacy', 'honour'], text: 'Find a price both sides can stomach.' },
      { id: 'nightRaid', label: 'Rescue them by night', skill: 'speed', tags: ['bold', 'military'], text: 'Strike before the deadline and get out.' },
      { id: 'callBluff', label: 'Call their bluff', skill: 'resolve', tags: ['pride', 'risk'], text: 'Let the deadline pass and hold your nerve.' },
    ],
    climax: { text: 'The exchange goes wrong on the bridge.', skills: ['speed', 'might', 'guile'] },
  },
  {
    id: 'sinkingHive', name: 'A city sinking', tags: ['urban', 'danger', 'people'], tables: ['salvage', 'glory'],
    text: 'A quake splits the crust beneath a hive-district, and whole towers begin sliding into the chasm.',
    approaches: [
      { id: 'evacuate', label: 'Run the evacuation', skill: 'command', tags: ['leadership', 'mercy'], text: 'Keep the crowds moving and the panic down.' },
      { id: 'dig', label: 'Dig out survivors', skill: 'endurance', tags: ['honour', 'pain'], text: 'Shovels and bare hands, through the night.' },
      { id: 'grab', label: 'Grab the valuables', skill: 'speed', tags: ['greed', 'ruthless'], text: 'The vaults are open and nobody is watching.' },
    ],
    climax: { text: 'The last tower goes down with you inside.', skills: ['endurance', 'speed', 'might'] },
  },
  {
    id: 'widowsVengeance', name: 'A widow’s vengeance', tags: ['court', 'betrayal', 'intel'], tables: ['glory', 'peril'],
    text: 'A noblewoman swears the Warlord murdered her husband in the last campaign, and she has gold enough to hire killers.',
    approaches: [
      { id: 'confront', label: 'Face her yourself', skill: 'resolve', tags: ['honour', 'risk'], text: 'Go to her house unarmed and hear her grief.' },
      { id: 'guard', label: 'Double the guard', skill: 'command', tags: ['military', 'careful'], text: 'No one gets within a mile without a search.' },
      { id: 'counter', label: 'Strike first', skill: 'guile', tags: ['cunning', 'ruthless'], text: 'Find her killers before they find you.' },
    ],
    climax: { text: 'The assassin strikes at the feast.', skills: ['speed', 'guile', 'endurance'] },
  },
  {
    id: 'mirrorDouble', name: 'The other Warlord', tags: ['strange', 'warp', 'intel'], tables: ['void', 'peril'],
    text: 'Patrols swear they saw the Warlord giving orders in the forward trenches last night. The Warlord was asleep in camp.',
    approaches: [
      { id: 'hunt', label: 'Hunt the double', skill: 'speed', tags: ['bold', 'intel'], text: 'Follow every sighting the moment it comes in.' },
      { id: 'unmask', label: 'Work out what it is', skill: 'lore', tags: ['arcane', 'careful'], text: 'Shapeshifter, hololith, or something worse.' },
      { id: 'reassert', label: 'Show yourself to the troops', skill: 'command', tags: ['leadership', 'pride'], text: 'Walk every trench so they know the real one.' },
    ],
    climax: { text: 'You meet yourself face to face.', skills: ['resolve', 'might', 'guile'] },
  },
  {
    id: 'pilgrims', name: 'A procession of bones', tags: ['faith', 'people', 'honour'], tables: ['relics', 'glory'],
    text: 'Barefoot pilgrims ask for passage through the warzone, carrying a saint’s bones in a gilded reliquary.',
    approaches: [
      { id: 'escort', label: 'Escort them', skill: 'endurance', tags: ['honour', 'faith'], text: 'Walk the whole road at their slow pace.' },
      { id: 'swindle', label: 'Swap the reliquary', skill: 'guile', tags: ['cunning', 'greed'], text: 'They will never know the bones are fake.' },
      { id: 'kneel', label: 'Kneel with them', skill: 'resolve', tags: ['faith', 'celebration'], text: 'Join the rites and let the troops see you do it.' },
    ],
    climax: { text: 'Raiders come for the bones.', skills: ['might', 'command', 'speed'] },
  },
  {
    id: 'hauntedEngine', name: 'A haunted engine', tags: ['tech', 'faith', 'loyalty'], tables: ['knowledge', 'salvage'],
    text: 'The flagship’s crew refuse to go below: the main engine has started screaming, and it screams in a dead language.',
    approaches: [
      { id: 'rite', label: 'Perform the rites', skill: 'resolve', tags: ['faith', 'leadership'], text: 'Incense, oil and an unshaking voice.' },
      { id: 'repair', label: 'Find the real fault', skill: 'lore', tags: ['tech', 'careful'], text: 'It is a cracked baffle. Probably.' },
      { id: 'rally', label: 'Shame the crew', skill: 'command', tags: ['military', 'order'], text: 'Remind them who they should fear more.' },
    ],
    climax: { text: 'The engine roars to life on its own.', skills: ['lore', 'endurance', 'might'] },
  },
  {
    id: 'deserters', name: 'Caught deserting', tags: ['military', 'loyalty', 'intel'], tables: ['glory', 'knowledge'],
    text: 'A squad is caught slipping away with stolen supplies. Their sergeant swears they know where the enemy is massing.',
    approaches: [
      { id: 'execute', label: 'Carry out the sentence', skill: 'resolve', tags: ['ruthless', 'order'], text: 'The law is clear, and the troops are watching.' },
      { id: 'interrogate', label: 'Hear the story', skill: 'guile', tags: ['intel', 'careful'], text: 'Question them apart and compare the lies.' },
      { id: 'chase', label: 'Catch the runner', skill: 'speed', tags: ['bold', 'intel'], text: 'One of them got away, and he has the map.' },
    ],
    climax: { text: 'Their story checks out — and leads straight into a trap.', skills: ['command', 'endurance', 'speed'] },
  },
  {
    id: 'gamblingDen', name: 'A debt of honour', tags: ['crime', 'greed', 'glory'], tables: ['glory', 'salvage'],
    text: 'One of your officers has gambled away the regimental standard in a smugglers’ den, and the house wants a rematch with the Warlord.',
    approaches: [
      { id: 'play', label: 'Take a seat at the table', skill: 'guile', tags: ['cunning', 'risk'], text: 'Read the dealer, not the cards.' },
      { id: 'drink', label: 'Out-drink the house champion', skill: 'endurance', tags: ['pride', 'celebration'], text: 'Glass for glass, until one of you falls.' },
      { id: 'snatch', label: 'Grab the standard and run', skill: 'speed', tags: ['bold', 'crime'], text: 'Honour can be restored later.' },
    ],
    climax: { text: 'The final hand, with everything on the table.', skills: ['guile', 'resolve', 'lore'] },
  },
  {
    id: 'sporeBloom', name: 'A spore bloom', tags: ['nature', 'danger', 'horror'], tables: ['peril', 'knowledge'],
    text: 'Overnight a fungal forest has grown across the camp perimeter, and the sentries posted there have put down roots.',
    approaches: [
      { id: 'burn', label: 'Burn it back', skill: 'command', tags: ['military', 'ruthless'], text: 'Every flamer to the line, in shifts.' },
      { id: 'study', label: 'Study a sample', skill: 'lore', tags: ['careful', 'knowledge'], text: 'Find out what it feeds on.' },
      { id: 'pushThrough', label: 'March through it', skill: 'endurance', tags: ['bold', 'pain'], text: 'Rebreathers on, and keep moving.' },
    ],
    climax: { text: 'The bloom’s heart opens.', skills: ['endurance', 'might', 'lore'] },
  },
  {
    id: 'hangarRift', name: 'A rift in the hangar', tags: ['void', 'warp', 'danger'], tables: ['void', 'peril'],
    text: 'A tear in reality opens above the landing pads, and things with too many joints begin to drop through.',
    approaches: [
      { id: 'hold', label: 'Hold the line', skill: 'might', tags: ['military', 'bold'], text: 'Kill whatever comes through.' },
      { id: 'seal', label: 'Seal the tear', skill: 'lore', tags: ['arcane', 'risk'], text: 'Reverse the field before it widens.' },
      { id: 'evacuate', label: 'Clear the hangar', skill: 'speed', tags: ['careful', 'retreat'], text: 'Get the gunships out first.' },
    ],
    climax: { text: 'The rift widens, and something vast looks through.', skills: ['resolve', 'endurance', 'command'] },
  },
  {
    id: 'rearguard', name: 'The rearguard', tags: ['military', 'honour', 'loyalty'], tables: ['glory', 'relics'],
    text: 'The rearguard that covered your last withdrawal is still alive, still fighting, and still calling for orders.',
    approaches: [
      { id: 'goBack', label: 'Go back for them', skill: 'speed', tags: ['bold', 'honour'], text: 'Lead a relief dash through enemy lines.' },
      { id: 'join', label: 'Join them on the line', skill: 'endurance', tags: ['honour', 'pain'], text: 'Fight beside them until help comes.' },
      { id: 'farewell', label: 'Order them to die well', skill: 'resolve', tags: ['ruthless', 'glory'], text: 'Say it, and mean it.' },
    ],
    climax: { text: 'The final wave hits.', skills: ['might', 'endurance', 'command'] },
  },
  {
    id: 'bountyHunter', name: 'A price on your head', tags: ['danger', 'crime', 'glory'], tables: ['relics', 'peril'],
    text: 'A notorious bounty hunter has taken a contract on the Warlord, and has never once failed to collect.',
    approaches: [
      { id: 'bait', label: 'Bait a trap', skill: 'guile', tags: ['cunning', 'risk'], text: 'Give them an opening you chose.' },
      { id: 'counterOffer', label: 'Make a better offer', skill: 'command', tags: ['trade', 'diplomacy'], text: 'Contracts can be bought out.' },
      { id: 'stalk', label: 'Hunt the hunter', skill: 'speed', tags: ['bold', 'intel'], text: 'Move first and keep moving.' },
    ],
    climax: { text: 'The hunter has you in their sights.', skills: ['speed', 'endurance', 'guile'] },
  },
  {
    id: 'prisonRiot', name: 'A riot in the cages', tags: ['military', 'people', 'danger'], tables: ['knowledge', 'salvage'],
    text: 'The prisoner camp has risen. Somewhere inside is a captured enemy engineer you were saving for questioning.',
    approaches: [
      { id: 'crush', label: 'Crush it', skill: 'might', tags: ['ruthless', 'military'], text: 'Send in the heavies and end it.' },
      { id: 'parley', label: 'Hear their demands', skill: 'command', tags: ['diplomacy', 'mercy'], text: 'Talk them down from the walls.' },
      { id: 'extract', label: 'Extract the engineer', skill: 'speed', tags: ['bold', 'intel'], text: 'Get them out before the mob finds them.' },
    ],
    climax: { text: 'The riot’s leader holds the engineer at knife-point.', skills: ['resolve', 'guile', 'speed'] },
  },
  {
    id: 'sharedDream', name: 'The shared dream', tags: ['warp', 'horror', 'strange'], tables: ['void', 'knowledge'],
    text: 'Every soldier in the detachment woke screaming from the same dream: a door in the sky, and someone knocking.',
    approaches: [
      { id: 'stayAwake', label: 'Forbid sleep', skill: 'endurance', tags: ['denial', 'pain'], text: 'Stimms and shouting until it passes.' },
      { id: 'follow', label: 'Follow the dream', skill: 'lore', tags: ['arcane', 'risk'], text: 'Go under on purpose and map it.' },
      { id: 'confront', label: 'Answer the knock', skill: 'resolve', tags: ['faith', 'warp'], text: 'Face whoever is behind the door.' },
    ],
    climax: { text: 'In the dream, the door opens.', skills: ['resolve', 'lore', 'guile'] },
  },
  {
    id: 'bannerRace', name: 'The banner race', tags: ['glory', 'honour', 'race'], tables: ['glory', 'relics'],
    text: 'A rival faction proposes an old custom instead of a battle: champions race across a ruined city to plant a banner on its highest spire.',
    approaches: [
      { id: 'sprint', label: 'Run it yourself', skill: 'speed', tags: ['bold', 'race'], text: 'Take the straightest line and trust your legs.' },
      { id: 'plan', label: 'Plan the route', skill: 'command', tags: ['careful', 'military'], text: 'Scouts, maps and a squad at every chokepoint.' },
      { id: 'sabotage', label: 'Cripple their champion', skill: 'guile', tags: ['cunning', 'ruthless'], text: 'The custom says nothing about the night before.' },
    ],
    climax: { text: 'At the summit, the other champion is waiting.', skills: ['speed', 'might', 'endurance'] },
  },
];

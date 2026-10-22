import type { JournalComplication } from '../journalData';

// Crossroads Journal complications: a dilemma with two answers, one risky (rolled) and one safe.
// `rival`: a rival Warlord's beat, with `{rival}` standing for their name (flavour only).

export const COMPLICATIONS_TABLE: JournalComplication[] = [
  {
    id: 'clock', name: 'The clock is running', text: 'An enemy fleet is inbound. You have hours, not days.',
    choices: [
      { id: 'push', label: 'Push on regardless', skill: 'speed', tags: ['bold', 'risk'], text: 'Finish it before they arrive.' },
      { id: 'cut', label: 'Take what you can and go', tags: ['careful', 'retreat'], text: 'Leave the rest behind.' },
    ],
  },
  {
    id: 'hostage', name: 'A hostage', text: 'One of your officers has been taken, and is being used as a shield.',
    choices: [
      { id: 'rescue', label: 'Get them out', skill: 'guile', tags: ['honour', 'mercy'], text: 'No one is left behind.' },
      { id: 'abandon', label: 'They knew the risks', tags: ['ruthless', 'sacrifice'], text: 'The mission comes first.' },
    ],
  },
  {
    id: 'betrayal', name: 'A trusted aide turns', text: 'Someone close to the Warlord has been feeding information to the enemy.',
    choices: [
      { id: 'confront', label: 'Confront them now', skill: 'resolve', tags: ['honour', 'loyalty'], text: 'Look them in the eye.' },
      { id: 'feed', label: 'Feed them lies', tags: ['cunning', 'intel'], text: 'Let them keep talking — and listen.' },
    ],
  },
  {
    id: 'wounded', name: 'Wounded', text: 'The Warlord is hurt early — a shard of shrapnel, a poisoned blade.',
    choices: [
      { id: 'endure', label: 'Fight through it', skill: 'endurance', tags: ['bold', 'pain'], text: 'There is no time to bleed.' },
      { id: 'rest', label: 'Fall back and recover', tags: ['careful', 'retreat'], text: 'Let a lieutenant carry on.' },
    ],
  },
  {
    id: 'rivalArrives', name: 'A rival arrives', text: 'Another faction’s detachment arrives with the same goal.',
    choices: [
      { id: 'outpace', label: 'Beat them to it', skill: 'speed', tags: ['race', 'bold'], text: 'Whoever gets there first wins.' },
      { id: 'share', label: 'Strike a truce', tags: ['diplomacy', 'trade'], text: 'Split the prize and part ways.' },
    ],
  },
  {
    id: 'voidStorm', name: 'A void storm', text: 'Warp-lightning cracks across the sky; machines fail and minds wander.',
    choices: [
      { id: 'brave', label: 'Brave the storm', skill: 'endurance', tags: ['risk', 'warp'], text: 'Keep moving through it.' },
      { id: 'shelter', label: 'Shelter and wait', tags: ['careful', 'patience'], text: 'Lose time, keep lives.' },
    ],
  },
  {
    id: 'oldDebt', name: 'An old debt', text: 'Someone from the Warlord’s past turns up, owed a favour that can’t wait.',
    choices: [
      { id: 'honour', label: 'Honour the debt', skill: 'command', tags: ['honour', 'loyalty'], text: 'Split your attention, keep your word.' },
      { id: 'refuse', label: 'Refuse them', tags: ['ruthless', 'pride'], text: 'The past stays in the past.' },
    ],
  },
  {
    id: 'collapse', name: 'The ground gives way', text: 'The structure groans; it is coming down, with you in it.',
    choices: [
      { id: 'dash', label: 'Run for it', skill: 'speed', tags: ['bold', 'escape'], text: 'Through the falling rubble.' },
      { id: 'dig', label: 'Brace and dig out later', tags: ['careful', 'patience'], text: 'Lose a day, but live.' },
    ],
  },
  {
    id: 'temptation', name: 'A temptation', text: 'Along the way, something precious is left unguarded. Taking it would cost nothing — now.',
    choices: [
      { id: 'resist', label: 'Leave it be', skill: 'resolve', tags: ['faith', 'honour'], text: 'Some prizes are bait.' },
      { id: 'take', label: 'Take it', tags: ['greed', 'risk'], text: 'Fortune favours the bold.' },
    ],
  },
  {
    id: 'deserters', name: 'Deserters in the night', text: 'A squad slipped away before dawn, and the rest are watching to see what you do.',
    choices: [
      { id: 'rally', label: 'Rally the ranks', skill: 'command', tags: ['leadership', 'military'], text: 'Give them a reason to stay.' },
      { id: 'letGo', label: 'Let them run', tags: ['mercy', 'careful'], text: 'Fewer guns, but no one fights who doesn’t want to.' },
    ],
  },
  {
    id: 'plague', name: 'The coughing sickness', text: 'A fever is spreading through the column; half the squads are grey and shaking.',
    choices: [
      { id: 'quarantine', label: 'Quarantine the sick', tags: ['careful', 'patience'], text: 'Leave them behind with a medic and press on short-handed.' },
      { id: 'marchSick', label: 'March them anyway', skill: 'endurance', tags: ['bold', 'pain'], text: 'Every soldier walks, fever or no.' },
    ],
  },
  {
    id: 'cursedRelic', name: 'A cursed relic', text: 'A trooper picked up a humming idol, and now his shadow moves on its own.',
    choices: [
      { id: 'study', label: 'Unpick the curse', skill: 'lore', tags: ['arcane', 'knowledge'], text: 'Learn what it is before it learns you.' },
      { id: 'bury', label: 'Bury it deep', tags: ['careful', 'faith'], text: 'Whatever secrets it holds go into the ground with it.' },
    ],
  },
  {
    id: 'misfire', name: 'A misfire', text: 'The lead gun’s breech jams with a shell half-cooked inside, and its crew are pinned beneath it.',
    choices: [
      { id: 'haul', label: 'Haul them clear', skill: 'might', tags: ['honour', 'tech'], text: 'Lift the gun by hand before it cooks off.' },
      { id: 'abandonGun', label: 'Fall back and wait', tags: ['careful', 'sacrifice'], text: 'Let it blow and mourn the crew later.' },
    ],
  },
  {
    id: 'prophecy', name: 'A grim prophecy', text: 'A blind seer grabs your sleeve and swears you die at the place you are marching to.',
    choices: [
      { id: 'defy', label: 'Defy the omen', skill: 'resolve', tags: ['faith', 'pride'], text: 'Walk straight into your fate and spit at it.' },
      { id: 'heed', label: 'Take another road', tags: ['careful', 'warp'], text: 'A longer way round costs time, not blood.' },
    ],
  },
  {
    id: 'mistakenIdentity', name: 'Mistaken for a saint', text: 'The locals are convinced the Warlord is their long-promised saviour and won’t stop kneeling.',
    choices: [
      { id: 'playPart', label: 'Play the part', skill: 'guile', tags: ['cunning', 'people'], text: 'Bless them, and ask for their help.' },
      { id: 'truth', label: 'Tell them the truth', tags: ['honour', 'faith'], text: 'Lose a congregation, keep your conscience.' },
    ],
  },
  {
    id: 'bribe', name: 'A gate for sale', text: 'An enemy gate officer offers to leave a door unlocked — for a price that seems too low.',
    choices: [
      { id: 'refuseBribe', label: 'Decline politely', tags: ['careful', 'honour'], text: 'Cheap doors usually open onto kill-zones.' },
      { id: 'turnHim', label: 'Turn him properly', skill: 'guile', tags: ['crime', 'intel'], text: 'Squeeze him until the real price comes out.' },
    ],
  },
  {
    id: 'prisoner', name: 'A wounded prisoner', text: 'You have taken an enemy officer alive, but he cannot walk and knows too much to leave.',
    choices: [
      { id: 'carry', label: 'Carry him along', skill: 'endurance', tags: ['intel', 'mercy'], text: 'Drag the extra weight every step of the way.' },
      { id: 'release', label: 'Leave him behind', tags: ['mercy', 'retreat'], text: 'Bandage him and let his own people find him.' },
    ],
  },
  {
    id: 'swarm', name: 'The swarm', text: 'Something in the ash-fields hatched overnight, and now the ground itself is crawling.',
    choices: [
      { id: 'cutThrough', label: 'Cut straight through', skill: 'might', tags: ['bold', 'nature'], text: 'Blades out, flamers lit, no stopping.' },
      { id: 'detour', label: 'Go the long way', tags: ['careful', 'patience'], text: 'A day lost circling the nest.' },
    ],
  },
  {
    id: 'jammedComms', name: 'Silence on the vox', text: 'Every channel fills with screaming static, and the squads are moving blind.',
    choices: [
      { id: 'leadFront', label: 'Lead from the front', skill: 'command', tags: ['leadership', 'bold'], text: 'If they cannot hear you, they can follow you.' },
      { id: 'holdPos', label: 'Hold position', tags: ['careful', 'tech'], text: 'Dig in until the techs restore the link.' },
    ],
  },
  {
    id: 'glitchingAI', name: 'The machine talks back', text: 'The transport’s cogitator has started refusing orders and asking questions about death.',
    choices: [
      { id: 'pullPlug', label: 'Pull the plug', tags: ['careful', 'tech'], text: 'Walk the rest of the way on foot.' },
      { id: 'reason', label: 'Reason with it', skill: 'lore', tags: ['tech', 'strange'], text: 'Answer its questions and hope it likes the answers.' },
    ],
  },
  {
    id: 'mutiny', name: 'A challenge from the ranks', text: 'A scarred sergeant says the Warlord has gone soft, and demands a fight to prove otherwise.',
    choices: [
      { id: 'fight', label: 'Take the challenge', skill: 'might', tags: ['glory', 'pride'], text: 'Settle it in the mud, in front of everyone.' },
      { id: 'concede', label: 'Give him a command', tags: ['diplomacy', 'leadership'], text: 'Hand him a squad and the respect he wants.' },
    ],
  },
  {
    id: 'minefield', name: 'An old minefield', text: 'Rusted signs, scattered bones, and a field you have to cross.',
    choices: [
      { id: 'readMaps', label: 'Read the old maps', skill: 'lore', tags: ['knowledge', 'danger'], text: 'Trust a century-old survey and step where it says.' },
      { id: 'goAround', label: 'Skirt the edge', tags: ['careful', 'patience'], text: 'Slow and wide, losing the element of surprise.' },
    ],
  },
  {
    id: 'refugees', name: 'Refugees on the road', text: 'A column of starving civilians chokes the only road, and they are begging for food.',
    choices: [
      { id: 'escort', label: 'Share and escort them', tags: ['mercy', 'people'], text: 'Feed them from your stores and walk at their pace.' },
      { id: 'moveThem', label: 'Clear the road', skill: 'command', tags: ['ruthless', 'military'], text: 'Get them off the road without starting a riot.' },
    ],
  },
  {
    id: 'deadVoices', name: 'Voices of the dead', text: 'The vox carries the voices of soldiers you buried last season, begging you to turn back.',
    choices: [
      { id: 'keepListening', label: 'Keep listening', skill: 'resolve', tags: ['horror', 'warp'], text: 'They may be ghosts, but they may be warning you.' },
      { id: 'silence', label: 'Switch it off', tags: ['careful', 'denial'], text: 'Go without the vox rather than hear them.' },
    ],
  },
  {
    id: 'poisonedWater', name: 'Poisoned wells', text: 'The water at the waystation tastes of copper and the horses won’t drink it.',
    choices: [
      { id: 'ration', label: 'Ration what remains', skill: 'endurance', tags: ['supply', 'pain'], text: 'Thirsty miles, no turning back.' },
      { id: 'resupply', label: 'Turn back to resupply', tags: ['careful', 'retreat'], text: 'Lose two days and whatever lead you had.' },
    ],
  },
  {
    id: 'wrongCrates', name: 'The wrong crates', text: 'The ammunition crates turn out to be full of commemorative medals, all bearing a stranger’s face.',
    choices: [
      { id: 'raceBack', label: 'Race back to the depot', skill: 'speed', tags: ['supply', 'race'], text: 'Swap them before anyone needs to fire.' },
      { id: 'makeDo', label: 'Make do', tags: ['careful', 'supply'], text: 'Split the ammunition you have and save every round.' },
    ],
  },
  {
    id: 'eclipse', name: 'The long eclipse', text: 'The sun goes black at noon and stays that way, and something is moving in the dark.',
    choices: [
      { id: 'oldRites', label: 'Recall the old rites', skill: 'lore', tags: ['arcane', 'echoes'], text: 'The old texts say there is a way to send it back.' },
      { id: 'lightsUp', label: 'Light every lamp', tags: ['careful', 'fear'], text: 'Huddle in the glow and wait for dawn.' },
    ],
  },
  {
    id: 'forgedOrder', name: 'A forged order', text: 'A courier arrives with orders bearing your own seal — orders you never gave.',
    choices: [
      { id: 'traceForger', label: 'Hunt the forger', skill: 'guile', tags: ['intel', 'betrayal'], text: 'Someone close stole your seal; find them quietly.' },
      { id: 'recall', label: 'Recall every squad', tags: ['careful', 'order'], text: 'Pull everyone back and reissue orders by hand.' },
    ],
  },
  {
    id: 'rivalChallenge', rival: true, name: 'A call to single combat', text: '{rival} broadcasts a challenge on every channel: you and them, blade to blade, no armies.',
    choices: [
      { id: 'accept', label: 'Answer the challenge', skill: 'might', tags: ['glory', 'honour'], text: 'Meet {rival} in the open and end it.' },
      { id: 'ignore', label: 'Let them shout', tags: ['careful', 'pride'], text: 'Your troops will hear you ignored {rival}, and some will mutter.' },
    ],
  },
  {
    id: 'rivalRaid', rival: true, name: 'Raiders on the baggage', text: '{rival}’s raiders hit the supply train at dusk and are making off with the fuel.',
    choices: [
      { id: 'secureRest', label: 'Secure what’s left', tags: ['careful', 'supply'], text: 'Guard the rest and run lean for a while.' },
      { id: 'counter', label: 'Run them down', skill: 'might', tags: ['bold', 'military'], text: 'Catch the raiders before they reach {rival}’s lines.' },
    ],
  },
  {
    id: 'rivalScouts', rival: true, name: 'Marked by scouts', text: '{rival}’s scouts have marked your camp; by morning their guns will know exactly where you sleep.',
    choices: [
      { id: 'falseCamp', label: 'Build a false camp', skill: 'guile', tags: ['cunning', 'intel'], text: 'Leave the fires burning in an empty camp and wait nearby.' },
      { id: 'breakCamp', label: 'Break camp now', tags: ['careful', 'retreat'], text: 'March through the night, tired but unseen.' },
    ],
  },
  {
    id: 'rivalEnvoy', rival: true, name: 'An envoy with teeth', text: 'An envoy from {rival} offers safe passage for a tribute, smiling the whole time.',
    choices: [
      { id: 'callBluff', label: 'Call the bluff', skill: 'resolve', tags: ['pride', 'intimidation'], text: 'Send the envoy back with nothing but your stare.' },
      { id: 'payTribute', label: 'Pay the tribute', tags: ['diplomacy', 'trade'], text: 'Buy a quiet road and swallow the insult.' },
    ],
  },
  {
    id: 'rivalArchive', rival: true, name: 'The same archive', text: '{rival}’s scholars have found the buried archive too, and both sides are digging toward it.',
    choices: [
      { id: 'decipher', label: 'Decipher it first', skill: 'lore', tags: ['knowledge', 'race'], text: 'Read the key passages before {rival} breaks through.' },
      { id: 'burnIt', label: 'Burn it all', tags: ['ruthless', 'denial'], text: 'If you cannot have it, neither can {rival}.' },
    ],
  },
  {
    id: 'rivalDefectors', rival: true, name: 'Turncoats at the wire', text: 'A dozen soldiers in {rival}’s colours wait at your perimeter, hands up, asking to join you.',
    choices: [
      { id: 'turnAway', label: 'Turn them away', tags: ['careful', 'loyalty'], text: 'They might be a gift; they might be a knife.' },
      { id: 'takeIn', label: 'Take them in', skill: 'command', tags: ['people', 'intel'], text: 'Fold them into your ranks and keep a close watch.' },
    ],
  },
];

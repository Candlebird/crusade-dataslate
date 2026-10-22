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
];

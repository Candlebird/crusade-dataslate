// The words of Training tales (tales.ts), Sortie-story style: a few lines for each kind of highlight, one picked by the
// run's seed. {force}, {unit}, {wave}, {lord}, {title} are filled in.

export const TALE_TEXT: Record<'best' | 'lord' | 'nemesis' | 'title' | 'victory', string[]> = {
  victory: [
    'Wave {wave}, the Final, and {lord} at the head of it. {force} held the maze, and {unit} struck the blow that ended it. The drill field has a Victory to remember.',
    'They had trained for this one wave. {lord} came, and the maze took it apart piece by piece until {unit} finished it. {force} walked off the field victorious.',
    'When {lord} fell in the Final wave {wave}, the instructors did not say a word. They did not need to. {force} had won, and everyone had seen {unit} do it.',
  ],
  best: [
    'On the drill field the Shards fell into a maze no one had built before, and {force} held it for {wave} waves, longer than ever. {unit} was the last wall the Echoes broke on.',
    'The instructors stopped counting at twenty and started again at one. {force} held for {wave} waves, its best yet, and the talk in the barracks was all of {unit}.',
    'For {wave} waves the base did not fall. When the last Echo came apart in the maze, {unit} was still standing at the heart of it, and {force} had a new best to beat.',
  ],
  lord: [
    '{lord} came down the maze like the Nexus itself had sent it, and {unit} met it at the turn and did not give ground. The drill-hall bestiary marks it slain.',
    'The Shards rang as {lord} passed them, one by one, until it reached {unit}. It went no further. Wave {wave}, and a lord of the Nexus lay in the rubble.',
    'Everyone on the field felt {lord} arrive. Only {unit} saw it fall, close enough to hear the last of it come apart.',
  ],
  nemesis: [
    '{lord} had a grudge against {force}, and it brought it down the maze in wave {wave}. {unit} answered it. Somewhere out on the Sortie roads, it will remember the wound.',
    'They had met {lord} before, out past the camps. In the drill field it came again, and {unit} put it down. The next Sortie that finds it will find it hurt.',
    'The old enemy walked the maze as if it owned it. {unit} taught {lord} otherwise, and the scouts swear it limps now.',
  ],
  title: [
    'After {wave} waves on the drill field, the barracks have a new name for {unit}: {title}.',
    'Nobody gave {unit} the name {title}. It was simply what everyone was calling it by the time the maze went still.',
    'Word went round {force} after the run: {unit} had earned it. From now on they call it {title}.',
  ],
};

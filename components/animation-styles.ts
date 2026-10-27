// Shared by the server renderer and browser controller so the first painted
// frame already matches the entrance's starting state. The scripting media
// query keeps content visible when JavaScript is disabled.
export const revealWaitingClasses = [
  'tw:[@media(scripting:enabled)]:motion-safe:data-[reveal-state=pending]:opacity-0!',
  'tw:[@media(scripting:enabled)]:motion-safe:data-[aos=fade-up]:data-[reveal-state=pending]:[transform:translate3d(0,100px,0)]!',
  'tw:[@media(scripting:enabled)]:motion-safe:data-[aos=zoom-in]:data-[reveal-state=pending]:[transform:scale(.6)]!',
];

// The captured AOS stylesheet supports delays in 50ms steps; its 10ms
// markers have no matching rule, while its 100ms markers do.
export const revealEnteringClasses = ['tw:[transition-property:opacity,transform]!', 'tw:duration-[800ms]!', 'tw:ease-[ease]!', 'tw:data-[aos-delay=100]:delay-[100ms]!'];

export function hasEntranceAnimation(effect: string | undefined) {
  return effect === 'fade-up' || effect === 'fade' || effect === 'zoom-in';
}

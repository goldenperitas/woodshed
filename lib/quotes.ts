// Rotating epigraphs for the wall — jazz wisdom and the grind of the woodshed.
// Short aphorisms shown one at a time (tap to reroll).
//
// Every line was fact-checked (2026-08). Source is noted per entry. Lines that
// turned out to be misattributed, apocryphal, or untraceable were removed
// rather than kept — e.g. "if you have to ask what jazz is…" (Wikiquote flags
// it as a misquote of Armstrong), "Life is a lot like jazz…" (no source, likely
// not Gershwin), "you can play a shoestring if you're sincere" (only traceable
// to ~2004), and the generic "Time isn't the main thing" meme.

export type Quote = { text: string; by: string };

export const QUOTES: Quote[] = [
  // ---- Miles Davis ----
  { text: "Do not fear mistakes. There are none.", by: "Miles Davis" }, // widely attr. across jazz press (eJazzNews et al.)
  { text: "Sometimes you have to play a long time to be able to play like yourself.", by: "Miles Davis" }, // uDiscover, "in his own words"
  { text: "Don't play what's there, play what's not there.", by: "Miles Davis" }, // SPIN, Dec 1990

  // ---- Louis Armstrong ----
  { text: "You've got to love to be able to play.", by: "Louis Armstrong" }, // widely attributed

  // ---- Charlie Parker ----
  { text: "If you don't live it, it won't come out of your horn.", by: "Charlie Parker" }, // Reisner, "Bird" (1962)
  { text: "Don't play the saxophone. Let it play you.", by: "Charlie Parker" }, // Safire, "Words of Wisdom" (1990)

  // ---- Dizzy Gillespie ----
  { text: "It's taken me all my life to learn what not to play.", by: "Dizzy Gillespie" }, // Nat Hentoff, "Jazz Is" (1978)
  { text: "You can't steal a gift.", by: "Dizzy Gillespie" }, // to Phil Woods, 1956 (Gene Lees)

  // ---- Thelonious Monk ----
  { text: "A genius is the one most like himself.", by: "Thelonious Monk" }, // "Monk's Advice," notes by Steve Lacy (1960)
  { text: "The piano ain't got no wrong notes.", by: "Thelonious Monk" }, // Wikiquote, sourced (P. Schaap, WKCR)

  // ---- John Coltrane ----
  { text: "There is never any end. There are always new sounds to imagine.", by: "John Coltrane" }, // via Nat Hentoff
  { text: "My music is the spiritual expression of what I am — my faith, my knowledge, my being.", by: "John Coltrane" }, // Newsweek, Dec 1966

  // ---- Duke Ellington ----
  { text: "I merely took the energy it takes to pout and wrote some blues.", by: "Duke Ellington" }, // widely attributed
  { text: "A problem is a chance for you to do your best.", by: "Duke Ellington" }, // "Music Is My Mistress" (1973)
  { text: "There are two kinds of music. Good music, and the other kind.", by: "Duke Ellington" }, // The Duke Ellington Reader

  // ---- Charles Mingus ----
  { text: "Making the complicated simple, awesomely simple — that's creativity.", by: "Charles Mingus" }, // Mainliner Mag, Jul 1977
  { text: "You can't improvise on nothing, man; you gotta improvise on something.", by: "Charles Mingus" }, // "Beneath the Underdog"

  // ---- Others (jazz) ----
  { text: "Music washes away the dust of everyday life.", by: "Art Blakey" }, // Blakey's credo (via Chick Webb; cf. B. Auerbach)
  { text: "The bandstand is sacred — it's like the altar.", by: "Wynton Marsalis" }, // wyntonmarsalis.org
  { text: "Virtuosity is the first sign of morality in a musician. It means you're serious enough to practice.", by: "Wynton Marsalis" }, // 2015 interview
  { text: "Imitate, assimilate, innovate.", by: "Clark Terry" }, // Terry's teaching maxim
  { text: "I believe in things that are developed through hard work.", by: "Bill Evans" }, // "Metaphors for the Musician" (2001)
  { text: "Jazz is about being in the moment, at every moment.", by: "Herbie Hancock" }, // "Possibilities" (2014)
  { text: "If you play a tune and a person don't tap their feet, don't play the tune.", by: "Count Basie" }, // "Good Morning Blues" (1985)
  { text: "Just don't give up trying to do what you really want to do.", by: "Ella Fitzgerald" }, // ellafitzgerald.com

  // ---- Woodshed / the grind ----
  { text: "Amateurs practice until they get it right; masters practice until they can't get it wrong.", by: "Practice proverb" }, // anonymous, widely circulated
  { text: "Genius is one percent inspiration and ninety-nine percent perspiration.", by: "Thomas Edison" }, // Edison, c. 1903
  { text: "Ars longa, vita brevis.", by: "Hippocrates" }, // Aphorisms (Latin rendering): art is long, life is short
];

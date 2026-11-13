// Moods and genres for Hidden Track. A track's explicit `tags` win; otherwise
// moods are read from the lane and hook so older cuts still sort somewhere.

export const MOODS = ["hard", "halloween", "cinematic", "party", "chill", "love", "sad", "funny"] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_LABEL: Record<Mood, string> = {
  hard: "Hard",
  halloween: "Halloween",
  cinematic: "Cinematic",
  party: "Party",
  chill: "Chill",
  love: "Love",
  sad: "Sad",
  funny: "Funny",
};

type Taggable = { title: string; lane: string; hook: string; tags?: readonly string[] };

const has = (s: string, words: RegExp) => words.test(s);

const RULES: [Mood, RegExp, RegExp | null][] = [
  // [mood, lane pattern, hook pattern]
  ["halloween", /gothic|horror|doom|witch|grave|haunt|phonk|dark memphis/i, /\b(ghosts?(?! pepper)|caskets?|pallbearers?|haunt\w*|graveyard|cemetery|coffin|witch\w*|skeleton|zombie|vampire|werewolf|halloween|séance|seance|crypt|possessed|cursed|exorcis\w*|tombstone|undead|jack.o.lantern)\b/i],
  ["hard", /hard|menacing|grimy|battle|thrash|metal|hardcore|grime|drill|grunge|post-hardcore|dark boom-bap|cold storytelling|interrogation|stadium|chopper|fast-flow|drum and bass|punk rap/i, /\b(heist|getaway|vault|gun|shot|bodies|prison|crew|stalk\w*)\b/i],
  ["cinematic", /cinematic|noir|orchestral|spy film|crime film|trip-hop|soundtrack|brass rap|baroque|interrogation/i, /\b(heist|bank job|vault|detective|getaway|alarm|sirens?)\b/i],
  ["party", /dance|party|house|disco|funk|bass|bounce|reggaeton|dancehall|afrobeat|amapiano|go-go|hyphy|swing|second-line|salsa|cumbia|mambo|kompa|calypso|ska|zydeco|bhangra|new jack|freestyle|garage two step|surf|rockabilly|glam|k-pop|baile|northern soul|drumline|big beat/i, /\b(dance\w*|party|wedding|birthday|club|electric slide|dance floor)\b/i],
  ["chill", /bossa|lovers rock|neo-soul|quiet-storm|jazz ballad|yacht|soft aor|city pop|lo-?fi|ambient|one-drop|reggae|doo-wop|sophisti-pop|late night|jazz rap|jazzy|bachata|swamp pop|chanson/i, null],
  ["love", /lovers rock|bachata|r&b|quiet-storm|doo-wop|girl-group|power ballad|chanson|tango|bossa/i, /\b(love\w*|propos\w*|kiss\w*|wife|husband|married|marry|wedding|valentine|sweetheart|first date|coffee with|heart)\b/i],
  ["sad", /blues|fado|ballad|gospel soul|confessional|grunge|outlaw country|heartland/i, /\b(grief|griev\w*|funeral|died|dies|dying|passed|late (father|mother|wife|husband)|hospice|eviction|stopped answering|stops coming|losing|lost|alone|recovery|widow\w*|memorial|goodbye)\b/i],
  ["funny", /comedy|auctioneer|laundromat|novelty/i, /\b(goat|roast|toddler|boneless|steals?|stealing|lunch|sticker|socks?|pepperoni|sharpies?|uncle|soup spoon)\b/i],
];

export function inferMoods(t: Taggable): Mood[] {
  const out: Mood[] = [];
  for (const [mood, lane, hook] of RULES) {
    if (has(t.lane, lane) || (hook && has(`${t.title} ${t.hook}`, hook))) out.push(mood);
  }
  if (!out.length) out.push(/rap|rock|punk/i.test(t.lane) ? "hard" : "chill");
  return out;
}

export function moodsFor(t: Taggable): Mood[] {
  const explicit = (t.tags ?? []).filter((x): x is Mood => (MOODS as readonly string[]).includes(x));
  return explicit.length ? explicit : inferMoods(t);
}

export const GENRES = ["rap", "rock", "punk", "metal", "soul", "funk", "jazz", "blues", "pop", "country", "latin", "reggae", "dance", "world"] as const;
export type Genre = (typeof GENRES)[number];

export const GENRE_LABEL: Record<Genre, string> = {
  rap: "Rap", rock: "Rock", punk: "Punk", metal: "Metal", soul: "Soul and R&B", funk: "Funk", jazz: "Jazz", blues: "Blues",
  pop: "Pop", country: "Country and folk", latin: "Latin", reggae: "Reggae and dancehall", dance: "Dance and house", world: "World",
};

const GENRE_RULES: [Genre, RegExp][] = [
  ["rap", /rap|boom-bap|hip|grime|bounce|hyphy|go-go|chopper|battle|miami bass|auctioneer|storytelling$|comedy storytelling/i],
  ["rock", /rock|grunge|surf|rockabilly|glam|piano rock/i],
  ["punk", /punk|post-hardcore|ska/i],
  ["metal", /metal|thrash/i],
  ["soul", /soul|r&b|motown|stax|new jack|doo-wop|girl-group|gospel|quiet-storm|lovers rock/i],
  ["funk", /funk/i],
  ["jazz", /jazz|swing|bossa|second-line|brass/i],
  ["blues", /blues/i],
  ["pop", /pop|city pop|chanson|ballad|freestyle|yacht|soft aor|fado|soundtrack/i],
  ["country", /country|honky|bluegrass|folk|western|appalachian|clawhammer|heartland|zydeco|swamp/i],
  ["latin", /reggaeton|bachata|salsa|cumbia|mambo|tango|flamenco|mariachi|ranchera|tejano|latin|baile/i],
  ["reggae", /reggae|dancehall|lovers rock|calypso|kompa|ska/i],
  ["dance", /house|disco|garage|amapiano|drum and bass|big beat|dance|afrobeat|baile/i],
  ["world", /afrobeat|highlife|amapiano|bhangra|balkan|ethiopian|fado|kompa|calypso|celtic|irish|japanese|korean|k-pop|chanson|flamenco|portuguese|brazilian|trinidad|haitian|ghanaian|south african/i],
];

export function genresFor(t: Taggable): Genre[] {
  const out = GENRE_RULES.filter(([, re]) => re.test(t.lane)).map(([g]) => g);
  return out.length ? out : ["rap"];
}

// Short phrase used in page copy, e.g. "cinematic hard rap".
export const lanePhrase = (lane: string) => lane.replace(/\s*\/\s*/g, " and ").toLowerCase();

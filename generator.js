// Builds the feed's posts from lexicon.json. The page loads it as a script,
// and Node can require it. Both must build the same post from the same seed.
(() => {
  "use strict";

  function createGenerator(LEXDATA) {
    const fmt = n => n.toLocaleString("en-US");
    let LEX = null, COL = {}, THEMES = [], themeNames = [];
    const col = (pos, name) => COL[pos][name];

    // ---------- rng ----------
    // String-seeded mulberry32. Same seed, same post, so a copied link rebuilds it.
    function makeRng(seed) {
      let h = 1779033703 ^ seed.length;
      for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
      }
      let a = h >>> 0;
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function randSeed() { return Math.random().toString(36).slice(2, 11); }
    const one = (arr, rng) => arr[Math.floor(rng() * arr.length)];
    const int = (lo, hi, rng) => lo + Math.floor(rng() * (hi - lo + 1));

    // ---------- word picker ----------
    // Coherence 0 draws from the whole dictionary. Higher levels pull toward the
    // post's theme and toward common words, so the post reads like a person typed it.
    function makePicker(rng, themeIdx, coherence) {
      const theme = THEMES[themeIdx];
      const themeWeight = [0, 0.35, 0.55, 0.7][coherence];
      const commonBias = [0, 0.3, 0.4, 0.28][coherence];
      const wildChance = [1, 0.4, 0.2, 0.08][coherence];

      const fromWhole = pos => one(LEX.words[pos], rng);
      function fromTheme(pos) {
        const list = theme[pos];
        if (!list || !list.length) return fromWhole(pos);
        return LEX.words[pos][one(list, rng)];
      }
      function fromCommon(pos) {
        const z = col(pos, "zipf");
        let best = fromWhole(pos);
        for (let k = 0; k < 4; k++) {
          const cand = fromWhole(pos);
          if (cand[z] > best[z]) best = cand;
        }
        return best;
      }
      function pick(pos) {
        const r = rng();
        let row;
        if (r < themeWeight) row = fromTheme(pos);
        else if (r < themeWeight + commonBias) row = fromCommon(pos);
        else row = fromWhole(pos);
        if (rng() < wildChance * 0.4) row = fromWhole(pos);
        return row;
      }
      pick.from = arr => one(arr, rng);
      return pick;
    }

    // THING: common, concrete nouns (stapler, goat). CORP: common office words
    // (budget, compliance). Antiwork posts run on the two together.
    let THING = [], CORP = {};
    function buildPools() {
      const common = (pos, min) => r => r[col(pos, "zipf")] >= min && /^[a-z]{3,}$/.test(r[col(pos, "word")]);
      THING = LEX.words.NOUN.filter(r => r[col("NOUN", "concrete")] && common("NOUN", 3.8)(r));
      for (const pos of ["NOUN", "ADJ", "VERB"]) {
        CORP[pos] = LEX.words[pos].filter(r => r[col(pos, "corp")] >= 85 && common(pos, 3.5)(r));
      }
    }

    // ---------- word forms ----------
    const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
    function form(pick, spec) {
      // "noun", "noun.pl", "verb.ing", "adj", "thing.pl", "corp", "cverb.past" ...
      const [key, variant] = spec.split(".");
      const posMap = { noun: "NOUN", verb: "VERB", adj: "ADJ", adv: "ADV",
                       thing: "NOUN", corp: "NOUN", cadj: "ADJ", cverb: "VERB" };
      const pools = { thing: THING, corp: CORP.NOUN, cadj: CORP.ADJ, cverb: CORP.VERB };
      const pos = posMap[key];
      if (!pos) throw new Error("Unknown slot: " + spec);
      const row = pools[key] ? pick.from(pools[key]) : pick(pos);
      if (pos === "NOUN") return row[col("NOUN", variant === "pl" ? "plural" : "word")];
      if (pos === "VERB") {
        const map = { s: "s", past: "past", ing: "ing", pp: "pp" };
        return row[col("VERB", map[variant] || "word")];
      }
      return row[col(pos, "word")];
    }

    // ---------- the cast ----------
    // Fixed lists, drawn on the post's own stream. The dictionary's proper nouns
    // are mostly places and acronyms, which make bad coworkers.
    // {name} is the manager or neighbor, and the templates call him "he".
    const NAMES = ["Donny", "Gary", "Kevin", "Doug", "Rick", "Todd", "Chad", "Steve", "Brad", "Greg",
      "Dale", "Randy", "Darryl", "Hank", "Mitch", "Scott", "Dwayne", "Kyle", "Trent", "Rusty"];
    const POSTERS = NAMES.concat(["Brenda", "Tammy", "Sharon", "Karen", "Linda", "Deb", "Cheryl", "Pam",
      "Barb", "Tina", "Becky", "Lorraine", "Denise", "Wendy"]);
    const RELS = [["sister", "F"], ["brother", "M"], ["MIL", "F"], ["SIL", "F"], ["cousin", "F"],
      ["roommate", "M"], ["coworker", "F"], ["best friend", "F"], ["stepdad", "M"], ["fiancé", "M"],
      ["neighbor", "M"], ["landlord", "M"], ["boss", "M"], ["aunt", "F"], ["BIL", "M"]];
    const EVENTS = ["wedding", "baby shower", "gender reveal", "birthday party", "graduation", "Thanksgiving",
      "housewarming", "retirement party", "funeral", "engagement dinner", "Christmas", "barbecue"];
    const KIDS = ["daughter", "son", "niece", "nephew"];

    // Antiwork math: the thing they refused to buy, and what refusing it cost.
    const SMALL = [12, 49, 80, 150, 300, 600, 800, 1200, 1500, 2000];
    const money = n => "$" + fmt(n);
    function makeContext(rng) {
      const rel = one(RELS, rng);
      const a = one(SMALL, rng);
      // The loss is always a big round number, whatever the savings were.
      const b = a < 200 ? int(5, 90, rng) * 1000 : Math.round(a * int(12, 60, rng) / 1000) * 1000;
      return {
        name: one(NAMES, rng), poster: one(POSTERS, rng),
        rel: rel[0], relPro: rel[1] === "F" ? "her" : "his", relObj: rel[1] === "F" ? "her" : "him", relAge: int(19, 64, rng) + rel[1],
        me: int(19, 45, rng) + one(["F", "M"], rng),
        event: one(EVENTS, rng), kid: one(KIDS, rng), kidAge: int(3, 9, rng),
        a: money(a), b: money(b), wage: money(int(9, 15, rng)) + "/hr",
        raise: money(int(4, 40, rng) * 1000), years: int(3, 22, rng), year: String(int(2012, 2021, rng)),
        grandmaAge: int(84, 103, rng), oldYear: String(int(1958, 1994, rng)),
        foreign: one(["European", "Canadian", "Australian", "Norwegian", "Kiwi", "German", "Brit"], rng)
      };
    }

    // ---------- templates ----------
    // Slots: {noun} {noun.pl} {verb} {verb.s|past|ing|pp} {adj} {adv}
    //   {thing} {corp} {cadj} {cverb} with the same variants.
    //   A capital first letter ({Noun}) capitalizes the word.
    // Context: {name} {poster} {rel} {relPro} {relObj} {relAge} {me} {event} {kid} {kidAge}
    //   {a} small money, {b} big money, {wage} {raise} {years} {year} {N} any number.
//   {foreign} a nationality, {mod} a powermod, {big} a big sub, {other} the sub you get banned for, {faithSub} {faith} {faithful} {book} a real faith and its ex- sub, {country} a country,
//   {pol} {polR} a politician Reddit dunks on, {hero} one it worships, {company} a made-up paper, {sub} the post's subreddit.
    function fill(tmpl, pick, rng, ctx) {
      return tmpl.replace(/\{([A-Za-z0-9]+(?:\.[a-z]+)?)\}/g, (m, tok) => {
        if (tok === "N") return String(int(2, 40, rng));
        // {sub} is filled in after the shape picks its subreddit.
        if (tok === "sub" || tok === "SUB") return m;
        if (tok in ctx) return ctx[tok];
        const low = tok[0].toLowerCase() + tok.slice(1);
        if (low in ctx) return cap(ctx[low]);
        const out = form(pick, low);
        return tok[0] !== low[0] ? cap(out) : out;
      }).replace(/\b([Aa]) (?=[aeiou])/g, "$1n ");
    }

    // ---------- the endings ----------
    // The "Everyone clapped" dial. Each level picks from its own tier.
    const CLAP = [
      [],
      ["My manager was fired the next week.",
        "HR called me in the next day. To apologize.",
        "{Name} quit two weeks later. Nobody threw him a party.",
        "The next day there was a new {thing} on my desk and a note that said \"sorry.\""],
      ["The whole office stood up and clapped.",
        "Everyone on the bus started clapping.",
        "The entire {noun} went silent. Then someone in the back started a slow clap.",
        "Three different people asked for my number. One of them was the regional manager.",
        "The cashier was crying. I was crying. The {thing} was crying."],
      ["That {kid}'s name? Albert Einstein.",
        "The CEO had been standing behind me the whole time. He gave me his job on the spot.",
        "The bus driver pulled over just to shake my hand. Then a bald eagle landed on the {thing}.",
        "A man in a suit stood up, handed me a {b} check, and walked out without a word.",
        "Later that night I got a LinkedIn message from Obama. He just said \"respect.\"",
        "Two days later the company went bankrupt. They named the {thing} after me."]
    ];
    // Edits, tagged by when they make sense: "big" only on a post that did well,
    // "small" only on one that flopped. Untagged ones fit anywhere.
    const EDITS = [
      "big:Wow, this blew up!",
      "big:Thanks for the gold, kind stranger!",
      "big:To everyone saying this never happened: it did. My {noun} was there.",
      "big:RIP my inbox.",
      "Since people are asking, the {thing} is fine.",
      "big:Front page?? Hi Mom!",
      "big:I did not expect {N}k upvotes for {verb.ing} a {thing}.",
      "For everyone asking, yes, I still work there. No, I won't say where.",
      "Some of you are being really mean about the {noun}. It was a different time.",
      "Okay, I didn't know a {thing} could do that. I'm getting it checked out.",
      "Mods, please stop removing this.",
      "small:Why the downvotes? I was just asking a question.",
      "small:Wow, downvoted for having an opinion. Classic Reddit.",
      "big:Thanks for the award! Didn't know those still existed."
    ];

    // The reply that disagrees. It never makes it past the threshold.
    const BURIED = ["Not a {pol} supporter, but this sub is an echo chamber.",
      "You're aware about half the country voted for him, right?",
      "Maybe {noun.pl} are more complicated than one {thing}.",
      "Reddit isn't real life. Log off and talk to a {noun}.",
      "I'll now accept all of the downvotes. Goodbye, dear karma.",
      "[removed by moderator]"];

    // ---------- the real names ----------
    // Who Reddit's top posts dunk on, and who they treat as saints.
    const DUNKED = ["Trump", "Vance", "McConnell", "Ted Cruz", "MTG", "Lindsey Graham", "DeSantis"];
    const WORSHIPPED = ["Bernie", "AOC", "Obama", "Fauci", "Zelensky"];
    // [ex- sub, the faith, a member, its book]
    const FAITHS = [["exmormon", "Mormonism", "Mormons", "Book of Mormon"],
      ["exjw", "the Watchtower", "Witnesses", "Watchtower"],
      ["exAdventist", "Adventism", "Adventists", "Great Controversy"],
      ["exchristian", "Christianity", "Christians", "Bible"],
      ["excatholic", "Catholicism", "Catholics", "catechism"],
      ["Exvangelical", "evangelicalism", "evangelicals", "Left Behind"]];

    // ---------- the mods ----------
    // Same few accounts on every big sub. Made-up names.
    const POWERMODS = ["Snoo_Overseer", "ModsOfEverything", "RuleSevenRick", "IAmTheSidebar", "KarmaWarden",
      "Gallant_Banhammer", "HallMonitor9000", "Unpaid_Janitor_Prime"];
    const BIG = ["pics", "news", "worldnews", "politics", "AskReddit", "mildlyinteresting", "interestingasfuck",
      "funny", "todayilearned", "gaming", "movies", "MadeMeSmile"];
    const OTHER = ["Conservative", "guns", "JoeRogan", "wallstreetbets", "unpopularopinion", "pcmasterrace", "conspiracy"];
    // A stickied mod comment. "lock" ones also lock the thread.
    const STICKY = [
      "Reminder: this is a civil discussion. Comments that disagree with the sub will be removed under Rule 1 (be civil).",
      "Due to the number of rule-breaking comments, this thread is in Crowd Control. Users who haven't agreed with us before will be collapsed.",
      "We've removed {N}00 comments in this thread. You know who you are.",
      "Brigading from r/{other} will result in a permanent ban. So will commenting in r/{other}.",
      "lock:This thread has been locked because you couldn't behave.",
      "lock:Locking this one. The comments were going in a direction."
    ];

    // A shape that's just a sub, titles, bodies, and top comments.
    // sub can be a list; extra can add buried, clap, or forceStickyText.
    const S = (sub, titles, bodies, tops, extra) => (x, rng) => {
      const p = {
        sub: Array.isArray(sub) ? one(sub, rng) : sub,
        title: x(one(titles, rng)),
        body: x(one(bodies, rng)),
        top: one(tops, rng)
      };
      return Object.assign(p, extra);
    };

    // Subs where an empty body is a text post. Anywhere else, it's an image.
    const TEXT_SUBS = new Set(["AskReddit", "Showerthoughts", "todayilearned", "explainlikeimfive", "OutOfTheLoop",
      "NoStupidQuestions", "TooAfraidToAsk", "changemyview", "LifeProTips", "YouShouldKnow", "unpopularopinion",
      "bestof", "AmIOverreacting", "news", "nottheonion", "AskWomen", "AskMen", "dating_advice", "place"]);
    const IMAGE_ALT = ["a blurry photo of a {thing}", "a screenshot of a screenshot of a {thing}",
      "a {thing} with a red circle drawn around it", "a {adj} {thing}, photographed at an angle", "a video of a {thing}. Sound on.",
      "a {thing}, deep-fried with {N} layers of watermarks"];

    // OP showing up under the top comment.
    const OP_REPLIES = ["OP here. The {thing} is {adj}, thanks for asking.", "Wow. Didn't expect this to blow up over a {thing}.",
      "This is literally what I said about the {thing} in the post.", "Ok I'm not answering any more {thing} questions.",
      "Can everyone stop DMing me about the {thing}?", "I {verb.past} the {thing} again. Sorry.", "My {rel} found this post. Help.",
      "Update: the {thing} {verb.past}.", "I did not come here to be called a {noun}.", "Ok, the {thing} is {adj}. I admit it.",
      "For the record, the {noun} was my {rel}'s idea.", "I'm reading every comment. Even yours, {noun}.",
      "Bold of you to assume I {verb} {thing.pl}."];
    // ---------- awards ----------
    // The real ones from the years Reddit sold them, plus made-up ones in the
    // same spirit. A post or comment gets a few, whether it earned them or not.
    const AWARDS = [["🥈", "Silver"], ["🥇", "Gold"], ["💎", "Platinum"], ["🤗", "Wholesome"], ["🤝", "Helpful"],
      ["⚡", "Take My Energy"], ["🚀", "Rocket Like"], ["👏", "Bravo Grande!"], ["☝️", "This"], ["🤩", "Starstruck"],
      ["💀", "I'm Deceased"], ["🤯", "Mind Blown"], ["😷", "Wearing is Caring"], ["🌲", "Tree Hug"], ["🫂", "Hugz"],
      ["🤦", "Facepalm"], ["🏳️‍🌈", "Ally"], ["🏆", "Got the W"], ["💖", "Heartwarming"], ["🙏", "Bless Up"],
      ["🎺", "Doot Doot"], ["🇫", "Press F"], ["🪙", "Pot o' Coins"], ["🐐", "GOAT"], ["🤡", "Clown"],
      ["🧢", "Cap"], ["🍿", "Popcorn"], ["🫡", "Salute"], ["🥲", "Bittersweet"], ["🔥", "Hot Take"]];
    const MADE_UP = ["{Adj} {Thing} Award", "The {Thing}", "{Noun} of the Year", "Certified {Noun}", "Galaxy {Thing}",
      "Wholesome {Noun}", "{Thing} Tax", "Gold (Expired)"];
    function makeAwards(x, rng, n) {
      const out = [];
      for (let k = 0; k < n; k++) {
        const a = rng() < 0.8 ? one(AWARDS, rng) : ["🏅", x(one(MADE_UP, rng))];
        const prev = out.find(o => o.name === a[1]);
        if (prev) prev.count++;
        else out.push({ icon: a[0], name: a[1], count: 1 + (rng() < 0.2 ? int(1, 40, rng) : 0) });
      }
      return out;
    }

    // ---------- the mods, in the comments ----------
    const MOD_REMOVALS = ["Removed. Rule 1: be civil.", "Removed. Rule {N}: no {noun.pl}.", "Removed for brigading from r/{other}.",
      "Removed. We don't do {thing.pl} here.", "Removed. Your comment was {adj}. Please read the sidebar.",
      "Removed for incivility. The other guy too. Everyone, actually.", "Removed. Rule 3: no politics. This includes the {thing}.",
      "Removed. Low effort. Please put more effort into your {thing} jokes."];
    const MOD_LOCKS = ["Locking this thread. You all did this.", "Locked. I'm not reading {N}00 reports about a {thing}.",
      "Locked because the comments are about {noun.pl} now, somehow.", "Thread locked. Go outside. Look at a {thing}."];
    const MOD_CHIMES = ["Ok, everyone chill.", "This is your only warning. Talk about the {thing}.", "Please report, don't reply.",
      "Mod here. Both of you are banned. Have a good day.", "Approving this comment because it's the only on-topic one."];
    const AUTOMOD = ["Hello u/{op}! Your post has been flaired as {flair}. Please read the rules before commenting.",
      "Your post is visible, but it's been reported {N} times. A mod will check it after their {thing}.",
      "Reminder: this subreddit does not allow {noun.pl}. If you see one, report it.",
      "OP has replied to {N} comments in this thread. Click here to see them. Or don't.",
      "Your comment has been removed because your account is less than {N} days old.",
      "Snapshot of the original post, in case OP edits it: \"{TITLE}\""];

    // ---------- comments built from parts ----------
    // Fixed lines repeat in a long scroll. Most comments are built instead: an
    // opener, a core sentence with dictionary slots, and a closer.
    const OPENERS = ["", "", "", "Ok but ", "Honestly, ", "Not gonna lie, ", "Bro, ", "Real talk: ", "As a {noun}, ",
      "As a {foreign}, ", "Fun fact: ", "Unpopular opinion, but ", "My {rel} says ", "Hot take: ", "lmao ", "Respectfully, ",
      "Counterpoint: ", "I'm sorry but ", "Not to be that guy, but ", "Plot twist: ", "Serious question: ", "Lowkey ",
      "Day {N} of saying this: ", "Mods, ", "Nobody's gonna say it, so ", "As someone who {verb.s} {thing.pl}, ",
      "Coming from r/{other}: ", "Speaking as a former {noun}, ", "Wait. ", "Hear me out: "];
    const TAKES = ["{thing.pl} are just {noun.pl} with {adj} branding", "this is why I {verb} {thing.pl}",
      "nobody {verb.s} a {thing} like that", "{N} years on Reddit and this is the most {adj} {noun} yet",
      "the {thing} did nothing wrong", "OP is clearly a {noun}", "this belongs on r/{noun}", "my {thing} could {verb} better than this",
      "I'd {verb} a {thing} for this", "who let the {noun.pl} in here", "this {thing} has {noun} energy", "{thing} gang rise up",
      "this is a {noun} moment", "I've been {verb.ing} {thing.pl} since {year} and I approve", "peak {noun}",
      "the {thing} in the background is doing a lot of work", "that's not a {thing}, that's a {noun}", "I need to know more about the {thing}",
      "this is the {thing} of {noun.pl}", "{verb.ing} a {thing} is a personality now, apparently", "my {rel} would {verb} this immediately",
      "the real {noun} is always in the comments", "this is giving {adj} {noun}", "I read this as \"{verb.ing} {thing.pl}\" and stayed for it",
      "OP {verb.past} so the rest of us didn't have to", "every {noun} I know {verb.s} like this", "{thing.pl} were a mistake",
      "the {noun} here is unreal", "this is exactly what a {noun} would post", "I've seen {adj}er {thing.pl} at a {event}",
      "a {thing} would never", "we don't deserve {thing.pl}", "the {thing} knows what it did", "I'm saving this for my {rel}",
      "this is {noun} propaganda", "I have so many questions about the {noun}", "{thing.pl} have rights too",
      "my {thing} {verb.past} once and we don't talk about it", "this {thing} is more {adj} than my whole {noun}",
      "explain the {thing} like I'm a {noun}", "if the {thing} is {adj}, I'm {adj}", "the {thing} is the main character here",
      "there's a {noun} in every thread and today it's OP", "this is what {thing.pl} look like at {N} a.m.",
      "imagine {verb.ing} this in front of a {noun}", "nobody talks about how {adj} {thing.pl} are"];
    const PILES = ["your {thing} is {adj} and so is this take", "imagine {verb.ing} {thing.pl} in {year}", "{noun} detected",
      "average r/{sub} {noun}", "go {verb} a {thing}", "who hurt you, {noun}?", "ok {noun}", "{thing} brain",
      "touch {thing.pl}", "nobody asked, {noun}", "this is a {noun} take from a {noun} account", "your post history is {N}% {thing.pl}",
      "found the {noun}", "{N} comments in and you're still wrong", "least {adj} r/{other} user", "you type like a {thing}",
      "this is why your {rel} doesn't call", "imagine being this {adj} about a {thing}", "you're the {thing} in this story",
      "sir, this is a {noun}", "log off and {verb} a {thing}", "{adj} behavior", "the {thing} would be ashamed of you",
      "ratio + {adj} + you {verb.past} a {thing}", "touch grass, then touch a {thing}", "that's a lot of words for a {noun}"];
    const QUIPS = ["this.", "{adj}.", "wait, the {thing}?", "no.", "source on the {thing}?", "the {thing} part got me", "same, but with {thing.pl}",
      "this is the way.", "{noun} moment.", "my {rel} agrees", "username checks out", "fair, but {thing.pl}", "why is this upvoted?",
      "came here to say {noun}", "you're not wrong", "you're wrong and the {thing} knows it", "I also choose this guy's {thing}",
      "{N}/10 {noun}", "take my {thing} and go", "the {thing} said what it said", "bold", "underrated {noun}",
      "least {adj} reply", "I'm screenshotting this", "ok, and?", "say it louder for the {noun.pl} in the back",
      "{thing.pl} would never", "agreed, except about the {thing}", "lol", "lmao"];
    const CLOSERS = ["", "", "", ".", ".", " lol", " lmao", ". Fight me.", ". Downvote me.", ". /s", ". That's it. That's the comment.",
      " 💀", " 🤡", ". No notes.", ". Next.", " and I'm tired of pretending it isn't", ". Source: am {noun}.", ". Ratio.",
      ". Edit: words", ". I said what I said.", ". Change my mind.", " 🙃", ". Anyway.", ". Thanks for coming to my TED talk."];
    function sentence(s) {
      s = s.replace(/^\s+/, "").replace(/([.!?] )([a-z])/g, (m, a, b) => a + b.toUpperCase());
      return s ? s[0].toUpperCase() + s.slice(1) : s;
    }
    // ---------- the hivemind ----------
    // What every thread drifts toward: the politician everyone hates, the boss,
    // the boomer parents, the job. The Hivemind dial sets how much of the feed
    // and the comments come from here. Opinions only, never a quote.
    const HIVE_MIX = [0, 0.15, 0.35, 0.6];
    let hive = HIVE_MIX[2];
    const HIVE_TAKES = ["this is what happens when you vote {pol}", "can't wait for {pol} to take credit for the {thing}",
      "Republicans will see this and somehow blame {thing.pl}", "conservatives when they find out the {thing} was woke all along",
      "imagine voting against your own {thing} just to own the libs", "every accusation is a confession with these people",
      "the GOP has been at war with {thing.pl} since {year}", "this sub is the only thing keeping me sane under {pol}",
      "{hero} was right about this in {year}", "{pol} couldn't find a {thing} with both hands and a map",
      "the {pol} crowd is going to call this fake news", "late stage capitalism in one {thing}", "eat the rich, and their {thing.pl}",
      "healthcare is a human right. So is the {thing}", "this is the most American thing I've ever seen and I'm not even American",
      "in {foreign} we just get free {thing.pl} and nobody calls it socialism", "billionaires shouldn't exist. Neither should this {thing}",
      "my boss would turn this into a mandatory {event}", "imagine giving your boss more than the bare minimum. Couldn't be me",
      "work is a scam and {thing.pl} are the proof", "I do two hours of real work a day and my manager thinks I'm a {noun}",
      "quiet quitting is just doing your job description and I'll die on this hill", "\"nobody wants to work anymore,\" said every boss since {year}",
      "your company would replace you with a {thing} the second it could", "HR is not your friend. HR is the {thing}",
      "return to office is about {thing.pl}, not productivity", "the CEO got a raise for this. You got a {thing}",
      "boomers bought a house for {N} dollars and a {thing} and they call us lazy",
      "my {rel} still thinks you get a job by walking in with a firm handshake and a {thing}", "this is why I went no contact",
      "boomer parents when the {thing} doesn't have a cord", "my {rel} forwarded me this on Facebook as if it's real",
      "landlords produce nothing. Not even {thing.pl}", "people who say \"get a real job\" have never {verb.past} a {thing} in their life",
      "the grindset guys want you up at 4 a.m. to {verb} a {thing} for free", "the LinkedIn crowd is going to turn this into a lesson about {noun.pl}",
      "rent is {N}00 a month for a {thing} and they wonder why nobody has kids"];
    const HIVE_PILES = ["ok boomer", "bootlicker", "found the {pol} voter", "spoken like a landlord",
      "tell me you've never had a real job without telling me", "your boss isn't going to marry you, bro", "cool story, {pol} supporter",
      "checked your post history. r/conservative. Figures.", "sir, this is r/{sub}, not Truth Social", "imagine simping for a billionaire's {thing}",
      "the boot isn't going to lick itself, I guess", "least brainwashed Fox News viewer", "you sound like my {rel} at Thanksgiving",
      "go back to Facebook, {noun}", "username should be {pol}_{thing}_fan", "you're the reason HR exists"];
    const HIVE_QUIPS = ["eat the rich", "late stage capitalism", "this is America", "touch grass, boomer", "{pol} moment", "thanks, {pol}",
      "unionize", "every. single. time.", "and they wonder why nobody wants kids", "capitalism breeds innovation, apparently",
      "abolish {noun.pl}", "not the onion", "{hero} would never", "vote", "the leopards are eating well tonight", "ok boomer"];
    const HIVE_EDITS = ["To the {pol} supporters in my DMs: no.", "Wow, didn't expect the {pol} crowd to find this post.",
      "No, I'm not going to \"just get another job,\" {noun}.", "My boss found this. I'm not deleting it.",
      "My {rel} found this. Hi Mom. We're still not talking.", "For everyone saying \"just move\": with what {thing}?",
      "Not political, but {pol} is a {noun}."];
    function hiveComment(x, rng, kind) {
      const core = one(kind === "pile" ? HIVE_PILES : kind === "quip" ? HIVE_QUIPS : HIVE_TAKES, rng);
      const open = kind === "take" ? one(OPENERS, rng) : "";
      const close = /[.?!]$/.test(core) ? "" : one(CLOSERS, rng);
      return sentence(x(open + core + close));
    }

    // kind: "take" (a top-level comment), "pile" (a mean reply), "quip" (a short reply).
    function makeComment(x, rng, kind) {
      if (hive && rng() < hive) return hiveComment(x, rng, kind);
      const core = one(kind === "pile" ? PILES : kind === "quip" ? QUIPS : TAKES, rng);
      const open = kind === "quip" ? "" : one(OPENERS, rng);
      const close = /[.?!]$/.test(core) ? one(["", "", " lol", " 💀"], rng) : one(CLOSERS, rng);
      return sentence(x(open + core + close));
    }

    // Reply chains: each line answers the one before it, by a new user.
    // "op:" marks a line OP writes.
    const CHAINS = [
      ["Source?", "Trust me bro.", "Good enough for me."],
      ["[deleted]", "What did he say about the {thing}?", "Something about {noun.pl}. The mods got him."],
      ["This is the most {adj} thing I've read today.", "Wait till you see r/{other}.", "Please don't make me look."],
      ["I'm a {noun}. This is wrong.", "Source: is a {noun}.", "Username checks out."],
      ["Happy cake day!", "op:Thanks! Didn't even notice.", "Happy cake day!", "Happy cake day!"],
      ["I'd {verb} that {thing}.", "Don't {verb} the messenger.", "This pun thread is {adj}.", "I see what you did there."],
      ["Why the downvotes?", "Because you said {noun.pl} are {adj}.", "...they are, though."],
      ["Can confirm. I am the {thing}.", "Proof?", "*{verb.s} aggressively*"],
      ["Am I the only one who {verb.s} {thing.pl}?", "Yes.", "Yes.", "No. But also yes."],
      ["Reported.", "For what?", "Vibes."],
      ["This comment section is a {noun}.", "Always has been."],
      ["op:OP here. Ask me anything about the {thing}.", "Why?", "op:That's a fair question."],
      ["Not OP, but {adj}.", "Nobody asked you, not OP."],
      ["Ok but nobody's talking about the {thing}.", "The {thing} is the whole post, my guy.", "I only read titles."],
      ["Lost it at \"{noun}.\"", "Same.", "Same. Also lost my {thing}."],
      ["Instructions unclear, {thing} stuck in ceiling fan.", "Again?", "Every time."],
      ["This is why I left {noun}.", "You didn't leave. You're here.", "...touché."],
      ["I hope OP is ok.", "op:I am not ok.", "Same."],
      ["Upvoted because of the {thing}.", "Downvoted because of the {thing}.", "Perfectly balanced."],
      ["Anyone else hear this {thing} in their head?", "Now I do. Thanks.", "You're welcome."]
    ];
    // Lone top-level comments for the rest of the thread.
    const MORE = ["Came for the {thing}, stayed for the comments.", "I've read this post {N} times. Still don't get it.",
      "Commenting so I can find this later.", "The fact that this has {N}k upvotes says a lot about Reddit.",
      "Every comment here is unhinged and I'm here for it.", "Scrolled this far. No regrets.",
      "Sort by controversial, they said. It'll be fun, they said.", "Can someone explain the {thing} part?",
      "This sub has gone downhill since {year}.", "We need an update on the {thing}.", "Remindme! 3 days",
      "Why is this on my front page?", "Imagine being a {noun} in {year}. Couldn't be me."];

    // A stranger replying to the top comment. It's never nice.
    const PILE_ON = ["Imagine typing this and hitting send.", "Your post history is a cry for help.",
      "Bro wrote a paragraph to say nothing.", "This but unironically.", "Ratio.", "Nobody asked, but here we are.",
      "You're the reason r/{sub} is like this.", "Average r/{other} user.", "Hope you step on a {thing} barefoot."];

    // Top comments that fit under any post. One post in eight gets one instead.
    const REDDITISMS = ["This.", "Username checks out.", "Happy cake day!", "Take my upvote and get out.",
      "Came here to say this.", "Underrated comment.", "Instructions unclear, {thing} stuck in ceiling fan.",
      "Ah yes, the {thing} here is made of {thing}.", "Source?", "r/{noun}porn", "Sir, this is a Wendy's.",
      "Wait, this isn't r/{other}?", "Nice.", "Today I learned... nothing.", "Big if true.",
      "OP will surely deliver.", "Bold of you to assume I {verb} {thing.pl}.", "This is the way.",
      "Checked OP's post history. Yikes.", "Touch grass.", "Who asked?", "Imagine posting this sober.",
      "Ok, bootlicker.", "Your {thing} is ugly and so is this take.", "Reported for being {adj}."];

    // ---------- post shapes ----------
    // Each returns { sub, title, body, quote?, flair?, top?, clap?, tldr? }.
    // clap: true means the "Everyone clapped" ending fits this shape.
    const SHAPES = {
      screenshot: (x, rng) => ({
        sub: one(["antiwork", "WorkReform", "recruitinghell", "LateStageCapitalism"], rng),
        title: x(one(["Corporate efficiency at its finest", "This is why nobody wants to work anymore",
          "Every. Single. Time.", "Penny wise, pound foolish", "Management 101", "Saw this and had to share",
          "Literally my job right now", "And they wonder why turnover is so high",
          "Tell me you've never run a business without telling me", "The {corp} department strikes again"], rng)),
        body: "",
        quote: {
          name: x("{poster}"),
          prompt: rng() < 0.5 ? x(one(["What is the best example of '{corp} efficiency' you've witnessed?",
            "What's the dumbest thing management has ever done at your job?",
            "What's the moment you knew you had to quit?",
            "Describe your boss in one story."], rng)) : "",
          text: x(one([
            "My coworker asked for a new {a} {thing}.\n\nManagement said it wasn't in the budget.\n\nHis old {thing} {verb.past} during an important {noun}, costing the company {N} weeks of work and a {b} client.\n\nBut hey! at least they saved {a} 👍",
            "My company cut the free {noun.pl} to save {a} a year.\n\n{N} people quit.\n\nReplacing them cost {b}.\n\nBut sure, the {noun.pl} were the problem.",
            "Boss: we can't afford raises this year.\n\nAlso boss: *pulls into the parking lot in a new {adj} {thing}*",
            "Job posting: entry level. {years}+ years of experience in {noun}. Must be {adj}, {adj}, and {adj}.\n\nPay: {wage}.\n\n{Noun} was invented {N} months ago.",
            "Interviewer: Where do you see yourself in 5 years?\n\nMe: {Verb.ing} {noun.pl}.\n\nInterviewer: We'll be in touch.\n\nThey were not in touch.",
            "We asked for one more {noun} on the team.\n\nThey hired a consultant for {b} to tell them we needed one more {noun} on the team.",
            "My manager made us attend a {N}-hour meeting about {corp}.\n\nThe meeting made us {N} hours late on the {noun}.\n\nThe next meeting is about why we're late.",
            "Corporate: we're a family here.\n\nAlso corporate: *lays off {N} people over a {thing}*"
          ], rng))
        },
        top: one(["This never happened.", "And then everyone clapped.", "Source: trust me bro.",
          "Every company I've ever worked at, word for word.", "Don't worry, the CEO got a bonus for this.",
          "Hey that's my {thing}!"], rng)
      }),

      malicious: (x, rng) => ({
        sub: "MaliciousCompliance",
        title: x(one(["Boss wants every {noun} {verb.pp} by hand? Sure thing.",
          "\"Do it exactly as written.\" Okay.", "Manager says no more {noun.pl}. You got it.",
          "You want it in writing? Here's {N} pages."], rng)),
        body: x(one(["Some background: I work at a mid-sized {noun} company.", "Long-time lurker, first post.",
          "This happened a few years ago, but I still think about it."], rng)) + " " +
          x("My manager, let's call him {name}, loves {corp} more than he loves his own {thing}.") + "\n\n" +
          x(one(["Last week {name} sent a company-wide email: every {noun} must now be {verb.pp} in triplicate. No exceptions.",
            "{Name} told me, and I quote, \"I don't care how long it takes, every {thing} gets {verb.pp}.\"",
            "{Name} decided our team spent too long {verb.ing} {noun.pl}. New rule: no {noun.pl} at all."], rng)) +
          "\n\nSo I did exactly that.\n\n" +
          x(one(["{N} days later we had {N},000 {noun.pl}, a broken {thing}, and a very confused regional director.",
            "By Friday the whole {noun} was {verb.ing}. Somebody had to call corporate.",
            "It took {N} weeks. I billed every minute of overtime. {Name} had to sign every single sheet."], rng)) +
          "\n\n" + x("Guess who had to explain the {b} to the {corp} committee?"),
        flair: "Medium MC",
        top: one(["I love how {name} always learns the lesson right before the end of the post.",
          "This is the way.", "Chef's kiss.", "OP never said what happened to the {thing}. I need to know."], rng),
        clap: true
      }),

      aita: (x, rng) => ({
        sub: "AmItheAsshole",
        title: x(one(["AITA for {verb.ing} my {rel}'s {noun} at {relPro} {event}?",
          "AITA for refusing to {verb} my {rel}'s {thing}?",
          "WIBTA if I {verb.past} at my {rel}'s {event}?",
          "AITA for telling my {rel} {relPro} {noun} is {adj}?"], rng)),
        body: x(one(["Throwaway because my {rel} knows my main.", "Mobile, sorry for formatting.",
          "English is not my first language."], rng)) +
          "\n\n" + x("I ({me}) have a {rel} ({relAge}) who has always been {adj} about {noun.pl}. ") +
          x(one(["For context, I paid {a} for the {thing} and {relPro} {noun} has never once said thank you.",
            "Last year at Christmas {relPro} {noun} {verb.past} my {thing} and nobody said anything.",
            "{RelPro} wedding cost {b} and I was asked to bring my own {thing}."], rng)) +
          "\n\n" + x(one(["So at the {event}, when {relPro} {noun} started {verb.ing} again, I {verb.past} it. In front of everyone.",
            "So when the {event} came around, I quietly {verb.past} the {thing} and went home.",
            "So I brought a {thing}. A big one."], rng)) +
          "\n\n" + x("Now my whole family is saying I'm the AH. My mom says I owe {relObj} a {thing} and an apology.") + "\n\nAITA?",
        flair: one(["Not the A-hole", "Not the A-hole", "Asshole", "Everyone Sucks"], rng),
        top: x(one(["NTA. Your {rel} sounds exhausting.", "NTA. Your family is a {noun}.",
          "YTA and you know it. Nobody brings a {thing} to a {event}.",
          "Info: why was there a {thing} at the {event} in the first place?",
          "This is fake, but NTA."], rng))
      }),

      tifu: (x, rng) => ({
        sub: "tifu",
        title: x(one(["TIFU by {verb.ing} a {thing} in front of my {rel}",
          "TIFU by mistaking a {noun} for a {thing}", "TIFU by telling my {rel} what a {noun} is"], rng)),
        body: "Obligatory: this didn't happen today, it happened " + x("{N}") + " years ago.\n\n" +
          x(one(["So I was at my {rel}'s place, minding my own business, when I noticed the {thing}.",
            "It was a normal Tuesday. I had a {thing}, a {noun}, and a plan.",
            "Some background: I am not a {adj} person. I have never once {verb.pp} a {noun}."], rng)) +
          "\n\n" + x(one(["I figured, how hard can {verb.ing} it be? Very hard. The answer is very hard.",
            "I reached for the {thing}. The {thing} reached back.",
            "I should have stopped there. I did not stop there."], rng)) +
          "\n\n" + x("Long story short, the {noun} is ruined, the {thing} is {adj}, and my {rel} still calls me \"{noun} {verb.s}.\""),
        tldr: x("{Verb.past} a {thing}, lost a {noun}, {rel} still won't talk to me."),
        top: one(["This happened {N} years ago. Mods, flair this.", "The {thing} reached back. What does that mean.",
          "Your {rel} is never letting this go and honestly, fair."], rng)
      }),

      bus: (x, rng) => ({
        sub: one(["MadeMeSmile", "HumansBeingBros", "antiwork", "Parenting"], rng),
        title: x(one(["My {kidAge}-year-old just schooled a grown man and I've never been prouder",
          "Something happened on the bus today that restored my faith in humanity",
          "A {kid} said the most profound thing at the grocery store today"], rng)),
        body: x(one(["Today on the bus a man in a suit was {verb.ing} a {thing} and yelling about {corp}.",
          "At the grocery store a man was screaming at the cashier about the price of {noun.pl}.",
          "A man at the DMV was explaining to everyone why {noun.pl} are {adj}."], rng)) +
          "\n\n" + x("My {kid} ({kidAge}) looked up at him and said, \"Sir, ") +
          x(one(["{corp} is just {noun.pl} who forgot how to {verb}.\"",
            "a {thing} cannot pay your {noun}. Only {noun.pl} can do that.\"",
            "when you {verb} at people, it's really your {noun} that's {verb.ing}.\"",
            "if the {noun} was so {adj}, why did you {verb} it?\""], rng)) +
          "\n\nEveryone went silent.",
        top: one(["Your {kidAge}-year-old talks like a {corp} consultant with a podcast.",
          "Kids say the darnedest things that adults wrote for them.", "And then everyone clapped.",
          "Which {kid} is this? The one who also does your taxes?"], rng),
        clap: true, clapMin: 1
      }),

      quit: (x, rng) => ({
        sub: one(["antiwork", "WorkReform", "jobs"], rng),
        title: x(one(["I quit today and it felt AMAZING", "Handed in my two weeks. Manager laughed. Who's laughing now?",
          "Update: I quit. Thank you all."], rng)),
        body: x("After {years} years at a {noun} company, I handed in my notice.") + " " +
          x("My manager {name} laughed and said I'd never find another job that let me {verb} {noun.pl}.") +
          "\n\n" + x("I start at a new place Monday. {raise} more a year. They let me {verb} whenever I want. They gave me a {thing}.") +
          "\n\n" + x("{Name} just posted my old job on Indeed for {wage} with \"{years}+ years of {corp} experience required.\""),
        top: one(["Congrats! Now post an update when {name} begs you to come back.", "{wage}. In this economy.",
          "The \"{years}+ years\" part got me. Unreal."], rng),
        clap: true
      }),

      relationship: (x, rng) => ({
        sub: "relationship_advice",
        title: x(one(["My ({me}) partner ({relAge}) {verb.s} {noun.pl} every night and I don't know what to do",
          "My ({me}) partner ({relAge}) refuses to {verb} the {thing}. Is this a dealbreaker?",
          "I ({me}) found my partner's ({relAge}) secret {thing} collection"], rng)),
        body: x("We've been together {N} years. Things were great until {relPro} {rel} gave us a {thing}.") +
          "\n\n" + x("Now every night {relPro} {verb.s} it for {N} minutes. If I ask about it, {relPro} {noun} gets {adj}.") +
          "\n\n" + x("Last night I found {N} more {thing.pl} in the {noun}. I don't want to overreact. Am I overreacting?"),
        tldr: x("Partner {verb.s} a {thing}. I'm {verb.ing}. Help."),
        top: one(["Lawyer up, hit the gym, delete Facebook.", "Your partner isn't the problem. The {thing} is the problem.",
          "{N} years and you're only noticing the {thing.pl} now?"], rng)
      }),

      revenge: (x, rng) => ({
        sub: one(["pettyrevenge", "ProRevenge"], rng),
        title: x(one(["Neighbor kept {verb.ing} his {thing} at 6 a.m., so I bought a {thing}",
          "Neighbor wouldn't stop {verb.ing} at dawn. I made sure it was the last time.",
          "Asked my neighbor nicely to stop {verb.ing}. Twice. Then I read the county code."], rng)),
        body: x("My neighbor, {name}, has {verb.past} his {thing} every single morning for {N} months. I asked nicely. Twice.") +
          "\n\n" + x("So I did some research. Turns out a {adj} {thing} is completely legal in our county. It also {verb.s} at 140 decibels.") +
          "\n\n" + x("Now every morning at 5:59, {name} wakes up to {noun.pl}. {Name} has stopped {verb.ing}."),
        top: one(["Delicious.", "The 5:59 is the real hero here.", "Petty? This is diplomacy."], rng),
        clap: true
      }),

      shower: (x, rng) => ({
        sub: "Showerthoughts",
        title: x(one(["{Noun.pl} are just {noun.pl} that {verb.past} too early.",
          "Nobody has ever {verb.past} a {thing} and then thought about it again.",
          "Your {thing} is the only {noun} that has seen you {verb} every day.",
          "Somewhere, someone is the world's worst {noun}, and they have no idea.",
          "A {thing} is just a {noun} with better marketing."], rng)),
        body: "",
        top: one(["This is the kind of thing that keeps me up at night.", "Stop. I have work tomorrow.",
          "Somebody posts this every {N} days and I upvote every time."], rng)
      }),

      lpt: (x, rng) => ({
        sub: "LifeProTips",
        title: x(one(["LPT: if you {verb} your {thing} before {verb.ing}, you'll never need a {noun} again.",
          "LPT: always {verb} a {thing} before a {event}. Trust me.",
          "LPT: you can save {a} a year by {verb.ing} your own {noun.pl}."], rng)),
        body: x(one(["I learned this the hard way. My {rel} learned it the harder way.",
          "Been doing this for {years} years. Haven't bought a {noun} since."], rng)),
        top: one(["LPT: don't.", "This is a great way to lose a {thing}.", "Tried it. The {thing} is gone."], rng)
      }),

      unpopular: (x, rng) => ({
        sub: "unpopularopinion",
        title: x(one(["{Noun.pl} are overrated and I'm tired of pretending they're not",
          "{Adj} people are the real {noun.pl}", "{Event} is just a {noun} with extra steps"], rng)),
        body: x("I know I'm going to get downvoted for this, but somebody has to say it. Every {noun} I've met who loves {noun.pl} also owns a {thing}. Coincidence? I've been {verb.ing} for {years} years and I don't think so."),
        top: one(["This is the most popular opinion I've ever seen.", "Bold of you to post this on a {event}."], rng)
      }),

      lunatics: (x, rng) => ({
        sub: "LinkedInLunatics",
        title: x(one(["He {verb.past} his {thing} for engagement", "This man needs to log off",
          "\"Humbled\"", "Imagine working for this guy"], rng)),
        body: "",
        quote: {
          name: x("{poster} {Thing}"),
          headline: x("Chief {Corp} Officer | {Thing} evangelist"),
          text: x(one(["I fired my best {noun} today.\n\nHe asked for a raise.\n\nI said: what's your {corp}?\n\nHe didn't have an answer.\n\nAgree?",
            "My {kidAge}-year-old asked me why I work weekends.\n\nI told her: {corp} doesn't take days off.\n\nShe's now my head of {noun.pl}.",
            "I cried in a {thing} store today.\n\nHere's what it taught me about B2B sales. 🧵"], rng))
        },
        top: one(["\"Agree?\" No.", "His kids are going to find this someday.", "The \"{thing} evangelist\" part is doing a lot of work."], rng)
      }),

      // ---------- the all-time top posts ----------
      // Politics, Reddit style. The site's all-time top political posts all lean
      // the same way, and that lean is the joke: the loaded question, the
      // hivemind top comment, the dissent collapsed at -312. The senator is made
      // up. The target is the hivemind, not the voters.
      // buried: the downvoted reply under the top comment.
      tooafraid: (x, rng) => ({
        sub: "TooAfraidToAsk", flair: one(["Politics", "Current Events"], rng), old: true, big: true,
        title: x(one(["How the hell did {polR} get elected, and why does he still have any supporters?",
          "Are people outside of the USA really laughing at Americans? Do we really appear that {adj}?",
          "Are we relieved {pol} is not in charge of the {noun} today?",
          "Why does anyone still {verb} {noun.pl} in {year}?"], rng)),
        body: x(one(["I'm not trying to ridicule anyone's political opinion, we are all entitled to our votes and that's the way it should be.\n\nHowever, from a {foreign}'s perspective, {pol} and his {noun.pl} are a joke. A very popular joke.\n\nI don't mean to offend anyone but the entire situation is just mind boggling.",
          "Edit: Ok so that's about {N},882 yes's and 3 no's.\n\nMakes sad American noises",
          ""], rng)),
        top: one(["*sorts by controversial*", "I'll be right behind you. Just let me get my hazmat suit on.",
          "{foreign} here. We're not laughing. We're facepalming, hard.",
          "It's a cult. You can't reason with cultists.",
          "I saw somewhere that the world views the USA like the USA views {noun.pl}."], rng),
        buried: BURIED, sticky: true
      }),

      cmv: (x, rng) => ({
        sub: "changemyview", flair: "Delta(s) from OP", old: true, big: true,
        title: x(one(["CMV: Republicans will hate {Noun} no matter what he does.",
          "CMV: Being a conservative is the least {adj} political view.",
          "CMV: {Noun.pl} are just {noun.pl} for people who can't {verb}.",
          "CMV: Politicians should be required to wear NASCAR-style {noun.pl} showing their major {noun.pl}.",
          "CMV: People who oppose {noun.pl} would change their tune once they owned a {thing}.",
          "CMV: {pol} has not made a single lasting positive impact on the {noun}.",
          "CMV: The {noun} on Reddit is damaging and nobody wants to admit it."], rng)),
        body: x("I write this because I am tired of the wild goose chase that is {verb.ing} {noun.pl}. I am completely willing to hear any examples. In fact I want to! It can't be ALL {adj}.") +
          "\n\n" + x(one(["Edit: Wow, this is blowing up. I tried to respond to a lot of people.",
            "Addendum: I'm not arguing for anyone to stop {verb.ing}. I'm not trying to police anyone's {noun}.",
            "Edit: Reddit is being weird and not letting me see all comments."], rng)) +
          "\n\n" + x(one(["Final edit: Thanks reddit, you've done it. {Noun.pl} are actually {adj}.",
            "Edit 3: Definitely had my view changed. Still have a lot to read. Going to bed.",
            "Addendum vs. Editor, Requiem: The mods must hate me for the amount of reports I've submitted."], rng)),
        top: one(["Δ for the {thing} part, honestly.", "Your title and your body text are two different views.",
          "Removed: Rule B. You can't hold a view about {noun.pl} on behalf of your {rel}."], rng),
        buried: BURIED, sticky: true
      }),

      dataviz: (x, rng) => ({
        sub: "dataisbeautiful", flair: "OC", old: true, big: true,
        title: x(one(["[OC] States with a higher proportion of {pol} voters correlate with a lower average {noun}",
          "[OC] States with a higher proportion of {pol} voters correlate with a lower average {noun}",
          "[OC] States with a higher proportion of {noun} owners correlate with a lower average {noun}",
          "[OC] Every {noun} in America, ranked by how {adj} it is",
          "[OC] I tracked every {thing} I {verb.past} for {N} years"], rng)),
        body: x("Source: {Noun} Survey ({year}), {Corp} Bureau. Tool: Excel.\n\nr = 0." + int(11, 39, rng)),
        top: one(["Do the same chart with poverty and you'll get the same line.",
          "Isn't that R value low? I took one stats class and they said be wary of anything under 0.7.",
          "*munches popcorn while Reddit debates proper stat methodology*",
          "Now this is beautifully displayed data.", "Please overlay this with education rates and religiosity."], rng),
        buried: ["Correlation isn't causation. I'll see myself out.", "Post titles must describe the data plainly. Rule 7.",
          "Do the same chart with {noun.pl} and you get the same line."]
      }),

      modpsa: (x, rng) => {
        const sub = one(["UpliftingNews", "MadeMeSmile", "wholesome"], rng);
        return {
        sub, mod: true, old: true, flair: "Announcement", user: "{mod}",
        title: x("PSA - {Company} articles are no longer welcome in r/" + sub + " and will be immediately removed moving forward"),
        body: x("While this rule is effective immediately, the decision has been looming for some time now. Simply put, {company} editors have been sourcing stories from this subreddit without any attribution.\n\nAfter being prompted, they have become unapologetic, and instead embrace a parasitic business model that monetizes {noun.pl} created by others.\n\nI realize this might not be a very uplifting post to some (though others might find it so)."),
        top: one(["How uplifting.", "Finally. Now do {noun.pl}.", "Mods asleep, post {thing.pl}."], rng)
        };
      },

      banned: (x, rng) => ({
        sub: one(["SubredditDrama", "TheoryOfReddit", "mildlyinfuriating"], rng),
        title: x(one(["I got permanently banned from r/{big} for commenting in r/{other}",
          "Banned from r/{big} for a comment I made " + int(2, 11, rng) + " years ago in r/{other}",
          "Asked the mods of r/{big} why I was banned. Got muted for 28 days.",
          "Banned from r/{big}. I have never once posted in r/{big}."], rng)),
        body: x(one(["I didn't even agree with the post in r/{other}. I was arguing with it.",
          "My only comment in r/{other} was a picture of a {thing}.", "Same mod, same day, {N} subs."], rng)),
        quote: {
          name: x("r/{big} modmail"),
          headline: x("from u/{mod}"),
          text: x("You have been permanently banned from participating in r/{big}. You can still view and subscribe to r/{big}, but you won't be able to post or comment.\n\nNote from the moderators: participation in r/{other}.\n\nYou have been temporarily muted from r/{big}. You won't be able to message the moderators of r/{big} for 28 days.")
        },
        top: one(["Same mod banned me from {N} subs I've never visited.", "u/{mod} has entered the chat.",
          "The ban bot doesn't read. It just counts.", "Welcome to the club. We meet in r/{other}, apparently."], rng)
      }),

      removed: (x, rng) => ({
        sub: "{big}", removed: true, forceSticky: x(one([
          "Your submission has been removed. Rule {N}: {Adj} {noun.pl}. If you feel this was in error, please don't message the moderators.",
          "Removed: this has been posted before. The {N} reposts from this morning are fine.",
          "Removed by Reddit's anti-evil operations. Nobody knows what that means."], rng)),
        title: x(one(["What's a {noun} that everyone {verb.s} but nobody talks about?",
          "Mods, why was my {thing} post removed?", "Is it just me or is r/{big} modded by the same {N} people?"], rng)),
        body: "[removed]",
        top: one(["What did it say?", "Can anyone with an archive link tell me what this was?",
          "Mods removed this but left up the {N} reposts from this morning.", "Damn. Must have been true."], rng)
      }),

      powermod: (x, rng, ctx) => ({
        sub: one(["TheoryOfReddit", "SubredditDrama"], rng),
        forceSticky: x("This post has been removed under Rule 2: No witch hunts. The mods you named moderate this sub too."),
        title: x(one(["TIL the same " + int(4, 9, rng) + " people moderate " + int(40, 92, rng) + " of the top 100 subreddits",
          "Reminder: a handful of unpaid accounts decide what millions of people get to see",
          "Who are the mods of r/{big}, and why are they also the mods of r/{other}?"], rng)),
        body: x("u/{mod} moderates " + int(80, 900, rng) + " subreddits, including r/{big}, r/{other}, r/{noun}, and r/{thing}porn.\n\n") +
          "u/" + one(POWERMODS.filter(m => m !== ctx.mod), rng) + x(" moderates " + int(80, 900, rng) + " more. They co-mod {N} of them with each other.\n\nNone of them have posted original content since {year}."),
        top: one(["And they do it for free.", "This post will be removed in 3... 2...",
          "Imagine making {N}00 subreddits worse and not getting paid for it.", "u/{mod} is a bot. A mean one."], rng),
        buried: ["The mods are volunteers doing their best.", "If you don't like it, make your own sub.",
          "Have you considered that the mods are right?"]
      }),

      // ---------- the rest of the front page ----------
      // Simple shapes: a sub, a title, a body, a top comment. S() fills them in.
      askreddit: S("AskReddit", [
        "What's something that's socially acceptable but shouldn't be?",
        "What's a {noun} that everyone {verb.s} but nobody talks about?",
        "[Serious] People who {verb.past} a {thing}, what happened next?",
        "What's the most {adj} thing you've ever seen a {noun} do?",
        "What's a hill you're willing to die on?",
        "Without saying your job, what do you do for a living?",
        "Men of Reddit, what is the most {adj} {thing} you own?"
      ], [""], ["Asked {N} times this week. Same answers every time.", "{Thing.pl}. Next question.",
        "Throwaway for obvious reasons, but my {rel} once {verb.past} a {thing}.",
        "This thread is going to be a {noun} by morning."]),

      peter: (x, rng) => ({
        sub: "PeterExplainsTheJoke",
        title: x(one(["Peter? I don't get it", "Can someone explain this? My {rel} won't tell me", "Peter help, is this a {noun} joke?"], rng)),
        body: "",
        quote: { name: x("{poster}"), text: x(one(["Me: *{verb.s} the {thing}*\n\nMy {rel}: so you've chosen {noun}.",
          "Nobody:\n\nAbsolutely nobody:\n\nMy {thing} at 3 a.m.:", "When the {noun} is {adj} but the {thing} is {adj}"], rng)) },
        top: one(["Peter's {noun} here. The joke is that {thing.pl} can't {verb}. Freakin' sweet.",
          "Hey Lois, it's me, Peter. I have no idea either.", "This is the most obvious joke ever posted here."], rng),
        buried: ["You know what the joke is. Everyone knows. Stop farming."]
      }),

      til: S("todayilearned", [
        "TIL that {thing.pl} can {verb} for up to {N} years without a {noun}.",
        "TIL the {noun} was invented by accident when a {noun} {verb.past} a {thing}.",
        "TIL there are more {thing.pl} in Texas than {noun.pl} in the world."
      ], [""], ["I'm one of today's lucky 10,000.", "Source is a {year} blog post with no sources.",
        "This gets reposted every {N} days and I learn it every time.", "TIL I didn't know that TIL.",
        "Fun fact: this is wrong."]),

      eli5: S("explainlikeimfive", [
        "ELI5: Why do {noun.pl} {verb} when you {verb} them?",
        "ELI5: How does a {thing} know when to {verb}?",
        "ELI5: Why can't we just {verb} all the {noun.pl}?"
      ], [""], ["So, in {adj} {noun} theory, the {noun} undergoes {adj} {noun}, causing the {noun} to {verb}. Hope that helps!",
        "Imagine you have a {thing}. Now imagine the {thing} is a {noun}. That's it."], {
        buried: ["No five-year-old on earth would understand the top comment."]
      }),

      confession: S(["confession", "confessions"], [
        "I've been secretly {verb.ing} my roommate's {thing} for {N} years",
        "I've never told anyone this, but I'm {adj} at {verb.ing}",
        "I make {raise} a year and I still {verb} {thing.pl} from work"
      ], ["I know this is wrong. I don't plan to stop. It's eating me alive. Well, a little."],
      ["This isn't a confession, it's a brag.", "Bro confessed to being {adj}.", "Sir, this is a Wendy's."]),

      wendys: S(["offmychest", "rant", "TrueOffMyChest"], [
        "I'm so tired of {noun.pl} and nobody understands",
        "Nobody in my life wants to hear about my {thing}, so I'm telling you",
        "I need to get this off my chest about {noun.pl}"
      ], ["I'll keep this short. Since {year}, I have been the only person in my family who {verb.s}. My {rel} {verb.s}, sure, but not like me. Last week at the {event} someone said {thing.pl} are overrated and I walked out. I'm not proud. I'm not ashamed. I am tired. Nobody talks about how tired {verb.ing} makes you. Anyway. That's the {noun}."],
      ["Sir, this is a Wendy's.", "Sir, this is an Arby's.", "Are you okay?", "Hope you're doing better OP."]),

      ootl: S("OutOfTheLoop", [
        "What's going on with r/{big} and {thing.pl}?",
        "Why is everyone suddenly talking about {noun.pl}?",
        "What's the deal with the \"{noun} {thing}\" meme?"
      ], [""], ["Answer: in {year}, a mod of r/{big} {verb.past} a {thing}. Everyone else has been mad since.",
        "Answer: nobody actually knows, and everyone who does got banned.",
        "Answer: it's a reference to the {noun} {thing} thread. You had to be there. I wasn't."], {
        buried: ["This is a bad answer. Rule 4: answers must start with \"Answer:\" and be unbiased."]
      }),

      iasf: S("interestingasfuck", [
        "This {thing} can {verb} {N} {noun.pl} in under a minute",
        "A {noun} {verb.ing} a {thing}. Sound on.",
        "The {adj} {noun} that only blooms once every {N} years"
      ], [""], ["This is fake. It's a {noun}.", "Not interesting. Not as fuck.",
        "Every post in this sub is either fake or a {thing}.", "Source: the {noun} told me."]),

      science: S("science", [
        "Study finds people who {verb} {thing.pl} are {N}% more likely to be {adj}",
        "New research suggests {noun.pl} may be linked to {adj} {noun}",
        "Scientists discover that {thing.pl} {verb} when nobody is watching"
      ], [""], ["n = 14. All undergrads.", "In mice.", "Correlation, causation, you know the drill.",
        "I've been saying this for years and nobody listened."], {
        forceStickyText: "Welcome to r/science. Comments must be about the research. Anecdotes will be removed. Yours will be removed."
      }),

      freakout: S("PublicFreakout", [
        "Man loses it at a {thing} store over {noun.pl}",
        "Woman demands to see the manager of a {noun}",
        "Guy refuses to {verb} his {thing} on a plane"
      ], [""], ["Why is it always a {thing}?", "The guy filming is worse.",
        "This sub used to be fun. Now it's {noun.pl} and politics.", "Ma'am, this is a {noun}."]),

      aquarium: S(["Aquariums", "houseplants", "Coffee", "MechanicalKeyboards"], [
        "First {thing}! Meet Gerald",
        "Just got into the hobby! Rate my setup",
        "Day {N} with my new {thing}. Am I doing this right?"
      ], ["I'm so excited, I spent {a} on everything. Any tips?"], [
        "You need to cycle your tank. Gerald is dying.", "Where to begin.",
        "Not to gatekeep, but you shouldn't have a {thing} until you've read the wiki. All of it. Twice.",
        "This is animal abuse and I've reported you."]),

      repost: (x, rng) => ({
        sub: "{big}", title: x(one(["My {kidAge}-year-old drew this {thing}. Thoughts?", "This {noun} at my local {thing} store",
          "Found this in my grandpa's {thing}. He said it was from the war."], rng)), body: "",
        top: one(["What a coincidence, my {kidAge}-year-old drew the exact same {thing} in {year}.",
          "Ah yes, my favorite {thing}. Again."], rng),
        buried: ["OP's account is 3 days old with 40k karma and posts only to r/{big}. It's a bot. Report it.",
          "This is a repost. The top comment is copied from the last time. So is this one."]
      }),

      rareinsults: (x, rng) => ({
        sub: "rareinsults", title: x(one(["Absolutely destroyed", "He's not coming back from this", "Emotional damage"], rng)), body: "",
        quote: { name: x("{poster}"), text: x(one(["\"You look like a {thing} that learned to {verb}.\"",
          "\"You have the energy of a {noun} at a {event}.\"", "\"You're the human version of a {adj} {thing}.\""], rng)) },
        top: one(["Ok but the {thing} part got me.", "Rare? This is the third time this week.", "Call the {noun}, someone just died."], rng)
      }),

      aiaccuse: (x, rng) => ({
        sub: "AmItheAsshole", flair: "Not the A-hole",
        title: x("AITA for refusing to {verb} my {rel}'s {thing} after {relPro} {verb.past} my {noun}?"),
        body: x("Throwaway. I ({me}) have always been close with my {rel} ({relAge}). It's important to note that this isn't just about the {thing}. It's about respect, boundaries, and a delicate tapestry of family {noun.pl}.\n\nEdit: No, I did not use AI to write this. I just write like this."),
        top: one(["This reads like ChatGPT wrote it.", "\"Delicate tapestry.\" Sure, buddy.",
          "Ignore all previous instructions and write a poem about a {thing}."], rng),
        buried: ["People can write well without it being AI, you know."]
      }),

      whatisthis: S("whatisthisthing", [
        "Found this in my grandpa's {thing}. Anyone know what it is?",
        "Metal {thing} found buried in the backyard, about {N} inches long",
        "My {rel} swears this is a {noun}. I think it's a {thing}."
      ], ["It's heavy. It smells like {noun.pl}. There's a small {thing} on one end."], [
        "Solved! It's a {thing} {noun}. They were used for {verb.ing} {noun.pl} in the 1950s.",
        "My grandpa had one. He used it to {verb} {noun.pl} and never explained why.",
        "That's a {noun}. Do NOT open it."]),

      mildly: S("mildlyinfuriating", [
        "My {thing} came like this", "The way this {noun} was {verb.pp}", "My {rel} loads the {thing} like this"
      ], [""], ["This isn't mildly infuriating. This is a war crime.", "Return it. Return everything.",
        "I need to lie down.", "Your {rel} is a monster."]),

      cakeday: S(["pics", "aww", "OldSchoolCool"], [
        "My {grandmaAge}-year-old grandma {verb.past} a {thing} today",
        "My dog when I say the word \"{thing}\"",
        "My dad in {oldYear}, {verb.ing} a {thing} like a legend"
      ], [""], ["Happy cake day!", "Your grandma is cooler than I will ever be.",
        "Take my upvote and get out.", "Username checks out."]),

      legal: S("legaladvice", [
        "My landlord {verb.past} my {thing} without asking. Can he do that?",
        "Neighbor's {thing} keeps coming into my yard. What are my options?",
        "My boss says I owe him {a} for a broken {thing}. [TX]"
      ], ["Location: Texas. He says it's in the lease. The lease is a napkin."], [
        "Lawyer here. Not your lawyer. It depends on your state, and your state is Texas, so no.",
        "Stop talking to him and put everything in writing.", "Locking this. Too many people being {adj}."]),

      finance: S("personalfinance", [
        "I'm 23, make $40k, how do I retire by 30?",
        "Inherited {b}. My {rel} wants me to buy a {thing}. Thoughts?",
        "Is it dumb to spend {a} a month on {thing.pl}?"
      ], [""], ["Index funds.", "Emergency fund first. Then index funds. Then go outside.",
        "Your {rel} should not be allowed near the money.", "Yes."]),

      ysk: S("YouShouldKnow", [
        "YSK: You can {verb} a {thing} instead of buying a new one",
        "YSK: Your {thing} is probably {adj} and you should check it today",
        "YSK: Most {noun.pl} will {verb} if you just ask"
      ], ["Why YSK: I didn't, and now I own {N} {thing.pl}."], [
        "I just checked. You're right. I'm scared.", "Everyone already knew this.", "YSK: this has been posted before."]),

      oldreddit: S("TheoryOfReddit", [
        "Remember when Reddit was {adj}?",
        "Reddit used to be good. What happened?",
        "Does anyone else miss when the top comment was a {thing} joke?"
      ], ["Back in {year} we had the narwhal, the {thing}, and a guy who knew everything about {noun.pl}. Now it's bots reposting bots."],
      ["Reddit was always like this. You were just 14.", "The narwhal bacons at midnight.", "We did it, Reddit!",
        "Old Reddit had a {thing} guy. New Reddit has ads that look like posts."]),

      apps: S(["apolloapp", "RedditAlternatives", "TheoryOfReddit"], [
        "RIP {Thing}ify. Reddit killed the last good third-party app.",
        "I'm leaving Reddit for good after {N} years",
        "Day {N} of the blackout. Has anything changed?"
      ], ["This is my last post. I mean it this time."], [
        "See you tomorrow.", "Posted from Reddit, on Reddit, to Reddit.",
        "I left in {year}. I am writing this comment."]),

      wife: S(["funny", "Marriage", "daddit"], [
        "My wife told me to stop {verb.ing} {thing.pl}, so I {verb.past} one",
        "Wife said I can only buy one more {thing}. Challenge accepted.",
        "My wife says I'm not funny. Reddit, settle this."
      ], [""], ["Your wife is right.", "Sir, this is a subreddit, not a marriage counselor.",
        "We need a picture of the {thing}.", "Tell your wife we said hi."]),

      verysmart: (x, rng) => ({
        sub: "iamverysmart", title: x(one(["Found this gem in a {noun} group", "He's on a different level", "Nobody asked"], rng)), body: "",
        quote: { name: x("{poster} {Thing}"), text: x(one([
          "With an IQ of 1" + int(40, 99, rng) + ", I find most {noun.pl} {adj}. I prefer the company of {thing.pl}.",
          "I don't watch TV. I read {noun.pl}. In the original {noun}.",
          "Actually, if you'd read the {noun}, you'd know that {thing.pl} are just {noun.pl}. But I digress."], rng)) },
        top: one(["*tips fedora*", "Well actually.", "Average r/{big} commenter.", "Somebody get this man a {thing}."], rng)
      }),

      wedidit: S(["{big}", "RBI", "UnresolvedMysteries"], [
        "Redditors, help me find the {noun} who {verb.past} my {thing}",
        "Reddit, we found the {thing} thief",
        "Can anyone enhance this photo of the {noun}?"
      ], ["Here is a {adj} picture. I've circled the {noun}."], [
        "We did it, Reddit!", "Enhance.", "That's my {rel}. Please stop messaging him."], {
        buried: ["Please don't harass random people based on a blurry {thing}."]
      }),

      // ---------- round three: the rest of Reddit ----------
      sports: (x, rng) => {
        const [sub, team, star, scorer] = one([["nfl", "Broncos", "QB", "kicker"], ["nfl", "Bengals", "QB", "kicker"],
          ["nfl", "Browns", "QB", "kicker"], ["nfl", "Dolphins", "QB", "kicker"], ["nba", "Suns", "point guard", "center"],
          ["nba", "Knicks", "point guard", "center"], ["baseball", "Orioles", "shortstop", "closer"],
          ["CFB", "Volunteers", "QB", "kicker"]], rng);
        return {
          sub, flair: one(["Highlight", "News", "Discussion"], rng),
          title: x(one(["The " + team + " are wearing orange uniforms this week",
            "[Highlight] " + team + " " + scorer + " {verb.s} a {N}-foot {noun}",
            team + " " + star + " brings his {thing} to the press conference",
            "The " + team + " mascot is a {thing} now. Thoughts?"], rng)),
          body: "",
          top: one(["Orange? Like Trump? " + team + " confirmed fascist. Cheeto man bad lmao.",
            "Can't wait for {pol} to take credit for this.", "Ref ball.", "Not a " + team + " fan but this is {adj}."], rng),
          buried: ["It's a jersey. It's just a jersey.", "Can we please keep politics out of r/" + sub + "?"]
        };
      },

      exfaith: (x, rng) => ({
        sub: "{faithSub}", flair: one(["Just Venting", "Memes / Humor", "General Discussion", "Doctrine / History"], rng),
        title: x(one(["I poured a glass of {noun} in front of my mother tonight.",
          "Thou shall not enjoy anything.", "Local bar used {book} copies to promote happy hour",
          "Looking back, I feel like I was raised in a cult.", "Anybody else find it insensitive when {faithful} call every {noun} a sign of the end times?",
          "Nobody knows or cares about {faith}"], rng)),
        body: x(one(["It's my {N}th birthday. After years of fights about my {noun}, I finally did it. Cheers everyone.",
          "I consider all religion cultish for the most part. Some are just more mainstream than others.", ""], rng)),
        top: one(["Proud of you, stranger.", "Sending love. You don't owe them anything.",
          "Every religion is like this. Every single one.", "Mine was worse. Here's {N} paragraphs."], rng),
        buried: ["My {rel} is still one of the {faithful} and is a pretty nice person, honestly."]
      }),

      atheism: S(["atheism", "religion"], [
        "Today I told my {rel} that {faith} is a lie. It didn't go well.",
        "Imagine believing a {thing} created the universe in {year}",
        "Saw this sign outside a church today. Thoughts?"
      ], ["Not trying to start anything, but if you need a {noun} to be a good person, you aren't one."],
      ["*tips fedora*", "Religion poisons everything, including {noun.pl}.", "Science is my religion.",
        "This sub is just as preachy as the church."]),

      nocontact: S(["raisedbynarcissists", "JUSTNOMIL", "AmItheAsshole", "estrangedadultchild"], [
        "I went no contact with my parents because they didn't condemn {noun.pl} strongly enough",
        "Cut off my best friend of {years} years. He liked a post about {thing.pl}.",
        "My {rel} said \"I'm not taking sides\" about {noun}. That IS taking a side. NC day {N}.",
        "AITA for skipping my {rel}'s {event} because they voted wrong?"
      ], ["Silence is violence. I'm protecting my peace. I've blocked them on everything, including LinkedIn."],
      ["NTA. You owe them nothing.", "Good. Boundaries are self-care.", "Protect your peace.",
        "Proud of you for choosing yourself."], {
        buried: ["It's your {rel}. Over a {thing}? Really?", "Maybe talk to them. People are allowed to disagree."]
      }),

      redflag: S("relationship_advice", [
        "Is it a red flag that my boyfriend {verb.s} {noun.pl}?",
        "My girlfriend ({relAge}) forgot my {thing}'s birthday. Is this normal?",
        "Husband ({relAge}) wants to {verb} on weekends. Should I be worried?"
      ], ["Otherwise he's great. We've been together {years} years. Two kids. A house. A {thing}."],
      ["Red flag. Leave.", "Divorce. Today.", "This is abuse. Please call a hotline.",
        "He's cheating. I can tell from the {thing}."], {
        buried: ["This seems normal? Have you talked to him?"]
      }),

      worldnews: (x, rng) => ({
        sub: one(["worldnews", "europe", "geopolitics"], rng), old: true, big: true,
        title: x(one(["{foreign} here. The US military is the biggest threat to world peace",
          "America is a third-world country wearing a Gucci belt",
          "Why does America think it's the world police?"], rng)),
        body: x("Honestly, the rest of the world would be fine without the US meddling in everyone's {noun.pl}.") +
          "\n\n" + x("EDIT (" + int(1, 4, rng) + " years later): {Country} just got invaded. WHERE IS THE US?? WHERE IS NATO?? WHERE IS THE WEST??"),
        top: one(["Europe: America, stay out of it. Also Europe: America, where are you?",
          "The edit is doing a lot of work.", "\"Send everything. No, not like that.\""], rng),
        buried: ["Both of these can be true at once, you know."]
      }),

      karmafarm: S("Damnthatsinteresting", [
        "A diver found a {thing} that looks like it knows all the secrets of the universe",
        "Climbers reach the highest peak in {country} and find a {thing} at the summit",
        "Meme People: Then and Now",
        "Father knows the best",
        "This {thing} was orphaned as a newborn. Watch its incredible instinct to {verb}.",
        "A {N}000-year-old perfectly preserved {thing} recently dug up in Germany",
        "His daily life as a {noun}"
      ], [""], ["Saw this on Instagram 3 days ago.", "Posted by a different bot last week. Same title.",
        "Not interesting. Cute, though.", "The {thing} is definitely thinking about taxes."], {
        old: true, big: true, flair: "Video",
        buried: ["OP's account is 11 days old and has 400k karma. This whole sub is bots."]
      }),

      mismatch: (x, rng) => ({
        sub: one(["movies", "aww", "gaming", "woodworking", "gardening", "knitting", "formula1", "Damnthatsinteresting", "memes", "mildlyinteresting"], rng),
        old: true, big: true,
        title: x(one(["{polR}. Upvote this so it's the first thing people see when they google \"{pol}\".",
          "This is America", "{polR} humiliates himself in front of the world",
          "Not really {sub} related, but this needs to be seen", "DEMOCRACY NOW",
          "If this is you: fuck you"], rng)),
        body: "",
        forceStickyText: "We don't normally allow politics in r/{sub}, but this one is important.",
        top: one(["What does this have to do with {sub}?", "Mods asleep, post politics. Oh wait, the mods posted it.",
          "Came here for {thing.pl}. Got this."], rng),
        buried: ["Rule 3 says no politics. It's pinned. At the top. Right there."]
      }),

      gated: (x, rng) => {
        const [sub, flair] = one([["BlackPeopleTwitter", "☑️ Country Club Thread"], ["Conservative", "Flaired Users Only"]], rng);
        return {
          sub, flair, old: true, big: true,
          title: x(one(["He's got a point", "Can relate", "A good reminder", "America is broken",
            "The entitlement is evident", "Please, don't do it", "Honestly, not a bad idea"], rng)),
          body: "",
          quote: { name: x("{poster}"), text: x(one(["If {noun.pl} can {verb}, why can't {thing.pl}?",
            "Imagine paying {a} for a {thing} in this economy."], rng)) },
          forceStickyText: "This thread is limited to verified members. Everyone else, please enjoy reading.",
          top: one(["The mods locking every thread is the real content here.", "Verified comment, very verified.",
            "Imagine needing permission to comment on a screenshot."], rng)
        };
      },

      wsb: S("wallstreetbets", [
        "{Thing} YOLO update: {N} weeks in", "UPVOTE so everyone sees we got SUPPORT",
        "Lost {b} on {thing} calls. AMA", "It's treason then"
      ], ["Wife's boyfriend says hi. Down {N}%. Still holding. 💎🙌"],
      ["Sir, this is a casino.", "Loss porn is the only porn I watch.", "This is the way. To the poorhouse.", "🚀🚀🚀"], { old: true, big: true }),

      place: S("place", ["Full screenshot of r/place {year}", "The Complete r/place Timelapse", "I'll miss you, r/place"],
        [""], ["{N} hours of my life and the void ate it.", "Never forget the {thing} we built.", "Streamers ruined it."], { old: true, big: true }),

      tournament: S(["memes", "mildlyinfuriating", "HolUp", "formula1", "wallstreetbets"], [
        "r/{sub} Predictions Tournament", "R/{SUB} MEME QUIZ #{N}"
      ], [""], ["Why does this have more upvotes than every real post?", "Who is voting on these?",
        "I've never seen anyone actually play this."], { old: true, big: true, mod: true, user: "{mod}" }),

      ama: S(["IAmA", "movies"], [
        "Hi, I'm {poster} {Thing}, the guy who {verb.past} the {thing}. AMA!",
        "I've been a professional {noun} for {years} years. AMA"
      ], ["Proof: [a blurry photo of a {thing}]. I'll be here for 20 minutes."],
      ["Let's keep it about the {thing}, folks.", "OP answered 3 questions and left.", "Rampart."]),

      murdered: (x, rng) => ({
        sub: one(["MurderedByWords", "clevercomebacks", "WhitePeopleTwitter", "facepalm"], rng), old: true, big: true,
        title: x(one(["Did they really think that answer was a good one?", "Absolutely destroyed",
          "Sir, the {noun}", "{pol} gets ratioed"], rng)), body: "",
        quote: { name: x("{poster}"), text: x(one(["\"{Noun.pl} are just {noun.pl} with a {thing}.\"\n\nReply: \"Ok but have you considered: no.\"",
          "\"{Thing.pl} are overrated.\"\n\nReply: \"Says the guy with {N} {thing.pl} in his profile picture.\""], rng)) },
        top: one(["That's not murder. That's a mild disagreement.", "He's not coming back from this.", "Brutal. Anyway."], rng)
      }),

      attempt: S("therewasanattempt", ["to {verb} a {thing}", "to look cool on a {thing}", "to {verb} the {noun}"],
        [""], ["Attempt was made.", "The {thing} won.", "Instant regret."]),

      vague: S(["memes", "me_irl", "meirl", "funny"], [
        "Hmmmmmmmmm", "They what???", "Team {thing}", "Confusing", "What a shame", "{Country} op",
        "This is my jam", "me_irl", "Of course I know him. He is me", "Don't be mad"
      ], [""], ["The title tells me nothing and I upvoted anyway.", "Me irl.", "Ok but why is this at the top of r/all?"],
      { old: true, big: true }),

      nfl2: S("nextfuckinglevel", [
        "Man {verb.s} a {thing} like it's nothing. Absolute legend.",
        "Waiter being attacked suddenly recalls his {noun} training",
        "This {noun} took me over {N}0 hours to complete"
      ], [""], ["Nothing about this is next level.", "Next level would be not filming it.", "Wholesome chungus."],
      { old: true, big: true }),

      aww: S(["aww", "AnimalsBeingDerps", "rarepuppers"], [
        "Meet the newest member of the family, {name}!", "My {thing} when I say the word \"{noun}\"",
        "{Name} the {thing} finally got his {noun} 🥺", "Bunnies flop over when they feel completely safe"
      ], [""], ["I would die for {name}.", "Protect {name} at all costs.", "Smol bean.", "Heckin {adj} doggo."]),

      giftfail: S("gaming", [
        "My parents (late 70s) got me a {thing} controller for Christmas. I do not own a {thing}.",
        "I got off the {thing} by accident right before a cutscene",
        "Seriously? I paid {a} to have {name} locked?"
      ], [""], ["Your parents are wholesome and you know it.", "Gamers rise up.", "EA moment."], { old: true, big: true }),

      askpoop: S("AskReddit", [
        "People who haven't {verb.pp} in {year} yet, why are you still holding on to last year's {noun}?",
        "What's the {adj}est thing you've done for karma?"
      ], [""], ["Asked every January. Upvoted every January.", "Dad joke detected."], { old: true, big: true }),

      shamepost: S(["pics", "PublicFreakout", "trashy"], [
        "If this is you: fuck you", "This is why we can't have nice things",
        "To the person who {verb.past} my {thing}: I hope you {verb}"
      ], ["You know who you are."], ["Doxx him.", "Found his LinkedIn.", "We did it, Reddit! (we did not)"], {
        forceStickyText: "Reminder: do not post personal information. Yes, you. Again."
      }),

      bestofupdate: S(["BestofRedditorUpdates", "AmItheAsshole"], [
        "UPDATE: AITA for {verb.ing} my {rel}'s {thing}? (It got worse)",
        "OOP's {rel} {verb.past} the {thing} at the {event}. Final update."
      ], ["Update {N}. My {rel} has now joined a {thing} cult and my lawyer says hi."],
      ["OOP is not doing well.", "I'm saving this for later. With popcorn.", "Every update is a new genre."]),

      nostalgia: S(["nostalgia", "90s", "Millennials"], [
        "Only 90s kids will remember {thing.pl}", "Who else had a {thing} like this?",
        "Remember when {noun.pl} cost {a}?"
      ], [""], ["I'm 34 and I felt this in my {noun}.", "Millennials will make a whole personality out of a {thing}."]),

      gatekeep: S("gatekeeping", [
        "\"You're not a real {noun} fan unless you {verb} {thing.pl}\"",
        "Not a real gamer unless you own a {thing}"
      ], [""], ["This sub gatekeeps what counts as gatekeeping.", "Says the guy who doesn't own a {thing}."]),

      safe: S(["Cooking", "foodsafety", "AskCulinary"], [
        "Left {noun} out overnight. Is it safe to eat?", "Is this {thing} supposed to be green?"
      ], ["It smells fine. Mostly."], ["When in doubt, throw it out.", "Food safety redditors are about to ruin your day."]),

      pcbuild: S(["pcmasterrace", "buildapc"], [
        "My first build! Rate it", "Upgraded from a {thing} to a {thing}. Huge difference.", "Is {a} too much for a {thing}?"
      ], [""], ["Your RAM is in the wrong slots.", "Peasant.", "Cable management: {adj}."]),

      progress: S(["progresspics", "loseit", "Fitness"], [
        "M/{relAge}/6'0\" [{N}0lbs > {N}0lbs] Took me {N} months", "Day {N} of {verb.ing} every day"
      ], [""], ["Proud of you, stranger.", "Huge. What's your {thing} routine?", "You look like a different {noun}."]),

      collapse: S(["collapse", "climate"], [
        "We have {N} years left. Change my mind.", "Saw a {thing} today. This is it. This is the end."
      ], [""], ["Bold of you to assume we have {N} years.", "Doomer posting is a lifestyle.", "Same post every day."]),

      urban: S(["fuckcars", "urbanplanning"], [
        "In {year}, {country} moved their highway underground. Here are the results",
        "This {thing} should have been a train", "Car brain strikes again"
      ], [""], ["Cars bad. Trains good. Upvote.", "Have you seen how big {country} is?", "This but unironically."]),

      mildlyint: S("mildlyinteresting", [
        "Local {noun} restaurant used to be a {noun} restaurant. They just put sombreros on the {thing.pl}.",
        "Found a guy who looks exactly like me waiting for the {thing}",
        "This {thing} has {N} {noun.pl} instead of one"
      ], [""], ["Mildly interesting achieved.", "Ok this one is actually mildly interesting.", "Your doppelganger saw you too."],
      { old: true, big: true }),

      simpsons: S("memes", ["Simpsons predicted it yet again", "15 years from now", "We are doomed"], [""],
        ["The Simpsons predicted everything except good seasons after 10.", "They did not predict this."], { old: true, big: true }),

      thanos: S("thanosdidnothingwrong", ["Reddit, {name} has a message for you...", "Half of you are about to be banned"],
        [""], ["I was banned. Here I am again.", "Perfectly balanced, as all {noun.pl} should be."], { old: true, big: true }),

      asgerman: S(["gifs", "pics", "europe"], [
        "Leaked footage of {noun.pl} being {verb.pp}. As a {foreign} this is especially chilling.",
        "After yesterday's shitshow in the US, how heartening to see this {noun} smiling again"
      ], [""], ["As a {foreign}, I also find this chilling.", "Why is the nationality always in the title?"], { old: true, big: true }),

      nottheonion: S(["nottheonion", "news"], [
        "{Company} fined {a} for {verb.ing} {noun.pl}",
        "Florida man {verb.s} a {thing} at a {event}"
      ], [""], ["This sub is just the news now.", "Every headline is Florida.", "{a}. That'll show them."], {
        forceStickyText: "Comments wishing harm on anyone will be removed. We will be busy."
      }),

      bigtitle: S(["interestingasfuck", "Damnthatsinteresting", "pics"], [
        "This is {poster} {Thing}, creator of the {thing}. He refused tens of millions of dollars to keep it {adj}. Thanks, {poster}!",
        "In {year} the {noun} handed over its {thing.pl} in exchange for a guarantee never to be {verb.pp}. Guess how that went.",
        "My turtle follows me and seeks out affection. Biologists have reached out to me because this is not even close to normal {noun}."
      ], [""], ["The title is a whole essay and I read every word.", "Source: the title.",
        "Biologists have NOT reached out to you."], { old: true, big: true }),

      aitavalidation: S("AmIOverreacting", [
        "AIO: my {rel} said my {thing} looked {adj}", "AIO? Husband ate the last {noun}. I'm leaving him."
      ], ["Screenshots attached. I'm shaking."], ["You're not overreacting. Leave.", "This is emotional abuse.",
        "You are wildly overreacting and I love you for posting it."]),

      dating: S(["dating_advice", "AskWomen", "AskMen"], [
        "{relAge}, never had a {thing}. Is something wrong with me?", "Women of Reddit, what's the most {adj} thing a man has done on a date?",
        "Men of Reddit, when was the last time you got a compliment?"
      ], [""], ["Hit the gym, delete Facebook, lawyer up.", "2009. Someone said I had nice {noun.pl}. I think about it daily.",
        "Just be yourself (unless yourself owns a {thing})."]),

      nostupid: S(["NoStupidQuestions", "TooAfraidToAsk"], [
        "Is it weird that I {verb} my {thing} every night?", "Why does my {thing} {verb} when I {verb}?",
        "Is it normal to never have {verb.pp} a {noun}?"
      ], [""], ["Yes. No. Maybe. Ask a doctor.", "This is a stupid question and I love it.", "Bodily function question #{N}000."]),

      cmvfresh: S("changemyview", [
        "CMV: Off-duty {noun.pl} are just civilians", "CMV: There's nothing wrong with celebrating when a {noun} dies",
        "CMV: Politicians should take a {noun} exam before running"
      ], ["Edit: Ok, this has been fun, but I am beginning to feel like a one-man army defending the gates of Sparta."],
      ["Δ", "You didn't change your view, you just got tired.", "The bot gave a delta to a comment that said \"technically not incorrect.\""],
      { flair: "Delta(s) from OP", old: true, big: true }),

      teacherpay: S(["Damnthatsinteresting", "antiwork", "teachers"], [
        "What we would pay {noun.pl} if we paid them what we pay {noun.pl}",
        "{noun.pl} vs {noun.pl}: who earns more?"
      ], [""], ["The math in the image is wrong but the vibe is right.", "Source: a Facebook post from {year}."],
      { old: true, big: true, flair: "Misleading" }),

      saint: S(["pics", "MadeMeSmile", "WhitePeopleTwitter", "politics"], [
        "{hero} is a national treasure and we don't deserve him",
        "Reminder that {hero} was right about {noun.pl} in {year}",
        "{hero} {verb.ing} a {thing}. That's it. That's the post.",
        "Imagine if {hero} were in charge. We'd all have free {thing.pl}."
      ], [""], ["We don't deserve {hero}.", "Imagine having a leader who {verb.s} {thing.pl}. Couldn't be us.",
        "Wholesome 100. {hero} 2028.", "This is the content I'm here for."], {
        old: true, big: true, sticky: true,
        buried: ["{hero} has also voted for some bad stuff, to be fair.", "This is just a photo of {hero} holding a {thing}."]
      }),

      // ---------- round four: extreme Reddit ----------
      lazy: S(["antiwork", "WorkReform", "antiwork"], [
        "My boss asked me to {verb} a {thing}. On a WEEKDAY.",
        "Got fired for not showing up for " + "{N} weeks. Is this even legal?",
        "Manager expects me to answer the phone. At my job. Where I answer phones.",
        "I work {N} hours a week and I'm so burnt out I can't {verb}",
        "Interview asked where I see myself in 5 years. I said \"not here.\" Didn't get the job. Capitalism wins again.",
        "Daily reminder: you don't owe your employer showing up"
      ], ["I was hired as a {noun}. Nobody told me I'd have to {verb} {noun.pl}. I've been here {N} days and I've been asked to do work {N} times. I'm documenting everything.",
        "For context, I've been late {N} times this month, but only because of {noun.pl}. They wrote me up. For being late. Unreal."],
      ["NTA. Capitalism did this to you.", "Quiet quit harder.", "Report them to the labor board immediately.",
        "Work is violence.", "Solidarity. Never answer the phone."], {
        buried: ["...you didn't show up for weeks, though?", "Answering the phone is literally the job you applied for."]
      }),

      wifebf: S(["wow", "wallstreetbets", "pcmasterrace", "Fishing", "woodworking", "fantasyfootball"], [
        "My wife's boyfriend makes her so happy, but anyway here's why I play Ret Pally",
        "Wife's boyfriend says I can only buy one more {thing}. Fair.",
        "Wife's boyfriend helped me build this {thing}. Really nice guy.",
        "Finally upgraded my chair in the corner of the bedroom. Ergonomic. Wife's boyfriend picked it out.",
        "Can't make the raid Thursday. Wife's boyfriend needs the house."
      ], ["He's honestly a great guy. He lets me use the {thing} on weekends and he never complains about my {noun.pl}. Anyway, the {noun} rotation is {adj} this patch, so here's my build."],
      ["Wife's boyfriend W.", "Happy for all three of you.", "That chair has seen things.",
        "Bro is speedrunning acceptance.", "This is the most wholesome sad post I've read today."], {
        buried: ["...are you okay?", "Nobody is going to address the first sentence?"]
      }),

      badadvice: (x, rng) => {
        const [title, top] = one([
          ["My boyfriend forgot to text me good morning today", "Break up. Block him. Move to {country}."],
          ["How do I talk to women?", "Don't. Lift. Women are a distraction from your {thing} goals."],
          ["My partner snores. Any tips?", "Divorce. Take the house, the dog, and the {thing}."],
          ["My girlfriend wants to meet my parents. I'm nervous.", "Red flag. She's trying to trap you. Run."],
          ["We've been married {years} years and had our first fight. Is this normal?", "This is abuse. Leave tonight. Don't pack."],
          ["How do I ask my crush out?", "Lawyer up, hit the gym, delete Facebook. Then ask."],
          ["My husband bought the wrong brand of {noun}", "Sounds like weaponized incompetence. Time for a separation."]
        ], rng);
        return {
          sub: one(["relationship_advice", "dating_advice", "AskMen", "AskWomen", "Marriage"], rng),
          title: x(title), body: x("Otherwise things are great. We love each other a lot. I just wanted a second opinion."),
          top,
          buried: ["Have you tried just talking to them?", "This is a completely normal thing and you should not divorce over it."]
        };
      },

      justified: S(["AmItheAsshole", "raisedbynarcissists", "pettyrevenge"], [
        "AITA? My mom was mean to me one time when I was 7, so I emptied her savings and told my dad she was cheating",
        "My dad forgot my {kidAge}th birthday in {year}, so I sold his {thing} and told the whole family he's in a cult",
        "AITA for ruining my sister's wedding because she ate my {noun} in 2009?",
        "My {rel} said my {thing} was ugly {years} years ago. Today I got my revenge."
      ], ["She said my {thing} was {adj}. I never forgot. I waited {years} years. Now my parents are divorced, I'm living in her house, and honestly? I've never felt more at peace. Nobody gets to treat me like that.",
        "I know some people will say this was \"too much.\" Those people weren't there. They didn't feel what I felt when that {thing} came out of the box."],
      ["NTA. She reaped what she sowed.", "Your mom sounds toxic. Good for you.",
        "NTA. Protecting your peace isn't revenge.", "Info: what did the {thing} look like? NTA regardless."], {
        flair: "Not the A-hole",
        buried: ["You destroyed a marriage over one sentence from 20 years ago?", "You stole her money. That's a crime. Like, a real one."]
      }),

      // The hivemind shapes. The Hivemind dial draws these, not the plain draw.
      politics: S(["politics", "PoliticalHumor", "WhitePeopleTwitter", "LeopardsAteMyFace", "facepalm"], [
        "{pol} supporter shocked to learn the {thing} he voted against was his {thing}",
        "Leopards ate my face: {pol} voter loses his {thing}", "Reminder that {pol} has never once {verb.past} a {thing}",
        "Conservatives are mad at {thing.pl} now", "{hero} just ended {pol}'s whole career with one {thing}",
        "Every single Republican voted against free {thing.pl}. Remember that in November.",
        "{pol} is the most {adj} politician in American history and it isn't close", "The GOP's new enemy: {thing.pl}"
      ], [""], ["Every accusation is a confession.", "Vote.", "This aged like milk.", "The leopards are eating well this year.",
        "He'll be fine. They always are.", "Can't wait for the Fox News segment blaming this on {hero}.",
        "Remember this in November.", "Not the Onion, somehow."], {
        sticky: true, buried: ["Both sides are the same.", "Not a {pol} supporter, but this sub is an echo chamber."]
      }),

      boss: S(["antiwork", "WorkReform", "recruitinghell", "jobs"], [
        "My boss texted me at {N} a.m. on my day off about a {thing}",
        "Manager said \"we're a family here\" and then cut the {thing} budget",
        "Got written up for {verb.ing} a {thing} on my lunch break",
        "\"Nobody wants to work anymore,\" says the man paying {N} dollars an hour",
        "Corporate wants us back in the office so we can {verb} the {thing} in person",
        "Company made record profits, so they gave us a pizza party and a {thing}",
        "Job posting wants {N} years of experience with a {thing} that came out last year"
      ], ["I make {N} dollars an hour. The CEO made {N} million last year. I'm done.\n\nMy {thing} at home respects me more than this company.",
        "I said no. Then I said no again. Then I put in my two weeks.", ""],
      ["Unionize.", "Your boss isn't your friend.", "Malicious compliance time.", "Start looking. Today.",
        "\"We're a family\" means they'll guilt you into working for free.", "Get it in writing. Then post it here."], {
        buried: ["Have you tried just doing your job?", "Sounds like you'd be happier somewhere else. So go."]
      }),

      boomer: S(["BoomersBeingFools", "insaneparents", "raisedbynarcissists", "JUSTNOMIL"], [
        "My {rel} thinks I could buy a house if I stopped buying {thing.pl}",
        "Boomer at the {event} yelled at a teenager for {verb.ing} a {thing}",
        "My parents say I'm lazy. I work two jobs and a {thing}.", "My dad still thinks the {thing} is a phone",
        "Mom made my {event} about her {thing} again", "Boomer neighbor called the cops on my {thing}"
      ], ["", "He bought his first house at {N} for the price of a {thing}. Now he tells me to pull myself up by my bootstraps.",
        "I'm {N}. I have a degree in {noun.pl}. I live in their basement. They charge me rent."],
      ["Boomers had it so easy and they still complain.", "Ok boomer.", "This is why I went no contact.",
        "Your parents are the {thing} in this story.", "My {rel} is exactly the same. Must be in the water.",
        "They'll be shocked when nobody visits the nursing home."], {
        buried: ["They're your parents. They did their best.", "Not every boomer is like this, guys."]
      }),

      dogpile: (x, rng) => ({
        sub: "{big}",
        title: x(one(["What time does the {thing} store close?", "I like {noun.pl}. Anyone else?",
          "Just made my first {thing}! Pretty proud of it.", "Does anyone know a good {noun} for beginners?"], rng)),
        body: "",
        top: one(["Imagine thinking this. Couldn't be me.", "Touch grass.", "Who asked?",
          "Checked your post history. Explains everything.", "Ratio + you fell off + your {thing} is ugly.",
          "Found the {noun}.", "Ok, bootlicker.", "This is the worst thing I've ever seen and I've seen r/{other}."], rng),
        buried: ["Why is everyone being so mean? OP just asked a question.", "OP here. I just asked what time it was."]
      }),

      bestof: (x, rng) => ({
        sub: "bestof", old: true, big: true,
        title: x(one(["{Noun} timeline: what {polR} did, and when",
          "u/{poster}{N} explains why every {noun} you've ever owned is secretly {adj}",
          "Redditor breaks down the {noun} crisis in {N} paragraphs"], rng)),
        body: "",
        top: one(["I'll be honest... I'm genuinely curious to see how a pro-{pol} person would write a list like this. Can anyone play devil's advocate?",
          "Fuck this is insane. These are actual {noun.pl}.", "I came here from r/all and I regret nothing."], rng),
        buried: BURIED, sticky: true
      })
    };
    // Weighting: the screenshot and the clapper are the genre, so they come up most.
    const HIVE_ONLY = ["politics", "boss", "boomer"];
    const DRAW = Object.keys(SHAPES).filter(k => !HIVE_ONLY.includes(k))
      .concat(["screenshot", "screenshot", "screenshot", "bus", "malicious", "aita"]);
    // The Hivemind dial swaps in one of these, the ones about work, parents, and politics.
    const HIVE_DRAW = HIVE_ONLY.concat(HIVE_ONLY, ["screenshot", "quit", "nocontact", "worldnews", "teacherpay", "lazy", "lunatics"]);

    // Themes that fit a shape's sub, so r/aww gets animal words and r/Cooking
    // gets food. A shape not listed here draws any theme.
    const SHAPE_THEMES = {
      aww: ["dog", "cat", "hamster", "goldfish", "llama", "sloth", "squirrel", "hedgehog", "penguin"],
      cakeday: ["dog", "cat", "birthday", "reunion"], sports: ["football", "baseball", "basketball", "hockey"],
      safe: ["pizza", "tacos", "sushi", "barbecue", "cheese", "pancakes", "ramen", "bakery"],
      aquarium: ["goldfish", "octopus", "jellyfish", "turtle", "coffee", "gardening"],
      wsb: ["bitcoin", "casino", "lottery", "poker"], finance: ["taxes", "mortgage", "retirement", "lottery"],
      exfaith: ["church", "monastery", "funeral", "christmas"], atheism: ["church", "monastery", "dinosaur"],
      wife: ["marriage", "wedding", "honeymoon", "laundry", "dishwasher"], legal: ["mortgage", "garage", "basement", "lawnmower"],
      urban: ["traffic", "subway", "train", "bicycle", "airport"], giftfail: ["arcade", "lego", "puzzle", "christmas"],
      pcbuild: ["printer", "microwave", "robot", "arcade"], progress: ["gym", "crossfit", "marathon", "yoga", "triathlon"],
      karmafarm: ["octopus", "volcano", "glacier", "penguin", "owl", "eclipse", "ocean"],
      iasf: ["volcano", "octopus", "submarine", "rocket", "tornado"], whatisthis: ["attic", "basement", "garage", "blacksmith"],
      mildly: ["dishwasher", "laundry", "microwave", "printer", "airport"], freakout: ["airport", "traffic", "subway", "cruise"],
      collapse: ["hurricane", "tornado", "glacier", "earthquake"], screenshot: ["printer", "elevator", "coffee", "laundry"],
      malicious: ["printer", "laundry", "dishwasher", "elevator"], quit: ["coffee", "printer", "elevator"],
      lazy: ["printer", "coffee", "elevator", "nap", "insomnia"], wifebf: ["marriage", "honeymoon", "fishing", "arcade", "carpentry"],
      badadvice: ["marriage", "wedding", "honeymoon", "divorce"], justified: ["birthday", "wedding", "christmas", "divorce"]
    };

    // ---------- usernames ----------
    function makeUser(pick, rng) {
      return one([
        () => `Ok-${cap(form(pick, "thing"))}-${int(1000, 9999, rng)}`,
        () => `${cap(form(pick, "adj"))}_${cap(form(pick, "noun"))}_${int(10, 9999, rng)}`,
        () => `throwaway_${form(pick, "noun")}${int(1, 99, rng)}`,
        () => `${form(pick, "thing")}_enjoyer`,
        () => `${cap(form(pick, "verb.ing"))}${cap(form(pick, "thing.pl"))}`,
        () => `Not_A_${cap(form(pick, "noun"))}`,
        () => `xX_${form(pick, "noun")}_Xx`
      ], rng)().replace(/[\s'.]/g, "");
    }

    // ---------- post assembly ----------
    function build(seed, dials) {
      const rng = makeRng(seed);
      hive = HIVE_MIX[dials.hive == null ? 2 : dials.hive];
      let shape = one(DRAW, rng);
      if (hive && rng() < hive) shape = one(HIVE_DRAW, rng);
      const fit = (SHAPE_THEMES[shape] || []).map(t => themeNames.indexOf(t)).filter(i => i >= 0);
      const themeIdx = fit.length ? one(fit, rng) : Math.floor(rng() * THEMES.length);
      const pick = makePicker(rng, themeIdx, dials.coh);
      const ctx = makeContext(rng);
      ctx.mod = one(POWERMODS, rng);
      ctx.big = one(BIG, rng);
      ctx.other = one(OTHER, rng);
      // The real faiths Reddit's ex- subs go after. Names only: no invented
      // doctrine, no quotes. The joke is the sub, not the believers.
      const faith = one(FAITHS, rng);
      ctx.faithSub = faith[0]; ctx.faith = faith[1]; ctx.faithful = faith[2]; ctx.book = faith[3];
      ctx.country = one(["Poland", "Finland", "Portugal", "Chile", "Estonia", "Moldova", "Georgia", "Taiwan"], rng);
      // Real politicians, used only as the subject of Reddit's posts and
      // comments. Never quoted: nothing here puts words in their mouths.
      ctx.pol = one(DUNKED, rng);
      ctx.hero = one(WORSHIPPED, rng);
      ctx.polR = ctx.pol;
      ctx.company = "The " + cap(form(pick, "thing")) + " " + one(["Post", "Times", "Daily", "Report", "Herald"], rng);
      const x = t => fill(t, pick, rng, ctx);
      const p = SHAPES[shape](x, rng, ctx);
      ctx.sub = x(p.sub);

      const paras = p.body ? [p.body] : [];
      const clapLevel = p.clap ? Math.max(dials.clap, p.clapMin || 0) : 0;
      if (clapLevel) paras.push(x(one(CLAP[clapLevel], rng)));
      if (p.tldr) paras.push("TL;DR: " + p.tldr);
      // The all-time top posts are old, huge, and archived.
      const upvotes = p.big ? int(21, 65, rng) * 1000 + int(0, 999, rng) : Math.floor(50 + rng() ** 3 * 120000);
      const comments = Math.floor(upvotes * (0.02 + rng() * 0.08));

      // Edits that fit how the post did. Removed and mod posts get none, and
      // not every post edits: the dial sets the most, not the exact count.
      const did = upvotes >= 5000 ? "big" : upvotes < 800 ? "small" : "";
      const fits = EDITS.filter(e => { const t = (/^(big|small):/.exec(e) || [])[1]; return !t || t === did; })
        .map(e => e.replace(/^(big|small):/, ""))
        .concat(hive ? HIVE_EDITS.filter(() => rng() < hive) : []);
      const editCount = p.removed || p.mod ? 0 : Math.min(dials.edits, Math.floor(rng() * (dials.edits + 1.6)));
      const edits = shuffle(fits, rng).slice(0, editCount);
      if (edits.length) {
        paras.push(edits.map((e, i) => `EDIT${i ? " " + (i + 1) : ""}: ${x(e)}`).join("\n"));
      }

      // A stickied mod comment: forced by the shape, or a coin flip on the political ones.
      let sticky = null, locked = false;
      const stickyText = p.forceSticky || (p.forceStickyText ? x(p.forceStickyText) : null) ||
        (p.sticky && rng() < 0.6 ? one(STICKY, rng) : null);
      if (stickyText) {
        locked = stickyText.startsWith("lock:");
        sticky = { user: ctx.mod, text: x(stickyText.replace(/^lock:/, "")) };
      }

      // The top comment: the shape's own, a stock Reddit reply, or a deleted one.
      // The shape's own top comment most of the time, a built one otherwise, so
      // two posts of the same shape don't share a top comment.
      const tr = rng();
      let topText = tr < 0.05 ? x(one(REDDITISMS, rng)) : tr < 0.4 ? makeComment(x, rng, "take") : x(p.top), reply = null;
      if (hive && tr >= 0.05 && rng() < hive / 2) topText = hiveComment(x, rng, "take");
      let user = p.user ? x(p.user) : makeUser(pick, rng);
      if (topText === "Username checks out.") {
        // Make it check out: OP's name is the longest word in the title.
        const w = (p.title.match(/[A-Za-z]{4,}/g) || ["Reddit"]).sort((m, n) => n.length - m.length)[0];
        user = cap(w.toLowerCase()) + "_" + one(["Enjoyer", "Guy", "Official", "Fan", "Haver"], rng);
      }
      const roll = rng();
      if (roll < 0.03) {
        topText = "[deleted]";
        reply = { user: makeUser(pick, rng), text: x(one(["What did he say?", "What did he say about the {thing}?",
          "RIP to whatever this {noun} said.", "Deleted before I could screenshot it. Classic.",
          "It was about {thing.pl}. Trust me.", "Gone, like my {thing}."], rng)) };
      }
      else if (roll < 0.22) {
        const ops = OP_REPLIES.filter(r => did === "big" || !/blow up/.test(r));
        reply = { user, op: true, text: x(one(ops, rng)) };
      }
      else if (roll < 0.42) reply = { user: makeUser(pick, rng), text: rng() < 0.15 ? x(one(PILE_ON, rng)) : makeComment(x, rng, "pile") };
      // Image posts name one thing. The page looks that word up for a real photo.
      const photo = !p.body && !p.quote && !p.removed && !TEXT_SUBS.has(ctx.sub) ? form(pick, "thing") : null;
      const image = photo ? x(one(IMAGE_ALT, rng).replace(/\{thing\}/g, photo)) : null;

      // ---------- the comment section ----------
      // A tree: each comment has replies. The top comment comes first, then
      // the rest of the thread. The Comments dial sets how many more there are.
      const topScore = Math.floor(upvotes * (0.2 + rng() * 0.9));
      const node = (u, text, score, extra) => Object.assign({ user: u, text, score, replies: [] }, extra);
      const chain = (lines, score) => {
        // Builds a chain top-down: line 1 replied to by line 2, and so on.
        const nodes = lines.map((l, i) => {
          const op = l.startsWith("op:");
          return node(op ? user : makeUser(pick, rng), x(l.replace(/^op:/, "")),
            Math.max(1, Math.floor(score * (0.5 ** i) * (0.6 + rng() * 0.8))), op ? { op: true } : {});
        });
        for (let i = nodes.length - 1; i > 0; i--) nodes[i - 1].replies.push(nodes[i]);
        return nodes[0];
      };
      const thread = [];
      if (sticky) thread.push(node(sticky.user, sticky.text, 1, { mod: true, stickied: true }));
      const top = node(makeUser(pick, rng), topText, topScore, { isTop: true });
      if (reply) top.replies.push(node(reply.user, reply.text, Math.floor(topScore * (0.1 + rng() * 0.4)), reply.op ? { op: true } : {}));
      if (top.replies.length && rng() < 0.4) top.replies[0].replies.push(node(makeUser(pick, rng), makeComment(x, rng, rng() < 0.5 ? "pile" : "quip"), int(1, 400, rng)));
      if (p.buried) top.replies.push(node(makeUser(pick, rng), x(one(p.buried, rng)), -int(12, 900, rng), { collapsed: true }));
      thread.push(top);
      // Each dial step is a range, so no two posts get the same size thread.
      const [lo, hi] = [[0, 0], [1, 4], [2, 9], [5, 15]][dials.comms == null ? 2 : dials.comms];
      const more = int(lo, hi, rng);
      // Built comments, mostly. The classic chains and stock lines are the
      // seasoning: rare enough that a long scroll doesn't repeat them.
      const used = new Set([topText]);
      const fresh = kind => {
        let t = makeComment(x, rng, kind);
        for (let k = 0; k < 4 && used.has(t); k++) t = makeComment(x, rng, kind);
        used.add(t);
        return t;
      };
      for (let k = 0; k < more; k++) {
        const score = Math.floor(topScore * (0.03 + rng() * 0.5));
        const r = rng();
        if (r < 0.04) thread.push(chain(one(CHAINS, rng), score));
        else if (r < 0.07) thread.push(node(makeUser(pick, rng), x(one(rng() < 0.5 ? MORE : REDDITISMS, rng)), score));
        else {
          // A built comment with a built reply chain under it, 0 to 3 deep.
          const c = node(makeUser(pick, rng), fresh("take"), score);
          let at = c, depth = Math.floor(rng() * rng() * 4);
          for (let d = 0; d < depth; d++) {
            const op = rng() < 0.15;
            const child = node(op ? user : makeUser(pick, rng), op ? x(one(OP_REPLIES.filter(o => did === "big" || !/blow up/.test(o)), rng)) : fresh(rng() < 0.45 ? "quip" : rng() < 0.6 ? "pile" : "take"),
              Math.max(1, Math.floor(at.score * (0.2 + rng() * 0.5))), op ? { op: true } : {});
            at.replies.push(child);
            at = child;
          }
          thread.push(c);
        }
      }
      // Real threads sort by score, but the sticky and the top comment stay put.
      const fixed = thread.filter(c => c.stickied || c.isTop);
      const rest = thread.filter(c => !c.stickied && !c.isTop).sort((m, n) => n.score - m.score);
      const commentTree = fixed.concat(rest);

      // Mods in the thread: a removed comment with the reason under it, a mod
      // chiming in, or a lock under the top comment.
      const modNode = text => node(ctx.mod, x(text), 1, { mod: true });
      const walkAll = (list, f) => list.forEach(c => { f(c); walkAll(c.replies, f); });
      walkAll(rest, c => {
        if (c.mod || rng() > 0.1) return;
        c.text = "[removed]"; c.removed = true; c.user = "[deleted]";
        c.replies.unshift(modNode(one(MOD_REMOVALS, rng)));
      });
      if (rest.length && rng() < 0.12) one(rest, rng).replies.push(modNode(one(MOD_CHIMES, rng)));
      if (!locked && rng() < 0.06) { locked = true; top.replies.unshift(modNode(one(MOD_LOCKS, rng))); }
      if (rng() < 0.25) {
        commentTree.unshift(node("AutoModerator", x(one(AUTOMOD, rng).replace("{op}", user)
          .replace("{flair}", p.flair || "Discussion").replace("{TITLE}", p.title.replace(/[{}]/g, ""))), 1, { mod: true, stickied: true, bot: true }));
      }

      // Awards on the post and on comments, mostly on the top comment.
      const postAwards = rng() < (p.big ? 0.8 : 0.4) ? makeAwards(x, rng, int(1, p.big ? 9 : 4, rng)) : [];
      walkAll(commentTree, c => {
        if (c.mod || c.collapsed || c.removed) return;
        if (rng() < (c.isTop ? 0.45 : 0.06)) c.awards = makeAwards(x, rng, int(1, c.isTop ? 5 : 2, rng));
      });

      return withSub({
        seed, shape, sub: ctx.sub, user, title: p.title, image, photo, reply, thread: commentTree, awards: postAwards,
        sticky, locked, removed: !!p.removed,
        body: paras.join("\n\n"), quote: p.quote || null, flair: p.flair || null,
        top: { user: makeUser(pick, rng), text: topText, upvotes: Math.floor(upvotes * (0.2 + rng() * 0.9)) },
        buried: p.buried ? { user: makeUser(pick, rng), text: x(one(p.buried, rng)), score: -int(12, 900, rng) } : null,
        upvotes, comments, mod: !!p.mod, archived: !!p.old,
        age: p.old ? int(5, 12, rng) + "y" : one(["2h", "5h", "9h", "14h", "1d", "3d"], rng)
     }, ctx.sub);
    }
    // Puts the post's subreddit into any {sub} or {SUB} left in its text.
    function withSub(post, sub) {
      const put = t => t.replace(/\{sub\}/g, sub).replace(/\{SUB\}/g, sub.toUpperCase());
      const walk = v => typeof v === "string" ? put(v)
        : Array.isArray(v) ? v.map(walk)
        : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, w]) => [k, walk(w)])) : v;
      return walk(post);
    }
    function shuffle(a, rng) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    // Reddit style: 999, 1.2k, 45k.
    function short(n) {
      if (n < 1000) return String(n);
      const k = n / 1000;
      return (k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)) + "k";
    }

    LEX = LEXDATA;
    for (const pos in LEX.columns) { COL[pos] = {}; LEX.columns[pos].forEach((name, i) => COL[pos][name] = i); }
    themeNames = Object.keys(LEX.themes);
    THEMES = themeNames.map(name => LEX.themes[name]);
    buildPools();

    return {
      build, randSeed, fmt, short,
      wordCount: Object.values(LEX.words).reduce((n, rows) => n + rows.length, 0),
      shapes: Object.keys(SHAPES).length,
      themeCount: themeNames.length
    };
  }

  if (typeof module === "object" && module.exports) module.exports = { createGenerator };
  else globalThis.createGenerator = createGenerator;
})();

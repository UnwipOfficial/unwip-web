// Unwip - Play: a practice space. Nothing here counts towards your books.
// Daily story starter, constraint exercises (checked by rules, no AI), timed warm-ups, story dice,
// style mimic (compare your rhythm with a paragraph you admire) and practice stats.
window.UnwipPlay = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, fmt, I, api, countWords } = U;
  const Clip = window.FolioClip;

  // ================================================================== CONTENT
  const PROMPTS = [
    'Describe a kitchen the morning after an argument. Nobody mentions the argument.',
    'A character finds a note in their own handwriting that they don’t remember writing.',
    'Write the moment someone realises they’ve been the villain all along.',
    'Two strangers share an umbrella. One of them is lying about where they’re going.',
    'Describe a city entirely through what it sounds like at night.',
    'Someone returns a library book forty years late. Explain why.',
    'Write a goodbye where neither person says goodbye.',
    'A soldier comes home to find their house sold.',
    'The last shop open in a town that’s being evacuated.',
    'A child explains death to a younger sibling, and gets it slightly wrong.',
    'Write the first ten minutes after a heist goes perfectly.',
    'A ghost tries, and fails, to haunt someone who isn’t scared of anything.',
    'Describe a place you loved as a child, now that it’s gone.',
    'Someone receives a phone call from their own number.',
    'A dragon applies for a job.',
    'Write a scene where the weather is the main character.',
    'A healer who can only cure people by taking the sickness themselves.',
    'Two old enemies are the last two people at a funeral.',
    'Someone opens a door in their house they’ve never noticed before.',
    'A letter arrives addressed to someone who died a hundred years ago, and it’s urgent.',
    'Write a fight scene where nobody throws a punch.',
    'The night before a wedding, the bride’s sister finds something in the groom’s coat.',
    'A knight who is terrified of horses.',
    'Describe a meal that changes someone’s mind about something important.',
    'A map with one town scratched out. Someone goes to find out why.',
    'Write a scene from the point of view of a house.',
    'A thief steals something and immediately regrets it.',
    'Someone has to deliver bad news to a person who’s having the best day of their life.',
    'The world’s worst fortune teller is finally right.',
    'A small town where everyone shares the same dream every night.',
    'Write a love letter that’s also a threat.',
    'An apprentice realises their master is a fraud.',
    'Describe a storm from inside a lighthouse.',
    'The moment a liar decides to tell the truth.',
    'A character hears their name called in a crowd, but nobody there knows them.',
    'Write a scene where two people want the same chair.',
    'A ship’s cook is the only one who knows the captain is dead.',
    'Someone wakes up with a skill they never learned.',
    'A queen in hiding works in a tavern. Someone recognises her.',
    'Describe a forest that doesn’t want visitors.',
    'Write an argument entirely in questions.',
    'The last train of the night stops somewhere that isn’t on the map.',
    'A character keeps a list of everyone who has ever wronged them. Today, someone is crossed off.',
    'Two siblings divide up a parent’s belongings. One object causes a fight.',
    'A prisoner and a guard play cards every night.',
    'Describe the moment just before a big decision, stretched out as long as you can.',
    'An inventor builds something useful by accident while trying to build something dangerous.',
    'Someone sells memories at a market stall.',
    'Write the scene where a mentor admits they don’t have the answer.',
    'A creature that eats lies moves into a politician’s home.',
    'A courier must deliver a package they’ve been told never to open.',
    'Describe a crowd from the point of view of the one person not cheering.',
    'Someone finds out their imaginary friend from childhood was real.',
    'A blacksmith forges a sword that refuses to be used in war.',
    'Write a reunion at an airport where one person doesn’t show up.',
    'Two rivals are stuck in a lift.',
    'The village celebrates a festival nobody remembers the reason for. This year, someone finds out.',
    'A character tries to cook a dish exactly like their late grandmother did.',
    'Write the scene where someone quits a job dramatically, then has to come back the next day.',
    'An old woman teaches a young thief one last trick.',
    'Describe a battlefield the morning after, through the eyes of a crow.',
    'A wish is granted, but literally.',
    'Write a scene where the dialogue says one thing and the actions say another.',
    'A musician plays at a funeral for someone they hated.',
    'The moon is late tonight.',
    'Someone receives a gift that is clearly meant for someone else.',
    'A detective realises the crime hasn’t happened yet.',
    'Describe a room that tells you everything about the person who lives there.',
    'A character tries to forgive someone, out loud, and can’t.',
    'Write the first meeting between two people who will one day be married, and they hate each other.',
    'A town where it has rained for a year. Then it stops.',
    'An assassin is hired to kill themselves.',
    'Someone counts the steps home every night. Tonight there’s one extra.',
    'A soldier and an enemy soldier are both lost in the same forest.',
    'Describe the smell of a place before you describe anything else about it.',
    'Write a scene where somebody laughs at exactly the wrong moment.',
    'A secret is passed through five people. Write how it changes.',
    'An old song on the radio brings back a memory someone has tried to bury.',
    'A sorcerer’s apprentice gets the spell right, which is worse.',
    'Write the scene where the hero gives up, before they don’t.',
    'A messenger arrives too late. Write what they do next.',
    'Someone keeps finding feathers in their bed.',
    'Two people pretend to be strangers at a party. They’ve been married for ten years.',
    'Describe a winter morning so cold it changes how people talk.',
    'A character must choose between saving a stranger and saving a promise.',
    'A pet notices its owner is not who they used to be.',
    'Write a scene with exactly three objects in the room, and make each one matter.',
    'The day the world’s oldest tree is cut down.',
    'A character tells a story at a campfire. Halfway through, someone else finishes it.',
    'Someone is given a key to a house they’ve never owned.'
  ];
  const STARTERS = ['It wasn’t the noise that woke me.', 'The last time I saw her, she was laughing.', 'Nobody in the village would say his name.',
    'There were three rules, and I broke the first one before breakfast.', 'The door was already open.', 'By the time the bells stopped, the city had changed hands.',
    'I should never have taken the coin.', 'The letter was four words long.', 'We buried the box under the old oak, and swore never to dig it up.',
    'Rain again.', 'Every map of the coast left out the same island.', 'My grandmother kept a knife under her pillow until the day she died.'];

  const SENSES = {
    sight: /\b(saw|see|seen|look\w*|colou?r\w*|light\w*|dark\w*|shadow\w*|bright\w*|glint\w*|gleam\w*|glow\w*|shone|shine\w*|red|blue|green|gold\w*|gr[ae]y|white|black|pale|flicker\w*|sparkl\w*)\b/i,
    sound: /\b(heard|hear\w*|sound\w*|nois\w*|quiet\w*|silen\w*|whisper\w*|creak\w*|hum\w*|ring\w*|rang|roar\w*|buzz\w*|click\w*|thud\w*|crack\w*|echo\w*|song|sang|rustl\w*|clatter\w*|hiss\w*|bang\w*|loud\w*)\b/i,
    smell: /\b(smell\w*|smelt|scent\w*|stink\w*|stank|stench|reek\w*|odou?r\w*|fragran\w*|perfume\w*|aroma\w*|whiff|musty|musk\w*|sniff\w*)\b/i,
    taste: /\b(tast\w*|tongue\w*|bitter\w*|sweet\w*|sour\w*|salt\w*|savou?r\w*|flavou?r\w*|swallow\w*|chew\w*|lick\w*)\b/i,
    touch: /\b(touch\w*|cold|warm\w*|rough\w*|smooth\w*|soft\w*|damp\w*|wet|sharp\w*|sticky|heav\w*|prickl\w*|skin|finger\w*|brush\w*|grip\w*|itch\w*|sting\w*|ache\w*|numb\w*)\b/i
  };
  const EMOTIONS = /\b(angry|anger|furious|fury|rage\w*|mad|sad|sadness|unhappy|happy|happiness|joy\w*|afraid|scared|fear\w*|frightened|terrified|nervous\w*|anxious\w*|anxiety|worr\w*|excit\w*|jealous\w*|envy|envious|embarrass\w*|ashamed|shame|lonely|loneliness|upset|annoyed|annoyance|frustrat\w*|depress\w*|glad|proud|pride|guilt\w*|surprised|shock\w*|disgust\w*|grief|grieving|heartbroken|miserable|delight\w*|relie\w*|hopeful|hopeless|despair\w*|calm)\b/gi;
  const FILTER_WORDS = /\b(saw|heard|felt|noticed|notices|realised|realized|realise|realize|watched|seemed|wondered|decided|knew|could see|could hear|could feel)\b/gi;
  const TAGS = /\b(said|says|asked|asks|replied|whispered|muttered|shouted|yelled|called|cried|answered|murmured|snapped|hissed|growled|sighed|exclaimed|retorted|grumbled|stammered|demanded|insisted|added)\b/gi;
  const TARGET_EMOTIONS = ['furious', 'grieving', 'terrified', 'jealous', 'in love', 'ashamed', 'hopeful', 'lonely'];

  // helpers on plain text
  const paras = t => t.split(/\n+/).map(x => x.trim()).filter(Boolean);
  const sentences = t => paras(t).flatMap(p => (p.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g) || []).map(s => s.trim()).filter(s => /[\p{L}\p{N}]/u.test(s)));
  const count = (t, re) => (t.match(re) || []).length;
  const isSpeech = p => /^["“'‘«—–-]/.test(p);
  const reviseCount = (el, cat) => { try { return window.FolioRevise.analyse(el).issues.filter(i => i.cat === cat).length; } catch { return 0; } };
  const rule = (label, ok, detail = '') => ({ label, ok: !!ok, detail });

  const EXERCISES = [
    { id: 'noadverb', icon: '🚫', title: 'No adverbs', desc: 'Write a scene of 150+ words without a single -ly adverb. Find stronger verbs instead.',
      check: (t, el) => { const n = reviseCount(el, 'adverb'); return [rule('150 words or more', countWords(t) >= 150, `${countWords(t)}/150`), rule('No adverbs', countWords(t) > 0 && !n, n ? `${n} found (Revise colours them)` : '')]; } },
    { id: 'dialogue', icon: '💬', title: 'Only dialogue', desc: 'Tell a whole scene in at least 10 lines of speech. No description at all, so the voices do all the work.',
      check: t => { const ps = paras(t), bad = ps.filter(p => !isSpeech(p)).length; return [rule('10 lines or more', ps.length >= 10, `${ps.length}/10`), rule('Every line is speech', ps.length && !bad, bad ? `${bad} line${bad > 1 ? 's' : ''} aren’t speech` : '')]; } },
    { id: 'notags', icon: '🏷️', title: 'No dialogue tags', desc: 'A conversation of 8+ lines with no “said”, “asked”, “whispered” or other tags. Show who’s talking through what they do.',
      check: t => { const n = count(t, TAGS), sp = paras(t).filter(p => /["“”]/.test(p)).length; return [rule('8 lines with speech', sp >= 8, `${sp}/8`), rule('No dialogue tags', sp && !n, n ? `${n} tag${n > 1 ? 's' : ''} used` : '')]; } },
    { id: 'onesentence', icon: '➰', title: 'One long sentence', desc: '100+ words in one single sentence that still reads clearly. Commas, dashes and semicolons help.',
      check: t => { const s = sentences(t).length; return [rule('100 words or more', countWords(t) >= 100, `${countWords(t)}/100`), rule('Only one sentence', s === 1, s > 1 ? `${s} sentences` : '')]; } },
    { id: 'short', icon: '⚡', title: 'Short and sharp', desc: 'An action scene of 120+ words where every sentence is under 8 words.',
      check: t => { const long = sentences(t).filter(s => countWords(s) >= 8).length; return [rule('120 words or more', countWords(t) >= 120, `${countWords(t)}/120`), rule('Every sentence under 8 words', countWords(t) && !long, long ? `${long} too long` : '')]; } },
    { id: 'lipogram', icon: '🔤', title: 'No letter E', desc: 'Write 60+ words without using the letter E once. Much harder than it sounds.',
      check: t => { const e = count(t, /e/gi); return [rule('60 words or more', countWords(t) >= 60, `${countWords(t)}/60`), rule('No letter E', countWords(t) && !e, e ? `${e} E${e > 1 ? 's' : ''} found` : '')]; } },
    { id: 'senses', icon: '👃', title: 'All five senses', desc: 'Describe a place in 150+ words using sight, sound, smell, taste and touch.',
      check: t => [rule('150 words or more', countWords(t) >= 150, `${countWords(t)}/150`), ...Object.entries(SENSES).map(([k, re]) => rule(k[0].toUpperCase() + k.slice(1), re.test(t)))] },
    { id: 'showemotion', icon: '🎭', title: 'Show it, don’t name it', desc: 'Your character is {emotion}. Show it in 150+ words without naming any feeling at all.',
      check: t => { const n = count(t, EMOTIONS); return [rule('150 words or more', countWords(t) >= 150, `${countWords(t)}/150`), rule('No feeling words', countWords(t) && !n, n ? `${n} named: ${[...new Set((t.match(EMOTIONS) || []).map(w => w.toLowerCase()))].slice(0, 4).join(', ')}` : '')]; } },
    { id: 'fifty', icon: '5️⃣', title: 'Fifty-word story', desc: 'A complete story, beginning, middle and end, in exactly 50 words.',
      check: t => [rule('Exactly 50 words', countWords(t) === 50, `${countWords(t)}/50`)] },
    { id: 'drabble', icon: '💯', title: 'Drabble', desc: 'A complete story in exactly 100 words. Every word has to earn its place.',
      check: t => [rule('Exactly 100 words', countWords(t) === 100, `${countWords(t)}/100`)] },
    { id: 'six', icon: '6️⃣', title: 'Six-word story', desc: 'A whole story in six words. Write lots of them, and keep the one you like as the last line.',
      check: t => { const last = paras(t).pop() || ''; return [rule('Last line is exactly six words', countWords(last) === 6, `${countWords(last)}/6`)]; } },
    { id: 'active', icon: '🏃', title: 'All active', desc: '150+ words with no passive voice. Every sentence has someone doing something.',
      check: (t, el) => { const n = reviseCount(el, 'passive'); return [rule('150 words or more', countWords(t) >= 150, `${countWords(t)}/150`), rule('No passive voice', countWords(t) && !n, n ? `${n} found` : '')]; } },
    { id: 'second', icon: '👉', title: 'You are the hero', desc: 'Write 150+ words in second person (“You open the door…”). No “I” allowed.',
      check: t => { const you = count(t, /\b(you|your|yours|yourself)\b/gi), i = count(t, /\bI\b/g); return [rule('150 words or more', countWords(t) >= 150, `${countWords(t)}/150`), rule('Uses “you” throughout', you >= 8, `${you}/8`), rule('No “I”', countWords(t) && !i, i ? `${i} found` : '')]; } },
    { id: 'nofilter', icon: '🔍', title: 'No filter words', desc: '150+ words without saw, heard, felt, noticed, realised, watched, seemed, wondered, decided or knew. Put the reader right there.',
      check: t => { const n = count(t, FILTER_WORDS); return [rule('150 words or more', countWords(t) >= 150, `${countWords(t)}/150`), rule('No filter words', countWords(t) && !n, n ? `${n}: ${[...new Set((t.match(FILTER_WORDS) || []).map(w => w.toLowerCase()))].slice(0, 4).join(', ')}` : '')]; } },
    { id: 'alphabet', icon: '🔠', title: 'A to Z', desc: '26 sentences, each starting with the next letter of the alphabet. (X can be skipped.)',
      check: t => { const want = 'ABCDEFGHIJKLMNOPQRSTUVWYZ'.split(''); const firsts = sentences(t).map(s => (s.replace(/^[^\p{L}]+/u, '')[0] || '').toUpperCase()).filter(c => c !== 'X'); let n = 0; while (n < want.length && firsts[n] === want[n]) n++; return [rule('A to Z in order', n === want.length, `${n}/25 letters${n < want.length && firsts.length > n ? ` (next should start with ${want[n]})` : ''}`)]; } },
    { id: 'villain', icon: '🦹', title: 'The villain’s side', desc: 'Retell a fairy tale everyone knows from the villain’s point of view, in first person. 200+ words.',
      check: t => { const i = count(t, /\b(I|me|my|mine)\b/g); return [rule('200 words or more', countWords(t) >= 200, `${countWords(t)}/200`), rule('First person', i >= 5, `${Math.min(i, 5)}/5`)]; } }
  ];
  const DICE = {
    who: ['a retired assassin', 'a nervous apprentice baker', 'a lighthouse keeper’s daughter', 'a disgraced knight', 'a fortune teller who’s always wrong', 'twin thieves', 'a ghost who doesn’t know it', 'a tired old dragon', 'a librarian with a secret', 'a smuggler captain', 'a runaway prince', 'a city guard on her last day', 'a mapmaker who’s never left home', 'a beekeeper', 'a forger', 'a heartbroken giant', 'a talking crow', 'a failed wizard', 'a debt collector', 'a street musician', 'a gravedigger', 'a widowed inventor', 'a stage magician', 'a monk who broke a vow', 'a courier with one delivery left', 'an exiled queen', 'a child who can hear lies', 'a mercenary who hates violence', 'a ship’s cat', 'a famous hero who’s a fraud'],
    where: ['a night market', 'an abandoned lighthouse', 'a sunken cathedral', 'the back room of a pawn shop', 'a train stuck in snow', 'a rooftop garden', 'a border checkpoint', 'a library after closing', 'a floating city', 'a hospital waiting room at 3 a.m.', 'a frozen lake', 'a wedding gone wrong', 'a desert inn', 'a castle kitchen', 'a ferry in fog', 'an underground river', 'a lost-property office', 'a forgotten graveyard', 'a carnival packing up', 'a ship’s brig', 'a tower with no door', 'a village that moves', 'a bakery before dawn', 'a bridge between two enemies', 'a museum of lost things', 'a mine shaft', 'an empty theatre', 'a tavern in a storm', 'a prison barge', 'a greenhouse of strange plants'],
    what: ['a key that fits nothing', 'a letter never sent', 'a cracked hand mirror', 'a jar of teeth', 'a music box', 'a bloodied glove', 'a map with a town scratched out', 'a watch that runs backwards', 'a wedding ring', 'a sealed bottle', 'a child’s drawing', 'a bag of foreign coins', 'a warm feather', 'a broken compass', 'an unsigned contract', 'a candle that won’t go out', 'a stolen crown', 'a single seed', 'a photo of a stranger', 'a locked diary', 'a sword too heavy to lift', 'a lantern', 'a deck missing one card', 'a mask', 'a train ticket', 'a small bell', 'a book with blank pages', 'a stone that hums', 'a recipe', 'a dog collar with no dog'],
    problem: ['someone is lying', 'the bridge is out', 'they have one hour', 'nobody remembers their name', 'the wrong person gets the message', 'a promise has to be broken', 'they’re being followed', 'the money is fake', 'an old friend comes back', 'a storm traps everyone inside', 'the plan worked too well', 'they must choose who to save', 'a secret is overheard', 'the door won’t open again', 'someone is missing', 'the cure is the poison', 'a debt comes due', 'they’re mistaken for someone else', 'the map is wrong', 'a rival needs their help', 'the ghost wants something', 'the sun doesn’t rise', 'they lose their voice', 'the king is dead', 'a lie has to come true', 'the animals are fleeing', 'a stranger knows too much', 'it must be back before dawn', 'the dragon is the victim', 'everyone is pretending']
  };
  const DIE_LABEL = { who: 'Who', where: 'Where', what: 'Object', problem: 'Problem' };
  const KIND = { prompt: ['📜', 'Daily story starter'], exercise: ['🎯', 'Exercise'], warmup: ['⏱️', 'Warm-up'], dice: ['🎲', 'Story dice'], mimic: ['🪞', 'Style mimic'], word: ['📖', 'Word practice'], free: ['✍️', 'Free write'] };

  // ================================================================== DATA
  let index = null;
  async function loadIndex() { if (!index) { try { index = await api.playLoad(); } catch { index = null; } } index = index || { pieces: [], days: {} }; index.pieces = index.pieces || []; index.days = index.days || {}; return index; }
  let saveT = null;
  function saveIndex(now) { clearTimeout(saveT); const go = () => api.playSave(index); if (now) return go(); saveT = setTimeout(go, 500); }
  const today = () => new Date().toLocaleDateString('en-CA');
  const dayKey = off => { const d = new Date(); d.setDate(d.getDate() - off); return d.toLocaleDateString('en-CA'); };
  const dayOfYear = () => { const d = new Date(); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5) + d.getFullYear() * 400; };
  function streak() { let n = 0, i = (index.days[today()] || 0) > 0 ? 0 : 1; while ((index.days[dayKey(i)] || 0) > 0 && i < 3650) { n++; i++; } return n; }
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // ================================================================== LIBRARY TABS + HOME
  let tab = 'write';
  try { tab = localStorage.getItem('unwip-lib-tab') || 'write'; } catch {}
  let curView = 'home';
  function setTab(t, keep) {
    tab = t; try { localStorage.setItem('unwip-lib-tab', t); } catch {}
    $$('#lib-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#write-home').classList.toggle('hidden', t !== 'write');
    $('#play-home').classList.toggle('hidden', t !== 'play');
    const bh = $('#build-home'); if (bh) bh.classList.toggle('hidden', t !== 'build' && t !== 'world');
    if (t === 'play' && !(keep && curView !== 'home')) renderHome('home');
    if ((t === 'build' || t === 'world') && window.UnwipBuild) window.UnwipBuild.render(t);
  }
  $$('#lib-tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  // the library refreshes itself now and then (syncing, settings): don't throw someone out of a game or the dice
  U.on('library', () => setTab(tab, true));
  // the tabs unlock with the level: Focus is just Write; Detail adds Play and Build; Lore adds Open World
  const unlocked = t => t === 'write' || !U.level || U.level() >= (t === 'world' ? 2 : 1);
  U.on('level', () => { if (!unlocked(tab)) setTab('write'); });
  { let lv = 'focused'; try { lv = localStorage.getItem('folio-mode') || 'focused'; } catch {} if (tab !== 'write' && !['detailed', 'lore'].includes(lv)) tab = 'write'; if (tab === 'world' && (lv !== 'lore' || matchMedia('(max-width: 720px)').matches)) tab = 'build'; }

  let promptOffset = 0;
  async function renderHome(view, arg) {
    await loadIndex();
    const box = $('#play-home');
    box.scrollTop = 0;
    curView = view || 'home';
    if (view === 'exercises') return exercisesView(box);
    if (view === 'dice') return diceView(box);
    if (view === 'warmup') return warmupView(box);
    if (view === 'mimic') return mimicView(box);
    if (view === 'words' && window.UnwipWords) return window.UnwipWords.view(box, { back, wireHome, write: newPiece, mode: arg });
    const p = PROMPTS[(dayOfYear() + promptOffset) % PROMPTS.length];
    const week = [...Array(U.weekSoFar ? U.weekSoFar() : 7)].reduce((a, _, i) => a + (index.days[dayKey(i)] || 0), 0);   // this week so far
    const done = new Set(index.pieces.filter(x => x.kind === 'exercise' && x.passed).map(x => x.exId));
    const pieces = [...index.pieces].sort((a, b) => (b.updated || 0) - (a.updated || 0));
    box.innerHTML = `
      <div class="pl-head"><div><h1>Play</h1><p>A practice space. Nothing here counts towards your books, so it can be as messy as you like.</p></div>
        <div class="pl-stats"><div><b>🔥 ${streak()}</b><span>day streak</span></div><div><b>${fmt(week)}</b><span>words this week</span></div><div><b>${index.pieces.length}</b><span>pieces</span></div><div><b>${done.size}/${EXERCISES.length}</b><span>exercises done</span></div></div></div>
      <section class="pl-today">
        <div class="pl-today-label">${promptOffset ? 'Another story starter' : 'Today’s story starter'}</div>
        <div class="pl-today-text">${esc(p)}</div>
        <div class="pl-today-acts"><button class="btn primary" id="pl-go-prompt">Write this</button><button class="btn ghost" id="pl-next-prompt">Another one ↻</button><button class="btn ghost" id="pl-free">Just a blank page</button></div>
      </section>
      <div class="pl-tools">
        <button class="pl-tool" data-v="exercises"><span>🎯</span><b>Exercises</b><em>${EXERCISES.length} challenges with rules Unwip checks as you write: no adverbs, only dialogue, no letter E…</em></button>
        <button class="pl-tool" data-v="warmup"><span>⏱️</span><b>Warm-up</b><em>A quick timed freewrite to stretch before your real writing.</em></button>
        <button class="pl-tool" data-v="dice"><span>🎲</span><b>Story dice</b><em>Roll a character, a place, an object and a problem. Write the scene.</em></button>
        <button class="pl-tool" data-v="mimic"><span>🪞</span><b>Style mimic</b><em>Paste a paragraph you love, write your own, and compare the rhythm.</em></button>
        <button class="pl-tool" data-v="words"><span>📖</span><b>Word games</b><em>Guess the five-letter word, match words to meanings, a thesaurus, and a list of words to learn.</em></button>
      </div>
      <div class="lib-row pl-journal-head"><h1>Journal</h1></div>
      ${pieces.length ? `<div class="pl-journal">${pieces.map(x => `<div class="pl-piece" data-id="${x.id}"><span class="pl-pk">${KIND[x.kind] ? KIND[x.kind][0] : '✍️'}</span>
          <div class="pl-pt"><b>${esc(x.title || 'Untitled practice')}</b><span>${esc(KIND[x.kind] ? KIND[x.kind][1] : '')} · ${new Date(x.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${fmt(x.words || 0)} words${x.kind === 'exercise' ? (x.passed ? ' · ✓ done' : ' · not finished') : ''}</span></div>
          <button class="icon-btn small pl-del" title="Delete">${I.x}</button></div>`).join('')}</div>` : '<p class="lib-empty">Nothing yet. Everything you write in Play is kept here.</p>'}`;
    $('#pl-go-prompt', box).onclick = () => newPiece({ kind: 'prompt', prompt: p, title: p.length > 60 ? p.slice(0, 58) + '…' : p });
    $('#pl-next-prompt', box).onclick = () => { promptOffset += 1 + Math.floor(Math.random() * 7); renderHome('home'); };
    $('#pl-free', box).onclick = () => newPiece({ kind: 'free', title: '' });
    $$('.pl-tool', box).forEach(b => b.onclick = () => renderHome(b.dataset.v));
    $$('.pl-piece', box).forEach(row => row.onclick = async e => {
      const x = index.pieces.find(q => q.id === row.dataset.id); if (!x) return;
      if (e.target.closest('.pl-del')) {
        if (!(await U.confirmBox('Delete this piece?', `“${esc(x.title || 'Untitled practice')}” will be deleted. This can’t be undone.`, 'Delete', true))) return;
        index.pieces = index.pieces.filter(q => q !== x); await api.playDeletePiece(x.id); saveIndex(true); renderHome('home'); return;
      }
      openPiece(x);
    });
  }
  const back = '<button class="st-back" data-home>‹ Play</button>';
  const wireHome = box => { const b = $('[data-home]', box); if (b) b.onclick = () => renderHome('home'); };

  function exercisesView(box) {
    const best = id => index.pieces.filter(x => x.exId === id).sort((a, b) => (b.passed ? 1 : 0) - (a.passed ? 1 : 0))[0];
    box.innerHTML = `${back}<div class="pl-head"><div><h1>Exercises</h1><p>Each one has rules. Unwip checks them as you write and ticks them off. No AI, only rules.</p></div></div>
      <div class="pl-ex-grid">${EXERCISES.map(x => { const b = best(x.id); return `<button class="pl-ex ${b && b.passed ? 'done' : ''}" data-id="${x.id}"><span class="pl-ex-ic">${x.icon}</span><b>${esc(x.title)}</b><em>${esc(x.desc.replace('{emotion}', 'feeling something strongly'))}</em>${b ? `<i>${b.passed ? '✓ Done' : 'Started'}</i>` : ''}</button>`; }).join('')}</div>`;
    wireHome(box);
    $$('.pl-ex', box).forEach(b => b.onclick = () => {
      const x = EXERCISES.find(e => e.id === b.dataset.id);
      const emotion = pick(TARGET_EMOTIONS);
      newPiece({ kind: 'exercise', exId: x.id, title: x.title, prompt: x.desc.replace('{emotion}', emotion) });
    });
  }

  function diceView(box) {
    const roll = { who: pick(DICE.who), where: pick(DICE.where), what: pick(DICE.what), problem: pick(DICE.problem) };
    const locked = {};
    box.innerHTML = `${back}<div class="pl-head"><div><h1>Story dice</h1><p>Roll, then write a scene that uses all four. Click a die to lock it before re-rolling.</p></div></div>
      <div class="pl-dice">${Object.keys(DICE).map(k => `<button class="pl-die" data-k="${k}"><span>${DIE_LABEL[k]}</span><b></b><i>🔒 locked</i></button>`).join('')}</div>
      <div class="pl-dice-acts"><button class="btn" id="pl-roll">🎲 Roll again</button><button class="btn primary" id="pl-dice-go">Write this scene</button></div>`;
    wireHome(box);
    const show = (animate) => {
      for (const k of Object.keys(DICE)) {
        const d = $(`.pl-die[data-k="${k}"]`, box), b = $('b', d);
        d.classList.toggle('locked', !!locked[k]);
        if (!animate || locked[k]) { b.textContent = roll[k]; continue; }
        let n = 0; d.classList.add('rolling');
        const t = setInterval(() => { b.textContent = pick(DICE[k]); if (++n > 8) { clearInterval(t); b.textContent = roll[k]; d.classList.remove('rolling'); } }, 55);
      }
    };
    show(true);
    $$('.pl-die', box).forEach(d => d.onclick = () => { locked[d.dataset.k] = !locked[d.dataset.k]; show(false); });
    $('#pl-roll', box).onclick = () => { for (const k of Object.keys(DICE)) if (!locked[k]) roll[k] = pick(DICE[k]); show(true); };
    $('#pl-dice-go', box).onclick = () => newPiece({ kind: 'dice', dice: { ...roll }, title: `${roll.who[0].toUpperCase() + roll.who.slice(1)}, ${roll.where}`, prompt: `Write a scene with ${roll.who}, in ${roll.where}. Something important: ${roll.what}. The problem: ${roll.problem}.` });
  }

  function warmupView(box) {
    let minutes = 5, starter = true;
    box.innerHTML = `${back}<div class="pl-head"><div><h1>Warm-up</h1><p>Write without stopping until the timer ends. Don’t fix anything. It’s like stretching before a run.</p></div></div>
      <div class="pl-card"><div class="field"><label>How long</label><div class="chip-row" id="wu-min">${[3, 5, 10, 15].map(m => `<button class="chip ${m === minutes ? 'on' : ''}" data-m="${m}">${m} min</button>`).join('')}</div></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="wu-start" checked> Give me a first line to start from</label>
      <label class="check"><input type="checkbox" id="wu-keep"> Nudge me if I stop typing for 10 seconds</label>
      <div class="st-actions"><button class="btn primary" id="wu-go">Start the timer</button></div></div>`;
    wireHome(box);
    $$('#wu-min .chip', box).forEach(c => c.onclick = () => { $$('#wu-min .chip', box).forEach(x => x.classList.remove('on')); c.classList.add('on'); minutes = +c.dataset.m; });
    $('#wu-go', box).onclick = () => {
      starter = $('#wu-start', box).checked;
      const line = starter ? pick(STARTERS) : '';
      newPiece({ kind: 'warmup', minutes, keepGoing: $('#wu-keep', box).checked, title: `Warm-up, ${minutes} minutes`, prompt: line ? `Start with: “${line}”` : 'Write anything. Keep your fingers moving.', starter: line });
    };
  }

  function mimicView(box) {
    box.innerHTML = `${back}<div class="pl-head"><div><h1>Style mimic</h1><p>Paste a paragraph from a book you admire. Then write your own paragraph on a different subject in the same style. Unwip compares sentence rhythm, length and readability side by side.</p></div></div>
      <div class="pl-card"><div class="field"><label>Their paragraph (stays on your computer, only used for the comparison)</label><textarea id="mm-model" rows="8" placeholder="Paste a paragraph here…"></textarea></div>
      <div class="st-actions"><button class="btn primary" id="mm-go">Start writing my version</button></div></div>`;
    wireHome(box);
    $('#mm-go', box).onclick = () => {
      const model = $('#mm-model', box).value.trim();
      if (countWords(model) < 20) { U.toast('Paste a paragraph of at least 20 words first.'); return; }
      newPiece({ kind: 'mimic', model, title: 'Style mimic', prompt: 'Write your own paragraph, on any subject, in the same style.' });
    };
  }

  // ================================================================== PLAY EDITOR
  const ed = $('#pl-editor'), side = $('#pl-side');
  let cur = null, lastWords = 0, timer = null, saveP = null, lastKey = Date.now(), checkT = null;

  async function newPiece(o) {
    const x = { id: U.uid(), created: Date.now(), updated: Date.now(), words: 0, ...o };
    index.pieces.push(x); saveIndex();
    await openPiece(x, true);
  }
  async function openPiece(x, fresh) {
    cur = x;
    $('#library').classList.add('hidden'); $('#play-screen').classList.remove('hidden');
    const html = fresh ? '' : await api.playLoadPiece(x.id);
    ed.innerHTML = html || (x.starter ? `<p>${esc(x.starter)} </p>` : '<p><br></p>');
    lastWords = countWords(ed.innerText);
    $('#pl-title').value = x.title || '';
    $('#pl-kind').textContent = KIND[x.kind] ? KIND[x.kind].join(' ') : 'Play';
    renderBanner(); renderSide(); updateWords();
    clearInterval(timer); $('#pl-timer').classList.add('hidden');
    if (x.kind === 'warmup' && fresh) startTimer(x.minutes, x.keepGoing);
    document.title = (x.title || 'Play') + ' — Unwip';
    ed.focus();
    const r = document.createRange(); r.selectNodeContents(ed.lastElementChild || ed); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r);
  }
  function renderBanner() {
    const x = cur, b = $('#pl-banner');
    if (x.kind === 'dice') b.innerHTML = `<div class="pl-bdice">${Object.keys(DICE).map(k => `<div><span>${DIE_LABEL[k]}</span><b>${esc(x.dice[k])}</b></div>`).join('')}</div>`;
    else if (x.prompt) b.innerHTML = `<div class="pl-bprompt">${esc(x.prompt)}</div>`;
    else b.innerHTML = '';
  }
  function renderSide() {
    const x = cur;
    if (x.kind === 'exercise') { side.classList.remove('hidden'); runChecks(); return; }
    if (x.kind === 'mimic') { side.classList.remove('hidden'); runMimic(); return; }
    if (x.kind === 'word' && window.UnwipWords) { side.classList.remove('hidden'); window.UnwipWords.load().then(runWords, () => {}); return; }
    side.classList.add('hidden'); side.innerHTML = '';
  }
  function runChecks() {
    const ex = EXERCISES.find(e => e.id === cur.exId); if (!ex) return;
    const res = ex.check(ed.innerText.replace(/​/g, ''), ed);
    const passed = res.every(r => r.ok);
    const was = cur.passed;
    cur.passed = passed;
    side.innerHTML = `<div class="rp-head"><div class="rp-title">${ex.icon} ${esc(ex.title)}</div></div><div class="rp-scroll">
      <p class="pl-ex-desc">${esc(cur.prompt || ex.desc)}</p>
      <div class="pl-rules">${res.map(r => `<div class="pl-rule ${r.ok ? 'ok' : ''}"><span>${r.ok ? '✓' : '○'}</span><div><b>${esc(r.label)}</b>${r.detail ? `<em>${esc(r.detail)}</em>` : ''}</div></div>`).join('')}</div>
      ${passed ? '<div class="pl-passed">🎉 All rules met. Nice work!</div>' : ''}</div>`;
    if (passed && !was) { chime(); U.toast('🎉 Exercise complete!', '', 2500); }
    saveIndex();
  }

  // ---- word practice: ticks off the words as you use them
  function runWords() {
    if (!cur || cur.kind !== 'word') return;
    const W = window.UnwipWords, vocab = cur.vocab || [], got = W.used(ed.innerText, vocab), all = got.length && got.every(Boolean);
    const was = cur.passed; cur.passed = all;
    side.innerHTML = `<div class="rp-head"><div class="rp-title">📖 Word practice</div></div><div class="rp-scroll">
      <p class="pl-ex-desc">Use ${vocab.length === 1 ? 'the word' : 'each word'} in your writing. Any ending counts.</p>
      <div class="pl-rules">${vocab.map((w, i) => `<div class="pl-rule ${got[i] ? 'ok' : ''}"><span>${got[i] ? '✓' : '○'}</span><div><b>${esc(w.replace(/_/g, ' '))}</b><em>${esc(W.meaning(w))}</em></div></div>`).join('')}</div>
      ${all ? '<div class="pl-passed">🎉 All used. Nice work!</div>' : ''}</div>`;
    if (all && !was) chime();
    saveIndex();
  }

  // ---- style mimic: compare rhythm
  function metrics(text) {
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px;';
    box.innerHTML = paras(text).map(p => `<p>${esc(p)}</p>`).join('');
    document.body.appendChild(box);
    let grade = 0, adverbs = 0;
    try { const a = window.FolioRevise.analyse(box); grade = a.stats.grade; adverbs = a.issues.filter(i => i.cat === 'adverb').length; } catch {}
    box.remove();
    const ss = sentences(text).map(s => countWords(s)).filter(Boolean);
    const words = countWords(text);
    const speech = (text.match(/["“][^"”]*["”]/g) || []).reduce((a, q) => a + countWords(q), 0);
    return { ss, words, avg: ss.length ? Math.round(words / ss.length * 10) / 10 : 0, longest: Math.max(0, ...ss), shortest: ss.length ? Math.min(...ss) : 0,
      grade, adverbs: words ? Math.round(adverbs / words * 1000) / 10 : 0, speech: words ? Math.round(speech / words * 100) : 0,
      variety: ss.length > 1 ? Math.round(Math.sqrt(ss.reduce((a, n) => a + Math.pow(n - words / ss.length, 2), 0) / ss.length) * 10) / 10 : 0 };
  }
  function runMimic() {
    const a = metrics(cur.model), b = metrics(ed.innerText.replace(/​/g, ''));
    const max = Math.max(1, ...a.ss, ...b.ss);
    const bars = m => `<div class="mm-bars">${m.ss.map(n => `<i style="height:${Math.max(6, Math.round(n / max * 100))}%" title="${n} words"></i>`).join('') || '<span>–</span>'}</div>`;
    const row = (label, k, unit = '', hint = '') => { const close = b.words >= 15 && Math.abs(a[k] - b[k]) <= Math.max(1.5, a[k] * 0.2); return `<tr class="${close ? 'close' : ''}"><td>${label}${hint ? `<em>${hint}</em>` : ''}</td><td>${a[k]}${unit}</td><td>${b.words ? b[k] + unit : '–'}</td><td>${close ? '✓' : ''}</td></tr>`; };
    side.innerHTML = `<div class="rp-head"><div class="rp-title">🪞 Style mimic</div></div><div class="rp-scroll">
      <div class="ip-label">Sentence rhythm (each bar is one sentence)</div>
      <div class="mm-who">Theirs</div>${bars(a)}<div class="mm-who">Yours</div>${bars(b)}
      <table class="mm-table"><tr><th></th><th>Theirs</th><th>Yours</th><th></th></tr>
        ${row('Average sentence', 'avg', ' words')}${row('Variety', 'variety', '', 'how much lengths change')}${row('Longest', 'longest', ' words')}${row('Shortest', 'shortest', ' words')}
        ${row('Reading grade', 'grade')}${row('Adverbs', 'adverbs', '%')}${row('Dialogue', 'speech', '%')}</table>
      <details class="mm-model"><summary>Their paragraph</summary><p>${esc(cur.model)}</p></details>
      <p class="rp-note">A ✓ means you’re close. Aim to match the rhythm, in your own words.</p></div>`;
  }

  // ---- timer (warm-ups)
  function startTimer(minutes, keepGoing) {
    const end = Date.now() + minutes * 60000; const el = $('#pl-timer'); el.classList.remove('hidden', 'over');
    const w0 = countWords(ed.innerText); const t0 = Date.now();
    lastKey = Date.now();
    clearInterval(timer);
    timer = setInterval(() => {
      const left = end - Date.now();
      if (left <= 0) {
        clearInterval(timer); el.textContent = 'Time!'; el.classList.add('over'); chime();
        const words = countWords(ed.innerText) - w0, mins = (Date.now() - t0) / 60000;
        U.modal({ title: 'Warm-up done', body: `<div class="sprint-result"><div class="big">${fmt(Math.max(0, words))}</div><div class="lbl">words in ${minutes} minutes · ${Math.round(Math.max(0, words) / mins)} wpm</div><p style="margin-top:12px">You’re warmed up. Keep going here, or go back to your book.</p></div>`, buttons: [{ label: 'Keep writing', value: true, kind: 'ghost' }, { label: 'Back to Play', value: 'home', kind: 'primary' }] })
          .then(v => { if (v === 'home') close(); else ed.focus(); });
        return;
      }
      el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
      if (keepGoing) el.classList.toggle('nudge', Date.now() - lastKey > 10000);
    }, 250);
  }
  let ac = null;
  function chime() {
    try { ac = ac || new AudioContext(); const t = ac.currentTime;
      for (const [f, d] of [[880, 0], [1320, 0.12]]) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.15, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.7); o.connect(g); g.connect(ac.destination); o.start(t + d); o.stop(t + d + 0.75); }
    } catch {}
  }

  // ---- typing, counting, saving
  function updateWords() { const n = countWords(ed.innerText); $('#pl-words').textContent = `${fmt(n)} word${n === 1 ? '' : 's'}`; return n; }
  ed.addEventListener('input', () => {
    if (!cur) return;
    lastKey = Date.now();
    if (!ed.firstElementChild) ed.innerHTML = '<p><br></p>';
    const n = updateWords(), d = n - lastWords; lastWords = n;
    if (d > 0 && d <= 30) { index.days[today()] = (index.days[today()] || 0) + d; }
    cur.words = n; cur.updated = Date.now();
    if (!cur.title && n >= 3) { const first = ed.innerText.trim().split(/\n/)[0].split(/\s+/).slice(0, 6).join(' '); cur.title = first + '…'; $('#pl-title').value = cur.title; }
    clearTimeout(saveP); saveP = setTimeout(savePiece, 600);
    clearTimeout(checkT); checkT = setTimeout(() => { if (cur.kind === 'exercise') runChecks(); else if (cur.kind === 'mimic') runMimic(); else if (cur.kind === 'word') runWords(); }, 250);
  });
  ed.addEventListener('paste', e => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, html ? Clip.cleanPaste(html, { dropFonts: true, dropColors: true }) : Clip.textToHTML(text));
  });
  ed.addEventListener('keydown', e => { if (e.key === 'Tab') e.preventDefault(); });
  if (window.UnwipLook && window.UnwipLook.attach) window.UnwipLook.attach(ed);
  $('#pl-title').addEventListener('input', e => { if (cur) { cur.title = e.target.value; saveIndex(); } });
  async function savePiece() { if (!cur) return; clearTimeout(saveP); await api.playSavePiece(cur.id, ed.innerHTML); saveIndex(); }
  async function close() {
    clearInterval(timer);
    if (cur) {
      await savePiece();
      // an untouched blank page isn't worth keeping
      if (!countWords(ed.innerText.replace(cur.starter || '', ''))) { index.pieces = index.pieces.filter(x => x !== cur); api.playDeletePiece(cur.id); }
      await saveIndex(true);
    }
    cur = null;
    $('#play-screen').classList.add('hidden'); $('#library').classList.remove('hidden');
    document.title = 'Unwip — Write to finish';
    renderHome('home');
  }
  $('#pl-back').innerHTML = I.back;
  $('#pl-back').onclick = close;
  $('#pl-done').onclick = close;

  // ---- send to a project
  $('#pl-send').onclick = async () => {
    if (!cur) return;
    await savePiece();
    const list = await api.listProjects();
    if (!list.length) { U.toast('Make a book first.'); return; }
    const body = document.createElement('div');
    body.innerHTML = `<p>Copies this piece into a project. The original stays here in Play.</p>
      <div class="field"><label>Book</label><select id="sd-p">${list.map(p => `<option value="${esc(p.slug)}">${esc(p.title)}</option>`).join('')}</select></div>
      <div class="field" style="margin-top:10px"><label>Put it in</label><select id="sd-s"><option value="notes">Notes</option><option value="manuscript">Manuscript (at the end)</option><option value="research">Research</option></select></div>`;
    const ok = await U.modal({ title: 'Send to a book', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Send', value: true, kind: 'primary' }] });
    if (!ok) return;
    const slug = $('#sd-p', body).value, kind = $('#sd-s', body).value;
    const project = await api.openProject(slug);
    const root = project.binder.find(n => n.root && n.kind === kind) || project.binder.find(n => n.root && n.kind === 'notes') || project.binder.find(n => n.root);
    const node = { id: U.uid(), type: 'doc', title: cur.title || 'From Play', words: countWords(ed.innerText) };
    root.children = root.children || []; root.children.push(node); root.open = true;
    const banner = cur.prompt ? `<p><i>${esc(cur.prompt)}</i></p><p><br></p>` : '';
    await api.saveDoc(slug, node.id, (kind === 'manuscript' ? '' : banner) + ed.innerHTML);
    await api.saveProjectMeta(slug, project);
    U.toast(`Sent to <b>${esc(project.title)}</b> › ${esc(root.title)}.`, '', 4500);
  };

  // first paint if the library is already showing
  if (!$('#library').classList.contains('hidden')) setTab(tab);
  return { open: () => setTab('play'), setTab, EXERCISES, PROMPTS };
})();

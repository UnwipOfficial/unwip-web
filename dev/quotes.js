// Unwip - short quotes from writers, to keep going. Public-domain writers only (see below).
window.UnwipQuotes = (function () {
  // Only writers whose words are out of copyright everywhere Unwip is sold: they died long enough ago (before 1956)
  // and the line comes from a book, play, letter or interview published before 1931. Translations are left out (the
  // translator's wording can be someone else's), and so are lines usually pinned on the wrong person.
  const Q = [
    ['Begin at the beginning, and go on till you come to the end: then stop.', 'Lewis Carroll'],
    ['Why, sometimes I’ve believed as many as six impossible things before breakfast.', 'Lewis Carroll'],
    ['It’s no use going back to yesterday, because I was a different person then.', 'Lewis Carroll'],
    ['I am no bird; and no net ensnares me.', 'Charlotte Brontë'],
    ['I dwell in Possibility.', 'Emily Dickinson'],
    ['A word is dead when it is said, some say. I say it just begins to live that day.', 'Emily Dickinson'],
    ['A good novel tells us the truth about its hero; but a bad novel tells us the truth about its author.', 'G. K. Chesterton'],
    ['If a thing is worth doing, it is worth doing badly.', 'G. K. Chesterton'],
    ['Write while the heat is in you.', 'Henry David Thoreau'],
    ['Not that the story need be long, but it will take a long while to make it short.', 'Henry David Thoreau'],
    ['How vain it is to sit down to write when you have not stood up to live.', 'Henry David Thoreau'],
    ['To produce a mighty book, you must choose a mighty theme.', 'Herman Melville'],
    ['Don’t loaf and invite inspiration; light out after it with a club.', 'Jack London'],
    ['Let other pens dwell on guilt and misery.', 'Jane Austen'],
    ['The person, be it gentleman or lady, who has not pleasure in a good novel, must be intolerably stupid.', 'Jane Austen'],
    ['I’m not afraid of storms, for I’m learning how to sail my ship.', 'Louisa May Alcott'],
    ['The difference between the almost right word and the right word is really a large matter — ’tis the difference between the lightning-bug and the lightning.', 'Mark Twain'],
    ['Get your facts first, and then you can distort ’em as much as you please.', 'Mark Twain'],
    ['Experience was merely the name men gave to their mistakes.', 'Oscar Wilde'],
    ['To define is to limit.', 'Oscar Wilde'],
    ['There is no such thing as a moral or an immoral book. Books are well written, or badly written. That is all.', 'Oscar Wilde'],
    ['I was working on the proof of one of my poems all the morning, and took out a comma. In the afternoon—well, I put it back again.', 'Oscar Wilde'],
    ['There is then creative reading as well as creative writing.', 'Ralph Waldo Emerson'],
    ['The difficulty of literature is not to write, but to write what you mean.', 'Robert Louis Stevenson'],
    ['The greatest part of a writer’s time is spent in reading, in order to write; a man will turn over half a library to make one book.', 'Samuel Johnson'],
    ['No man but a blockhead ever wrote, except for money.', 'Samuel Johnson'],
    ['The only end of writing is to enable the readers better to enjoy life, or better to endure it.', 'Samuel Johnson'],
    ['Most of the basic material a writer works with is acquired before the age of fifteen.', 'Willa Cather'],
    ['There are only two or three human stories, and they go on repeating themselves as fiercely as if they had never happened before.', 'Willa Cather'],
    ['Brevity is the soul of wit.', 'William Shakespeare'],
    ['Omit needless words.', 'William Strunk Jr.'],
    ['Vigorous writing is concise.', 'William Strunk Jr.'],
    ['If you would not be forgotten, as soon as you are dead and rotten, either write things worth reading, or do things worth the writing.', 'Benjamin Franklin'],
    ['The pen is mightier than the sword.', 'Edward Bulwer-Lytton'],
    ['True ease in writing comes from art, not chance, as those move easiest who have learned to dance.', 'Alexander Pope'],
    ['There are books of which the backs and covers are by far the best parts.', 'Charles Dickens'],
    ['“Fool,” said my Muse to me, “look in thy heart, and write.”', 'Sir Philip Sidney'],
    ['A small daily task, if it be really daily, will beat the labours of a spasmodic Hercules.', 'Anthony Trollope'],
    ['There is no way of writing well and also of writing easily.', 'Anthony Trollope'],
    ['The habit of writing clearly soon comes to the writer who is a severe critic to himself.', 'Anthony Trollope'],
    ['Three hours a day will produce as much as a man ought to write.', 'Anthony Trollope'],
    ['Let an author so tell his tale as to touch his reader’s heart and draw his tears, and he has, so far, done his work well.', 'Anthony Trollope'],
    ['Invention, it must be humbly admitted, does not consist in creating out of void, but out of chaos.', 'Mary Shelley'],
    ['Every thing must have a beginning, to speak in Sanchean phrase; and that beginning must be linked to something that went before.', 'Mary Shelley'],
    ['It is better to fail in originality, than to succeed in imitation.', 'Herman Melville'],
    ['Use the right word, not its second cousin.', 'Mark Twain'],
    ['Eschew surplusage.', 'Mark Twain'],
    ['Truth is stranger than fiction, but it is because Fiction is obliged to stick to possibilities; Truth isn’t.', 'Mark Twain'],
    ['Courage is resistance to fear, mastery of fear — not absence of fear.', 'Mark Twain'],
    ['Nothing is more clear than that every plot, worth the name, must be elaborated to its dénouement before anything be attempted with the pen.', 'Edgar Allan Poe'],
    ['Try to be one of the people on whom nothing is lost!', 'Henry James'],
    ['Write from experience and experience only.', 'Henry James'],
    ['My task which I am trying to achieve is, by the power of the written word, to make you hear, to make you feel — it is, before all, to make you see.', 'Joseph Conrad'],
    ['A woman must have money and a room of her own if she is to write fiction.', 'Virginia Woolf'],
    ['I would venture to guess that Anon, who wrote so many poems without signing them, was often a woman.', 'Virginia Woolf'],
    ['Fiction is like a spider’s web, attached ever so lightly perhaps, but still attached to life at all four corners.', 'Virginia Woolf'],
    ['Writing, when properly managed (as you may be sure I think mine is), is but a different name for conversation.', 'Laurence Sterne'],
    ['Proper words in proper places, make the true definition of a style.', 'Jonathan Swift'],
    ['Great is the art of beginning, but greater the art is of ending; many a poem is marred by a superfluous verse.', 'Henry Wadsworth Longfellow'],
    ['A man ought to read just as inclination leads him; for what he reads as a task will do him little good.', 'Samuel Johnson'],
    ['Prose = words in their best order; poetry = the best words in the best order.', 'Samuel Taylor Coleridge'],
    ['That willing suspension of disbelief for the moment, which constitutes poetic faith.', 'Samuel Taylor Coleridge'],
    ['If Poetry comes not as naturally as the Leaves to a tree it had better not come at all.', 'John Keats'],
    ['Poets are the unacknowledged legislators of the world.', 'Percy Bysshe Shelley'],
    ['Poetry is the spontaneous overflow of powerful feelings.', 'William Wordsworth'],
    ['But words are things, and a small drop of ink, falling like dew, upon a thought, produces that which makes thousands, perhaps millions, think.', 'Lord Byron'],
    ['I am, by calling, a dealer in words; and words are, of course, the most powerful drug used by mankind.', 'Rudyard Kipling'],
    ['I keep six honest serving-men (they taught me all I knew); their names are What and Why and When and How and Where and Who.', 'Rudyard Kipling'],
    ['Fiction is Truth’s elder sister. Obviously. No one in the world knew what truth was till someone had told a story.', 'Rudyard Kipling'],
    ['What fairy tales give the child is his first clear idea of the possible defeat of bogey.', 'G. K. Chesterton'],
    ['Angels can fly because they can take themselves lightly.', 'G. K. Chesterton'],
    ['Risk! Risk anything! Care no more for the opinion of others, for those voices. Do the hardest thing on earth for you. Act for yourself. Face the truth.', 'Katherine Mansfield'],
    ['When I use a word, it means just what I choose it to mean — neither more nor less.', 'Lewis Carroll'],
    ['Novel, n. A short story padded.', 'Ambrose Bierce'],
    ['Critic, n. A person who boasts himself hard to please because nobody tries to please him.', 'Ambrose Bierce'],
    ['Dictionary, n. A malevolent literary device for cramping the growth of a language and making it hard and inelastic.', 'Ambrose Bierce'],
    ['I like work: it fascinates me. I can sit and look at it for hours.', 'Jerome K. Jerome'],
    ['Reading maketh a full man; conference a ready man; and writing an exact man.', 'Francis Bacon'],
    ['Some books are to be tasted, others to be swallowed, and some few to be chewed and digested.', 'Francis Bacon'],
    ['A good book is the precious life-blood of a master spirit.', 'John Milton'],
    ['In Books lies the soul of the whole Past Time.', 'Thomas Carlyle'],
    ['I love to lose myself in other men’s minds. When I am not walking, I am reading.', 'Charles Lamb'],
    ['Books are the treasured wealth of the world and the fit inheritance of generations and nations.', 'Henry David Thoreau'],
    ['’Tis the good reader that makes the good book.', 'Ralph Waldo Emerson'],
    ['Every artist was first an amateur.', 'Ralph Waldo Emerson'],
    ['There is no Frigate like a Book to take us Lands away.', 'Emily Dickinson'],
    ['I declare after all there is no enjoyment like reading!', 'Jane Austen'],
    ['If adventures will not befall a young lady in her own village, she must seek them abroad.', 'Jane Austen'],
    ['If one advances confidently in the direction of his dreams, and endeavors to live the life which he has imagined, he will meet with a success unexpected in common hours.', 'Henry David Thoreau'],
    ['To travel hopefully is a better thing than to arrive, and the true success is to labour.', 'Robert Louis Stevenson'],
    ['Ah, but a man’s reach should exceed his grasp, or what’s a heaven for?', 'Robert Browning'],
    ['To strive, to seek, to find, and not to yield.', 'Alfred, Lord Tennyson'],
    ['To see a World in a Grain of Sand and a Heaven in a Wild Flower.', 'William Blake'],
    ['The lunatic, the lover and the poet are of imagination all compact.', 'William Shakespeare'],
    ['There is nothing either good or bad, but thinking makes it so.', 'William Shakespeare'],
    ['Words, words, words.', 'William Shakespeare'],
    ['A little learning is a dang’rous thing.', 'Alexander Pope'],
    ['I am large, I contain multitudes.', 'Walt Whitman'],
    ['“Hope” is the thing with feathers that perches in the soul.', 'Emily Dickinson'],
    ['There are dark shadows on the earth, but its lights are stronger in the contrast.', 'Charles Dickens'],
    ['I would always rather be happy than dignified.', 'Charlotte Brontë'],
    ['Our deeds determine us, as much as we determine our deeds.', 'George Eliot'],
    ['We are all in the gutter, but some of us are looking at the stars.', 'Oscar Wilde'],
    ['Every portrait that is painted with feeling is a portrait of the artist, not of the sitter.', 'Oscar Wilde'],
    ['You see, but you do not observe.', 'Arthur Conan Doyle'],
    ['It is a capital mistake to theorize before one has data.', 'Arthur Conan Doyle'],
    ['When you have eliminated the impossible, whatever remains, however improbable, must be the truth.', 'Arthur Conan Doyle'],
    ['There are two ways of spreading light: to be the candle or the mirror that reflects it.', 'Edith Wharton'],
    ['Isn’t it nice to think that tomorrow is a new day with no mistakes in it yet?', 'L. M. Montgomery'],
    ['All children, except one, grow up.', 'J. M. Barrie'],
    ['There is nothing—absolute nothing—half so much worth doing as simply messing about in boats.', 'Kenneth Grahame']
  ];
  // A shuffled deck: every quote comes up once before any repeats, and the deck is remembered between sessions.
  const KEY = 'unwip-quote-deck';
  function next(not) {
    let st; try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { st = null; }
    if (!st || !Array.isArray(st.deck) || st.n !== Q.length) st = { deck: [], last: -1, n: Q.length };
    if (!st.deck.length) {
      st.deck = Q.map((_, i) => i);
      for (let i = st.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [st.deck[i], st.deck[j]] = [st.deck[j], st.deck[i]]; }
      if (st.deck[st.deck.length - 1] === st.last) st.deck.unshift(st.deck.pop());   // never the same one twice in a row
    }
    let i = st.deck.pop();
    if (not && Q[i] === not && st.deck.length) { const j = st.deck.pop(); st.deck.unshift(i); i = j; }
    st.last = i;
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {}
    return Q[i];
  }
  const today = () => next();
  const random = not => next(not);
  return { all: Q, today, random };
})();

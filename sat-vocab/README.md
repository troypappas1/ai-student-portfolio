# Five a Day

SAT vocabulary trainer: 200 words in 40 sets of five.

- **Learn**: flashcards (retype the word, flip for synonyms, antonyms, and a sentence), then typed recall, then a hard sentence-completion quiz.
- **Review**: spaced repetition at 1, 3, 7, 14, 30, and 60 days. Due sets are surfaced before new ones.
- **AI tutor**: chat and generated quizzes via the Claude artifact `sample` capability (only works when viewed inside Claude).
- **Word Runner**: a lane-switching runner game built on the chosen sets.

Files:
- `data.js`: the word list and near-synonym groups
- `app.js`: app logic
- `shell.html`: markup and styles
- `five-a-day.html`: built single-file page (run `./build.sh` after editing the sources)

Progress is stored in the browser's `localStorage`.

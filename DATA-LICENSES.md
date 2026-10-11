# Data licenses and attributions

The code in this repo (`reddit-posts.html`, `generator.js`, the page code in `reddit-posts-standalone.html`, and `build/`) is released under the MIT License. See [LICENSE](LICENSE).

The word data is different. `lexicon.json`, and the copy of it embedded in `reddit-posts-standalone.html` inside the `<script id="lexicon-data">` block, is derived from the sources listed here. Because it includes data adapted from wordfreq, which is licensed under CC BY-SA 4.0, the word data is licensed under the [Creative Commons Attribution-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-sa/4.0/). If you share or adapt it, keep this file with it and use the same license.

## Photos

The repo contains no photos. When the page is online, image posts load a photo from Wikimedia Commons at view time, and the photo keeps its own license. The caption under each photo links to its Commons file page and shows the author and license that Commons reports.

## What's in `lexicon.json`

| Field | Source |
|-|-|
| Word list and part of speech | Princeton WordNet 3.0, read through NLTK |
| Which words are included (Zipf frequency 2.5 or higher) and the `zipf` column | wordfreq |
| `plural`, `s`, `past`, `ing`, `pp` | LemmInflect, whose data comes from the NIH SPECIALIST Lexicon |
| `syl` | The CMU Pronouncing Dictionary, read through `pronouncing`. Words missing from it get a vowel-group estimate. |
| `corp` and the theme word lists | Cosine similarity between spaCy `en_core_web_md` word vectors. No vectors are included. |
| `concrete` | WordNet hypernym paths |
| `businessSeeds` and theme names | Written for this project |

## Princeton WordNet 3.0

The vocabulary, parts of speech, and the `concrete` flag come from WordNet 3.0, accessed through the NLTK `wordnet` corpus. The WordNet license requires the following notice on all copies of the database, including modified copies:

> WordNet Release 3.0 This software and database is being provided to you, the LICENSEE, by Princeton University under the following license. By obtaining, using and/or copying this software and database, you agree that you have read, understood, and will comply with these terms and conditions.: Permission to use, copy, modify and distribute this software and database and its documentation for any purpose and without fee or royalty is hereby granted, provided that you agree to comply with the following copyright notice and statements, including the disclaimer, and that the same appear on ALL copies of the software, database and documentation, including modifications that you make for internal use or for distribution. WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved. THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT LIMITATION, PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANT- ABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT INFRINGE ANY THIRD PARTY PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS. The name of Princeton University or Princeton may not be used in advertising or publicity pertaining to distribution of the software and/or database. Title to copyright in this software, database and any associated documentation shall at all times remain with Princeton University and LICENSEE agrees to preserve same.

Source: [WordNet license and commercial use](https://wordnet.princeton.edu/license-and-commercial-use).

Changes: kept single-word lemmas made of ASCII letters, hyphens, and apostrophes. Dropped multiword entries and lemmas under the frequency floor. Moved capitalized-only lemmas to a separate proper-noun list.

## `wordfreq`

Word frequencies come from [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer. The wordfreq code is licensed under the Apache License 2.0, and its data files are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The wordfreq code isn't included here.

Citation: Robyn Speer. (2022). rspeer/wordfreq: v3.0 (v3.0.2). Zenodo. https://doi.org/10.5281/zenodo.7199437

Changes: looked up the English Zipf frequency of each WordNet lemma, kept lemmas at 2.5 or higher, and stored the value rounded to one decimal place in the `zipf` column.

wordfreq's own data sources carry these attributions, which pass through to derived data:

- SUBTLEX word lists (SUBTLEX-US, SUBTLEX-UK, and others) by Marc Brysbaert et al., distributed in wordfreq with the author's permission. SUBTLEX is freely available data: http://crr.ugent.be/programs-data/subtitle-frequencies
- Google Books Ngram Viewer: http://books.google.com/ngrams
- OPUS OpenSubtitles 2018, originating from the OpenSubtitles project: http://www.opensubtitles.org/
- The Leeds Internet Corpus (University of Leeds Centre for Translation Studies), Wikipedia, and ParaCrawl, under Creative Commons licenses.

## LemmInflect and the SPECIALIST Lexicon

Plural and verb forms were generated with [LemmInflect](https://github.com/bjascob/LemmInflect) by Brad Jascob (MIT License, copyright 2019 Brad Jascob). LemmInflect's dictionary and morphology rules are derived from the [SPECIALIST Lexicon](https://lhncbc.nlm.nih.gov/LSG/Projects/lexicon/current/web/index.html) of the Lister Hill National Center for Biomedical Communications, National Library of Medicine. LemmInflect doesn't state which SPECIALIST Lexicon release it uses.

The SPECIALIST NLP Tools are a United States Government product. The United States Government, U.S. Department of Health and Human Services, National Institutes of Health, National Library of Medicine, Lister Hill National Center for Biomedical Communications, and their agencies, contractors, subcontractors, and employees make no warranties, expressed or implied, with respect to the SPECIALIST NLP Tools, and assume no liability for any party's use, or the results of such use, of any part of these tools. Those names may not be used to endorse or promote products derived from the tools without specific prior written permission. Full terms: [Terms and Conditions for Use of the SPECIALIST NLP Tools](https://lhncbc.nlm.nih.gov/LSG/Docs/termsAndConditions.html).

Changes: stored one inflected form per tag (`NNS`, `VBZ`, `VBD`, `VBG`, `VBN`) for each lemma, falling back to the lemma when LemmInflect returns nothing.

## CMU Pronouncing Dictionary

Syllable counts come from the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict), read through [pronouncing](https://github.com/aparrish/pronouncingpy) by Allison Parrish (BSD license). Only the syllable counts are included, not the pronunciations.

> Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved.
>
> Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. The contents of this file are deemed to be source code.
> 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
>
> This work was supported in part by funding from the Defense Advanced Research Projects Agency, the Office of Naval Research and the National Science Foundation of the United States of America, and by member companies of the Carnegie Mellon Sphinx Speech Consortium. We acknowledge the contributions of many volunteers to the expansion and improvement of this dictionary.
>
> THIS SOFTWARE IS PROVIDED BY CARNEGIE MELLON UNIVERSITY ``AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL CARNEGIE MELLON UNIVERSITY NOR ITS EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Changes: reduced each word's first listed pronunciation to a syllable count. Hyphenated words are the sum of their parts.

## spaCy `en_core_web_md`

The `corp` scores and theme word lists were computed from the word vectors in [en_core_web_md](https://spacy.io/models/en#en_core_web_md) by [Explosion](https://explosion.ai), released under the MIT License. Its vectors are Explosion Vectors trained on OSCAR 2109, Wikipedia, OpenSubtitles, and WMT News Crawl. The vectors themselves aren't included. Only derived similarity scores (0 to 100) and nearest-word indexes are.

## Build-time tools

[NLTK](https://www.nltk.org/) (Apache License 2.0), [NumPy](https://numpy.org/) (BSD license), and [spaCy](https://spacy.io/) (MIT License) run during the build. None of their code is included in this repo.

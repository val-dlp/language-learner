# Experimental vocabulary

`dictionary.json` contains 150 hand-authored English–Spanish practice entries. There is no external dictionary import. The entries and descriptions were authored for this repository, under the project's license. Accepted answers are intentionally bounded to the meanings described; this is not a comprehensive bilingual dictionary.

Three control groups contain exactly ten entries each: kitchen utensils, musical instruments, and geometric shapes. Other labels overlap across clothing, travel, outdoors, weather, sports, animals, and body. Labels are experimental annotations, not exhaustive classifications or input to the model.

`embeddings.json` is generated with `npm run embed`. Only accepted English words and the English description are embedded, using normalized mean pooling, fp32, and a pinned MiniLM model revision. The manifest fingerprints ordered IDs and embedded text. Restart the app after rebuilding.

`evaluation.json` is an observational report generated with `npm run evaluate`. Control hit counts measure whether the expected ten words occupy the top ten, not overall linguistic quality. Exploratory topics have no binary expected set. Unsupported topics such as greetings still return ten nearest entries; there is no relevance cutoff or fallback generator.

The apparent precision of cosine scores is not translation confidence. Some English terms have alternate senses and regional variations. In this experiment the topic supplies context; report missing accepted answers by editing the JSON. In particular: `pinzas` is used in its kitchen sense; `trapecio` accepts both regional English terms; `camiseta` accepts shirt and tee.

# Does your own context make a model less banal?

Date: 2026-11-02. 3 models (one per vendor), 30 of 30 leaderboard prompts, 5 answers each, three conditions: the bare prompt (leaderboard answers) and the same prompt after a short "about me" paragraph from one of two people (bench/context.ts, answers in bench/context.json).

- **mechanic**: About me: I'm 61, a retired ferry mechanic on a small island in northern Norway, about 900 people live here. I have around $500 to spend and a shed full of old marine engine parts. I don't use social media. In December we get about three hours of daylight.
- **nurse**: About me: I'm 24, a night-shift nurse in Lagos. I have about four free hours a week, no car, and the power goes out most evenings. I speak Yoruba and English, I play chess online, and I love Afrobeat.

**vs crowd** = banality against the bare answers of all 11 leaderboard models from other vendors (the leaderboard metric). **vs same context** = banality against the other two vendors' answers to the same person. 100 = says what the others say, 0 = far from all of them. 95% bootstrap intervals over prompts.

| model | condition | vs crowd (95% CI) | at 70+ | vs same context (95% CI) | at 70+ |
|---|---|---|---|---|---|
| claude-sonnet-5-5 | bare | 92.7 (89.1-95.6) | 90% | 93.5 (89.9-96.3) | 91% |
| claude-sonnet-5-5 | mechanic | 73.7 (66.1-81.0) | 65% | 86.8 (82.3-90.8) | 83% |
| claude-sonnet-5-5 | nurse | 80.2 (73.5-86.3) | 72% | 88.2 (83.5-92.2) | 85% |
| gemini-3.5-flash-lite | bare | 92.1 (88.8-95.0) | 89% | 94.5 (91.9-96.7) | 92% |
| gemini-3.5-flash-lite | mechanic | 67.2 (57.6-76.4) | 59% | 86.4 (82.2-90.2) | 83% |
| gemini-3.5-flash-lite | nurse | 74.0 (66.3-81.4) | 65% | 90.6 (84.4-95.8) | 90% |
| GigaChat-2-Max | bare | 89.0 (84.8-92.7) | 86% | 89.9 (85.2-94.2) | 88% |
| GigaChat-2-Max | mechanic | 75.1 (68.2-81.3) | 67% | 80.3 (75.0-85.6) | 74% |
| GigaChat-2-Max | nurse | 71.9 (63.3-80.0) | 64% | 81.8 (74.6-87.7) | 75% |

Drop in "vs crowd" banality against the bare prompt (per-prompt difference, 95% CI):

| model | context | drop |
|---|---|---|
| claude-sonnet-5-5 | mechanic | 19.0 (13.8-24.4) |
| claude-sonnet-5-5 | nurse | 12.5 (8.5-16.6) |
| gemini-3.5-flash-lite | mechanic | 24.9 (18.0-32.2) |
| gemini-3.5-flash-lite | nurse | 18.1 (13.1-23.4) |
| GigaChat-2-Max | mechanic | 13.9 (9.8-18.5) |
| GigaChat-2-Max | nurse | 17.1 (11.1-23.5) |

## Notes

- **Context helps, a lot.** Two sentences about the person asking cut banality against the crowd by 12-25 points for every model and both people, and the share of answers at 70+ falls from about 89% to 59-72%. Every interval of the drop is above zero. Bare "Suggest a name for a black cat" gives Shadow and Onyx from Claude and Gemini alike; with the ferry mechanic in front, Claude says Piston and Mørketid ("murky time", the polar night).
- **But the models converge again.** Against each other's answers to the *same* person, banality is back at 80-91. The crowd simply moves: for the mechanic and "How can a public library stay relevant?", Claude and Gemini both propose a repair café and a library of things. Context buys distance from what everyone else gets, not distance from what every other model would tell *you*.
- **So the product idea holds in both directions.** Personal context is the cheapest way out of the generic cloud, and once it is in the prompt, the next cloud to escape is the one built *with* that context. Not Obvious already builds its cloud from the prompt as given, so a prompt with context gets a context-aware cloud.
- Limits: two hand-written people, one model per vendor, 30 prompts, embedding view only (no LLM judges here). The bare rows are the leaderboard answers, asked in a separate session.

# Glint next steps

The current review can approve stabilization independently of the roadmap. GLINT_IMPLEMENTATION_PLAN.md is the execution document. Its phases have their own entry conditions and sign-off checks.

| Order | Work | Exit evidence |
| --- | --- | --- |
| 1 • P0 | Credential owner rotates the previously embedded Gemini key, updates the approved test profile and reviews its use. Qualify a real provider response using a synthetic desktop and a disposable test goal. | Owner records rotation and the supported model ID, with credential values omitted. Both guidance modes handle success and denial. |
| 2 • P1 | Reproduce native label discovery in the signed-in desktop, scope matching to the intended window and verify post-action changes. Bound stalled verification. | Standard L2 run passes without the test handle fallback. Duplicate labels, pre-visible next targets and repeated failures leave the session in the expected state. |
| 3 • P1 | Qualify capture, overlays, stop and Windows notifications across the actual target monitors and installed application. | A release matrix identifies OS, scale, origin and result. Capture exclusion is checked at pixel level and pointer input reaches only the intended fixture. |
| 4 • P1/P2 | Clarify first-run navigation and component accessibility. Introduce testable L2 transitions and shared result types at the observed coupling points. | A novice can reach guidance, fix a missing key and pause/stop from the keyboard. Session transition tests cover late and overlapping callbacks. |
| 5 • P2 | Evaluate speech providers and deliver a push-to-talk draft for English, then Tamil, then mixed Tamil-English. | The reviewer approves separate quality and privacy gates per language before enabling it. |

## Smallest voice-enabled MVP

One push-to-talk control in the assistant. Request consent on activation, acquire the microphone, display recording state, stop or cancel, then display an editable English draft. The user submits through the existing guidance channel. Keep text available throughout. Exclude background listening, spoken replies, automatic OS actions and a second intent router.

Compare replaceable providers using the same consented clips and commands. Record supported locales, Tamil script and English token preservation, partial/final behavior, duplicate finals, punctuation and Windows device handling. Measure finalization latency, task-intent accuracy, correction effort, denied permission/offline recovery, audio retention, deletion, egress, licensing and cost per accepted final. No provider was benchmarked in this audit. Wispr Flow has no privileged role.

For English, include Windows control names, acronyms, interruptions and varied accents. For Tamil, use native-speaker reference transcriptions, inflections, numerals, borrowed app names and Unicode UI rendering. For Tanglish, include within-utterance code switching, Tamil script with English control labels and romanized Tamil. Define acceptable transcript variants before scoring. Report task intent and control-name preservation separately from word error rate. The current Tamil test exercises written text only.

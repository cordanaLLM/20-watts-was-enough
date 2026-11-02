# Acoustics, hearing, and auditory-scene analysis: primary-source audit

- **Audit date:** 2026-08-05
- **Scope:** physical acoustics, calibrated measurement, cochlear mechanics,
  psychoacoustics, masking, auditory scene analysis, binaural localization,
  reverberation, echolocation and sonar, active emission and reception,
  efferent control, sparse/event timing, beamforming, source separation,
  uncertainty, physical limits, and complete lifecycle energy
- **Evidence rule:** claims are audit-local and bounded to the cited experiment,
  model, or standard. Biological observations do not receive engineering credit
  until they beat the strongest compatible signal-processing and control stack.
- **Promotion state:** `ACOUSTIC-` claims only. No stable claim, principle, or
  candidate is created by this file.

## Executive finding

Audition is not one operation. It is a chain from emission and propagation to
sensor mechanics, calibrated transduction, multiscale filtering, nonlinear gain,
event timing, spatial comparison, grouping, inference, action, and memory. Each
stage changes what the next stage can know. The most durable cross-field lesson
is therefore an **emission-, operator-, support-, scene-, and action-qualified
acoustic contract**, not a named auditory module.

The primary evidence supports the following bounded conclusions:

- the cochlea performs frequency-dependent, level-dependent filtering and
  compression, but the filter shapes and gains are not universal constants;
- fine timing can carry localization information, yet phase locking, head size,
  bandwidth, geometry, and frequency bound which delays are usable;
- binaural time, level, and spectral cues are combined differently across
  frequency and task, and head movement can actively resolve ambiguities;
- masking is not exhausted by spectral overlap: uncertainty, source grouping,
  location, temporal coherence, and prior context can change performance;
- room reflections can harm intelligibility while also supplying distance and
  layout cues; an impulse response, support, position, and data vintage must
  accompany any “reverberation” claim;
- echolocators control call timing, level, spectrum, aim, head, and receiver
  geometry, thereby changing the observation operator rather than merely
  processing a fixed input;
- an efferent path can change peripheral gain, but a general attentional or
  speech-in-noise benefit is not established by cochlear suppression alone;
- sparse auditory activity and sparse learned codes exist in scoped systems,
  while their energy and task advantage over dense filterbanks remains open;
- time-delay estimation, matched filtering, adaptive beamforming, subspace
  localization, blind source separation, dereverberation, uncertainty
  estimation, and active control already provide strong conventional nulls;
  and
- active sensing can buy information but pays twice: emission changes the scene
  and consumes energy, exposes the source, creates interference, and requires
  calibrated reception, synchronization, maintenance, and embodied hardware.

The surviving contract is useful across sensing, routing, memory, control, and
evaluation. It requires the actual waveform and observation operator, the
emitter and receiver state, the propagation and room state, feasible actions,
source and interferer distribution, calibration, uncertainty, target outcome,
and complete cost boundary. The contract may sharpen existing principles and
candidates; the audited evidence does not isolate a new causal primitive after
mature acoustical engineering is admitted.

## Outcome and construct firewall

| Construct | Literal question | Minimum measurement | Invalid substitution |
| --- | --- | --- | --- |
| sound pressure | what RMS pressure reached a declared point and band? | pascals plus time/frequency weighting and calibration | an unreferenced decibel value |
| sound exposure | how much squared pressure accumulated over time? | pascal-squared seconds or a referenced exposure level | peak level or duration alone |
| loudness | what perceptual magnitude was reported under a protocol? | psychometric response and uncertainty | A-weighted level |
| detection | was a target distinguished from target-absent trials? | hit/false-alarm rates, sensitivity, criterion | recognition accuracy |
| discrimination | were two declared stimuli distinguished? | psychometric threshold in the manipulated unit | detection or preference |
| identification | was a source/event label correct? | confusion matrix and calibration | waveform similarity |
| intelligibility | which linguistic units were recovered? | words, phonemes, or information units under a protocol | SNR or separation metric |
| localization | which direction was inferred? | azimuth/elevation error in degrees and front/back errors | source identity or range |
| ranging | which distance was inferred? | bias and absolute error in metres | direction or echo detection |
| scene grouping | which events were assigned to one continuing source? | assignment, switch, and ambiguity measures | separated waveform alone |
| source separation | which source waveforms were estimated? | source-conditioned distortion plus downstream utility | localization or attention |
| dereverberation | which direct/early/late component was recovered? | operator-specific waveform and task measures | a drier-sounding output |
| masking | how did a masker change a target threshold or score? | threshold shift, sensitivity, or intelligibility | mixture SNR alone |
| temporal coding | which timing statistic carried task information? | jitter in seconds, phase locking, mutual information, task outcome | sparse spike count |
| sparse activity | how many units/events were active under a declared bin? | events per second, active fraction, information and error | energy use |
| active sensing | did a chosen emission or receiver action improve a target? | causal action contrast, information, latency, risk, energy | correlation between movement and success |
| beamforming | did spatial filtering improve a declared target? | beampattern, array gain, distortion, robustness, task value | biological directional hearing |
| uncertainty | are probabilities calibrated under the actual scene/operator? | proper score, coverage, risk--coverage, abstention value | confidence magnitude |
| biological energy | what organism-level metabolic boundary was measured? | joules or watts with method and boundary | spike count or call level |
| lifecycle efficiency | what protected outcome was obtained for all resources? | Pareto vector of quality, risk, latency, bytes, person-hours, joules, hardware, maintenance | inference joules or acoustic output alone |

## Quantitative acoustic contract

### Versioned episode and measurement identity

For receiver $r$, emitter/source $s$, microphone or ear channel $m$, and episode
$e$, preserve

$$
\mathcal A_e=(X_e,S_e,E_e,R_e,H_e,O_e,C_e,T_e,U_e,B_e),
$$

where:

- $X_e$ is geometry, medium, boundaries, temperature in kelvins, humidity as a
  dimensionless fraction, flow in metres per second, and room/material state;
- $S_e$ is source identity, waveform, position in metres, velocity in metres
  per second, directivity, emission time in seconds, and source level;
- $E_e$ is the commanded and realized emission action: waveform, spectrum,
  duration in seconds, acoustic energy in joules, aim in degrees, and repetition;
- $R_e$ is receiver position/orientation, aperture in metres, head/body state,
  feasible motion, transducer response, gain, and saturation state;
- $H_e$ is prior acoustic exposure, room/source history, adaptation, training,
  and previous actions with timestamps;
- $O_e$ is the observation operator: impulse responses, transfer functions,
  support, sample rate in samples per second, quantization in bits, latency in
  seconds, clock, preprocessing, missingness, and selection;
- $C_e$ is calibration identity, uncertainty, reference pressure, reference
  distance, instrument class, and traceability record;
- $T_e$ is the target construct, outcome, deadline in seconds, and loss or
  utility in declared units;
- $U_e$ is the independent sampling unit: sample, frame, event, source, room,
  listener, device, site, or population; and
- $B_e$ is the complete ceiling in samples, events, bytes, seconds,
  person-hours, joules, emissions, unsafe exposures, sensors, actuators,
  replacements, and opportunity.

Performance for method $q$ and literal outcome $k$ is

$$
Q_{q,k}(\mathcal A)=
\mathbb E\!\left[Y_k\mid do(q),\mathcal A\right],
$$

where $Y_k$ uses the registered unit for outcome $k$. A comparison cannot be
attributed to $q$ when the methods receive different apertures, calibration,
room responses, source counts, emission authority, latency, or training scenes
without a registered intervention.

### Pressure, levels, propagation, and rooms

For acoustic pressure $p(t)$ in pascals over interval $T$ in seconds,

$$
p_{\mathrm{rms}}=
\sqrt{\frac{1}{T}\int_0^T p^2(t)\,dt},
\qquad
L_p=20\log_{10}\!\left(\frac{p_{\mathrm{rms}}}{p_0}\right),
$$

where $p_{\mathrm{rms}}$ is RMS pressure in pascals, $p_0=20\,\mu\mathrm{Pa}$
is the reference pressure in air, and $L_p$ is sound-pressure level in decibels
relative to $20\,\mu\mathrm{Pa}$. The frequency weighting, time weighting,
bandwidth, location, and calibration remain part of the result.

At microphone $m$, a linear time-varying scene model is

$$
y_m(t)=\sum_{s=1}^{S}
\int h_{m,s}(t,\tau)x_s(t-\tau)\,d\tau+n_m(t),
$$

where $y_m(t)$, source pressure $x_s(t)$, and noise $n_m(t)$ are in pascals;
$S$ is source count; delay $\tau$ and time $t$ are in seconds; and
$h_{m,s}(t,\tau)$ is a possibly time-varying pressure transfer kernel in
reciprocal seconds. A time-invariant convolution is a special case, not a default for
moving sources, receivers, media, or boundaries.

For an ideal free-field point source with unchanged directivity and negligible
absorption, pressure magnitude scales approximately as $1/r$, so

$$
\Delta L_p=20\log_{10}\!\left(\frac{r_1}{r_2}\right),
$$

where $r_1$ and $r_2$ are source--receiver distances in metres and
$\Delta L_p$ is the level change in decibels. Directionality, near-field terms,
ground and boundary interference, atmospheric absorption, scattering, and
receiver orientation invalidate blind use of this approximation.

For a diffuse-field Sabine approximation,

$$
T_{60}\approx0.161\frac{V}{A},
$$

where $T_{60}$ is decay time in seconds, $V$ is room volume in cubic metres,
and $A$ is equivalent absorption area in square metres; $0.161$ has units
seconds per metre. The approximation does not replace a measured,
frequency-dependent impulse response or the ISO 3382 reporting contract.

### Filterbanks and compression

A real-valued gammatone-like analysis channel can be written

$$
g_j(t)=a_jt^{n_j-1}e^{-2\pi b_jt}
\cos(2\pi f_jt+\phi_j),\qquad t\ge0,
$$

where channel centre frequency $f_j$ and bandwidth parameter $b_j$ are in
hertz, filter order $n_j$ is dimensionless, phase $\phi_j$ is in radians, time
$t$ is in seconds, and amplitude $a_j$ has units
$\mathrm{s}^{-n_j}$ so the impulse response has units $\mathrm{s}^{-1}$ and
maps pressure to pressure under convolution. Biological measurements constrain
possible channel shapes; they do not fix this engineering implementation.

A normalized compressive input--output description is

$$
\frac{y}{y_0}=\left(\frac{x}{x_0}\right)^\gamma,
\qquad 0<\gamma\le1,
$$

where input magnitude $x$ and reference $x_0$ share the same physical unit,
output $y$ and reference $y_0$ share the same unit, and exponent $\gamma$ is
dimensionless. Cochlear compression is frequency-, level-, state-, and
measurement-dependent; one $\gamma$ is only a local fit.

### Masking, detection, and calibration

For a yes/no detection task, sensitivity is

$$
d'=\Phi^{-1}(P_{\mathrm{hit}})-
\Phi^{-1}(P_{\mathrm{false\ alarm}}),
$$

where $P_{\mathrm{hit}}$ and $P_{\mathrm{false\ alarm}}$ are dimensionless
probabilities and $\Phi^{-1}$ is the inverse standard-normal cumulative
distribution. Report the decision criterion separately; a threshold shift can
reflect peripheral overlap, uncertainty, grouping, attention, or criterion.

For predicted event distribution $p_q(z_n\mid o_n)$ and true outcome $z_n$,

$$
L_q=-\frac{1}{N}\sum_{n=1}^{N}
\log_2 p_q(z_n\mid o_n),
$$

where $N$ is the number of independent events, $o_n$ is the causally available
observation, and $L_q$ is log loss in bits per event. Localization, detection,
source count, and separation confidence each require calibration under held-out
rooms, arrays, source classes, levels, and interference.

### Timing, localization, and arrays

For propagation speed $c$ in metres per second and path-length difference
$\Delta r$ in metres,

$$
\Delta t=\frac{\Delta r}{c},
$$

where interchannel or interaural delay $\Delta t$ is in seconds. Geometry,
head-related filtering, multipath, source extent, synchronization error, and
phase ambiguity must accompany the estimate.

For a narrowband far-field array with aperture $D$ in metres, wavelength
$\lambda=c/f$ in metres, sound speed $c$ in metres per second, and frequency
$f$ in hertz, angular resolution has the order

$$
\Delta\theta\sim\frac{\lambda}{D},
$$

where $\Delta\theta$ is in radians. The coefficient depends on geometry,
beampattern, SNR, estimator, and resolution definition; no algorithm recovers
spatial frequencies excluded by the aperture and bandwidth without additional
prior information.

For array snapshot $\mathbf y\in\mathbb C^M$ in pascals, steering vector
$\mathbf a\in\mathbb C^M$ dimensionless, and noise covariance
$\mathbf R_n=\mathbb E[\mathbf n\mathbf n^H]$ in pascal-squared units, the
minimum-variance distortionless-response weight is

$$
\mathbf w_{\mathrm{MVDR}}=
\frac{\mathbf R_n^{-1}\mathbf a}
{\mathbf a^H\mathbf R_n^{-1}\mathbf a},
\qquad z=\mathbf w_{\mathrm{MVDR}}^H\mathbf y,
$$

where $M$ is microphone count, superscript $H$ is conjugate transpose,
$\mathbf w_{\mathrm{MVDR}}$ is dimensionless after normalization, and beamformer
output $z$ is in pascals. Steering mismatch, covariance error, reverberation,
motion, and correlated sources are decisive null conditions.

### Active echo ranging

For monostatic emission at time $t_{\mathrm{emit}}$ and echo receipt at
$t_{\mathrm{recv}}$, ideal range is

$$
\widehat r=\frac{c}{2}
\left(t_{\mathrm{recv}}-t_{\mathrm{emit}}\right),
$$

where $\widehat r$ is in metres, $c$ is sound speed in metres per second, and
both times are in seconds. The factor two represents outbound and return paths.
Clock offset, target motion, multipath, refraction, waveform bandwidth,
matched-filter ambiguity, transducer ringing, and detector threshold contribute
uncertainty.

Acoustic emission energy is

$$
E_{\mathrm{emit}}=\int_0^{T_e}P_{\mathrm{ac}}(t)\,dt,
$$

where acoustic power $P_{\mathrm{ac}}(t)$ is in watts, emission duration $T_e$
is in seconds, and $E_{\mathrm{emit}}$ is in joules. Electrical input,
transduction loss, sensing, motion, compute, and cooling are separate terms.

### Separation identity and complete cost

For estimated source $\widehat{\mathbf s}$ and reference source
$\mathbf s\in\mathbb R^N$, define the scale-invariant target projection

$$
\mathbf s_{\mathrm{target}}=
\frac{\langle\widehat{\mathbf s},\mathbf s\rangle}
{\lVert\mathbf s\rVert_2^2}\mathbf s,
\qquad
\mathrm{SI\!\!-\!SDR}=10\log_{10}
\frac{\lVert\mathbf s_{\mathrm{target}}\rVert_2^2}
{\lVert\widehat{\mathbf s}-\mathbf s_{\mathrm{target}}\rVert_2^2},
$$

where both waveforms have the same sample count $N$ and amplitude unit,
$\langle\cdot,\cdot\rangle$ is their inner product, and SI-SDR is in decibels.
It does not replace intelligibility, localization, calibration, perceptual
quality, or causal source identity.

Lifecycle energy for method $q$ is

$$
E_q^{\mathrm{life}}=
E_q^{\mathrm{data}}+E_q^{\mathrm{train}}+E_q^{\mathrm{emit}}+
E_q^{\mathrm{sense}}+E_q^{\mathrm{infer}}+E_q^{\mathrm{move}}+
E_q^{\mathrm{comm}}+E_q^{\mathrm{store}}+E_q^{\mathrm{cal}}+
E_q^{\mathrm{maint}}+E_q^{\mathrm{emb}},
$$

where every term is in joules over one declared service interval and denotes
data acquisition, training, acoustic emission, sensing, inference, physical
motion, communication, storage, calibration, maintenance, and amortized
embodied energy. Human design, recording, annotation, listening tests,
calibration, supervision, safety review, and repair remain separate in
person-hours. Efficiency is a Pareto claim on protected outcomes, risk,
latency, complete energy, human work, hardware, and acoustic exposure.

## Strongest conventional engineering null stack

Before assigning an acoustic or auditory residual to architecture, compare it
with the strongest compatible composition of:

1. calibrated microphones, hydrophones, transducers, clocks, sound-level
   meters, transfer-function measurement, IEC 61672 uncertainty, ISO 3382 room
   characterization, and explicit sensor/room simulation;
2. FFT, wavelet, constant-Q, mel, ERB, gammatone/gammachirp, modulation, and
   learnable filterbanks with level normalization, compression, AGC, and
   dynamic-range control;
3. matched filtering, generalized cross-correlation including PHAT, Bayesian
   delay estimation, tracking filters, and multi-hypothesis association;
4. delay-and-sum, superdirective, MVDR/Capon, generalized sidelobe canceler,
   robust beamforming, MUSIC/ESPRIT, sparse array reconstruction, and
   microphone-array calibration;
5. Wiener and spectral subtraction, NMF, ICA, independent vector analysis,
   DUET/time--frequency masking, WPE dereverberation, spatial mixture models,
   and probabilistic source tracking;
6. permutation-invariant training, deep clustering, Conv-TasNet, conformer and
   transformer separators, neural beamformers, target-speaker extraction,
   audio foundation encoders, and room/data augmentation;
7. calibrated ensembles, Bayesian/state-space inference, conformal or selective
   prediction, abstention, value of information, active learning, and proper
   scoring under distribution shift;
8. POMDP, dual control, optimal experiment design, adaptive waveform design,
   adaptive sensing, SLAM, model-predictive sensing/motion, and constrained or
   risk-sensitive control;
9. conventional event detectors, voice activity detection, onset/offset coding,
   sparse convolution, compressed sensing under verified assumptions, codecs,
   neuromorphic audio front ends, DSPs, FPGAs, ASICs, and duty cycling; and
10. explicit spectrum access, time/frequency/code division, collision
    avoidance, power control, jamming detection, authentication, and
    multi-agent communication protocols.

The complete conventional composition is the comparator. A proposed method
does not earn credit for rediscovering a filterbank, compressor, matched filter,
beamformer, separator, tracker, POMDP, or calibrated acquisition policy under
auditory terminology.

## Audit-local evidence claims

### ACOUSTIC-001 — Acoustic level is reference-, weighting-, and instrument-qualified

- **Status:** established.
- **Primary source:** [IEC 61672-1:2013](https://webstore.iec.ch/en/publication/5708).
- **Observation:** the standard distinguishes time-weighted,
  integrating-averaging, and integrating instruments, two performance classes,
  acceptance limits, and measurement uncertainty at 95% coverage.
- **Boundary:** an unqualified “dB” value is not a reproducible acoustic
  observation and cannot serve as energy, loudness, or exposure by itself.

### ACOUSTIC-002 — Room-acoustic quantities require a declared measurement procedure and support

- **Status:** established.
- **Primary source:** [ISO 3382-1:2009](https://www.iso.org/standard/40979.html).
- **Observation:** reverberation time and other room parameters are derived
  from measured impulse responses under specified apparatus, coverage,
  evaluation, and reporting procedures.
- **Boundary:** one room label or scalar decay time does not identify the
  frequency-, source-, receiver-, and support-dependent propagation operator.

### ACOUSTIC-003 — Basilar-membrane filtering is sharply tuned and compressively nonlinear near characteristic frequency

- **Status:** established.
- **Primary source:** Robles, Ruggero, and Rich,
  [DOI 10.1121/1.394389](https://doi.org/10.1121/1.394389); Ruggero et al.,
  [DOI 10.1121/1.418265](https://doi.org/10.1121/1.418265).
- **Observation:** chinchilla basilar-membrane measurements showed sharp
  frequency tuning and level-dependent compressive input--output functions in
  the measured basal region.
- **Boundary:** species, cochlear place, level, preparation condition, and
  measurement method bound the result; it does not prescribe one artificial
  filterbank or exponent.

### ACOUSTIC-004 — Outer-hair-cell somatic motility contributes causally to cochlear amplification

- **Status:** established.
- **Primary source:** Mellado Lagarde et al.,
  [DOI 10.1038/nn.2129](https://doi.org/10.1038/nn.2129).
- **Observation:** basilar-membrane displacement in a mouse manipulation that
  limited stereociliary contribution supported somatic motility as the basis of
  amplification in the tested preparation.
- **Boundary:** causal biological amplification does not establish lower total
  energy or superior robustness for an artificial active analog front end.

### ACOUSTIC-005 — Psychophysical auditory-filter shapes depend on centre frequency and fitting assumptions

- **Status:** established.
- **Primary source:** Glasberg and Moore,
  [DOI 10.1016/0378-5955(90)90170-T](https://doi.org/10.1016/0378-5955(90)90170-T);
  Moore, Peters, and Glasberg,
  [DOI 10.1121/1.399960](https://doi.org/10.1121/1.399960).
- **Observation:** notched-noise thresholds support asymmetric effective
  filters whose bandwidth and shape vary with centre frequency; derivation
  depends on off-frequency listening and outer/middle-ear corrections.
- **Boundary:** the estimated perceptual filter is model-conditioned and is not
  a direct immutable hardware transfer function.

### ACOUSTIC-006 — Temporal-envelope sensitivity is band-limited rather than event-rate invariant

- **Status:** established.
- **Primary source:** Viemeister,
  [DOI 10.1121/1.383036](https://doi.org/10.1121/1.383036).
- **Observation:** human modulation-detection measurements define a temporal
  modulation transfer function with task- and carrier-conditioned sensitivity.
- **Boundary:** “event-driven hearing” cannot assume that every event rate or
  temporal detail is equally observable or useful.

### ACOUSTIC-007 — Auditory-nerve phase locking degrades with frequency

- **Status:** established.
- **Primary source:** Johnson,
  [DOI 10.1121/1.383076](https://doi.org/10.1121/1.383076).
- **Observation:** single-fibre cat auditory-nerve recordings quantified
  stimulus-parameter-dependent synchrony and its high-frequency decline.
- **Boundary:** spike timing is a task- and frequency-qualified channel, not a
  universal replacement for rate or spectral representations.

### ACOUSTIC-008 — Cochlear-nucleus circuitry can sharpen low-frequency temporal synchrony

- **Status:** established.
- **Primary source:** Joris et al.,
  [DOI 10.1152/jn.1994.71.3.1022](https://doi.org/10.1152/jn.1994.71.3.1022).
- **Observation:** trapezoid-body recordings showed stronger synchronization
  than auditory-nerve inputs for scoped low-frequency tones.
- **Boundary:** synchronization enhancement is not evidence that artificial
  coincidence circuits improve end-to-end tasks or energy without comparison.

### ACOUSTIC-009 — Coincidence-sensitive circuits can encode interaural time differences

- **Status:** established.
- **Primary source:** Carr et al.,
  [DOI 10.1523/JNEUROSCI.6154-08.2009](https://doi.org/10.1523/JNEUROSCI.6154-08.2009).
- **Observation:** in vivo alligator nucleus-laminaris recordings showed
  phase-locked inputs and maximal responses near delays that aligned bilateral
  arrivals.
- **Boundary:** represented delay range, frequency, anatomy, and head geometry
  are species-specific; GCC and conventional delay estimators remain nulls.

### ACOUSTIC-010 — Binaural cue weighting changes with frequency content

- **Status:** established.
- **Primary source:** Macpherson and Middlebrooks,
  [DOI 10.1121/1.1471898](https://doi.org/10.1121/1.1471898).
- **Observation:** virtual-space cue-conflict experiments found different
  weights for interaural time, level, and spectral cues across low-pass,
  high-pass, and broadband stimuli.
- **Boundary:** one “duplex” rule is not a complete localization model under
  individual transfer functions, reverberation, motion, or hearing state.

### ACOUSTIC-011 — Head movement can reduce localization ambiguity

- **Status:** established.
- **Primary source:** Kato et al.,
  [DOI 10.1250/ast.24.315](https://doi.org/10.1250/ast.24.315).
- **Observation:** allowing head motion reduced localization errors, including
  front--back confusion, in the tested virtual-audio conditions.
- **Boundary:** movement changes the observation operator and costs time and
  energy; static-HRTF, active-SLAM, and value-of-information baselines apply.

### ACOUSTIC-012 — Early-arriving spatial information can dominate later copies

- **Status:** established.
- **Primary source:** Wallach, Newman, and Rosenzweig,
  [DOI 10.2307/1418275](https://doi.org/10.2307/1418275).
- **Observation:** controlled lead--lag presentations produced fusion and
  localization dominance by the earlier arrival within bounded delay regimes.
- **Boundary:** the precedence effect depends on waveform, delay, context, and
  task; it is not a general command to discard late evidence.

### ACOUSTIC-013 — Spatial separation can improve speech recognition in masking

- **Status:** established.
- **Primary source:** Bronkhorst and Plomp,
  [DOI 10.1121/1.396191](https://doi.org/10.1121/1.396191).
- **Observation:** binaural speech-recognition experiments showed benefits that
  depended on target/masker spatial configuration and masker type.
- **Boundary:** better-ear level, binaural unmasking, attention, and source
  separation must remain distinct mechanisms and outcomes.

### ACOUSTIC-014 — Informational masking can fall when target and masker are perceptually segregated

- **Status:** established.
- **Primary source:** Kidd et al.,
  [DOI 10.1121/1.410023](https://doi.org/10.1121/1.410023).
- **Observation:** presentation schemes designed to segregate a target from
  uncertain multitone maskers reduced masking beyond simple spectral-energy
  accounts.
- **Boundary:** this does not identify one grouping mechanism; template
  uncertainty, spatial filtering, sequential prediction, and attention are
  competing explanations.

### ACOUSTIC-015 — Selective listening is strongly altered by ear and source configuration

- **Status:** established.
- **Primary source:** Cherry,
  [DOI 10.1121/1.1907229](https://doi.org/10.1121/1.1907229).
- **Observation:** speech-shadowing experiments showed large differences
  between monaural mixtures and dichotic presentation of competing messages.
- **Boundary:** the classic result establishes task-conditioned selection, not
  a complete computational mechanism or modern multi-source benchmark.

### ACOUSTIC-016 — Temporal coherence can support grouping across frequency channels

- **Status:** plausible.
- **Primary source:** Elhilali et al.,
  [DOI 10.1016/j.neuron.2008.12.005](https://doi.org/10.1016/j.neuron.2008.12.005).
- **Observation:** psychophysical and cortical measurements plus a model linked
  cross-channel temporal coherence with stream organization in the tested
  stimuli.
- **Boundary:** coherence is neither necessary nor sufficient for every scene;
  source models, attention, harmonicity, spatial cues, and learned separation
  remain nulls.

### ACOUSTIC-017 — Stable spectrotemporal context can alter later speech judgments

- **Status:** established.
- **Primary source:** Stilp et al.,
  [DOI 10.1016/j.heares.2016.08.004](https://doi.org/10.1016/j.heares.2016.08.004).
- **Observation:** vowel judgments adapted to stable spectral properties in
  preceding context whether caused by reverberation or a concurrent tone.
- **Boundary:** the result warns against calling every contextual compensation
  an inferred room model.

### ACOUSTIC-018 — Prior exposure to a room can improve masked-speech intelligibility

- **Status:** established.
- **Primary source:** Brandewie and Zahorik,
  [DOI 10.1121/1.3436565](https://doi.org/10.1121/1.3436565).
- **Observation:** prior listening in a consistent simulated room improved the
  scoped speech-in-noise outcome.
- **Boundary:** room identity, exposure duration, listener, speech task, and
  transfer room must be retained; ordinary adaptive filtering is a null.

### ACOUSTIC-019 — Monaural context can compensate for reverberant speech distortion

- **Status:** established.
- **Primary source:** Watkins,
  [DOI 10.1121/1.1923369](https://doi.org/10.1121/1.1923369); Beeston, Brown,
  and Watkins, [DOI 10.1121/1.4900596](https://doi.org/10.1121/1.4900596).
- **Observation:** controlled context manipulations changed consonant
  identification in reverberant speech without requiring binaural input.
- **Boundary:** compensation is bounded by context consistency and stimulus;
  it does not establish physical dereverberation or waveform recovery.

### ACOUSTIC-020 — Direct-to-reverberant energy contributes to auditory distance judgments

- **Status:** established.
- **Primary source:** Bronkhorst and Houtgast,
  [DOI 10.1038/17374](https://doi.org/10.1038/17374).
- **Observation:** virtual-room experiments supported a quantitative relation
  between modified direct-to-reverberant energy ratio and perceived distance.
- **Boundary:** perceived distance, true metric range, room inference, and echo
  ranging are different outcomes.

### ACOUSTIC-021 — Awake auditory cortex can represent sounds with low population activity

- **Status:** established.
- **Primary source:** Hromádka, DeWeese, and Zador,
  [DOI 10.1371/journal.pbio.0060016](https://doi.org/10.1371/journal.pbio.0060016).
- **Observation:** cell-attached recordings in unanesthetized rats found sparse
  sound-evoked activity across the sampled auditory-cortical population.
- **Boundary:** sampling, bin width, stimulus ensemble, cell type, and task
  matter; sparse spikes do not directly measure organism or hardware energy.

### ACOUSTIC-022 — Sparse coding of natural sounds can learn cochlea-like kernels

- **Status:** plausible.
- **Primary source:** Smith and Lewicki,
  [DOI 10.1038/nature04485](https://doi.org/10.1038/nature04485).
- **Observation:** a sparse generative spike-code model trained on natural
  sounds learned time-domain kernels resembling measured auditory filters and
  encoded the modeled corpus efficiently.
- **Boundary:** this is a computational model; representation efficiency under
  its objective is not measured biological or hardware energy efficiency.

### ACOUSTIC-023 — Learned efficient auditory codes depend on the sound ensemble

- **Status:** established.
- **Primary source:** Lewicki,
  [DOI 10.1038/nn831](https://doi.org/10.1038/nn831); Smith and Lewicki,
  [DOI 10.1038/nature04485](https://doi.org/10.1038/nature04485).
- **Observation:** learned basis functions differed with natural-sound and
  speech ensembles, showing that efficient features are distribution-qualified.
- **Boundary:** a natural-corpus match does not guarantee task transfer,
  robustness, causal grouping, or efficiency after encoder/decoder cost.

### ACOUSTIC-024 — Efferent activation can reduce cochlear gain and enhance masked-tone nerve responses

- **Status:** established.
- **Primary source:** Kawase, Delgutte, and Liberman,
  [DOI 10.1152/jn.1993.70.6.2533](https://doi.org/10.1152/jn.1993.70.6.2533).
- **Observation:** contralateral stimulation activating the olivocochlear reflex
  altered cat auditory-nerve responses and enhanced responses to some masked
  tones despite suppressive gain effects.
- **Boundary:** preparation, masker, level, frequency, and contralateral
  stimulus bound the effect; AGC, lateral inhibition, and adaptive filtering
  remain engineering nulls.

### ACOUSTIC-025 — A general human speech-in-noise benefit from medial olivocochlear strength remains disputed

- **Status:** disputed.
- **Primary source:** Rao et al.,
  [DOI 10.3390/brainsci10070428](https://doi.org/10.3390/brainsci10070428).
- **Observation:** the small human electrophysiological study did not establish
  a simple one-to-one mapping from otoacoustic-emission inhibition to all
  behavioral and cortical listening-in-noise outcomes.
- **Boundary:** cochlear suppression, neural protection, attention, detection,
  and intelligibility are distinct; a claimed efferent controller must select
  its literal endpoint.

### ACOUSTIC-026 — Biosonar call timing changes with spatial task difficulty

- **Status:** established.
- **Primary source:** Moss et al.,
  [DOI 10.1371/journal.pbio.0040079](https://doi.org/10.1371/journal.pbio.0040079).
- **Observation:** big brown bats changed pulse grouping and terminal call
  timing when intercepting insects near clutter, alongside lower success and
  longer initiation time.
- **Boundary:** temporal emission control is coupled to flight, respiration,
  clutter, and task; it does not identify a generic scheduler.

### ACOUSTIC-027 — Echolocating bats adapt emission level with target distance

- **Status:** established.
- **Primary source:** Surlykke and Kalko,
  [DOI 10.1371/journal.pone.0002036](https://doi.org/10.1371/journal.pone.0002036).
- **Observation:** field-array measurements found high source levels and
  distance-dependent level reduction as several bat species approached the
  recording array or background.
- **Boundary:** source-level estimation depends on beam aim, array geometry,
  propagation, and reference distance; active power control is already mature.

### ACOUSTIC-028 — Echolocators can steer and reshape their acoustic field of view

- **Status:** established.
- **Primary source:** Yovel et al.,
  [DOI 10.1371/journal.pbio.1001150](https://doi.org/10.1371/journal.pbio.1001150).
- **Observation:** Egyptian fruit bats changed click-pair aim and emission
  intensity in a multiple-object task, controlling spatial acoustic sampling.
- **Boundary:** beam steering, waveform design, and sequential sensor placement
  are established engineering operations and remain the null mechanisms.

### ACOUSTIC-029 — Head and pinna motion can be coordinated with sonar emission

- **Status:** established.
- **Primary source:** Wohlgemuth, Kothari, and Moss,
  [DOI 10.1371/journal.pbio.1002544](https://doi.org/10.1371/journal.pbio.1002544).
- **Observation:** synchronized audio and stereo video showed coordinated call,
  head, and ear changes that enhanced target-localization cues in flying bats.
- **Boundary:** receiver motion and emission are joint interventions; their
  separate value requires factorial ablation and complete motion/emission cost.

### ACOUSTIC-030 — Human experts can use self-generated echoes, with extensive experience and neural reorganization

- **Status:** established.
- **Primary source:** Thaler, Arnott, and Goodale,
  [DOI 10.1371/journal.pone.0020162](https://doi.org/10.1371/journal.pone.0020162).
- **Observation:** fMRI and behavioral measurements in early- and late-blind
  expert echolocators showed echo-specific responses including occipital
  recruitment.
- **Boundary:** the small expert sample, blindness history, training, click
  production, and scanner playback bound the result; it does not establish a
  general-purpose transferable sonar representation.

### ACOUSTIC-031 — Spectral jamming avoidance in bats is context-dependent rather than universal

- **Status:** disputed.
- **Primary source:** Bates, Stamper, and Simmons,
  [DOI 10.1242/jeb.009688](https://doi.org/10.1242/jeb.009688); Cvikel et al.,
  [DOI 10.1098/rspb.2014.2274](https://doi.org/10.1098/rspb.2014.2274).
- **Observation:** controlled laboratory playbacks elicited frequency shifts in
  one task, whereas on-board field recordings did not find a classical spectral
  jamming-avoidance response during close encounters.
- **Boundary:** species, task, interferer waveform, echo-to-noise ratio, social
  setting, and measurement frame must accompany the claim.

### ACOUSTIC-032 — Echo-ranging resolution is waveform- and ambiguity-qualified

- **Status:** established.
- **Primary source:** Simmons,
  [DOI 10.1126/science.203.4379.16](https://doi.org/10.1126/science.203.4379.16).
- **Observation:** behavioral echo-delay discrimination in bats demonstrated
  fine temporal ranging under the tested broadband sonar conditions.
- **Boundary:** bandwidth, SNR, target, ambiguity function, training, and motor
  timing define the resolution; microsecond discrimination is not free global
  clock precision.

### ACOUSTIC-033 — Generalized cross-correlation is a mature time-delay estimator

- **Status:** established.
- **Primary source:** Knapp and Carter,
  [DOI 10.1109/TASSP.1976.1162830](https://doi.org/10.1109/TASSP.1976.1162830).
- **Observation:** the generalized-correlation framework derives frequency
  weightings for estimating delay under stated signal and noise assumptions.
- **Boundary:** biological timing analogies must beat tuned GCC variants under
  the same bandwidth, synchronization, reverberation, and compute budget.

### ACOUSTIC-034 — Adaptive minimum-variance beamforming is a mature spatial-allocation null

- **Status:** established.
- **Primary source:** Capon,
  [DOI 10.1109/PROC.1969.7278](https://doi.org/10.1109/PROC.1969.7278).
- **Observation:** data-dependent minimum-variance spatial spectral estimation
  achieves narrower response than conventional fixed windows under its model.
- **Boundary:** covariance estimation, source coherence, array calibration,
  sample support, and steering mismatch can erase the advantage.

### ACOUSTIC-035 — Subspace methods provide a mature high-resolution direction-of-arrival null

- **Status:** established.
- **Primary source:** Schmidt,
  [DOI 10.1109/TAP.1986.1143830](https://doi.org/10.1109/TAP.1986.1143830).
- **Observation:** MUSIC separates modeled signal and noise subspaces to
  estimate source number, direction, strength, and correlation under explicit
  assumptions.
- **Boundary:** model order, snapshot count, source coherence, noise structure,
  array manifold, and calibration are not optional.

### ACOUSTIC-036 — Blind separation by independence is mature but assumption-bound

- **Status:** established.
- **Primary source:** Bell and Sejnowski,
  [DOI 10.1162/neco.1995.7.6.1129](https://doi.org/10.1162/neco.1995.7.6.1129).
- **Observation:** information-maximizing nonlinear learning separated scoped
  mixtures and addressed blind deconvolution without known source waveforms.
- **Boundary:** independence, sensor/source count, mixing model, scale,
  permutation, stationarity, and noise determine identifiability.

### ACOUSTIC-037 — Time--frequency sparsity supports separation only under overlap assumptions

- **Status:** established.
- **Primary source:** Yılmaz and Rickard,
  [DOI 10.1109/TSP.2004.828896](https://doi.org/10.1109/TSP.2004.828896).
- **Observation:** DUET demonstrated blind speech-mixture separation using
  attenuation/delay clustering and approximate time--frequency disjointness.
- **Boundary:** dense overlap, reverberation, moving sources, phase, and array
  mismatch violate the favorable condition.

### ACOUSTIC-038 — Deep clustering is an established learned separation baseline

- **Status:** established.
- **Primary source:** Hershey et al.,
  [DOI 10.1109/ICASSP.2016.7471631](https://doi.org/10.1109/ICASSP.2016.7471631).
- **Observation:** learned time--frequency embeddings clustered mixture bins by
  source and improved the evaluated multi-speaker separation benchmark.
- **Boundary:** corpus construction, source count, speaker overlap, room,
  permutation, and evaluation metric define the result.

### ACOUSTIC-039 — Permutation-invariant training directly addresses output-label ambiguity

- **Status:** established.
- **Primary source:** Yu et al.,
  [arXiv 1607.00325](https://arxiv.org/abs/1607.00325).
- **Observation:** utterance-level permutation selection enabled direct training
  of multi-talker separators without a fixed output-speaker order.
- **Boundary:** resolving label permutation does not resolve causal source
  identity, unknown source count, open-set generalization, or room shift.

### ACOUSTIC-040 — Time-domain learned separation is a mature high-capacity null

- **Status:** established.
- **Primary source:** Luo and Mesgarani,
  [DOI 10.1109/TASLP.2019.2915167](https://doi.org/10.1109/TASLP.2019.2915167).
- **Observation:** Conv-TasNet learned an encoder, masks, and decoder and
  exceeded the evaluated ideal magnitude-mask baseline on scoped speech data.
- **Boundary:** training data, latency, causal mode, compute, phase, source
  count, language, acoustics, and downstream task must be retested.

### ACOUSTIC-041 — Source-separation metrics can hide severe waveform changes

- **Status:** established.
- **Primary source:** Le Roux et al.,
  [DOI 10.1109/ICASSP.2019.8683855](https://doi.org/10.1109/ICASSP.2019.8683855).
- **Observation:** the analysis showed that common BSS Eval variants could
  forgive large filtering changes and proposed a clearly defined SI-SDR.
- **Boundary:** SI-SDR itself does not measure intelligibility, localization,
  calibration, identity, perceptual quality, or lifecycle cost.

### ACOUSTIC-042 — Cochlear-like front ends are already conventional signal-processing baselines

- **Status:** established.
- **Primary source:** Irino and Patterson,
  [DOI 10.1109/TASL.2006.874669](https://doi.org/10.1109/TASL.2006.874669);
  Glasberg and Moore,
  [DOI 10.1016/0378-5955(90)90170-T](https://doi.org/10.1016/0378-5955(90)90170-T).
- **Observation:** auditory filterbank models and psychophysical filter
  derivations predate modern neural architectures and can be implemented as
  fixed or learned multirate transforms.
- **Boundary:** calling a front end “cochlear” does not distinguish it from ERB,
  gammatone, wavelet, constant-Q, or learnable convolutional baselines.

### ACOUSTIC-043 — Active acoustic sensing changes both information and physical cost

- **Status:** established.
- **Primary source:** Moss et al.,
  [DOI 10.1371/journal.pbio.0040079](https://doi.org/10.1371/journal.pbio.0040079);
  Wohlgemuth et al.,
  [DOI 10.1371/journal.pbio.1002544](https://doi.org/10.1371/journal.pbio.1002544).
- **Observation:** emission timing and receiver orientation vary with task and
  alter returned acoustic evidence.
- **Boundary:** every active-sensing claim must charge emission, motion,
  detectability, interference, exposure, calibration, latency, and compute.

### ACOUSTIC-044 — Sparse auditory activity is not a complete energy claim

- **Status:** plausible.
- **Primary source:** Hromádka et al.,
  [DOI 10.1371/journal.pbio.0060016](https://doi.org/10.1371/journal.pbio.0060016);
  Smith and Lewicki,
  [DOI 10.1038/nature04485](https://doi.org/10.1038/nature04485).
- **Observation:** sparse population responses and sparse model codes are
  empirically or computationally supported in their scopes.
- **Boundary:** input transduction, spontaneous activity, inhibition, timing,
  routing, memory, decoder, training, and hardware overhead must be measured
  before claiming energy efficiency.

### ACOUSTIC-045 — Calibration identity is part of the learned acoustic task

- **Status:** plausible.
- **Primary source:** [IEC 61672-1:2013](https://webstore.iec.ch/en/publication/5708),
  [ISO 3382-1:2009](https://www.iso.org/standard/40979.html), and Kato et al.,
  [DOI 10.1250/ast.24.315](https://doi.org/10.1250/ast.24.315).
- **Observation:** instrument response, room response, receiver geometry, and
  listener-specific transfer functions materially change measured inputs and
  localization outcomes.
- **Boundary:** calibration metadata can be a shortcut; it must improve
  counterfactual transfer and uncertainty rather than merely identify a device.

### ACOUSTIC-046 — The transferable residual is an operator- and action-qualified evaluation contract

- **Status:** speculative.
- **Primary sources:** evidence synthesized in ACOUSTIC-001 through
  ACOUSTIC-045 and tested by E-ACOUSTIC-01 through E-ACOUSTIC-09 below.
- **Observation:** no audited paper demonstrates that the whole contract beats
  a complete calibrated filterbank, spatial inference, separation, active
  sensing, control, uncertainty, and lifecycle-accounting stack.
- **Boundary:** preserve the contract even if every architectural residual is
  retired.

## Negative results, traps, and overclaims

1. **A decibel without a reference is not a measurement.** Pressure, power,
   exposure, hearing level, weighting, and source level use different references
   and boundaries.
2. **A cochlear filter is not one fixed kernel.** Place, level, health, species,
   stimulus, and estimation method alter the effective response.
3. **Compression is not free robustness.** Nonlinear gain can introduce
   distortion, intermodulation, calibration dependence, and information loss.
4. **Phase locking is not universally precise.** Timing fidelity falls with
   frequency and depends on SNR, stimulus, neuron, and estimator.
5. **Sparse spikes are not joules.** A sparse output can rely on expensive
   transduction, inhibition, background activity, timing, and decoding.
6. **Masking is not one SNR.** Energetic overlap, uncertainty, grouping,
   spatial release, language, attention, and decision criterion can differ.
7. **Temporal coherence is not source identity.** Common modulation can bind
   unrelated sources, while one source may contain asynchronous components.
8. **An impulse response is not a room identity.** It changes with source,
   receiver, orientation, occupancy, objects, air state, and measurement support.
9. **Perceptual compensation is not physical dereverberation.** Better word
   identification does not show recovery of the direct waveform.
10. **A static HRTF is not localization.** Individual anatomy, headphone
    transfer, head motion, source spectrum, and room reflections matter.
11. **Active sensing is not passive inference plus a microphone.** The emission
    and receiver action change the experiment and can reveal, disturb, or jam.
12. **Jamming avoidance is not universal.** Laboratory and field results can
    disagree across task, species, waveform, and reference frame.
13. **A beam narrower than a conventional one is not necessarily better.**
    Steering mismatch, sidelobes, white-noise gain, correlated sources, and
    reverberation can reduce task utility or robustness.
14. **Source separation is not causal source understanding.** Scale,
    permutation, filtering, source count, identity, and semantic attribution
    can remain unresolved.
15. **One separation metric is not an outcome vector.** SI-SDR can improve while
    intelligibility, localization, calibration, or downstream decisions worsen.
16. **Simulation can create an inverse crime.** Training and evaluation with the
    same room renderer, array manifold, HRTF family, clocks, and noise model
    exaggerates transfer.
17. **More microphones are not a free control.** Aperture, synchronization,
    calibration, bandwidth, cabling, networking, maintenance, and embodied
    energy change.
18. **Emission energy is not system energy.** Transducer inefficiency, motion,
    sensing, compute, networking, storage, cooling, calibration, and fabrication
    remain in the boundary.

## Decisive equal-budget experiments

### E-ACOUSTIC-01 — Level-dependent front-end and compression ladder

**Question.** Does a cochlea-inspired adaptive front end improve protected
auditory tasks beyond mature fixed and learned multirate front ends?

**Design.** Cross level, centre frequency, dynamic range, impulsive/continuous
input, quiet/noise, compression history, sensor response, and held-out acoustic
domains. Include linear tones, speech, environmental events, and transient
hazards.

**Matched budget.** Same raw samples, sample precision, channels, parameters,
state bytes, latency, training examples, updates, hardware, and wall-power
boundary.

**Nulls.** FFT, wavelet, mel, ERB, gammatone/gammachirp, learned convolution,
AGC, multiband compression, PCEN, and ordinary adaptive normalization.

**Outcomes.** Detection, discrimination, identification, calibration, clipped
events, recoverable waveform information, bytes, latency, and lifecycle joules.

**Decisive result.** Retain only a residual that improves a preregistered
quality--risk--energy frontier across sensor and corpus shifts. Retire it if a
standard filterbank plus compression matches the result.

### E-ACOUSTIC-02 — Sparse event timing versus dense multirate processing

**Question.** Do sparse auditory events retain task-relevant timing at lower
complete cost?

**Design.** Cross event thresholds, refractory periods, timestamp precision,
frequency bands, SNR, modulation rate, source overlap, packet loss, and clock
jitter. Evaluate first-stage encoding through downstream localization,
separation, recognition, and hazard detection.

**Matched budget.** Same sensor bandwidth, quantization, observation duration,
memory, decoder capacity, training data, latency, and hardware class.

**Nulls.** dense PCM/filterbank, conventional onset/VAD, sparse convolution,
compressed sensing under verified assumptions, codec, and duty-cycled DSP.

**Outcomes.** information/task, timing error in microseconds, missed events,
false events, active fraction, operations, bytes, latency, and joules.

**Decisive result.** Sparse coding must reduce measured bytes and joules without
losing protected timing or tail events. A lower event count alone fails.

### E-ACOUSTIC-03 — Active emission and receiver-action co-design

**Question.** Does joint emission/reception control acquire more decision value
than fixed sensing, optimal waveform design, or ordinary active control?

**Design.** Factor emitted spectrum, duration, level, aim, repetition,
head/array motion, target reflectivity, range, clutter, moving targets,
interferers, detectability, and exposure limits. Withhold target and room
families.

**Matched budget.** Same acoustic energy, peak pressure, motion work, sensing,
queries, duration, actuator authority, compute, failures, and safety allowance.

**Nulls.** matched filter, ambiguity-function waveform design, adaptive radar/
sonar scheduling, POMDP, dual control, active SLAM, Bayesian experiment design,
and one-step value of information.

**Outcomes.** detection, range and direction error, calibration, information
gain, task value, time, exposure, detectability, interference, motion work, and
complete joules.

**Decisive result.** Retain only a residual that transfers to new targets and
rooms beyond the strongest conventional active-sensing policy at equal action
and energy.

### E-ACOUSTIC-04 — Binaural and array localization under operator shift

**Question.** Does a proposed timing/spatial mechanism remain calibrated when
head, HRTF, array, room, source spectrum, and motion change?

**Design.** Cross low/high/broadband sources, ITD/ILD/spectral conflicts,
individual and nonindividual transfer functions, head motion, aperture,
microphone failure, reverberation, moving sources, and correlated interferers.

**Matched budget.** Same channels, aperture, samples, clocks, calibration
access, motion, parameters, adaptation samples, latency, and energy.

**Nulls.** GCC-PHAT, Bayesian delay, SRP, delay-and-sum, MVDR, robust
beamforming, MUSIC/ESPRIT, particle tracking, and active localization MPC.

**Outcomes.** azimuth/elevation and range error, front/back errors, source count,
calibration, dropout recovery, latency, motion, bytes, and joules.

**Decisive result.** Retain only if the mechanism improves held-out operator and
room transfer. Retire it if individualized calibration or a conventional array
stack accounts for the gain.

### E-ACOUSTIC-05 — Reverberation adaptation versus explicit operator estimation

**Question.** Does contextual adaptation improve speech or event decisions
beyond explicit room estimation and adaptive filtering?

**Design.** Cross consistent/inconsistent room context, source/receiver move,
direct-to-reverberant ratio, early/late reflections, context duration,
non-reverberant spectral controls, listener/model history, and held-out rooms.

**Matched budget.** Same context samples, impulse-response probes, adaptation
updates, memory, latency, and energy.

**Nulls.** WPE, multichannel Wiener filtering, blind system identification,
room-conditioned normalization, adaptive convolution, state-space context, and
fine-tuning on an equal target sample.

**Outcomes.** intelligibility, event identification, waveform fidelity,
distance, calibration, transfer, forgetting, adaptation time, and cost.

**Decisive result.** Preserve only task-specific contextual value that survives
non-room spectral controls and new rooms. Do not relabel perceptual compensation
as dereverberation.

### E-ACOUSTIC-06 — Masked-scene grouping and separation ladder

**Question.** Does an auditory grouping mechanism add value beyond complete
spatial, statistical, and learned separation?

**Design.** Cross energetic and informational maskers, harmonicity, common
onset, temporal coherence/conflict, spatial separation, reverberation, source
count, familiar/novel sources, moving sources, and ambiguous mixtures.

**Matched budget.** Same mixtures, clean supervision, source metadata,
microphones, parameters, memory, augmentations, compute, latency, and energy.

**Nulls.** ideal and estimated masks, NMF, ICA/IVA, DUET, spatial mixture model,
MVDR, deep clustering, PIT, Conv-TasNet, neural beamforming, target extraction,
and complete conventional composition.

**Outcomes.** detection, intelligibility, grouping assignment, SI-SDR,
localization, causal identity, uncertainty, downstream task value, failures,
latency, person-hours, and joules.

**Decisive result.** A residual must improve protected tasks under held-out
source, room, count, and cue-conflict strata. Metric-only separation gains fail.

### E-ACOUSTIC-07 — Efferent-like peripheral control

**Question.** Does task-conditioned front-end gain improve masked decisions
beyond AGC, adaptive filters, and end-to-end attention?

**Design.** Cross target frequency, masker spectrum and stationarity, level,
contralateral input, task cue, feedback delay, sensor saturation, calibration
drift, and target-absent trials.

**Matched budget.** Same observation, control bandwidth, gain range, update
rate, parameters, labels, latency, and energy.

**Nulls.** multiband AGC/compression, Wiener filtering, lateral inhibition,
adaptive noise cancellation, beamforming, feature attention, and calibrated
selective prediction.

**Outcomes.** cochlear/front-end gain, detection sensitivity, intelligibility,
calibration, distortion, recovery time, false suppression, and joules.

**Decisive result.** Retain only endpoint-specific value under held-out maskers
and sensors. Suppression without protected task improvement is not a pass.

### E-ACOUSTIC-08 — Multi-emitter interference and jamming audit

**Question.** Does adaptive emission coordination beat ordinary spectrum access,
power control, and robust sensing?

**Design.** Cross emitter count, overlap, identity, cooperative/adversarial
behavior, stationary/moving geometry, spectral and temporal collision, clutter,
echo-to-interference ratio, authentication, and turnover.

**Matched budget.** Same emissions, spectrum, time, power, messages, identities,
memory, sensing, latency, and total joules.

**Nulls.** TDMA/FDMA/CDMA, randomized access, listen-before-talk, power control,
frequency hopping, coded probes, interference cancellation, explicit protocol,
game-theoretic allocation, and robust detection.

**Outcomes.** target detection/range, collision and false-association rates,
throughput, fairness, exploitability, cross-play, messages, exposure, and energy.

**Decisive result.** Retain only if the policy transfers across emitter
populations and adversaries. A task-specific frequency shift is not a universal
jamming mechanism.

### E-ACOUSTIC-09 — Complete acoustic lifecycle trial

**Question.** Does the proposed acoustic composition improve protected outcomes
after every acquisition and operational cost is charged?

**Design.** Replicate E-ACOUSTIC-01 through 08 across at least two source
families, rooms/media, transducer/array designs, model families, sites, and
hardware classes, with sealed natural-scene evaluation.

**Matched budget.** Identical samples, labels, clean references, simulations,
physical recordings, sensors, emitters, actuator work, parameters, storage,
calibration, tuning trials, person-hours, hardware, failures, and service-life
energy.

**Nulls.** strongest complete conventional stack from this audit.

**Outcomes.** the entire firewall plus data, training, emission, sensing,
inference, motion, communication, storage, calibration, maintenance, embodied
joules, human hours, unsafe exposure, detectability, and replacements.

**Decisive result.** Retain only a preregistered Pareto improvement with
non-inferiority on every protected outcome. Otherwise preserve the measurement
contract and retire the composition.

## Deduplication against P-001 through P-013

| Principle | Acoustic recurrence | Disposition |
| --- | --- | --- |
| [P-001 — Selective allocation](../principle-registry.md#p-001--selective-allocation) | auditory filtering, masking release, beamforming, selective listening | direct recurrence; compare fixed/adaptive filters, beamformers, and attention |
| [P-002 — Local resolution and escalation](../principle-registry.md#p-002--local-autonomy-with-exception-escalation) | peripheral filtering and gain precede central scene decisions | ordinary cascades and multistage detection already cover it |
| [P-003 — Temporary trace before commitment](../principle-registry.md#p-003--temporary-trace-before-commitment) | echo integration, precedence windows, tentative stream assignments | sequential tests, buffers, trackers, and beam search remain nulls |
| [P-004 — Diversity, selection, protection](../principle-registry.md#p-004--diversity-selection-and-protection) | competing source hypotheses and beam candidates | standard multi-hypothesis tracking, sampling, and search; no new bundle |
| [P-005 — Use-dependent topology](../principle-registry.md#p-005--use-dependent-topology) | learned filterbanks and scene-specialized routes | no evidence here for topology change beyond routing/learning |
| [P-006 — Slow negative feedback](../principle-registry.md#p-006--homeostatic-negative-feedback) | cochlear efferent gain, AGC, level adaptation | direct recurrence; conventional feedback/compression is decisive |
| [P-007 — Prediction-error allocation](../principle-registry.md#p-007--prediction-error-allocation) | active emission, head motion, adaptive probing, uncertain source tracking | strong recurrence; POMDP, VOI, optimal design, and active SLAM are nulls |
| [P-008 — Compartmentalized interaction](../principle-registry.md#p-008--compartmentalized-interaction) | frequency channels and source streams | filterbanks, subbands, modular separators, and typed streams already cover it |
| [P-009 — Execution versus maintenance](../principle-registry.md#p-009--maintenance-plane) | online listening versus calibration, room adaptation, and model update | direct lifecycle distinction; no new mechanism |
| [P-010 — Computation into structure](../principle-registry.md#p-010--structural-offloading-and-co-design) | pinna/head transfer, cochlear mechanics, microphone geometry, analog front ends | strong recurrence; passive arrays, analog filters, DSP/FPGA/ASIC are nulls |
| [P-011 — Transient temporal coalitions](../principle-registry.md#p-011--transient-communication-coalitions) | temporal coherence and cross-band source grouping | plausible recurrence, but conventional binding/tracking may explain it |
| [P-012 — Memory matched to lifetime](../principle-registry.md#p-012--memory-matched-to-information-lifetime) | waveform samples, echo traces, room state, source identity, learned acoustics | strengthen lifetime/operator metadata; no new storage rule |
| [P-013 — Shared environmental state](../principle-registry.md#p-013--externalized-shared-state) | reverberant field and public emissions influence later receivers | physical recurrence, but shared sound is lossy, propagating, and collision-prone |

Every apparent recurrence maps to an existing bundle or an established signal-
processing/control method. The evidence does not justify another registry entry.

## Disposition against current candidates

| Candidate | Acoustic pressure | Disposition |
| --- | --- | --- |
| [001 — Adaptive topology](../../experiments/candidates/001-adaptive-topology.md) | array geometry and receiver motion change spatial support | compare fixed/movable arrays and active localization; no topology credit |
| [002 — Multiscale context broadcast](../../experiments/candidates/002-multiscale-context-broadcast.md) | cochlear/modulation filterbanks provide multirate context | standard multirate DSP and recurrent conditioning remain decisive |
| [003 — Recovery-dynamics fragility](../../experiments/candidates/003-recovery-dynamics-fragility.md) | calibration drift, saturation, and gain recovery are measurable | use conventional diagnostics/system ID; no generic precursor |
| [004 — Closed endogenous curriculum](../../experiments/candidates/004-closed-endogenous-curriculum.md) | adaptive emissions and scene curricula can target uncertainty | apply E-ACOUSTIC-03/06; POMDP, design, and curriculum nulls remain |
| [005 — Severity-ordered containment](../../experiments/candidates/005-severity-ordered-containment.md) | overload, unsafe exposure, sensor saturation, and jamming need graded action | standard limiters, shutdown, fallback, and repair dominate |
| [006 — Reversible physical skill](../../experiments/candidates/006-reversible-physical-skill.md) | analog cochlear/beamforming front ends may compile recurring transforms | compare fixed analog, DSP, FPGA/ASIC, recalibration, drift, and replacement |
| [007 — Endogenous observation surveillance](../../experiments/candidates/007-endogenous-observation-surveillance.md) | emission and receiver movement alter both scene and telemetry | strongest conceptual owner with POMDP/dual-control nulls |
| [008 — Contestable modular allocation](../../experiments/candidates/008-contestable-modular-allocation.md) | emitters can interfere or game shared spectrum | only relevant under strategic actors; mature spectrum mechanisms apply |
| [009 — Graded assurance envelopes](../../experiments/candidates/009-graded-assurance-envelopes.md) | operator, calibration, exposure, and uncertainty constrain deployable claims | useful assurance case; standards and conventional validation remain nulls |
| [010 — Reset-coupled staged verification](../../experiments/candidates/010-reset-coupled-staged-verification.md) | repeated pings or observations can add conditional information | sequential detection and matched filtering must be beaten |
| [011 — Dual-loop operational assurance](../../experiments/candidates/011-dual-loop-operational-assurance.md) | online monitoring and offline acoustic-model repair are distinct | conventional calibration, telemetry, incident response, and retraining apply |
| [012 — Latency-qualified authority](../../experiments/candidates/012-latency-qualified-authority.md) | evidence age and sound travel time bound safe actions | useful benchmark; standard delay-aware estimation/control is decisive |
| [013 — Deficit--capability routing](../../experiments/candidates/013-deficit-capability-routing.md) | band/source deficits could route sensing and compute | compare centralized, backpressure, VOI, and learned allocation |
| [014 — Versioned observation contract](../../experiments/candidates/014-versioned-observation-contract.md) | source, transfer, support, response, calibration, selection, and vintage define evidence | strongest owner of ACOUSTIC-046 |
| [015 — Repairable conventions](../../experiments/candidates/015-versioned-repairable-conventions.md) | emitter codes and coordination can drift under turnover/jamming | typed spectrum/protocol stacks and authentication are nulls |
| [016 — Conflict-bounded unit transition](../../experiments/candidates/016-conflict-bounded-unit-transition.md) | auditory streams are inferred source units | grouping is not a heritable system-level unit; no support |
| [017 — Semantic compaction](../../experiments/candidates/017-contract-preserving-semantic-compaction.md) | audio summaries may omit phase, room, ambiguity, or rare events | apply query-specific preservation and waveform/provenance tests |
| [018 — Value/reconstructability tiering](../../experiments/candidates/018-value-reconstructability-aware-tiering.md) | raw waveforms, events, impulse responses, and source estimates differ in value/reconstructability | evaluate storage/recompute under calibration and rare-event cost |
| [019 — Audited cumulative inheritance](../../experiments/candidates/019-audited-cumulative-inheritance.md) | corpora, HRTFs, room responses, labels, and calibration lineage shape later capability | charge recording/annotation/listening-test effort and dataset selection |
| [020 — Constitutional control plane](../../experiments/candidates/020-constitutional-control-plane.md) | emission authority and privacy/exposure limits can be governed | governance case only; no acoustic control primitive |

## Disposition against current fixtures

| Fixture | Acoustic use | Disposition |
| --- | --- | --- |
| [F-001 — Shared-clock-free predictive co-adaptation](../../experiments/fixtures/001-shared-clock-free-coadaptation.md) | timing, phase, entrainment, jitter, and sparse pulses are direct stressors | add acoustic timing only as a future domain, not a new fixture |
| [F-002 — Versioned reconstructive design](../../experiments/fixtures/002-versioned-reconstructive-design.md) | sound generation and design need versioned source/room provenance | adjacent creative workflow; not an inference benchmark |
| [F-003 — Opportunity/history-qualified action](../../experiments/fixtures/003-opportunity-history-qualified-action.md) | self-emission and receiver motion make action opportunity explicit | direct active-sensing application |
| [F-004 — Versioned proof discovery](../../experiments/fixtures/004-versioned-proof-discovery.md) | acoustical derivations can test dimensional analysis | no mechanism overlap |
| [F-005 — Regime-qualified flow inference](../../experiments/fixtures/005-regime-qualified-flow-inference-control.md) | acoustic propagation is a wave/medium problem with boundary and operator error | reuse regime/operator discipline; do not collapse fluid and auditory outcomes |
| [F-006 — Representative adaptive performance](../../experiments/fixtures/006-representative-adaptive-performance.md) | perception--action coupling, opponents/jamming, fatigue/resource, transfer, and cost apply | use as a broad performance shell around E-ACOUSTIC tracks |
| [F-007 — Operator-qualified optical inference](../../experiments/fixtures/007-operator-qualified-optical-inference.md) | both domains require calibrated forward operators, support, selection, and inverse-crime controls | share the operator contract, retain modality-specific physics |

No additional fixture is warranted before E-ACOUSTIC-01 through 09 show a
residual that the existing candidates and fixtures cannot express.

## Open questions

1. Which acoustic tasks benefit from biologically shaped filters after strong
   learned and fixed ERB/gammatone/wavelet front ends receive equal budgets?
2. Can event-based acoustic encoders reduce measured memory traffic and energy
   without losing fine timing, weak sustained sources, or rare hazards?
3. Which level-dependent compression state transfers across microphones,
   rooms, source classes, and hearing/device conditions?
4. Can a learned system distinguish energetic masking, informational masking,
   calibration failure, and source-count uncertainty prospectively?
5. When does temporal coherence add source-binding value beyond harmonicity,
   spatial cues, explicit generative models, and learned separation?
6. Which late reflections are nuisance, which carry distance/layout value, and
   which are required for stable action?
7. Can room adaptation transfer across source/receiver movement without
   catastrophic normalization to a stale operator?
8. Does joint emission and receiver motion outperform optimal waveform design
   plus active localization after motion, exposure, and detectability costs?
9. How should acoustic action abstain when echo association is multimodal or
   the array manifold is outside calibration?
10. Can opponent-aware emission policies resist colluding or imitating
    emitters beyond authenticated coded probes and standard spectrum access?
11. Does an efferent-like control path add value beyond multiband AGC,
    beamforming, adaptive filtering, and end-to-end attention?
12. Which component of sparse auditory processing saves physical energy:
    transduction, representation, memory movement, routing, or computation?
13. Can active acoustic sensing be evaluated without leaking simulator room
    parameters, target impulse responses, or paired random seeds?
14. What calibration state must travel with a separated source so later
    localization, identity, and uncertainty remain valid?
15. How should a source-separation system represent unresolved source count,
    permutation, causal identity, and residual mixture energy?
16. Which auditory summaries preserve the future queries that justified raw
    waveform storage, and when is reconstruction cheaper than retention?
17. Can a mobile array learn when movement is worth its latency, risk, wear,
    and energy beyond ordinary value of information?
18. What is the physically meaningful lower bound for a declared acoustic task
    after aperture, bandwidth, SNR, clock, room, and transducer constraints?
19. Which lifecycle term dominates at scale: recording, annotation, training,
    continuous sensing, emission, networking, calibration, or hardware?
20. Does any integrated residual survive the complete conventional composition
    and the nine equal-budget experiments?

## Primary-source bibliography

### Standards and physical measurement

- International Electrotechnical Commission. (2013). *IEC 61672-1:2013,
  Electroacoustics—Sound level meters—Part 1: Specifications*.
  [Authoritative standard](https://webstore.iec.ch/en/publication/5708).
- International Organization for Standardization. (2009). *ISO 3382-1:2009,
  Acoustics—Measurement of room acoustic parameters—Part 1: Performance
  spaces*. [Authoritative standard](https://www.iso.org/standard/40979.html).
- International Organization for Standardization. (2020). *ISO 80000-8:2020,
  Quantities and units—Part 8: Acoustics*.
  [Authoritative standard](https://www.iso.org/standard/64974.html).

### Cochlear mechanics, filtering, timing, and efferent control

- Robles, L., Ruggero, M. A., & Rich, N. C. (1986). Basilar membrane mechanics
  at the base of the chinchilla cochlea. I. Input-output functions, tuning
  curves, and response phases. *JASA, 80*, 1364–1374.
  [DOI 10.1121/1.394389](https://doi.org/10.1121/1.394389).
- Ruggero, M. A., Rich, N. C., Recio, A., Narayan, S. S., & Robles, L. (1997).
  Basilar-membrane responses to tones at the base of the chinchilla cochlea.
  *JASA, 101*, 2151–2163.
  [DOI 10.1121/1.418265](https://doi.org/10.1121/1.418265).
- Mellado Lagarde, M. M., Drexl, M., Lukashkina, V. A., Lukashkin, A. N., &
  Russell, I. J. (2008). Outer hair cell somatic, not hair bundle, motility is
  the basis of the cochlear amplifier. *Nature Neuroscience, 11*, 746–748.
  [DOI 10.1038/nn.2129](https://doi.org/10.1038/nn.2129).
- Glasberg, B. R., & Moore, B. C. J. (1990). Derivation of auditory filter
  shapes from notched-noise data. *Hearing Research, 47*, 103–138.
  [DOI 10.1016/0378-5955(90)90170-T](https://doi.org/10.1016/0378-5955(90)90170-T).
- Moore, B. C. J., Peters, R. W., & Glasberg, B. R. (1990). Auditory filter
  shapes at low center frequencies. *JASA, 88*, 132–140.
  [DOI 10.1121/1.399960](https://doi.org/10.1121/1.399960).
- Viemeister, N. F. (1979). Temporal modulation transfer functions based upon
  modulation thresholds. *JASA, 66*, 1364–1380.
  [DOI 10.1121/1.383036](https://doi.org/10.1121/1.383036).
- Johnson, D. H. (1980). The relationship between spike rate and synchrony in
  responses of auditory-nerve fibers to single tones. *JASA, 68*, 1115–1122.
  [DOI 10.1121/1.383076](https://doi.org/10.1121/1.383076).
- Joris, P. X., Carney, L. H., Smith, P. H., & Yin, T. C. T. (1994).
  Enhancement of neural synchronization in the anteroventral cochlear nucleus.
  I. Responses to tones at the characteristic frequency. *Journal of
  Neurophysiology, 71*, 1022–1036.
  [DOI 10.1152/jn.1994.71.3.1022](https://doi.org/10.1152/jn.1994.71.3.1022).
- Kawase, T., Delgutte, B., & Liberman, M. C. (1993). Antimasking effects of
  the olivocochlear reflex. II. Enhancement of auditory-nerve response to
  masked tones. *Journal of Neurophysiology, 70*, 2533–2549.
  [DOI 10.1152/jn.1993.70.6.2533](https://doi.org/10.1152/jn.1993.70.6.2533).
- Rao, A., Koerner, T. K., Madsen, B., & Zhang, Y. (2020). Investigating
  influences of medial olivocochlear efferent system on central auditory
  processing and listening in noise. *Brain Sciences, 10*, 428.
  [DOI 10.3390/brainsci10070428](https://doi.org/10.3390/brainsci10070428).

### Spatial hearing, masking, scenes, and reverberation

- Carr, C. E., Soares, D., Smolders, J., & Simon, J. Z. (2009). Detection of
  interaural time differences in the alligator. *Journal of Neuroscience, 29*,
  7978–7990.
  [DOI 10.1523/JNEUROSCI.6154-08.2009](https://doi.org/10.1523/JNEUROSCI.6154-08.2009).
- Macpherson, E. A., & Middlebrooks, J. C. (2002). Listener weighting of cues
  for lateral angle: the duplex theory of sound localization revisited.
  *JASA, 111*, 2219–2236.
  [DOI 10.1121/1.1471898](https://doi.org/10.1121/1.1471898).
- Kato, M., Uematsu, H., Kashino, M., & Hirahara, T. (2003). The effect of head
  motion on the accuracy of sound localization. *Acoustical Science and
  Technology, 24*, 315–317.
  [DOI 10.1250/ast.24.315](https://doi.org/10.1250/ast.24.315).
- Wallach, H., Newman, E. B., & Rosenzweig, M. R. (1949). The precedence effect
  in sound localization. *American Journal of Psychology, 62*, 315–336.
  [DOI 10.2307/1418275](https://doi.org/10.2307/1418275).
- Bronkhorst, A. W., & Plomp, R. (1988). The effect of head-induced interaural
  time and level differences on speech intelligibility in noise. *JASA, 83*,
  1508–1516. [DOI 10.1121/1.396191](https://doi.org/10.1121/1.396191).
- Kidd, G., Jr., Mason, C. R., Deliwala, P. S., Woods, W. S., & Colburn, H. S.
  (1994). Reducing informational masking by sound segregation. *JASA, 95*,
  3475–3480. [DOI 10.1121/1.410023](https://doi.org/10.1121/1.410023).
- Cherry, E. C. (1953). Some experiments on the recognition of speech, with
  one and with two ears. *JASA, 25*, 975–979.
  [DOI 10.1121/1.1907229](https://doi.org/10.1121/1.1907229).
- Elhilali, M., Ma, L., Micheyl, C., Oxenham, A. J., & Shamma, S. A. (2009).
  Temporal coherence in the perceptual organization and cortical representation
  of auditory scenes. *Neuron, 61*, 317–329.
  [DOI 10.1016/j.neuron.2008.12.005](https://doi.org/10.1016/j.neuron.2008.12.005).
- Stilp, C. E., Anderson, P. W., Assgari, A. A., Ellis, G. M., & Zahorik, P.
  (2016). Speech perception adjusts to stable spectrotemporal properties of the
  listening environment. *Hearing Research, 341*, 168–178.
  [DOI 10.1016/j.heares.2016.08.004](https://doi.org/10.1016/j.heares.2016.08.004).
- Brandewie, E. J., & Zahorik, P. (2010). Prior listening in rooms improves
  speech intelligibility. *JASA, 128*, 291–299.
  [DOI 10.1121/1.3436565](https://doi.org/10.1121/1.3436565).
- Watkins, A. J. (2005). Perceptual compensation for effects of reverberation
  in speech identification. *JASA, 118*, 249–262.
  [DOI 10.1121/1.1923369](https://doi.org/10.1121/1.1923369).
- Beeston, A. V., Brown, G. J., & Watkins, A. J. (2014). Perceptual
  compensation for the effects of reverberation on consonant identification:
  evidence from studies with monaural stimuli. *JASA, 136*, 3072–3084.
  [DOI 10.1121/1.4900596](https://doi.org/10.1121/1.4900596).
- Bronkhorst, A. W., & Houtgast, T. (1999). Auditory distance perception in
  rooms. *Nature, 397*, 517–520.
  [DOI 10.1038/17374](https://doi.org/10.1038/17374).

### Sparsity and efficient coding

- Hromádka, T., DeWeese, M. R., & Zador, A. M. (2008). Sparse representation
  of sounds in the unanesthetized auditory cortex. *PLoS Biology, 6*, e16.
  [DOI 10.1371/journal.pbio.0060016](https://doi.org/10.1371/journal.pbio.0060016).
- Lewicki, M. S. (2002). Efficient coding of natural sounds. *Nature
  Neuroscience, 5*, 356–363.
  [DOI 10.1038/nn831](https://doi.org/10.1038/nn831).
- Smith, E. C., & Lewicki, M. S. (2006). Efficient auditory coding. *Nature,
  439*, 978–982.
  [DOI 10.1038/nature04485](https://doi.org/10.1038/nature04485).
- Irino, T., & Patterson, R. D. (2006). A dynamic compressive gammachirp
  auditory filterbank. *IEEE Transactions on Audio, Speech, and Language
  Processing, 14*, 2222–2232.
  [DOI 10.1109/TASL.2006.874669](https://doi.org/10.1109/TASL.2006.874669).

### Echolocation and active acoustic sensing

- Simmons, J. A. (1979). Perception of echo phase information in bat sonar.
  *Science, 203*, 16–21.
  [DOI 10.1126/science.203.4379.16](https://doi.org/10.1126/science.203.4379.16).
- Moss, C. F., Bohn, K., Gilkenson, H., & Surlykke, A. (2006). Active listening
  for spatial orientation in a complex auditory scene. *PLoS Biology, 4*, e79.
  [DOI 10.1371/journal.pbio.0040079](https://doi.org/10.1371/journal.pbio.0040079).
- Surlykke, A., & Kalko, E. K. V. (2008). Echolocating bats cry out loud to
  detect their prey. *PLoS ONE, 3*, e2036.
  [DOI 10.1371/journal.pone.0002036](https://doi.org/10.1371/journal.pone.0002036).
- Yovel, Y., Falk, B., Moss, C. F., & Ulanovsky, N. (2011). Active control of
  acoustic field-of-view in a biosonar system. *PLoS Biology, 9*, e1001150.
  [DOI 10.1371/journal.pbio.1001150](https://doi.org/10.1371/journal.pbio.1001150).
- Wohlgemuth, M. J., Kothari, N. B., & Moss, C. F. (2016). Action enhances
  acoustic cues for 3-D target localization by echolocating bats. *PLoS
  Biology, 14*, e1002544.
  [DOI 10.1371/journal.pbio.1002544](https://doi.org/10.1371/journal.pbio.1002544).
- Thaler, L., Arnott, S. R., & Goodale, M. A. (2011). Neural correlates of
  natural human echolocation in early and late blind echolocation experts.
  *PLoS ONE, 6*, e20162.
  [DOI 10.1371/journal.pone.0020162](https://doi.org/10.1371/journal.pone.0020162).
- Bates, M. E., Stamper, S. A., & Simmons, J. A. (2008). Jamming avoidance
  response of big brown bats in target detection. *Journal of Experimental
  Biology, 211*, 106–113.
  [DOI 10.1242/jeb.009688](https://doi.org/10.1242/jeb.009688).
- Cvikel, N., et al. (2015). On-board recordings reveal no jamming avoidance in
  wild bats. *Proceedings of the Royal Society B, 282*, 20142274.
  [DOI 10.1098/rspb.2014.2274](https://doi.org/10.1098/rspb.2014.2274).

### Signal processing, arrays, and source separation

- Knapp, C. H., & Carter, G. C. (1976). The generalized correlation method for
  estimation of time delay. *IEEE TASSP, 24*, 320–327.
  [DOI 10.1109/TASSP.1976.1162830](https://doi.org/10.1109/TASSP.1976.1162830).
- Capon, J. (1969). High-resolution frequency-wavenumber spectrum analysis.
  *Proceedings of the IEEE, 57*, 1408–1418.
  [DOI 10.1109/PROC.1969.7278](https://doi.org/10.1109/PROC.1969.7278).
- Schmidt, R. O. (1986). Multiple emitter location and signal parameter
  estimation. *IEEE Transactions on Antennas and Propagation, 34*, 276–280.
  [DOI 10.1109/TAP.1986.1143830](https://doi.org/10.1109/TAP.1986.1143830).
- Bell, A. J., & Sejnowski, T. J. (1995). An information-maximization approach
  to blind separation and blind deconvolution. *Neural Computation, 7*,
  1129–1159.
  [DOI 10.1162/neco.1995.7.6.1129](https://doi.org/10.1162/neco.1995.7.6.1129).
- Yılmaz, Ö., & Rickard, S. (2004). Blind separation of speech mixtures via
  time-frequency masking. *IEEE Transactions on Signal Processing, 52*,
  1830–1847.
  [DOI 10.1109/TSP.2004.828896](https://doi.org/10.1109/TSP.2004.828896).
- Hershey, J. R., Chen, Z., Le Roux, J., & Watanabe, S. (2016). Deep
  clustering: discriminative embeddings for segmentation and separation.
  *ICASSP 2016*, 31–35.
  [DOI 10.1109/ICASSP.2016.7471631](https://doi.org/10.1109/ICASSP.2016.7471631).
- Yu, D., Kolbæk, M., Tan, Z.-H., & Jensen, J. (2017). Permutation invariant
  training of deep models for speaker-independent multi-talker speech
  separation. [arXiv 1607.00325](https://arxiv.org/abs/1607.00325).
- Luo, Y., & Mesgarani, N. (2019). Conv-TasNet: surpassing ideal
  time-frequency magnitude masking for speech separation. *IEEE/ACM TASLP,
  27*, 1256–1266.
  [DOI 10.1109/TASLP.2019.2915167](https://doi.org/10.1109/TASLP.2019.2915167).
- Le Roux, J., Wisdom, S., Erdogan, H., & Hershey, J. R. (2019). SDR—half-baked
  or well done? *ICASSP 2019*, 626–630.
  [DOI 10.1109/ICASSP.2019.8683855](https://doi.org/10.1109/ICASSP.2019.8683855).

## Audit verdict

The audit finds rich recurrent structure but no isolated new principle. The
most useful result is ACOUSTIC-046: every acoustic claim must bind the source
and emission action, propagation and room state, receiver geometry and action,
observation operator and support, calibration, prior exposure, target
construct, uncertainty, sampling unit, and complete resource boundary. The
claim then faces held-out sources, rooms, arrays, interference, and hardware at
equal opportunity and lifecycle cost.

If fixed or learned filterbanks, compression, GCC, beamforming, subspace
localization, source separation, dereverberation, state estimation, POMDP/VOI,
spectrum control, or calibrated uncertainty reproduce the result, retain that
ordinary mechanism. The acoustic contract still remains valuable because it
prevents one waveform metric, one room, one array, one listener, one simulated
operator, or one partial energy boundary from masquerading as general auditory
capability.

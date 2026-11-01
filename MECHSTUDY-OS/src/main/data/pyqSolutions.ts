/**
 * Worked solutions for imported previous-year questions.
 *
 * These are written by the app's author (an AI assistant), not by GATE, so
 * every one is stored with solution_source = 'ai_generated'. Nothing here is
 * attached unless the computed answer can be checked against the official key
 * — see applySolutions() in src/main/services/pyq.ts.
 *
 * `value`  = the numeric result for a NAT question (checked against the key
 *            range, with `tolerance` if the rounding needs it).
 * `letters`= the option letters for an MCQ/MSQ (checked as a set).
 * `working`= the reasoning, plain text, no invented data.
 *
 * Only questions whose text is complete enough to solve from the text layer
 * are included. Figure-dependent questions are deliberately absent.
 */

export interface PyqSolution {
  externalRef: string;
  value?: number;
  letters?: string[];
  tolerance?: number;
  working: string;
}

export const PYQ_SOLUTIONS: PyqSolution[] = [
  {
    externalRef: 'GATE-ME-2022-S1-Q47',
    value: 0.1804,
    tolerance: 0.0005,
    working:
      'For a Poisson variable with mean λ, P(X = k) = e^(−λ) λ^k / k!.\n' +
      'P(X = 1) = P(X = 2) gives e^(−λ) λ = e^(−λ) λ²/2, so λ = 2 (λ ≠ 0).\n' +
      'Then P(X = 3) = e^(−2) · 2³ / 3! = 8 / (6 e²) = 0.18045.\n' +
      'Rounded to two decimals: 0.18.',
  },
  {
    externalRef: 'GATE-ME-2023-Q29',
    value: 96,
    working:
      'Angular velocity ratio: ω₂/ω₁ = N₁/N₂ = 1/4, so N₂ = 4N₁.\n' +
      'Centre distance = (d₁ + d₂)/2 = 30 mm, so d₁ + d₂ = 60 mm.\n' +
      'With diametral pitch P = N/d = 8 teeth/mm: d = N/8.\n' +
      'Then (N₁ + N₂)/8 = 60, so N₁ + N₂ = 480.\n' +
      'Substituting N₂ = 4N₁: 5N₁ = 480, so N₁ = 96 teeth on the driver.',
  },
  {
    externalRef: 'GATE-ME-2023-Q33',
    value: 2,
    working:
      'cos 2y − i sin 2y = e^(−2iy), so f(z) = e^(−kx) · e^(−2iy) = e^(−(kx + 2iy)).\n' +
      'Write z = x + iy. For f to be analytic it must be an exponential of a\n' +
      'constant multiple of z: kx + 2iy = c(x + iy), hence c = k and c = 2.\n' +
      'Therefore k = 2.',
  },
  {
    externalRef: 'GATE-ME-2023-Q48',
    value: 8,
    working:
      'For a rectangle with sides a and b, area ab = 4 and perimeter P = 2(a + b).\n' +
      'By AM–GM, a + b ≥ 2√(ab) = 2√4 = 4, with equality at a = b = 2.\n' +
      'So the smallest perimeter is 2 × 4 = 8 units (a square of side 2).',
  },
  {
    externalRef: 'GATE-ME-2023-Q49',
    value: 9,
    working:
      'This is a Cauchy–Euler equation. Try y = x^m:\n' +
      'x²y″ + xy′ − y = [m(m−1) + m − 1] x^m = (m² − 1) x^m = 0,\n' +
      'so m = ±1 and y = Ax + B/x.\n' +
      'y(1) = A + B = 6.  y′ = A − B/x², so y′(1) = A − B = 2.\n' +
      'Solving: A = 4, B = 2. Thus y(x) = 4x + 2/x and y(2) = 8 + 1 = 9.',
  },
  {
    externalRef: 'GATE-ME-2023-Q51',
    value: 2500,
    tolerance: 5,
    working:
      'For FCC, the lattice parameter and atomic radius are related by\n' +
      'a = 4r/√2 = 2√2 r. With r = √2/10 nm = 0.14142 nm, a = 0.4 nm = 4 × 10⁻¹⁰ m.\n' +
      'An FCC cell contains n = 4 atoms.\n' +
      'ρ = n·M / (N_A · a³)\n' +
      '  = 4 × 24.092 g/mol / (6.023 × 10²³ /mol × (4 × 10⁻¹⁰ m)³).\n' +
      'Numerator: 96.368 g/mol. Volume term: 6.023 × 10²³ × 6.4 × 10⁻²⁹ m³\n' +
      '= 3.8547 × 10⁻⁵ m³/mol.\n' +
      'ρ = 96.368 / 3.8547 × 10⁻⁵ g/m³ = 2.500 × 10⁶ g/m³ = 2500 kg/m³.',
  },
  {
    externalRef: 'GATE-ME-2024-S2-Q42',
    value: 25,
    working:
      'The integral is over x from 3 to 4 and y from 1 to 2:\n' +
      'I = ∫₃⁴ ∫₁² dy dx / (x + y)².\n' +
      'Inner: ∫₁² dy/(x+y)² = [−1/(x+y)]₁² = 1/(x+1) − 1/(x+2).\n' +
      'Outer: ∫₃⁴ [1/(x+1) − 1/(x+2)] dx = [ln(x+1) − ln(x+2)]₃⁴\n' +
      '     = ln(5/6) − ln(4/5) = ln(25/24).\n' +
      'So I = ln(a/24) with a = 25.',
  },
  {
    externalRef: 'GATE-ME-2024-S2-Q43',
    value: -1.3863,
    tolerance: 0.0005,
    working:
      't dx/dt + t − x = 0  ⇒  dx/dt − x/t = −1.\n' +
      'Integrating factor e^(∫−1/t dt) = 1/t, so (x/t)′ = −1/t.\n' +
      'Integrate: x/t = −ln t + C, i.e. x = −t ln t + Ct.\n' +
      'x(1) = 0 gives C = 0, so x(t) = −t ln t.\n' +
      'x(2) = −2 ln 2 = −1.38629 ≈ −1.39.',
  },
  {
    externalRef: 'GATE-ME-2024-S2-Q44',
    value: 0.3863,
    tolerance: 0.0005,
    working:
      'X is uniform on [0, 1], so E[Y] = ∫₀¹ ln(x + 1) dx.\n' +
      '∫ ln(x+1) dx = (x+1) ln(x+1) − (x+1).\n' +
      'Evaluating from 0 to 1: (2 ln 2 − 2) − (0 − 1) = 2 ln 2 − 1.\n' +
      'E[Y] = 2(0.69315) − 1 = 0.38629 ≈ 0.39.',
  },
  {
    externalRef: 'GATE-ME-2025-Q32',
    value: 5.6569,
    tolerance: 0.001,
    working:
      'For an ideal air-standard Otto cycle, η = 1 − r^(1−γ), with γ = 1.4.\n' +
      '0.5 = 1 − r^(−0.4)  ⇒  r^(−0.4) = 0.5  ⇒  r = 0.5^(−1/0.4) = 0.5^(−2.5).\n' +
      'r = 2^2.5 = 4√2 = 5.6569 ≈ 5.7.',
  },
  {
    externalRef: 'GATE-ME-2025-Q46',
    value: 1,
    working:
      'f(x, y) = x² + x y², so ∇f = (2x + y², 2xy).\n' +
      'At (1, 0): ∇f = (2, 0).\n' +
      'The direction is the unit vector u = ½(î + √3 ĵ) = (0.5, 0.8660).\n' +
      'Directional derivative = ∇f · u = 2(0.5) + 0(0.8660) = 1.0.',
  },
  {
    externalRef: 'GATE-ME-2025-Q50',
    value: 3,
    working:
      'V = 3z î + 0 ĵ + Cx k̂. Irrotational means ∇ × V = 0.\n' +
      '(∇ × V)ᵧ = ∂Vₓ/∂z − ∂V_z/∂x = 3 − C = 0, so C = 3.\n' +
      'The other two components vanish identically.',
  },
  {
    externalRef: 'GATE-ME-2026-Q59',
    value: 0.6144,
    tolerance: 0.001,
    working:
      'Normal anisotropy r = ε_w / ε_t, with true strains summing to zero\n' +
      '(volume constancy): ε_l + ε_w + ε_t = 0.\n' +
      'ε_l = ln(1 + 0.30) = ln 1.30 = 0.26236.\n' +
      'ε_t = ln(1 − 0.15) = ln 0.85 = −0.16252.\n' +
      'ε_w = −(ε_l + ε_t) = −(0.26236 − 0.16252) = −0.09984.\n' +
      'r = ε_w/ε_t = −0.09984 / −0.16252 = 0.6143 ≈ 0.61.',
  },
  {
    externalRef: 'GATE-ME-2026-Q62',
    value: 0.1430,
    tolerance: 0.001,
    working:
      'For FCC, n = 4 atoms per cell and a = 4r/√2, so r = a√2/4.\n' +
      'ρ = n M / (N_A a³)  ⇒  a³ = n M / (ρ N_A)\n' +
      '  = 4 × 26.98 / (2.71 × 6.023 × 10²³) cm³ = 6.612 × 10⁻²³ cm³.\n' +
      'a = (6.612 × 10⁻²³)^(1/3) cm = 4.043 × 10⁻⁸ cm = 0.4043 nm.\n' +
      'r = 0.4043 × √2 / 4 = 0.14296 ≈ 0.14 nm.',
  },
];

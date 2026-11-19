import type { SeedSubject } from './rtuSyllabus';

export interface IitSyllabusVersion {
  name: string;
  exam_type: 'IIT';
  university: string;
  academic_year: string;
  semester: null;
  source_doc: string;
  source_url: string;
  retrieved_at: string;
  verification: 'VERIFIED';
  is_provisional: 0 | 1;
  notes: string;
  subjects: SeedSubject[];
}

export const IIT_SYLLABUS: IitSyllabusVersion = {
  name: 'IIT JEE Advanced Curriculum (Physics, Chemistry, Mathematics)',
  exam_type: 'IIT',
  university: 'IIT Joint Entrance Examination Board',
  academic_year: '2026-27',
  semester: null,
  source_doc: 'Official IIT JEE Advanced Information Brochure & Syllabus',
  source_url: 'https://jeeadv.ac.in/',
  retrieved_at: '2026-11-19',
  verification: 'VERIFIED',
  is_provisional: 0,
  notes: 'Comprehensive syllabus for IIT JEE Advanced covering Physics, Chemistry, and Mathematics.',
  subjects: [
    /* ---------------- PHYSICS ---------------- */
    {
      code: 'IIT-PHY-01',
      name: 'IIT Physics: Mechanics & General Physics',
      semester: 0,
      is_practical: false,
      credits: 4,
      verification: 'VERIFIED',
      units: [
        {
          number: 1,
          title: 'Units, Dimensions & Errors',
          topics: [
            { title: 'Dimensions of physical quantities and dimensional analysis' },
            { title: 'Least count, significant figures and error analysis in physical measurements' },
            { title: 'Experiments: Vernier calliper, screw gauge, simple pendulum' },
          ],
        },
        {
          number: 2,
          title: 'Kinematics & Newton Laws of Motion',
          topics: [
            { title: 'Kinematics in one and two dimensions, projectile motion' },
            { title: 'Relative velocity in 1D and 2D' },
            { title: "Newton's laws of motion, inertial and non-inertial frames" },
            { title: 'Static and kinetic friction, laws of friction, rolling friction' },
          ],
        },
        {
          number: 3,
          title: 'Work, Power, Energy & Collisions',
          topics: [
            { title: 'Work-energy theorem, conservative and non-conservative forces' },
            { title: 'Potential energy, conservation of mechanical energy' },
            { title: 'Elastic and inelastic collisions in one and two dimensions' },
            { title: 'Center of mass motion and linear momentum conservation' },
          ],
        },
        {
          number: 4,
          title: 'Rotational Dynamics & Gravitation',
          topics: [
            { title: 'Moment of inertia, parallel and perpendicular axes theorems' },
            { title: 'Angular momentum, torque, and conservation of angular momentum' },
            { title: 'Rigid body rotation about a fixed axis and rolling without slipping' },
            { title: "Newton's law of universal gravitation, gravitational potential and field" },
            { title: "Kepler's laws of planetary motion and orbital mechanics" },
          ],
        },
      ],
    },
    {
      code: 'IIT-PHY-02',
      name: 'IIT Physics: Electrodynamics, Optics & Modern Physics',
      semester: 0,
      is_practical: false,
      credits: 4,
      verification: 'VERIFIED',
      units: [
        {
          number: 1,
          title: 'Electrostatics & Current Electricity',
          topics: [
            { title: "Coulomb's law, electric field and electrostatic potential" },
            { title: "Gauss's law and its applications to symmetric charge distributions" },
            { title: 'Capacitors, dielectrics, energy stored in electrostatic field' },
            { title: "Ohm's law, Kirchhoff's laws, Wheatstone bridge and potentiometer" },
          ],
        },
        {
          number: 2,
          title: 'Magnetism & Electromagnetic Induction',
          topics: [
            { title: 'Biot-Savart law and Ampere circuital law' },
            { title: 'Lorentz force on moving charge and current-carrying conductor' },
            { title: "Faraday's laws of electromagnetic induction, Lenz's law, and self/mutual inductance" },
            { title: 'Alternating currents, LCR series circuits, resonance and power factor' },
          ],
        },
        {
          number: 3,
          title: 'Optics & Wave Phenomena',
          topics: [
            { title: 'Rectilinear propagation, reflection, and refraction at plane and spherical surfaces' },
            { title: 'Thin lenses, prisms, dispersion, and optical instruments' },
            { title: "Huygens' principle, interference of light, Young's double-slit experiment" },
            { title: 'Diffraction at single slit and polarization of light' },
          ],
        },
        {
          number: 4,
          title: 'Thermal Physics & Modern Physics',
          topics: [
            { title: 'First and second laws of thermodynamics, Carnot engine and efficiency' },
            { title: 'Kinetic theory of gases, ideal gas equation, and specific heats' },
            { title: 'Photoelectric effect, de Broglie wavelength, and Bohr model of hydrogen atom' },
            { title: 'Radioactivity, alpha/beta/gamma decays, nuclear fission and fusion' },
          ],
        },
      ],
    },

    /* ---------------- CHEMISTRY ---------------- */
    {
      code: 'IIT-CHM-01',
      name: 'IIT Chemistry: Physical Chemistry',
      semester: 0,
      is_practical: false,
      credits: 4,
      verification: 'VERIFIED',
      units: [
        {
          number: 1,
          title: 'Atomic Structure & Chemical Bonding',
          topics: [
            { title: 'Bohr model, quantum numbers, de Broglie relation and Heisenberg uncertainty principle' },
            { title: 'Electronic configurations of atoms, Aufbau principle, Hund rule and Pauli exclusion' },
            { title: 'Ionic bonding, lattice energy, Born-Haber cycle and covalent character' },
            { title: 'VSEPR theory, hybridization, valence bond theory and molecular orbital theory' },
          ],
        },
        {
          number: 2,
          title: 'Chemical Thermodynamics & Thermochemistry',
          topics: [
            { title: 'First law: internal energy, enthalpy, heat capacity, state functions' },
            { title: "Hess's law of constant heat summation and bond dissociation enthalpies" },
            { title: 'Second law: entropy, spontaneity criteria, and Gibbs free energy' },
            { title: 'Third law of thermodynamics and standard absolute entropies' },
          ],
        },
        {
          number: 3,
          title: 'Chemical & Ionic Equilibrium',
          topics: [
            { title: 'Law of mass action, equilibrium constants Kp and Kc, Le Chatelier principle' },
            { title: 'Acids and bases: Arrhenius, Bronsted-Lowry, and Lewis concepts' },
            { title: 'pH calculations, buffer solutions, Henderson-Hasselbalch equation' },
            { title: 'Solubility product (Ksp) and common ion effect' },
          ],
        },
        {
          number: 4,
          title: 'Electrochemistry & Chemical Kinetics',
          topics: [
            { title: 'Electrochemical cells, standard electrode potentials, and Nernst equation' },
            { title: 'Conductance in electrolytic solutions, Kohlrausch law' },
            { title: 'Rate of reaction, rate constant, order and molecularity of reactions' },
            { title: 'Integrated rate equations for zero and first order, Arrhenius equation' },
          ],
        },
      ],
    },
    {
      code: 'IIT-CHM-02',
      name: 'IIT Chemistry: Inorganic & Organic Chemistry',
      semester: 0,
      is_practical: false,
      credits: 4,
      verification: 'VERIFIED',
      units: [
        {
          number: 1,
          title: 'Periodic Properties & Coordination Compounds',
          topics: [
            { title: 'Periodic trends in atomic radii, ionization enthalpy, electron gain enthalpy and electronegativity' },
            { title: 'Coordination theory of Werner, ligands, coordination number, IUPAC nomenclature' },
            { title: 'Isomerism in coordination compounds: structural and stereoisomerism' },
            { title: 'Crystal field theory (CFT), magnetic properties, and color of complexes' },
          ],
        },
        {
          number: 2,
          title: 'Basic Principles of Organic Chemistry & Reaction Mechanisms',
          topics: [
            { title: 'IUPAC nomenclature, structural and stereoisomerism (geometrical and optical)' },
            { title: 'Electronic displacements: inductive, electromeric, resonance and hyperconjugation' },
            { title: 'Reactive intermediates: carbocations, carbanions, free radicals, carbenes' },
            { title: 'Electrophilic, nucleophilic, and free-radical reaction mechanisms' },
          ],
        },
        {
          number: 3,
          title: 'Hydrocarbons, Haloalkanes & Oxygen Functionalities',
          topics: [
            { title: 'Alkanes, alkenes, alkynes: preparation, Markownikoff addition, ozonolysis' },
            { title: 'Aromatic hydrocarbons: benzene, resonance, electrophilic aromatic substitution' },
            { title: 'Alkyl halides: SN1 and SN2 mechanisms, elimination reactions (E1, E2)' },
            { title: 'Alcohols, phenols, ethers: acidity, dehydration, Williamson synthesis' },
            { title: 'Aldehydes and ketones: nucleophilic addition, aldol condensation, Cannizzaro reaction' },
          ],
        },
      ],
    },

    /* ---------------- MATHEMATICS ---------------- */
    {
      code: 'IIT-MTH-01',
      name: 'IIT Mathematics: Algebra & Coordinate Geometry',
      semester: 0,
      is_practical: false,
      credits: 4,
      verification: 'VERIFIED',
      units: [
        {
          number: 1,
          title: 'Complex Numbers & Quadratic Equations',
          topics: [
            { title: 'Algebraic operations on complex numbers, modulus, argument, polar form' },
            { title: "De Moivre's theorem and cube roots of unity" },
            { title: 'Quadratic equations with real coefficients, relation between roots and coefficients' },
            { title: 'Symmetric functions of roots and sign of quadratic expressions' },
          ],
        },
        {
          number: 2,
          title: 'Matrices, Determinants & Probability',
          topics: [
            { title: 'Matrices, matrix algebra, transpose, inverse of a square matrix' },
            { title: "Properties of determinants, Cramer's rule, consistency of linear equations" },
            { title: 'Permutations and combinations, binomial theorem for positive integral index' },
            { title: 'Conditional probability, Bayes theorem, independent events, binomial distribution' },
          ],
        },
        {
          number: 3,
          title: 'Coordinate Geometry of Two Dimensions',
          topics: [
            { title: 'Cartesian coordinates, distance formula, section formula, locus' },
            { title: 'Straight lines: slope, various forms of equation, distance from a point' },
            { title: 'Circles: standard equation, tangent and normal, family of circles' },
            { title: 'Conic sections: standard equations of parabola, ellipse, and hyperbola' },
            { title: 'Tangents, normals, and focal properties of conics' },
          ],
        },
      ],
    },
    {
      code: 'IIT-MTH-02',
      name: 'IIT Mathematics: Calculus & Vectors',
      semester: 0,
      is_practical: false,
      credits: 4,
      verification: 'VERIFIED',
      units: [
        {
          number: 1,
          title: 'Differential Calculus',
          topics: [
            { title: 'Real-valued functions, domain, range, composition and inverse functions' },
            { title: 'Limits, continuity of functions, differentiability and chain rule' },
            { title: "Rolle's theorem and Lagrange Mean Value Theorem" },
            { title: 'Tangents and normals, maxima and minima, increasing and decreasing functions' },
          ],
        },
        {
          number: 2,
          title: 'Integral Calculus & Differential Equations',
          topics: [
            { title: 'Indefinite integration by substitution, parts, and partial fractions' },
            { title: 'Fundamental theorem of calculus and properties of definite integrals' },
            { title: 'Area under curves bounded by straight lines and conic sections' },
            { title: 'First order differential equations: variable separable, homogeneous, linear' },
          ],
        },
        {
          number: 3,
          title: 'Vectors & Three-Dimensional Geometry',
          topics: [
            { title: 'Addition of vectors, scalar multiplication, dot product, cross product' },
            { title: 'Scalar triple product, vector triple product and their geometrical interpretations' },
            { title: 'Direction cosines and direction ratios of a line in 3D' },
            { title: 'Equations of straight lines and planes in 3D, angle between lines/planes' },
            { title: 'Shortest distance between skew lines and intersection of line and plane' },
          ],
        },
      ],
    },
  ],
};

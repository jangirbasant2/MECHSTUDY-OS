// RTU Kota B.Tech Mechanical Engineering — III Semester
// Transcribed from the text layer of syllabus.pdf (verified 2026-10-27).
// Effective: students admitted 2017-18 onwards; "Applicable to students admitted from 2018-19 onwards"
// is the operative Engineering Mechanics variant and is the one used here.
// Technical Communication (3ME1-02/4ME1-02) is EXCLUDED per explicit user request.

export interface SeedTopic { title: string; description?: string }
export interface SeedUnit { number: number; title: string; hours?: number; topics: SeedTopic[] }
export interface SeedSubject {
  code: string;
  name: string;
  semester: number;
  credits: number;
  lecture_hours?: number;
  tutorial_hours?: number;
  practical_hours?: number;
  ia_marks?: number;
  ete_marks?: number;
  total_marks?: number;
  is_practical?: boolean;
  /** Overrides the row's verification state. Defaults to VERIFIED. */
  verification?: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED';
  units: SeedUnit[];
}

const t = (title: string): SeedTopic => ({ title });

export const RTU_SYLLABUS = {
  name: 'RTU Kota B.Tech ME — III Semester (2018-19 onwards)',
  exam_type: 'RTU' as const,
  university: 'Rajasthan Technical University, Kota',
  academic_year: 'Effective 2018-19 (admitted 2017-18 onwards)',
  semester: 3,
  source_doc: 'syllabus.pdf',
  source_url: null as string | null,
  retrieved_at: '2026-10-27',
  verification: 'VERIFIED' as const,
  is_provisional: 0,
  notes:
    'Transcribed from the selectable text layer of syllabus.pdf (15 pages). ' +
    'Technical Communication (3ME1-02/4ME1-02) excluded per user request. ' +
    'syllabus.pdf contains only III Semester; no IV semester source is present.',
  subjects: [
    {
      code: '3ME2-01', name: 'Advance Engineering Mathematics-I', semester: 3, credits: 3,
      lecture_hours: 3, tutorial_hours: 0, practical_hours: 0, ia_marks: 30, ete_marks: 120, total_marks: 150,
      units: [
        { number: 1, title: 'Numerical Methods – 1', hours: 10, topics: [
          t('Finite differences'), t('Relation between operators'),
          t("Newton's forward and backward difference formulae"),
          t("Gauss's forward and backward interpolation formulae"), t("Stirling's formula"),
          t('Interpolation with unequal intervals: Newton divided difference and Lagrange formulae'),
          t('Numerical differentiation'),
          t('Numerical integration: Trapezoidal rule, Simpson 1/3rd and 3/8 rules'),
        ]},
        { number: 2, title: 'Numerical Methods – 2', hours: 8, topics: [
          t("Numerical solution of ODEs: Taylor's series"), t("Euler and modified Euler's methods"),
          t('Runge-Kutta 4th order for first and second order equations'),
          t("Milne's and Adam's predictor-corrector methods"),
          t('Bisection method'), t('Newton-Raphson method'), t('Regula-Falsi method'),
        ]},
        { number: 3, title: 'Laplace Transform', hours: 10, topics: [
          t('Definition and existence of Laplace transform'),
          t('Properties of Laplace transform and formulae'),
          t('Unit step function, Dirac delta function, Heaviside function'),
          t('Laplace transform of periodic functions'),
          t('Inverse Laplace transform by different methods'), t('Convolution theorem'),
          t('Evaluation of integrals by Laplace transform'),
          t('Solving ODEs by Laplace transform method'),
        ]},
        { number: 4, title: 'Fourier Transform', hours: 7, topics: [
          t('Fourier complex, sine and cosine transform'), t('Properties and formulae'),
          t('Inverse Fourier transforms'), t('Convolution theorem'),
          t('Application to PDE: one-dimensional heat and wave equations only'),
        ]},
        { number: 5, title: 'Z-Transform', hours: 5, topics: [
          t('Definition, properties and formulae'), t('Convolution theorem'),
          t('Inverse Z-transform'), t('Application of Z-transform to difference equations'),
        ]},
      ],
    },
    {
      code: '3ME1-03/4ME1-03', name: 'Managerial Economics and Financial Accounting', semester: 3, credits: 2,
      lecture_hours: 2, tutorial_hours: 0, practical_hours: 0, ia_marks: 20, ete_marks: 80, total_marks: 100,
      units: [
        { number: 1, title: 'Basic Economic Concepts', hours: 4, topics: [
          t('Meaning, nature and scope of economics'), t('Deductive vs inductive methods'),
          t('Static and dynamic economics'), t('Economic problems: scarcity and choice'),
          t('Circular flow of economic activity'), t('National income: concepts and measurement'),
        ]},
        { number: 2, title: 'Demand and Supply Analysis', hours: 5, topics: [
          t('Types and determinants of demand'), t('Demand function and elasticity of demand'),
          t('Demand forecasting: purpose, determinants and methods'),
          t('Determinants of supply, supply function, elasticity of supply'),
        ]},
        { number: 3, title: 'Production and Cost Analysis', hours: 5, topics: [
          t('Production function'), t('Law of variable proportions'), t('Laws of returns to scale'),
          t('Production optimization and least cost combination of inputs'), t('Isoquants'),
          t('Explicit and implicit cost, fixed and variable cost'),
          t('Opportunity cost and sunk costs'), t('Cost function and cost curves'),
          t('Cost and output decisions, cost estimation'),
        ]},
        { number: 4, title: 'Market Structure and Pricing Theory', hours: 4, topics: [
          t('Perfect competition'), t('Monopoly'), t('Monopolistic competition'), t('Oligopoly'),
        ]},
        { number: 5, title: 'Financial Statement Analysis', hours: 8, topics: [
          t('Balance sheet and related concepts'), t('Profit and loss statement and related concepts'),
          t('Financial ratio analysis'), t('Cash-flow analysis'), t('Funds-flow analysis'),
          t('Comparative financial statement'), t('Analysis and interpretation of financial statements'),
          t('Capital budgeting techniques'),
        ]},
      ],
    },
    {
      code: '3ME3-04', name: 'Engineering Mechanics', semester: 3, credits: 2,
      lecture_hours: 2, tutorial_hours: 0, practical_hours: 0, ia_marks: 20, ete_marks: 80, total_marks: 100,
      units: [
        { number: 1, title: 'Statics of particles and rigid bodies, Plane trusses, Virtual work', hours: 5, topics: [
          t('Fundamental laws of mechanics, principle of transmissibility'),
          t('System of forces, resultant force, resolution of force'),
          t('Moment and couples, Varignon theorem'),
          t('Resolution of a force into a force and a couple'),
          t('Free body diagram, equilibrium, conditions for equilibrium, Lami theorem'),
          t('Plane trusses: types of structures, support conditions, types of loadings'),
          t('Classification and determinacy of trusses, basic assumptions of truss analysis'),
          t('Method of joints, method of sections'),
          t('Virtual work: principle of virtual work, active forces and active force diagram, stability of equilibrium'),
        ]},
        { number: 2, title: 'Centroid and Moment of Inertia; Lifting machines', hours: 5, topics: [
          t('Location of centroid and centre of gravity'), t('Moment of inertia'),
          t('Parallel axis and perpendicular axis theorem'), t('Radius of gyration'),
          t('M.I. of composite section, polar moment of inertia, M.I. of solid bodies'),
          t('Lifting machines: mechanical advantage, velocity ratio, efficiency'),
          t('Ideal machine, ideal effort and ideal load, reversibility, law of machine'),
          t('System of pulleys, simple wheel and axle, wheel and differential axle'),
          t('Weston differential pulley block, worm and worm wheel'),
          t('Single and double purchase winch crab, screw jack, differential screw jack'),
        ]},
        { number: 3, title: 'Friction; Belt and Rope drive', hours: 5, topics: [
          t('Types of friction, laws of friction'), t('Angle of friction, angle of repose'),
          t('Ladder friction, wedge friction, belt friction'),
          t('Types of belts and belt drives, velocity ratio, effect of slip on velocity ratio'),
          t('Crowning of pulleys, length of belt'),
          t('Ratio of tensions in flat belt drive, power transmission by belt drives'),
          t('Advantages and disadvantages of V-belt over flat belt'),
        ]},
        { number: 4, title: 'Kinematics and Kinetics of particles and rigid bodies', hours: 5, topics: [
          t('Velocity, acceleration, types of motion, equations of motion'),
          t('Rectangular components of velocity and acceleration'),
          t('Angular velocity and angular acceleration'),
          t('Radial and transverse velocities and accelerations'),
          t('Projectile motion on plane and inclined plane'), t('Relative motion'),
          t("Newton's second law, equation of motion in rectangular coordinates"),
          t('Equation of motion in radial and transverse components'),
          t('Equation of motion in plane for a rigid body'), t("D'Alembert principle"),
        ]},
        { number: 5, title: 'Work, Energy and Power; Impulse and Momentum', hours: 6, topics: [
          t('Work of a force, weight, spring force and couple'), t('Power, efficiency, energy'),
          t('Kinetic energy of rigid body, principle of work and energy'),
          t('Conservative and non-conservative force, conservation of energy'),
          t('Linear and angular momentum, linear and angular impulse'),
          t('Principle of momentum for a particle and rigid body'),
          t('Principle of linear impulse and momentum'),
          t('Principle of angular momentum and impulse, conservation of angular momentum'),
          t('Angular momentum of rigid body, principle of impulse and momentum for a rigid body'),
          t('Central impact, oblique impact'), t('System of variable mass, rocket'),
        ]},
      ],
    },
    {
      code: '3ME4-05', name: 'Engineering Thermodynamics', semester: 3, credits: 3,
      lecture_hours: 3, tutorial_hours: 0, practical_hours: 0, ia_marks: 30, ete_marks: 120, total_marks: 150,
      units: [
        { number: 1, title: 'Basic Concepts; Zeroth and First Law', hours: 7, topics: [
          t('System, surroundings, property, energy, thermodynamic equilibrium, process, work and modes of work'),
          t('Zeroth law of thermodynamics, temperature scale'),
          t('First law of thermodynamics, first law analysis of elementary processes'),
          t('Steady and unsteady flow energy equations'),
        ]},
        { number: 2, title: 'Second Law, Entropy and Availability', hours: 10, topics: [
          t('Heat engine, heat pump and refrigerator'), t('Second law of thermodynamics'),
          t('Equivalence of Kelvin-Planck and Clausius statements'),
          t('Reversible and irreversible processes'), t('Carnot engine, efficiency of Carnot engine'),
          t('Carnot principle, thermodynamic temperature scale, Clausius inequality'),
          t('Entropy, calculation of entropy change, principle of entropy increase'),
          t('Temperature-entropy diagram, second law analysis of a control volume'),
          t('Available energy, loss in available energy, availability function, irreversibility'),
        ]},
        { number: 3, title: 'Thermodynamic Properties of Fluids; Ideal and Real Gas', hours: 8, topics: [
          t('Pure substance, concept of phase, graphical representation of p-v-T data'),
          t('Properties of steam, steam tables, Mollier chart'),
          t('Ideal gas, real gas, internal energy, enthalpy and specific heats of an ideal gas'),
          t('Equations of state'), t("Dalton's law of partial pressures, Gibbs-Dalton law"),
          t('Thermodynamic properties of gas mixtures'),
        ]},
        { number: 4, title: 'Thermodynamic Relations; Power Cycles', hours: 8, topics: [
          t('Thermodynamic variables, independent and dependent variables'),
          t("Maxwell's thermodynamic relations"),
          t('Relations involving entropy, enthalpy and internal energy'),
          t('Joule-Thomson coefficient, Clapeyron equation'),
          t('Otto cycle, Diesel cycle, Dual cycle, Brayton cycle, Ericsson cycle'),
        ]},
        { number: 5, title: 'Vapour Power Cycles', hours: 6, topics: [
          t('Rankine cycle, effect of operating conditions on its efficiency'),
          t('Properties of ideal working fluid in vapour power cycle'),
          t('Reheat cycle, regenerative cycle, bleeding extraction cycle'),
          t('Feed water heating cogeneration cycle'),
        ]},
      ],
    },
    {
      code: '3ME4-06', name: 'Material Science and Engineering', semester: 3, credits: 3,
      lecture_hours: 3, tutorial_hours: 0, practical_hours: 0, ia_marks: 30, ete_marks: 120, total_marks: 150,
      units: [
        { number: 1, title: 'Crystal Structure, Imperfections and Deformation', hours: 8, topics: [
          t('Crystal structure: BCC, FCC and HCP, unit cell'),
          t('Crystallographic planes and directions, Miller indices'),
          t('Crystal imperfections: point, line, surface and volume defects'),
          t('Frank-Reed source of dislocation'),
          t('Elastic and plastic modes of deformation, Bauschinger effect'),
          t('Slip and twinning, strain hardening'),
          t('Cold/hot working, recovery, recrystallization and grain growth'),
        ]},
        { number: 2, title: 'Classification of Engineering Materials and Phase Diagrams', hours: 8, topics: [
          t('Solidification of metals and typical alloys'),
          t('Mechanism of crystallization: nuclear formation and crystal growth'),
          t('General principles of phase transformation in alloys'),
          t('Phase rule and equilibrium diagrams'),
          t('Binary system with complete mutual solubility in liquid and limited solid solubility'),
          t('Binary isomorphous alloy system, Hume-Rothery rule'),
          t('Binary system with limited terminal solid solubility decreasing with temperature'),
          t('Alloy with peritectic transformation, system with allotropic change'),
          t('Iron-carbon equilibrium diagram and phase transformations'),
          t('Eutectic, peritectic, eutectoid and peritectoid reactions and microstructures'),
        ]},
        { number: 3, title: 'Isothermal Transformation Diagrams and Heat Treatment', hours: 8, topics: [
          t('Isothermal transformation diagrams, cooling curves superimposed on TTT diagram'),
          t('Critical cooling rate'), t('Formation of austenite from pearlite'),
          t('Transformation of austenite into pearlite'),
          t('Full annealing, stress relief, spheroidizing'), t('Normalizing, hardening and tempering of steel'),
          t('Hardenability, Jominy end quench test'), t('Austempering, martempering'),
          t('Case hardening, carburising, nitriding, cyaniding, carbonitriding'),
          t('Flame and induction hardening'),
        ]},
        { number: 4, title: 'Non-Metallic Materials; Constitution of Alloys; Ferrous and Non-Ferrous Metals', hours: 8, topics: [
          t('Polymers: types, commodity and engineering polymers'),
          t('Properties and applications of PE, PP, PS, PVC, PMMA, PET, PC, PA, ABS, PI, PAI, PPO, PPS, PEEK, PTFE'),
          t('Urea and phenol formaldehydes'),
          t('Constitution of alloys: substitutional and interstitial solid solutions'),
          t('Effect of alloying additions on steel (Mn, Si, Cr, Mo, V, Ti and W)'),
          t('Stainless and tool steels, HSLA steel'),
        ]},
        { number: 5, title: 'Mechanical Properties and Testing; Steels, Ceramics, Composites, Nanomaterials', hours: 7, topics: [
          t('Types of fracture'), t('Testing under tension, compression and shear loads'),
          t('Hardness tests: Brinell, Vickers and Rockwell'),
          t('Impact test: Izod and Charpy'), t('Fatigue and creep test'),
          t('Classification of steels and cast iron, constitution and properties'),
          t('BIS standards'),
          t('Engineering ceramics: properties and applications of Al2O3, SiC, Si3N4, PSZ'),
          t('Fiber and particulate reinforced composites and resin plastics'),
          t('Introduction to nanomaterials: nanostructured materials, nanoclusters and nanocrystals'),
        ]},
      ],
    },
    {
      code: '3ME4-07', name: 'Mechanics of Solids', semester: 3, credits: 4,
      lecture_hours: 3, tutorial_hours: 1, practical_hours: 0, ia_marks: 40, ete_marks: 160, total_marks: 200,
      units: [
        { number: 1, title: 'Stress and Strain', hours: 8, topics: [
          t('Elementary definition of stress and strain, stress-strain relationship'),
          t('Elastic, plastic and visco-elastic behaviour in tension and compression test'),
          t('Stress-strain curves, Hooke law, Poisson ratio'),
          t('Elastic constants and their relations for an isotropic Hookean material'),
          t('Anisotropic and orthotropic materials'),
          t('Tension, compression, shearing stress and strain'),
          t('Thermal stresses, composite bars'),
          t('Equations of static equilibrium, concept of free body diagram'),
          t('Strain energy due to axial loading'),
        ]},
        { number: 2, title: 'Members Subjected to Flexural Loads', hours: 9, topics: [
          t('Theory of simple bending'),
          t('Bending moment and shear force diagrams for different static loading and support conditions'),
          t('Bending stresses, section modulus'),
          t('Transverse shear stress distribution in circular, hollow circular, I, box, T and angle sections'),
          t('Strain energy due to bending'),
        ]},
        { number: 3, title: 'Principal Planes, Stresses and Strains; Theories of Elastic Failure', hours: 7, topics: [
          t('Members subjected to combined axial, bending and torsional loads'),
          t('Maximum normal and shear stresses'),
          t('Concept of equivalent bending and equivalent twisting moments'),
          t("Mohr's circle of stress and strain"),
          t('Theories of elastic failure: necessity, different theories, significance and comparison, applications'),
        ]},
        { number: 4, title: 'Torsion; Stability of Equilibrium', hours: 7, topics: [
          t('Torsional shear stress in solid, hollow and stepped circular shafts'),
          t('Angular deflection and power transmission capacity'),
          t('Strain energy due to torsional loads'),
          t('Instability and elastic stability, long and short columns, ideal strut'),
          t("Euler's formula for crippling load for columns of different ends"),
          t('Concept of equivalent length, eccentric loading'),
          t('Rankine formula and other empirical relations'),
        ]},
        { number: 5, title: 'Transverse Deflection of Beams; Thin-walled Pressure Vessels', hours: 8, topics: [
          t('Relation between deflection, bending moment, shear force and load'),
          t('Transverse deflection of beams and shafts under static loading'),
          t('Area moment method, direct integration method'),
          t('Stresses in cylindrical and spherical thin-walled vessels'),
        ]},
      ],
    },
    {
      code: '3ME4-21', name: 'Machine Drawing Practice', semester: 3, credits: 1.5,
      lecture_hours: 0, tutorial_hours: 0, practical_hours: 3, ia_marks: 45, ete_marks: 30, total_marks: 75,
      is_practical: true,
      units: [
        { number: 0, title: 'Practical Work', topics: [
          t('Assembly drawing with sectioning and bill of materials: lathe tailstock, shaper tool head, swivel machine vice (1 drawing sheet)'),
          t('Detailed part drawings from assembly drawing indicating fits, tolerances and surface finish symbols per BIS codes: check-valve, junction valve (1 drawing sheet)'),
          t('Computer Aided Drafting: introduction to CAD software (AutoCAD/ProE/Creo/SolidWorks)'),
          t('2-D drafting problem'), t('3-D modelling problem'), t('3-D advanced modelling problem'),
          t('Assembly modelling problem'), t('Feature modification and manipulation'),
          t('Detailing problem'), t('Surface modelling problem'),
        ]},
      ],
    },
    {
      code: '3ME4-22', name: 'Materials Testing Lab', semester: 3, credits: 1.5,
      lecture_hours: 0, tutorial_hours: 0, practical_hours: 3, ia_marks: 45, ete_marks: 30, total_marks: 75,
      is_practical: true,
      units: [
        { number: 0, title: 'Experiments', topics: [
          t('Study of crystal structures through models: BCC, FCC, HCP, tetrahedral and octahedral voids'),
          t('Material identification of about 50 common items kept in a box'),
          t('Specimen preparation for metallographic examination: cutting, grinding, polishing, etching'),
          t('Comparative study of microstructures: mild steel, grey cast iron, brass, copper'),
          t('Heat treatment experiments: annealing, normalizing, quenching, case hardening; hardness before/after'),
          t('Microstructure and hardness of steel at different cooling rates; white cast iron microstructure'),
          t('Tensile/compressive/shear/torsion test and determination of mechanical properties'),
          t('Determination of Rockwell/Vickers/Brinell hardness'),
          t('Impact test and determination of resilience'),
          t('Fatigue test and determination of fatigue strength'),
          t('Bending test and determination of Young modulus via beam deflection'),
          t('Creep testing on creep testing machine'),
        ]},
      ],
    },
    {
      code: '3ME4-23', name: 'Basic Mechanical Engineering Lab', semester: 3, credits: 1.5,
      lecture_hours: 0, tutorial_hours: 0, practical_hours: 3, ia_marks: 45, ete_marks: 30, total_marks: 75,
      is_practical: true,
      units: [
        { number: 0, title: 'Practical Work', topics: [
          t('Exposure to applications of mechanical engineering through hands-on assembly/disassembly of machines (bicycle, sewing machine, pumps, engines, air-conditioners, machine-tools)'),
          t('Observational study of complex systems via cut sections, visits, videos and computer simulations'),
          t('Design of simple machines/systems including specifications formulation'),
          t('Industrial visits'),
          t('Submit written report indicating learning achieved by hands-on assembly/disassembly'),
        ]},
      ],
    },
    {
      code: '3ME4-24', name: 'Programming using MATLAB', semester: 3, credits: 1.5,
      lecture_hours: 0, tutorial_hours: 0, practical_hours: 3, ia_marks: 45, ete_marks: 30, total_marks: 75,
      is_practical: true,
      units: [
        { number: 0, title: 'Practical Work', topics: [
          t('Basics of MATLAB computer programming'),
          t('Use of formulae and inbuilt functions'),
          t('MATLAB scripts and functions (m-files)'),
          t('Loops and nested loops'),
          t('Array, vector and matrices'),
          t('Plotting functions and vector plots'),
          t('Solving differential equations using MATLAB'),
          t('Reading and writing data, file handling'),
          t('Using MATLAB toolboxes'),
          t('MATLAB graphic functions'),
        ]},
      ],
    },
  ] as SeedSubject[],
};

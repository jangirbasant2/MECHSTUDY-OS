// GATE 2027 Mechanical Engineering (ME) syllabus
// Source: official GATE 2027 organising institute (IIT Madras)
//   https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/ME_GATE2027_Syllabus.pdf
// Retrieved: 2026-10-27 — stored locally at data/gate/ME_GATE2027_Syllabus.pdf
// The GATE 2027 site states the syllabi have been REVISED for 2027.
// Topics below are transcribed verbatim (split on semicolons) from that PDF.
// General Aptitude is common to all papers (15 marks) and is NOT contained in the
// ME syllabus PDF; those entries are marked UNVERIFIED pending the official GA text.

import type { SeedSubject } from './rtuSyllabus';

const t = (title: string) => ({ title });

export const GATE_SYLLABUS = {
  name: 'GATE 2027 Mechanical Engineering (ME)',
  exam_type: 'GATE' as const,
  university: 'IIT Madras (organising institute)',
  academic_year: '2027',
  semester: null as number | null,
  source_doc: 'data/gate/ME_GATE2027_Syllabus.pdf',
  source_url: 'https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/ME_GATE2027_Syllabus.pdf',
  retrieved_at: '2026-10-27',
  verification: 'VERIFIED' as const,
  is_provisional: 0,
  notes:
    'Official GATE 2027 ME syllabus (revised for 2027), retrieved 2026-10-27. ' +
    'Section headings and area names are official. Topics are the official wording split on semicolons. ' +
    'General Aptitude entries are UNVERIFIED because the GA syllabus is not part of the ME syllabus PDF.',
  subjects: [
    {
      code: 'GATE-ME-S1', name: 'Section 1: Engineering Mathematics', semester: 0, credits: 0,
      units: [
        { number: 1, title: 'Linear Algebra', topics: [
          t('Matrix algebra'), t('Systems of linear equations'), t('Eigen values and eigen vectors'),
        ]},
        { number: 2, title: 'Calculus', topics: [
          t('Functions of single variable, limit, continuity and differentiability'),
          t('Mean value theorems, indeterminate forms'),
          t('Evaluation of definite and improper integrals'),
          t('Double and triple integrals'), t('Partial derivatives, total derivative'),
          t('Taylor series (in one and two variables)'), t('Maxima and minima'), t('Fourier series'),
          t('Gradient, divergence and curl, vector identities, directional derivatives'),
          t('Line, surface and volume integrals'),
          t('Applications of Gauss, Stokes and Green theorems'),
        ]},
        { number: 3, title: 'Differential Equations', topics: [
          t('First order equations (linear and nonlinear)'),
          t('Higher order linear differential equations with constant coefficients'),
          t('Euler-Cauchy equation'), t('Initial and boundary value problems'),
          t('Laplace transforms'), t("Solutions of heat, wave and Laplace's equations"),
        ]},
        { number: 4, title: 'Complex Variables', topics: [
          t('Analytic functions'), t('Cauchy-Riemann equations'),
          t("Cauchy's integral theorem and contour integral formula"),
          t('Taylor and Laurent series'),
        ]},
        { number: 5, title: 'Probability and Statistics', topics: [
          t('Definitions of probability'), t('Sampling theorems'), t('Conditional probability'),
          t('Mean, median, mode and standard deviation'), t('Random variables'),
          t('Binomial, Poisson and normal distributions'),
        ]},
        { number: 6, title: 'Numerical Methods', topics: [
          t('Numerical solutions of linear and non-linear algebraic equations'),
          t("Integration by trapezoidal and Simpson's rules"),
          t('Single and multi-step methods for ordinary differential equations'),
        ]},
      ],
    },
    {
      code: 'GATE-ME-S2', name: 'Section 2: Applied Mechanics and Design', semester: 0, credits: 0,
      units: [
        { number: 1, title: 'Engineering Mechanics', topics: [
          t('Free-body diagrams and equilibrium'),
          t('Friction and its applications including rolling resistance, belt-pulley, brakes, clutches, screw jack, wedge, vehicles'),
          t('Plane trusses and frames'), t('Virtual work'),
          t('Kinematics and dynamics of rigid bodies in plane motion'),
          t('Impulse and momentum (linear and angular) and energy formulations'),
        ]},
        { number: 2, title: 'Mechanics of Materials', topics: [
          t('Stress and strain, elastic constants and their relationships'),
          t('Stress and strain components transformations in 2D'),
          t("Mohr's circle for plane stress and plane strain"),
          t('Thin-walled pressure vessels'), t('Shear force and bending moment diagrams'),
          t('Bending and shear stresses'), t('Concept of shear centre'), t('Deflection of beams'),
          t('Torsion of circular shafts'), t("Euler's theory of columns"), t('Energy methods'),
          t('Thermal stresses'), t('Strain gauges and rosettes'),
          t('Mechanical properties of materials, toughness, hardness, impact strength'),
        ]},
        { number: 3, title: 'Theory of Machines', topics: [
          t('Displacement, velocity and acceleration analysis of plane mechanisms'),
          t('Dynamic analysis of linkages'), t('Cams'), t('Gears and gear trains'),
          t('Flywheels and governors'), t('Balancing of reciprocating and rotating masses'), t('Gyroscope'),
        ]},
        { number: 4, title: 'Vibrations', topics: [
          t('Free and forced vibration of linear systems with single and two degrees of freedom'),
          t('Damping estimation and effects'), t('Vibration isolation, transmissibility ratio'),
          t('Resonance'), t('Critical speeds of shafts'),
          t('Control system, PID controller, transfer function'),
        ]},
        { number: 5, title: 'Machine Design', topics: [
          t('Design for static and dynamic loading'), t('Failure theories'),
          t('Fatigue strength and the S-N diagram'),
          t('Principles and design of machine elements such as bolted, riveted and welded joints'),
          t('Shafts, gears, belt drives, rolling and sliding contact bearings, brakes and clutches, springs'),
        ]},
      ],
    },
    {
      code: 'GATE-ME-S3', name: 'Section 3: Fluid Mechanics and Thermal Sciences', semester: 0, credits: 0,
      units: [
        { number: 1, title: 'Fluid Mechanics', topics: [
          t('Fluid properties'), t('Fluid statics, forces on submerged bodies, stability of floating bodies'),
          t('Control-volume analysis of mass, momentum and energy'), t('Fluid acceleration'),
          t('Differential equations of continuity and momentum'), t('Concept of velocity potential'),
          t("Bernoulli's equation"), t('Dimensional analysis'),
          t('Viscous flow of incompressible fluids, boundary layer, elementary turbulent flow'),
          t('Flow through pipes, head losses in pipes, bends and fittings'),
          t('One dimensional high speed compressible fluid flow'),
          t('Flow through converging and converging-diverging nozzles'),
        ]},
        { number: 2, title: 'Heat Transfer', topics: [
          t('Modes of heat transfer'),
          t('One dimensional heat conduction, resistance concept and electrical analogy'),
          t('Heat transfer through fins'),
          t('Unsteady heat conduction, lumped parameter system'), t('Thermal boundary layer'),
          t('Dimensionless parameters in free and forced convective heat transfer'),
          t('Heat transfer correlations for flow over flat plates and through pipes'),
          t('Boiling and condensation'), t('Effect of turbulence'),
          t('Heat exchanger performance, LMTD and NTU methods'),
          t('Radiative heat transfer, Stefan-Boltzmann law, Wien displacement law'),
          t('Black and grey surfaces, view factors, radiation network analysis'),
        ]},
        { number: 3, title: 'Thermodynamics', topics: [
          t('Thermodynamic systems and processes'),
          t('Properties of pure substances, behaviour of ideal and real gases'),
          t('Zeroth, first and second laws of thermodynamics'),
          t('Calculation of work, heat, energy changes and entropy changes in various processes'),
          t('Application of first and second laws for analysis of closed and open systems'),
          t('Thermodynamic property charts and tables, availability and irreversibility'),
          t('Thermodynamic relations'),
        ]},
        { number: 4, title: 'Applications', topics: [
          t('Power Engineering: vapour and gas power cycles, concepts of regeneration and reheat'),
          t('I.C. Engines: Air-standard Otto, Diesel and dual cycles'),
          t('Basics of Combustion: Air-Fuel Ratio, Equivalence Ratio'),
          t('Refrigeration and air-conditioning: vapour and gas refrigeration and heat pump cycles'),
          t('Properties of moist air, psychrometric chart, basic psychrometric processes'),
          t('Turbomachinery: impulse and reaction principles, velocity diagrams'),
          t('Pelton-wheel, Francis and Kaplan turbines, steam and gas turbines'),
          t('Air and gas compressors, pumps and pump characteristics'),
        ]},
      ],
    },
    {
      code: 'GATE-ME-S4', name: 'Section 4: Materials, Manufacturing and Industrial Engineering', semester: 0, credits: 0,
      units: [
        { number: 1, title: 'Engineering Materials', topics: [
          t('Crystal structure of common metals, phase diagrams, heat treatment'),
          t('Properties and applications of engineering materials - metals and alloys, polymers, composites and ceramics'),
          t('Engineering and true stress-strain diagrams'),
        ]},
        { number: 2, title: 'Casting, Forming and Joining Processes', topics: [
          t('Different types of casting processes'), t('Patterns, moulds and core'),
          t('Solidification and cooling, riser and gating design, casting defects'),
          t('Plastic deformation and yield criteria'), t('Hot working and cold working'),
          t('Principles of bulk forming and sheet forming processes and estimation of load'),
          t('Fundamentals of powder metallurgy and its applications'),
          t('Principles of welding, brazing, soldering'),
          t('Solid-state welding processes, adhesive bonding'), t('Non-destructive testing methods'),
        ]},
        { number: 3, title: 'Machining and Machine Tool Operations', topics: [
          t('Basic machining operations and machine tools'),
          t('Single-point and multipoint cutting tools'),
          t('Geometry of single-point turning tools - ASA and ORS systems'),
          t('Mechanics of machining'), t('Cutting tool materials, tool life and tool wear'),
          t('Economics of machining'), t('Abrasive machining processes'),
          t('Principles and applications of non-traditional machining processes'),
          t('Principles of work holding, jigs and fixtures'),
        ]},
        { number: 4, title: 'Additive Manufacturing', topics: [
          t('Principles of different types of additive manufacturing processes for engineering materials'),
          t('Additively manufactured products - advantages, limitations, and applications'),
        ]},
        { number: 5, title: 'Metrology and Inspection', topics: [
          t('Limits, fits and tolerances'), t('Linear and angular measurements'), t('Comparators'),
          t('Interferometry'), t('Form and finish measurement'), t('Alignment and testing methods'),
          t('Tolerance analysis in manufacturing and assembly'),
          t('Principle of coordinate-measuring machine (CMM)'),
        ]},
        { number: 6, title: 'Computer Aided Manufacturing and Automation', topics: [
          t('Basic concepts of CAD/CAM and their integration tools'),
          t('NC/CNC machines and CNC programming'),
          t('Pneumatic, electro-pneumatic, and hydraulic actuators for automation'),
          t('Programmable logic controllers'),
        ]},
        { number: 7, title: 'Production Planning and Control', topics: [
          t('Work study, Productivity'), t('Forecasting models'), t('Aggregate production planning'),
          t('Scheduling'), t('Materials requirement planning'), t('Six sigma'), t('Lean manufacturing'),
          t('Inventory Control - deterministic models, safety stock, inventory control systems'),
          t('Quality and reliability concepts for product lifecycle analysis'),
        ]},
        { number: 8, title: 'Operations Research', topics: [
          t('Linear programming, Simplex method'), t('Transportation'), t('Assignment'),
          t('Network flow models'), t('Simple queuing models'), t('PERT and CPM'),
        ]},
      ],
    },
    {
      code: 'GATE-ME-GA', name: 'General Aptitude (common, 15 marks)', semester: 0, credits: 0,
      // The ME syllabus PDF does not contain the General Aptitude syllabus, so
      // these four area names are the standard GATE GA areas, not a transcript.
      verification: 'UNVERIFIED',
      units: [
        { number: 1, title: 'General Aptitude', topics: [
          t('Verbal Aptitude'), t('Quantitative Aptitude'), t('Analytical Aptitude'), t('Spatial Aptitude'),
        ]},
      ],
    },
  ] as SeedSubject[],
};

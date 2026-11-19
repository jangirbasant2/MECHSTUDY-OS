import React, { useState, useMemo } from 'react';
import {
  Calculator, Sparkles, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight,
  Eye, EyeOff, Info, Check, HelpCircle
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';
import type { FormulaItem } from '../data/formulasData';
import type { FormulaPracticeNumerical } from '../../../shared/types';
import katex from 'katex';

interface FormulaSandboxProps {
  formula: FormulaItem;
}

export function FormulaSandbox({ formula }: FormulaSandboxProps) {
  const toast = useApp(s => s.toast);

  // Unit toggles
  const [tempUnit, setTempUnit] = useState<'K' | 'C'>('C');
  const [stressUnit, setStressUnit] = useState<'MPa' | 'kPa'>('MPa');
  const [lengthUnit, setLengthUnit] = useState<'m' | 'mm'>('mm');
  const [speedUnit, setSpeedUnit] = useState<'rpm' | 'rad/s'>('rpm');

  // Dynamic variable inputs
  const [inputs, setInputs] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    if (formula.id.includes('carnot')) {
      return { T_H: 500, T_L: 30 };
    }
    if (formula.id.includes('sfee')) {
      return { q: 150, h1: 300, h2: 200, v1: 20, v2: 60, z1: 0, z2: 10 };
    }
    if (formula.id.includes('first-law')) {
      return { Q: 100, W: 40 };
    }
    if (formula.id.includes('principal') || formula.id.includes('mohr')) {
      return { sigma_x: 80, sigma_y: 20, tau_xy: 30 };
    }
    if (formula.id.includes('darcy') || formula.id.includes('head-loss')) {
      return { f: 0.02, L: 50, V: 2.5, D: 100 };
    }
    if (formula.id.includes('buckling') || formula.id.includes('euler')) {
      return { E: 200, I: 450000, L_e: 2000 };
    }
    if (formula.id.includes('reynolds')) {
      return { rho: 1000, V: 1.8, D: 50, mu: 0.001 };
    }
    if (formula.id.includes('conduction') || formula.id.includes('fourier')) {
      return { k: 45, A: 2.5, T1: 120, T2: 25, L: 150 };
    }
    // Generic fallback based on variables
    formula.variables.forEach((v, idx) => {
      init[v.symbol.replace(/[^a-zA-Z0-9_]/g, '') || `var_${idx}`] = 10 * (idx + 1);
    });
    return init;
  });

  // Calculation computation
  const calculationResult = useMemo(() => {
    try {
      const fid = formula.id.toLowerCase();

      // Carnot Efficiency
      if (fid.includes('carnot')) {
        let th = inputs.T_H ?? 500;
        let tl = inputs.T_L ?? 30;
        if (tempUnit === 'C') {
          th += 273.15;
          tl += 273.15;
        }
        if (th <= 0 || tl <= 0) return { error: 'Absolute temperatures must be > 0 K' };
        if (tl >= th) return { error: 'Sink temperature (TL) must be strictly lower than Source (TH)' };
        const eff = (1 - tl / th) * 100;
        return {
          primaryLabel: 'Carnot Thermal Efficiency (η_th)',
          value: `${eff.toFixed(2)} %`,
          notes: [
            `T_H = ${th.toFixed(2)} K, T_L = ${tl.toFixed(2)} K`,
            `Maximum theoretical work potential: ${(eff / 100).toFixed(4)} of Q_in`,
          ],
        };
      }

      // First Law (Closed)
      if (fid.includes('first-law')) {
        const q = inputs.Q ?? 0;
        const w = inputs.W ?? 0;
        const deltaU = q - w;
        return {
          primaryLabel: 'Change in Internal Energy (ΔU)',
          value: `${deltaU.toFixed(2)} kJ`,
          notes: [`Heat added (Q): ${q} kJ`, `Work done by system (W): ${w} kJ`],
        };
      }

      // SFEE (Work Done)
      if (fid.includes('sfee')) {
        const q = inputs.q ?? 0;
        const h1 = inputs.h1 ?? 0;
        const h2 = inputs.h2 ?? 0;
        const v1 = inputs.v1 ?? 0;
        const v2 = inputs.v2 ?? 0;
        const z1 = inputs.z1 ?? 0;
        const z2 = inputs.z2 ?? 0;
        const deltaH = h2 - h1;
        const deltaKe = (v2 * v2 - v1 * v1) / 2000;
        const deltaPe = (9.81 * (z2 - z1)) / 1000;
        const w = q - deltaH - deltaKe - deltaPe;
        return {
          primaryLabel: 'Specific Shaft Work Done (w)',
          value: `${w.toFixed(2)} kJ/kg`,
          notes: [
            `Δh = ${deltaH.toFixed(2)} kJ/kg`,
            `Δke = ${deltaKe.toFixed(3)} kJ/kg, Δpe = ${deltaPe.toFixed(3)} kJ/kg`,
          ],
        };
      }

      // Mohr's Circle / Principal Stresses
      if (fid.includes('principal') || fid.includes('mohr')) {
        let sx = inputs.sigma_x ?? 0;
        let sy = inputs.sigma_y ?? 0;
        let txy = inputs.tau_xy ?? 0;
        if (stressUnit === 'kPa') {
          sx /= 1000;
          sy /= 1000;
          txy /= 1000;
        }
        const center = (sx + sy) / 2;
        const radius = Math.sqrt(Math.pow((sx - sy) / 2, 2) + Math.pow(txy, 2));
        const s1 = center + radius;
        const s2 = center - radius;
        return {
          primaryLabel: 'Principal Stresses (σ₁ & σ₂)',
          value: `σ₁ = ${s1.toFixed(2)} MPa, σ₂ = ${s2.toFixed(2)} MPa`,
          notes: [
            `Maximum In-Plane Shear Stress (τ_max) = ${radius.toFixed(2)} MPa`,
            `Hydrostatic / Center Stress = ${center.toFixed(2)} MPa`,
          ],
        };
      }

      // Darcy-Weisbach Head Loss
      if (fid.includes('darcy') || fid.includes('head-loss')) {
        const f = inputs.f ?? 0.02;
        const L = inputs.L ?? 10;
        const V = inputs.V ?? 2;
        let D = inputs.D ?? 100;
        if (lengthUnit === 'mm') D /= 1000; // convert to meters
        if (D <= 0) return { error: 'Diameter must be > 0' };
        const hf = (f * L * V * V) / (2 * 9.81 * D);
        return {
          primaryLabel: 'Frictional Head Loss (h_f)',
          value: `${hf.toFixed(3)} m of fluid`,
          notes: [
            `Pressure Drop ΔP = ${(hf * 9.81 * 1000 / 1000).toFixed(2)} kPa (for water)`,
            `Velocity head V²/2g = ${(V * V / (2 * 9.81)).toFixed(3)} m`,
          ],
        };
      }

      // Euler Buckling Load
      if (fid.includes('buckling') || fid.includes('euler')) {
        let E = inputs.E ?? 200; // GPa
        const I = inputs.I ?? 50000; // mm^4
        let Le = inputs.L_e ?? 2000; // mm
        // Convert to standard SI: E to N/mm^2 (MPa), Le in mm
        const E_mpa = E * 1000; // 200 GPa = 200,000 MPa (N/mm^2)
        if (Le <= 0) return { error: 'Effective length must be > 0' };
        const pCrN = (Math.PI * Math.PI * E_mpa * I) / (Le * Le);
        const pCrKn = pCrN / 1000;
        return {
          primaryLabel: 'Critical Buckling Load (P_cr)',
          value: `${pCrKn.toFixed(2)} kN`,
          notes: [
            `E = ${E} GPa = ${E_mpa.toLocaleString()} N/mm²`,
            `P_cr = ${pCrN.toFixed(0)} N`,
          ],
        };
      }

      // Reynolds Number
      if (fid.includes('reynolds')) {
        const rho = inputs.rho ?? 1000;
        const V = inputs.V ?? 1.5;
        let D = inputs.D ?? 50;
        if (lengthUnit === 'mm') D /= 1000;
        const mu = inputs.mu ?? 0.001;
        if (mu <= 0 || D <= 0) return { error: 'Viscosity and diameter must be > 0' };
        const re = (rho * V * D) / mu;
        const regime = re < 2300 ? 'Laminar Flow (Re < 2300)' : re > 4000 ? 'Turbulent Flow (Re > 4000)' : 'Transition Zone (2300 ≤ Re ≤ 4000)';
        return {
          primaryLabel: 'Reynolds Number (Re)',
          value: `${Math.round(re).toLocaleString()}`,
          notes: [`Regime: ${regime}`, `Kinematic Viscosity ν = ${(mu / rho).toExponential(3)} m²/s`],
        };
      }

      // Fourier Heat Conduction
      if (fid.includes('conduction') || fid.includes('fourier')) {
        const k = inputs.k ?? 50;
        const A = inputs.A ?? 2;
        let t1 = inputs.T1 ?? 100;
        let t2 = inputs.T2 ?? 20;
        let L = inputs.L ?? 100;
        if (lengthUnit === 'mm') L /= 1000;
        if (L <= 0) return { error: 'Thickness (L) must be > 0' };
        const q = (k * A * (t1 - t2)) / L;
        return {
          primaryLabel: 'Heat Transfer Rate (Q)',
          value: `${q.toFixed(1)} W (${(q / 1000).toFixed(2)} kW)`,
          notes: [
            `Temperature gradient dT/dx = ${((t1 - t2) / L).toFixed(1)} K/m`,
            `Heat flux q" = ${(q / A).toFixed(1)} W/m²`,
          ],
        };
      }

      // Generic product evaluation for other cards
      const keys = Object.keys(inputs);
      const vals = keys.map(k => inputs[k]);
      const product = vals.reduce((acc, v) => acc * (v || 1), 1);
      return {
        primaryLabel: 'Computed Result',
        value: `${product.toFixed(2)}`,
        notes: [`Dynamic evaluation based on ${keys.length} input parameters`],
      };
    } catch (err: any) {
      return { error: err?.message || 'Calculation error' };
    }
  }, [formula.id, inputs, tempUnit, stressUnit, lengthUnit, speedUnit]);

  // Practice Numerical Generation State
  const [numericalLoading, setNumericalLoading] = useState(false);
  const [practiceNumerical, setPracticeNumerical] = useState<FormulaPracticeNumerical | null>(null);
  const [userAnswerInput, setUserAnswerInput] = useState<string>('');
  const [submittedCheck, setSubmittedCheck] = useState<{ isCorrect: boolean; delta: number } | null>(null);
  const [showSolution, setShowSolution] = useState(false);

  const handleGenerateNumerical = async () => {
    setNumericalLoading(true);
    setPracticeNumerical(null);
    setUserAnswerInput('');
    setSubmittedCheck(null);
    setShowSolution(false);

    try {
      const res = await api.formula.generateNumerical({
        formulaTitle: formula.title,
        latex: formula.latex,
        subject: formula.subject,
        variables: formula.variables,
      });
      setPracticeNumerical(res);
      toast('Generated 1 GATE-level NAT practice numerical!', 'success');
    } catch (err: any) {
      toast(`Failed to generate numerical: ${err?.message}`, 'error');
    } finally {
      setNumericalLoading(false);
    }
  };

  const handleCheckAnswer = () => {
    if (!practiceNumerical) return;
    const userVal = parseFloat(userAnswerInput.trim());
    if (isNaN(userVal)) {
      toast('Please enter a valid numeric answer.', 'info');
      return;
    }
    const correct = practiceNumerical.correctAnswer;
    const tol = practiceNumerical.tolerance || 0.1;
    const diff = Math.abs(userVal - correct);
    const isCorrect = diff <= tol;
    setSubmittedCheck({ isCorrect, delta: diff });
    if (isCorrect) {
      toast('Correct! High precision answer.', 'success');
    } else {
      toast(`Off by ${diff.toFixed(2)}. Review unit conversions below.`, 'error');
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel2)] p-3.5 space-y-4 text-xs">
      {/* Sandbox Header & Unit Switchers */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2.5">
        <div className="flex items-center gap-1.5 font-bold text-[var(--color-text)]">
          <Calculator size={14} className="text-blue-400" />
          <span>Interactive Sandbox &amp; Unit Calculator</span>
        </div>

        {/* Unit Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <span className="text-[var(--color-muted)] font-medium mr-1">Units:</span>
          {/* Temperature */}
          <button
            type="button"
            onClick={() => setTempUnit(tempUnit === 'C' ? 'K' : 'C')}
            className="rounded px-2 py-0.5 font-semibold bg-[var(--color-bg)] border border-[var(--color-border)] text-cyan-400 hover:bg-[var(--color-panel)]"
          >
            Temp: {tempUnit === 'C' ? '°C' : 'K'}
          </button>
          {/* Stress / Pressure */}
          <button
            type="button"
            onClick={() => setStressUnit(stressUnit === 'MPa' ? 'kPa' : 'MPa')}
            className="rounded px-2 py-0.5 font-semibold bg-[var(--color-bg)] border border-[var(--color-border)] text-emerald-400 hover:bg-[var(--color-panel)]"
          >
            Stress: {stressUnit}
          </button>
          {/* Length */}
          <button
            type="button"
            onClick={() => setLengthUnit(lengthUnit === 'mm' ? 'm' : 'mm')}
            className="rounded px-2 py-0.5 font-semibold bg-[var(--color-bg)] border border-[var(--color-border)] text-amber-400 hover:bg-[var(--color-panel)]"
          >
            Len: {lengthUnit}
          </button>
        </div>
      </div>

      {/* Input Variables Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {Object.keys(inputs).map(key => (
          <div key={key} className="space-y-1">
            <label className="block text-[10.5px] font-mono font-semibold text-[var(--color-muted)] truncate">
              {key} {key.toLowerCase().includes('t') ? `(${tempUnit})` : key.toLowerCase().includes('d') || key === 'l' ? `(${lengthUnit})` : ''}
            </label>
            <input
              type="number"
              step="any"
              value={inputs[key] ?? ''}
              onChange={e => {
                const val = parseFloat(e.target.value);
                setInputs(prev => ({ ...prev, [key]: isNaN(val) ? 0 : val }));
              }}
              className="w-full text-xs font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 text-white"
            />
          </div>
        ))}
      </div>

      {/* Live Calculated Output */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold text-blue-400">
            {calculationResult.primaryLabel || 'Result'}
          </div>
          <div className="text-lg font-black text-white font-mono mt-0.5">
            {calculationResult.value || calculationResult.error}
          </div>
          {calculationResult.notes && (
            <div className="text-[10px] text-[var(--color-muted)] mt-1 space-y-0.5">
              {calculationResult.notes.map((n, i) => (
                <div key={i}>• {n}</div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleGenerateNumerical}
          disabled={numericalLoading}
          className="btn btn-sm btn-primary shrink-0 flex items-center gap-1.5 text-xs"
        >
          {numericalLoading ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <Sparkles size={13} />
          )}
          <span>{numericalLoading ? 'Generating…' : 'Generate 1 Practice Numerical'}</span>
        </button>
      </div>

      {/* Generated Practice Numerical Problem */}
      {practiceNumerical && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              GATE NAT Practice Question
            </span>
            <span className="text-[10px] text-[var(--color-muted)]">
              Tested Formula: {practiceNumerical.formulaTested}
            </span>
          </div>

          <p className="text-xs font-medium text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
            {practiceNumerical.question}
          </p>

          {/* Interactive Answer Input & Tolerance Check */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <div className="flex items-center gap-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1">
              <span className="text-[11px] font-semibold text-[var(--color-muted)]">Answer:</span>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={userAnswerInput}
                onChange={e => setUserAnswerInput(e.target.value)}
                className="w-24 text-xs font-mono bg-transparent text-white focus:outline-hidden"
              />
              <span className="text-[10px] font-bold text-blue-400">{practiceNumerical.unit}</span>
            </div>

            <button
              type="button"
              onClick={handleCheckAnswer}
              className="btn btn-sm bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1"
            >
              Check Answer
            </button>

            <button
              type="button"
              onClick={() => setShowSolution(!showSolution)}
              className="btn btn-sm btn-ghost text-xs flex items-center gap-1 text-[var(--color-muted)] ml-auto"
            >
              {showSolution ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{showSolution ? 'Hide Solution' : 'View Full Solution & Traps'}</span>
            </button>
          </div>

          {/* Submission Verdict */}
          {submittedCheck && (
            <div
              className={`rounded-lg p-2.5 text-xs flex items-center gap-2 font-semibold ${
                submittedCheck.isCorrect
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              {submittedCheck.isCorrect ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span>
                {submittedCheck.isCorrect
                  ? 'Correct! Your numerical calculation matches the standard solution.'
                  : `Incorrect. Correct answer is ~${practiceNumerical.correctAnswer} (Tolerance ±${practiceNumerical.tolerance || 0.1}). Check unit conversions.`}
              </span>
            </div>
          )}

          {/* Step-by-Step Solution & Tricky Unit Traps */}
          {showSolution && (
            <div className="rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] p-3 space-y-2 text-xs">
              {practiceNumerical.unitTraps && practiceNumerical.unitTraps.length > 0 && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2 text-[11px] text-amber-300 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <AlertTriangle size={12} />
                    <span>Watch Out for These Unit Traps in GATE:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[var(--color-muted)]">
                    {practiceNumerical.unitTraps.map((t, idx) => (
                      <li key={idx}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-[11px] font-bold text-blue-400">Step-by-Step Solution:</div>
              <div className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--color-text)]">
                {practiceNumerical.stepByStepSolution}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

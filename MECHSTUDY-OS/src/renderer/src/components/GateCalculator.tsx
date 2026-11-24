import React, { useState, useEffect, useRef } from 'react';
import { Calculator, X, Minus, Move, RotateCcw } from 'lucide-react';
import { useApp } from '../store';

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n === 0 || n === 1) return 1;
  if (n > 170) return Infinity; // overflow for IEEE 754
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

export function GateCalculator() {
  const gateCalcOpen = useApp(s => s.gateCalcOpen);
  const setGateCalcOpen = useApp(s => s.setGateCalcOpen);

  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [isRad, setIsRad] = useState(false); // default Degree mode as in TCS-iON
  const [memory, setMemory] = useState(0);
  const [hasMemory, setHasMemory] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [newNumber, setNewNumber] = useState(true);

  // Position state for draggable window
  const [pos, setPos] = useState({ x: window.innerWidth - 480, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - 460, dragRef.current.origX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 100, dragRef.current.origY + dy)),
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!gateCalcOpen) return null;

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  };

  const handleDigit = (d: string) => {
    if (newNumber) {
      setDisplay(d === '.' ? '0.' : d);
      setNewNumber(false);
    } else {
      if (d === '.' && display.includes('.')) return;
      setDisplay(display === '0' && d !== '.' ? d : display + d);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setNewNumber(true);
  };

  const handleAllClear = () => {
    setDisplay('0');
    setExpression('');
    setNewNumber(true);
  };

  const handleBackspace = () => {
    if (newNumber) return;
    if (display.length <= 1) {
      setDisplay('0');
      setNewNumber(true);
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const handleToggleSign = () => {
    const val = parseFloat(display);
    if (!isNaN(val)) {
      setDisplay(String(-val));
    }
  };

  const evaluateExpressionSafe = (expr: string): number => {
    try {
      // Replace power ^ with **
      let sanitized = expr.replace(/\^/g, '**');
      // Evaluate standard arithmetic safely
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${sanitized})`)();
      return typeof result === 'number' && !isNaN(result) ? result : NaN;
    } catch {
      return NaN;
    }
  };

  const handleOperator = (op: string) => {
    const curVal = display;
    setExpression(prev => (prev ? `${prev} ${curVal} ${op}` : `${curVal} ${op}`));
    setNewNumber(true);
  };

  const handleEquals = () => {
    if (!expression) return;
    const fullExpr = `${expression} ${display}`;
    const res = evaluateExpressionSafe(fullExpr);
    if (isNaN(res)) {
      setDisplay('Error');
    } else {
      const formatted = Number(res.toFixed(10)).toString();
      setDisplay(formatted);
      setExpression('');
    }
    setNewNumber(true);
  };

  // Scientific Unary Functions
  const applyUnary = (fn: (x: number) => number, label: string) => {
    const x = parseFloat(display);
    if (isNaN(x)) return;

    let res: number;
    if (!isRad && ['sin', 'cos', 'tan'].includes(label)) {
      // Convert Degrees to Radians
      const rad = (x * Math.PI) / 180;
      res = fn(rad);
    } else if (!isRad && ['asin', 'acos', 'atan'].includes(label)) {
      // Convert Radians back to Degrees
      const radRes = fn(x);
      res = (radRes * 180) / Math.PI;
    } else {
      res = fn(x);
    }

    if (isNaN(res) || !isFinite(res)) {
      setDisplay('Invalid Input');
    } else {
      setDisplay(Number(res.toFixed(10)).toString());
    }
    setNewNumber(true);
  };

  // Memory Operations
  const handleMemory = (action: 'MC' | 'MR' | 'MS' | 'M+' | 'M-') => {
    const cur = parseFloat(display) || 0;
    if (action === 'MC') {
      setMemory(0);
      setHasMemory(false);
    } else if (action === 'MR') {
      setDisplay(String(memory));
      setNewNumber(true);
    } else if (action === 'MS') {
      setMemory(cur);
      setHasMemory(cur !== 0);
      setNewNumber(true);
    } else if (action === 'M+') {
      const next = memory + cur;
      setMemory(next);
      setHasMemory(next !== 0);
      setNewNumber(true);
    } else if (action === 'M-') {
      const next = memory - cur;
      setMemory(next);
      setHasMemory(next !== 0);
      setNewNumber(true);
    }
  };

  if (minimized) {
    return (
      <div
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-[100] flex items-center gap-2 rounded-xl border border-blue-500/40 bg-zinc-900/95 px-3 py-2 shadow-2xl backdrop-blur-md cursor-pointer text-xs font-semibold text-white hover:border-blue-400"
        onClick={() => setMinimized(false)}
      >
        <Calculator size={14} className="text-blue-400" />
        <span>GATE Calculator</span>
        <button
          onClick={(e) => { e.stopPropagation(); setGateCalcOpen(false); }}
          className="ml-2 text-zinc-400 hover:text-white"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[100] w-[460px] select-none rounded-2xl border border-zinc-700 bg-zinc-900/95 p-3.5 shadow-2xl backdrop-blur-md text-white font-sans text-xs"
    >
      {/* Title & Drag Header */}
      <div
        onMouseDown={handleDragStart}
        className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800 cursor-move"
      >
        <div className="flex items-center gap-2 font-bold tracking-tight text-zinc-200">
          <Calculator size={15} className="text-blue-400" />
          <span>TCS-iON GATE Virtual Calculator</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            title="Minimize"
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            onClick={() => setGateCalcOpen(false)}
            className="rounded p-1 text-zinc-400 hover:bg-rose-500 hover:text-white"
            title="Close (Alt+C)"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Screen Readout */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 mb-3 text-right">
        <div className="flex items-center justify-between text-[11px] text-zinc-500 min-h-[16px] font-mono">
          <div className="flex items-center gap-1.5 font-sans">
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${isRad ? 'bg-zinc-800 text-zinc-300' : 'bg-blue-600 text-white'}`}>
              {isRad ? 'RAD' : 'DEG'}
            </span>
            {hasMemory && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold text-[10px]">
                M ({memory})
              </span>
            )}
          </div>
          <span className="truncate max-w-[280px]">{expression || '\u00A0'}</span>
        </div>
        <div className="mt-1 text-2xl font-mono font-bold tracking-tight text-white truncate">
          {display}
        </div>
      </div>

      {/* Degree / Radian & Memory Row */}
      <div className="grid grid-cols-6 gap-1 mb-1.5 text-[11px]">
        <button
          type="button"
          onClick={() => setIsRad(!isRad)}
          className={`py-1.5 rounded-lg font-bold border transition-all ${
            isRad ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-blue-600 text-white border-blue-500'
          }`}
        >
          {isRad ? 'Rad' : 'Deg'}
        </button>
        <button type="button" onClick={() => handleMemory('MC')} className="calc-btn-fn">MC</button>
        <button type="button" onClick={() => handleMemory('MR')} className="calc-btn-fn">MR</button>
        <button type="button" onClick={() => handleMemory('MS')} className="calc-btn-fn">MS</button>
        <button type="button" onClick={() => handleMemory('M+')} className="calc-btn-fn">M+</button>
        <button type="button" onClick={() => handleMemory('M-')} className="calc-btn-fn">M-</button>
      </div>

      {/* Scientific Functions Grid */}
      <div className="grid grid-cols-6 gap-1 mb-1 text-[11px]">
        <button type="button" onClick={() => applyUnary(Math.sin, 'sin')} className="calc-btn-sci">sin</button>
        <button type="button" onClick={() => applyUnary(Math.cos, 'cos')} className="calc-btn-sci">cos</button>
        <button type="button" onClick={() => applyUnary(Math.tan, 'tan')} className="calc-btn-sci">tan</button>
        <button type="button" onClick={() => applyUnary(Math.asin, 'asin')} className="calc-btn-sci">sin⁻¹</button>
        <button type="button" onClick={() => applyUnary(Math.acos, 'acos')} className="calc-btn-sci">cos⁻¹</button>
        <button type="button" onClick={() => applyUnary(Math.atan, 'atan')} className="calc-btn-sci">tan⁻¹</button>

        <button type="button" onClick={() => applyUnary(Math.sinh, 'sinh')} className="calc-btn-sci">sinh</button>
        <button type="button" onClick={() => applyUnary(Math.cosh, 'cosh')} className="calc-btn-sci">cosh</button>
        <button type="button" onClick={() => applyUnary(Math.tanh, 'tanh')} className="calc-btn-sci">tanh</button>
        <button type="button" onClick={() => applyUnary(Math.log, 'ln')} className="calc-btn-sci">ln</button>
        <button type="button" onClick={() => applyUnary(Math.log10, 'log10')} className="calc-btn-sci">log₁₀</button>
        <button type="button" onClick={() => applyUnary(Math.exp, 'exp')} className="calc-btn-sci">eˣ</button>

        <button type="button" onClick={() => applyUnary(x => Math.pow(10, x), '10x')} className="calc-btn-sci">10ˣ</button>
        <button type="button" onClick={() => applyUnary(x => Math.pow(x, 2), 'x2')} className="calc-btn-sci">x²</button>
        <button type="button" onClick={() => applyUnary(x => Math.pow(x, 3), 'x3')} className="calc-btn-sci">x³</button>
        <button type="button" onClick={() => applyUnary(Math.sqrt, 'sqrt')} className="calc-btn-sci">√x</button>
        <button type="button" onClick={() => applyUnary(Math.cbrt, 'cbrt')} className="calc-btn-sci">∛x</button>
        <button type="button" onClick={() => applyUnary(x => (x !== 0 ? 1 / x : NaN), 'inv')} className="calc-btn-sci">1/x</button>

        <button type="button" onClick={() => applyUnary(factorial, 'fact')} className="calc-btn-sci">n!</button>
        <button type="button" onClick={() => applyUnary(Math.abs, 'abs')} className="calc-btn-sci">|x|</button>
        <button type="button" onClick={() => { setDisplay(String(Math.PI)); setNewNumber(true); }} className="calc-btn-sci">π</button>
        <button type="button" onClick={() => { setDisplay(String(Math.E)); setNewNumber(true); }} className="calc-btn-sci">e</button>
        <button type="button" onClick={() => handleOperator('^')} className="calc-btn-sci">xʸ</button>
        <button type="button" onClick={() => handleOperator('%')} className="calc-btn-sci">mod</button>
      </div>

      {/* Main Arithmetic & Numpad Grid */}
      <div className="grid grid-cols-6 gap-1 pt-1 border-t border-zinc-800 text-xs">
        <button type="button" onClick={() => setExpression(prev => prev + ' (')} className="calc-btn-op">(</button>
        <button type="button" onClick={() => setExpression(prev => prev + ' )')} className="calc-btn-op">)</button>
        <button type="button" onClick={handleClear} className="calc-btn-warn">C</button>
        <button type="button" onClick={handleAllClear} className="calc-btn-warn">AC</button>
        <button type="button" onClick={handleBackspace} className="calc-btn-fn">⌫</button>
        <button type="button" onClick={() => handleOperator('/')} className="calc-btn-op">÷</button>

        <button type="button" onClick={handleToggleSign} className="calc-btn-fn">±</button>
        <button type="button" onClick={() => handleDigit('7')} className="calc-btn-num">7</button>
        <button type="button" onClick={() => handleDigit('8')} className="calc-btn-num">8</button>
        <button type="button" onClick={() => handleDigit('9')} className="calc-btn-num">9</button>
        <button type="button" onClick={() => handleOperator('*')} className="calc-btn-op">×</button>
        <button type="button" onClick={() => handleOperator('-')} className="calc-btn-op">−</button>

        <button type="button" onClick={() => applyUnary(x => x / 100, '%')} className="calc-btn-fn">%</button>
        <button type="button" onClick={() => handleDigit('4')} className="calc-btn-num">4</button>
        <button type="button" onClick={() => handleDigit('5')} className="calc-btn-num">5</button>
        <button type="button" onClick={() => handleDigit('6')} className="calc-btn-num">6</button>
        <button type="button" onClick={() => handleOperator('+')} className="calc-btn-op">+</button>
        <button type="button" onClick={handleEquals} className="row-span-2 calc-btn-eq text-base font-bold">=</button>

        <button type="button" onClick={() => applyUnary(x => Math.log2(x), 'log2')} className="calc-btn-sci text-[10px]">log₂</button>
        <button type="button" onClick={() => handleDigit('1')} className="calc-btn-num">1</button>
        <button type="button" onClick={() => handleDigit('2')} className="calc-btn-num">2</button>
        <button type="button" onClick={() => handleDigit('3')} className="calc-btn-num">3</button>
        <button type="button" onClick={() => handleDigit('0')} className="col-span-1 calc-btn-num">0</button>
      </div>

      <div className="grid grid-cols-6 gap-1 mt-1 text-xs">
        <div className="col-span-4" />
        <button type="button" onClick={() => handleDigit('.')} className="calc-btn-num font-bold">.</button>
      </div>

      <style>{`
        .calc-btn-num {
          padding: 8px 4px;
          border-radius: 8px;
          font-weight: 700;
          background: #27272a;
          border: 1px solid #3f3f46;
          color: #fafafa;
          transition: all 0.1s;
        }
        .calc-btn-num:hover { background: #3f3f46; }
        .calc-btn-op {
          padding: 8px 4px;
          border-radius: 8px;
          font-weight: 700;
          background: #1e293b;
          border: 1px solid #334155;
          color: #38bdf8;
          transition: all 0.1s;
        }
        .calc-btn-op:hover { background: #334155; }
        .calc-btn-sci {
          padding: 6px 2px;
          border-radius: 6px;
          font-size: 10.5px;
          font-weight: 600;
          background: #18181b;
          border: 1px solid #27272a;
          color: #a1a1aa;
          transition: all 0.1s;
        }
        .calc-btn-sci:hover { background: #27272a; color: #fff; }
        .calc-btn-fn {
          padding: 6px 2px;
          border-radius: 6px;
          font-weight: 600;
          background: #27272a;
          border: 1px solid #3f3f46;
          color: #e4e4e7;
        }
        .calc-btn-fn:hover { background: #3f3f46; }
        .calc-btn-warn {
          padding: 8px 4px;
          border-radius: 8px;
          font-weight: 700;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
        }
        .calc-btn-warn:hover { background: rgba(239, 68, 68, 0.25); }
        .calc-btn-eq {
          padding: 8px 4px;
          border-radius: 8px;
          background: #2563eb;
          border: 1px solid #3b82f6;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .calc-btn-eq:hover { background: #1d4ed8; }
      `}</style>
    </div>
  );
}

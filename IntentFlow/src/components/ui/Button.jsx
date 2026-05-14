import React from 'react';

const variantClasses = {
  primary: 'bg-primary-500 hover:bg-primary-600 text-white',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700',
  neutral: 'bg-slate-700 hover:bg-slate-600 text-slate-100',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  ghost: 'bg-transparent hover:bg-slate-800 text-slate-100',
  /** Property Map — no black / no slate */
  pmPrimary:
    'bg-[#0047AB] hover:brightness-110 text-[#F0F9FF] border border-white/25 shadow-sm',
  pmSecondary:
    'bg-[#3B82F6] hover:brightness-105 text-[#F0F9FF] border border-white/30 shadow-sm',
  pmDanger: 'bg-rose-600 hover:bg-rose-700 text-white border border-white/20',
};

export default function Button({ type = 'button', variant = 'primary', className = '', disabled = false, children, ...props }) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition duration-200 ${variantClasses[variant] || variantClasses.primary} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

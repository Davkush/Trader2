import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, Key, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { setSession } from '../utils/api';

interface AuthScreenProps {
  onAuthSuccess: (user: { id: string; email: string }) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError('');

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed. Please check your credentials.');
      }

      // Save token and user info
      setSession(data.token, data.user);
      onAuthSuccess(data.user);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-screen-container" className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background ambient lighting effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10">
        
        {/* Terminal Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full text-indigo-400 text-xs font-medium tracking-wide mb-4">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>High-Fidelity Quantitative Suite v4.1</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2 font-sans">
            QUANT<span className="text-indigo-500">VAULT</span>
          </h1>
          <p className="text-sm text-slate-400">
            Professional Multi-Tenant Trading Terminal & AI Agent Hub
          </p>
        </div>

        {/* Card Frame */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl p-8 relative overflow-hidden">
          
          {/* Subtle top indicator line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600" />

          {/* Toggle Tabs */}
          <div className="flex border-b border-slate-800/80 mb-6 pb-1">
            <button
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 pb-3 text-sm font-medium tracking-wide border-b-2 transition-all duration-300 ${
                isLogin 
                  ? 'border-indigo-500 text-white font-semibold' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 pb-3 text-sm font-medium tracking-wide border-b-2 transition-all duration-300 ${
                !isLogin 
                  ? 'border-indigo-500 text-white font-semibold' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg p-3 text-xs mb-4 flex items-start gap-2.5 animate-fadeIn">
              <div className="w-1.5 h-1.5 bg-rose-500 rounded-full mt-1.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Email field */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium tracking-wider uppercase">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/30 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-all"
                  required
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium tracking-wider uppercase">Secure Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/30 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-all"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700/50 disabled:cursor-not-allowed text-white text-sm font-semibold tracking-wide py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/20 active:scale-[0.98] transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Configuring terminal environment...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isLogin ? 'Establish Secure Session' : 'Register Secure Tenant'}</span>
                </>
              )}
            </button>
          </form>

          {/* Secure vault telemetry info */}
          <div className="mt-6 pt-5 border-t border-slate-800/50 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-500" />
              <span>AES-256-GCM Secure Vault</span>
            </span>
            <span className="flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5 text-indigo-400 animate-spin" style={{ animationDuration: '6s' }} />
              <span>Network Sync Active</span>
            </span>
          </div>

        </div>

        {/* Outer bottom info */}
        <div className="text-center mt-6 text-xs text-slate-500 font-mono">
          <span>IP Encrypted Transit • Isolated Sandboxes Enabled</span>
        </div>

      </div>
    </div>
  );
};

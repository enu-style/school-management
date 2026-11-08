import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Eye, EyeOff, Loader2 } from "lucide-react";
import api from "../api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      navigate(res.data.user.role === "student" ? "/dashboard" : "/overview");
    } catch (err) {
      setError(err.response?.data?.error || "Cannot connect to the server");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full border border-slate-300 rounded-lg px-3 py-2.5";

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-navy text-white flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="bg-teal rounded-lg p-2">
            <GraduationCap size={26} />
          </div>
          <span className="text-xl font-semibold">School Management</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Everything your school needs, in one place.
          </h1>
          <p className="text-slate-300">
            Students, teachers, attendance, grades, and report cards for Grades
            1 to 12.
          </p>
        </div>
        <p className="text-sm text-slate-400">Grades 1 - 12</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-surface">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="bg-teal text-white rounded-lg p-2">
              <GraduationCap size={22} />
            </div>
            <span className="text-lg font-semibold">School Management</span>
          </div>

          <h2 className="text-2xl font-bold mb-1">Welcome back</h2>
          <p className="text-slate-500 mb-6">Sign in to continue</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputClass} mb-4`}
            required
            autoFocus
          />

          <label className="block text-sm font-medium mb-1">Password</label>
          <div className="relative mb-6">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-10`}
              required
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ink"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy hover:bg-navy-light text-white font-medium py-2.5 rounded-lg disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-xs text-slate-400 text-center mt-6">
            Forgot your password? Ask the school administrator to reset it.
          </p>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Example real-time subscription & data fetching
  useEffect(() => {
    // Initial fetch
    const fetchAgents = async () => {
      try {
        const { data, error } = await supabase
          .from("agents")
          .select("*")
          .order("name", { ascending: true });
        
        if (error) throw error;
        setAgents(data || []);
      } catch (err) {
        console.error("Error fetching agents:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();

    // Subscribe to real-time changes
    const channel = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agents" },
        (payload) => {
          console.log("Real-time update:", payload);
          // Refresh list on any change
          fetchAgents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="p-8 max-w-7xl mx-auto min-h-screen flex flex-col gap-8">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            DSR Command Center
          </h1>
          <p className="text-slate-400 mt-2 text-lg">
            Real-time agency performance dashboard.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 glass-panel rounded-full">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-medium text-emerald-400">Live Updates Active</span>
          </div>
        </div>
      </header>

      {/* Stats Overview */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Calls Today" value="1,248" trend="+12%" icon="📞" />
        <StatCard title="New Business" value="$14,320" trend="+5%" icon="📈" />
        <StatCard title="Quotes Generated" value="84" trend="-2%" icon="📝" />
        <StatCard title="Active Agents" value={loading ? "..." : agents.length.toString()} trend="0%" icon="👥" />
      </section>

      {/* Main Content Area */}
      <section className="glass-panel p-6 flex-1">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-100">Agent Performance (Spine)</h2>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-semibold">
            Export Report
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-xl mb-4">No agents found in the database.</p>
            <p className="text-sm max-w-md mx-auto">
              Please run the Python ingestion script to populate the Supabase `agents` table. Ensure your `.env.local` is properly configured.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="py-3 px-4 text-sm font-semibold text-slate-300">Name</th>
                  <th className="py-3 px-4 text-sm font-semibold text-slate-300">Team</th>
                  <th className="py-3 px-4 text-sm font-semibold text-slate-300">Office</th>
                  <th className="py-3 px-4 text-sm font-semibold text-slate-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-200">{agent.name}</td>
                    <td className="py-3 px-4 text-slate-400">{agent.team || '—'}</td>
                    <td className="py-3 px-4 text-slate-400">{agent.office || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        agent.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {agent.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

// Simple internal component for the stat cards
function StatCard({ title, value, trend, icon }: { title: string, value: string, trend: string, icon: string }) {
  const isPositive = trend.startsWith('+');
  return (
    <div className="glass-card p-6 flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <span className="text-slate-400 font-medium text-sm">{title}</span>
        <span className="text-2xl bg-slate-800/50 p-2 rounded-lg">{icon}</span>
      </div>
      <div>
        <h3 className="text-3xl font-bold text-white mb-1">{value}</h3>
        <span className={`text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend} from yesterday
        </span>
      </div>
    </div>
  );
}

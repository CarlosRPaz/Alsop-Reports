"use client"

import { useState } from "react"
import { Filter, X, Clock, ChevronDown } from "lucide-react"
import { Button } from "./Button"
import { Badge } from "./Badge"

export interface FilterState {
  offices: string[];
  teams: string[];
  agents: string[];
  meetings: string[];
}

interface FilterBarProps {
  onFilterChange: (filters: FilterState) => void;
  availableAgents?: string[];
  availableMeetings?: string[];
}

const OFFICES = ["MCM", "MB", "RC", "CH"];
const TEAMS = ["Managers", "Sales", "CSR", "EA"];

export function FilterBar({ onFilterChange, availableAgents = [], availableMeetings = [] }: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>({ offices: [], teams: [], agents: [], meetings: [] });
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleFilter = (category: keyof FilterState, value: string, isMulti: boolean) => {
    const current = filters[category];
    let updated: string[];

    if (isMulti) {
      updated = current.includes(value) 
        ? current.filter(v => v !== value) 
        : [...current, value];
    } else {
      // Single select: deselect if clicked active item when it's the only active one, otherwise set as sole active item
      updated = current.includes(value) && current.length === 1 ? [] : [value];
    }
    
    const newState = { ...filters, [category]: updated };
    setFilters(newState);
    onFilterChange(newState);
  };

  const clearAll = () => {
    const empty: FilterState = { offices: [], teams: [], agents: [], meetings: [] };
    setFilters(empty);
    onFilterChange(empty);
  };

  const activeCount = filters.offices.length + filters.teams.length + filters.agents.length + filters.meetings.length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-6 shadow-sm overflow-hidden">
      {/* Clickable Header for Collapsing */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-4 cursor-pointer select-none hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-slate-700 font-medium text-sm flex-wrap">
          <Filter className="w-4 h-4 text-blue-500" />
          <span>Data Filters</span>
          {activeCount > 0 && (
            <span className="ml-2 text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
              {activeCount} Active
            </span>
          )}
          <span className="text-[10px] text-slate-400 font-normal ml-3 hidden sm:inline select-none bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
            Ctrl+Click to select multiple
          </span>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {activeCount > 0 && (
            <button onClick={clearAll} className="text-[11px] text-slate-500 hover:text-slate-900 transition-colors mr-2">
              Clear All
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex flex-wrap gap-x-8 gap-y-4">
          
          {/* Offices */}
          <div>
            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Offices</h4>
            <div className="flex flex-wrap gap-1.5">
              {OFFICES.map(office => {
                const active = filters.offices.includes(office);
                return (
                  <button
                    key={office} 
                    onClick={(e) => toggleFilter("offices", office, e.ctrlKey || e.metaKey)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                      active 
                        ? "bg-blue-600 border-blue-500 text-white shadow-sm" 
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {office}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Teams */}
          <div>
            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Teams</h4>
            <div className="flex flex-wrap gap-1.5">
              {TEAMS.map(team => {
                const active = filters.teams.includes(team);
                return (
                  <button
                    key={team} 
                    onClick={(e) => toggleFilter("teams", team, e.ctrlKey || e.metaKey)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                      active 
                        ? "bg-emerald-600 border-emerald-500 text-white shadow-sm" 
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {team}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meetings */}
          {availableMeetings.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Meeting
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {availableMeetings.map(mt => {
                  const active = filters.meetings.includes(mt);
                  return (
                    <button
                      key={mt} 
                      onClick={(e) => toggleFilter("meetings", mt, e.ctrlKey || e.metaKey)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                        active 
                          ? "bg-amber-600 border-amber-500 text-white shadow-sm" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {mt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agents */}
          {availableAgents.length > 0 && (
            <div className="flex-1 min-w-[200px]">
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Agents</h4>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-2 custom-scrollbar">
                {availableAgents.map(agent => {
                  const active = filters.agents.includes(agent);
                  return (
                    <button
                      key={agent} 
                      onClick={(e) => toggleFilter("agents", agent, e.ctrlKey || e.metaKey)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                        active 
                          ? "bg-purple-600 border-purple-500 text-white shadow-sm" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {agent}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
        </div>
      )}
    </div>
  )
}

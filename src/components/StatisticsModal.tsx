'use client';

import { useState, useEffect } from 'react';
import type { WorldStatistics } from '@/lib/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function StatisticsModal({ isOpen, onClose }: Props) {
  const [statistics, setStatistics] = useState<WorldStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatistics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/api/world/statistics`);
      if (!response.ok) {
        throw new Error(`Failed to fetch statistics: ${response.status}`);
      }
      const data = await response.json();
      setStatistics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatistics();
    }
  }, [isOpen]);

  const formatNumber = (num: number) => num.toLocaleString();
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatTickTime = (tickCount: number, tickMs: number) => {
    const totalSeconds = (tickCount * tickMs) / 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">World Statistics</h2>
          <div className="flex gap-2">
            <button
              onClick={fetchStatistics}
              disabled={loading}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900 bg-opacity-50 border border-red-500 rounded text-red-200">
            Error: {error}
          </div>
        )}

        {statistics && (
          <div className="space-y-6">
            {/* World Information */}
            <div className="bg-gray-800 rounded p-4">
              <h3 className="text-lg font-semibold text-white mb-3">World Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Dimensions:</span>
                  <span className="text-white ml-2">{formatNumber(statistics.world.width)} × {formatNumber(statistics.world.height)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Seed:</span>
                  <span className="text-white ml-2">{statistics.world.seed}</span>
                </div>
                <div>
                  <span className="text-gray-400">Current Tick:</span>
                  <span className="text-white ml-2">{formatNumber(statistics.world.tickCount)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Simulation Time:</span>
                  <span className="text-white ml-2">{formatTickTime(statistics.world.tickCount, statistics.world.tickMs)}</span>
                </div>
              </div>
            </div>

            {/* Agent Statistics */}
            <div className="bg-gray-800 rounded p-4">
              <h3 className="text-lg font-semibold text-white mb-3">Agent Statistics</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{formatNumber(statistics.agents.alive)}</div>
                  <div className="text-sm text-gray-400">Alive</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">{formatNumber(statistics.agents.dead)}</div>
                  <div className="text-sm text-gray-400">Dead</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">{formatNumber(statistics.agents.total)}</div>
                  <div className="text-sm text-gray-400">Total</div>
                </div>
              </div>
              
              <div className="border-t border-gray-700 pt-3">
                <div className="text-sm text-gray-400 mb-2">Average Needs (Living Agents)</div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-red-400">Hunger:</span>
                    <span className="text-white">{formatPercent(statistics.agents.averageNeeds.hunger)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-400">Thirst:</span>
                    <span className="text-white">{formatPercent(statistics.agents.averageNeeds.thirst)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-400">Tiredness:</span>
                    <span className="text-white">{formatPercent(statistics.agents.averageNeeds.tiredness)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Death Statistics */}
            <div className="bg-gray-800 rounded p-4">
              <h3 className="text-lg font-semibold text-white mb-3">Death Statistics</h3>
              <div className="text-center mb-4">
                <div className="text-2xl font-bold text-red-400">{formatNumber(statistics.deaths.total)}</div>
                <div className="text-sm text-gray-400">Total Deaths</div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-orange-400">Hunger:</span>
                  <span className="text-white">{formatNumber(statistics.deaths.byCause.hunger)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-400">Thirst:</span>
                  <span className="text-white">{formatNumber(statistics.deaths.byCause.thirst)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-400">Tiredness:</span>
                  <span className="text-white">{formatNumber(statistics.deaths.byCause.tiredness)}</span>
                </div>
                {statistics.deaths.byCause.unknown > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Unknown:</span>
                    <span className="text-white">{formatNumber(statistics.deaths.byCause.unknown)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Resource Statistics */}
            <div className="bg-gray-800 rounded p-4">
              <h3 className="text-lg font-semibold text-white mb-3">Resource Statistics</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-red-400">Food Nodes:</span>
                  <span className="text-white">{formatNumber(statistics.resources.foodNodes)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-400">Water Sources:</span>
                  <span className="text-white">{formatNumber(statistics.resources.waterSources)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-400">Rest Spots:</span>
                  <span className="text-white">{formatNumber(statistics.resources.restSpots)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Objects:</span>
                  <span className="text-white">{formatNumber(statistics.resources.totalObjects)}</span>
                </div>
              </div>
            </div>

            {/* Timestamp */}
            <div className="text-center text-xs text-gray-500">
              Last updated: {new Date(statistics.timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

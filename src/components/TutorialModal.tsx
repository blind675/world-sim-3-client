'use client';

import { useState, useEffect } from 'react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ENTITY_COLORS = {
  tree: '#2f7a2d',
  rock: '#8d8d95',
  food: '#c8372d',
  water_source: '#3d8ed0',
  rest_spot: '#8a6436',
  agent: '#ffb84d',
};

const ENTITY_SYMBOLS = {
  tree: '🌲',
  rock: '🪨',
  food: '🍎',
  water_source: '💧',
  rest_spot: '⛺',
  agent: '🤖',
};

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [showSkip, setShowSkip] = useState(true);

  const pages = [
    {
      title: "Welcome to FlatWorld",
      content: (
        <div className="space-y-6">
          <p className="text-lg text-gray-300">
            FlatWorld is a living simulation where autonomous agents navigate, survive, and interact in a procedurally generated world.
          </p>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-white font-semibold mb-2">What you'll see:</h3>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                Agents with survival needs (hunger, thirst, tiredness)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                Dynamic world with resources that deplete and regrow
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                Perception systems and memory-based decision making
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                Real-time pathfinding and goal-seeking behavior
              </li>
            </ul>
          </div>
          <p className="text-sm text-gray-400 italic">
            Click "Next" to explore the world and its inhabitants...
          </p>
        </div>
      )
    },
    {
      title: "The World",
      content: (
        <div className="space-y-6">
          <p className="text-lg text-gray-300">
            The world is a toroidal grid (wraps around edges) with varied terrain and resources.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-white font-semibold mb-3">Terrain Types</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-blue-600 rounded"></div>
                  <span className="text-gray-300">Water (impassable)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-yellow-600 rounded"></div>
                  <span className="text-gray-300">Sand (slow movement)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-green-600 rounded"></div>
                  <span className="text-gray-300">Grass (normal speed)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-gray-600 rounded"></div>
                  <span className="text-gray-300">Stone (blocks vision)</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-white font-semibold mb-3">World Features</h3>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li>• Procedurally generated</li>
                <li>• Wraps at edges (toroidal)</li>
                <li>• Chunk-based rendering</li>
                <li>• Dynamic resource spreading</li>
              </ul>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <p className="text-xs text-gray-400">
              💡 The world continues evolving even when you're not watching - resources deplete, regrow, and spread naturally!
            </p>
          </div>
        </div>
      )
    },
    {
      title: "World Entities",
      content: (
        <div className="space-y-6">
          <p className="text-lg text-gray-300">
            The world contains various entities that agents interact with for survival.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {Object.entries(ENTITY_SYMBOLS).map(([type, symbol]) => (
              <div key={type} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{symbol}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full border-2 border-gray-600"
                      style={{ backgroundColor: ENTITY_COLORS[type as keyof typeof ENTITY_COLORS] }}
                    ></div>
                    <span className="text-white font-semibold capitalize">{type.replace('_', ' ')}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  {type === 'food' && 'Depletable resource that regrows over time'}
                  {type === 'water_source' && 'Infinite resource for thirst'}
                  {type === 'rest_spot' && 'Safe place to rest and recover'}
                  {type === 'tree' && 'Static environmental object'}
                  {type === 'rock' && 'Blocks vision and movement'}
                  {type === 'agent' && 'Autonomous survival-driven entity'}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <p className="text-xs text-gray-400">
              🎯 Food sources have limited stock (3 units) and take time to regrow after depletion.
            </p>
          </div>
        </div>
      )
    },
    {
      title: "Agents & Their Needs",
      content: (
        <div className="space-y-6">
          <p className="text-lg text-gray-300">
            Agents are autonomous beings with survival needs that drive their behavior.
          </p>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-white font-semibold mb-3">Survival Needs</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-red-400 font-medium">Hunger</span>
                  <span className="text-xs text-gray-400">0 = Full → 1 = Starving</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div className="bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 h-2 rounded-full" style={{ width: '65%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-blue-400 font-medium">Thirst</span>
                  <span className="text-xs text-gray-400">0 = Hydrated → 1 = Dehydrated</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div className="bg-gradient-to-r from-green-500 via-yellow-500 to-blue-500 h-2 rounded-full" style={{ width: '40%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-purple-400 font-medium">Tiredness</span>
                  <span className="text-xs text-gray-400">0 = Rested → 1 = Exhausted</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div className="bg-gradient-to-r from-green-500 via-yellow-500 to-purple-500 h-2 rounded-full" style={{ width: '80%' }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-white font-semibold mb-2">Agent Behavior</h3>
            <ul className="space-y-2 text-gray-300 text-sm">
              <li>• <strong className="text-yellow-400">Perception:</strong> Vision cone + near-field awareness</li>
              <li>• <strong className="text-yellow-400">Memory:</strong> Remembers resource locations with confidence</li>
              <li>• <strong className="text-yellow-400">Decision Making:</strong> Chooses most urgent need</li>
              <li>• <strong className="text-yellow-400">Pathfinding:</strong> A* navigation around obstacles</li>
              <li>• <strong className="text-yellow-400">Actions:</strong> Eat, drink, rest (8 ticks each)</li>
            </ul>
          </div>

          <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <p className="text-xs text-gray-400">
              ⚠️ When any need reaches 1.0, the agent dies and is removed from the simulation!
            </p>
          </div>
        </div>
      )
    },
    {
      title: "Perception & Memory",
      content: (
        <div className="space-y-6">
          <p className="text-lg text-gray-300">
            Agents perceive the world through vision and remember what they've seen.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-white font-semibold mb-3">Vision System</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-yellow-400 opacity-30 rounded-full"></div>
                  <span className="text-gray-300 text-sm">Near-field (360°)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-b-[35px] border-b-yellow-400 opacity-30"></div>
                  <span className="text-gray-300 text-sm">Vision cone (100°)</span>
                </div>
                <div className="text-xs text-gray-400">
                  • Blocked by terrain and objects<br />
                  • Wrap-around awareness<br />
                  • Distance-based sorting
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-white font-semibold mb-3">Memory System</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-300">Food location</span>
                  <span className="text-yellow-400">95% confidence</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Water source</span>
                  <span className="text-yellow-400">87% confidence</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Rest spot</span>
                  <span className="text-orange-400">62% confidence</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Tree</span>
                  <span className="text-gray-500">23% confidence</span>
                </div>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                • Confidence decays over time<br />
                • Limited capacity (50 entries)
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h3 className="text-white font-semibold mb-2">Pathfinding Example</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                <div className="w-4 h-4 bg-red-400 rounded-full"></div>
              </div>
              <span className="text-gray-300 text-sm">Agent → Planned Path → Target</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Uses A* algorithm with terrain costs and obstacle avoidance
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <p className="text-xs text-gray-400">
              🧠 Agents combine perception and memory to make intelligent decisions about where to go and what to do.
            </p>
          </div>
        </div>
      )
    }
  ];

  useEffect(() => {
    setShowSkip(currentPage === 0);
  }, [currentPage]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      handleClose();
    }
  };

  const handlePrevious = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleClose = () => {
    localStorage.setItem('flatworld-tutorial-completed', 'true');
    onClose();
  };

  const currentPageData = pages[currentPage];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 px-6 py-4 border-b border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">{currentPageData.title}</h2>
            {showSkip && (
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                Skip Tutorial
              </button>
            )}
          </div>
          {/* Progress indicator */}
          <div className="flex gap-1 mt-3">
            {pages.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full transition-colors ${index === currentPage ? 'bg-blue-500' : index < currentPage ? 'bg-gray-600' : 'bg-gray-700'
                  }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentPageData.content}
        </div>

        {/* Navigation */}
        <div className="bg-gray-800 px-6 py-4 border-t border-gray-700">
          <div className="flex justify-between items-center">
            <button
              onClick={handlePrevious}
              disabled={currentPage === 0}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <span className="text-gray-400 text-sm">
              {currentPage + 1} of {pages.length}
            </span>

            <button
              onClick={handleNext}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              {currentPage === pages.length - 1 ? 'Start Exploring' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

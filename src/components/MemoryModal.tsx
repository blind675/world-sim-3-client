import type { MemoryEntry } from '@/lib/types';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  memory: MemoryEntry[];
  currentTick: number;
  agentId: string;
}

// Color-per-type dot used in the memory list to match the map legend glyphs.
const MEMORY_TYPE_COLOR: Record<string, string> = {
  tree: '#2f7a2d',
  rock: '#8d8d95',
  food: '#c8372d',
  water_source: '#3b82f6',
  rest_spot: '#8b5cf6',
  agent: '#ef4444',
};

export function MemoryModal({ isOpen, onClose, memory, currentTick, agentId }: MemoryModalProps) {
  if (!isOpen) return null;

  const sorted = [...memory].sort((a, b) => b.confidence - a.confidence);
  
  // Count statistics
  const byType = new Map<string, { entities: number; clusters: number; members: number }>();
  let clusterCount = 0;
  let clusterMemberCount = 0;
  
  for (const m of memory) {
    const bucket = byType.get(m.type) ?? { entities: 0, clusters: 0, members: 0 };
    if (m.kind === 'cluster') {
      bucket.clusters += 1;
      bucket.members += m.memberIds.length;
      clusterCount += 1;
      clusterMemberCount += m.memberIds.length;
    } else {
      bucket.entities += 1;
    }
    byType.set(m.type, bucket);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-white">Agent Memory Inspection</h2>
            <p className="text-sm text-gray-400">Agent {agentId} at tick {currentTick}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Statistics */}
        <div className="p-4 border-b border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-400">Total Entries</div>
              <div className="text-white font-medium">{memory.length}</div>
            </div>
            <div>
              <div className="text-gray-400">Individual Items</div>
              <div className="text-white font-medium">{memory.length - clusterCount}</div>
            </div>
            <div>
              <div className="text-gray-400">Clusters</div>
              <div className="text-white font-medium">{clusterCount}</div>
            </div>
            <div>
              <div className="text-gray-400">Cluster Members</div>
              <div className="text-white font-medium">{clusterMemberCount}</div>
            </div>
          </div>
          
          {/* Type breakdown */}
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from(byType.entries()).map(([type, bucket]) => (
              <span key={type} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800 rounded text-xs">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: MEMORY_TYPE_COLOR[type] ?? '#aaa' }}
                />
                {type}
                {bucket.entities > 0 && ` ×${bucket.entities}`}
                {bucket.clusters > 0 && ` · ${bucket.clusters} group${bucket.clusters === 1 ? '' : 's'} (Σ${bucket.members})`}
              </span>
            ))}
          </div>
        </div>

        {/* Memory List */}
        <div className="flex-1 overflow-y-auto p-4">
          {memory.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nothing remembered yet.</p>
          ) : (
            <div className="space-y-1">
              {sorted.map((m) => {
                const ticksAgo = Math.max(0, currentTick - m.lastSeenTick);
                const confPct = Math.round(m.confidence * 100);
                const color = MEMORY_TYPE_COLOR[m.type] ?? '#aaa';
                
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2 rounded bg-gray-800/50 hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="text-sm">
                        <span className="text-white">{m.type}</span>
                        <span className="text-gray-400 ml-1">{m.id}</span>
                        {m.kind === 'cluster' && (
                          <span className="text-blue-400 ml-1 text-xs">
                            [cluster · {m.memberIds.length} members]
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>pos ({Math.round(m.x)}, {Math.round(m.y)})</span>
                      <span>{ticksAgo} ticks ago</span>
                      <span className="text-green-400">{confPct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Icon, icons } from '@/components/ui/Icon';
import { Btn } from '@/components/ui/Btn';
import { PhotoAnnotator } from '@/components/PhotoAnnotator';
import type { Inspection, InspectionItem, InspectionItemMedia, InspectionStatus } from '@/lib/types';

const STATUS_CONFIG: Record<InspectionStatus, { label: string; color: string; bg: string; border: string; icon: readonly string[] | string }> = {
  pass: { label: 'Pass', color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', icon: icons.check },
  fail: { label: 'Fail', color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/40', icon: icons.x },
  attention: { label: 'Attention', color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/40', icon: icons.alert },
  not_checked: { label: 'N/C', color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-600/40', icon: '' },
};

interface InspectionPanelProps {
  workOrderId: string;
}

export function InspectionPanel({ workOrderId }: InspectionPanelProps) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<InspectionItemMedia | null>(null);
  const [annotating, setAnnotating] = useState<InspectionItemMedia | null>(null);
  const [sharing, setSharing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'sent' | 'copied'>('idle');
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchInspection = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/inspection`);
      if (!res.ok) {
        setInspection(null);
        return;
      }
      const data = await res.json();
      if (data && data.id) {
        setInspection(data);
      } else {
        setInspection(null);
      }
    } catch {
      setFetchError(true);
      setInspection(null);
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    fetchInspection();
  }, [fetchInspection]);

  const startInspection = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/inspection`, { method: 'POST' });
      if (!res.ok) { setCreating(false); return; }
      const data = await res.json();
      if (data && data.id) {
        setInspection(data);
      }
    } catch {
      // silently fail
    } finally {
      setCreating(false);
    }
  };

  const updateItem = async (itemId: string, status: InspectionStatus) => {
    if (!inspection) return;
    setSaving(prev => new Set(prev).add(itemId));

    // Optimistic update
    setInspection(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(it => it.id === itemId ? { ...it, status } : it),
      };
    });

    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/inspection`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: itemId, status }] }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setInspection(data);
        }
      }
    } catch {
      await fetchInspection();
    } finally {
      setSaving(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const saveNotes = async (itemId: string) => {
    if (!inspection) return;
    setSaving(prev => new Set(prev).add(itemId));

    setInspection(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(it => it.id === itemId ? { ...it, notes: noteText || null } : it),
      };
    });

    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/inspection`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: itemId, notes: noteText || null }] }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) setInspection(data);
      }
    } catch {
      // silent
    } finally {
      setSaving(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      setEditingNotes(null);
    }
  };

  const uploadMedia = async (itemId: string, file: File) => {
    setUploading(prev => new Set(prev).add(itemId));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('inspection_item_id', itemId);

      const res = await fetch(`/api/work-orders/${workOrderId}/inspection/media`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const media: InspectionItemMedia = await res.json();
        // Optimistic add
        setInspection(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map(it =>
              it.id === itemId
                ? { ...it, media: [...(it.media || []), media] }
                : it
            ),
          };
        });
      }
    } catch {
      // silent
    } finally {
      setUploading(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const deleteMedia = async (mediaId: string, itemId: string) => {
    // Optimistic remove
    setInspection(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(it =>
          it.id === itemId
            ? { ...it, media: (it.media || []).filter(m => m.id !== mediaId) }
            : it
        ),
      };
    });

    try {
      await fetch(`/api/work-orders/${workOrderId}/inspection/media`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: mediaId }),
      });
    } catch {
      await fetchInspection();
    }
  };

  const handleFileSelect = (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      uploadMedia(itemId, files[i]);
    }
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const saveAnnotation = async (media: InspectionItemMedia, blob: Blob) => {
    setAnnotating(null);

    try {
      const formData = new FormData();
      formData.append('file', blob, 'annotated.jpg');
      formData.append('media_id', media.id);

      const res = await fetch(`/api/work-orders/${workOrderId}/inspection/media`, {
        method: 'PATCH',
        body: formData,
      });

      if (res.ok) {
        const updated: InspectionItemMedia = await res.json();
        setInspection(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map(it => ({
              ...it,
              media: (it.media || []).map(m =>
                m.id === updated.id ? updated : m
              ),
            })),
          };
        });
      }
    } catch {
      // silent
    }
  };

  const shareReport = async () => {
    setSharing(true);
    setShareStatus('idle');
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/inspection/share`, {
        method: 'POST',
      });
      if (res.ok) {
        const { url, sms_sent } = await res.json();
        await navigator.clipboard.writeText(url).catch(() => {});
        setShareStatus(sms_sent ? 'sent' : 'copied');
        setTimeout(() => setShareStatus('idle'), 4000);
      }
    } catch {
      // silent
    } finally {
      setSharing(false);
    }
  };

  const markAllPass = async () => {
    if (!inspection) return;
    const unchecked = inspection.items.filter(i => i.status === 'not_checked');
    if (unchecked.length === 0) return;
    if (!window.confirm(`Mark ${unchecked.length} remaining item${unchecked.length > 1 ? 's' : ''} as Pass?`)) return;

    setMarkingAll(true);
    try {
      await fetch(`/api/work-orders/${workOrderId}/inspection`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: unchecked.map(i => ({ id: i.id, status: 'pass' })),
        }),
      });
      await fetchInspection();
    } catch {
      // ignore
    }
    setMarkingAll(false);
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Group items by category
  const grouped = useMemo(() => {
    if (!inspection?.items) return {};
    const map: Record<string, InspectionItem[]> = {};
    for (const item of inspection.items) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return map;
  }, [inspection]);

  // Summary counts
  const summary = useMemo(() => {
    if (!inspection?.items) return { pass: 0, fail: 0, attention: 0, not_checked: 0, total: 0 };
    const counts = { pass: 0, fail: 0, attention: 0, not_checked: 0, total: inspection.items.length };
    for (const item of inspection.items) {
      counts[item.status]++;
    }
    return counts;
  }, [inspection]);

  // Category summary for badges
  const categorySummary = useMemo(() => {
    const map: Record<string, { pass: number; fail: number; attention: number; not_checked: number }> = {};
    if (!inspection?.items) return map;
    for (const item of inspection.items) {
      if (!map[item.category]) map[item.category] = { pass: 0, fail: 0, attention: 0, not_checked: 0 };
      map[item.category][item.status]++;
    }
    return map;
  }, [inspection]);

  const uncheckedCount = inspection ? inspection.items.filter(i => i.status === 'not_checked').length : 0;

  if (loading) {
    return (
      <div className="bg-bg rounded-xl border border-bdr p-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Icon d={icons.clipboard} size={16} />
          Loading inspection...
        </div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="bg-bg rounded-xl border border-bdr p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Icon d={icons.clipboard} size={16} stroke="#64748b" />
              <span className="text-[10px] font-heading text-slate-600 uppercase tracking-wider font-bold">
                Digital Vehicle Inspection
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {fetchError ? 'Failed to load inspection.' : 'No inspection started. Start one to check brakes, tires, fluids, and more.'}
            </p>
          </div>
          <Btn small onClick={fetchError ? fetchInspection : startInspection} disabled={creating}>
            <span className="flex items-center gap-1.5">
              <Icon d={icons.plus} size={12} />
              {creating ? 'Starting...' : fetchError ? 'Retry' : 'Start Inspection'}
            </span>
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg rounded-xl border border-bdr overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-bdr">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon d={icons.clipboard} size={16} stroke="#f97316" />
            <span className="text-[10px] font-heading text-slate-600 uppercase tracking-wider font-bold">
              Digital Vehicle Inspection
            </span>
          </div>
          <div className="flex items-center gap-2">
            {uncheckedCount > 0 && (
              <Btn small variant="secondary" onClick={markAllPass} disabled={markingAll}>
                <span className="flex items-center gap-1.5">
                  <Icon d={icons.check} size={13} />
                  {markingAll ? 'Marking...' : `Mark All Pass (${uncheckedCount})`}
                </span>
              </Btn>
            )}
            {(summary.fail > 0 || summary.attention > 0) && (
              <button
                onClick={shareReport}
                disabled={sharing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-orange-500/20 border border-orange-500/40 text-orange-400 hover:bg-orange-500/30 transition disabled:opacity-50"
              >
                <Icon d={icons.send} size={11} />
                {sharing ? 'Sending...' : shareStatus === 'sent' ? 'Sent & Copied!' : shareStatus === 'copied' ? 'Link Copied!' : 'Send Report'}
              </button>
            )}
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex flex-wrap gap-3">
          {summary.pass > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-emerald-400 font-medium">{summary.pass} passed</span>
            </div>
          )}
          {summary.fail > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-xs text-red-400 font-medium">{summary.fail} failed</span>
            </div>
          )}
          {summary.attention > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-xs text-amber-400 font-medium">{summary.attention} attention</span>
            </div>
          )}
          {summary.not_checked > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              <span className="text-xs text-slate-500 font-medium">{summary.not_checked} unchecked</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden flex">
          {summary.pass > 0 && (
            <div className="h-full bg-emerald-500" style={{ width: `${(summary.pass / summary.total) * 100}%` }} />
          )}
          {summary.fail > 0 && (
            <div className="h-full bg-red-500" style={{ width: `${(summary.fail / summary.total) * 100}%` }} />
          )}
          {summary.attention > 0 && (
            <div className="h-full bg-amber-500" style={{ width: `${(summary.attention / summary.total) * 100}%` }} />
          )}
        </div>
      </div>

      {/* Categories */}
      <div className="divide-y divide-bdr/50">
        {Object.entries(grouped).map(([category, items]) => {
          const isCollapsed = collapsedCats.has(category);
          const catSummary = categorySummary[category];
          const hasIssues = catSummary && (catSummary.fail > 0 || catSummary.attention > 0);
          const allPassed = catSummary && catSummary.pass === items.length;

          return (
            <div key={category}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-card/50 transition"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    d={isCollapsed ? icons.chevRight : icons.chevDown}
                    size={14}
                    stroke="#64748b"
                  />
                  <span className="text-xs font-heading font-bold text-slate-300 uppercase tracking-wider">
                    {category}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    ({items.length} items)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {allPassed && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                      ALL PASS
                    </span>
                  )}
                  {hasIssues && !allPassed && (
                    <>
                      {catSummary.fail > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">
                          {catSummary.fail} FAIL
                        </span>
                      )}
                      {catSummary.attention > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                          {catSummary.attention} ATN
                        </span>
                      )}
                    </>
                  )}
                </div>
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="px-4 pb-3 space-y-1.5">
                  {items.map(item => {
                    const itemMedia = item.media || [];
                    const isUploading = uploading.has(item.id);

                    return (
                      <div key={item.id} className="group">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">
                            {item.item}
                          </span>

                          {/* Status buttons */}
                          <div className="flex gap-1 shrink-0">
                            {(['pass', 'fail', 'attention', 'not_checked'] as InspectionStatus[]).map(status => {
                              const cfg = STATUS_CONFIG[status];
                              const isActive = item.status === status;
                              const isSaving = saving.has(item.id);

                              return (
                                <button
                                  key={status}
                                  onClick={() => updateItem(item.id, status)}
                                  disabled={isSaving}
                                  className={`
                                    w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold transition-all border
                                    ${isActive
                                      ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                                      : 'bg-transparent border-transparent text-slate-700 hover:text-slate-500 hover:border-slate-700'
                                    }
                                  `}
                                  title={cfg.label}
                                >
                                  {status === 'not_checked' ? (
                                    <span className="text-[9px]">--</span>
                                  ) : (
                                    <Icon d={cfg.icon} size={14} />
                                  )}
                                </button>
                              );
                            })}

                            {/* Camera / upload button */}
                            <button
                              onClick={() => fileInputRefs.current[item.id]?.click()}
                              disabled={isUploading}
                              className={`
                                w-7 h-7 rounded-md flex items-center justify-center transition-all border
                                ${itemMedia.length > 0
                                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                                  : 'bg-transparent border-transparent text-slate-700 hover:text-slate-500 hover:border-slate-700'
                                }
                              `}
                              title="Add photo/video"
                            >
                              {isUploading ? (
                                <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Icon d={icons.camera} size={13} />
                              )}
                            </button>
                            <input
                              ref={el => { fileInputRefs.current[item.id] = el; }}
                              type="file"
                              accept="image/*,video/*"
                              capture="environment"
                              multiple
                              className="hidden"
                              onChange={e => handleFileSelect(item.id, e)}
                            />

                            {/* Notes toggle */}
                            <button
                              onClick={() => {
                                if (editingNotes === item.id) {
                                  setEditingNotes(null);
                                } else {
                                  setEditingNotes(item.id);
                                  setNoteText(item.notes || '');
                                }
                              }}
                              className={`
                                w-7 h-7 rounded-md flex items-center justify-center transition-all border
                                ${item.notes
                                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                                  : 'bg-transparent border-transparent text-slate-700 hover:text-slate-500 hover:border-slate-700'
                                }
                              `}
                              title="Notes"
                            >
                              <Icon d={icons.edit} size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Media thumbnails */}
                        {itemMedia.length > 0 && (
                          <div className="mt-1.5 flex gap-1.5 flex-wrap">
                            {itemMedia.map(media => (
                              <div
                                key={media.id}
                                className="relative group/thumb w-14 h-14 rounded-lg overflow-hidden border border-bdr bg-card cursor-pointer"
                                onClick={() => media.media_type === 'video' ? setLightbox(media) : setAnnotating(media)}
                              >
                                {media.media_type === 'video' ? (
                                  <div className="w-full h-full flex items-center justify-center bg-slate-800">
                                    <Icon d={icons.play} size={16} stroke="#94a3b8" />
                                  </div>
                                ) : (
                                  <img
                                    src={media.annotated_url || media.url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                )}
                                {/* Annotated badge */}
                                {media.annotated_url && (
                                  <div className="absolute bottom-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-red-500/80 flex items-center justify-center">
                                    <Icon d={icons.edit} size={7} stroke="#fff" />
                                  </div>
                                )}
                                {/* Delete button */}
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    deleteMedia(media.id, item.id);
                                  }}
                                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500/80 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                  title="Remove"
                                >
                                  <Icon d={icons.x} size={8} stroke="#fff" />
                                </button>
                              </div>
                            ))}
                            {isUploading && (
                              <div className="w-14 h-14 rounded-lg border border-dashed border-orange-500/40 flex items-center justify-center bg-orange-500/5">
                                <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Notes inline */}
                        {item.notes && editingNotes !== item.id && (
                          <div className="ml-0 mt-1 text-[11px] text-slate-500 italic pl-0">
                            {item.notes}
                          </div>
                        )}

                        {/* Notes editor */}
                        {editingNotes === item.id && (
                          <div className="mt-1.5 flex gap-2">
                            <input
                              type="text"
                              value={noteText}
                              onChange={e => setNoteText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveNotes(item.id); }}
                              className="flex-1 bg-card border border-bdr rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-accent/50"
                              placeholder="Add a note..."
                              autoFocus
                            />
                            <Btn small onClick={() => saveNotes(item.id)}>Save</Btn>
                            <Btn small variant="secondary" onClick={() => setEditingNotes(null)}>Cancel</Btn>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox overlay (videos only — images open annotator) */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-3xl max-h-[85vh] w-full"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-10 right-0 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
            >
              <Icon d={icons.x} size={16} />
            </button>
            <video
              src={lightbox.url}
              controls
              autoPlay
              className="w-full max-h-[85vh] rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Photo annotator */}
      {annotating && (
        <PhotoAnnotator
          imageUrl={annotating.url}
          onSave={blob => saveAnnotation(annotating, blob)}
          onClose={() => setAnnotating(null)}
        />
      )}
    </div>
  );
}

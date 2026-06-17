"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import {
  Upload,
  FileSpreadsheet,
  Calendar,
  ChevronDown,
  ChevronRight,
  Lock,
  ArrowRight,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronLeft,
} from "lucide-react"
import {
  getUploadHistory,
  reassignFileDate,
  reassignUploadDate,
  deleteUploadData,
} from "@/app/admin/sync/history-actions"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UploadFile {
  id: string
  filename: string
  file_type: string
  file_size: number
  target_date: string
  original_date?: string | null
  has_internal_date: boolean
  status: "active" | "reassigned" | "deleted" | "error"
}

interface UploadRecord {
  id: string
  uploaded_at: string
  target_date: string
  status: "processing" | "success" | "reassigned" | "deleted" | "error"
  files: UploadFile[]
}

interface UploadHistoryProps {
  refreshTrigger?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FILE_TYPE_COLORS: Record<string, string> = {
  nb: "bg-violet-100 text-violet-700",
  quotes: "bg-amber-100 text-amber-700",
  premium: "bg-emerald-100 text-emerald-700",
  rc: "bg-sky-100 text-sky-700",
  hs: "bg-purple-100 text-purple-700",
  rico_ch: "bg-sky-100 text-sky-700",
  rico_ap: "bg-sky-100 text-sky-700",
}

const FILE_TYPE_LABELS: Record<string, string> = {
  nb: "NB",
  quotes: "Quotes",
  premium: "Premium",
  rc: "RC",
  hs: "HS",
  rico_ch: "RICO CH",
  rico_ap: "RICO AP",
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) +
    " · " +
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function uniqueFileTypes(files: UploadFile[]): string[] {
  return [...new Set(files.map((f) => f.file_type))]
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "processing":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" /> Processing
        </span>
      )
    case "success":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          ✅ Success
        </span>
      )
    case "reassigned":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          ⚠️ Reassigned
        </span>
      )
    case "deleted":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
          🗑 Deleted
        </span>
      )
    case "error":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
          ❌ Error
        </span>
      )
    default:
      return null
  }
}

function FileTypePill({ type }: { type: string }) {
  const colorClass = FILE_TYPE_COLORS[type] ?? "bg-slate-100 text-slate-700"
  const label = FILE_TYPE_LABELS[type] ?? type.toUpperCase()
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${colorClass}`}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function UploadHistory({ refreshTrigger }: UploadHistoryProps) {
  const [uploads, setUploads] = useState<UploadRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reassigning, setReassigning] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [datePickerTarget, setDatePickerTarget] = useState<{
    type: "file" | "upload"
    id: string
  } | null>(null)
  const [newDateValue, setNewDateValue] = useState("")

  // ---- Data fetching ----

  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true)
      try {
        const result = await getUploadHistory(p, pageSize)
        if (result.success && result.data) {
          setUploads(result.data.uploads ?? [])
          setTotalCount(result.data.totalCount ?? 0)
        }
      } catch (err) {
        console.error("Failed to fetch upload history:", err)
      } finally {
        setLoading(false)
      }
    },
    [pageSize],
  )

  useEffect(() => {
    setPage(1)
    fetchPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger])

  useEffect(() => {
    fetchPage(page)
  }, [page, fetchPage])

  // ---- Handlers ----

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
    // Reset any inline UI when collapsing
    setDatePickerTarget(null)
    setNewDateValue("")
    setShowDeleteConfirm(null)
  }

  const handleReassignFile = async (fileId: string) => {
    if (!newDateValue) return
    setReassigning(fileId)
    try {
      await reassignFileDate(fileId, newDateValue)
      setDatePickerTarget(null)
      setNewDateValue("")
      await fetchPage(page)
    } catch (err) {
      console.error("Reassign file failed:", err)
    } finally {
      setReassigning(null)
    }
  }

  const handleReassignUpload = async (uploadId: string) => {
    if (!newDateValue) return
    setReassigning(uploadId)
    try {
      await reassignUploadDate(uploadId, newDateValue)
      setDatePickerTarget(null)
      setNewDateValue("")
      await fetchPage(page)
    } catch (err) {
      console.error("Reassign upload failed:", err)
    } finally {
      setReassigning(null)
    }
  }

  const handleDelete = async (upload: UploadRecord) => {
    setDeleting(upload.id)
    try {
      await deleteUploadData(upload.id)
      setShowDeleteConfirm(null)
      await fetchPage(page)
    } catch (err) {
      console.error("Delete failed:", err)
    } finally {
      setDeleting(null)
    }
  }

  const cancelInlineAction = () => {
    setDatePickerTarget(null)
    setNewDateValue("")
    setShowDeleteConfirm(null)
  }

  // ---- Derived ----

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const rangeStart = (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalCount)

  // ---- Render ----

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Upload className="h-5 w-5 text-slate-400" />
            Upload History
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Track and manage past data uploads
          </p>
        </div>
      </div>

      <CardContent>
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <span className="ml-2 text-sm text-slate-500">Loading uploads…</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && uploads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Upload className="h-10 w-10 mb-3 stroke-[1.5]" />
            <p className="text-sm font-medium text-slate-500">No uploads recorded yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Uploads will appear here once data files are processed.
            </p>
          </div>
        )}

        {/* Upload rows */}
        {!loading && uploads.length > 0 && (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
            {uploads.map((upload) => {
              const isExpanded = expandedId === upload.id
              const fileTypes = uniqueFileTypes(upload.files)
              const eligibleFiles = upload.files.filter(
                (f) => !f.has_internal_date && f.status === "active",
              )
              const isDeleteTarget = showDeleteConfirm === upload.id
              const isBatchReassign =
                datePickerTarget?.type === "upload" &&
                datePickerTarget.id === upload.id

              return (
                <div key={upload.id}>
                  {/* Row header (always visible) */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(upload.id)}
                    className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    {/* Left side */}
                    <div className="flex items-center gap-3 min-w-0">
                      <Upload className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
                        {formatDateTime(upload.uploaded_at)}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {fileTypes.map((ft) => (
                          <FileTypePill key={ft} type={ft} />
                        ))}
                      </div>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(upload.target_date)}
                      </span>
                      <Badge variant="outline">
                        {upload.files.length} file{upload.files.length !== 1 && "s"}
                      </Badge>
                      <StatusBadge status={upload.status} />
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="bg-slate-50/60 border-t border-slate-100">
                      {/* File list */}
                      <div className="divide-y divide-slate-100">
                        {upload.files.map((file) => {
                          const isFileReassign =
                            datePickerTarget?.type === "file" &&
                            datePickerTarget.id === file.id
                          const isFileReassigning = reassigning === file.id

                          return (
                            <div
                              key={file.id}
                              className={`flex items-center justify-between gap-4 px-6 py-2.5 ${
                                file.status === "deleted"
                                  ? "opacity-50"
                                  : ""
                              }`}
                            >
                              {/* File info */}
                              <div className="flex items-center gap-3 min-w-0">
                                <FileSpreadsheet className="h-4 w-4 text-slate-400 shrink-0" />
                                <span
                                  className={`text-sm text-slate-700 truncate ${
                                    file.status === "deleted" ? "line-through" : ""
                                  }`}
                                >
                                  {file.filename}
                                </span>
                                <FileTypePill type={file.file_type} />
                                <span className="text-xs text-slate-400">
                                  {formatFileSize(file.file_size)}
                                </span>
                              </div>

                              {/* File actions / status */}
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Has internal date — locked */}
                                {file.has_internal_date && (
                                  <span className="flex items-center gap-1 text-xs text-slate-400">
                                    <Lock className="h-3.5 w-3.5" />
                                    Date from file
                                  </span>
                                )}

                                {/* Active, no internal date — can reassign */}
                                {!file.has_internal_date &&
                                  file.status === "active" &&
                                  !isFileReassign && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-slate-500">
                                        {formatDate(file.target_date)}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setDatePickerTarget({
                                            type: "file",
                                            id: file.id,
                                          })
                                          setNewDateValue(file.target_date)
                                        }}
                                      >
                                        Change Date
                                      </Button>
                                    </div>
                                  )}

                                {/* Inline date picker for file */}
                                {isFileReassign && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="date"
                                      value={newDateValue}
                                      onChange={(e) =>
                                        setNewDateValue(e.target.value)
                                      }
                                      className="h-7 rounded-md border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <Button
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      disabled={
                                        !newDateValue || isFileReassigning
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleReassignFile(file.id)
                                      }}
                                    >
                                      {isFileReassigning ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        "Confirm"
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        cancelInlineAction()
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                )}

                                {/* Reassigned status */}
                                {file.status === "reassigned" &&
                                  file.original_date && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                                      Originally: {formatDate(file.original_date)}
                                      <ArrowRight className="h-3 w-3" />
                                      {formatDate(file.target_date)}
                                    </span>
                                  )}

                                {/* Deleted status */}
                                {file.status === "deleted" && (
                                  <span className="text-xs text-slate-400 italic">
                                    Deleted
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Batch actions bar */}
                      <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-slate-200 bg-white/60">
                        {/* Reassign eligible */}
                        <div className="flex items-center gap-2">
                          {!isBatchReassign ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1.5"
                              disabled={eligibleFiles.length === 0}
                              onClick={() => {
                                setDatePickerTarget({
                                  type: "upload",
                                  id: upload.id,
                                })
                                setNewDateValue(upload.target_date)
                              }}
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              Reassign Eligible Files
                              {eligibleFiles.length > 0 && (
                                <span className="ml-1 text-slate-400">
                                  ({eligibleFiles.length})
                                </span>
                              )}
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={newDateValue}
                                onChange={(e) =>
                                  setNewDateValue(e.target.value)
                                }
                                className="h-8 rounded-md border border-slate-200 px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                              />
                              <Button
                                size="sm"
                                className="text-xs gap-1"
                                disabled={
                                  !newDateValue ||
                                  reassigning === upload.id
                                }
                                onClick={() =>
                                  handleReassignUpload(upload.id)
                                }
                              >
                                {reassigning === upload.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Confirm"
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                onClick={cancelInlineAction}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Delete */}
                        <div className="flex items-center gap-2">
                          {!isDeleteTarget ? (
                            <Button
                              variant="danger"
                              size="sm"
                              className="text-xs gap-1.5"
                              onClick={() =>
                                setShowDeleteConfirm(upload.id)
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete Upload Data
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1.5 text-xs text-rose-600">
                                <AlertCircle className="h-3.5 w-3.5" />
                                This will remove{" "}
                                <strong>
                                  {uniqueFileTypes(upload.files)
                                    .map(
                                      (t) =>
                                        FILE_TYPE_LABELS[t] ??
                                        t.toUpperCase(),
                                    )
                                    .join(", ")}
                                </strong>{" "}
                                data for{" "}
                                <strong>
                                  {formatDate(upload.target_date)}
                                </strong>
                                . Are you sure?
                              </span>
                              <Button
                                variant="danger"
                                size="sm"
                                className="text-xs gap-1"
                                disabled={deleting === upload.id}
                                onClick={() => handleDelete(upload)}
                              >
                                {deleting === upload.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Confirm"
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                onClick={cancelInlineAction}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalCount > 0 && (
          <div className="flex items-center justify-between pt-4 mt-2">
            <span className="text-sm text-slate-500">
              Showing {rangeStart}–{rangeEnd} of {totalCount} upload
              {totalCount !== 1 && "s"}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
                className="gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

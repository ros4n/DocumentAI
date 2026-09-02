import { motion } from 'framer-motion'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Switch } from '../ui/switch'
import { StatusPill, DialogActions } from './_shared'
import { Warning } from '../icons'
import { suggestOptions } from '../../lib/formFill'
import type { FillDecision, FormAnalysis } from '../../lib/formFill'
import { loadProfile } from '../../lib/profile'
import { staggerChild, staggerParent } from '../../lib/motion'

type Edit = FillDecision & { include: boolean }

interface ReviewFillsDialogProps {
  analysis: FormAnalysis
  edits: Edit[]
  onUpdateEdit: (fieldId: string, patch: Partial<Edit>) => void
  onSelectGroupOption: (group: string, fieldId: string | null) => void
  onToggleGroup: (group: string, include: boolean) => void
  onCancel: () => void
  onApply: () => void
}

const fieldInput =
  'h-10 w-full rounded-lg border border-border bg-surface-raised px-3 text-sm text-text outline-none transition-colors focus:border-accent disabled:opacity-50'

export default function ReviewFillsDialog({
  analysis,
  edits,
  onUpdateEdit,
  onSelectGroupOption,
  onToggleGroup,
  onCancel,
  onApply,
}: ReviewFillsDialogProps) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="wm-dialog">
        <DialogHeader className="text-left">
          <DialogTitle>Review fills</DialogTitle>
          <p className="text-xs text-text-muted">
            {analysis.fields.length} field{analysis.fields.length === 1 ? '' : 's'} found
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {analysis.structureEngine === 'llm' ? (
              <StatusPill tone="ai">Fields: AI vision</StatusPill>
            ) : analysis.structureEngine === 'server' ? (
              <StatusPill tone="ok">Fields: OCR server</StatusPill>
            ) : (
              <StatusPill>Fields: on-device</StatusPill>
            )}
            {analysis.matchSource === 'llm' ? (
              <StatusPill tone="ai">Values: AI matching</StatusPill>
            ) : (
              <StatusPill tone="warn">Values: keyword matching</StatusPill>
            )}
          </div>
        </DialogHeader>

        <motion.div
          className="flex max-h-[52vh] flex-col gap-2 overflow-auto pr-1"
          variants={staggerParent}
          initial="initial"
          animate="animate"
        >
          {edits.map((d) => {
            const field = analysis.fields.find((f) => f.id === d.fieldId)
            if (!field) return null
            const lowConfidence = d.confidence === 0

            if (field.kind === 'checkbox' && field.group) {
              const groupFields = edits.filter((x) => {
                const f = analysis.fields.find((y) => y.id === x.fieldId)
                return f?.kind === 'checkbox' && f.group === field.group
              })
              if (groupFields[0]?.fieldId !== d.fieldId) return null
              const anyChecked = groupFields.some((x) => x.include && x.checked)
              const groupIncluded = groupFields.some((x) => x.include)
              return (
                <motion.div
                  key={field.group}
                  variants={staggerChild}
                  className="rounded-xl border border-border bg-surface-raised p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-display text-sm font-semibold">{field.group}</p>
                    <Switch
                      size="sm"
                      checked={groupIncluded}
                      onCheckedChange={(c) => onToggleGroup(field.group!, c)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {groupFields.map((gd) => {
                      const gf = analysis.fields.find((y) => y.id === gd.fieldId)
                      const selected = gd.include && gd.checked
                      return (
                        <button
                          key={gd.fieldId}
                          type="button"
                          onClick={() => onSelectGroupOption(field.group!, gd.fieldId)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            selected
                              ? 'border-accent bg-accent text-text-on-accent'
                              : !gd.include
                                ? 'border-border bg-transparent text-text-faint'
                                : 'border-border bg-surface-sunken text-text-muted hover:text-text'
                          }`}
                        >
                          {gf?.label || 'Option'}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => onSelectGroupOption(field.group!, null)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        !anyChecked && groupIncluded
                          ? 'border-accent bg-accent text-text-on-accent'
                          : 'border-border bg-surface-sunken text-text-muted hover:text-text'
                      }`}
                    >
                      None
                    </button>
                  </div>
                </motion.div>
              )
            }

            const suggestions =
              field.kind === 'text'
                ? suggestOptions(field, loadProfile(), field.options)
                : []
            const known = suggestions.includes(d.value)

            return (
              <motion.div
                key={d.fieldId}
                variants={staggerChild}
                className={`rounded-xl border p-3 ${
                  d.include ? 'border-border bg-surface-raised' : 'border-border bg-surface-sunken opacity-60'
                } ${lowConfidence && d.include ? 'ring-1 ring-warning/40' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-text">
                      {field.label || 'Unlabeled field'}
                      {lowConfidence && d.include && !d.value && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-warning">
                          <Warning size={10} weight="fill" />
                          review
                        </span>
                      )}
                      {lowConfidence && !d.value && (
                        <span className="text-xs font-normal text-text-faint">
                          {field.kind === 'checkbox' ? 'tick manually' : 'type manually'}
                        </span>
                      )}
                    </p>

                    <div className="mt-2">
                      {field.kind === 'signature' ? (
                        <p className="text-xs text-text-muted">
                          Signature. Never auto-filled, sign by hand after printing.
                        </p>
                      ) : field.kind === 'checkbox' ? (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--accent)]"
                            checked={d.include && d.checked}
                            disabled={!d.include}
                            onChange={(e) => onUpdateEdit(d.fieldId, { checked: e.target.checked })}
                          />
                          <span className="text-text-muted">
                            {d.include ? (d.checked ? 'Checked' : 'Unchecked') : 'Skipped'}
                          </span>
                        </label>
                      ) : field.kind === 'date' ? (
                        <input
                          className={fieldInput}
                          // A blank or ISO value uses the native date picker;
                          // a value already formatted for the form (e.g.
                          // "12/04/1991") stays an editable text field.
                          type={!d.value || /^\d{4}-\d{2}-\d{2}$/.test(d.value) ? 'date' : 'text'}
                          value={d.value}
                          disabled={!d.include}
                          onChange={(e) => onUpdateEdit(d.fieldId, { value: e.target.value })}
                        />
                      ) : suggestions.length === 0 ? (
                        <input
                          className={fieldInput}
                          type="text"
                          value={d.value}
                          disabled={!d.include}
                          placeholder="Type a value to fill"
                          onChange={(e) => onUpdateEdit(d.fieldId, { value: e.target.value })}
                        />
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <select
                            className={fieldInput}
                            disabled={!d.include}
                            value={known ? d.value : '__custom__'}
                            onChange={(e) => {
                              const v = e.target.value
                              if (v !== '__custom__') onUpdateEdit(d.fieldId, { value: v })
                            }}
                          >
                            <option value="__custom__">Choose or type your own…</option>
                            {suggestions.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                          <input
                            className={fieldInput}
                            type="text"
                            value={d.value}
                            disabled={!d.include}
                            placeholder={known ? 'Custom value…' : 'Type a value to fill'}
                            onChange={(e) => onUpdateEdit(d.fieldId, { value: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <Switch
                    size="sm"
                    checked={d.include}
                    onCheckedChange={(c) => onUpdateEdit(d.fieldId, { include: c })}
                  />
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        <DialogActions>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={onApply}>Apply and render</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  )
}

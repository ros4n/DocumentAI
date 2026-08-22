import { motion } from 'framer-motion'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Switch } from '../ui/switch'
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
          <p className="engine-badge">
            {analysis.fields.length} field{analysis.fields.length === 1 ? '' : 's'} found
          </p>
          <div className="badge-row">
            {analysis.structureEngine === 'llm' ? (
              <span className="status-badge llm">Fields: AI vision</span>
            ) : analysis.structureEngine === 'server' ? (
              <span className="status-badge ok">Fields: OCR server</span>
            ) : (
              <span className="status-badge">Fields: on-device OCR</span>
            )}
            {analysis.matchSource === 'llm' ? (
              <span className="status-badge llm">Values: AI matching</span>
            ) : (
              <span className="status-badge warn">Values: keyword matching</span>
            )}
          </div>
        </DialogHeader>

        <motion.div
          className="review-list"
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
                  className="review-group-block"
                >
                  <div className="review-group-head">
                    <p className="review-group">{field.group}</p>
                    <Switch
                      size="sm"
                      checked={groupIncluded}
                      onCheckedChange={(c) => onToggleGroup(field.group!, c)}
                    />
                  </div>
                  <div className="option-pills">
                    {groupFields.map((gd) => {
                      const gf = analysis.fields.find((y) => y.id === gd.fieldId)
                      return (
                        <button
                          key={gd.fieldId}
                          type="button"
                          className={`option-pill ${gd.include && gd.checked ? 'selected' : ''} ${!gd.include ? 'muted' : ''}`}
                          onClick={() => onSelectGroupOption(field.group!, gd.fieldId)}
                        >
                          {gf?.label || 'Option'}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      className={`option-pill none ${!anyChecked && groupIncluded ? 'selected' : ''}`}
                      onClick={() => onSelectGroupOption(field.group!, null)}
                    >
                      None
                    </button>
                  </div>
                </motion.div>
              )
            }

            return (
              <motion.div
                key={d.fieldId}
                variants={staggerChild}
                className={`review-row ${d.include ? '' : 'disabled'} ${lowConfidence && d.include ? 'low-confidence' : ''}`}
              >
                <div className="review-main">
                  <p className="review-label">
                    {field.label || 'Unlabeled field'}
                    {lowConfidence && d.include && !d.value && (
                      <span className="low-confidence-chip">
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 9v4M12 17h.01" />
                          <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
                        </svg>
                        review
                      </span>
                    )}
                    {lowConfidence && !d.value && (
                      <span className="review-nomatch">
                        {field.kind === 'checkbox'
                          ? 'not matched — tick manually'
                          : 'no match — type manually'}
                      </span>
                    )}
                  </p>
                  {field.kind === 'signature' ? (
                    <p className="review-signature-note">
                      Signature — never auto-filled. Sign by hand after printing.
                    </p>
                  ) : field.kind === 'checkbox' ? (
                    <label className="review-checkbox">
                      <input
                        type="checkbox"
                        checked={d.include && d.checked}
                        disabled={!d.include}
                        onChange={(e) => onUpdateEdit(d.fieldId, { checked: e.target.checked })}
                      />
                      <span>{d.include ? (d.checked ? 'Checked' : 'Unchecked') : 'Skipped'}</span>
                    </label>
                  ) : field.kind === 'date' ? (
                    <input
                      className="review-input"
                      type="date"
                      value={d.value}
                      disabled={!d.include}
                      onChange={(e) => onUpdateEdit(d.fieldId, { value: e.target.value })}
                    />
                  ) : (
                    (() => {
                      const suggestions = suggestOptions(field, loadProfile(), field.options)
                      if (suggestions.length === 0) {
                        return (
                          <input
                            className="review-input"
                            type="text"
                            value={d.value}
                            disabled={!d.include}
                            placeholder="Type a value to fill"
                            onChange={(e) => onUpdateEdit(d.fieldId, { value: e.target.value })}
                          />
                        )
                      }
                      const known = suggestions.includes(d.value)
                      return (
                        <div className="review-suggest">
                          <select
                            className="review-select"
                            disabled={!d.include}
                            value={known ? d.value : '__custom__'}
                            onChange={(e) => {
                              const v = e.target.value
                              if (v !== '__custom__') {
                                onUpdateEdit(d.fieldId, { value: v })
                              }
                            }}
                          >
                            <option value="__custom__">Choose or type your own…</option>
                            {suggestions.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                          <input
                            className="review-input"
                            type="text"
                            value={d.value}
                            disabled={!d.include}
                            placeholder={known ? 'Custom value…' : 'Type a value to fill'}
                            onChange={(e) => onUpdateEdit(d.fieldId, { value: e.target.value })}
                          />
                        </div>
                      )
                    })()
                  )}
                </div>
                <Switch
                  size="sm"
                  checked={d.include}
                  onCheckedChange={(c) => onUpdateEdit(d.fieldId, { include: c })}
                />
              </motion.div>
            )
          })}
        </motion.div>

        <div className="wm-dialog-actions">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={onApply}>Apply &amp; render</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

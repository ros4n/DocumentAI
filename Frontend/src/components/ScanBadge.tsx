import { Badge } from './ui/badge'
import type { ScanRecord } from '../lib/api'

export default function ScanBadge({ scan }: { scan: ScanRecord }) {
  return scan.filled_at ? (
    <Badge className="scan-badge">Filled</Badge>
  ) : (
    <Badge variant="secondary" className="scan-badge">OCR</Badge>
  )
}
